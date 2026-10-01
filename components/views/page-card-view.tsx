import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { useNotehook } from '@/lib/context';
import { EntityVersion } from '@/lib/types';
import { Tag, CheckSquare, Square, Zap, ArrowLeft, FileText, MessageSquare, Star, Bookmark, Trash2, Search, ChevronUp, ChevronDown, X, Check, Pin } from 'lucide-react';
import { convertNotehookTextToHtml, findPageForPill, isCursorInsideReference, getCaretOffsetFromPoint, normalizeRawContentToCanonicalBrackets, scrollToMentionOrElement, selectMarkdownBlock, clearMarkdownBlockSelection, syncMultiBlockSelection, handleGutterRangeClick, handleGutterMouseDown, clearAllGutterSelections, htmlToMarkdown, parseNotehookMarkup } from '@/lib/notehook-parser';
import { getPastelColorForTitle } from '@/lib/color';
import { getMentionSnippetsForPage, MentionHighlightedText, matchesExplicitReference } from '@/lib/mentions';
import { getRankedSuggestions, SuggestionItem } from '@/lib/ranking';
import { SuggestionList } from '../ai/suggestion-list';
import { focusAndSelectTitle } from '@/lib/title-utils';

interface GutterCheckboxProps {
  blockId: string;
}

const GutterCheckbox: React.FC<GutterCheckboxProps> = ({ blockId }) => {
  const [checked, setChecked] = useState(false);

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setChecked((prev) => !prev);
      }}
      className={`p-0.5 rounded transition-all duration-150 cursor-pointer select-none ${checked
        ? 'opacity-100 text-indigo-600'
        : 'opacity-25 hover:opacity-100 text-zinc-400 hover:text-zinc-700'
        }`}
      title={checked ? 'Deselect block' : 'Select block'}
    >
      {checked ? (
        <CheckSquare className="w-3.5 h-3.5 fill-indigo-50 text-indigo-600" />
      ) : (
        <Square className="w-3.5 h-3.5 text-zinc-400 hover:text-zinc-600" />
      )}
    </button>
  );
};

interface PageCardViewProps {
  pageId: string;
  paneIndex?: 1 | 2;
}

function getRelativeAgeTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function processLivingPillBuffer(
  buffer: string[],
  regex: RegExp,
  startIndex: number,
  currentMatchCounter: number,
  activeMatchIndex: number
): { html: string; matchCount: number } {
  // Extract text nodes inside pill-full (or pill-short if pill-full is empty) to accurately count occurrences
  let fullTextNode = '';
  let shortTextNode = '';
  let subSpan = '';

  for (let i = 1; i < buffer.length; i++) {
    const part = buffer[i];
    if (part.includes('pill-short')) subSpan = 'short';
    else if (part.includes('pill-full')) subSpan = 'full';
    else if (!part.startsWith('<')) {
      if (subSpan === 'full') fullTextNode += part;
      else if (subSpan === 'short') shortTextNode += part;
      else fullTextNode += part;
    }
  }

  const textToCount = fullTextNode || shortTextNode;
  regex.lastIndex = 0;
  const matches = Array.from(textToCount.matchAll(regex));
  const pillMatchCount = matches.length;

  if (pillMatchCount === 0) {
    return { html: buffer.join(''), matchCount: 0 };
  }

  const pillStartGlobalIdx = startIndex + currentMatchCounter;
  const pillEndGlobalIdx = pillStartGlobalIdx + pillMatchCount - 1;
  const isPillActive = activeMatchIndex >= pillStartGlobalIdx && activeMatchIndex <= pillEndGlobalIdx;

  let pillStartTag = buffer[0];
  if (isPillActive) {
    // Untruncate living reference pill on focus by adding .is-hover-locked class
    if (pillStartTag.includes('class="')) {
      pillStartTag = pillStartTag.replace(/class="([^"]*)"/, 'class="$1 is-hover-locked"');
    } else {
      pillStartTag = pillStartTag.replace('<span ', '<span class="is-hover-locked" ');
    }
  }

  const activeMarkClass = 'search-match active-search-match bg-amber-400 text-zinc-950 font-bold ring-2 ring-amber-500 rounded-xs p-0 m-0';
  const normalMarkClass = 'search-match bg-amber-200 text-zinc-950 rounded-xs p-0 m-0 font-medium';

  let currentSubSpan = '';
  const processedBuffer: string[] = [pillStartTag];

  for (let i = 1; i < buffer.length; i++) {
    const part = buffer[i];
    if (part.startsWith('<')) {
      if (part.includes('pill-short')) currentSubSpan = 'short';
      else if (part.includes('pill-full')) currentSubSpan = 'full';
      processedBuffer.push(part);
    } else {
      // Text node inside pill
      if (currentSubSpan === 'short') {
        const textWithMark = part.replace(regex, (m) => `<mark class="${normalMarkClass}">${m}</mark>`);
        processedBuffer.push(textWithMark);
      } else {
        let localMatchCounter = 0;
        const textWithMark = part.replace(regex, (m) => {
          const globalIdx = pillStartGlobalIdx + localMatchCounter;
          localMatchCounter++;
          const isActive = globalIdx === activeMatchIndex;
          const cls = isActive ? activeMarkClass : normalMarkClass;
          return `<mark data-search-index="${globalIdx}" class="${cls}">${m}</mark>`;
        });
        processedBuffer.push(textWithMark);
      }
    }
  }

  return { html: processedBuffer.join(''), matchCount: pillMatchCount };
}

function highlightSearchInHtml(
  html: string,
  searchQuery: string,
  startIndex: number,
  activeMatchIndex: number
): { html: string; count: number } {
  const query = searchQuery.trim();
  if (!query || !html) return { html, count: 0 };

  let matchCounter = 0;
  const escaped = query.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(escaped, 'gi');

  const parts = html.split(/(<[^>]+>)/g);
  const resultParts: string[] = [];

  let pillBuffer: string[] = [];
  let pillDepth = 0;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (part.startsWith('<') && part.endsWith('>')) {
      const isLivingPillStart = part.includes('page-mention-pill');

      if (pillDepth === 0) {
        if (isLivingPillStart) {
          pillDepth = 1;
          pillBuffer = [part];
          continue;
        }
        resultParts.push(part);
      } else if (pillDepth > 0) {
        // Inside living pill buffer
        if (part.startsWith('<') && !part.startsWith('</') && !part.endsWith('/>')) {
          pillDepth++;
        } else if (part.startsWith('</')) {
          pillDepth--;
        }
        pillBuffer.push(part);

        if (pillDepth === 0) {
          // Living pill buffer complete!
          const processedPill = processLivingPillBuffer(
            pillBuffer,
            regex,
            startIndex,
            matchCounter,
            activeMatchIndex
          );
          resultParts.push(processedPill.html);
          matchCounter += processedPill.matchCount;
          pillBuffer = [];
        }
      }
    } else {
      // Text node
      if (pillDepth > 0) {
        pillBuffer.push(part);
      } else {
        // Normal text node (including text inside dead/non-referencing tags)
        const processed = part.replace(regex, (matchedText) => {
          const globalIdx = startIndex + matchCounter;
          matchCounter++;
          const isActive = globalIdx === activeMatchIndex;
          const markClass = isActive
            ? 'search-match active-search-match bg-amber-400 text-zinc-950 font-bold ring-2 ring-amber-500 rounded-xs p-0 m-0'
            : 'search-match bg-amber-200 text-zinc-950 rounded-xs p-0 m-0 font-medium';
          return `<mark data-search-index="${globalIdx}" class="${markClass}">${matchedText}</mark>`;
        });
        resultParts.push(processed);
      }
    }
  }

  if (pillBuffer.length > 0) {
    resultParts.push(pillBuffer.join(''));
  }

  return { html: resultParts.join(''), count: matchCounter };
}

export const PageCardView: React.FC<PageCardViewProps> = ({ pageId, paneIndex = 2 }) => {
  const {
    pages,
    mentions,
    leftPane,
    rightPane,
    openInPane1,
    openInPane2,
    rightPaneCanGoBack,
    leftPaneCanGoBack,
    goBackPane1,
    goBackPane2,
    toggleTodoDone,
    toggleTodoStarred,
    updatePageTitle,
    updatePageContent,
    updatePageUserPrompt,
    closePane1,
    closePane2,
    deletePage,
    addEntityVersion,
    updateEntityVersion,
    setCanonicalVersion,
    deleteEntityVersion,
    createEntityPage,
    createNotePage,
    createTodoPage,
    createDecisionPage,
    pinnedPageIds,
    togglePinPage,
    navigateToMessage,
    scrollToMessageInChat,
  } = useNotehook();

  const targetPage = pages.find((p) => p.id === pageId || p.title.toLowerCase() === pageId.toLowerCase());

  const [isEditing, setIsEditing] = useState(false);
  const [bodyText, setBodyText] = useState('');
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [isEditingVersionBody, setIsEditingVersionBody] = useState(false);

  const contentRef = useRef<HTMLTextAreaElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const versionContentRef = useRef<HTMLTextAreaElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const [contentCursorPos, setContentCursorPos] = useState(0);
  const [contentSelectedIndex, setContentSelectedIndex] = useState(0);
  const [isContentDismissed, setIsContentDismissed] = useState(false);

  const [promptCursorPos, setPromptCursorPos] = useState(0);
  const [promptSelectedIndex, setPromptSelectedIndex] = useState(0);
  const [isPromptDismissed, setIsPromptDismissed] = useState(false);

  const [versionCursorPos, setVersionCursorPos] = useState(0);
  const [versionSelectedIndex, setVersionSelectedIndex] = useState(0);
  const [isVersionDismissed, setIsVersionDismissed] = useState(false);

  const [selectedVersionId, setSelectedVersionId] = useState<string>('');
  const [copiedShortId, setCopiedShortId] = useState<string | null>(null);
  const [isMentionsCollapsed, setIsMentionsCollapsed] = useState<boolean>(false);

  const handleCopyShortId = (shortId: string) => {
    const textToCopy = `[@${shortId}]`;
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
    }
    setCopiedShortId(shortId);
    setTimeout(() => setCopiedShortId(null), 1800);
  };

  // Floating In-Page Search Bar (Ctrl+F)
  const [isPageSearchOpen, setIsPageSearchOpen] = useState(false);
  const [pageSearchQuery, setPageSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const pageSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setIsPageSearchOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isPageSearchOpen) {
      setTimeout(() => pageSearchInputRef.current?.focus(), 50);
    }
  }, [isPageSearchOpen]);

  const currentPaneState = paneIndex === 1 ? leftPane : rightPane;
  // Match left-gutter width with the chat view when in split-pane mode
  const isDualPane = rightPane.type !== 'empty';
  const lastScrolledSpanRef = useRef<string | null>(null);
  useEffect(() => {
    if (targetPage && currentPaneState?.highlightSpan && currentPaneState.id === targetPage.id) {
      const scrollKey = `${targetPage.id}:${currentPaneState.highlightSpan}`;
      if (lastScrolledSpanRef.current === scrollKey) return;
      lastScrolledSpanRef.current = scrollKey;

      const container = pageViewContainerRef.current;
      if (container) {
        const timer = setTimeout(() => {
          scrollToMentionOrElement(container, currentPaneState.highlightSpan);
        }, 80);
        return () => clearTimeout(timer);
      }
    }
  }, [targetPage?.id, currentPaneState?.id, currentPaneState?.highlightSpan]);

  useEffect(() => {
    if (currentPaneState?.autofocusTitle && titleRef.current) {
      focusAndSelectTitle(titleRef.current, 80);
    }
  }, [targetPage?.id, currentPaneState?.id, currentPaneState?.autofocusTitle]);

  const { renderedTitleHtml, renderedPromptHtml, renderedBodyHtml, totalMatchCount } = React.useMemo(() => {
    const query = pageSearchQuery.trim();
    if (!isPageSearchOpen || !query || !targetPage) {
      return {
        renderedTitleHtml: targetPage?.title || '',
        renderedPromptHtml: convertNotehookTextToHtml(targetPage?.user_prompt || '', 'auto', pages),
        renderedBodyHtml: convertNotehookTextToHtml(bodyText || '', 'auto', pages),
        totalMatchCount: 0,
      };
    }

    let runningCount = 0;

    const titleRes = highlightSearchInHtml(targetPage.title, query, runningCount, currentMatchIndex);
    runningCount += titleRes.count;

    const promptRes = highlightSearchInHtml(
      convertNotehookTextToHtml(targetPage.user_prompt || '', 'auto', pages),
      query,
      runningCount,
      currentMatchIndex
    );
    runningCount += promptRes.count;

    const bodyRes = highlightSearchInHtml(
      convertNotehookTextToHtml(bodyText || '', 'auto', pages),
      query,
      runningCount,
      currentMatchIndex
    );
    runningCount += bodyRes.count;

    // Include active entity version content in search count
    let versionRes = { html: '', count: 0 } as any;
    if (activeVersion?.content) {
      versionRes = highlightSearchInHtml(
        convertNotehookTextToHtml(activeVersion.content, 'auto', pages),
        query,
        runningCount,
        currentMatchIndex
      );
      runningCount += versionRes.count;
    }

    return {
      renderedTitleHtml: titleRes.html,
      renderedPromptHtml: promptRes.html,
      renderedBodyHtml: bodyRes.html,
      totalMatchCount: runningCount,
    };
  }, [isPageSearchOpen, pageSearchQuery, currentMatchIndex, targetPage, bodyText, pages]);

  // Scroll active search match smoothly into view (focusing first match index 0 when triggered)
  useEffect(() => {
    if (isPageSearchOpen && pageSearchQuery.trim() && totalMatchCount > 0) {
      const scrollTimer = setTimeout(() => {
        const targetIdx = currentMatchIndex >= 0 && currentMatchIndex < totalMatchCount ? currentMatchIndex : 0;
        const activeEl = document.querySelector(`[data-search-index="${targetIdx}"]`);
        if (activeEl) {
          activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 80);
      return () => clearTimeout(scrollTimer);
    }
  }, [isPageSearchOpen, pageSearchQuery, currentMatchIndex, totalMatchCount]);

  const autoResizeTextarea = (el: HTMLTextAreaElement | null, minHeight: number = 28) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.max(minHeight, el.scrollHeight)}px`;
  };

  const pageViewContainerRef = useRef<HTMLDivElement>(null);
  const savedScrollTopRef = useRef<number | null>(null);

  useEffect(() => {
    if (targetPage) {
      if (!isEditing) {
        let normalized = normalizeRawContentToCanonicalBrackets(targetPage.content || '', pages);
        // Strip duplicate leading markdown H1 from welcome note or content matching title
        if (targetPage.type === 'note' && (targetPage.title.toLowerCase().includes('welcome') || targetPage.short_id === 'n1')) {
          normalized = normalized.replace(/^#\s+Welcome[^\n]*\n+/i, '').trim();
        }
        setBodyText(normalized);
        if (normalized !== targetPage.content) {
          updatePageContent(targetPage.id, normalized);
        }
      }
      if (!isEditingPrompt) {
        setPromptText(targetPage.user_prompt || '');
      }
    }
  }, [targetPage?.id, targetPage?.content, targetPage?.user_prompt, isEditing, isEditingPrompt]);

  useLayoutEffect(() => {
    if (isEditing && contentRef.current) {
      const minH = targetPage?.type === 'entity' ? 80 : 160;
      autoResizeTextarea(contentRef.current, minH);
      if (savedScrollTopRef.current !== null && pageViewContainerRef.current) {
        pageViewContainerRef.current.scrollTop = savedScrollTopRef.current;
      }
    }
  }, [isEditing, bodyText, targetPage?.type]);

  useLayoutEffect(() => {
    if (isEditingPrompt && promptRef.current) {
      autoResizeTextarea(promptRef.current, 36);
      if (savedScrollTopRef.current !== null && pageViewContainerRef.current) {
        pageViewContainerRef.current.scrollTop = savedScrollTopRef.current;
      }
    }
  }, [isEditingPrompt, promptText]);

  // Content @ suggestions calculation (evaluates live selection & excludes inside existing references)
  const activeContentCursor = contentRef.current ? (contentRef.current.selectionStart ?? contentCursorPos) : contentCursorPos;
  const contentInsideRef = isCursorInsideReference(bodyText, activeContentCursor);
  const contentTextBeforeCursor = bodyText.slice(0, activeContentCursor);
  const contentAtMatch = contentInsideRef ? null : contentTextBeforeCursor.match(/(?:\[)?@([a-zA-Z0-9_\- :]*)$/);
  const isTypingAtContent = Boolean(contentAtMatch) && !isContentDismissed && isEditing;
  const contentQuery = contentAtMatch ? contentAtMatch[1] : '';

  const prevContentQueryRef = useRef(contentQuery);
  useEffect(() => {
    if (prevContentQueryRef.current !== contentQuery) {
      setIsContentDismissed(false);
      setContentSelectedIndex(0);
      prevContentQueryRef.current = contentQuery;
    }
  }, [contentQuery]);

  const contentSuggestions: SuggestionItem[] = isTypingAtContent
    ? getRankedSuggestions(contentQuery, pages, targetPage || null)
    : [];

  // Prompt @ suggestions calculation (evaluates live selection & excludes inside existing references)
  const activePromptCursor = promptRef.current ? (promptRef.current.selectionStart ?? promptCursorPos) : promptCursorPos;
  const promptInsideRef = isCursorInsideReference(promptText, activePromptCursor);
  const promptTextBeforeCursor = promptText.slice(0, activePromptCursor);
  const promptAtMatch = promptInsideRef ? null : promptTextBeforeCursor.match(/(?:\[)?@([a-zA-Z0-9_\- :]*)$/);
  const isTypingAtPrompt = Boolean(promptAtMatch) && !isPromptDismissed && isEditingPrompt;
  const promptQuery = promptAtMatch ? promptAtMatch[1] : '';

  const prevPromptQueryRef = useRef(promptQuery);
  useEffect(() => {
    if (prevPromptQueryRef.current !== promptQuery) {
      setIsPromptDismissed(false);
      setPromptSelectedIndex(0);
      prevPromptQueryRef.current = promptQuery;
    }
  }, [promptQuery]);

  const promptSuggestions: SuggestionItem[] = isTypingAtPrompt
    ? getRankedSuggestions(promptQuery, pages, targetPage || null)
    : [];

  const insertContentSuggestion = (item: SuggestionItem) => {
    if (!contentAtMatch || contentAtMatch.index === undefined || !targetPage) return;
    const prefix = contentTextBeforeCursor.slice(0, contentAtMatch.index);
    let textAfter = bodyText.slice(activeContentCursor);
    if (textAfter.startsWith(']')) {
      textAfter = textAfter.slice(1);
    }
    let inserted = '';

    if (item.type === 'primitive') {
      if (item.primitiveType === 'todo') inserted = '[@todo: ';
      else if (item.primitiveType === 'decision') inserted = '[@decision: ';
      else if (item.primitiveType === 'note') inserted = '[@note: ';
    } else if (item.id.startsWith('create-')) {
      if (item.itemType === 'todo') {
        const title = item.title.replace(/^\[?@todo:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@todo: ${title}] `;
        createTodoPage(title, '', targetPage.id);
      } else if (item.itemType === 'decision') {
        const title = item.title.replace(/^\[?@decision:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@decision: ${title}] `;
        createDecisionPage(title, '', targetPage.id);
      } else if (item.itemType === 'note') {
        const title = item.title.replace(/^\[?@note:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@note: ${title}] `;
        createNotePage(title, '');
      } else {
        const title = item.title.replace(/^\[?@/, '').replace(/\]$/, '').trim();
        inserted = `[@${title}] `;
        createEntityPage(title);
      }
    } else {
      const rawTitle = item.title.replace(/^@/, '').trim();
      if (item.itemType === 'todo') {
        inserted = `[@todo: ${rawTitle}] `;
      } else if (item.itemType === 'decision') {
        inserted = `[@decision: ${rawTitle}] `;
      } else if (item.itemType === 'note') {
        inserted = `[@note: ${rawTitle}] `;
      } else if (item.itemType === 'message') {
        inserted = item.shortId ? `[@${item.shortId}] ` : `[@message: ${rawTitle}] `;
      } else {
        inserted = `[@${rawTitle}] `;
      }
    }

    const newBodyText = prefix + inserted + textAfter;
    const newCursorPos = prefix.length + inserted.length;

    setBodyText(newBodyText);
    setContentCursorPos(newCursorPos);
    updatePageContent(targetPage.id, newBodyText);

    setTimeout(() => {
      if (contentRef.current) {
        contentRef.current.focus({ preventScroll: true });
        contentRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const insertPromptSuggestion = (item: SuggestionItem) => {
    if (!promptAtMatch || promptAtMatch.index === undefined || !targetPage) return;
    const prefix = promptTextBeforeCursor.slice(0, promptAtMatch.index);
    let textAfter = promptText.slice(activePromptCursor);
    if (textAfter.startsWith(']')) {
      textAfter = textAfter.slice(1);
    }
    let inserted = '';

    if (item.type === 'primitive') {
      if (item.primitiveType === 'todo') inserted = '[@todo: ';
      else if (item.primitiveType === 'decision') inserted = '[@decision: ';
      else if (item.primitiveType === 'note') inserted = '[@note: ';
    } else if (item.id.startsWith('create-')) {
      if (item.itemType === 'todo') {
        const title = item.title.replace(/^\[?@todo:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@todo: ${title}] `;
        createTodoPage(title, '', targetPage.id);
      } else if (item.itemType === 'decision') {
        const title = item.title.replace(/^\[?@decision:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@decision: ${title}] `;
        createDecisionPage(title, '', targetPage.id);
      } else if (item.itemType === 'note') {
        const title = item.title.replace(/^\[?@note:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@note: ${title}] `;
        createNotePage(title, '');
      } else {
        const title = item.title.replace(/^\[?@/, '').replace(/\]$/, '').trim();
        inserted = `[@${title}] `;
        createEntityPage(title);
      }
    } else {
      const rawTitle = item.title.replace(/^@/, '').trim();
      if (item.itemType === 'todo') {
        inserted = `[@todo: ${rawTitle}] `;
      } else if (item.itemType === 'decision') {
        inserted = `[@decision: ${rawTitle}] `;
      } else if (item.itemType === 'note') {
        inserted = `[@note: ${rawTitle}] `;
      } else if (item.itemType === 'message') {
        inserted = item.shortId ? `[@${item.shortId}] ` : `[@message: ${rawTitle}] `;
      } else {
        inserted = `[@${rawTitle}] `;
      }
    }

    const newPromptText = prefix + inserted + textAfter;
    const newCursorPos = prefix.length + inserted.length;

    setPromptText(newPromptText);
    setPromptCursorPos(newCursorPos);
    updatePageUserPrompt(targetPage.id, newPromptText);

    setTimeout(() => {
      if (promptRef.current) {
        promptRef.current.focus({ preventScroll: true });
        promptRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const getCursorCoords = (
    textarea: HTMLTextAreaElement | null,
    text: string,
    cursorPos: number
  ) => {
    if (!textarea || typeof window === 'undefined') return { top: 28, left: 12 };
    const liveCursor = textarea.selectionStart ?? cursorPos;

    try {
      const style = window.getComputedStyle(textarea);

      let mirror = document.getElementById('textarea-caret-mirror') as HTMLDivElement | null;
      if (!mirror) {
        mirror = document.createElement('div');
        mirror.id = 'textarea-caret-mirror';
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.pointerEvents = 'none';
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.wordWrap = 'break-word';
        mirror.style.overflowWrap = 'break-word';
        mirror.style.top = '-9999px';
        mirror.style.left = '-9999px';
        document.body.appendChild(mirror);
      }

      const propertiesToCopy = [
        'direction',
        'boxSizing',
        'width',
        'height',
        'overflowX',
        'overflowY',
        'borderTopWidth',
        'borderRightWidth',
        'borderBottomWidth',
        'borderLeftWidth',
        'borderStyle',
        'paddingTop',
        'paddingRight',
        'paddingBottom',
        'paddingLeft',
        'fontStyle',
        'fontVariant',
        'fontWeight',
        'fontStretch',
        'fontSize',
        'fontSizeAdjust',
        'lineHeight',
        'fontFamily',
        'textAlign',
        'textTransform',
        'textIndent',
        'textDecoration',
        'letterSpacing',
        'wordSpacing',
        'tabSize',
      ] as const;

      propertiesToCopy.forEach((prop) => {
        // @ts-ignore
        mirror!.style[prop] = style[prop];
      });

      mirror.style.width = `${textarea.clientWidth}px`;

      const textVal = textarea.value || text;
      const textBefore = textVal.slice(0, liveCursor);
      mirror.textContent = textBefore;

      const span = document.createElement('span');
      span.textContent = textVal.slice(liveCursor) || '.';
      mirror.appendChild(span);

      const fontSize = parseFloat(style.fontSize) || 14;
      const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.5;

      // Position top-left corner ALWAYS slightly lower (+4px below line) and slightly to the right (+6px right of caret)
      const top = span.offsetTop + lineHeight + 4 - textarea.scrollTop;
      const rawLeft = span.offsetLeft + 6;
      const maxLeft = Math.max(12, textarea.clientWidth - 270);
      const left = Math.min(rawLeft, maxLeft);

      return {
        top: Math.max(4, top),
        left: Math.max(6, left),
      };
    } catch (e) {
      return { top: 28, left: 12 };
    }
  };

  // Entity Versions List (only explicitly created versions in targetPage.versions)
  const allEntityVersions: EntityVersion[] = React.useMemo(() => {
    if (!targetPage) return [];
    return targetPage.versions || [];
  }, [targetPage?.id, targetPage?.versions]);

  const canonicalVersionId = React.useMemo(() => {
    if (!targetPage) return undefined;
    if (targetPage.canonical_version_id && allEntityVersions.some((v) => v.id === targetPage.canonical_version_id)) {
      return targetPage.canonical_version_id;
    }
    const newest = allEntityVersions[allEntityVersions.length - 1];
    return newest?.id;
  }, [targetPage?.canonical_version_id, targetPage?.id, allEntityVersions]);

  useEffect(() => {
    if (targetPage && targetPage.type === 'entity' && allEntityVersions.length > 0) {
      if (currentPaneState?.targetVersionId && allEntityVersions.some((v) => v.id === currentPaneState.targetVersionId)) {
        setSelectedVersionId(currentPaneState.targetVersionId);
        return;
      }
      if (currentPaneState?.targetVersionNum !== undefined) {
        const found =
          allEntityVersions.find(
            (v) =>
              v.version_num === currentPaneState.targetVersionNum ||
              v.title.toLowerCase() === `v${currentPaneState.targetVersionNum}`
          ) || allEntityVersions[currentPaneState.targetVersionNum - 1];
        if (found) {
          setSelectedVersionId(found.id);
          return;
        }
      }
      const mostRecentId = allEntityVersions[allEntityVersions.length - 1].id;
      if (!selectedVersionId || !allEntityVersions.some((v) => v.id === selectedVersionId)) {
        setSelectedVersionId(mostRecentId);
      }
    }
  }, [targetPage?.id, targetPage?.type, allEntityVersions.length, currentPaneState?.targetVersionNum, currentPaneState?.targetVersionId]);

  const activeVersion =
    allEntityVersions.find((v) => v.id === selectedVersionId) ||
    allEntityVersions[allEntityVersions.length - 1] ||
    {
      id: `ver-initial-${targetPage?.id}`,
      entity_id: targetPage?.id || '',
      version_num: (targetPage?.current_version_num || 0) + 1,
      title: `v${(targetPage?.current_version_num || 0) + 1}`,
      content: '',
      created_at: new Date().toISOString(),
      is_canonical: true,
    };

  // Entity Version Body @ suggestions calculation (evaluates live selection & excludes inside existing references)
  const activeVersionText = activeVersion?.content || '';

  useLayoutEffect(() => {
    if (isEditingVersionBody && versionContentRef.current) {
      autoResizeTextarea(versionContentRef.current, 140);
      if (savedScrollTopRef.current !== null && pageViewContainerRef.current) {
        pageViewContainerRef.current.scrollTop = savedScrollTopRef.current;
      }
    }
  }, [isEditingVersionBody, activeVersion?.content]);
  const activeVersionCursor = versionContentRef.current ? (versionContentRef.current.selectionStart ?? versionCursorPos) : versionCursorPos;
  const versionInsideRef = isCursorInsideReference(activeVersionText, activeVersionCursor);
  const versionTextBeforeCursor = activeVersionText.slice(0, activeVersionCursor);
  const versionAtMatch = versionInsideRef ? null : versionTextBeforeCursor.match(/(?:\[)?@([a-zA-Z0-9_\- :]*)$/);
  const isTypingAtVersion = Boolean(versionAtMatch) && !isVersionDismissed && isEditingVersionBody;
  const versionQuery = versionAtMatch ? versionAtMatch[1] : '';

  const prevVersionQueryRef = useRef(versionQuery);
  useEffect(() => {
    if (prevVersionQueryRef.current !== versionQuery) {
      setIsVersionDismissed(false);
      setVersionSelectedIndex(0);
      prevVersionQueryRef.current = versionQuery;
    }
  }, [versionQuery]);

  if (!targetPage) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-zinc-400 text-xs bg-white">
        <p>Page not found</p>
      </div>
    );
  }

  // Find all mentions & backlinked pages targeting this page across ALL page types
  const backlinkedPages = pages.filter((p) => {
    if (p.id === targetPage.id) return false;

    // 1. Check relational mentions junction list where page p is the source mentioning targetPage
    const hasRelationalMention = mentions.some(
      (m) => m.target_page_id === targetPage.id && m.source_page_id === p.id && !m.orphaned
    );
    if (hasRelationalMention) return true;

    // 2. Check full text of content or user_prompt of page p for explicit [@targetPageTitle] or [@targetPageShortId]
    const sourceText = `${p.user_prompt || ''} ${p.content || ''}`;
    return matchesExplicitReference(sourceText, targetPage.title, targetPage.short_id);
  });

  const versionItems = allEntityVersions.map((v, index) => {
    const isMostRecent = index === allEntityVersions.length - 1;
    const isCanonical = v.id === canonicalVersionId || Boolean(v.is_canonical);
    const ageText = getRelativeAgeTime(v.created_at);
    const ageFormatted = ageText ? ` (${ageText})` : '';

    let statusTag = '';
    if (isCanonical) {
      statusTag = ' ★ (Primary)';
    } else if (isMostRecent) {
      statusTag = ' (Most Recent)';
    }

    const label = `${v.title}${statusTag}${ageFormatted}`;
    return {
      version: v,
      isMostRecent,
      isCanonical,
      label,
    };
  });

  const dropdownOptions = [...versionItems].reverse();

  const versionSuggestions: SuggestionItem[] = isTypingAtVersion
    ? getRankedSuggestions(versionQuery, pages, targetPage || null)
    : [];

  const insertVersionSuggestion = (item: SuggestionItem) => {
    if (!versionAtMatch || versionAtMatch.index === undefined || !targetPage || !activeVersion) return;
    const prefix = versionTextBeforeCursor.slice(0, versionAtMatch.index);
    let textAfter = activeVersionText.slice(activeVersionCursor);
    if (textAfter.startsWith(']')) {
      textAfter = textAfter.slice(1);
    }
    let inserted = '';

    if (item.type === 'primitive') {
      if (item.primitiveType === 'todo') inserted = '[@todo: ';
      else if (item.primitiveType === 'decision') inserted = '[@decision: ';
      else if (item.primitiveType === 'note') inserted = '[@note: ';
    } else if (item.id.startsWith('create-')) {
      if (item.itemType === 'todo') {
        const title = item.title.replace(/^\[?@todo:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@todo: ${title}] `;
        createTodoPage(title, '', targetPage.id);
      } else if (item.itemType === 'decision') {
        const title = item.title.replace(/^\[?@decision:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@decision: ${title}] `;
        createDecisionPage(title, '', targetPage.id);
      } else if (item.itemType === 'note') {
        const title = item.title.replace(/^\[?@note:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@note: ${title}] `;
        createNotePage(title, '');
      } else {
        const title = item.title.replace(/^\[?@/, '').replace(/\]$/, '').trim();
        inserted = `[@${title}] `;
        createEntityPage(title);
      }
    } else {
      const rawTitle = item.title.replace(/^@/, '').trim();
      if (item.itemType === 'todo') {
        inserted = `[@todo: ${rawTitle}] `;
      } else if (item.itemType === 'decision') {
        inserted = `[@decision: ${rawTitle}] `;
      } else if (item.itemType === 'note') {
        inserted = `[@note: ${rawTitle}] `;
      } else if (item.itemType === 'message') {
        inserted = item.shortId ? `[@${item.shortId}] ` : `[@message: ${rawTitle}] `;
      } else {
        inserted = `[@${rawTitle}] `;
      }
    }

    const newVersionText = prefix + inserted + textAfter;
    const newCursorPos = prefix.length + inserted.length;

    handleVersionContentChange(newVersionText);
    setVersionCursorPos(newCursorPos);

    setTimeout(() => {
      if (versionContentRef.current) {
        versionContentRef.current.focus({ preventScroll: true });
        versionContentRef.current.setSelectionRange(newCursorPos, newCursorPos);
      }
    }, 0);
  };

  const handleMarkdownPaste = (
    e: React.ClipboardEvent<HTMLTextAreaElement>,
    currentText: string,
    onTextChange: (newText: string) => void,
    onCursorChange: (newCursor: number) => void
  ) => {
    let pastedText = e.clipboardData.getData('text/plain');
    const htmlText = e.clipboardData.getData('text/html');

    if (htmlText && (!pastedText || !/(?:^|\n)[#>\-*`\[]/.test(pastedText))) {
      const converted = htmlToMarkdown(htmlText);
      if (converted && converted.length > 0) {
        pastedText = converted;
      }
    }

    if (!pastedText) return;

    const normalized = normalizeRawContentToCanonicalBrackets(pastedText, pages);
    const parsed = parseNotehookMarkup(normalized, pages);

    parsed.forEach((item) => {
      const cleanTitle = (item.nameOrTitle || item.fullText || '').trim();
      if (!cleanTitle) return;

      const cleanLower = cleanTitle.toLowerCase();
      const isPageIDPattern = /^(m|e|n|d|t)\d+$/i.test(cleanLower);
      const pageExists = pages.some(
        (p) => (p.short_id && p.short_id.toLowerCase() === cleanLower) || p.title.toLowerCase() === cleanLower
      );

      if (isPageIDPattern || pageExists) return;

      if (item.type === 'todo') {
        createTodoPage(cleanTitle, '', targetPage?.id);
      } else if (item.type === 'decision') {
        createDecisionPage(cleanTitle, '', targetPage?.id);
      } else if (item.type === 'note') {
        createNotePage(cleanTitle, '');
      } else if (item.type === 'entity') {
        createEntityPage(cleanTitle);
      }
    });

    e.preventDefault();
    const textarea = e.currentTarget;
    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const newVal = currentText.slice(0, start) + normalized + currentText.slice(end);
    const newCursor = start + normalized.length;

    onTextChange(newVal);
    onCursorChange(newCursor);

    setTimeout(() => {
      textarea.setSelectionRange(newCursor, newCursor);
      const minH = targetPage?.type === 'entity' ? 80 : 160;
      autoResizeTextarea(textarea, minH);
    }, 0);
  };

  const handleCreateNewVersion = () => {
    if (!targetPage) return;
    const canonicalVer = allEntityVersions.find((v) => v.id === canonicalVersionId) || allEntityVersions[allEntityVersions.length - 1];
    const initialContent = canonicalVer ? canonicalVer.content : '';
    const newVer = addEntityVersion(targetPage.id, undefined, initialContent);

    setSelectedVersionId(newVer.id);
    setIsEditingVersionBody(true);
    setIsEditing(true);
  };

  const handleVersionTitleChange = (newTitle: string) => {
    if (!targetPage || !activeVersion) return;
    if (!targetPage.versions || targetPage.versions.length === 0 || activeVersion.id.startsWith('ver-initial-')) {
      const newVer = addEntityVersion(targetPage.id, newTitle, activeVersion.content);
      setSelectedVersionId(newVer.id);
    } else {
      updateEntityVersion(targetPage.id, activeVersion.id, newTitle, activeVersion.content);
    }
  };

  const handleVersionContentChange = (newContent: string) => {
    if (!targetPage || !activeVersion) return;
    if (!targetPage.versions || targetPage.versions.length === 0 || activeVersion.id.startsWith('ver-initial-')) {
      const newVer = addEntityVersion(targetPage.id, activeVersion.title || 'v1', newContent);
      setSelectedVersionId(newVer.id);
    } else {
      updateEntityVersion(targetPage.id, activeVersion.id, activeVersion.title, newContent);
    }
  };

  const canGoBack = paneIndex === 2 ? rightPaneCanGoBack : leftPaneCanGoBack;

  const handleBack = () => {
    if (paneIndex === 2 && rightPaneCanGoBack) {
      goBackPane2();
    } else if (paneIndex === 1 && leftPaneCanGoBack) {
      goBackPane1();
    }
  };

  const handleMentionClick = (bp: (typeof pages)[0], mentionSnippet?: string) => {
    const targetSpan = targetPage?.title || targetPage?.short_id || mentionSnippet;
    if (bp.type === 'message') {
      handleScrollToChatWithId(bp.id, targetSpan);
    } else {
      const displayTitle = bp.type === 'entity' ? `@${bp.title}` : bp.title;
      if (paneIndex === 1) {
        openInPane1(bp.type as any, bp.id, displayTitle, targetSpan);
      } else {
        openInPane2(bp.type as any, bp.id, displayTitle, targetSpan);
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isEditingPrompt) return;

    const targetEl = e.target as HTMLElement;
    const isGutter = handleGutterRangeClick(targetEl, e.currentTarget, e.shiftKey);
    if (isGutter) {
      e.stopPropagation();
      return;
    }

    // If user is selecting text, stay in non-edit mode so text selection & floating tag toolbar remain active
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0) {
      return;
    }

    // If user has selected gutters, clicking away deselects them and prevents entering edit mode on this click
    if (clearAllGutterSelections()) {
      return;
    }

    const pillTarget = (e.target as HTMLElement).closest('.page-mention-pill, [data-entity], [data-title]') as HTMLElement;
    if (pillTarget) {
      e.stopPropagation();
      const matchedPage = findPageForPill(pillTarget, pages);

      if (matchedPage) {
        const targetSpan = pillTarget.getAttribute('data-full') || pillTarget.getAttribute('data-title') || pillTarget.getAttribute('data-short-id') || pillTarget.textContent?.trim();
        if (matchedPage.type === 'message') {
          navigateToMessage(matchedPage.id, targetSpan);
          return;
        }
        const displayTitle = matchedPage.type === 'entity' ? `@${matchedPage.title}` : matchedPage.title;
        openInPane2(matchedPage.type as any, matchedPage.id, displayTitle, targetSpan);
        return;
      }
      return;
    }

    // Calculate exact clicked character offset or fallback to end of text
    const targetOffset = getCaretOffsetFromPoint(e.currentTarget, e.clientX, e.clientY, bodyText);
    const scrollContainer = pageViewContainerRef.current;
    const currentScroll = scrollContainer?.scrollTop ?? 0;
    savedScrollTopRef.current = currentScroll;

    setIsEditing(true);
    if (targetPage.type === 'entity') {
      setIsEditingVersionBody(true);
    }

    setTimeout(() => {
      if (contentRef.current) {
        const minH = targetPage?.type === 'entity' ? 80 : 160;
        autoResizeTextarea(contentRef.current, minH);
        contentRef.current.focus({ preventScroll: true });
        contentRef.current.setSelectionRange(targetOffset, targetOffset);
        setContentCursorPos(targetOffset);
      }
      if (versionContentRef.current) {
        autoResizeTextarea(versionContentRef.current, 140);
      }
      if (scrollContainer) {
        scrollContainer.scrollTop = currentScroll;
      }
    }, 0);
  };

  const pagePillColor = getPastelColorForTitle(targetPage.title, targetPage.type);

  const renderBadge = () => {
    if (targetPage.type === 'entity') {
      return (
        <span
          className="page-mention-pill text-xs font-bold text-zinc-900"
          style={{ backgroundColor: pagePillColor }}
        >
          <Tag className="w-3 h-3 text-purple-600 inline mr-0.5" /> entity
        </span>
      );
    }
    if (targetPage.type === 'todo') {
      return (
        <span
          className="page-mention-pill text-xs font-bold text-zinc-900"
          style={{ backgroundColor: pagePillColor }}
        >
          {targetPage.done ? (
            <CheckSquare className="w-3.5 h-3.5 text-emerald-600 inline mr-0.5" />
          ) : (
            <Square className="w-3.5 h-3.5 text-emerald-600 inline mr-0.5" />
          )}
          todo
        </span>
      );
    }
    if (targetPage.type === 'decision') {
      return (
        <span
          className="page-mention-pill text-xs font-bold text-zinc-900"
          style={{ backgroundColor: pagePillColor }}
        >
          <Zap className="w-3.5 h-3.5 text-orange-500 inline mr-0.5" /> decision
        </span>
      );
    }
    if (targetPage.type === 'note') {
      return (
        <span
          className="page-mention-pill text-xs font-bold text-zinc-900"
          style={{ backgroundColor: pagePillColor }}
        >
          <FileText className="w-3.5 h-3.5 text-red-600 inline mr-0.5" /> note
        </span>
      );
    }
    return (
      <span
        className="page-mention-pill text-xs font-bold text-zinc-900"
        style={{ backgroundColor: pagePillColor }}
      >
        <MessageSquare className="w-3 h-3 text-sky-700 inline mr-0.5" /> message
      </span>
    );
  };

  const handleScrollToChatWithId = (sourceNoteId: string, highlightSpan?: string) => {
    const targetSpan = highlightSpan || targetPage?.title || targetPage?.short_id;
    scrollToMessageInChat(sourceNoteId, targetSpan);
  };

  const handleScrollToChat = () => {
    let sourceNoteId = targetPage.id;

    if (targetPage.type !== 'message' && (targetPage.type as string) !== 'note') {
      const originMention = mentions.find((m) => m.target_page_id === targetPage.id);
      if (originMention) {
        sourceNoteId = originMention.source_page_id;
      }
    }

    handleScrollToChatWithId(sourceNoteId, targetPage.title || targetPage.short_id);
  };

  return (
    <div data-page-id={targetPage.id} data-page-short-id={targetPage.short_id || ''} className="relative flex flex-col h-full bg-white text-zinc-900 overflow-hidden font-sans select-text">
      {/* Sticky Floating In-Page Search Bar (Ctrl+F) */}
      {isPageSearchOpen && (
        <div className="absolute top-3 left-4 z-50 flex items-center justify-between w-[320px] h-9 px-2.5 bg-white/95 backdrop-blur-md border border-zinc-200/90 rounded-xl shadow-md text-xs select-none animate-in fade-in slide-in-from-top-1 duration-100 shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0 mr-2">
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0 pointer-events-none" />
            <input
              ref={pageSearchInputRef}
              type="text"
              value={pageSearchQuery}
              onChange={(e) => {
                setPageSearchQuery(e.target.value);
                setCurrentMatchIndex(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsPageSearchOpen(false);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (totalMatchCount > 0) {
                    if (e.shiftKey) {
                      setCurrentMatchIndex((prev) => (prev - 1 + totalMatchCount) % totalMatchCount);
                    } else {
                      setCurrentMatchIndex((prev) => (prev + 1) % totalMatchCount);
                    }
                  }
                }
              }}
              placeholder="Find in page..."
              className="w-full bg-transparent text-xs font-medium text-zinc-900 placeholder-zinc-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] font-mono text-zinc-400 w-14 text-center shrink-0 border-r border-zinc-200/80 pr-1.5">
              {pageSearchQuery.trim()
                ? totalMatchCount > 0
                  ? `${currentMatchIndex + 1}/${totalMatchCount}`
                  : '0/0'
                : ''}
            </span>
            <button
              type="button"
              onClick={() => totalMatchCount > 0 && setCurrentMatchIndex((prev) => (prev - 1 + totalMatchCount) % totalMatchCount)}
              disabled={totalMatchCount === 0}
              className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
              title="Previous match (Shift+Enter)"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => totalMatchCount > 0 && setCurrentMatchIndex((prev) => (prev + 1) % totalMatchCount)}
              disabled={totalMatchCount === 0}
              className="p-1 rounded hover:bg-zinc-100 disabled:opacity-30 text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
              title="Next match (Enter)"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsPageSearchOpen(false)}
              className="p-1 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Obsidian-Style Seamless Document Canvas */}
      <div
        ref={pageViewContainerRef}
        data-page-canvas="true"
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] bg-white flex flex-col pl-10 pr-6 pt-6 md:pl-12 md:pr-8 md:pt-6 space-y-4 pb-24 md:pb-32"
      >
        {/* Top Row: Page ID Pill (Left-aligned with page text) & Action Buttons (Right-aligned) */}
        <div className="flex items-center justify-between gap-2 select-none">
          <div>
            {targetPage.short_id && (
              <button
                type="button"
                data-short-id={targetPage.short_id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyShortId(targetPage.short_id!);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-zinc-100/90 text-zinc-600 hover:text-zinc-950 border border-zinc-200/90 hover:border-zinc-300 hover:bg-zinc-200/70 transition-all shadow-2xs cursor-pointer select-none"
                title={`Click to copy [@${targetPage.short_id}] to clipboard`}
              >
                {copiedShortId === targetPage.short_id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700 font-sans font-semibold text-[11px]">Copied!</span>
                  </>
                ) : (
                  <span>[@{targetPage.short_id}]</span>
                )}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {(targetPage.type === 'entity' || targetPage.type === 'decision' || targetPage.type === 'note') && (
              <button
                type="button"
                onClick={() => {
                  const wasPinned = pinnedPageIds.includes(targetPage.id);
                  const ok = togglePinPage(targetPage.id);
                  if (!ok && !wasPinned) {
                    alert('You can pin a maximum of 3 knowledge pages for AI session prefix caching.');
                  }
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all shadow-2xs cursor-pointer select-none ${pinnedPageIds.includes(targetPage.id)
                  ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-300 hover:text-zinc-950 hover:bg-zinc-50'
                  }`}
                title={pinnedPageIds.includes(targetPage.id) ? 'Pinned to AI context (click to unpin)' : 'Pin to AI context (max 3)'}
              >
                <Pin className={`w-3 h-3 ${pinnedPageIds.includes(targetPage.id) ? 'fill-amber-600 text-amber-700' : 'text-zinc-400'}`} />
                <span>{pinnedPageIds.includes(targetPage.id) ? 'Pinned' : 'Pin to AI'}</span>
              </button>
            )}

            {targetPage.type === 'message' && (
              <button
                type="button"
                onClick={handleScrollToChat}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white text-zinc-700 hover:text-zinc-950 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/80 transition-colors shadow-2xs cursor-pointer"
                title="Scroll left chat pane to origin message"
              >
                <MessageSquare className="w-3 h-3 text-zinc-500" />
                <span>View in Chat</span>
              </button>
            )}

            {targetPage.type === 'todo' && (
              <>
                <button
                  type="button"
                  onClick={() => toggleTodoDone(targetPage.id)}
                  className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white text-zinc-700 hover:text-zinc-950 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/80 transition-colors shadow-2xs cursor-pointer"
                  title={targetPage.done ? 'Click to mark as incomplete' : 'Click to mark as complete'}
                >
                  <span>{targetPage.done ? 'Complete' : 'Incomplete'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => toggleTodoStarred(targetPage.id)}
                  className="inline-flex items-center justify-center p-1 rounded-full bg-white border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-colors shadow-2xs cursor-pointer"
                  title={targetPage.starred ? 'Unstar todo' : 'Star todo'}
                >
                  <Star
                    className={`w-3.5 h-3.5 transition-colors ${targetPage.starred
                      ? 'fill-amber-400 text-amber-400'
                      : 'text-zinc-400 hover:text-amber-400'
                      }`}
                  />
                </button>
              </>
            )}

            {renderBadge()}

            <button
              type="button"
              onClick={() => {
                deletePage(targetPage.id);
              }}
              className="inline-flex items-center justify-center p-1.5 rounded-full bg-white text-zinc-400 hover:text-red-600 border border-zinc-200 hover:border-red-200 hover:bg-red-50/80 transition-colors shadow-2xs cursor-pointer select-none"
              title="Delete page and remove from AI context"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* H1 Title (ContentEditable - Disabled when prompt is being edited) */}
        <div className="notehook-markdown-block relative">
          <div
            className="notehook-gutter-handle"
            title="Select markdown block"
            onMouseDown={(e) => e.preventDefault()}
            data-block-index="title"
            style={{ top: '0.4rem' }}
          >
            <button
              type="button"
              className="notehook-gutter-btn"
              title="Select markdown block"
              onMouseDown={(e) => e.preventDefault()}
              data-block-id="block-title"
            >
              <svg className="w-4.5 h-4.5 square-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>
              <svg className="w-4.5 h-4.5 check-square-icon hidden fill-indigo-50 text-indigo-600" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="m9 12 2 2 4-4" /></svg>
            </button>
          </div>
          <h1
            ref={titleRef}
            contentEditable={!isEditingPrompt}
            suppressContentEditableWarning
            onBlur={(e) => {
              const cleanText = e.currentTarget.innerText.replace(/\n+/g, ' ').trim();
              if (cleanText && cleanText !== targetPage.title) {
                const finalTitle = updatePageTitle(targetPage.id, cleanText);
                if (finalTitle) {
                  e.currentTarget.innerText = finalTitle;
                }
              } else if (!cleanText) {
                e.currentTarget.innerText = targetPage.title;
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                e.currentTarget.blur();
                setIsEditing(true);
                if (targetPage.type === 'entity') {
                  setIsEditingVersionBody(true);
                }
                setTimeout(() => {
                  if (contentRef.current) {
                    contentRef.current.focus({ preventScroll: true });
                  }
                }, 50);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                e.currentTarget.innerText = targetPage.title;
                e.currentTarget.blur();
              }
            }}
            className={`text-2xl font-extrabold text-zinc-950 tracking-tight leading-tight outline-none focus:outline-none focus:ring-0 ring-0 w-full ${isEditingPrompt ? 'cursor-default' : 'cursor-text select-text'
              }`}
            dangerouslySetInnerHTML={isPageSearchOpen && pageSearchQuery.trim() ? { __html: renderedTitleHtml } : undefined}
          >
            {isPageSearchOpen && pageSearchQuery.trim()
              ? null
              : (targetPage.title.toLowerCase() === 'welcome' || targetPage.title === 'Welcome'
                ? 'Welcome to Notehook! 👋'
                : targetPage.title)}
          </h1>
        </div>

        {/* User Prompt Inner Rectangle (Rendered BELOW title in message page view) */}
        {targetPage.user_prompt && (
          <div className="notehook-markdown-block relative notehook-user-prompt-turn mb-2">
            <div
              className="notehook-gutter-handle"
              title="Select markdown block"
              onMouseDown={(e) => e.preventDefault()}
              data-block-index="prompt"
              style={{ top: '0.85rem' }}
            >
              <button
                type="button"
                className="notehook-gutter-btn"
                title="Select markdown block"
                onMouseDown={(e) => e.preventDefault()}
                data-block-id="block-prompt"
              >
                <svg className="w-4.5 h-4.5 square-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>
                <svg className="w-4.5 h-4.5 check-square-icon hidden fill-indigo-50 text-indigo-600" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="m9 12 2 2 4-4" /></svg>
              </button>
            </div>
            {isEditingPrompt ? (
              <div
                onClick={(e) => e.stopPropagation()}
                className="p-3.5 rounded-xl bg-zinc-50 border border-indigo-400 text-xs text-zinc-800 shadow-2xs space-y-1 relative"
              >
                <div className="flex items-center justify-between font-bold text-zinc-900 text-xs select-none">
                  <span>Prompt:</span>
                </div>
                {isTypingAtPrompt && promptSuggestions.length > 0 && (
                  <div
                    className="absolute z-50 transition-all duration-75 ease-out"
                    style={{
                      top: `${getCursorCoords(promptRef.current, promptText, promptCursorPos).top}px`,
                      left: `${getCursorCoords(promptRef.current, promptText, promptCursorPos).left}px`,
                    }}
                  >
                    <SuggestionList
                      items={promptSuggestions}
                      selectedIndex={promptSelectedIndex}
                      onSelect={insertPromptSuggestion}
                    />
                  </div>
                )}
                <textarea
                  ref={promptRef}
                  value={promptText}
                  onPaste={(e) =>
                    handleMarkdownPaste(
                      e,
                      promptText,
                      (t) => {
                        setPromptText(t);
                        if (targetPage) updatePageUserPrompt(targetPage.id, t);
                      },
                      setPromptCursorPos
                    )
                  }
                  onChange={(e) => {
                    setPromptText(e.target.value);
                    setPromptCursorPos(e.target.selectionStart ?? e.target.value.length);
                    setIsPromptDismissed(false);
                    autoResizeTextarea(e.target, 36);
                  }}
                  onFocus={(e) => {
                    if (e.target.selectionStart === 0 && e.target.selectionEnd === 0 && promptText.length > 0) {
                      e.target.setSelectionRange(promptText.length, promptText.length);
                    }
                    setPromptCursorPos(e.target.selectionStart ?? promptText.length);
                    autoResizeTextarea(e.target, 36);
                  }}
                  onKeyUp={(e) => setPromptCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? promptText.length)}
                  onClick={(e) => setPromptCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? promptText.length)}
                  onSelect={(e) => setPromptCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? promptText.length)}
                  onBlur={() => {
                    setTimeout(() => {
                      if (document.activeElement === promptRef.current) return;
                      const clean = promptText.trim();
                      if (clean) {
                        updatePageUserPrompt(targetPage.id, clean);
                      }
                      setIsEditingPrompt(false);
                    }, 150);
                  }}
                  onKeyDown={(e) => {
                    if (isTypingAtPrompt && promptSuggestions.length > 0) {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setPromptSelectedIndex((prev) => (prev + 1) % promptSuggestions.length);
                        return;
                      }
                      if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setPromptSelectedIndex((prev) => (prev - 1 + promptSuggestions.length) % promptSuggestions.length);
                        return;
                      }
                      if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        setIsPromptDismissed(true);
                        return;
                      }
                      if (e.key === 'Enter' || e.key === 'Tab') {
                        e.preventDefault();
                        insertPromptSuggestion(promptSuggestions[promptSelectedIndex] || promptSuggestions[0]);
                        return;
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        setIsPromptDismissed(true);
                        return;
                      }
                    }
                    if (e.key === 'Escape') {
                      setIsEditingPrompt(false);
                    }
                  }}
                  placeholder="Type prompt text..."
                  className="w-full text-xs text-zinc-900 leading-relaxed font-normal bg-transparent border-0 outline-none focus:outline-none focus:ring-0 shadow-none resize-none p-0 m-0 pt-0.5 min-h-[36px] overflow-hidden"
                  autoFocus
                />
              </div>
            ) : (
              <div
                onClick={(e) => {
                  const pillTarget = (e.target as HTMLElement).closest('.page-mention-pill, [data-entity], [data-title]') as HTMLElement;
                  if (pillTarget) {
                    e.stopPropagation();
                    const matchedPage = findPageForPill(pillTarget, pages);
                    if (matchedPage) {
                      const targetSpan = pillTarget.getAttribute('data-full') || pillTarget.getAttribute('data-title') || pillTarget.getAttribute('data-short-id') || pillTarget.textContent?.trim();
                      if (matchedPage.type === 'message') {
                        navigateToMessage(matchedPage.id, targetSpan);
                        return;
                      }
                      const displayTitle = matchedPage.type === 'entity' ? `@${matchedPage.title}` : matchedPage.title;
                      openInPane2(matchedPage.type as any, matchedPage.id, displayTitle, targetSpan);
                      return;
                    }
                    return;
                  }
                  const selection = window.getSelection();
                  if (selection && selection.toString().trim().length > 0) {
                    return;
                  }
                  e.stopPropagation();
                  const targetOffset = getCaretOffsetFromPoint(e.currentTarget, e.clientX, e.clientY, promptText);
                  setPromptText(targetPage.user_prompt || '');
                  const scrollContainer = pageViewContainerRef.current;
                  const currentScroll = scrollContainer?.scrollTop ?? 0;
                  savedScrollTopRef.current = currentScroll;
                  setIsEditingPrompt(true);
                  setTimeout(() => {
                    if (promptRef.current) {
                      autoResizeTextarea(promptRef.current, 36);
                      promptRef.current.focus({ preventScroll: true });
                      promptRef.current.setSelectionRange(targetOffset, targetOffset);
                      setPromptCursorPos(targetOffset);
                    }
                    if (scrollContainer) {
                      scrollContainer.scrollTop = currentScroll;
                    }
                  }, 0);
                }}
                className="p-3.5 rounded-xl bg-zinc-50 border border-zinc-200/90 text-xs text-zinc-800 shadow-2xs space-y-1 cursor-text hover:border-zinc-300 transition-colors"
                title="Click to edit prompt"
              >
                <div className="flex items-center gap-1.5 font-bold text-zinc-900 text-xs select-none">
                  <span>Prompt:</span>
                </div>
                <div
                  className="text-xs text-zinc-800 leading-relaxed font-normal pt-0.5"
                  dangerouslySetInnerHTML={{
                    __html: renderedPromptHtml,
                  }}
                />
              </div>
            )}
          </div>
        )}

        {/* Seamless Canvas (Automatic Edit / Blur Transition) */}
        <div className="flex flex-col relative w-full min-h-[160px] pb-12">
          {isEditing ? (
            <>
              {isTypingAtContent && contentSuggestions.length > 0 && (
                <div
                  className="absolute z-50 transition-all duration-75 ease-out"
                  style={{
                    top: `${getCursorCoords(contentRef.current, bodyText, contentCursorPos).top}px`,
                    left: `${getCursorCoords(contentRef.current, bodyText, contentCursorPos).left}px`,
                  }}
                >
                  <SuggestionList
                    items={contentSuggestions}
                    selectedIndex={contentSelectedIndex}
                    onSelect={insertContentSuggestion}
                  />
                </div>
              )}
              <textarea
                ref={contentRef}
                value={bodyText}
                onPaste={(e) =>
                  handleMarkdownPaste(
                    e,
                    bodyText,
                    (t) => {
                      setBodyText(t);
                      if (targetPage) updatePageContent(targetPage.id, t);
                    },
                    setContentCursorPos
                  )
                }
                onChange={(e) => {
                  const val = e.target.value;
                  setBodyText(val);
                  updatePageContent(targetPage.id, val);
                  setContentCursorPos(e.target.selectionStart ?? val.length);
                  setIsContentDismissed(false);
                  const minH = targetPage?.type === 'entity' ? 80 : 160;
                  autoResizeTextarea(e.target, minH);
                }}
                onFocus={(e) => {
                  if (e.target.selectionStart === 0 && e.target.selectionEnd === 0 && bodyText.length > 0) {
                    e.target.setSelectionRange(bodyText.length, bodyText.length);
                  }
                  setContentCursorPos(e.target.selectionStart ?? bodyText.length);
                  const minH = targetPage?.type === 'entity' ? 80 : 160;
                  autoResizeTextarea(e.target, minH);
                }}
                onKeyUp={(e) => setContentCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? bodyText.length)}
                onClick={(e) => setContentCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? bodyText.length)}
                onSelect={(e) => setContentCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? bodyText.length)}
                onBlur={() => {
                  setTimeout(() => {
                    if (document.activeElement === contentRef.current) return;
                    if (targetPage?.type === 'entity' && document.activeElement === versionContentRef.current) return;
                    setIsEditing(false);
                    if (targetPage?.type === 'entity') {
                      setIsEditingVersionBody(false);
                    }
                  }, 150);
                }}
                onKeyDown={(e) => {
                  if (isTypingAtContent && contentSuggestions.length > 0) {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setContentSelectedIndex((prev) => (prev + 1) % contentSuggestions.length);
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setContentSelectedIndex((prev) => (prev - 1 + contentSuggestions.length) % contentSuggestions.length);
                      return;
                    }
                    if (e.key === 'ArrowRight') {
                      e.preventDefault();
                      setIsContentDismissed(true);
                      return;
                    }
                    if (e.key === 'Enter' || e.key === 'Tab') {
                      e.preventDefault();
                      insertContentSuggestion(contentSuggestions[contentSelectedIndex] || contentSuggestions[0]);
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setIsContentDismissed(true);
                      return;
                    }
                  }
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                    if (targetPage?.type === 'entity') {
                      setIsEditingVersionBody(false);
                    }
                  }
                }}
                placeholder="Type page content (markdown and @tags supported)..."
                className="overflow-hidden w-full min-h-[160px] text-xs md:text-sm text-zinc-900 leading-relaxed font-sans bg-transparent border-0 outline-none focus:outline-none focus:ring-0 ring-0 shadow-none resize-none p-0 m-0"
              />
            </>
          ) : (
            <div
              onClick={handleCanvasClick}
              onMouseDown={(e) => {
                handleGutterMouseDown(e, e.currentTarget);
              }}
              className="cursor-text w-full h-full min-h-[160px] p-0 m-0 pb-12"
              title="Click anywhere on the document to edit"
            >
              <div
                className="text-xs md:text-sm text-zinc-900 leading-relaxed font-normal bg-white"
                dangerouslySetInnerHTML={{
                  __html: targetPage.content
                    ? renderedBodyHtml
                    : '<span class="text-zinc-400 font-normal">Type page content (markdown and @tags supported)...</span>',
                }}
              />
            </div>
          )}
        </div>

        {/* Entity Version History Inner Rectangle (ONLY for Entity Pages) */}
        {targetPage.type === 'entity' && (
          <div
            data-entity-version-container="true"
            onClick={(e) => {
              const targetEl = e.target as HTMLElement;
              const isGutter = handleGutterRangeClick(targetEl, e.currentTarget.parentElement || e.currentTarget, e.shiftKey);
              if (isGutter) {
                e.stopPropagation();
              }
            }}
            onMouseDown={(e) => {
              handleGutterMouseDown(e, e.currentTarget.parentElement || e.currentTarget);
            }}
            className="mt-1 bg-zinc-100/90 border border-zinc-200/90 rounded-2xl p-4 md:p-5 flex flex-col gap-3 shadow-2xs select-text shrink-0 w-full notehook-markdown-block relative"
          >
            <div
              className="notehook-gutter-handle"
              title="Select markdown block"
              onMouseDown={(e) => e.preventDefault()}
              data-block-index="entity-version"
              style={{ top: '1.25rem' }}
            >
              <button
                type="button"
                className="notehook-gutter-btn"
                title="Select markdown block"
                onMouseDown={(e) => e.preventDefault()}
                data-block-id="block-entity-version"
              >
                <svg className="w-4.5 h-4.5 square-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>
                <svg className="w-4.5 h-4.5 check-square-icon hidden fill-indigo-50 text-indigo-600" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="m9 12 2 2 4-4" /></svg>
              </button>
            </div>
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-zinc-200/80 select-none shrink-0">
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-purple-600" />
                <span className="text-xs font-bold text-zinc-900 tracking-tight">Entity Version History</span>
              </div>

              <div className="flex items-center gap-1.5">
                <div className="relative flex items-center">
                  <select
                    id="entity-version-select"
                    value={selectedVersionId || activeVersion?.id}
                    onChange={(e) => {
                      if (e.target.value === 'CREATE_NEW_VERSION') {
                        handleCreateNewVersion();
                      } else {
                        setSelectedVersionId(e.target.value);
                      }
                    }}
                    className="appearance-none text-xs font-semibold bg-white text-zinc-900 border border-zinc-300 rounded-lg pl-3 pr-8 py-1 focus:outline-none focus:ring-1 focus:ring-zinc-900 shadow-2xs cursor-pointer max-w-[280px] truncate"
                  >
                    <option value="CREATE_NEW_VERSION" className="font-bold text-indigo-600 bg-indigo-50">
                      + New Version
                    </option>
                    {dropdownOptions.map((opt) => (
                      <option key={opt.version.id} value={opt.version.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-500 absolute right-2.5 pointer-events-none" />
                </div>

                {activeVersion && (
                  <>
                    {/* Fillable Purple Bookmark Icon to set/indicate Primary Version */}
                    <button
                      type="button"
                      onClick={() => {
                        if (activeVersion.id !== canonicalVersionId) {
                          setCanonicalVersion(targetPage.id, activeVersion.id);
                        }
                      }}
                      className={`p-1.5 rounded-lg border transition-all ${activeVersion.id === canonicalVersionId
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-2xs cursor-default'
                        : 'bg-white border-zinc-200 text-zinc-400 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50/50 cursor-pointer'
                        }`}
                      title={
                        activeVersion.id === canonicalVersionId
                          ? 'Primary Version (Current)'
                          : 'Mark as Primary Version'
                      }
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${activeVersion.id === canonicalVersionId ? 'fill-indigo-600 text-indigo-600' : 'text-zinc-400'
                          }`}
                      />
                    </button>

                    {/* Delete Version Button (Disabled/Grayed out for Primary Version) */}
                    {activeVersion.id === canonicalVersionId ? (
                      <button
                        type="button"
                        disabled
                        className="p-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-300 cursor-not-allowed opacity-60"
                        title="Cannot delete primary version"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-zinc-300" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          deleteEntityVersion(targetPage.id, activeVersion.id);
                          const remaining = allEntityVersions.filter((v) => v.id !== activeVersion.id);
                          const nextSelected = remaining.find((v) => v.id === canonicalVersionId) || remaining[remaining.length - 1];
                          if (nextSelected) {
                            setSelectedVersionId(nextSelected.id);
                          }
                        }}
                        className="p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:text-red-600 hover:border-red-200 hover:bg-red-50/50 transition-all cursor-pointer"
                        title="Delete version"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Selected Version Body Display (Editable inside light gray page canvas) */}
            <div className="flex-1 flex flex-col gap-2 pt-1">
              {activeVersion ? (
                <div className="space-y-3">
                  {/* Version Title Header (No horizontal border line) */}
                  <div className="flex items-center justify-between gap-2 pb-1 notehook-markdown-block relative">
                    <div
                      className="notehook-gutter-handle"
                      title="Select markdown block"
                      onMouseDown={(e) => e.preventDefault()}
                      data-block-index="version-title"
                      style={{ top: '0.15rem' }}
                    >
                      <button
                        type="button"
                        className="notehook-gutter-btn"
                        title="Select markdown block"
                        onMouseDown={(e) => e.preventDefault()}
                        data-block-id="block-version-title"
                      >
                        <svg className="w-4.5 h-4.5 square-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>
                        <svg className="w-4.5 h-4.5 check-square-icon hidden fill-indigo-50 text-indigo-600" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="m9 12 2 2 4-4" /></svg>
                      </button>
                    </div>
                    <input
                      type="text"
                      data-title-input
                      value={activeVersion.title}
                      onChange={(e) => handleVersionTitleChange(e.target.value)}
                      onFocus={(e) => {
                        if (e.target.selectionStart === 0 && e.target.selectionEnd === 0 && activeVersion.title.length > 0) {
                          e.target.setSelectionRange(activeVersion.title.length, activeVersion.title.length);
                        }
                      }}
                      className="version-title-input text-sm md:text-base font-extrabold text-zinc-950 bg-transparent border-0 outline-none focus:outline-none ring-0 w-full p-0 m-0 tracking-tight"
                      placeholder="Version title..."
                    />
                    <span className="text-[10px] text-zinc-400 font-normal shrink-0 select-none">
                      {activeVersion.created_at ? new Date(activeVersion.created_at).toLocaleString() : ''}
                    </span>
                  </div>

                  {/* Version Content Display (Inline pills with hover to untruncate / Edit toggle) */}
                  {/* Stable min-h container — both edit and view modes share this so toggling between
                      them never shifts the layout. The textarea grows beyond 140px when content is long,
                      but that's additive (not a jump) because the initial floor is identical. */}
                  <div className="relative min-h-[140px]">
                    {isEditingVersionBody ? (
                      <>
                        {isTypingAtVersion && versionSuggestions.length > 0 && (
                          <div
                            className="absolute z-50 transition-all duration-75 ease-out"
                            style={{
                              top: `${getCursorCoords(versionContentRef.current, activeVersionText, versionCursorPos).top}px`,
                              left: `${getCursorCoords(versionContentRef.current, activeVersionText, versionCursorPos).left}px`,
                            }}
                          >
                            <SuggestionList
                              items={versionSuggestions}
                              selectedIndex={versionSelectedIndex}
                              onSelect={insertVersionSuggestion}
                            />
                          </div>
                        )}
                        <textarea
                          ref={versionContentRef}
                          value={activeVersion.content}
                          onPaste={(e) =>
                            handleMarkdownPaste(
                              e,
                              activeVersionText,
                              (t) => handleVersionContentChange(t),
                              setVersionCursorPos
                            )
                          }
                          onChange={(e) => {
                            const val = e.target.value;
                            const cur = e.target.selectionStart ?? val.length;
                            handleVersionContentChange(val);
                            setVersionCursorPos(cur);
                            setIsVersionDismissed(false);
                            autoResizeTextarea(e.target, 140);
                          }}
                          onFocus={(e) => {
                            if (e.target.selectionStart === 0 && e.target.selectionEnd === 0 && activeVersionText.length > 0) {
                              e.target.setSelectionRange(activeVersionText.length, activeVersionText.length);
                            }
                            setVersionCursorPos(e.target.selectionStart ?? activeVersionText.length);
                            autoResizeTextarea(e.target, 140);
                          }}
                          onKeyUp={(e) => setVersionCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? activeVersionText.length)}
                          onClick={(e) => setVersionCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? activeVersionText.length)}
                          onSelect={(e) => setVersionCursorPos((e.target as HTMLTextAreaElement).selectionStart ?? activeVersionText.length)}
                          onBlur={() => {
                            setTimeout(() => {
                              if (document.activeElement === versionContentRef.current) return;
                              if (document.activeElement === contentRef.current) return;
                              setIsEditingVersionBody(false);
                              setIsEditing(false);
                            }, 150);
                          }}
                          onKeyDown={(e) => {
                            if (isTypingAtVersion && versionSuggestions.length > 0) {
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setVersionSelectedIndex((prev) => (prev + 1) % versionSuggestions.length);
                                return;
                              }
                              if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setVersionSelectedIndex((prev) => (prev - 1 + versionSuggestions.length) % versionSuggestions.length);
                                return;
                              }
                              if (e.key === 'ArrowRight') {
                                e.preventDefault();
                                setIsVersionDismissed(true);
                                return;
                              }
                              if (e.key === 'Enter' || e.key === 'Tab') {
                                e.preventDefault();
                                insertVersionSuggestion(versionSuggestions[versionSelectedIndex] || versionSuggestions[0]);
                                return;
                              }
                              if (e.key === 'Escape') {
                                e.preventDefault();
                                setIsVersionDismissed(true);
                                return;
                              }
                            }
                            if (e.key === 'Escape') {
                              setIsEditingVersionBody(false);
                              setIsEditing(false);
                            }
                          }}
                          placeholder="Type entity version notes (markdown and @tags supported)..."
                          className="w-full min-h-[140px] text-xs md:text-sm text-zinc-900 leading-relaxed font-sans bg-transparent border-0 outline-none focus:outline-none ring-0 shadow-none resize-none p-0 m-0 overflow-hidden"
                        />
                      </>
                    ) : (
                      <div
                        onClick={(e) => {
                          const targetEl = e.target as HTMLElement;
                          const isGutter = handleGutterRangeClick(targetEl, e.currentTarget, e.shiftKey);
                          if (isGutter) {
                            e.stopPropagation();
                            return;
                          }

                          const selection = window.getSelection();
                          if (selection && selection.toString().trim().length > 0) return;

                          if (clearAllGutterSelections()) {
                            return;
                          }

                          const pillTarget = (e.target as HTMLElement).closest('.page-mention-pill, [data-entity], [data-title]') as HTMLElement;
                          if (pillTarget) {
                            e.stopPropagation();
                            const matchedPage = findPageForPill(pillTarget, pages);
                            if (matchedPage) {
                              const displayTitle = matchedPage.type === 'entity' ? `@${matchedPage.title}` : matchedPage.title;
                              const targetSpan = pillTarget.getAttribute('data-full') || pillTarget.getAttribute('data-title') || pillTarget.getAttribute('data-short-id') || pillTarget.textContent?.trim();
                              openInPane2(matchedPage.type as any, matchedPage.id, displayTitle, targetSpan);
                              return;
                            }
                            return;
                          }

                          const targetOffset = getCaretOffsetFromPoint(e.currentTarget, e.clientX, e.clientY, activeVersionText);
                          const scrollContainer = pageViewContainerRef.current;
                          const currentScroll = scrollContainer?.scrollTop ?? 0;
                          savedScrollTopRef.current = currentScroll;
                          setIsEditingVersionBody(true);
                          setIsEditing(true);
                          setTimeout(() => {
                            if (versionContentRef.current) {
                              autoResizeTextarea(versionContentRef.current, 140);
                              versionContentRef.current.focus({ preventScroll: true });
                              versionContentRef.current.setSelectionRange(targetOffset, targetOffset);
                              setVersionCursorPos(targetOffset);
                            }
                            if (scrollContainer) {
                              scrollContainer.scrollTop = currentScroll;
                            }
                          }, 0);
                        }}
                        onMouseDown={(e) => {
                          handleGutterMouseDown(e, e.currentTarget);
                        }}
                        className="cursor-text w-full h-full min-h-[140px]"
                        title="Click anywhere on the document to edit version body"
                      >
                        <div
                          className="text-xs md:text-sm text-zinc-900 leading-relaxed font-normal bg-transparent"
                          dangerouslySetInnerHTML={{
                            __html: activeVersion.content
                              ? convertNotehookTextToHtml(activeVersion.content, 'auto', pages)
                              : '<span class="text-zinc-400 font-normal">Type page content (markdown and @tags supported)...</span>',
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Extra Bottom Margin Spacer for comfortable reading, scrolling, and clicking to focus */}
        <div
          onClick={(e) => {
            if (!isEditing && !isEditingPrompt && !isEditingVersionBody) {
              handleCanvasClick(e);
            } else if (contentRef.current) {
              contentRef.current.focus();
              const len = contentRef.current.value.length;
              contentRef.current.setSelectionRange(len, len);
            }
          }}
          className="w-full h-48 md:h-64 shrink-0 cursor-text select-none"
          title={isEditing ? 'Bottom margin' : 'Click anywhere on the document to edit'}
        />
      </div>

      {/* Sticky Bottom Full-Width Collapsible Mentions Panel (Max 30% Pane Height) */}
      {backlinkedPages.length > 0 && (
        <div
          data-mentions-feed="true"
          className="border-t border-zinc-200 bg-zinc-50/95 backdrop-blur-xs shrink-0 w-full rounded-none flex flex-col z-20 shadow-xs max-h-[30%] transition-all"
        >
          {/* Collapsible Header Bar */}
          <button
            type="button"
            onClick={() => setIsMentionsCollapsed((prev) => !prev)}
            className="flex items-center justify-between w-full px-4 md:px-6 py-2 hover:bg-zinc-100/80 transition-colors select-none cursor-pointer border-b border-zinc-200/50 shrink-0"
            title={isMentionsCollapsed ? 'Expand mentions' : 'Collapse mentions'}
          >
            <div className="flex items-center gap-2 text-xs font-bold text-zinc-800 tracking-tight">
              <span>Mentions ({backlinkedPages.length})</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-400 hover:text-zinc-700">
              <span className="text-[10px] font-medium text-zinc-500">
                {isMentionsCollapsed ? 'Show' : 'Hide'}
              </span>
              {isMentionsCollapsed ? (
                <ChevronUp className="w-3.5 h-3.5 text-zinc-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
              )}
            </div>
          </button>

          {/* Scrollable Mentions List */}
          {!isMentionsCollapsed && (
            <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-6 py-2.5 space-y-2">
              {backlinkedPages.map((bp) => {
                const snippets = getMentionSnippetsForPage(bp, targetPage.title, targetPage.short_id);

                const getSourcePageIcon = () => {
                  if (bp.type === 'note') return <FileText className="h-3.5 w-3.5 text-red-600 shrink-0" />;
                  if (bp.type === 'todo') {
                    return bp.done ? (
                      <CheckSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    ) : (
                      <Square className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    );
                  }
                  if (bp.type === 'decision') return <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
                  if (bp.type === 'entity') return <Tag className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
                  return <MessageSquare className="h-3.5 w-3.5 text-sky-600 shrink-0" />;
                };

                return (
                  <div
                    key={bp.id}
                    onClick={() => handleMentionClick(bp)}
                    className="mentions-card-container group border border-zinc-200/90 bg-white hover:border-zinc-300 rounded-xl p-3 shadow-2xs hover:shadow-xs transition-all cursor-pointer space-y-1"
                    title={bp.type === 'message' ? 'Scroll to chat message' : 'Navigate to source page'}
                  >
                    {/* Source Page Title Header */}
                    <div className="flex items-center justify-between gap-2 font-bold text-zinc-900 text-xs">
                      <div className="flex items-center gap-2 truncate min-w-0 flex-1">
                        {getSourcePageIcon()}
                        <span className="truncate group-hover:text-zinc-950 transition-colors">{bp.title}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {bp.short_id && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyShortId(bp.short_id!);
                            }}
                            className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-mono font-medium bg-zinc-100/90 text-zinc-600 hover:text-zinc-950 border border-zinc-200/90 hover:border-zinc-300 hover:bg-zinc-200/70 transition-all shadow-2xs cursor-pointer select-none"
                            title="Copy id"
                          >
                            {copiedShortId === bp.short_id ? (
                              <>
                                <Check className="w-2.5 h-2.5 text-emerald-600" />
                                <span className="text-emerald-700 font-sans font-semibold text-[10px]">Copied!</span>
                              </>
                            ) : (
                              <span>[@{bp.short_id}]</span>
                            )}
                          </button>
                        )}
                        <span className="text-[10px] text-zinc-400 font-normal">
                          {bp.created_at ? new Date(bp.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                    </div>

                    {/* Mention Excerpt Snippet */}
                    <div className="mentions-panel-excerpt space-y-1 text-xs text-zinc-600 leading-relaxed font-sans pl-5.5 font-normal">
                      {snippets.length !== 0 && (
                        snippets.map((snippetText, sIdx) => (
                          <div key={sIdx}>
                            <MentionHighlightedText text={snippetText} targetTitle={targetPage.title} />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

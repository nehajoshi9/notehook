'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePlanet } from '@/lib/context';
import { AlertTriangle } from 'lucide-react';
import { getRankedSuggestions, SuggestionItem } from '@/lib/ranking';
import { SuggestionList } from '@/components/ai/suggestion-list';
import { parseScribeMarkup, formatItemTitle, untagReferences, domToMarkdown, cleanMarkdownSpacing, clearAllGutterSelections } from '@/lib/scribe-parser';
import { matchesExplicitReference } from '@/lib/mentions';
import { Page } from '@/lib/types';

function getTextareaSelectionCoords(
  element: HTMLTextAreaElement | HTMLInputElement,
  position: number,
  isTopStart: boolean = false
): { top: number; left: number } {
  try {
    const style = window.getComputedStyle(element);
    let mirror = document.getElementById('textarea-selection-end-mirror') as HTMLDivElement | null;
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.id = 'textarea-selection-end-mirror';
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

    const propsToCopy = [
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
      'paddingTop',
      'paddingRight',
      'paddingBottom',
      'paddingLeft',
      'fontStyle',
      'fontVariant',
      'fontWeight',
      'fontStretch',
      'fontSize',
      'lineHeight',
      'fontFamily',
      'textAlign',
      'textTransform',
      'textIndent',
      'letterSpacing',
      'wordSpacing',
      'tabSize',
    ] as const;

    propsToCopy.forEach((prop) => {
      // @ts-ignore
      mirror!.style[prop] = style[prop];
    });

    mirror.style.width = `${element.clientWidth}px`;
    const textVal = element.value || '';
    const textBefore = textVal.slice(0, position);
    mirror.textContent = textBefore;

    const span = document.createElement('span');
    span.textContent = textVal.slice(position) || '.';
    mirror.appendChild(span);

    const fontSize = parseFloat(style.fontSize) || 14;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.5;

    const lineY = isTopStart ? span.offsetTop : span.offsetTop + lineHeight;
    const lineLeft = span.offsetLeft;

    const rect = element.getBoundingClientRect();
    const offsetTop = isTopStart ? -6 : 6;
    const top = rect.top + window.scrollY + lineY - element.scrollTop + offsetTop;
    const left = Math.max(10, Math.min(rect.left + window.scrollX + lineLeft, typeof window !== 'undefined' ? window.innerWidth - 270 : 1000));

    return { top, left };
  } catch (e) {
    const rect = element.getBoundingClientRect();
    return {
      top: (isTopStart ? rect.top : rect.bottom) + window.scrollY + (isTopStart ? -6 : 6),
      left: Math.max(10, rect.left + window.scrollX + 20),
    };
  }
}

interface FloatingSelectionToolbarProps {
  noteId?: string;
}

export const FloatingSelectionToolbar: React.FC<FloatingSelectionToolbarProps> = ({ noteId }) => {
  const {
    pages,
    mentions,
    addManualMention,
    createEntityPage,
    createNotePage,
    createTodoPage,
    createDecisionPage,
    updatePageContent,
    updatePageUserPrompt,
    addEntityVersion,
    openInPane2,
  } = usePlanet();

  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [hasReferenceError, setHasReferenceError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [allAvailableEntities, setAllAvailableEntities] = useState<{ entity: Page; nextVer: number }[]>([]);
  const [detectedSourcePageId, setDetectedSourcePageId] = useState<string | undefined>(undefined);
  const detectedSourcePageIdRef = useRef<string | undefined>(undefined);
  const pagesRef = useRef<Page[]>(pages);
  pagesRef.current = pages;
  const [isChatAreaSelection, setIsChatAreaSelection] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedIndex(0);
  }, [selectedText]);

  // Compute next version number for an entity page (e.g., v5 if 4 versions exist)
  const getNextEntityVersionNum = (entity: Page): number => {
    return (entity.current_version_num || entity.versions?.length || 0) + 1;
  };

  useEffect(() => {
    let debounceTimer: NodeJS.Timeout | null = null;

    const checkSelection = (e?: Event) => {
      // Prevent toolbar from closing or resetting when user clicks options inside containerRef
      if (e && containerRef.current && e.target && containerRef.current.contains(e.target as Node)) {
        return;
      }
      if (containerRef.current && document.activeElement && containerRef.current.contains(document.activeElement)) {
        return;
      }

      const activeEl = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
      let isTextareaOrInput = false;
      let selectedTextStr = '';
      let rect: DOMRect | null = null;
      let range: Range | null = null;
      let scopeText = '';
      let foundPageId: string | undefined = undefined;
      let foundCurrentPage: Page | null = null;
      let isChatArea = false;
      let top = 0;
      let left = 0;

      // Exclude selections inside page titles or entity version titles
      if (activeEl && activeEl.closest('h1, [data-title-input], .page-title, .version-title-input, [data-title]')) {
        setPosition(null);
        setSelectedText('');
        setHasReferenceError(false);
        setAllAvailableEntities([]);
        return;
      }

      // 0. Check if user selected text via gutter handles (.scribe-markdown-block.is-block-selected)
      const selectedGutterBlocks = Array.from(
        document.querySelectorAll<HTMLElement>('.scribe-markdown-block.is-block-selected')
      );
      const isGutterSelection = selectedGutterBlocks.length > 0;

      if (isGutterSelection) {
        const textToCopy = selectedGutterBlocks
          .map((b) => domToMarkdown(b))
          .join('\n\n');
        selectedTextStr = cleanMarkdownSpacing(textToCopy);

        if (!selectedTextStr) {
          setPosition(null);
          setSelectedText('');
          setHasReferenceError(false);
          setAllAvailableEntities([]);
          return;
        }

        const firstBlock = selectedGutterBlocks[0];
        const lastBlock = selectedGutterBlocks[selectedGutterBlocks.length - 1];
        const firstRect = firstBlock.getBoundingClientRect();
        const lastRect = lastBlock.getBoundingClientRect();

        rect = {
          top: Math.min(firstRect.top, lastRect.top),
          bottom: Math.max(firstRect.bottom, lastRect.bottom),
          left: Math.min(firstRect.left, lastRect.left),
          right: Math.max(firstRect.right, lastRect.right),
          width: Math.max(firstRect.width, lastRect.width),
          height: Math.max(firstRect.bottom, lastRect.bottom) - Math.min(firstRect.top, lastRect.top),
        } as DOMRect;

        const isStartInChat = Boolean(firstBlock.closest('[data-chat-thread], [data-message-id]'));
        if (isStartInChat) {
          isChatArea = true;
          const startTurnEl = firstBlock.closest('[data-message-id]');
          const msgId = startTurnEl?.getAttribute('data-message-id') || startTurnEl?.id.replace(/^page-/, '');
          foundPageId = msgId || undefined;
          const msgNote = pages.find((p) => p.id === msgId);
          if (msgNote) {
            scopeText = `${msgNote.user_prompt || ''} ${msgNote.content || ''}`;
          } else {
            scopeText = startTurnEl?.textContent || '';
          }

          top = firstRect.top + window.scrollY - 8;
          left = Math.max(10, Math.min(firstRect.left + window.scrollX + 28, window.innerWidth - 270));
        } else {
          const pageCardEl = firstBlock.closest('[data-page-id]');
          if (pageCardEl) {
            const pId = pageCardEl.getAttribute('data-page-id');
            foundPageId = pId || undefined;
            foundCurrentPage = pages.find((p) => p.id === pId) || null;
            if (foundCurrentPage) {
              scopeText = `${foundCurrentPage.title} ${foundCurrentPage.content || ''} ${foundCurrentPage.user_prompt || ''}`;
            }
          }
          top = lastRect.bottom + window.scrollY + 8;
          left = Math.max(10, Math.min(lastRect.left + window.scrollX + 28, window.innerWidth - 270));
        }
      }

      // 1. Check if user is selecting text inside an active <textarea> or <input> (Edit Mode)
      if (!isGutterSelection && activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== null && end !== null && start !== end) {
          isTextareaOrInput = true;
          selectedTextStr = activeEl.value.slice(start, end).trim();
          rect = activeEl.getBoundingClientRect();

          const isChatInput = Boolean(activeEl.closest('#chat-input-form, [data-chat-input]'));
          if (isChatInput) {
            isChatArea = true;
            scopeText = activeEl.value;
          } else {
            const pageCardEl = activeEl.closest('[data-page-id]');
            if (pageCardEl) {
              const pId = pageCardEl.getAttribute('data-page-id');
              foundPageId = pId || undefined;
              foundCurrentPage = pages.find((p) => p.id === pId) || null;
              if (foundCurrentPage) {
                scopeText = `${foundCurrentPage.title} ${foundCurrentPage.content || ''} ${foundCurrentPage.user_prompt || ''}`;
              }
            } else {
              scopeText = activeEl.value;
            }
          }
        }
      }

      // 2. Check standard DOM window selection (Non-Edit Mode or rendered text)
      if (!isGutterSelection && !isTextareaOrInput) {
        const selection = window.getSelection();
        if (!selection || selection.isCollapsed || !selection.toString().trim()) {
          setPosition(null);
          setSelectedText('');
          setHasReferenceError(false);
          setAllAvailableEntities([]);
          return;
        }

        const anchorNode = selection.anchorNode;
        const parentEl = anchorNode?.nodeType === 1 ? (anchorNode as HTMLElement) : anchorNode?.parentElement;
        if (parentEl && parentEl.closest('h1, [data-title-input], .page-title, .version-title-input, [data-title]')) {
          setPosition(null);
          setSelectedText('');
          setHasReferenceError(false);
          setAllAvailableEntities([]);
          return;
        }

        selectedTextStr = selection.toString().trim();
        if (!selectedTextStr) {
          setPosition(null);
          setSelectedText('');
          setHasReferenceError(false);
          setAllAvailableEntities([]);
          return;
        }

        if (anchorNode && containerRef.current && containerRef.current.contains(anchorNode)) {
          return;
        }

        range = selection.getRangeAt(0);
        rect = range.getBoundingClientRect();

        const clonedFragment = range.cloneContents();
        const mdText = cleanMarkdownSpacing(domToMarkdown(clonedFragment));
        if (mdText) {
          selectedTextStr = mdText;
        }

        const startNode = range.startContainer;
        const endNode = range.endContainer;
        const startEl = (startNode.nodeType === 1 ? startNode : startNode.parentElement) as HTMLElement | null;
        const endEl = (endNode.nodeType === 1 ? endNode : endNode.parentElement) as HTMLElement | null;

        const isStartInChat = Boolean(startEl?.closest('[data-chat-thread], [data-message-id]'));
        const isEndInChat = Boolean(endEl?.closest('[data-chat-thread], [data-message-id]'));

        if (isStartInChat || isEndInChat) {
          const startTurnEl = startEl?.closest('[data-message-id]');
          const endTurnEl = endEl?.closest('[data-message-id]');

          // DISALLOW selection across different conversation turns or spanning outside chat
          if (!startTurnEl || !endTurnEl || startTurnEl !== endTurnEl) {
            setPosition(null);
            setSelectedText('');
            setHasReferenceError(false);
            setAllAvailableEntities([]);
            return;
          }

          isChatArea = true;
          const msgId = startTurnEl.getAttribute('data-message-id') || startTurnEl.id.replace(/^page-/, '');
          foundPageId = msgId;
          const msgNote = pages.find((p) => p.id === msgId);
          if (msgNote) {
            scopeText = `${msgNote.user_prompt || ''} ${msgNote.content || ''}`;
          } else {
            scopeText = startTurnEl.textContent || '';
          }
        } else {
          const pageCardEl = parentEl?.closest('[data-page-id]');
          if (pageCardEl) {
            const pId = pageCardEl.getAttribute('data-page-id');
            foundPageId = pId || undefined;
            foundCurrentPage = pages.find((p) => p.id === pId) || null;
            if (foundCurrentPage) {
              scopeText = `${foundCurrentPage.title} ${foundCurrentPage.content || ''} ${foundCurrentPage.user_prompt || ''}`;
            }
          }
        }

        // Clean up selected text string to ignore metadata (View as Page, View in Chat, timestamps)
        selectedTextStr = selection.toString().trim();

        // Untruncate any truncated mention pills in selection under the hood
        if (range) {
          const commonAncestor = range.commonAncestorContainer;
          const containerEl = (commonAncestor.nodeType === 1 ? commonAncestor : commonAncestor.parentElement) as HTMLElement | null;

          if (containerEl) {
            const pillEls = Array.from(containerEl.querySelectorAll('.page-mention-pill')) as HTMLElement[];
            const parentPill = containerEl.closest('.page-mention-pill') as HTMLElement | null;
            if (parentPill && !pillEls.includes(parentPill)) {
              pillEls.push(parentPill);
            }

            pillEls.forEach((pill) => {
              const fullTitle = pill.getAttribute('data-full') || pill.getAttribute('data-entity');
              const shortEl = pill.querySelector('.pill-short');
              const shortText = shortEl?.textContent?.trim();

              const dataType = pill.getAttribute('data-type');
              if (fullTitle && shortText) {
                if (selectedTextStr.includes(shortText)) {
                  let fullTag = `[@${fullTitle}]`;
                  if (dataType === 'todo' || shortText.startsWith('@todo:')) fullTag = `[@todo: ${fullTitle}]`;
                  else if (dataType === 'decision' || shortText.startsWith('@decision:')) fullTag = `[@decision: ${fullTitle}]`;
                  else if (dataType === 'note' || shortText.startsWith('@note:')) fullTag = `[@note: ${fullTitle}]`;

                  selectedTextStr = selectedTextStr.replace(shortText, fullTag);
                }
              }
            });
          }
        }

        selectedTextStr = selectedTextStr
          .replace(/\bView (?:as Page|in Chat)\b/gi, '')
          .replace(/\b\d{1,2}:\d{2}(?:\s*(?:[AP]M|am|pm))?\b/gi, '')
          .replace(/\n\s*\n/g, '\n')
          .trim();

        if (!selectedTextStr) {
          setPosition(null);
          setSelectedText('');
          setHasReferenceError(false);
          setAllAvailableEntities([]);
          return;
        }
      }

      if (!selectedTextStr || !rect || (rect.width === 0 && rect.height === 0)) {
        setPosition(null);
        setSelectedText('');
        setHasReferenceError(false);
        setAllAvailableEntities([]);
        return;
      }

      // 3. Fast check if selected text or DOM range contains existing references
      let containsRef = false;
      if (/\[@|@todo:|@decision:|@note:/i.test(selectedTextStr)) {
        containsRef = true;
      }

      if (!containsRef && isGutterSelection) {
        if (selectedGutterBlocks.some((b) => b.querySelector('.page-mention-pill, [data-type], [data-entity], [data-title]'))) {
          containsRef = true;
        }
      }

      if (!containsRef && range) {
        const startEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement) as HTMLElement | null;
        const endEl = (range.endContainer.nodeType === 1 ? range.endContainer : range.endContainer.parentElement) as HTMLElement | null;

        if (startEl?.closest('.page-mention-pill, [data-type], [data-entity], [data-title]') ||
            endEl?.closest('.page-mention-pill, [data-type], [data-entity], [data-title]')) {
          containsRef = true;
        }
      }

      // STRICT SCOPING: Evaluate ONLY entities mentioned in the relevant scope
      const allEntityPages = pages.filter((p) => p.type === 'entity');
      const matchedEntities: Page[] = [];

      if (foundCurrentPage && foundCurrentPage.type === 'entity') {
        matchedEntities.push(foundCurrentPage);
      }

      const scopePageId = foundCurrentPage?.id || foundPageId;
      if (scopePageId) {
        mentions.forEach((m) => {
          if (m.source_page_id === scopePageId && !m.orphaned) {
            const targetEntity = allEntityPages.find((e) => e.id === m.target_page_id);
            if (targetEntity && !matchedEntities.some((me) => me.id === targetEntity.id)) {
              matchedEntities.push(targetEntity);
            }
          } else if (m.target_page_id === scopePageId && !m.orphaned) {
            const sourceEntity = allEntityPages.find((e) => e.id === m.source_page_id);
            if (sourceEntity && !matchedEntities.some((me) => me.id === sourceEntity.id)) {
              matchedEntities.push(sourceEntity);
            }
          }
        });
      }

      if (scopeText) {
        const lowerScope = scopeText.toLowerCase();
        allEntityPages.forEach((entity) => {
          if (matchedEntities.some((m) => m.id === entity.id)) return;
          const titleLower = entity.title.toLowerCase().trim();
          if (!titleLower) return;

          if (
            lowerScope.includes(`[@${titleLower}]`) ||
            lowerScope.includes(`[@${titleLower}:`) ||
            lowerScope.includes(`@${titleLower}`) ||
            matchesExplicitReference(scopeText, entity.title)
          ) {
            matchedEntities.push(entity);
          }
        });
      }

      const entitiesWithVersions = matchedEntities.map((entity) => ({
        entity,
        nextVer: getNextEntityVersionNum(entity),
      }));

      if (!isGutterSelection) {
        if (isTextareaOrInput && activeEl) {
          if (isChatArea) {
            const selStart = Math.min(activeEl.selectionStart || 0, activeEl.selectionEnd || 0);
            const coords = getTextareaSelectionCoords(activeEl, selStart, true);
            top = coords.top;
            left = coords.left;
          } else {
            const selEnd = Math.max(activeEl.selectionStart || 0, activeEl.selectionEnd || 0);
            const coords = getTextareaSelectionCoords(activeEl, selEnd, false);
            top = coords.top;
            left = coords.left;
          }
        } else if (range) {
          if (isChatArea) {
            // Chat View Selection: Position ABOVE topmost line & follow X location of FIRST character
            try {
              const startRange = range.cloneRange();
              startRange.collapse(true);
              const startRect = startRange.getBoundingClientRect();

              const rects = range.getClientRects();
              let topY = startRect.top > 0 ? startRect.top : rect.top;
              if (rects && rects.length > 0) {
                topY = rects[0].top;
              }

              top = topY + window.scrollY - 6;
              const startX = startRect.width > 0 ? startRect.left : (startRect.left > 0 ? startRect.left : rect.left);
              left = Math.max(10, Math.min(startX + window.scrollX, window.innerWidth - 270));
            } catch (e) {
              top = rect.top + window.scrollY - 6;
              left = Math.max(10, rect.left + window.scrollX);
            }
          } else {
            // Page View (Non-Chat): Position BELOW bottom-most line & follow X location of LAST character
            try {
              const endRange = range.cloneRange();
              endRange.collapse(false);
              const endRect = endRange.getBoundingClientRect();

              const rects = range.getClientRects();
              let bottomY = rect.bottom;
              if (rects && rects.length > 0) {
                let bottomMostLineRect = rects[0];
                for (let i = 1; i < rects.length; i++) {
                  if (rects[i].bottom > bottomMostLineRect.bottom) {
                    bottomMostLineRect = rects[i];
                  }
                }
                bottomY = bottomMostLineRect.bottom;
              } else if (endRect.bottom > 0) {
                bottomY = endRect.bottom;
              }

              top = bottomY + window.scrollY + 6;
              const endX = endRect.width > 0 ? endRect.right : (endRect.left > 0 ? endRect.left : rect.left);
              left = Math.max(10, Math.min(endX + window.scrollX, window.innerWidth - 270));
            } catch (e) {
              top = rect.bottom + window.scrollY + 6;
              left = Math.max(10, rect.left + window.scrollX);
            }
          }
        } else {
          top = (isChatArea ? rect.top : rect.bottom) + window.scrollY + (isChatArea ? -6 : 6);
          left = Math.max(10, rect.left + window.scrollX);
        }
      }

      setSelectedText(selectedTextStr);
      setHasReferenceError(containsRef);
      detectedSourcePageIdRef.current = foundPageId;
      setDetectedSourcePageId(foundPageId);
      setIsChatAreaSelection(isChatArea);
      setAllAvailableEntities(entitiesWithVersions);
      setPosition({
        top: Math.max(10, top),
        left: Math.max(10, left),
      });
    };

    let rafId: number | null = null;

    const handleEvent = (e?: Event) => {
      if (e && containerRef.current && e.target && containerRef.current.contains(e.target as Node)) {
        return;
      }
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        checkSelection(e);
        rafId = null;
      });
    };

    document.addEventListener('selectionchange', handleEvent);
    document.addEventListener('select', handleEvent, true);
    document.addEventListener('mouseup', handleEvent, true);
    document.addEventListener('keyup', handleEvent, true);
    window.addEventListener('gutter-selection-change', handleEvent);
    window.addEventListener('scroll', handleEvent, true);
    window.addEventListener('resize', handleEvent, true);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      document.removeEventListener('selectionchange', handleEvent);
      document.removeEventListener('select', handleEvent, true);
      document.removeEventListener('mouseup', handleEvent, true);
      document.removeEventListener('keyup', handleEvent, true);
      window.removeEventListener('gutter-selection-change', handleEvent);
      window.removeEventListener('scroll', handleEvent, true);
      window.removeEventListener('resize', handleEvent, true);
    };
  }, [pages, mentions]);

  // Construct "Save as [@EntityName]" options with caption `v5` ONLY for entities strictly in scope
  const saveAsEntityItems: SuggestionItem[] = allAvailableEntities.map(({ entity, nextVer }) => ({
    id: `save-as-entity-${entity.id}`,
    title: `Save as [@${entity.title}]`,
    type: 'page',
    itemType: 'entity',
    description: `Save selected text into @${entity.title}`,
    score: 1000,
    scopeLabel: `v${nextVer}`,
    pageId: entity.id,
    shortId: entity.short_id,
  }));

  const copyToNewNoteItem: SuggestionItem = {
    id: 'copy-to-new-note',
    title: 'Copy to New Note',
    type: 'page',
    itemType: 'note',
    primitiveType: 'note' as any,
    description: 'Create a new note with selected text as body',
    score: 950,
    scopeLabel: 'Note',
  };

  const baseSuggestions = (!hasReferenceError && selectedText)
    ? getRankedSuggestions(selectedText, pages, null).filter(
        (b) => !b.id.startsWith('create-note-') && b.id !== 'primitive-note'
      )
    : [];

  const suggestions: SuggestionItem[] = selectedText
    ? (hasReferenceError
        ? [...saveAsEntityItems, copyToNewNoteItem]
        : [
            ...saveAsEntityItems,
            copyToNewNoteItem,
            ...baseSuggestions.filter(
              (b) => !saveAsEntityItems.some((s) => s.pageId === b.pageId) && !b.id.startsWith('create-note-') && b.id !== 'primitive-note'
            ),
          ])
    : [];

  const showReferenceError = hasReferenceError && suggestions.length === 0;

  const handleSelectSuggestion = (item: SuggestionItem) => {
    if (!selectedText) return;

    if (item.id === 'copy-to-new-note') {
      const cleanBodyText = selectedText;
      const untaggedForTitle = untagReferences(cleanBodyText);
      const cleanTitle = formatItemTitle(untaggedForTitle, 45) || 'Untitled Note';
      const sourcePage = detectedSourcePageId ? pages.find((p) => p.id === detectedSourcePageId) : null;
      const sourceTag = sourcePage?.short_id ? `[@${sourcePage.short_id}]` : (sourcePage ? `[@${sourcePage.id}]` : '');
      const noteBody = sourceTag && !cleanBodyText.startsWith(`From ${sourceTag}`)
        ? `From ${sourceTag}:\n${cleanBodyText}`
        : cleanBodyText;
      const newNote = createNotePage(cleanTitle, noteBody);
      openInPane2('note', newNote.id, newNote.title);

      setPosition(null);
      setSelectedText('');
      setHasReferenceError(false);
      setAllAvailableEntities([]);
      window.getSelection()?.removeAllRanges();
      clearAllGutterSelections();
      return;
    }

    let targetTitle = item.title
      .replace(/^Save as \[?@/i, '')
      .replace(/^\[?@(?:todo|decision|note)?:\s*/i, '')
      .replace(/^\[?@/, '')
      .replace(/\]$/, '')
      .trim();

    targetTitle = formatItemTitle(targetTitle || selectedText);

    let createdTagText = `[@${targetTitle}]`;
    const isSaveAsEntity = item.id.startsWith('save-as-entity-') || item.id.includes('save-as');
    let targetEntity = pages.find((p) => p.id === item.pageId || p.title.toLowerCase() === targetTitle.toLowerCase());

    if (isSaveAsEntity && targetEntity) {
      createdTagText = `[@${targetEntity.title}]`;

      // Save selected text snippet into target entity page (manual mention link)
      addManualMention(detectedSourcePageId || noteId || targetEntity.id, targetEntity.title, selectedText);

      // Append/update entity content with selected text snippet
      if (!targetEntity.content) {
        updatePageContent(targetEntity.id, selectedText);
      } else if (!targetEntity.content.includes(selectedText)) {
        updatePageContent(targetEntity.id, `${targetEntity.content}\n\n${selectedText}`);
      }
    } else if (item.primitiveType === 'todo' || item.itemType === 'todo') {
      createdTagText = `[@todo: ${targetTitle}]`;
      createTodoPage(targetTitle, selectedText, noteId);
    } else if (item.primitiveType === 'decision' || item.itemType === 'decision') {
      createdTagText = `[@decision: ${targetTitle}]`;
      createDecisionPage(targetTitle, selectedText, noteId);
    } else {
      const entity = createEntityPage(targetTitle);
      addManualMention(noteId || entity.id, entity.title, selectedText);
    }

    // Only replace selection with a reference pill if creating a new reference tag (NOT when saving content to an entity)
    if (!isSaveAsEntity) {
      const activeEl = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
      if (activeEl && (activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'INPUT')) {
        const start = activeEl.selectionStart;
        const end = activeEl.selectionEnd;
        if (start !== null && end !== null && start !== end) {
          const val = activeEl.value;
          const replacement = createdTagText + ' ';
          const newVal = val.slice(0, start) + replacement + val.slice(end);
          activeEl.value = newVal;

          const newCursor = start + replacement.length;
          activeEl.setSelectionRange(newCursor, newCursor);

          // Dispatch input event to update React state
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
      } else if (detectedSourcePageId) {
        // Replace selection in non-edit mode (rendered DOM selection)
        const sourcePage = pages.find((p) => p.id === detectedSourcePageId);
        if (sourcePage) {
          if (sourcePage.content && sourcePage.content.includes(selectedText)) {
            const updated = sourcePage.content.replace(selectedText, `${createdTagText} `);
            updatePageContent(sourcePage.id, updated);
          } else if (sourcePage.user_prompt && sourcePage.user_prompt.includes(selectedText)) {
            const updated = sourcePage.user_prompt.replace(selectedText, `${createdTagText} `);
            updatePageUserPrompt(sourcePage.id, updated);
          }
        }
      }
    }

    setPosition(null);
    setSelectedText('');
    setHasReferenceError(false);
    setAllAvailableEntities([]);
    window.getSelection()?.removeAllRanges();
    clearAllGutterSelections();
  };

  const [isSelectingText, setIsSelectingText] = useState(false);
  const isMouseDownRef = useRef(false);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        if (containerRef.current && containerRef.current.contains(e.target as Node)) {
          return;
        }
        isMouseDownRef.current = true;
        setIsSelectingText(true);
        document.body.classList.add('is-selecting-text');
      }
    };

    const handleMouseUp = () => {
      isMouseDownRef.current = false;
      setIsSelectingText(false);
      setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || !sel.toString().trim()) {
          document.body.classList.remove('is-selecting-text');
        }
      }, 50);
    };

    const handleCopy = (e: ClipboardEvent) => {
      const selection = window.getSelection();
      const selectedBlocks = Array.from(
        document.querySelectorAll<HTMLElement>('.scribe-markdown-block.is-block-selected')
      );

      let text = '';
      let targetContainer: HTMLElement | null = null;

      if (selectedBlocks.length > 0) {
        text = cleanMarkdownSpacing(selectedBlocks.map((b) => domToMarkdown(b)).join('\n\n'));
        targetContainer = selectedBlocks[0].closest<HTMLElement>('[data-page-id], [data-message-id]');
      } else if (selection && !selection.isCollapsed) {
        const range = selection.getRangeAt(0);
        text = cleanMarkdownSpacing(domToMarkdown(range.cloneContents())) || selection.toString().trim();
        const commonNode = range.commonAncestorContainer;
        const commonEl = commonNode.nodeType === Node.ELEMENT_NODE ? (commonNode as HTMLElement) : commonNode.parentElement;
        targetContainer = commonEl?.closest<HTMLElement>('[data-page-id], [data-message-id]') || null;
      }

      if (!text || !text.trim()) return;

      const pId = targetContainer?.getAttribute('data-page-id') ||
                  targetContainer?.getAttribute('data-message-id') ||
                  detectedSourcePageIdRef.current ||
                  noteId;
      const sourcePage = pId ? pagesRef.current.find((p) => p.id === pId) : null;
      const shortId = targetContainer?.getAttribute('data-page-short-id') ||
                      targetContainer?.getAttribute('data-short-id') ||
                      sourcePage?.short_id;
      const sourceTag = shortId ? `[@${shortId}]` : (sourcePage?.id ? `[@${sourcePage.id}]` : (pId ? `[@${pId}]` : ''));

      if (sourceTag) {
        const prefix = `From ${sourceTag}:`;
        if (!text.startsWith(prefix) && !text.startsWith(`From ${sourceTag}`)) {
          text = `${prefix}\n${text}`;
        }
      }

      if (e.clipboardData) {
        e.clipboardData.setData('text/plain', text);
        e.clipboardData.setData('text/markdown', text);
        e.preventDefault();
      }
    };

    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('copy', handleCopy, true);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('mouseup', handleMouseUp, true);
      document.removeEventListener('copy', handleCopy, true);
    };
  }, []);

  // Keyboard navigation for floating selection toolbar menu
  useEffect(() => {
    if (!position || !selectedText || suggestions.length === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        e.stopPropagation();
        const targetItem = suggestions[selectedIndex] || suggestions[0];
        if (targetItem) {
          handleSelectSuggestion(targetItem);
        }
        return;
      }
      if (e.key === 'Escape' || e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        setPosition(null);
        setSelectedText('');
        setHasReferenceError(false);
        setAllAvailableEntities([]);
        window.getSelection()?.removeAllRanges();
        clearAllGutterSelections();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [position, selectedText, suggestions, selectedIndex, detectedSourcePageId, noteId]);

  if (!position || !selectedText) return null;

  return (
    <div
      ref={containerRef}
      data-floating-toolbar="true"
      style={{ top: `${position.top}px`, left: `${position.left}px` }}
      className={`fixed z-50 animate-in fade-in zoom-in-95 duration-150 select-none ${
        isSelectingText ? 'pointer-events-none' : 'pointer-events-auto'
      } ${isChatAreaSelection ? '-translate-y-full' : ''}`}
    >
      {showReferenceError ? (
        <div className="rounded-md bg-white border border-zinc-200/90 px-2.5 py-1.5 shadow-md text-xs font-sans text-zinc-700 flex items-center gap-1.5 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <span className="font-medium">
            Cannot nest existing references
          </span>
        </div>
      ) : (
        <SuggestionList
          items={suggestions}
          selectedIndex={selectedIndex}
          onSelect={handleSelectSuggestion}
        />
      )}
    </div>
  );
};

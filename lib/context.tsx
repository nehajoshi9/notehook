'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Page, Mention, PaneState, AISettings, EntityVersion } from './types';
import { SEED_PAGES, SEED_MENTIONS } from './store';
import { parseNotehookMarkup, formatItemTitle, generateTopicTitle, stripCodeSpans, normalizeRawContentToCanonicalBrackets } from './notehook-parser';
import { generateNotehookResponse } from './ai-notehook';

export interface NotehookContextType {
  pages: Page[];
  mentions: Mention[];

  // Convenient Helper Filters
  messages: Page[];
  notes: Page[];
  entities: Page[];
  todos: Page[];
  decisions: Page[];

  aiSettings: AISettings;
  setAiSettings: (settings: AISettings) => void;

  workspaceName: string;
  setWorkspaceName: (name: string) => void;

  // 2-Pane Split View State
  leftPane: PaneState;
  rightPane: PaneState;
  openInPane2: (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string, targetVersionNum?: number, targetVersionId?: string) => void;
  openInPane1: (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string, targetVersionNum?: number, targetVersionId?: string) => void;
  closePane1: () => void;
  closePane2: () => void;
  swapPanes: () => void;
  navigateToMessage: (messageId: string, highlightSpan?: string, title?: string) => void;
  scrollToMessageInChat: (messageId: string, highlightSpan?: string) => void;

  // Navigation History
  leftHistory: PaneState[];
  rightHistory: PaneState[];
  navigationHistory: PaneState[];
  leftPaneCanGoBack: boolean;
  rightPaneCanGoBack: boolean;
  goBackPane1: () => void;
  goBackPane2: () => void;

  // Page CRUD & Tagging
  createEntityPage: (title: string, content?: string) => Page;
  createNotePage: (title: string, content?: string) => Page;
  createTodoPage: (title: string, content?: string, sourceNoteId?: string) => Page;
  createDecisionPage: (title: string, content?: string, sourceNoteId?: string) => Page;
  updatePageTitle: (id: string, newTitle: string) => string;
  updatePageContent: (id: string, newContent: string) => void;
  updatePageUserPrompt: (id: string, newPrompt: string) => void;
  deletePage: (id: string) => void;
  deletePages: (ids: string[]) => void;
  addEntityVersion: (entityId: string, title?: string, content?: string) => EntityVersion;
  updateEntityVersion: (entityId: string, versionId: string, newTitle: string, newContent: string) => void;
  setCanonicalVersion: (entityId: string, versionId: string) => void;
  deleteEntityVersion: (entityId: string, versionId: string) => void;

  toggleTodoDone: (id: string) => void;
  toggleTodoStarred: (id: string) => void;

  pinnedPageIds: string[];
  togglePinPage: (id: string) => boolean;

  addManualMention: (sourceNoteId: string, targetTitleOrId: string, snippet?: string) => Mention;
  removeMention: (mentionId: string) => void;
  executeRetroactiveLinking: (pageId: string, noteIds: string[]) => number;

  // AI Streaming State & Turn Handler
  isAiGenerating: boolean;
  aiStreamingText: string;
  aiStreamingPrompt: string;
  submitUserTurn: (prompt: string) => Promise<void>;

  // Clear / Reset
  clearAllData: () => void;
}

const NotehookContext = createContext<NotehookContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PAGES: 'notehook_pages_v6',
  MENTIONS: 'notehook_mentions_v6',
  AI_SETTINGS: 'notehook_ai_settings_v6',
  WORKSPACE_NAME: 'notehook_workspace_name_v6',
  PINNED_PAGES: 'notehook_pinned_pages_v6',
};

export function generateShortId(type: Page['type'], currentPages: Page[]): string {
  const prefix = type === 'entity' ? 'e' : type === 'message' ? 'm' : type === 'note' ? 'n' : type === 'decision' ? 'd' : 't';
  const sameType = currentPages.filter((p) => p.type === type);
  let maxNum = 0;
  for (const p of sameType) {
    if (p.short_id) {
      const match = p.short_id.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  }
  return `${prefix}${maxNum + 1}`;
}

export const NotehookProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pages, setPages] = useState<Page[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [pinnedPageIds, setPinnedPageIds] = useState<string[]>([]);
  const [workspaceName, setWorkspaceNameState] = useState('My Workspace');
  const [isLoaded, setIsLoaded] = useState(false);

  const sanitizeWorkspaceName = (raw: string): string => {
    return raw
      .replace(/\[@.*?\]/g, '')
      .replace(/@\w+/g, '')
      .replace(/[@\[\]]/g, '');
  };

  const setWorkspaceName = (name: string) => {
    const clean = sanitizeWorkspaceName(name);
    setWorkspaceNameState(clean);
  };

  const envGeminiKey = process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';

  const [aiSettings, setAiSettings] = useState<AISettings>(() => {
    if (envGeminiKey) {
      return {
        provider: 'gemini',
        apiKey: envGeminiKey,
        model: 'gemini-1.5-flash',
      };
    }
    return {
      provider: 'simulated',
      apiKey: '',
      model: 'gpt-4o-mini',
    };
  });

  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiStreamingText, setAiStreamingText] = useState('');
  const [aiStreamingPrompt, setAiStreamingPrompt] = useState('');

  // 2-Pane Navigation State
  const [leftPane, setLeftPane] = useState<PaneState>({
    type: 'chat',
    id: null,
    title: 'Chat Thread',
  });

  const [rightPane, setRightPane] = useState<PaneState>({
    type: 'empty',
    id: null,
  });

  const [leftHistory, setLeftHistory] = useState<PaneState[]>([
    {
      type: 'chat',
      id: null,
      title: 'Chat Thread',
    },
  ]);
  const [rightHistory, setRightHistory] = useState<PaneState[]>([]);
  const [navigationHistory, setNavigationHistory] = useState<PaneState[]>([]);

  useEffect(() => {
    try {
      localStorage.removeItem('scribe_pages_v5');
      localStorage.removeItem('scribe_mentions_v5');
      localStorage.removeItem('scribe_ai_settings_v5');
      localStorage.removeItem('notehook_pages_v5');
      localStorage.removeItem('notehook_mentions_v5');
      localStorage.removeItem('notehook_ai_settings_v5');

      const storedPages = localStorage.getItem(STORAGE_KEYS.PAGES) || localStorage.getItem('scribe_pages_v6');
      const storedMentions = localStorage.getItem(STORAGE_KEYS.MENTIONS) || localStorage.getItem('scribe_mentions_v6');
      const storedAi = localStorage.getItem(STORAGE_KEYS.AI_SETTINGS) || localStorage.getItem('scribe_ai_settings_v6');
      const storedWorkspace = localStorage.getItem(STORAGE_KEYS.WORKSPACE_NAME) || localStorage.getItem('scribe_workspace_name_v6');
      const storedPinned = localStorage.getItem(STORAGE_KEYS.PINNED_PAGES) || localStorage.getItem('scribe_pinned_pages_v6');

      if (storedPinned) {
        try {
          const parsedPinned = JSON.parse(storedPinned);
          if (Array.isArray(parsedPinned)) setPinnedPageIds(parsedPinned);
        } catch (e) {
          console.error('Failed to parse pinned pages', e);
        }
      }

      if (storedWorkspace) {
        setWorkspaceNameState(sanitizeWorkspaceName(storedWorkspace));
      }

      const parsedPages: Page[] = storedPages ? JSON.parse(storedPages) : SEED_PAGES;

      const cleanedPages = parsedPages.map((p) => {
        let cleanTitle = p.title.replace(/…$/, '').trim();
        const seedMatch = SEED_PAGES.find(
          (sp) => sp.id === p.id || sp.title.toLowerCase().startsWith(cleanTitle.toLowerCase())
        );
        if (seedMatch) {
          cleanTitle = seedMatch.title;
        }

        let cleanContent = p.content || '';
        if (seedMatch && seedMatch.content && p.id === seedMatch.id) {
          cleanContent = seedMatch.content;
        }
        cleanContent = normalizeRawContentToCanonicalBrackets(cleanContent, parsedPages);

        return {
          ...p,
          title: cleanTitle,
          content: cleanContent,
        };
      });

      // Assign unique short_id (m1, e1, n1, d1, t1...) to any page missing one
      const sortedByDate = [...cleanedPages].sort(
        (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
      );
      const assignedPages: Page[] = [];
      for (const p of sortedByDate) {
        if (!p.short_id) {
          const prefix = p.type === 'entity' ? 'e' : p.type === 'message' ? 'm' : p.type === 'note' ? 'n' : p.type === 'decision' ? 'd' : 't';
          const sameType = assignedPages.filter((ap) => ap.type === p.type);
          let maxNum = 0;
          for (const ap of sameType) {
            if (ap.short_id) {
              const m = ap.short_id.match(new RegExp(`^${prefix}(\\d+)$`, 'i'));
              if (m) {
                const num = parseInt(m[1], 10);
                if (num > maxNum) maxNum = num;
              }
            }
          }
          p.short_id = `${prefix}${maxNum + 1}`;
        }
        assignedPages.push(p);
      }

      setPages(assignedPages);
      setMentions(storedMentions ? JSON.parse(storedMentions) : SEED_MENTIONS);

      if (storedAi) {
        const parsedAi: AISettings = JSON.parse(storedAi);
        // If stored settings were 'simulated' or had old models, auto-upgrade to Gemini 3.6 Flash
        if ((parsedAi.provider === 'simulated' || parsedAi.model === 'gemini-1.5-flash' || parsedAi.model === 'gemini-2.0-flash' || parsedAi.model === 'gemini-2.0-flash-lite' || parsedAi.model === 'gemini-2.5-flash' || parsedAi.model === 'gemini-3.5-flash-lite') && envGeminiKey) {
          setAiSettings({
            provider: 'gemini',
            apiKey: envGeminiKey,
            model: 'gemini-3.6-flash',
          });
        } else {
          setAiSettings(parsedAi);
        }
      } else if (envGeminiKey) {
        setAiSettings({
          provider: 'gemini',
          apiKey: envGeminiKey,
          model: 'gemini-3.6-flash',
        });
      }
    } catch (err) {
      console.error('Failed to load local storage', err);
      setPages(SEED_PAGES);
      setMentions(SEED_MENTIONS);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    localStorage.setItem(STORAGE_KEYS.PAGES, JSON.stringify(pages));
    localStorage.setItem(STORAGE_KEYS.MENTIONS, JSON.stringify(mentions));
    localStorage.setItem(STORAGE_KEYS.AI_SETTINGS, JSON.stringify(aiSettings));
    localStorage.setItem(STORAGE_KEYS.WORKSPACE_NAME, workspaceName);
    localStorage.setItem(STORAGE_KEYS.PINNED_PAGES, JSON.stringify(pinnedPageIds));
  }, [pages, mentions, aiSettings, workspaceName, pinnedPageIds, isLoaded]);

  // Derived filtered page lists
  const messages = pages.filter((p) => p.type === 'message').reverse(); // all have newest first
  const notes = pages.filter((p) => p.type === 'note').reverse();
  const entities = pages.filter((p) => p.type === 'entity').reverse();
  const todos = pages.filter((p) => p.type === 'todo').reverse();
  const decisions = pages.filter((p) => p.type === 'decision').reverse();

  // Pane Navigation Handlers
  const openInPane2 = (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string, targetVersionNum?: number, targetVersionId?: string) => {
    const newState: PaneState = {
      type,
      id,
      title: title || (type === 'chat' ? 'Chat Thread' : type === 'todo_board' ? 'Todo Board' : type === 'decision_log' ? 'Decision Log' : type === 'entity_index' ? 'Entity Index' : type === 'note_index' ? 'Note Archive' : id || ''),
      highlightSpan,
      targetVersionNum,
      targetVersionId,
    };
    setRightHistory((prev) => [...prev, newState]);
    setNavigationHistory((prev) => [...prev, newState]);
    setRightPane(newState);
  };

  const openInPane1 = (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string, targetVersionNum?: number, targetVersionId?: string) => {
    const newState: PaneState = {
      type,
      id,
      title: title || (type === 'chat' ? 'Chat Thread' : type === 'todo_board' ? 'Todo Board' : type === 'decision_log' ? 'Decision Log' : type === 'entity_index' ? 'Entity Index' : type === 'note_index' ? 'Note Archive' : id || ''),
      highlightSpan,
      targetVersionNum,
      targetVersionId,
    };
    setLeftHistory((prev) => [...prev, newState]);
    setNavigationHistory((prev) => [...prev, newState]);
    setLeftPane(newState);
  };

  const leftPaneCanGoBack = leftHistory.length > 1;
  const rightPaneCanGoBack = rightHistory.length > 1;

  const goBackPane1 = () => {
    if (leftHistory.length <= 1) return;
    const previous = leftHistory[leftHistory.length - 2];
    setLeftHistory((prev) => prev.slice(0, -1));
    setLeftPane(previous);
  };

  const goBackPane2 = () => {
    if (rightHistory.length <= 1) return;
    const previous = rightHistory[rightHistory.length - 2];
    setRightHistory((prev) => prev.slice(0, -1));
    setRightPane(previous);
  };

  const closePane1 = () => {
    if (rightPane.type !== 'empty') {
      setLeftPane(rightPane);
      setLeftHistory(rightHistory);
      setRightPane({ type: 'empty', id: null });
      setRightHistory([]);
    } else {
      setLeftPane({ type: 'empty', id: null });
      setLeftHistory([]);
    }
  };

  const closePane2 = () => {
    setRightPane({ type: 'empty', id: null });
    setRightHistory([]);
  };

  const swapPanes = () => {
    const tempPane = leftPane;
    setLeftPane(rightPane);
    setRightPane(tempPane);

    const tempHistory = leftHistory;
    setLeftHistory(rightHistory);
    setRightHistory(tempHistory);
  };

  const scrollToMessageInChat = (messageId: string, highlightSpan?: string) => {
    // 1. If leftPane is already 'chat', update leftPane and scroll to message
    if (leftPane.type === 'chat') {
      openInPane1('chat', messageId, 'Chat Thread', highlightSpan);
      return;
    }

    // 2. If rightPane is already 'chat', update rightPane and scroll to message
    if (rightPane.type === 'chat') {
      openInPane2('chat', messageId, 'Chat Thread', highlightSpan);
      return;
    }

    // 3. Neither pane is 'chat' (e.g. leftPane has a page view and rightPane is empty after chat was closed):
    // Move the active page to rightPane so it stays open, and put Chat Thread on the left (dual pane mode!)
    if (leftPane.type !== 'empty') {
      if (rightPane.type === 'empty') {
        setRightPane(leftPane);
        setRightHistory(leftHistory.length > 0 ? leftHistory : [leftPane]);
      }
    }

    // Open Chat Thread on left pane
    const chatState: PaneState = {
      type: 'chat',
      id: messageId,
      title: 'Chat Thread',
      highlightSpan,
    };
    setLeftPane(chatState);
    setLeftHistory((prev) => [...prev, chatState]);
    setNavigationHistory((prev) => [...prev, chatState]);
  };

  const navigateToMessage = (messageId: string, highlightSpan?: string, title?: string) => {
    const isChatOpen = leftPane.type === 'chat' || rightPane.type === 'chat';

    if (isChatOpen) {
      // Chat pane is already open -> open message in page view (Pane 2)
      const msgPage = pages.find((p) => p.id === messageId);
      const displayTitle = title || msgPage?.title || 'Message';
      openInPane2('message', messageId, displayTitle, highlightSpan);
      return;
    }

    // Chat pane was closed -> route to message in chat view & enter dual pane mode
    scrollToMessageInChat(messageId, highlightSpan);
  };

  // Helper for generating non-colliding unique title: "Name", "Name 2", "Name 3"
  const getUniqueTitleForType = (type: Page['type'], baseTitle: string, currentPages: Page[]): string => {
    let cleanBase = formatItemTitle(
      baseTitle
        .replace(/^@(?:todo|decision|note)?:\s*/i, '')
        .replace(/^@/, '')
        .trim(),
      45
    ) || 'Untitled';

    const titleExists = (t: string) => {
      const lower = t.toLowerCase();
      const matchesTitle = currentPages.some((p) => p.type === type && p.title.toLowerCase() === lower);
      const matchesShortId = currentPages.some((p) => p.short_id?.toLowerCase() === lower);
      return matchesTitle || matchesShortId;
    };

    if (!titleExists(cleanBase)) {
      return cleanBase;
    }

    const match = cleanBase.match(/^(.*?)(?:\s+(\d+))$/);
    const root = match ? match[1].trim() : cleanBase;
    let counter = match ? parseInt(match[2], 10) + 1 : 2;

    while (titleExists(`${root} ${counter}`)) {
      counter++;
    }
    return `${root} ${counter}`;
  };

  // Entity Creation (User Manual Action Only)
  const createEntityPage = (title: string, content: string = ''): Page => {
    const cleanTitle = title.replace(/^@/, '').trim();
    const uniqueTitle = getUniqueTitleForType('entity', cleanTitle, pages);

    const newPage: Page = {
      id: `ent-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      short_id: generateShortId('entity', pages),
      type: 'entity',
      title: uniqueTitle,
      content: content || '',
      created_at: new Date().toISOString(),
    };
    setPages((prev) => [newPage, ...prev]);
    return newPage;
  };

  // Note Creation (User Manual Action or Tagging)
  const createNotePage = (title: string, content: string = ''): Page => {
    const cleanTitle = title.replace(/^@/, '').trim();
    const uniqueTitle = getUniqueTitleForType('note', cleanTitle, pages);

    const newPage: Page = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      short_id: generateShortId('note', pages),
      type: 'note',
      title: uniqueTitle,
      content: content || '',
      created_at: new Date().toISOString(),
    };
    setPages((prev) => [newPage, ...prev]);
    return newPage;
  };

  // Todo Creation (LLM or Manual)
  const createTodoPage = (title: string, content: string = '', sourceNoteId?: string): Page => {
    const cleanTitle = title.replace(/^@/, '').trim();
    const uniqueTitle = getUniqueTitleForType('todo', cleanTitle, pages);

    const targetPage: Page = {
      id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      short_id: generateShortId('todo', pages),
      type: 'todo' as const,
      title: uniqueTitle,
      content: content || '',
      done: false,
      starred: false,
      created_at: new Date().toISOString(),
    };

    setPages((prev) => [targetPage, ...prev]);

    if (sourceNoteId) {
      setMentions((prev) => [
        {
          id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          target_page_id: targetPage.id,
          source_page_id: sourceNoteId,
          snippet: `[@todo: ${uniqueTitle}]`,
          source: 'auto',
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }

    return targetPage;
  };

  // Decision Creation (LLM or Manual)
  const createDecisionPage = (title: string, content: string = '', sourceNoteId?: string): Page => {
    const cleanTitle = title.replace(/^@/, '').trim();
    const uniqueTitle = getUniqueTitleForType('decision', cleanTitle, pages);

    const targetPage: Page = {
      id: `dec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      short_id: generateShortId('decision', pages),
      type: 'decision' as const,
      title: uniqueTitle,
      content: content || '',
      created_at: new Date().toISOString(),
    };

    setPages((prev) => [targetPage, ...prev]);

    if (sourceNoteId) {
      setMentions((prev) => [
        {
          id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          target_page_id: targetPage.id,
          source_page_id: sourceNoteId,
          snippet: `[@decision: ${uniqueTitle}]`,
          source: 'auto',
          created_at: new Date().toISOString(),
        },
        ...prev,
      ]);
    }

    return targetPage;
  };

  const resolveEditedTitleCollision = (
    pageId: string,
    pageType: Page['type'],
    proposedTitle: string,
    currentPages: Page[]
  ): string => {
    let cleanBase = formatItemTitle(
      proposedTitle
        .replace(/^@(?:todo|decision|note)?:\s*/i, '')
        .replace(/^@/, '')
        .trim(),
      45
    ) || 'Untitled';

    const otherPagesOfSameType = currentPages.filter(
      (p) => p.id !== pageId && p.type === pageType
    );

    const titleExists = (t: string) => {
      const lower = t.toLowerCase();
      const matchesTitle = otherPagesOfSameType.some((p) => p.title.toLowerCase() === lower);
      const matchesShortId = currentPages.some((p) => p.id !== pageId && p.short_id?.toLowerCase() === lower);
      return matchesTitle || matchesShortId;
    };

    if (!titleExists(cleanBase)) {
      return cleanBase;
    }

    const match = cleanBase.match(/^(.*?)(?:\s+(\d+))$/);
    const root = match ? match[1].trim() : cleanBase;
    let counter = match ? parseInt(match[2], 10) + 1 : 2;

    while (titleExists(`${root} ${counter}`)) {
      counter++;
    }
    return `${root} ${counter}`;
  };

  const updatePageTitle = (id: string, newTitle: string): string => {
    const targetPage = pages.find((p) => p.id === id);
    if (!targetPage) return newTitle;

    const oldTitle = targetPage.title;
    const resolvedTitle = resolveEditedTitleCollision(id, targetPage.type, newTitle, pages);

    if (!resolvedTitle || oldTitle === resolvedTitle) return oldTitle;

    const displayTitle = targetPage.type === 'entity' ? `@${resolvedTitle}` : resolvedTitle;

    // 1. Update pages & replace references in content & user_prompt across all pages
    setPages((prevPages) =>
      prevPages.map((p) => {
        if (p.id === id) {
          return { ...p, title: resolvedTitle, updated_at: new Date().toISOString() };
        }

        let updatedContent = p.content;
        let updatedPrompt = p.user_prompt;

        if (oldTitle) {
          const escapedOld = oldTitle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          const regex = new RegExp(escapedOld, 'gi');

          if (updatedContent && regex.test(updatedContent)) {
            updatedContent = updatedContent.replace(regex, resolvedTitle);
          }

          if (updatedPrompt && regex.test(updatedPrompt)) {
            updatedPrompt = updatedPrompt.replace(regex, resolvedTitle);
          }
        }

        return {
          ...p,
          content: updatedContent,
          user_prompt: updatedPrompt,
          updated_at:
            updatedContent !== p.content || updatedPrompt !== p.user_prompt
              ? new Date().toISOString()
              : p.updated_at,
        };
      })
    );

    // 2. Update mentions snippets
    if (oldTitle) {
      const escapedOld = oldTitle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escapedOld, 'gi');
      setMentions((prevMentions) =>
        prevMentions.map((m) => {
          if (m.snippet && regex.test(m.snippet)) {
            return { ...m, snippet: m.snippet.replace(regex, resolvedTitle) };
          }
          return m;
        })
      );
    }

    // 3. Update active pane states & histories if currently open
    setLeftPane((prev) => (prev.id === id ? { ...prev, title: displayTitle } : prev));
    setRightPane((prev) => (prev.id === id ? { ...prev, title: displayTitle } : prev));

    setLeftHistory((prev) =>
      prev.map((h) => (h.id === id ? { ...h, title: displayTitle } : h))
    );
    setRightHistory((prev) =>
      prev.map((h) => (h.id === id ? { ...h, title: displayTitle } : h))
    );

    return resolvedTitle;
  };

  const addEntityVersion = (entityId: string, title?: string, content?: string): EntityVersion => {
    const targetEntity = pages.find((p) => p.id === entityId);
    const existingVersions = targetEntity?.versions || [];

    const nextVerNum = (targetEntity?.current_version_num || existingVersions.length || 0) + 1;
    const defaultTitle = `v${nextVerNum}`;
    const newVer: EntityVersion = {
      id: `ver-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      entity_id: entityId,
      version_num: nextVerNum,
      title: title || defaultTitle,
      content: content || '',
      created_at: new Date().toISOString(),
      is_canonical: true,
    };

    setPages((prev) =>
      prev.map((p) => {
        if (p.id === entityId) {
          const currentVers = (p.versions || []).map((v) => ({ ...v, is_canonical: false }));
          return {
            ...p,
            versions: [...currentVers, newVer],
            canonical_version_id: newVer.id,
            current_version_num: nextVerNum,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      })
    );

    return newVer;
  };

  const updateEntityVersion = (
    entityId: string,
    versionId: string,
    newTitle: string,
    newContent: string
  ) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id === entityId) {
          const currentVers = p.versions || [];
          const updatedVers = currentVers.map((v) => {
            if (v.id === versionId) {
              return {
                ...v,
                title: newTitle,
                content: newContent,
              };
            }
            return v;
          });
          return { ...p, versions: updatedVers, updated_at: new Date().toISOString() };
        }
        return p;
      })
    );
  };

  const setCanonicalVersion = (entityId: string, versionId: string) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id === entityId) {
          const currentVers = (p.versions || []).map((v) => ({
            ...v,
            is_canonical: v.id === versionId,
          }));
          const canonicalVer = currentVers.find((v) => v.id === versionId);
          return {
            ...p,
            versions: currentVers,
            canonical_version_id: versionId,
            content: canonicalVer ? canonicalVer.content : p.content,
            updated_at: new Date().toISOString(),
          };
        }
        return p;
      })
    );
  };

  const deleteEntityVersion = (entityId: string, versionId: string) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id === entityId) {
          const currentVers = (p.versions || []).filter((v) => v.id !== versionId);
          return { ...p, versions: currentVers, updated_at: new Date().toISOString() };
        }
        return p;
      })
    );
  };

  const updatePageContent = (id: string, newContent: string) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const normalizedContent = normalizeRawContentToCanonicalBrackets(newContent, prev);
        const updated = { ...p, content: normalizedContent, updated_at: new Date().toISOString() };

        // Check for orphaned mentions if source message content changed
        if (p.type === 'message' || (p.type as string) === 'note') {
          setMentions((prevMentions) =>
            prevMentions.map((m) => {
              if (m.source_page_id !== id) return m;
              const targetPage = pages.find((tp) => tp.id === m.target_page_id);
              if (!targetPage) return m;
              const isStillPresent = newContent.toLowerCase().includes(targetPage.title.toLowerCase());
              return { ...m, orphaned: !isStillPresent };
            })
          );
        }

        return updated;
      })
    );
  };

  const updatePageUserPrompt = (id: string, newPrompt: string) => {
    setPages((prev) =>
      prev.map((p) => (p.id === id ? { ...p, user_prompt: newPrompt, updated_at: new Date().toISOString() } : p))
    );
  };

  const deletePages = (ids: string[]) => {
    if (!ids || ids.length === 0) return;
    const idSet = new Set(ids);
    setPages((prev) => prev.filter((p) => !idSet.has(p.id)));
    setMentions((prev) => prev.filter((m) => !idSet.has(m.target_page_id) && !idSet.has(m.source_page_id)));
    setPinnedPageIds((prev) => prev.filter((pid) => !idSet.has(pid)));
    setLeftPane((prev) => (prev.id && idSet.has(prev.id) ? { type: 'chat', id: null, title: 'Chat Thread' } : prev));
    setRightPane((prev) => (prev.id && idSet.has(prev.id) ? { type: 'empty', id: null } : prev));
  };

  const deletePage = (id: string) => {
    deletePages([id]);
  };

  const toggleTodoDone = (id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, done: !p.done, updated_at: new Date().toISOString() } : p
      )
    );
  };

  const toggleTodoStarred = (id: string) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, starred: !p.starred, updated_at: new Date().toISOString() } : p
      )
    );
  };

  const togglePinPage = (id: string): boolean => {
    const page = pages.find((p) => p.id === id);
    if (!page || (page.type !== 'entity' && page.type !== 'decision' && page.type !== 'note')) {
      return false;
    }

    if (pinnedPageIds.includes(id)) {
      setPinnedPageIds((prev) => prev.filter((pid) => pid !== id));
      return false;
    } else {
      if (pinnedPageIds.length >= 3) {
        // Enforce maximum of 3 pinned knowledge pages
        return false;
      }
      setPinnedPageIds((prev) => [...prev, id]);
      return true;
    }
  };

  const addManualMention = (sourceNoteId: string, targetTitleOrId: string, snippet?: string): Mention => {
    let targetPage = pages.find(
      (p) =>
        p.id === targetTitleOrId ||
        (p.short_id && p.short_id.toLowerCase() === targetTitleOrId.toLowerCase()) ||
        p.title.toLowerCase() === targetTitleOrId.toLowerCase()
    );

    if (!targetPage) {
      if (/^(m|e|n|d|t)\d+$/i.test(targetTitleOrId)) {
        return null as any;
      }
      // Create new entity page manually
      targetPage = createEntityPage(targetTitleOrId, snippet);
    }

    const newMention: Mention = {
      id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      target_page_id: targetPage.id,
      source_page_id: sourceNoteId,
      snippet: snippet || `Referenced [@${targetPage.title}]`,
      source: 'manual',
      created_at: new Date().toISOString(),
    };

    setMentions((prev) => [newMention, ...prev]);
    return newMention;
  };

  const removeMention = (mentionId: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== mentionId));
  };

  const executeRetroactiveLinking = (pageId: string, noteIds: string[]): number => {
    const targetPage = pages.find((p) => p.id === pageId);
    if (!targetPage) return 0;

    let addedCount = 0;
    const newMentions: Mention[] = [];

    noteIds.forEach((nId) => {
      const existing = mentions.find((m) => m.source_page_id === nId && m.target_page_id === targetPage.id);
      if (!existing) {
        const note = notes.find((n) => n.id === nId);
        newMentions.push({
          id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          target_page_id: targetPage.id,
          source_page_id: nId,
          snippet: note ? `Literal occurrence matched in "${note.title}"` : `Retroactive link to [@${targetPage.title}]`,
          source: 'manual',
          created_at: new Date().toISOString(),
        });
        addedCount++;
      }
    });

    if (newMentions.length > 0) {
      setMentions((prev) => [...newMentions, ...prev]);
    }

    return addedCount;
  };

  // Submit User Turn & Assistant AI Response (Single message page per turn containing user_prompt and body content)
  const submitUserTurn = async (prompt: string) => {
    if (!prompt.trim() || isAiGenerating) return;

    setIsAiGenerating(true);
    setAiStreamingPrompt(prompt.trim());
    setAiStreamingText('');

    const topicTitle = generateTopicTitle(prompt);

    try {
      const { text, parsedItems, injectedContext, referencedPageIds } = await generateNotehookResponse(
        prompt,
        entities,
        aiSettings,
        (chunk) => {
          setAiStreamingText((prev) => prev + chunk);
        },
        mentions,
        pages,
        pinnedPageIds
      );

      // Create single Turn Message Page containing both prompt & response content
      const messagePage: Page = {
        id: `note-${Date.now()}`,
        short_id: generateShortId('message', pages),
        type: 'message',
        role: 'assistant',
        title: topicTitle,
        content: text,
        user_prompt: prompt.trim(),
        injected_context: injectedContext,
        referenced_page_ids: referencedPageIds,
        created_at: new Date().toISOString(),
      };

      setPages((prev) => [messagePage, ...prev]);

      // Resolve parsed LLM items against existing pages or create new todo/decision pages
      parsedItems.forEach((item) => {
        if (item.type === 'entity') {
          // Closed list lookup
          const matchedEntity = entities.find((e) => e.title.toLowerCase() === item.nameOrTitle.toLowerCase());
          if (matchedEntity) {
            setMentions((prev) => [
              {
                id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                target_page_id: matchedEntity.id,
                source_page_id: messagePage.id,
                snippet: item.fullText,
                source: 'auto',
                created_at: new Date().toISOString(),
              },
              ...prev,
            ]);
          }
        } else if (item.type === 'todo') {
          createTodoPage(item.nameOrTitle, item.fullText, messagePage.id);
        } else if (item.type === 'decision') {
          createDecisionPage(item.nameOrTitle, item.fullText, messagePage.id);
        }
      });
    } catch (err) {
      console.error('AI response generation failed', err);
    } finally {
      setIsAiGenerating(false);
      setAiStreamingPrompt('');
      setAiStreamingText('');
    }
  };

  const clearAllData = () => {
    localStorage.clear();
    setPages([]);
    setMentions([]);
    setLeftPane({
      type: 'chat',
      id: null,
      title: 'Chat Thread',
    });
    setLeftHistory([
      {
        type: 'chat',
        id: null,
        title: 'Chat Thread',
      },
    ]);
    setRightPane({ type: 'empty', id: null });
    setRightHistory([]);
  };

  return (
    <NotehookContext.Provider
      value={{
        pages,
        mentions,
        messages,
        notes,
        entities,
        todos,
        decisions,
        aiSettings,
        setAiSettings,
        workspaceName,
        setWorkspaceName,
        leftPane,
        rightPane,
        leftHistory,
        rightHistory,
        navigationHistory,
        openInPane2,
        openInPane1,
        closePane1,
        closePane2,
        swapPanes,
        navigateToMessage,
        scrollToMessageInChat,
        leftPaneCanGoBack,
        rightPaneCanGoBack,
        goBackPane1,
        goBackPane2,
        createEntityPage,
        createNotePage,
        createTodoPage,
        createDecisionPage,
        updatePageTitle,
        updatePageContent,
        updatePageUserPrompt,
        deletePage,
        deletePages,
        addEntityVersion,
        updateEntityVersion,
        setCanonicalVersion,
        deleteEntityVersion,
        toggleTodoDone,
        toggleTodoStarred,
        pinnedPageIds,
        togglePinPage,
        addManualMention,
        removeMention,
        executeRetroactiveLinking,
        isAiGenerating,
        aiStreamingText,
        aiStreamingPrompt,
        submitUserTurn,
        clearAllData,
      }}
    >
      {children}
    </NotehookContext.Provider>
  );
};

export const useNotehook = () => {
  const ctx = useContext(NotehookContext);
  if (!ctx) {
    throw new Error('useNotehook must be used within a NotehookProvider');
  }
  return ctx;
};


'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Page, Mention, PaneState, AISettings, EntityVersion } from './types';
import { SEED_PAGES, SEED_MENTIONS } from './store';
import { parseScribeMarkup, formatItemTitle, generateTopicTitle, stripCodeSpans, normalizeRawContentToCanonicalBrackets } from './scribe-parser';
import { generateScribeResponse } from './ai-scribe';

interface PlanetContextType {
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

  // 2-Pane Split View State
  leftPane: PaneState;
  rightPane: PaneState;
  openInPane2: (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string) => void;
  openInPane1: (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string) => void;
  closePane1: () => void;
  closePane2: () => void;
  swapPanes: () => void;

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
  updatePageTitle: (id: string, newTitle: string) => void;
  updatePageContent: (id: string, newContent: string) => void;
  updatePageUserPrompt: (id: string, newPrompt: string) => void;
  deletePage: (id: string) => void;
  addEntityVersion: (entityId: string, title?: string, content?: string) => EntityVersion;
  updateEntityVersion: (entityId: string, versionId: string, newTitle: string, newContent: string) => void;
  setCanonicalVersion: (entityId: string, versionId: string) => void;
  deleteEntityVersion: (entityId: string, versionId: string) => void;

  toggleTodoDone: (id: string) => void;
  toggleTodoStarred: (id: string) => void;

  addManualMention: (sourceNoteId: string, targetTitleOrId: string, snippet?: string) => Mention;
  removeMention: (mentionId: string) => void;
  executeRetroactiveLinking: (pageId: string, noteIds: string[]) => number;

  // AI Streaming State & Turn Handler
  isAiGenerating: boolean;
  aiStreamingText: string;
  submitUserTurn: (prompt: string) => Promise<void>;

  // Clear / Reset
  clearAllData: () => void;
}

const PlanetContext = createContext<PlanetContextType | undefined>(undefined);

const STORAGE_KEYS = {
  PAGES: 'scribe_pages_v5',
  MENTIONS: 'scribe_mentions_v5',
  AI_SETTINGS: 'scribe_ai_settings_v5',
};

export const PlanetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pages, setPages] = useState<Page[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  const [aiSettings, setAiSettings] = useState<AISettings>({
    provider: 'simulated',
    apiKey: '',
    model: 'gpt-4o-mini',
  });

  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [aiStreamingText, setAiStreamingText] = useState('');

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
      const storedPages = localStorage.getItem(STORAGE_KEYS.PAGES);
      const storedMentions = localStorage.getItem(STORAGE_KEYS.MENTIONS);
      const storedAi = localStorage.getItem(STORAGE_KEYS.AI_SETTINGS);

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

      setPages(cleanedPages);
      setMentions(storedMentions ? JSON.parse(storedMentions) : SEED_MENTIONS);
      if (storedAi) setAiSettings(JSON.parse(storedAi));
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
  }, [pages, mentions, aiSettings, isLoaded]);

  // Derived filtered page lists
  const messages = pages.filter((p) => p.type === 'message');
  const notes = pages.filter((p) => p.type === 'note');
  const entities = pages.filter((p) => p.type === 'entity');
  const todos = pages.filter((p) => p.type === 'todo');
  const decisions = pages.filter((p) => p.type === 'decision');

  // Pane Navigation Handlers
  const openInPane2 = (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string) => {
    const newState: PaneState = {
      type,
      id,
      title: title || (type === 'chat' ? 'Chat Thread' : type === 'todo_board' ? 'Todo Board' : type === 'decision_log' ? 'Decision Log' : type === 'entity_index' ? 'Entity Index' : type === 'note_index' ? 'Note Archive' : id || ''),
      highlightSpan,
    };
    setRightHistory((prev) => [...prev, newState]);
    setNavigationHistory((prev) => [...prev, newState]);
    setRightPane(newState);
  };

  const openInPane1 = (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string) => {
    const newState: PaneState = {
      type,
      id,
      title: title || (type === 'chat' ? 'Chat Thread' : type === 'todo_board' ? 'Todo Board' : type === 'decision_log' ? 'Decision Log' : type === 'entity_index' ? 'Entity Index' : type === 'note_index' ? 'Note Archive' : id || ''),
      highlightSpan,
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

  // Helper for generating non-colliding unique title: "Name", "Name 2", "Name 3"
  const getUniqueTitleForType = (type: Page['type'], baseTitle: string, currentPages: Page[]): string => {
    const cleanBase = formatItemTitle(
      baseTitle
        .replace(/^@(?:todo|decision|note)?:\s*/i, '')
        .replace(/^@/, '')
        .trim(),
      45
    ) || 'Untitled';

    const titleExists = (t: string) =>
      currentPages.some((p) => p.type === type && p.title.toLowerCase() === t.toLowerCase());

    if (!titleExists(cleanBase)) {
      return cleanBase;
    }

    let counter = 2;
    while (titleExists(`${cleanBase} ${counter}`)) {
      counter++;
    }
    return `${cleanBase} ${counter}`;
  };

  // Entity Creation (User Manual Action Only)
  const createEntityPage = (title: string, content: string = ''): Page => {
    const uniqueTitle = getUniqueTitleForType('entity', title, pages);

    const newPage: Page = {
      id: `ent-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'entity',
      title: uniqueTitle,
      content: content || `Tracked concept: @${uniqueTitle}`,
      created_at: new Date().toISOString(),
    };
    setPages((prev) => [newPage, ...prev]);
    return newPage;
  };

  // Note Creation (User Manual Action or Tagging)
  const createNotePage = (title: string, content: string = ''): Page => {
    const uniqueTitle = getUniqueTitleForType('note', title, pages);

    const newPage: Page = {
      id: `note-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
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
    const uniqueTitle = getUniqueTitleForType('todo', title, pages);

    const targetPage: Page = {
      id: `todo-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'todo' as const,
      title: uniqueTitle,
      content: content || uniqueTitle,
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
    const uniqueTitle = getUniqueTitleForType('decision', title, pages);

    const targetPage: Page = {
      id: `dec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      type: 'decision' as const,
      title: uniqueTitle,
      content: content || uniqueTitle,
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
    const cleanBase = formatItemTitle(
      proposedTitle
        .replace(/^@(?:todo|decision|note)?:\s*/i, '')
        .replace(/^@/, '')
        .trim(),
      45
    ) || 'Untitled';

    const otherPagesOfSameType = currentPages.filter(
      (p) => p.id !== pageId && p.type === pageType
    );

    const titleExists = (t: string) =>
      otherPagesOfSameType.some((p) => p.title.toLowerCase() === t.toLowerCase());

    if (!titleExists(cleanBase)) {
      return cleanBase;
    }

    let counter = 2;
    while (titleExists(`${cleanBase} ${counter}`)) {
      counter++;
    }
    return `${cleanBase} ${counter}`;
  };

  const updatePageTitle = (id: string, newTitle: string) => {
    const targetPage = pages.find((p) => p.id === id);
    if (!targetPage) return;

    const oldTitle = targetPage.title;
    const resolvedTitle = resolveEditedTitleCollision(id, targetPage.type, newTitle, pages);

    if (!resolvedTitle || oldTitle === resolvedTitle) return;

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

  const deletePage = (id: string) => {
    setPages((prev) => prev.filter((p) => p.id !== id));
    setMentions((prev) => prev.filter((m) => m.target_page_id !== id && m.source_page_id !== id));
  };

  const toggleTodoDone = (id: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, done: !p.done } : p)));
  };

  const toggleTodoStarred = (id: string) => {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p)));
  };

  const addManualMention = (sourceNoteId: string, targetTitleOrId: string, snippet?: string): Mention => {
    let targetPage = pages.find(
      (p) => p.id === targetTitleOrId || p.title.toLowerCase() === targetTitleOrId.toLowerCase()
    );

    if (!targetPage) {
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
    setAiStreamingText('');

    const topicTitle = generateTopicTitle(prompt);

    try {
      const { text, parsedItems } = await generateScribeResponse(
        prompt,
        entities,
        aiSettings,
        (chunk) => {
          setAiStreamingText((prev) => prev + chunk);
        }
      );

      // Create single Turn Message Page containing both prompt & response content
      const messagePage: Page = {
        id: `note-${Date.now()}`,
        type: 'message',
        role: 'assistant',
        title: topicTitle,
        content: text,
        user_prompt: prompt.trim(),
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
      setAiStreamingText('');
    }
  };

  const clearAllData = () => {
    localStorage.clear();
    setPages(SEED_PAGES);
    setMentions(SEED_MENTIONS);
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
    <PlanetContext.Provider
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
        addEntityVersion,
        updateEntityVersion,
        setCanonicalVersion,
        deleteEntityVersion,
        toggleTodoDone,
        toggleTodoStarred,
        addManualMention,
        removeMention,
        executeRetroactiveLinking,
        isAiGenerating,
        aiStreamingText,
        submitUserTurn,
        clearAllData,
      }}
    >
      {children}
    </PlanetContext.Provider>
  );
};

export const usePlanet = () => {
  const ctx = useContext(PlanetContext);
  if (!ctx) {
    throw new Error('usePlanet must be used within a PlanetProvider');
  }
  return ctx;
};

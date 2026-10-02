'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Page, Mention, PaneState, AISettings, EntityVersion, Workspace } from './types';
import { SEED_PAGES, SEED_MENTIONS, createDefaultWelcomePage, createDefaultDemoWorkspace, DEFAULT_DEMO_WORKSPACE_NAME } from './store';
import { parseNotehookMarkup, formatItemTitle, generateTopicTitle, stripCodeSpans, normalizeRawContentToCanonicalBrackets } from './notehook-parser';
import { generateNotehookResponse } from './ai-notehook';
import { useAuth } from './auth-context';
import {
  fetchUserWorkspacesAndPages,
  upsertWorkspaceToSupabase,
  deleteWorkspaceFromSupabase,
  upsertPageToSupabase,
  deletePageFromSupabase,
  deletePagesFromSupabase,
  upsertMentionToSupabase,
  deleteMentionFromSupabase,
  syncAllWorkspacesToSupabase,
} from './supabase-sync';

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

  // Workspace Multi-Tenancy
  workspaces: Workspace[];
  currentWorkspaceId: string;
  createWorkspace: (name?: string) => Workspace;
  switchWorkspace: (id: string) => void;
  deleteWorkspace: (id: string) => void;
  renameWorkspace: (id: string, newName: string) => void;

  // 2-Pane Split View State
  leftPane: PaneState;
  rightPane: PaneState;
  openInPane2: (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string, targetVersionNum?: number, targetVersionId?: string, autofocusTitle?: boolean, initialSearchQuery?: string, scrollTriggerTime?: number) => void;
  openInPane1: (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string, targetVersionNum?: number, targetVersionId?: string, autofocusTitle?: boolean, initialSearchQuery?: string, scrollTriggerTime?: number) => void;
  closePane1: () => void;
  closePane2: () => void;
  openChat: () => void;
  openPageView: () => void;
  swapPanes: () => void;
  navigateToMessage: (messageId: string, highlightSpan?: string, title?: string, initialSearchQuery?: string) => void;
  scrollToMessageInChat: (messageId: string, highlightSpan?: string) => void;
  chatScrollTarget: { messageId: string; highlightSpan?: string; timestamp: number } | null;
  consumeChatScrollTarget: () => void;
  clearChatTarget: (paneIndex: 1 | 2) => void;

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
  PAGES: 'notehook_pages_v7',
  MENTIONS: 'notehook_mentions_v7',
  AI_SETTINGS: 'notehook_ai_settings_v7',
  WORKSPACE_NAME: 'notehook_workspace_name_v7',
  PINNED_PAGES: 'notehook_pinned_pages_v7',
  WORKSPACES: 'notehook_workspaces_v7',
  CURRENT_WORKSPACE_ID: 'notehook_current_workspace_id_v7',
};

function deduplicateWorkspacePages(rawPages: Page[]): Page[] {
  const result: Page[] = [];
  let hasWelcome = false;
  for (const p of rawPages) {
    const isWelcome =
      p.type === 'note' &&
      (p.title.toLowerCase().includes('welcome') ||
        p.short_id === 'n1' ||
        p.id.startsWith('welcome-note') ||
        p.id === 'seed-welcome-note' ||
        (p.content && p.content.includes('Welcome to Notehook')));

    if (isWelcome) {
      if (!hasWelcome) {
        hasWelcome = true;
        result.push({
          ...p,
          title: 'Welcome to Notehook! 👋',
          content: p.content ? p.content.replace(/^#\s+Welcome[^\n]*\n+/i, '').trim() : '',
        });
      }
    } else {
      result.push(p);
    }
  }
  return result;
}

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
  const { user, loading: authLoading } = useAuth();
  const prevUserIdRef = useRef<string | null>(null);

  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspaceId, setCurrentWorkspaceId] = useState<string>('ws-default');
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
    type: 'note',
    id: 'seed-welcome-note',
    title: 'Welcome to Notehook! 👋',
  });

  const [leftHistory, setLeftHistory] = useState<PaneState[]>([
    {
      type: 'chat',
      id: null,
      title: 'Chat Thread',
    },
  ]);
  const [rightHistory, setRightHistory] = useState<PaneState[]>([
    {
      type: 'note',
      id: 'seed-welcome-note',
      title: 'Welcome to Notehook! 👋',
    },
  ]);
  const [navigationHistory, setNavigationHistory] = useState<PaneState[]>([
    {
      type: 'note',
      id: 'seed-welcome-note',
      title: 'Welcome to Notehook! 👋',
    },
  ]);

  // Initial Local Storage Load (runs once on mount)
  useEffect(() => {
    try {
      localStorage.removeItem('notehook_pages_v6');
      localStorage.removeItem('notehook_mentions_v6');
      localStorage.removeItem('notehook_workspaces_v6');

      const storedWorkspacesRaw = localStorage.getItem(STORAGE_KEYS.WORKSPACES);
      const storedCurrentWorkspaceId = localStorage.getItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID);
      const storedPages = localStorage.getItem(STORAGE_KEYS.PAGES);
      const storedMentions = localStorage.getItem(STORAGE_KEYS.MENTIONS);
      const storedAi = localStorage.getItem(STORAGE_KEYS.AI_SETTINGS);
      const storedWorkspace = localStorage.getItem(STORAGE_KEYS.WORKSPACE_NAME);
      const storedPinned = localStorage.getItem(STORAGE_KEYS.PINNED_PAGES);

      let parsedPinned: string[] = [];
      if (storedPinned) {
        try {
          const parsed = JSON.parse(storedPinned);
          if (Array.isArray(parsed)) parsedPinned = parsed;
        } catch (e) {
          console.error('Failed to parse pinned pages', e);
        }
      }

      const parsedPages: Page[] = storedPages ? JSON.parse(storedPages) : SEED_PAGES;

      const cleanedPages = parsedPages.map((p) => {
        let cleanContent = normalizeRawContentToCanonicalBrackets(p.content || '', parsedPages);
        // Strip out redundant leading markdown H1 (e.g. "# Welcome to Notehook! 👋") so it doesn't duplicate the page's H1 title
        cleanContent = cleanContent.replace(/^#\s+Welcome[^\n]*\n+/i, '').trim();
        let title = p.title || 'Untitled';
        if (title.toLowerCase() === 'welcome' || title === 'Welcome') {
          title = 'Welcome to Notehook! 👋';
        }
        return {
          ...p,
          title,
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

      if (storedWorkspacesRaw) {
        try {
          const parsedWorkspacesRawList: Workspace[] = JSON.parse(storedWorkspacesRaw);
          if (Array.isArray(parsedWorkspacesRawList) && parsedWorkspacesRawList.length > 0) {
            let parsedWorkspaces: Workspace[] = parsedWorkspacesRawList.map((ws) => ({
              ...ws,
              pages: deduplicateWorkspacePages(ws.pages || []),
            }));

            // If the workspace list only has 1 empty workspace with <= 1 page, hydrate with demo seed
            if (parsedWorkspaces.length === 1 && parsedWorkspaces[0].pages.length <= 1) {
              const demoWs = createDefaultDemoWorkspace();
              parsedWorkspaces = [demoWs];
            }

            const activeWs =
              parsedWorkspaces.find((w) => w.id === storedCurrentWorkspaceId) || parsedWorkspaces[0];
            setWorkspaces(parsedWorkspaces);
            setCurrentWorkspaceId(activeWs.id);
            setWorkspaceNameState(activeWs.name || DEFAULT_DEMO_WORKSPACE_NAME);
            setPages(activeWs.pages || []);
            setMentions(activeWs.mentions || []);
            setPinnedPageIds(activeWs.pinnedPageIds || []);
            const activePages = activeWs.pages || [];
            const welcomePage =
              activePages.find((p) => p.type === 'note' && (p.title.toLowerCase().includes('welcome') || p.short_id === 'n1')) ||
              activePages.find((p) => p.type === 'note') ||
              activePages[0];
            if (welcomePage) {
              setRightPane({
                type: welcomePage.type as PaneState['type'],
                id: welcomePage.id,
                title: welcomePage.title,
              });
              setRightHistory([
                {
                  type: welcomePage.type as PaneState['type'],
                  id: welcomePage.id,
                  title: welcomePage.title,
                },
              ]);
            }
          } else {
            throw new Error('Empty workspaces array');
          }
        } catch (e) {
          const demoWs = createDefaultDemoWorkspace();
          setWorkspaces([demoWs]);
          setCurrentWorkspaceId(demoWs.id);
          setWorkspaceNameState(demoWs.name);
          setPages(demoWs.pages);
          setMentions(demoWs.mentions);
          setPinnedPageIds(demoWs.pinnedPageIds || []);

          const welcomePage = demoWs.pages.find((p) => p.id === 'seed-welcome-note') || demoWs.pages[0];
          if (welcomePage) {
            setRightPane({
              type: welcomePage.type as PaneState['type'],
              id: welcomePage.id,
              title: welcomePage.title,
            });
            setRightHistory([
              {
                type: welcomePage.type as PaneState['type'],
                id: welcomePage.id,
                title: welcomePage.title,
              },
            ]);
          }
        }
      } else {
        const demoWs = createDefaultDemoWorkspace();
        setWorkspaces([demoWs]);
        setCurrentWorkspaceId(demoWs.id);
        setWorkspaceNameState(demoWs.name);
        setPages(demoWs.pages);
        setMentions(demoWs.mentions);
        setPinnedPageIds(demoWs.pinnedPageIds || []);

        const welcomePage = demoWs.pages.find((p) => p.id === 'seed-welcome-note') || demoWs.pages[0];
        if (welcomePage) {
          setRightPane({
            type: welcomePage.type as PaneState['type'],
            id: welcomePage.id,
            title: welcomePage.title,
          });
          setRightHistory([
            {
              type: welcomePage.type as PaneState['type'],
              id: welcomePage.id,
              title: welcomePage.title,
            },
          ]);
        }
      }

      if (storedAi) {
        const parsedAi: AISettings = JSON.parse(storedAi);
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

  const isHydratingRef = useRef(false);

  // Supabase User Auth Sync: When signed in, load user's cloud workspaces and pages
  useEffect(() => {
    if (authLoading) return;
    const currentUserId = user?.id || null;
    if (prevUserIdRef.current === currentUserId) return;
    prevUserIdRef.current = currentUserId;

    if (!currentUserId) {
      // User is in guest mode (signed out)
      return;
    }

    const loadUserData = async () => {
      try {
        const remoteData = await fetchUserWorkspacesAndPages(currentUserId);
        if (remoteData.workspaces && remoteData.workspaces.length > 0) {
          // User has existing data in Supabase! Load it cleanly
          const sanitizedWorkspaces = remoteData.workspaces.map((ws) => ({
            ...ws,
            pages: deduplicateWorkspacePages(ws.pages || []),
          }));

          const storedWsId = localStorage.getItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID);
          const activeWs =
            (storedWsId ? sanitizedWorkspaces.find((w) => w.id === storedWsId) : undefined) ||
            (remoteData.activeWorkspaceId ? sanitizedWorkspaces.find((w) => w.id === remoteData.activeWorkspaceId) : undefined) ||
            sanitizedWorkspaces[0];

          const wsPages = activeWs.pages || [];
          const wsMentions = activeWs.mentions || [];
          const wsPinned = activeWs.pinnedPageIds || wsPages.filter((p) => p.pinned).map((p) => p.id);

          isHydratingRef.current = true;

          setWorkspaces(sanitizedWorkspaces);
          setCurrentWorkspaceId(activeWs.id);
          setWorkspaceNameState(activeWs.name || 'My Workspace');
          setPages(wsPages);
          setMentions(wsMentions);
          setPinnedPageIds(wsPinned);

          const welcomePage =
            wsPages.find((p) => p.type === 'note' && (p.title.toLowerCase().includes('welcome') || p.short_id === 'n1')) ||
            wsPages.find((p) => p.type === 'note') ||
            wsPages.find((p) => p.type === 'entity') ||
            wsPages[0];

          if (welcomePage) {
            setRightPane({
              type: welcomePage.type as PaneState['type'],
              id: welcomePage.id,
              title: welcomePage.title,
            });
            setRightHistory([
              {
                type: welcomePage.type as PaneState['type'],
                id: welcomePage.id,
                title: welcomePage.title,
              },
            ]);
          }

          // Cache to local storage immediately
          try {
            localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(remoteData.workspaces));
            localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID, activeWs.id);
            localStorage.setItem(STORAGE_KEYS.PAGES, JSON.stringify(wsPages));
            localStorage.setItem(STORAGE_KEYS.MENTIONS, JSON.stringify(wsMentions));
            localStorage.setItem(STORAGE_KEYS.WORKSPACE_NAME, activeWs.name || 'My Workspace');
            localStorage.setItem(STORAGE_KEYS.PINNED_PAGES, JSON.stringify(wsPinned));
          } catch (e) {
            console.error('Failed to cache remote data locally', e);
          }

          setTimeout(() => {
            isHydratingRef.current = false;
          }, 150);
        } else {
          // First time this user logged in with no cloud records:
          // Sync current initial workspace & pages to Supabase so their data is saved to cloud
          const fallbackPages = pages;
          const initialWs: Workspace = {
            id: `ws-${currentUserId.slice(0, 8)}`,
            name: workspaceName || 'Main Workspace',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            last_opened_at: new Date().toISOString(),
            pages: fallbackPages,
            mentions: mentions,
            pinnedPageIds: pinnedPageIds,
          };
          await syncAllWorkspacesToSupabase(currentUserId, [initialWs]);
        }
      } catch (err) {
        console.error('Failed to load user data from Supabase:', err);
      }
    };

    loadUserData();
  }, [user, authLoading]);

  useEffect(() => {
    if (!isLoaded || !currentWorkspaceId || isHydratingRef.current) return;

    // Update workspaces list with current workspace state
    setWorkspaces((prevWorkspaces) => {
      const existingIdx = prevWorkspaces.findIndex((w) => w.id === currentWorkspaceId);
      let updated: Workspace[];
      if (existingIdx >= 0) {
        updated = prevWorkspaces.map((w) =>
          w.id === currentWorkspaceId
            ? {
                ...w,
                name: workspaceName,
                pages,
                mentions,
                pinnedPageIds,
                updated_at: new Date().toISOString(),
              }
            : w
        );
      } else {
        const newWs: Workspace = {
          id: currentWorkspaceId,
          name: workspaceName,
          created_at: new Date().toISOString(),
          pages,
          mentions,
          pinnedPageIds,
        };
        updated = [...prevWorkspaces, newWs];
      }
      try {
        localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save workspaces', e);
      }
      return updated;
    });

    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID, currentWorkspaceId);
    localStorage.setItem(STORAGE_KEYS.PAGES, JSON.stringify(pages));
    localStorage.setItem(STORAGE_KEYS.MENTIONS, JSON.stringify(mentions));
    localStorage.setItem(STORAGE_KEYS.AI_SETTINGS, JSON.stringify(aiSettings));
    localStorage.setItem(STORAGE_KEYS.WORKSPACE_NAME, workspaceName);
    localStorage.setItem(STORAGE_KEYS.PINNED_PAGES, JSON.stringify(pinnedPageIds));
  }, [pages, mentions, aiSettings, workspaceName, pinnedPageIds, currentWorkspaceId, isLoaded]);

  // Derived filtered page lists
  const messages = pages.filter((p) => p.type === 'message').reverse(); // all have newest first
  const notes = pages.filter((p) => p.type === 'note').reverse();
  const entities = pages.filter((p) => p.type === 'entity').reverse();
  const todos = pages.filter((p) => p.type === 'todo').reverse();
  const decisions = pages.filter((p) => p.type === 'decision').reverse();

  const [lastPagePaneState, setLastPagePaneState] = useState<PaneState | null>({
    type: 'note',
    id: 'seed-welcome-note',
    title: 'Welcome to Notehook! 👋',
  });

  useEffect(() => {
    if (rightPane.type !== 'empty' && rightPane.type !== 'chat') {
      setLastPagePaneState(rightPane);
    } else if (leftPane.type !== 'empty' && leftPane.type !== 'chat') {
      setLastPagePaneState(leftPane);
    }
  }, [leftPane, rightPane]);

  // Pane Navigation Handlers
  const openInPane2 = (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string, targetVersionNum?: number, targetVersionId?: string, autofocusTitle?: boolean, initialSearchQuery?: string, scrollTriggerTime?: number) => {
    // If chat is closed (neither pane is 'chat'), we are in full-screen page view mode.
    // Opening any page (from sidebar, pills, etc.) must update the single active full-screen page (leftPane)
    // and keep rightPane empty, so we never spawn two page view panes side-by-side!
    if (leftPane.type !== 'chat' && rightPane.type !== 'chat' && type !== 'chat') {
      openInPane1(type, id, title, highlightSpan, targetVersionNum, targetVersionId, autofocusTitle, initialSearchQuery, scrollTriggerTime);
      return;
    }

    const newState: PaneState = {
      type,
      id,
      title: title || (type === 'chat' ? 'Chat Thread' : type === 'todo_board' ? 'Todo Board' : type === 'decision_log' ? 'Decision Log' : type === 'entity_index' ? 'Entity Index' : type === 'note_index' ? 'Note Archive' : id || ''),
      highlightSpan,
      targetVersionNum,
      targetVersionId,
      autofocusTitle,
      initialSearchQuery,
      searchTriggerTime: initialSearchQuery ? Date.now() : undefined,
      scrollTriggerTime: scrollTriggerTime ?? (id && (type === 'chat' || type === 'message') ? Date.now() : undefined),
    };
    setRightHistory((prev) => [...prev, newState]);
    setNavigationHistory((prev) => [...prev, newState]);
    setRightPane(newState);
  };

  const openInPane1 = (type: PaneState['type'], id: string | null, title?: string, highlightSpan?: string, targetVersionNum?: number, targetVersionId?: string, autofocusTitle?: boolean, initialSearchQuery?: string, scrollTriggerTime?: number) => {
    const newState: PaneState = {
      type,
      id,
      title: title || (type === 'chat' ? 'Chat Thread' : type === 'todo_board' ? 'Todo Board' : type === 'decision_log' ? 'Decision Log' : type === 'entity_index' ? 'Entity Index' : type === 'note_index' ? 'Note Archive' : id || ''),
      highlightSpan,
      targetVersionNum,
      targetVersionId,
      autofocusTitle,
      initialSearchQuery,
      searchTriggerTime: initialSearchQuery ? Date.now() : undefined,
      scrollTriggerTime: scrollTriggerTime ?? (id && (type === 'chat' || type === 'message') ? Date.now() : undefined),
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
    if (leftPane.type === 'chat') {
      // Closing Chat view from Pane 1: Page view takes up the whole screen
      if (rightPane.type !== 'empty' && rightPane.type !== 'chat') {
        setLeftPane(rightPane);
        setLeftHistory(rightHistory);
        setRightPane({ type: 'empty', id: null });
        setRightHistory([]);
      } else {
        // If rightPane was empty or not a page, restore page view to take up the whole screen
        let targetState = lastPagePaneState;
        if (targetState && targetState.id) {
          const pageExists = pages.some((p) => p.id === targetState?.id);
          if (!pageExists) targetState = null;
        }
        if (!targetState) {
          const firstPage = pages[0];
          targetState = firstPage
            ? { type: firstPage.type, id: firstPage.id, title: firstPage.title }
            : { type: 'todo_board', id: null, title: 'Todo Board' };
        }
        setLeftPane(targetState);
        setLeftHistory([targetState]);
        setRightPane({ type: 'empty', id: null });
        setRightHistory([]);
      }
      return;
    }

    // Closing Page view from Pane 1 (e.g. if swapped):
    if (rightPane.type !== 'empty') {
      setLeftPane(rightPane);
      setLeftHistory(rightHistory);
      setRightPane({ type: 'empty', id: null });
      setRightHistory([]);
    } else {
      // If only page view was open and closed, restore default Chat Thread
      const chatState: PaneState = {
        type: 'chat',
        id: null,
        title: 'Chat Thread',
      };
      setLeftPane(chatState);
      setLeftHistory([chatState]);
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

  const openChat = () => {
    // If chat is already open, do nothing
    if (leftPane.type === 'chat' || rightPane.type === 'chat') return;

    // If leftPane has the active page and rightPane is empty:
    // Move the active page to rightPane and open Chat Thread in leftPane
    if (leftPane.type !== 'empty') {
      if (rightPane.type === 'empty') {
        setRightPane(leftPane);
        setRightHistory(leftHistory.length > 0 ? leftHistory : [leftPane]);
      }
    }

    const chatState: PaneState = {
      type: 'chat',
      id: null,
      title: 'Chat Thread',
    };
    setLeftPane(chatState);
    setLeftHistory((prev) => [...prev, chatState]);
    setNavigationHistory((prev) => [...prev, chatState]);
  };

  const openPageView = () => {
    // If page view is already open in right or left pane, do nothing
    if (
      (rightPane.type !== 'empty' && rightPane.type !== 'chat') ||
      (leftPane.type !== 'empty' && leftPane.type !== 'chat')
    ) {
      return;
    }

    let targetState = lastPagePaneState;
    if (targetState && targetState.id) {
      const pageExists = pages.some((p) => p.id === targetState?.id);
      if (!pageExists) targetState = null;
    }

    if (!targetState) {
      const firstPage = pages[0];
      if (firstPage) {
        targetState = {
          type: firstPage.type,
          id: firstPage.id,
          title: firstPage.title,
        };
      } else {
        targetState = {
          type: 'todo_board',
          id: null,
          title: 'Todo Board',
        };
      }
    }

    setRightPane(targetState);
    setRightHistory([targetState]);
    setNavigationHistory((prev) => [...prev, targetState]);
  };

  const [chatScrollTarget, setChatScrollTarget] = useState<{
    messageId: string;
    highlightSpan?: string;
    timestamp: number;
  } | null>(null);

  const consumeChatScrollTarget = useCallback(() => {
    setChatScrollTarget(null);
  }, []);

  const clearChatTarget = useCallback((paneIndex: 1 | 2) => {
    if (paneIndex === 1) {
      setLeftPane((prev) => {
        if (prev.type === 'chat' && (prev.id || prev.highlightSpan || prev.scrollTriggerTime)) {
          return { ...prev, id: null, highlightSpan: undefined, scrollTriggerTime: undefined };
        }
        return prev;
      });
    } else if (paneIndex === 2) {
      setRightPane((prev) => {
        if (prev.type === 'chat' && (prev.id || prev.highlightSpan || prev.scrollTriggerTime)) {
          return { ...prev, id: null, highlightSpan: undefined, scrollTriggerTime: undefined };
        }
        return prev;
      });
    }
  }, []);

  const scrollToMessageInChat = (messageId: string, highlightSpan?: string) => {
    const triggerTime = Date.now();
    // 1. If neither pane is 'chat' (e.g. page view is taking up full screen):
    // Move the active page to rightPane so it stays open, and put Chat Thread on the left (dual pane mode!)
    if (leftPane.type !== 'chat' && rightPane.type !== 'chat') {
      if (leftPane.type !== 'empty') {
        if (rightPane.type === 'empty') {
          setRightPane(leftPane);
          setRightHistory(leftHistory.length > 0 ? leftHistory : [leftPane]);
        }
      }
      const chatState: PaneState = {
        type: 'chat',
        id: null,
        title: 'Chat Thread',
      };
      setLeftPane(chatState);
      setLeftHistory((prev) => [...prev, chatState]);
      setNavigationHistory((prev) => [...prev, chatState]);
    } else {
      // Chat is already open in one of the panes. Clear any lingering id on it so it never holds onto scroll state.
      if (leftPane.type === 'chat' && leftPane.id) {
        setLeftPane((prev) => ({ ...prev, id: null, highlightSpan: undefined, scrollTriggerTime: undefined }));
      }
      if (rightPane.type === 'chat' && rightPane.id) {
        setRightPane((prev) => ({ ...prev, id: null, highlightSpan: undefined, scrollTriggerTime: undefined }));
      }
    }

    // Set transient one-time scroll target (consumed immediately once scrolled, never held in state)
    setChatScrollTarget({
      messageId,
      highlightSpan,
      timestamp: triggerTime,
    });
  };

  const navigateToMessage = (messageId: string, highlightSpan?: string, title?: string, initialSearchQuery?: string) => {
    const isChatOpen = leftPane.type === 'chat' || rightPane.type === 'chat';

    if (isChatOpen || initialSearchQuery) {
      // Chat pane is already open (or searching) -> open message in page view (Pane 2)
      const msgPage = pages.find((p) => p.id === messageId);
      const displayTitle = title || msgPage?.title || 'Message';
      openInPane2('message', messageId, displayTitle, highlightSpan, undefined, undefined, false, initialSearchQuery);
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
    if (user?.id) {
      upsertPageToSupabase(user.id, newPage, currentWorkspaceId);
    }
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
    if (user?.id) {
      upsertPageToSupabase(user.id, newPage, currentWorkspaceId);
    }
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
    if (user?.id) {
      upsertPageToSupabase(user.id, targetPage, currentWorkspaceId);
    }

    if (sourceNoteId) {
      const newMention: Mention = {
        id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        target_page_id: targetPage.id,
        source_page_id: sourceNoteId,
        snippet: `[@todo: ${uniqueTitle}]`,
        source: 'auto',
        created_at: new Date().toISOString(),
      };
      setMentions((prev) => [newMention, ...prev]);
      if (user?.id) {
        upsertMentionToSupabase(user.id, newMention, currentWorkspaceId);
      }
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
    if (user?.id) {
      upsertPageToSupabase(user.id, targetPage, currentWorkspaceId);
    }

    if (sourceNoteId) {
      const newMention: Mention = {
        id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
        target_page_id: targetPage.id,
        source_page_id: sourceNoteId,
        snippet: `[@decision: ${uniqueTitle}]`,
        source: 'auto',
        created_at: new Date().toISOString(),
      };
      setMentions((prev) => [newMention, ...prev]);
      if (user?.id) {
        upsertMentionToSupabase(user.id, newMention, currentWorkspaceId);
      }
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
    const updatedPagesList: Page[] = pages.map((p) => {
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
    });

    setPages(updatedPagesList);
    if (user?.id) {
      updatedPagesList.forEach((p) => upsertPageToSupabase(user.id, p, currentWorkspaceId));
    }

    // 2. Update mentions snippets
    if (oldTitle) {
      const escapedOld = oldTitle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(escapedOld, 'gi');
      setMentions((prevMentions) =>
        prevMentions.map((m) => {
          if (m.snippet && regex.test(m.snippet)) {
            const updatedM = { ...m, snippet: m.snippet.replace(regex, resolvedTitle) };
            if (user?.id) upsertMentionToSupabase(user.id, updatedM, currentWorkspaceId);
            return updatedM;
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
          const updatedEntity: Page = {
            ...p,
            versions: [...currentVers, newVer],
            canonical_version_id: newVer.id,
            current_version_num: nextVerNum,
            updated_at: new Date().toISOString(),
          };
          if (user?.id) {
            upsertPageToSupabase(user.id, updatedEntity, currentWorkspaceId);
          }
          return updatedEntity;
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
          const updatedEntity: Page = { ...p, versions: updatedVers, updated_at: new Date().toISOString() };
          if (user?.id) {
            upsertPageToSupabase(user.id, updatedEntity, currentWorkspaceId);
          }
          return updatedEntity;
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
          const updatedEntity: Page = {
            ...p,
            versions: currentVers,
            canonical_version_id: versionId,
            content: canonicalVer ? canonicalVer.content : p.content,
            updated_at: new Date().toISOString(),
          };
          if (user?.id) {
            upsertPageToSupabase(user.id, updatedEntity, currentWorkspaceId);
          }
          return updatedEntity;
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
          const updatedEntity: Page = { ...p, versions: currentVers, updated_at: new Date().toISOString() };
          if (user?.id) {
            upsertPageToSupabase(user.id, updatedEntity, currentWorkspaceId);
          }
          return updatedEntity;
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
        if (user?.id) {
          upsertPageToSupabase(user.id, updated, currentWorkspaceId);
        }

        // Check for orphaned mentions if source message content changed
        if (p.type === 'message' || (p.type as string) === 'note') {
          setMentions((prevMentions) =>
            prevMentions.map((m) => {
              if (m.source_page_id !== id) return m;
              const targetPage = pages.find((tp) => tp.id === m.target_page_id);
              if (!targetPage) return m;
              const isStillPresent = newContent.toLowerCase().includes(targetPage.title.toLowerCase());
              const updatedM = { ...m, orphaned: !isStillPresent };
              if (user?.id) upsertMentionToSupabase(user.id, updatedM, currentWorkspaceId);
              return updatedM;
            })
          );
        }

        return updated;
      })
    );
  };

  const updatePageUserPrompt = (id: string, newPrompt: string) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const updated = { ...p, user_prompt: newPrompt, updated_at: new Date().toISOString() };
          if (user?.id) upsertPageToSupabase(user.id, updated, currentWorkspaceId);
          return updated;
        }
        return p;
      })
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
    if (user?.id) {
      deletePagesFromSupabase(user.id, ids);
    }
  };

  const deletePage = (id: string) => {
    deletePages([id]);
  };

  const toggleTodoDone = (id: string) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const updated = { ...p, done: !p.done, updated_at: new Date().toISOString() };
          if (user?.id) upsertPageToSupabase(user.id, updated, currentWorkspaceId);
          return updated;
        }
        return p;
      })
    );
  };

  const toggleTodoStarred = (id: string) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          const updated = { ...p, starred: !p.starred, updated_at: new Date().toISOString() };
          if (user?.id) upsertPageToSupabase(user.id, updated, currentWorkspaceId);
          return updated;
        }
        return p;
      })
    );
  };

  const togglePinPage = (id: string): boolean => {
    const page = pages.find((p) => p.id === id);
    if (!page || (page.type !== 'entity' && page.type !== 'decision' && page.type !== 'note')) {
      return false;
    }

    if (pinnedPageIds.includes(id)) {
      const nextPinned = pinnedPageIds.filter((pid) => pid !== id);
      setPinnedPageIds(nextPinned);
      if (user?.id) {
        const ws = workspaces.find((w) => w.id === currentWorkspaceId);
        if (ws) upsertWorkspaceToSupabase(user.id, { ...ws, pinnedPageIds: nextPinned });
      }
      return false;
    } else {
      if (pinnedPageIds.length >= 3) {
        return false;
      }
      const nextPinned = [...pinnedPageIds, id];
      setPinnedPageIds(nextPinned);
      if (user?.id) {
        const ws = workspaces.find((w) => w.id === currentWorkspaceId);
        if (ws) upsertWorkspaceToSupabase(user.id, { ...ws, pinnedPageIds: nextPinned });
      }
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
    if (user?.id) {
      upsertMentionToSupabase(user.id, newMention, currentWorkspaceId);
    }
    return newMention;
  };

  const removeMention = (mentionId: string) => {
    setMentions((prev) => prev.filter((m) => m.id !== mentionId));
    if (user?.id) {
      deleteMentionFromSupabase(user.id, mentionId);
    }
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
        const newM: Mention = {
          id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
          target_page_id: targetPage.id,
          source_page_id: nId,
          snippet: note ? `Literal occurrence matched in "${note.title}"` : `Retroactive link to [@${targetPage.title}]`,
          source: 'manual',
          created_at: new Date().toISOString(),
        };
        newMentions.push(newM);
        if (user?.id) {
          upsertMentionToSupabase(user.id, newM, currentWorkspaceId);
        }
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

    // Reset any lingering target scroll ID or highlight span on chat panes
    setLeftPane((prev) => (prev.type === 'chat' && (prev.id || prev.highlightSpan || prev.scrollTriggerTime) ? { ...prev, id: null, highlightSpan: undefined, scrollTriggerTime: undefined } : prev));
    setRightPane((prev) => (prev.type === 'chat' && (prev.id || prev.highlightSpan || prev.scrollTriggerTime) ? { ...prev, id: null, highlightSpan: undefined, scrollTriggerTime: undefined } : prev));
    setChatScrollTarget(null);

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
      if (user?.id) {
        upsertPageToSupabase(user.id, messagePage, currentWorkspaceId);
      }

      // Resolve parsed LLM items against existing pages or create new todo/decision pages
      parsedItems.forEach((item) => {
        if (item.type === 'entity') {
          // Closed list lookup
          const matchedEntity = entities.find((e) => e.title.toLowerCase() === item.nameOrTitle.toLowerCase());
          if (matchedEntity) {
            const newM: Mention = {
              id: `men-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
              target_page_id: matchedEntity.id,
              source_page_id: messagePage.id,
              snippet: item.fullText,
              source: 'auto',
              created_at: new Date().toISOString(),
            };
            setMentions((prev) => [newM, ...prev]);
            if (user?.id) {
              upsertMentionToSupabase(user.id, newM, currentWorkspaceId);
            }
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

  const createWorkspace = (name?: string): Workspace => {
    const cleanName = sanitizeWorkspaceName(name || 'New Workspace');
    const welcomeNote = createDefaultWelcomePage();
    const nowIso = new Date().toISOString();
    const newWs: Workspace = {
      id: `ws-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      name: cleanName || 'New Workspace',
      created_at: nowIso,
      updated_at: nowIso,
      last_opened_at: nowIso,
      pages: [welcomeNote],
      mentions: [],
      pinnedPageIds: [],
    };

    setWorkspaces((prev) => {
      const updated = [newWs, ...prev];
      try {
        localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save workspaces', e);
      }
      return updated;
    });

    setCurrentWorkspaceId(newWs.id);
    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID, newWs.id);
    setWorkspaceNameState(newWs.name);
    setPages([welcomeNote]);
    setMentions([]);
    setPinnedPageIds([]);

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
    setRightPane({
      type: 'note',
      id: welcomeNote.id,
      title: welcomeNote.title,
    });
    setRightHistory([
      {
        type: 'note',
        id: welcomeNote.id,
        title: welcomeNote.title,
      },
    ]);

    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID, newWs.id);
    if (user?.id) {
      upsertWorkspaceToSupabase(user.id, newWs);
      upsertPageToSupabase(user.id, welcomeNote, newWs.id);
    }
    return newWs;
  };

  const switchWorkspace = (workspaceId: string) => {
    if (workspaceId === currentWorkspaceId) return;
    const targetWs = workspaces.find((w) => w.id === workspaceId);
    if (!targetWs) return;

    const nowIso = new Date().toISOString();
    setWorkspaces((prev) => {
      const updated = prev.map((w) => (w.id === workspaceId ? { ...w, last_opened_at: nowIso } : w));
      try {
        localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updated));
      } catch (e) {
        console.error('Failed to save workspaces', e);
      }
      return updated;
    });

    setCurrentWorkspaceId(targetWs.id);
    setWorkspaceNameState(targetWs.name);
    const targetPages = targetWs.pages || [];
    setPages(targetPages);
    setMentions(targetWs.mentions || []);
    setPinnedPageIds(targetWs.pinnedPageIds || []);

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

    const welcomePage =
      targetPages.find((p) => p.type === 'note' && (p.title.toLowerCase() === 'welcome' || p.short_id === 'n1')) ||
      targetPages.find((p) => p.type === 'note') ||
      targetPages[0];

    if (welcomePage) {
      setRightPane({
        type: welcomePage.type as PaneState['type'],
        id: welcomePage.id,
        title: welcomePage.title,
      });
      setRightHistory([
        {
          type: welcomePage.type as PaneState['type'],
          id: welcomePage.id,
          title: welcomePage.title,
        },
      ]);
    } else {
      setRightPane({ type: 'empty', id: null });
      setRightHistory([]);
    }

    localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID, targetWs.id);
  };

  const deleteWorkspace = (workspaceId: string) => {
    if (workspaces.length <= 1) {
      // If deleting the only workspace, reset to a fresh workspace
      const freshWs: Workspace = {
        id: `ws-${Date.now()}`,
        name: 'My Workspace',
        created_at: new Date().toISOString(),
        pages: [],
        mentions: [],
        pinnedPageIds: [],
      };
      setWorkspaces([freshWs]);
      setCurrentWorkspaceId(freshWs.id);
      setWorkspaceNameState(freshWs.name);
      setPages([]);
      setMentions([]);
      setPinnedPageIds([]);
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify([freshWs]));
      localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID, freshWs.id);
      if (user?.id) {
        deleteWorkspaceFromSupabase(user.id, workspaceId);
        upsertWorkspaceToSupabase(user.id, freshWs);
      }
      return;
    }

    const remaining = workspaces.filter((w) => w.id !== workspaceId);
    setWorkspaces(remaining);
    localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(remaining));

    if (currentWorkspaceId === workspaceId) {
      const nextWs = remaining[0];
      setCurrentWorkspaceId(nextWs.id);
      setWorkspaceNameState(nextWs.name);
      setPages(nextWs.pages || []);
      setMentions(nextWs.mentions || []);
      setPinnedPageIds(nextWs.pinnedPageIds || []);
      localStorage.setItem(STORAGE_KEYS.CURRENT_WORKSPACE_ID, nextWs.id);
    }
    if (user?.id) {
      deleteWorkspaceFromSupabase(user.id, workspaceId);
    }
  };

  const renameWorkspace = (workspaceId: string, newName: string) => {
    const cleanName = sanitizeWorkspaceName(newName);
    if (!cleanName) return;

    setWorkspaces((prev) => {
      const updated = prev.map((ws) =>
        ws.id === workspaceId ? { ...ws, name: cleanName, updated_at: new Date().toISOString() } : ws
      );
      localStorage.setItem(STORAGE_KEYS.WORKSPACES, JSON.stringify(updated));
      return updated;
    });

    if (currentWorkspaceId === workspaceId) {
      setWorkspaceNameState(cleanName);
    }
    if (user?.id) {
      const targetWs = workspaces.find((w) => w.id === workspaceId);
      if (targetWs) {
        upsertWorkspaceToSupabase(user.id, { ...targetWs, name: cleanName });
      }
    }
  };

  const clearAllData = () => {
    localStorage.clear();
    const demoWs = createDefaultDemoWorkspace();
    setWorkspaces([demoWs]);
    setCurrentWorkspaceId(demoWs.id);
    setWorkspaceNameState(demoWs.name);
    setPages(demoWs.pages);
    setMentions(demoWs.mentions);
    setPinnedPageIds(demoWs.pinnedPageIds || []);
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
    const welcomeNote = demoWs.pages.find((p) => p.id === 'seed-welcome-note') || demoWs.pages[0];
    setRightPane({
      type: welcomeNote.type as PaneState['type'],
      id: welcomeNote.id,
      title: welcomeNote.title,
    });
    setRightHistory([
      {
        type: welcomeNote.type as PaneState['type'],
        id: welcomeNote.id,
        title: welcomeNote.title,
      },
    ]);
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
        workspaces,
        currentWorkspaceId,
        createWorkspace,
        switchWorkspace,
        deleteWorkspace,
        renameWorkspace,
        leftPane,
        rightPane,
        leftHistory,
        rightHistory,
        navigationHistory,
        openInPane2,
        openInPane1,
        closePane1,
        closePane2,
        openChat,
        openPageView,
        swapPanes,
        navigateToMessage,
        scrollToMessageInChat,
        chatScrollTarget,
        consumeChatScrollTarget,
        clearChatTarget,
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

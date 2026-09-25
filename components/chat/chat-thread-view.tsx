'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNotehook } from '@/lib/context';
import { Sparkles, Tag, CheckSquare, Square, Zap, FileText, BookmarkPlus, Check, Plus, ChevronDown, Copy, ChevronRight, ChevronLeft, Trash2 } from 'lucide-react';
import { convertNotehookTextToHtml, findPageForPill, scrollToMentionOrElement, selectMarkdownBlock, clearMarkdownBlockSelection, syncMultiBlockSelection, handleGutterRangeClick, handleGutterMouseDown, untagReferences, formatItemTitle } from '@/lib/notehook-parser';
import { SuggestionList } from '../ai/suggestion-list';
import { SuggestionItem } from '@/lib/ranking';
import { AIChatInput } from '../ai/ai-chat-input';

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

interface ChatThreadViewProps {
  paneIndex?: 1 | 2;
}

export const ChatThreadView: React.FC<ChatThreadViewProps> = ({ paneIndex = 1 }) => {
  const { messages, pages, mentions, openInPane2, openInPane1, navigateToMessage, isAiGenerating, aiStreamingText, aiStreamingPrompt, leftPane, rightPane, addEntityVersion, createEntityPage, createNotePage, deletePage } = useNotehook();
  const isDualPane = paneIndex === 2 || rightPane.type !== 'empty';
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const currentPane = paneIndex === 2 ? rightPane : leftPane;

  const [openSaveMenuNoteId, setOpenSaveMenuNoteId] = useState<string | null>(null);
  const [saveMenuView, setSaveMenuView] = useState<'root' | 'entity'>('root');
  const [savedToast, setSavedToast] = useState<{ noteId: string; label: string } | null>(null);
  const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
  const [copiedShortId, setCopiedShortId] = useState<string | null>(null);

  const [isScrolledUp, setIsScrolledUp] = useState(false);
  const [hasUnreadAtBottom, setHasUnreadAtBottom] = useState(false);
  const prevMessagesLengthRef = useRef(messages.length);
  const prevAiStreamingRef = useRef(Boolean(aiStreamingText));

  const checkScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isUp = distanceFromBottom > 60;
    setIsScrolledUp(isUp);
    if (!isUp) {
      setHasUnreadAtBottom(false);
    }
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', checkScrollPosition, { passive: true });
    checkScrollPosition();
    return () => container.removeEventListener('scroll', checkScrollPosition);
  }, [checkScrollPosition, messages.length]);

  // Track unread messages arriving when user is scrolled up (NEVER auto-scroll)
  useEffect(() => {
    const messageCountIncreased = messages.length > prevMessagesLengthRef.current;
    const aiStartedStreaming = Boolean(aiStreamingText) && !prevAiStreamingRef.current;

    prevMessagesLengthRef.current = messages.length;
    prevAiStreamingRef.current = Boolean(aiStreamingText);

    if ((messageCountIncreased || aiStartedStreaming) && isScrolledUp) {
      setHasUnreadAtBottom(true);
    }
  }, [messages.length, aiStreamingText, isScrolledUp]);

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setHasUnreadAtBottom(false);
    setIsScrolledUp(false);
  };

  const handleCopyShortId = (shortId: string) => {
    const textToCopy = `[@${shortId}]`;
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
    }
    setCopiedShortId(shortId);
    setTimeout(() => setCopiedShortId(null), 1800);
  };

  const entityPages = pages.filter((p) => p.type === 'entity');

  useEffect(() => {
    if (!openSaveMenuNoteId) return;
    const handleClickOutside = () => {
      setOpenSaveMenuNoteId(null);
      setSaveMenuView('root');
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpenSaveMenuNoteId(null);
        setSaveMenuView('root');
      }
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openSaveMenuNoteId]);

  // 1. Navigation effect: Scroll to specific message / mention reliably over multiple layout frames
  useEffect(() => {
    if ((currentPane.type === 'message' || currentPane.type === 'chat') && currentPane.id) {
      const targetId = currentPane.id;
      const targetHighlightSpan = currentPane.highlightSpan;

      let canceled = false;
      let attempts = 0;
      const maxAttempts = 10;

      const attemptScroll = () => {
        if (canceled) return;
        attempts++;
        const container = scrollContainerRef.current;
        if (!container) {
          if (attempts < maxAttempts) setTimeout(attemptScroll, 40);
          return;
        }

        const cleanTargetId = targetId.toLowerCase().replace(/^page-/, '');
        const matchedPage = pages.find(
          (p) => p.id === targetId || p.id === cleanTargetId || (p.short_id && p.short_id.toLowerCase() === cleanTargetId)
        );
        const resolvedId = matchedPage?.id || targetId;

        const el =
          document.getElementById(`page-${resolvedId}`) ||
          document.getElementById(`page-${targetId}`) ||
          document.getElementById(`page-${cleanTargetId}`) ||
          (container.querySelector(
            `[data-page-id="${resolvedId}"], [data-page-id="${targetId}"], [data-page-id="${cleanTargetId}"], [data-message-id="${resolvedId}"], [data-message-id="${targetId}"], [data-page-short-id="${cleanTargetId}"]`
          ) as HTMLElement | null);

        if (el) {
          const elRect = el.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const currentScrollTop = container.scrollTop;
          const targetScrollTop = Math.max(
            0,
            currentScrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2)
          );

          container.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
          return;
        }

        if (attempts < maxAttempts) {
          setTimeout(attemptScroll, 50);
        }
      };

      const timer = setTimeout(attemptScroll, 20);
      return () => {
        canceled = true;
        clearTimeout(timer);
      };
    }
  }, [currentPane.type, currentPane.id, currentPane.highlightSpan, currentPane, pages]);

  // 2. PRESERVED: Navigation scroll to mentions handled by Effect #1 above.
  // Automatic scroll to bottom is disabled to prevent scroll displacement.

  const sortedNotes = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    handleGutterMouseDown(e, e.currentTarget as HTMLElement);
  };

  const handleInlinePillClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const targetEl = e.target as HTMLElement;
    const isGutter = handleGutterRangeClick(targetEl, e.currentTarget as HTMLElement, e.shiftKey);
    if (isGutter) {
      e.stopPropagation();
      return;
    }

    const target = (e.target as HTMLElement).closest('.page-mention-pill, [data-entity], [data-title]') as HTMLElement;
    if (!target) return;

    const matchedPage = findPageForPill(target, pages);

    if (matchedPage) {
      e.stopPropagation();
      if (matchedPage.type === 'message') {
        const targetSpan = target.getAttribute('data-full') || target.getAttribute('data-title') || target.getAttribute('data-short-id') || target.textContent?.trim();
        navigateToMessage(matchedPage.id, targetSpan, matchedPage.title);
        return;
      }
      const displayTitle = matchedPage.type === 'entity' ? `@${matchedPage.title}` : matchedPage.title;
      const targetSpan = target.getAttribute('data-full') || target.getAttribute('data-title') || target.getAttribute('data-short-id') || target.textContent?.trim();
      const versionNumAttr = target.getAttribute('data-version-num');
      const targetVersionNum = versionNumAttr ? parseInt(versionNumAttr, 10) : undefined;
      openInPane2(matchedPage.type as any, matchedPage.id, displayTitle, targetSpan, targetVersionNum);
    }
  };

  const handleCopyAndOpenMenu = (note: (typeof messages)[0]) => {
    const textToCopy = note.content || note.title;
    if (typeof window !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
    }
    setCopiedNoteId(note.id);
    setTimeout(() => setCopiedNoteId(null), 1800);

    if (openSaveMenuNoteId === note.id) {
      setOpenSaveMenuNoteId(null);
      setSaveMenuView('root');
    } else {
      setOpenSaveMenuNoteId(note.id);
      setSaveMenuView('root');
    }
  };

  const handleSaveToNewNote = (content: string, noteId: string) => {
    const cleanBodyText = content;
    const untaggedForTitle = untagReferences(cleanBodyText);
    const cleanTitle = formatItemTitle(untaggedForTitle, 45) || 'New Note';
    const newNote = createNotePage(cleanTitle, content);
    openInPane2('note', newNote.id, newNote.title);
    setOpenSaveMenuNoteId(null);
    setSaveMenuView('root');
    setSavedToast({ noteId, label: 'Saved as Note' });
    setTimeout(() => setSavedToast(null), 2500);
  };

  const handleSaveToEntity = (entityId: string, content: string, noteId: string) => {
    const entity = pages.find((p) => p.id === entityId);
    if (!entity) return;

    addEntityVersion(entityId, undefined, content);
    openInPane2('entity', entityId, `@${entity.title}`);
    setOpenSaveMenuNoteId(null);
    setSaveMenuView('root');
    setSavedToast({ noteId, label: 'Saved as Version' });
    setTimeout(() => setSavedToast(null), 2500);
  };

  const handleCreateAndSaveEntity = (content: string, noteId: string) => {
    const newEntity = createEntityPage('New Entity', '');
    addEntityVersion(newEntity.id, undefined, content);
    openInPane2('entity', newEntity.id, `@${newEntity.title}`);
    setOpenSaveMenuNoteId(null);
    setSaveMenuView('root');
    setSavedToast({ noteId, label: 'Saved as Version' });
    setTimeout(() => setSavedToast(null), 2500);
  };

  const chatRootSuggestions: SuggestionItem[] = [
    {
      id: 'copy-to-new-note',
      title: 'Save to New Note',
      type: 'page',
      itemType: 'note',
      primitiveType: 'note',
      description: 'Create a new note with response text',
      score: 1000,
      scopeLabel: 'Note',
    },
    {
      id: 'open-save-to-entity-menu',
      title: 'Save to Entity',
      type: 'page',
      itemType: 'entity',
      description: 'Save response to an entity',
      score: 950,
      scopeLabel: 'Entity',
    },
  ];

  const chatEntitySuggestions: SuggestionItem[] = [
    ...entityPages.map((ent) => ({
      id: `save-as-entity-${ent.id}`,
      title: `Save as [@${ent.title}]`,
      type: 'page' as const,
      itemType: 'entity' as const,
      description: `Save response into @${ent.title}`,
      score: 1000,
      scopeLabel: `v${(ent.versions?.length || 0) + 1}`,
      pageId: ent.id,
      shortId: ent.short_id,
    })),
    {
      id: 'save-to-entity',
      title: '+ Create New Entity',
      type: 'page' as const,
      itemType: 'entity' as const,
      description: 'Save response to a new entity',
      score: 900,
      scopeLabel: 'New',
      isBold: true,
    },
  ];

  const handleSelectChatSuggestion = (item: SuggestionItem, currentNote: (typeof messages)[0]) => {
    if (item.id === 'open-save-to-entity-menu') {
      setSaveMenuView('entity');
      return;
    }
    if (item.id === 'copy-to-new-note') {
      handleSaveToNewNote(currentNote.content || currentNote.title, currentNote.id);
      return;
    }
    if (item.id === 'save-to-entity') {
      handleCreateAndSaveEntity(currentNote.content || currentNote.title, currentNote.id);
      return;
    }
    if (item.pageId) {
      handleSaveToEntity(item.pageId, currentNote.content || currentNote.title, currentNote.id);
      return;
    }
  };

  return (
    <div data-chat-thread="true" className="relative flex flex-col h-full w-full bg-white text-zinc-900 overflow-hidden select-text font-sans">
      {/* Sticky Floating Action Button when scrolled up */}
      {isScrolledUp && (
        <button
          type="button"
          onClick={scrollToBottom}
          className={`absolute bottom-4 left-1/2 -translate-x-1/2 z-30 transition-all cursor-pointer shadow-sm select-none px-3.5 py-1.5 rounded-full text-xs flex items-center gap-1.5 border backdrop-blur-md ${hasUnreadAtBottom
            ? 'bg-zinc-100/95 text-zinc-950 border-zinc-300/90 hover:bg-zinc-200/90 font-bold shadow-md'
            : 'bg-white/95 text-zinc-600 border-zinc-200/90 hover:bg-zinc-50 hover:text-zinc-950 font-medium'
            }`}
          title={hasUnreadAtBottom ? 'New unread messages below — click to scroll down' : 'Scroll to bottom'}
        >
          {hasUnreadAtBottom ? (
            <span className="w-2 h-2 rounded-full bg-green-600 animate-pulse shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          )}
          <span>{hasUnreadAtBottom ? 'New messages below' : 'Scroll to bottom'}</span>
        </button>
      )}
      {/* Scrollable Chat Conversation Feed */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden space-y-6 bg-white p-4 md:p-6">
        {sortedNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center space-y-3">
            <div className="p-3 bg-zinc-900 text-white rounded-2xl shadow-sm">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-zinc-950">Notehook Chatbot</h3>
            <p className="text-xs text-zinc-500 max-w-sm leading-relaxed">
              Welcome to Notehook. Here is how your workspace is organized:

              Entities — Version-controlled technical specs and schemas compiled directly for coding agents.

              Decisions — Architectural trade-offs and rules auto-extracted via @decision: to prevent agent drift.

              Todos — Actionable engineering tasks auto-collected via @todo: into a dedicated backlog.

              Notes — Sacred, user-only scratchpads for messy thoughts and logs that AI will never edit.

              Chat below to start extracting concepts, or highlight any text
            </p>
          </div>
        ) : (
          sortedNotes.map((note) => {
            const isUserTurnOnly = note.role === 'user' || (note.user_prompt === note.content && note.role !== 'assistant');

            return (
              <div key={note.id} id={`page-${note.id}`} data-page-id={note.id} data-message-id={note.id} data-page-short-id={note.short_id || ''} onClick={handleInlinePillClick} onMouseDown={handleMouseDown} className="w-full space-y-2 relative">
                {/* Turn Header: ID pill on left (aligned with AI response bubble), View as Page & Time on right */}
                <div className="flex items-center justify-between w-full px-0 text-[10px] text-zinc-400 font-medium select-none" data-ignore-selection="true">
                  <div>
                    {note.short_id && (
                      <button
                        type="button"
                        data-short-id={note.short_id}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCopyShortId(note.short_id!);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium bg-zinc-100/90 text-zinc-600 hover:text-zinc-950 border border-zinc-200/90 hover:border-zinc-300 hover:bg-zinc-200/70 transition-all shadow-2xs cursor-pointer select-none"
                        title="Copy id"
                      >
                        {copiedShortId === note.short_id ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span className="text-emerald-700 font-sans font-semibold text-[11px]">Copied!</span>
                          </>
                        ) : (
                          <span>[@{note.short_id}]</span>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openInPane2('message', note.id, note.title, note.short_id || note.title)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white text-zinc-700 hover:text-zinc-950 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/80 transition-colors shadow-2xs cursor-pointer select-none"
                      title="View Message as Page"
                    >
                      <FileText className="w-3 h-3 text-zinc-500 select-none" />
                      <span className="select-none">View as Page</span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deletePage(note.id);
                      }}
                      className="inline-flex items-center justify-center p-1 rounded-full bg-white text-zinc-400 hover:text-red-600 border border-zinc-200 hover:border-red-200 hover:bg-red-50/80 transition-colors shadow-2xs cursor-pointer select-none"
                      title="Delete message from chat and AI context"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                    <span className="select-none">
                      {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* 1. User Prompt Message Bubble (Right Aligned, Light Gray) */}
                {note.user_prompt && (
                  <div className="w-full relative notehook-user-prompt-turn">
                    <div className="flex flex-col items-end text-right ml-auto max-w-xl w-full">
                      <div
                        onClick={handleInlinePillClick}
                        onMouseDown={handleMouseDown}
                        className="p-3.5 rounded-2xl rounded-tr-xs bg-zinc-100/90 border border-zinc-200/80 text-zinc-900 text-xs md:text-sm leading-relaxed shadow-2xs text-left font-sans w-full cursor-text"
                      >
                        <div
                          dangerouslySetInnerHTML={{
                            __html: convertNotehookTextToHtml(note.user_prompt, 'auto', pages),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. AI Assistant Response Bubble (Left Aligned) */}
                {!isUserTurnOnly && (
                  <div className="flex flex-col items-start space-y-1.5 mr-auto relative w-full">

                    {/* Assistant Response Bubble */}
                    <div
                      onClick={handleInlinePillClick}
                      onMouseDown={handleMouseDown}
                      className="p-4 pb-10 rounded-2xl rounded-tl-xs bg-white border border-zinc-200/90 text-xs md:text-sm text-zinc-900 shadow-2xs leading-relaxed w-full relative"
                    >
                      <div
                        dangerouslySetInnerHTML={{
                          __html: convertNotehookTextToHtml(note.content || note.title, 'auto', pages),
                        }}
                      />

                      {/* Copy & Save Menu in Bottom Right Corner */}
                      <div className="absolute right-3 bottom-2.5 flex items-center gap-1 select-none" data-ignore-selection="true">
                        {savedToast?.noteId === note.id ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs animate-in fade-in duration-150">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{savedToast.label}</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopyAndOpenMenu(note);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100/90 hover:bg-zinc-200/80 border border-zinc-200/90 text-[11px] font-medium text-zinc-600 hover:text-zinc-950 transition-colors shadow-2xs cursor-pointer"
                            title="Copy response to clipboard and choose save option"
                          >
                            {copiedNoteId === note.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span className="text-emerald-700 font-semibold">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-zinc-500" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}

                        {/* Popover Menu displaying options */}
                        {openSaveMenuNoteId === note.id && (
                          <div
                            className="absolute right-0 bottom-full mb-1.5 z-50 w-72 bg-white rounded-md border border-zinc-200/90 shadow-xl overflow-hidden flex flex-col text-xs animate-in fade-in zoom-in-95 duration-100 select-none text-left"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {saveMenuView === 'entity' && (
                              <div className="flex items-center gap-1.5 px-2 py-1.5 bg-zinc-50/90 border-b border-zinc-100 text-xs text-zinc-700 select-none">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSaveMenuView('root');
                                  }}
                                  className="p-1 rounded hover:bg-zinc-200/80 text-zinc-500 hover:text-zinc-900 transition-colors cursor-pointer"
                                  title="Back to options"
                                >
                                  <ChevronLeft className="w-3.5 h-3.5" />
                                </button>
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                  Save as Version for Entity:
                                </span>
                              </div>
                            )}
                            <SuggestionList
                              items={saveMenuView === 'entity' ? chatEntitySuggestions : chatRootSuggestions}
                              selectedIndex={-1}
                              onSelect={(item) => handleSelectChatSuggestion(item, note)}
                              className="border-0 shadow-none rounded-none w-full"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Streaming Turn State (User Prompt + AI Assistant Response) */}
        {isAiGenerating && (
          <div className="w-full space-y-3">
            {/* User Prompt Bubble */}
            {aiStreamingPrompt && (
              <div className="flex flex-col items-end text-right space-y-1 ml-auto max-w-xl w-full">
                <div className="flex items-center justify-end gap-2.5 w-full px-1 text-[10px] text-zinc-400 font-medium select-none">
                  <span>Just now</span>
                </div>
                <div
                  onClick={handleInlinePillClick}
                  className="p-3.5 rounded-2xl rounded-tr-xs bg-zinc-100/90 border border-zinc-200/80 text-zinc-900 text-xs md:text-sm leading-relaxed shadow-2xs text-left font-sans w-full cursor-text"
                >
                  <div
                    dangerouslySetInnerHTML={{
                      __html: convertNotehookTextToHtml(aiStreamingPrompt, 'auto', pages),
                    }}
                  />
                </div>
              </div>
            )}

            {/* AI Assistant Streaming Response Bubble */}
            <div className="flex flex-col items-start space-y-1.5 mr-auto relative w-full">
              <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-semibold px-1">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                <span>AI Assistant typing…</span>
              </div>
              <div
                onClick={handleInlinePillClick}
                className="p-4 rounded-2xl rounded-tl-xs bg-white border border-zinc-200/90 text-xs md:text-sm text-zinc-900 shadow-2xs leading-relaxed w-full min-h-[48px]"
              >
                {aiStreamingText ? (
                  <div
                    dangerouslySetInnerHTML={{
                      __html: convertNotehookTextToHtml(aiStreamingText, 'auto', pages),
                    }}
                  />
                ) : (
                  <span className="text-zinc-400 italic animate-pulse">Extracting decisions & todos…</span>
                )}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};



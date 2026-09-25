'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePlanet } from '@/lib/context';
import { Sparkles, Tag, CheckSquare, Square, Zap, FileText, BookmarkPlus, Check, Plus } from 'lucide-react';
import { convertScribeTextToHtml, findPageForPill, scrollToMentionOrElement, selectMarkdownBlock, clearMarkdownBlockSelection, syncMultiBlockSelection, handleGutterRangeClick, handleGutterMouseDown } from '@/lib/scribe-parser';

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
  const { messages, pages, mentions, openInPane2, openInPane1, isAiGenerating, aiStreamingText, aiStreamingPrompt, leftPane, rightPane, addEntityVersion, createEntityPage } = usePlanet();
  const isDualPane = paneIndex === 2 || rightPane.type !== 'empty';
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentPane = paneIndex === 2 ? rightPane : leftPane;

  const [openSaveMenuNoteId, setOpenSaveMenuNoteId] = useState<string | null>(null);
  const [savedToastNoteId, setSavedToastNoteId] = useState<string | null>(null);
  const [copiedShortId, setCopiedShortId] = useState<string | null>(null);

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
    const handleClickOutside = () => setOpenSaveMenuNoteId(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenSaveMenuNoteId(null);
    };
    window.addEventListener('click', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [openSaveMenuNoteId]);

  useEffect(() => {
    // If currentPane targets a specific page message, scroll to the exact mention inside it smoothly
    if ((currentPane.type === 'message' || currentPane.type === 'chat') && currentPane.id) {
      const el = document.getElementById(`page-${currentPane.id}`);
      if (el) {
        const timer = setTimeout(() => {
          scrollToMentionOrElement(el, currentPane.highlightSpan);
        }, 60);
        return () => clearTimeout(timer);
      }
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, aiStreamingText, currentPane.id, currentPane.highlightSpan]);

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
      const displayTitle = matchedPage.type === 'entity' ? `@${matchedPage.title}` : matchedPage.title;
      const targetSpan = target.getAttribute('data-full') || target.getAttribute('data-title') || target.getAttribute('data-short-id') || target.textContent?.trim();
      openInPane2(matchedPage.type as any, matchedPage.id, displayTitle, targetSpan);
    }
  };

  const handleSaveToEntity = (entityId: string, content: string, noteId: string) => {
    const entity = pages.find((p) => p.id === entityId);
    if (!entity) return;

    addEntityVersion(entityId, undefined, content);
    openInPane2('entity', entityId, `@${entity.title}`);
    setOpenSaveMenuNoteId(null);
    setSavedToastNoteId(noteId);
    setTimeout(() => setSavedToastNoteId(null), 2500);
  };

  const handleCreateAndSaveEntity = (content: string, noteId: string) => {
    const newEntity = createEntityPage('New Entity', content);
    addEntityVersion(newEntity.id, undefined, content);
    openInPane2('entity', newEntity.id, `@${newEntity.title}`);
    setOpenSaveMenuNoteId(null);
    setSavedToastNoteId(noteId);
    setTimeout(() => setSavedToastNoteId(null), 2500);
  };

  return (
    <div data-chat-thread="true" className="relative flex flex-col h-full w-full bg-white text-zinc-900 overflow-hidden select-text font-sans">
      {/* Scrollable Chat Conversation Feed */}
      <div className={`flex-1 overflow-y-auto overflow-x-hidden space-y-6 bg-white ${isDualPane ? 'p-4 pl-10 md:p-6 md:pl-14' : 'p-4 md:p-6'}`}>
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
              <div key={note.id} id={`page-${note.id}`} data-message-id={note.id} onClick={handleInlinePillClick} onMouseDown={handleMouseDown} className="max-w-3xl mx-auto space-y-2 relative">
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
                    <span className="select-none">
                      {new Date(note.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                {/* 1. User Prompt Message Bubble (Right Aligned, Light Gray) */}
                {note.user_prompt && (
                  <div className="w-full relative scribe-user-prompt-turn">
                    <div className="flex flex-col items-end text-right ml-auto max-w-xl w-full">
                      <div
                        onClick={handleInlinePillClick}
                        onMouseDown={handleMouseDown}
                        className="p-3.5 rounded-2xl rounded-tr-xs bg-zinc-100/90 border border-zinc-200/80 text-zinc-900 text-xs md:text-sm leading-relaxed shadow-2xs text-left font-sans w-full cursor-text"
                      >
                        <div
                          dangerouslySetInnerHTML={{
                            __html: convertScribeTextToHtml(note.user_prompt, 'auto', pages),
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. AI Assistant Response Bubble (Left Aligned) */}
                {!isUserTurnOnly && (
                  <div className="flex flex-col items-start space-y-1.5 mr-auto max-w-2xl relative w-full">

                    {/* Assistant Response Bubble */}
                    <div
                      onClick={handleInlinePillClick}
                      onMouseDown={handleMouseDown}
                      className="p-4 pb-10 rounded-2xl rounded-tl-xs bg-white border border-zinc-200/90 text-xs md:text-sm text-zinc-900 shadow-2xs leading-relaxed w-full relative"
                    >
                      <div
                        dangerouslySetInnerHTML={{
                          __html: convertScribeTextToHtml(note.content || note.title, 'auto', pages),
                        }}
                      />

                      {/* Save as Entity Version Button in Bottom Right Corner (2-Click Flow) */}
                      <div className="absolute right-3 bottom-2.5 flex items-center gap-1 select-none" data-ignore-selection="true">
                        {savedToastNoteId === note.id ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs animate-in fade-in duration-150">
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Saved as Version</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenSaveMenuNoteId(openSaveMenuNoteId === note.id ? null : note.id);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-zinc-100/90 hover:bg-zinc-200/80 border border-zinc-200/90 text-[11px] font-semibold text-zinc-600 hover:text-zinc-950 transition-colors shadow-2xs cursor-pointer"
                            title="Save response as Entity Version (2-click)"
                          >
                            <BookmarkPlus className="w-3.5 h-3.5 text-zinc-500" />
                            <span>Save to Entity</span>
                          </button>
                        )}

                        {/* Popover Menu displaying all entities in scope */}
                        {openSaveMenuNoteId === note.id && (
                          <div
                            className="absolute right-0 bottom-full mb-1 z-50 w-64 bg-white rounded-xl border border-zinc-200 shadow-xl p-1.5 text-xs animate-in fade-in zoom-in-95 duration-100 select-none text-left"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider border-b border-zinc-100 mb-1">
                              Save as Version for Entity:
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-0.5">
                              {entityPages.length === 0 ? (
                                <div className="px-2 py-1.5 text-[11px] text-zinc-400 italic">
                                  No entities in scope yet
                                </div>
                              ) : (
                                entityPages.map((ent) => (
                                  <button
                                    key={ent.id}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveToEntity(ent.id, note.content || note.title, note.id);
                                    }}
                                    className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between hover:bg-zinc-100 transition-colors cursor-pointer group"
                                  >
                                    <div className="flex items-center gap-2 truncate min-w-0">
                                      <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                                      <span className="truncate font-semibold text-zinc-800 group-hover:text-zinc-950">
                                        {ent.title}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-zinc-400 font-mono shrink-0 ml-1">
                                      +v{(ent.versions?.length || 1) + 1}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>

                            <div className="pt-1 mt-1 border-t border-zinc-100">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCreateAndSaveEntity(note.content || note.title, note.id);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 text-indigo-600 hover:bg-indigo-50 font-bold transition-colors cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5 shrink-0" />
                                <span>Create New Entity</span>
                              </button>
                            </div>
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
          <div className="max-w-3xl mx-auto space-y-3">
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
                      __html: convertScribeTextToHtml(aiStreamingPrompt, 'auto', pages),
                    }}
                  />
                </div>
              </div>
            )}

            {/* AI Assistant Streaming Response Bubble */}
            <div className="flex flex-col items-start space-y-1.5 mr-auto max-w-2xl relative w-full">
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
                      __html: convertScribeTextToHtml(aiStreamingText, 'auto', pages),
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



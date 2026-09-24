'use client';

import React, { useRef, useEffect } from 'react';
import { usePlanet } from '@/lib/context';
import { Sparkles, Tag, CheckSquare, Zap, FileText } from 'lucide-react';
import { convertScribeTextToHtml, findPageForPill } from '@/lib/scribe-parser';

interface ChatThreadViewProps {
  paneIndex?: 1 | 2;
}

export const ChatThreadView: React.FC<ChatThreadViewProps> = ({ paneIndex = 1 }) => {
  const { messages, pages, mentions, openInPane2, openInPane1, isAiGenerating, aiStreamingText, leftPane } = usePlanet();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // If leftPane targets a specific page message, scroll to it smoothly
    if (leftPane.type === 'message' && leftPane.id) {
      const el = document.getElementById(`page-${leftPane.id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
    }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, aiStreamingText, leftPane.id]);

  const sortedNotes = [...messages].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const handleInlinePillClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.page-mention-pill, [data-entity], [data-title]') as HTMLElement;
    if (!target) return;

    const matchedPage = findPageForPill(target, pages);

    if (matchedPage) {
      e.stopPropagation();
      const displayTitle = matchedPage.type === 'entity' ? `@${matchedPage.title}` : matchedPage.title;
      openInPane2(matchedPage.type as any, matchedPage.id, displayTitle);
    }
  };

  return (
    <div data-chat-thread="true" className="relative flex flex-col h-full w-full bg-white text-zinc-900 overflow-hidden select-text font-sans">
      {/* Scrollable Chat Conversation Feed */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 bg-white">
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
              <div key={note.id} id={`page-${note.id}`} data-message-id={note.id} className="max-w-3xl mx-auto space-y-3">
                {/* 1. User Prompt Message Bubble (Right Aligned, Light Gray) */}
                {note.user_prompt && (
                  <div className="flex flex-col items-end text-right space-y-1 ml-auto max-w-xl w-full">
                    <div className="flex items-center justify-end gap-2.5 w-full px-1 text-[10px] text-zinc-400 font-medium select-none" data-ignore-selection="true">
                      <button
                        type="button"
                        onClick={() => openInPane2('message', note.id, note.title)}
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
                    <div className="p-3.5 rounded-2xl rounded-tr-xs bg-zinc-100/90 border border-zinc-200/80 text-zinc-900 text-xs md:text-sm leading-relaxed shadow-2xs text-left font-sans w-full">
                      {note.user_prompt}
                    </div>
                  </div>
                )}

                {/* 2. AI Assistant Response Bubble (Left Aligned) */}
                {!isUserTurnOnly && (
                  <div className="flex flex-col items-start space-y-1.5 mr-auto max-w-2xl relative w-full">

                    {!note.user_prompt && (
                      <div className="flex items-center justify-end w-full px-1 select-none" data-ignore-selection="true">
                        <button
                          type="button"
                          onClick={() => openInPane2('message', note.id, note.title)}
                          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-white text-zinc-700 hover:text-zinc-950 border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50/80 transition-colors shadow-2xs cursor-pointer select-none"
                          title="View Message as Page"
                        >
                          <FileText className="w-3 h-3 text-zinc-500 select-none" />
                          <span className="select-none">View as Page</span>
                        </button>
                      </div>
                    )}

                    {/* Assistant Response Bubble */}
                    <div
                      onClick={handleInlinePillClick}
                      className="p-4 rounded-2xl rounded-tl-xs bg-white border border-zinc-200/90 text-xs md:text-sm text-zinc-900 shadow-2xs leading-relaxed w-full"
                    >
                      <div
                        dangerouslySetInnerHTML={{
                          __html: convertScribeTextToHtml(note.content || note.title, 'auto', pages),
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Streaming Assistant State */}
        {isAiGenerating && (
          <div className="max-w-3xl mx-auto space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-semibold px-1">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Scribe Assistant typing…</span>
            </div>
            <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 text-xs md:text-sm text-zinc-700 font-mono animate-pulse">
              {aiStreamingText || 'Extracting decisions & todos…'}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
};



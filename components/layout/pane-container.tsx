'use client';

import React from 'react';
import { usePlanet } from '@/lib/context';
import { ChatThreadView } from '../chat/chat-thread-view';
import { PageCardView } from '../views/page-card-view';
import { TodoBoardView } from '../views/todo-board-view';
import { DecisionLogView } from '../views/decision-log-view';
import { EntityIndexView } from '../views/entity-index-view';
import { NoteIndexView } from '../views/note-index-view';
import { X, MessageSquare, ArrowLeft, Tag, CheckSquare, Square, Zap, FileText, Plus } from 'lucide-react';

export const PaneContainer: React.FC = () => {
  const {
    pages,
    leftPane,
    rightPane,
    closePane1,
    closePane2,
    leftPaneCanGoBack,
    rightPaneCanGoBack,
    goBackPane1,
    goBackPane2,
  } = usePlanet();

  const renderPaneContent = (pane: typeof leftPane, paneIndex: 1 | 2) => {
    if ((pane.type === 'message' || pane.type === 'note' || pane.type === 'entity' || pane.type === 'todo' || pane.type === 'decision') && pane.id) {
      return <PageCardView pageId={pane.id} paneIndex={paneIndex} />;
    }

    if (pane.type === 'todo_board') {
      return <TodoBoardView />;
    }

    if (pane.type === 'decision_log') {
      return <DecisionLogView />;
    }

    if (pane.type === 'entity_index') {
      return <EntityIndexView />;
    }

    if (pane.type === 'note_index') {
      return <NoteIndexView />;
    }

    // Default main view: Continuous Chat Thread feed
    return <ChatThreadView paneIndex={paneIndex} />;
  };

  const getPaneIcon = (pane: typeof leftPane) => {
    const { type, id } = pane;
    if (type === 'entity' || type === 'entity_index') return <Tag className="h-3.5 w-3.5 text-indigo-500 shrink-0" />;
    if (type === 'note' || type === 'note_index') return <FileText className="h-3.5 w-3.5 text-amber-600 shrink-0" />;
    if (type === 'todo') {
      const todoPage = pages.find((p) => p.id === id);
      if (todoPage?.done) {
        return <CheckSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
      }
      return <Square className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
    }
    if (type === 'todo_board') return <CheckSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
    if (type === 'decision' || type === 'decision_log') return <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
    return <MessageSquare className="h-3.5 w-3.5 text-zinc-400 shrink-0" />;
  };

  const isLeftPaneActive = leftPane.type !== 'empty';
  const isRightPaneActive = rightPane.type !== 'empty';

  return (
    <div className="flex-1 flex overflow-hidden p-0 gap-0 bg-white relative">
      {/* Pane 1 (Left) */}
      <div className={`flex-1 flex flex-col h-full min-w-0 transition-all duration-150 ${isRightPaneActive ? 'border-r border-zinc-200' : ''}`}>
        {/* Tab Header Bar */}
        <div className="h-9 flex items-end justify-between border-b border-zinc-200 bg-zinc-100/60 px-2 select-none shrink-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-t-md bg-white border-t border-x border-zinc-200 text-xs font-semibold text-zinc-900 border-b-0 -mb-[1px] shadow-2xs max-w-xs truncate">
            <button
              type="button"
              onClick={goBackPane1}
              disabled={!leftPaneCanGoBack}
              className={`p-0.5 rounded transition-colors shrink-0 ${
                leftPaneCanGoBack
                  ? 'hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 cursor-pointer'
                  : 'text-zinc-300 cursor-not-allowed'
              }`}
              title={leftPaneCanGoBack ? 'Go back in Pane 1' : 'No history in Pane 1'}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
            </button>
            {getPaneIcon(leftPane)}
            <span className="truncate">{leftPane.title || 'Chat Thread'}</span>
            <button
              type="button"
              onClick={closePane1}
              className="p-0.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 transition-colors ml-1 shrink-0 cursor-pointer"
              title="Close Tab"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-white">{renderPaneContent(leftPane, 1)}</div>
      </div>

      {/* Pane 2 (Right) */}
      {isRightPaneActive && (
        <div className="flex-1 flex flex-col h-full min-w-0 animate-in fade-in duration-150">
          {/* Tab Header Bar */}
          <div className="h-9 flex items-end justify-between border-b border-zinc-200 bg-zinc-100/60 px-2 select-none shrink-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-t-md bg-white border-t border-x border-zinc-200 text-xs font-semibold text-zinc-900 border-b-0 -mb-[1px] shadow-2xs max-w-xs truncate">
              <button
                type="button"
                onClick={goBackPane2}
                disabled={!rightPaneCanGoBack}
                className={`p-0.5 rounded transition-colors shrink-0 ${
                  rightPaneCanGoBack
                    ? 'hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 cursor-pointer'
                    : 'text-zinc-300 cursor-not-allowed'
                }`}
                title={rightPaneCanGoBack ? 'Go back in Pane 2' : 'No history in Pane 2'}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              {getPaneIcon(rightPane)}
              <span className="truncate">{rightPane.title || 'Detail View'}</span>
              <button
                type="button"
                onClick={closePane2}
                className="p-0.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 transition-colors ml-1 shrink-0"
                title="Close Tab"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-white">{renderPaneContent(rightPane, 2)}</div>
        </div>
      )}
    </div>
  );
};


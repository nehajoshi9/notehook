'use client';

import React from 'react';
import { useNotehook } from '@/lib/context';
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
  } = useNotehook();

  const renderPaneContent = (pane: typeof leftPane, paneIndex: 1 | 2) => {
    if ((pane.type === 'message' || pane.type === 'note' || pane.type === 'entity' || pane.type === 'todo' || pane.type === 'decision') && pane.id) {
      return <PageCardView key={`pane-${paneIndex}-${pane.type}-${pane.id}`} pageId={pane.id} paneIndex={paneIndex} />;
    }

    if (pane.type === 'todo_board') {
      return <TodoBoardView key={`pane-${paneIndex}-todo_board`} />;
    }

    if (pane.type === 'decision_log') {
      return <DecisionLogView key={`pane-${paneIndex}-decision_log`} />;
    }

    if (pane.type === 'entity_index') {
      return <EntityIndexView key={`pane-${paneIndex}-entity_index`} />;
    }

    if (pane.type === 'note_index') {
      return <NoteIndexView key={`pane-${paneIndex}-note_index`} />;
    }

    // Default main view: Continuous Chat Thread feed
    return <ChatThreadView key={`pane-${paneIndex}-chat`} paneIndex={paneIndex} />;
  };

  const getPaneIcon = (pane: typeof leftPane) => {
    const { type, id } = pane;
    if (type === 'entity' || type === 'entity_index') return <Tag className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
    if (type === 'note' || type === 'note_index') return <FileText className="h-3.5 w-3.5 text-red-600 shrink-0" />;
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

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [leftPanePercent, setLeftPanePercent] = React.useState<number>(50);
  const [isDragging, setIsDragging] = React.useState<boolean>(false);

  // Reset leftPanePercent to 50 when Pane 2 closes
  React.useEffect(() => {
    if (!isRightPaneActive) {
      setLeftPanePercent(50);
    }
  }, [isRightPaneActive]);

  const handleResizerMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const offsetX = e.clientX - rect.left;
      const totalWidth = rect.width;
      if (totalWidth <= 0) return;

      let percent = (offsetX / totalWidth) * 100;
      // Strict clamping: Don't let user cut either pane down by more than half (min 25%, max 75%)
      percent = Math.max(25, Math.min(75, percent));

      setLeftPanePercent(percent);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div ref={containerRef} className="flex-1 flex overflow-hidden p-0 gap-0 bg-white relative select-none">
      {/* Pane 1 (Left) */}
      <div
        style={isRightPaneActive ? { width: `${leftPanePercent}%` } : { flex: 1 }}
        className="flex flex-col h-full min-w-0 transition-none"
      >
        {/* Tab Header Bar */}
        <div className="h-9 flex items-end justify-between border-b border-zinc-200 bg-zinc-100/60 px-2 select-none shrink-0">
          <div className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-t-md bg-white border-t border-x border-zinc-200 text-xs font-semibold text-zinc-900 border-b-0 -mb-[1px] shadow-2xs max-w-xs truncate">
            {leftPane.type !== 'chat' && (
              <button
                type="button"
                onClick={goBackPane1}
                disabled={!leftPaneCanGoBack}
                className={`p-0.5 rounded transition-colors shrink-0 ${leftPaneCanGoBack
                  ? 'hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 cursor-pointer'
                  : 'text-zinc-300 cursor-not-allowed'
                  }`}
                title={leftPaneCanGoBack ? 'Go back in Pane 1' : 'No history in Pane 1'}
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
            )}
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

      {/* Draggable Resizer Boundary Handle */}
      {isRightPaneActive && (
        <div className="relative z-30 w-0 h-full flex items-center justify-center select-none shrink-0 pointer-events-none">
          {/* Subtle vertical line indicator on drag only */}
          {isDragging && <div className="absolute inset-y-0 w-0.5 bg-zinc-300 transition-colors" />}

          {/* Grip pill with extra horizontal padding around the dots */}
          <div
            onMouseDown={handleResizerMouseDown}
            className={`pointer-events-auto cursor-col-resize relative z-10 w-3 h-8 rounded-full border flex flex-col items-center justify-center gap-1 px-0.75 shadow-2xs transition-all ${isDragging
              ? 'bg-zinc-200 border-zinc-300 text-zinc-600 scale-105'
              : 'bg-white border-zinc-200 text-zinc-400 hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-600'
              }`}
            title="Drag to adjust pane widths"
          >
            <div className="w-0.75 h-0.75 rounded-full bg-current" />

            <div className="w-0.75 h-0.75 rounded-full bg-current" />
            <div className="w-0.75 h-0.75 rounded-full bg-current" />
          </div>
        </div>
      )}

      {/* Pane 2 (Right) */}
      {isRightPaneActive && (
        <div
          style={{ width: `${100 - leftPanePercent}%` }}
          className="flex flex-col h-full min-w-0 border-l border-zinc-200 animate-in fade-in duration-150 transition-none"
        >
          {/* Tab Header Bar */}
          <div className="h-9 flex items-end justify-between border-b border-zinc-200 bg-zinc-100/60 px-2 select-none shrink-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 h-9 rounded-t-md bg-white border-t border-x border-zinc-200 text-xs font-semibold text-zinc-900 border-b-0 -mb-[1px] shadow-2xs max-w-xs truncate">
              {rightPane.type !== 'chat' && (
                <button
                  type="button"
                  onClick={goBackPane2}
                  disabled={!rightPaneCanGoBack}
                  className={`p-0.5 rounded transition-colors shrink-0 ${rightPaneCanGoBack
                    ? 'hover:bg-zinc-100 text-zinc-700 hover:text-zinc-950 cursor-pointer'
                    : 'text-zinc-300 cursor-not-allowed'
                    }`}
                  title={rightPaneCanGoBack ? 'Go back in Pane 2' : 'No history in Pane 2'}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
              )}
              {getPaneIcon(rightPane)}
              <span className="truncate">{rightPane.title || 'Detail View'}</span>
              <button
                type="button"
                onClick={closePane2}
                className="p-0.5 rounded hover:bg-zinc-100 text-zinc-400 hover:text-zinc-800 transition-colors ml-1 shrink-0 cursor-pointer"
                title="Close Tab"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-white">{renderPaneContent(rightPane, 2)}</div>
        </div>
      )}

      {/* Transparent overlay while dragging to prevent mouse events from being captured by child text / buttons */}
      {isDragging && (
        <div className="fixed inset-0 z-50 cursor-col-resize select-none" />
      )}
    </div>
  );
};


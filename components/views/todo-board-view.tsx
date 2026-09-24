'use client';

import React, { useState } from 'react';
import { usePlanet } from '@/lib/context';
import { CheckSquare, Star, ExternalLink, Edit3, Check } from 'lucide-react';

export const TodoBoardView: React.FC = () => {
  const { todos, toggleTodoDone, toggleTodoStarred, openInPane2 } = usePlanet();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');

  const filteredTodos = todos
    .filter((t) => {
      if (statusFilter === 'active') return !t.done;
      if (statusFilter === 'completed') return t.done;
      return true;
    })
    .sort((a, b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="flex flex-col h-full bg-white text-zinc-900 overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-200 bg-zinc-50/50">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-emerald-100 text-emerald-700 rounded-md">
            <CheckSquare className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Todo Board</h2>
            <p className="text-[11px] text-zinc-500">Action items across conversation pages</p>
          </div>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              statusFilter === 'all'
                ? 'bg-emerald-100 text-emerald-800'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            All ({todos.length})
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('active')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              statusFilter === 'active'
                ? 'bg-emerald-100 text-emerald-800'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors ${
              statusFilter === 'completed'
                ? 'bg-emerald-100 text-emerald-800'
                : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            Completed
          </button>
        </div>
      </div>

      {/* Todo Items List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
        {filteredTodos.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-xs italic">
            No action items match current filter.
          </div>
        ) : (
          filteredTodos.map((todo) => {
            return (
              <div
                key={todo.id}
                onClick={() => openInPane2('todo', todo.id, todo.title)}
                className={`group border rounded-xl p-3.5 transition-all cursor-pointer ${todo.done
                    ? 'bg-zinc-50/80 border-zinc-200 opacity-75'
                    : 'bg-white border-zinc-200/90 hover:border-zinc-300 shadow-2xs'
                  }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <input
                      type="checkbox"
                      checked={todo.done || false}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => toggleTodoDone(todo.id)}
                      className="h-3.5 w-3.5 rounded text-emerald-600 border-zinc-300 focus:ring-emerald-500 cursor-pointer shrink-0"
                    />

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleTodoStarred(todo.id);
                      }}
                      className={`p-0.5 rounded hover:bg-zinc-100 transition-colors shrink-0 ${todo.starred ? 'text-amber-500' : 'text-zinc-300 hover:text-amber-400'
                        }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${todo.starred ? 'fill-amber-400' : ''}`} />
                    </button>

                    <h3
                      className={`text-xs font-bold line-clamp-2 flex-1 leading-snug ${todo.done ? 'line-through text-zinc-400' : 'text-zinc-900 group-hover:text-emerald-900'
                        }`}
                    >
                      {todo.title}
                    </h3>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


'use client';

import React, { useState } from 'react';
import { useNotehook } from '@/lib/context';
import { FileText, Plus, Search, X, Trash2 } from 'lucide-react';

export const NoteIndexView: React.FC = () => {
  const { notes, createNotePage, openInPane2, deletePage } = useNotehook();
  const [searchQuery, setSearchQuery] = useState('');

  const sortedNotes = [...notes].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const queryLower = searchQuery.toLowerCase().trim();
  const filteredNotes = queryLower
    ? sortedNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(queryLower) ||
        n.content.toLowerCase().includes(queryLower)
    )
    : sortedNotes;

  const handleCreateNote = () => {
    const newNote = createNotePage('Untitled Note', '');
    openInPane2('note', newNote.id, newNote.title);
  };

  return (
    <div className="flex flex-col h-full bg-white text-zinc-900 overflow-hidden font-sans">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-200 bg-zinc-50/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-amber-100 text-amber-700 rounded-md">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Note Archive</h2>
            <p className="text-[11px] text-zinc-500">User-created notes & workspace documents</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreateNote}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Note</span>
          </button>
          <span className="text-[11px] font-medium text-zinc-500">
            {notes.length} total
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="px-6 py-2.5 border-b border-zinc-100 bg-white shrink-0">
        <div className="relative flex items-center rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-1.5 text-xs text-zinc-900 focus-within:border-zinc-400 focus-within:bg-white transition-all">
          <Search className="h-3.5 w-3.5 text-zinc-400 shrink-0 mr-2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="w-full bg-transparent text-xs text-zinc-900 placeholder-zinc-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-0.5 rounded-full hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 shrink-0 ml-1 transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      {/* Note List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
        {filteredNotes.length === 0 ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-zinc-400 text-xs italic">
              {queryLower ? 'No notes matching your search.' : 'No notes created yet.'}
            </p>

          </div>
        ) : (
          filteredNotes.map((note) => {
            return (
              <div
                key={note.id}
                onClick={() => openInPane2('note', note.id, note.title)}
                className="group border border-zinc-200/90 bg-white hover:border-zinc-300 rounded-xl p-4 shadow-2xs transition-all cursor-pointer space-y-1.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                    <h3 className="text-xs font-bold text-zinc-900 leading-snug group-hover:text-zinc-950 truncate">
                      {note.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-zinc-400">
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`Delete "${note.title}"?`)) {
                          deletePage(note.id);
                        }
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-50 text-zinc-400 hover:text-red-600 transition-all cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                {note.content && (
                  <p className="text-xs text-zinc-600 line-clamp-2 pl-6 font-normal">
                    {note.content}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

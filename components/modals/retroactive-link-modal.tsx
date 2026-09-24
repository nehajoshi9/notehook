'use client';

import React, { useState } from 'react';
import { usePlanet } from '@/lib/context';
import { X, Link, Sparkles } from 'lucide-react';
import { stripCodeSpans } from '@/lib/scribe-parser';

interface RetroactiveLinkModalProps {
  targetPageId: string;
  targetPageTitle: string;
  isOpen: boolean;
  onClose: () => void;
}

export const RetroactiveLinkModal: React.FC<RetroactiveLinkModalProps> = ({
  targetPageId,
  targetPageTitle,
  isOpen,
  onClose,
}) => {
  const { notes, mentions, executeRetroactiveLinking } = usePlanet();

  const existingNoteIdsWithMention = new Set(
    mentions.filter((m) => m.target_page_id === targetPageId).map((m) => m.source_page_id)
  );

  // Search literal word-boundary match in clean text (excluding code spans)
  const matches = notes
    .filter((n) => !existingNoteIdsWithMention.has(n.id))
    .filter((n) => {
      const { cleanText } = stripCodeSpans(n.content || n.title);
      const regex = new RegExp(`\\b${targetPageTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      return regex.test(cleanText);
    });

  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>(matches.map((m) => m.id));

  if (!isOpen) return null;

  const toggleSelect = (id: string) => {
    if (selectedNoteIds.includes(id)) {
      setSelectedNoteIds(selectedNoteIds.filter((i) => i !== id));
    } else {
      setSelectedNoteIds([...selectedNoteIds, id]);
    }
  };

  const handleCommit = () => {
    executeRetroactiveLinking(targetPageId, selectedNoteIds);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-zinc-200 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-indigo-50/50">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-900">Retroactive Substring Tagging</h3>
              <p className="text-xs text-zinc-500">Link literal occurrences of [@{targetPageTitle}]</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-zinc-400 hover:text-zinc-700 rounded-lg hover:bg-zinc-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Matches Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-3">
          {matches.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 text-xs">
              No un-linked occurrences of "<strong className="text-zinc-600">@{targetPageTitle}</strong>" found in existing pages.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-zinc-500 mb-1">
                <span>Found {matches.length} matching pages (code blocks excluded):</span>
                <button
                  onClick={() =>
                    setSelectedNoteIds(
                      selectedNoteIds.length === matches.length ? [] : matches.map((m) => m.id)
                    )
                  }
                  className="text-indigo-600 font-semibold hover:underline"
                >
                  {selectedNoteIds.length === matches.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              {matches.map((note) => {
                const isSelected = selectedNoteIds.includes(note.id);
                return (
                  <label
                    key={note.id}
                    onClick={() => toggleSelect(note.id)}
                    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                      isSelected ? 'bg-indigo-50/60 border-indigo-300' : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="mt-0.5 h-4 w-4 rounded text-indigo-600 border-zinc-300 focus:ring-indigo-500"
                    />
                    <div className="flex-1">
                      <div className="text-xs font-bold text-zinc-900">{note.title}</div>
                      <p className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5 font-mono">
                        {note.content || 'No text snippet'}
                      </p>
                    </div>
                  </label>
                );
              })}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-zinc-100 bg-zinc-50/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-900 rounded-lg hover:bg-zinc-200/60"
          >
            Cancel
          </button>
          <button
            onClick={handleCommit}
            disabled={selectedNoteIds.length === 0}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            <Link className="w-3.5 h-3.5" />
            <span>Link {selectedNoteIds.length} Occurrences</span>
          </button>
        </div>
      </div>
    </div>
  );
};

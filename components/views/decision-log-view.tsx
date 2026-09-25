'use client';

import React, { useState } from 'react';
import { useNotehook } from '@/lib/context';
import { Zap, Edit3, Check, Plus } from 'lucide-react';

export const DecisionLogView: React.FC = () => {
  const { decisions, openInPane2, createDecisionPage } = useNotehook();

  const sortedDecisions = [...decisions].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const handleCreateDecision = () => {
    const newDec = createDecisionPage('New Decision', '');
    openInPane2('decision', newDec.id, newDec.title);
  };

  const handleOpenDecisionPage = (id: string, title: string) => {
    openInPane2('decision', id, title);
  };

  return (
    <div className="flex flex-col h-full bg-white text-zinc-900 overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-200 bg-zinc-50/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-orange-100 text-orange-600 rounded-md">
            <Zap className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Decision Log</h2>
            <p className="text-[11px] text-zinc-500">Agreed trade-offs & architectural choices</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCreateDecision}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white transition-colors shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Decision</span>
          </button>
          <span className="text-[11px] font-medium text-zinc-500">
            {sortedDecisions.length} total
          </span>
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
        {sortedDecisions.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-xs italic">
            No decisions logged yet.
          </div>
        ) : (
          sortedDecisions.map((dec) => {
            return (
              <div
                key={dec.id}
                onClick={() => handleOpenDecisionPage(dec.id, dec.title)}
                className="group border border-zinc-200/90 bg-white hover:border-zinc-300 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Zap className="w-3.5 h-3.5 text-orange-500 shrink-0" />

                    <h3 className="text-xs font-bold text-zinc-900 leading-snug group-hover:text-zinc-950 flex-1 min-w-0 line-clamp-2">
                      {dec.title}
                    </h3>
                  </div>

                  <span className="text-[11px] text-zinc-400 whitespace-nowrap shrink-0">
                    {new Date(dec.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


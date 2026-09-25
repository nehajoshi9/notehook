'use client';

import React, { useState } from 'react';
import { useNotehook } from '@/lib/context';
import { Tag, Edit3, Check } from 'lucide-react';

export const EntityIndexView: React.FC = () => {
  const { entities, openInPane2 } = useNotehook();

  const sortedEntities = [...entities].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const handleOpenEntityCard = (entityId: string, title: string) => {
    openInPane2('entity', entityId, `@${title}`);
  };

  return (
    <div className="flex flex-col h-full bg-white text-zinc-900 overflow-hidden font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3.5 border-b border-zinc-200 bg-zinc-50/50">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 bg-indigo-100 text-indigo-700 rounded-md">
            <Tag className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-zinc-900">Entity Index</h2>
            <p className="text-[11px] text-zinc-500">Tracked concepts & recurring workspace entities</p>
          </div>
        </div>
        <span className="text-[11px] font-medium text-zinc-500">
          {sortedEntities.length} total
        </span>
      </div>

      {/* Entity List */}
      <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
        {sortedEntities.length === 0 ? (
          <div className="text-center py-12 text-zinc-400 text-xs italic">
            No entities tracked yet. Select text in chat messages to create one.
          </div>
        ) : (
          sortedEntities.map((ent) => {
            return (
              <div
                key={ent.id}
                onClick={() => handleOpenEntityCard(ent.id, ent.title)}
                className="group border border-zinc-200/90 bg-white hover:border-zinc-300 rounded-xl p-3.5 shadow-2xs transition-all cursor-pointer"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />

                    <h3 className="text-xs font-bold text-zinc-900 leading-snug group-hover:text-zinc-950 flex-1 min-w-0 line-clamp-2">
                      {ent.title}
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

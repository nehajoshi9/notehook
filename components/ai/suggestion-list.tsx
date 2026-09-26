'use client';

import React from 'react';
import { SuggestionItem } from '@/lib/ranking';
import { CheckSquare, Zap, Tag, Plus, MessageSquare, FileText, ChevronRight } from 'lucide-react';

interface SuggestionListProps {
  items: SuggestionItem[];
  selectedIndex: number;
  onSelect: (item: SuggestionItem) => void;
  className?: string;
}

export const SuggestionList: React.FC<SuggestionListProps> = ({
  items,
  selectedIndex,
  onSelect,
  className,
}) => {
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!listRef.current) return;
    const itemsContainer = listRef.current.firstElementChild as HTMLElement | null;
    if (itemsContainer && itemsContainer.children[selectedIndex]) {
      const selectedEl = itemsContainer.children[selectedIndex] as HTMLElement;
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div ref={listRef} className={`z-50 w-72 max-h-56 overflow-y-auto rounded-md bg-white border border-zinc-200/90 p-1 shadow-lg text-xs font-sans animate-in fade-in duration-75 select-none ${className || ''}`}>
      <div className="space-y-0.5">
        {items.map((item, idx) => {
          const isSelected = idx === selectedIndex;

          let icon = <Tag className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
          if (item.id.startsWith('create-')) {
            if (item.itemType === 'todo') {
              icon = <Plus className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
            } else if (item.itemType === 'decision') {
              icon = <Plus className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
            } else if (item.itemType === 'note') {
              icon = <Plus className="h-3.5 w-3.5 text-red-600 shrink-0" />;
            } else {
              icon = <Plus className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
            }
          } else if (item.primitiveType === 'todo' || item.itemType === 'todo') {
            icon = <CheckSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />;
          } else if (item.primitiveType === 'decision' || item.itemType === 'decision') {
            icon = <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />;
          } else if (item.primitiveType === 'note' || item.itemType === 'note') {
            icon = <FileText className="h-3.5 w-3.5 text-red-600 shrink-0" />;
          } else if (item.itemType === 'message') {
            icon = <MessageSquare className="h-3.5 w-3.5 text-sky-600 shrink-0" />;
          } else if (item.itemType === 'entity') {
            icon = <Tag className="h-3.5 w-3.5 text-purple-600 shrink-0" />;
          }

          const isBoldItem = item.isBold || item.id === 'save-to-entity';

          return (
            <button
              key={item.id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(item);
              }}
              className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-zinc-100 text-zinc-950 font-semibold'
                  : 'text-zinc-700 hover:bg-zinc-50'
              }`}
            >
              <div className="flex items-center gap-1.5 truncate min-w-0">
                {icon}
                <span className={`truncate ${isBoldItem ? 'font-bold' : ''}`}>{item.title}</span>
                {item.shortId && (
                  <span
                    className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-mono font-medium transition-colors shrink-0 ${
                      isSelected
                        ? 'bg-zinc-200 text-zinc-800 border border-zinc-300'
                        : 'bg-zinc-100 text-zinc-500 border border-zinc-200/80'
                    }`}
                  >
                    [@{item.shortId}]
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {item.id === 'open-save-to-entity-menu' ? (
                  <ChevronRight className={`w-3.5 h-3.5 transition-colors ${isSelected ? 'text-indigo-600' : 'text-zinc-400'}`} />
                ) : (
                  item.scopeLabel && (
                    <span className="text-[10px] font-mono text-zinc-400 opacity-80">
                      {item.scopeLabel}
                    </span>
                  )
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};

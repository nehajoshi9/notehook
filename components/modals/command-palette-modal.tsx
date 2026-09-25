'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNotehook } from '@/lib/context';
import { useIsMac } from '@/lib/use-os';
import { Page } from '@/lib/types';
import { getPastelColorForTitle } from '@/lib/color';
import {
  Search,
  Tag,
  CheckSquare,
  Square,
  Zap,
  FileText,
  MessageSquare,
  X,
} from 'lucide-react';

export function openCommandPalette() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  }
}

export const CommandPaletteModal: React.FC = () => {
  const isMac = useIsMac();
  const { pages, openInPane2, navigateToMessage, leftHistory, rightHistory, navigationHistory } = useNotehook();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global key listener for Cmd+K / Ctrl+K and custom trigger (Activates quick jump panel)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };
    const handleOpen = () => setIsOpen(true);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleOpen);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleOpen);
    };
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Order pages by reverse back-button navigation history (most recently visited at top, ignoring repeats),
  // followed by remaining unvisited pages.
  const orderedPages = useMemo(() => {
    const seenIds = new Set<string>();
    const result: Page[] = [];

    // Traverse combined back-button histories backwards (most recent to oldest)
    const combinedHistory = [...leftHistory, ...rightHistory, ...navigationHistory];

    for (let i = combinedHistory.length - 1; i >= 0; i--) {
      const item = combinedHistory[i];
      if (!item || !item.id) continue;
      const matchedPage = pages.find(
        (p) => p.id === item.id || p.title.toLowerCase() === item.id!.toLowerCase()
      );
      if (matchedPage && !seenIds.has(matchedPage.id)) {
        seenIds.add(matchedPage.id);
        result.push(matchedPage);
      }
    }

    // Append remaining pages that haven't been visited yet
    for (const page of pages) {
      if (!seenIds.has(page.id)) {
        seenIds.add(page.id);
        result.push(page);
      }
    }

    return result;
  }, [pages, leftHistory, rightHistory, navigationHistory]);

  // TITLE-ONLY Search Filter across all primitives (Entities, Decisions, Todos, Notes, Messages)
  const queryLower = query.trim().toLowerCase();
  const filteredPages: Page[] = useMemo(() => {
    return orderedPages.filter((page) => {
      if (!queryLower) return true;
      return (page.title || '').toLowerCase().includes(queryLower);
    });
  }, [orderedPages, queryLower]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const handleSelect = (page: Page) => {
    if (page.type === 'message') {
      navigateToMessage(page.id);
    } else {
      openInPane2(page.type, page.id, page.title);
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }

    if (filteredPages.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % filteredPages.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredPages.length) % filteredPages.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const target = filteredPages[selectedIndex] || filteredPages[0];
      if (target) {
        handleSelect(target);
      }
    }
  };

  const getPrimitiveIcon = (type: Page['type'], done?: boolean) => {
    switch (type) {
      case 'entity':
        return <Tag className="h-4 w-4 text-indigo-500 shrink-0" />;
      case 'decision':
        return <Zap className="h-4 w-4 text-orange-500 shrink-0" />;
      case 'todo':
        return done ? (
          <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" />
        ) : (
          <Square className="h-4 w-4 text-emerald-600 shrink-0" />
        );
      case 'note':
        return <FileText className="h-4 w-4 text-amber-500 shrink-0" />;
      case 'message':
        return <MessageSquare className="h-4 w-4 text-sky-600 shrink-0" />;
      default:
        return <FileText className="h-4 w-4 text-zinc-400 shrink-0" />;
    }
  };

  // Renders upper-right page view pill design
  const renderPill = (page: Page) => {
    const pagePillColor = getPastelColorForTitle(page.title, page.type);

    if (page.type === 'entity') {
      return (
        <span
          className="page-mention-pill text-xs font-bold text-zinc-900"
          style={{ backgroundColor: pagePillColor }}
        >
          <Tag className="w-3 h-3 text-indigo-600 inline mr-0.5" /> entity
        </span>
      );
    }
    if (page.type === 'todo') {
      return (
        <span
          className="page-mention-pill text-xs font-bold text-zinc-900"
          style={{ backgroundColor: pagePillColor }}
        >
          {page.done ? (
            <CheckSquare className="w-3.5 h-3.5 text-emerald-600 inline mr-0.5" />
          ) : (
            <Square className="w-3.5 h-3.5 text-emerald-600 inline mr-0.5" />
          )}
          todo
        </span>
      );
    }
    if (page.type === 'decision') {
      return (
        <span
          className="page-mention-pill text-xs font-bold text-zinc-900"
          style={{ backgroundColor: pagePillColor }}
        >
          <Zap className="w-3.5 h-3.5 text-orange-500 inline mr-0.5" /> decision
        </span>
      );
    }
    if (page.type === 'note') {
      return (
        <span
          className="page-mention-pill text-xs font-bold text-zinc-900"
          style={{ backgroundColor: pagePillColor }}
        >
          <FileText className="w-3.5 h-3.5 text-amber-600 inline mr-0.5" /> note
        </span>
      );
    }
    return (
      <span
        className="page-mention-pill text-xs font-bold text-zinc-900"
        style={{ backgroundColor: pagePillColor }}
      >
        <MessageSquare className="w-3 h-3 text-sky-700 inline mr-0.5" /> message
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-zinc-950/40 backdrop-blur-xs animate-in fade-in duration-100 select-none">
      {/* Click outside backdrop to close */}
      <div className="fixed inset-0" onClick={() => setIsOpen(false)} />

      {/* Main Command Palette Dialog Container */}
      <div
        className="relative w-full max-w-xl bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-hidden flex flex-col z-10 animate-in zoom-in-95 duration-100"
        onKeyDown={handleKeyDown}
      >
        {/* Search Header Bar */}
        <div className="flex items-center px-3.5 py-3 border-b border-zinc-200/80 bg-zinc-50/50">
          <Search className="h-4 w-4 text-zinc-400 shrink-0 mr-2.5" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Quick-jump to page title... (${isMac ? '⌘K' : 'Ctrl+K'})`}
            className="w-full bg-transparent text-sm font-medium text-zinc-900 placeholder-zinc-400 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="p-1 rounded-full hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 transition-colors mr-1"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}

        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
          {filteredPages.length === 0 ? (
            <div className="flex items-center justify-center px-3 py-2 text-xs text-zinc-400 italic min-h-[36px]">
              No matching titles found for &quot;{query}&quot;
            </div>
          ) : (
            filteredPages.map((page, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div
                  key={page.id}
                  onClick={() => handleSelect(page)}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs cursor-pointer transition-colors ${isSelected
                    ? 'bg-zinc-100 text-zinc-950 font-semibold'
                    : 'text-zinc-700 hover:bg-zinc-50 font-medium'
                    }`}
                >
                  <div className="flex items-center gap-2.5 truncate min-w-0 pr-2">
                    {/* {getPrimitiveIcon(page.type, page.done)} */}
                    <span className="truncate text-xs">{page.title}</span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {renderPill(page)}

                  </div>
                </div>
              );
            })
          )}
        </div>


      </div>
    </div>
  );
};

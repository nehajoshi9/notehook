'use client';

import React, { useState, useRef, useEffect } from 'react';
import { usePlanet } from '@/lib/context';
import { Send, Loader2, Tag, CheckSquare, Zap, Plus, FileText } from 'lucide-react';
import { getRankedSuggestions, SuggestionItem } from '@/lib/ranking';
import { isCursorInsideReference } from '@/lib/scribe-parser';
import { SuggestionList } from './suggestion-list';

export const AIChatInput: React.FC = () => {
  const { submitUserTurn, isAiGenerating, aiStreamingText, pages, createEntityPage, createNotePage, createTodoPage, createDecisionPage } = usePlanet();

  const [prompt, setPrompt] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Dynamic cursor left position calculation for chat input
  const getChatCursorLeft = () => {
    if (!inputRef.current || typeof window === 'undefined') return 24;
    try {
      const input = inputRef.current;
      const liveCursor = input.selectionStart ?? cursorPos;
      const style = window.getComputedStyle(input);

      let mirror = document.getElementById('input-caret-mirror') as HTMLDivElement | null;
      if (!mirror) {
        mirror = document.createElement('div');
        mirror.id = 'input-caret-mirror';
        mirror.style.position = 'absolute';
        mirror.style.visibility = 'hidden';
        mirror.style.pointerEvents = 'none';
        mirror.style.whiteSpace = 'pre';
        mirror.style.top = '-9999px';
        mirror.style.left = '-9999px';
        document.body.appendChild(mirror);
      }

      mirror.style.fontFamily = style.fontFamily;
      mirror.style.fontSize = style.fontSize;
      mirror.style.fontWeight = style.fontWeight;
      mirror.style.letterSpacing = style.letterSpacing;
      mirror.style.paddingLeft = style.paddingLeft;

      const textBefore = (input.value || prompt).slice(0, liveCursor);
      mirror.textContent = textBefore;

      const span = document.createElement('span');
      span.textContent = '.';
      mirror.appendChild(span);

      return span.offsetLeft + 28;
    } catch (e) {
      return 36;
    }
  };

  // Check if user is typing an @ trigger tag (including optional leading [ and colons/spaces)
  const textBeforeCursor = prompt.slice(0, cursorPos);
  const atMatch = textBeforeCursor.match(/(?:\[)?@([a-zA-Z0-9_\-\s:]*)$/);
  const isTypingAt = Boolean(atMatch) && !isDismissed;
  const query = atMatch ? atMatch[1] : '';

  const suggestions: SuggestionItem[] = isTypingAt
    ? getRankedSuggestions(query, pages, null, true)
    : [];

  const prevQueryRef = useRef(query);
  useEffect(() => {
    if (prevQueryRef.current !== query) {
      setIsDismissed(false);
      setSelectedIndex(0);
      prevQueryRef.current = query;
    }
  }, [query]);

  const insertSuggestion = (item: SuggestionItem) => {
    if (!atMatch) return;

    const beforeAt = prompt.slice(0, atMatch.index);
    let inserted = '';

    if (item.type === 'primitive') {
      if (item.primitiveType === 'todo') {
        inserted = '[@todo: ';
      } else if (item.primitiveType === 'decision') {
        inserted = '[@decision: ';
      } else if (item.primitiveType === 'note') {
        inserted = '[@note: ';
      }
    } else if (item.id.startsWith('create-')) {
      if (item.itemType === 'todo') {
        const title = item.title.replace(/^\[?@todo:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@todo: ${title}] `;
        createTodoPage(title);
      } else if (item.itemType === 'decision') {
        const title = item.title.replace(/^\[?@decision:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@decision: ${title}] `;
        createDecisionPage(title);
      } else if (item.itemType === 'note') {
        const title = item.title.replace(/^\[?@note:\s*/i, '').replace(/\]$/, '').trim();
        inserted = `[@note: ${title}] `;
        createNotePage(title);
      } else {
        const title = item.title.replace(/^\[?@/, '').replace(/\]$/, '').trim();
        inserted = `[@${title}] `;
        createEntityPage(title);
      }
    } else {
      // Existing Page or Entity
      const rawTitle = item.title.replace(/^@/, '').trim();
      if (item.itemType === 'todo') {
        inserted = `[@todo: ${rawTitle}] `;
      } else if (item.itemType === 'decision') {
        inserted = `[@decision: ${rawTitle}] `;
      } else if (item.itemType === 'note') {
        inserted = `[@note: ${rawTitle}] `;
      } else {
        inserted = `[@${rawTitle}] `;
      }
    }

    const newPrompt = beforeAt + inserted;
    setPrompt(newPrompt);
    inputRef.current?.focus();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || isAiGenerating) return;
    const text = prompt;
    setPrompt('');
    submitUserTurn(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (isTypingAt && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setIsDismissed(true);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertSuggestion(suggestions[selectedIndex] || suggestions[0]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsDismissed(true);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="p-3 md:p-4 bg-white border-t border-zinc-200 flex flex-col items-center select-none shrink-0 relative">
      <div className="w-full max-w-3xl flex flex-col gap-2 relative">
        {/* Clean Standard Chat Input Bar */}
        <form id="chat-input-form" data-chat-input="true" onSubmit={handleSubmit} className="relative flex items-center bg-white border border-zinc-300 focus-within:border-zinc-900 rounded-2xl px-4 py-2.5 shadow-2xs transition-all">
          {/* @ Trigger Autocomplete Suggestion Popover */}
          {isTypingAt && suggestions.length > 0 && (
            <div
              className="absolute bottom-full z-50 translate-y-[10px] transition-all duration-75 ease-out"
              style={{ left: `${getChatCursorLeft()}px` }}
            >
              <SuggestionList
                items={suggestions}
                selectedIndex={selectedIndex}
                onSelect={insertSuggestion}
              />
            </div>
          )}

          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setCursorPos(e.target.selectionStart || e.target.value.length);
            }}
            onKeyUp={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart || prompt.length)}
            onClick={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart || prompt.length)}
            onSelect={(e) => setCursorPos((e.target as HTMLInputElement).selectionStart || prompt.length)}
            onKeyDown={handleKeyDown}
            disabled={isAiGenerating}
            placeholder="Type a message... (use @ for @todo, @decision, or @entity)"
            className="flex-1 text-xs md:text-sm text-zinc-900 placeholder-zinc-400 bg-transparent focus:outline-none font-sans"
            autoFocus
          />

          <button
            type="submit"
            disabled={!prompt.trim() || isAiGenerating}
            className="flex items-center justify-center p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-white font-bold rounded-xl transition-colors ml-2 shrink-0"
            title="Send message"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};

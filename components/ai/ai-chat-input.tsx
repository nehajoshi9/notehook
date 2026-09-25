'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useNotehook, generateShortId } from '@/lib/context';
import { Send, Loader2, Tag, CheckSquare, Zap, Plus, FileText, Pin } from 'lucide-react';
import { getRankedSuggestions, SuggestionItem } from '@/lib/ranking';
import { isCursorInsideReference, parseNotehookMarkup, normalizeRawContentToCanonicalBrackets, htmlToMarkdown } from '@/lib/notehook-parser';
import { SuggestionList } from './suggestion-list';

export const AIChatInput: React.FC = () => {
  const { submitUserTurn, isAiGenerating, aiStreamingText, pages, rightPane, createEntityPage, createNotePage, createTodoPage, createDecisionPage, pinnedPageIds, togglePinPage } = useNotehook();
  const isDualPane = rightPane.type !== 'empty';

  const upcomingShortId = generateShortId('message', pages);
  const pinnedPages = pages.filter((p) => pinnedPageIds.includes(p.id));

  const [prompt, setPrompt] = useState('');
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isDismissed, setIsDismissed] = useState(false);

  const inputRef = useRef<HTMLTextAreaElement>(null);

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
        mirror.style.whiteSpace = 'pre-wrap';
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
      const lastLineIndex = textBefore.lastIndexOf('\n');
      const textCurrentLine = lastLineIndex !== -1 ? textBefore.slice(lastLineIndex + 1) : textBefore;
      mirror.textContent = textCurrentLine;

      const span = document.createElement('span');
      span.textContent = '.';
      mirror.appendChild(span);

      const inputOffset = input.offsetLeft || 24;
      return Math.min(inputOffset + span.offsetLeft, 450);
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
    ? getRankedSuggestions(query, pages, null)
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
    let afterCursor = prompt.slice(cursorPos);
    if (afterCursor.startsWith(']')) {
      afterCursor = afterCursor.slice(1);
    }
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
      } else if (item.itemType === 'message') {
        inserted = item.shortId ? `[@${item.shortId}] ` : `[@message: ${rawTitle}] `;
      } else {
        inserted = `[@${rawTitle}] `;
      }
    }

    const newPrompt = beforeAt + inserted + afterCursor;
    setPrompt(newPrompt);
    const newCursor = (beforeAt + inserted).length;
    setCursorPos(newCursor);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(newCursor, newCursor);
    }, 0);
  };

  // Auto-resize textarea height as content expands or shrinks
  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.style.height = 'auto';
      const newHeight = Math.min(Math.max(el.scrollHeight, 24), 160);
      el.style.height = `${newHeight}px`;
    }
  }, [prompt]);

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!prompt.trim() || isAiGenerating) return;
    const text = prompt;
    setPrompt('');
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    submitUserTurn(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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

    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift + Enter: allow natural textarea newline behavior
        return;
      }
      // Enter without Shift: send message immediately
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    let pastedText = e.clipboardData.getData('text/plain');
    const htmlText = e.clipboardData.getData('text/html');

    if (htmlText && (!pastedText || !/(?:^|\n)[#>\-*`\[]/.test(pastedText))) {
      const converted = htmlToMarkdown(htmlText);
      if (converted && converted.length > 0) {
        pastedText = converted;
      }
    }

    if (!pastedText) return;

    // 1. Normalize unbracketed tags in pasted text
    const normalized = normalizeRawContentToCanonicalBrackets(pastedText, pages);

    // 2. Parse all tags in normalized text
    const parsed = parseNotehookMarkup(normalized, pages);

    // 3. Auto-detect & create pages for newly pasted tags ASAP using clean titles
    parsed.forEach((item) => {
      const cleanTitle = (item.nameOrTitle || item.fullText || '').trim();
      if (!cleanTitle) return;

      const cleanLower = cleanTitle.toLowerCase();
      // Page ID pattern (e.g. m1, e2, n3, d4, t5)
      const isPageIDPattern = /^(m|e|n|d|t)\d+$/i.test(cleanLower);

      // Check if page already exists by short_id or title across ALL page types
      const pageExists = pages.some(
        (p) => (p.short_id && p.short_id.toLowerCase() === cleanLower) || p.title.toLowerCase() === cleanLower
      );

      if (isPageIDPattern || pageExists) return;

      if (item.type === 'todo') {
        createTodoPage(cleanTitle);
      } else if (item.type === 'decision') {
        createDecisionPage(cleanTitle);
      } else if (item.type === 'note') {
        createNotePage(cleanTitle);
      } else if (item.type === 'entity') {
        createEntityPage(cleanTitle);
      }
    });

    // 4. Update prompt state inline with normalized canonical bracket text
    if (normalized !== pastedText) {
      e.preventDefault();
      const input = inputRef.current;
      if (input) {
        const start = input.selectionStart || 0;
        const end = input.selectionEnd || 0;
        const val = input.value;
        const newVal = val.slice(0, start) + normalized + val.slice(end);
        setPrompt(newVal);
        const newCursor = start + normalized.length;
        setCursorPos(newCursor);
        setTimeout(() => {
          input.setSelectionRange(newCursor, newCursor);
        }, 0);
      }
    }
  };

  return (
    <div className="p-3 md:p-4 bg-white border-t border-zinc-200 flex flex-col w-full select-none shrink-0 relative">
      <div className="w-full flex flex-col gap-1.5 relative">
        {pinnedPages.length > 0 && (
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-zinc-500 overflow-x-auto select-none">
            <span className="inline-flex items-center gap-1 font-semibold text-amber-900 bg-amber-50/90 px-2 py-0.5 rounded-full border border-amber-200/90 text-[10px]">
              <Pin className="w-2.5 h-2.5 fill-amber-600 text-amber-600" />
              Pinned Context ({pinnedPages.length}/3)
            </span>
            {pinnedPages.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] bg-zinc-100 text-zinc-700 border border-zinc-200/90 shadow-2xs"
              >
                <span>[@{p.short_id || p.title}]</span>
                <button
                  type="button"
                  onClick={() => togglePinPage(p.id)}
                  className="hover:text-red-600 text-zinc-400 font-bold ml-0.5 cursor-pointer"
                  title={`Unpin [@${p.short_id || p.title}]`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="w-full flex items-end gap-2.5 relative">
          {/* Display-only upcoming message ID chip placed outside to the left of the text box */}
          <div className="shrink-0 self-start mt-2 select-none pointer-events-none" title="Upcoming message ID">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-mono font-medium bg-zinc-100/90 text-zinc-500 border border-zinc-200/90 shadow-2xs select-none">
              [@{upcomingShortId}]
            </span>
          </div>

          {/* Clean Standard Chat Input Bar */}
          <form id="chat-input-form" data-chat-input="true" onSubmit={handleSubmit} className="flex-1 relative flex items-end bg-white border border-zinc-300 focus-within:border-zinc-900 rounded-2xl px-4 py-2 shadow-2xs transition-all">
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

          <div className="flex items-end w-full relative min-h-[28px]">
            <textarea
              ref={inputRef}
              rows={1}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value);
                setCursorPos(e.target.selectionStart || e.target.value.length);
              }}
              onPaste={handlePaste}
              onKeyUp={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart || prompt.length)}
              onClick={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart || prompt.length)}
              onSelect={(e) => setCursorPos((e.target as HTMLTextAreaElement).selectionStart || prompt.length)}
              onKeyDown={handleKeyDown}
              disabled={isAiGenerating}
              placeholder="Type or paste a message... (auto-detects [@todo: ...], [@decision: ...], [@note: ...], [@Entity])"
              className="flex-1 text-xs md:text-sm text-zinc-900 placeholder-zinc-400 bg-transparent focus:outline-none font-sans resize-none py-1 leading-relaxed overflow-y-auto"
              autoFocus
            />

            <button
              type="submit"
              disabled={!prompt.trim() || isAiGenerating}
              className="flex items-center justify-center p-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-30 text-white font-bold rounded-xl transition-colors ml-2 shrink-0 cursor-pointer self-end mb-0.5"
              title="Send message (Enter to send, Shift+Enter for new line)"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
);
};

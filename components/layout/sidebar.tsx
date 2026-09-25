'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePlanet } from '@/lib/context';
import { useIsMac } from '@/lib/use-os';
import {
  MessageSquare,
  FileText,
  Tag,
  CheckSquare,
  Square,
  Zap,
  ChevronRight,
  ChevronDown,
  Search,
  X,
  Trash2,
  Star,
  Plus,
} from 'lucide-react';

function isPageExistsInStore(type: string, titleStr: string, pages?: any[]): boolean {
  if (!pages || pages.length === 0) return true;
  const cleanTitle = titleStr.replace(/^(todo:|decision:|note:|message:|\s*)+/i, '').trim().toLowerCase();
  if (!cleanTitle) return true;
  return pages.some((p) => {
    if (p.type !== type) return false;
    const pTitle = p.title.trim().toLowerCase();
    return pTitle === cleanTitle || pTitle.startsWith(cleanTitle) || cleanTitle.startsWith(pTitle);
  });
}

function cleanTextForSearch(text: string, pages?: any[]): string {
  if (!text) return '';
  let clean = text;

  // 1. Remove code blocks
  clean = clean.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]+`/g, ' ');

  // 2. Preserve contents of explicit legacy dead tags [dead@...] and [@...] tags for search matching
  clean = clean.replace(/\[dead@(?:(todo|decision|note|message):)?\s*([^\]]+)\]/gi, '$2');
  clean = clean.replace(/\[@(todo|decision|note|message):\s*([^\]]+)\]/gi, '$2');
  clean = clean.replace(/\[@(?!(?:todo|decision|note|message):)([^\]]+)\]/gi, '$1');

  // Strip markdown headers & sanitize extra whitespace
  clean = clean.replace(/^#+\s+/gm, '').replace(/\s+/g, ' ').trim();
  return clean;
}

// Substring search helper matching substring strictly across titles, contents, and prompts (ignoring ID and slug)
function substringMatchPage(p: any, query: string, pages?: any[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase().trim();
  if (!q) return true;

  const title = (p.title || '').toLowerCase();
  const cleanContent = cleanTextForSearch(p.content || '', pages).toLowerCase();
  const cleanPrompt = cleanTextForSearch(p.user_prompt || '', pages).toLowerCase();

  return title.includes(q) || cleanContent.includes(q) || cleanPrompt.includes(q);
}

function renderHighlightedText(text: string, query: string): React.ReactNode {
  if (!query || !text) return text;
  const q = query.trim();
  if (!q) return text;

  const qClamped = q.length > 9 ? `${q.slice(0, 3)}...${q.slice(-3)}` : q;
  const escapedFull = q.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const escapedClamped = qClamped.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');

  const pattern = q.length > 9 ? `(${escapedClamped}|${escapedFull})` : `(${escapedFull})`;
  const regex = new RegExp(pattern, 'gi');

  const parts = text.split(regex);

  return parts.map((part, index) => {
    const pLower = part.toLowerCase();
    const isMatch = pLower === q.toLowerCase() || pLower === qClamped.toLowerCase();
    if (isMatch) {
      return (
        <mark key={index} className="bg-amber-300 text-zinc-950 font-semibold rounded-xs p-0 m-0">
          {part}
        </mark>
      );
    }
    return part;
  });
}

function getContextExcerpt(text: string, query: string, pages?: any[]): string | null {
  if (!text || !query) return null;
  const clean = cleanTextForSearch(text, pages);
  if (!clean) return null;

  const q = query.trim();
  if (!q) return null;

  const lower = clean.toLowerCase();
  const matchIdx = lower.indexOf(q.toLowerCase());

  if (matchIdx === -1) return null;

  const matchStart = matchIdx;
  const matchEnd = matchIdx + q.length;
  const rawMatchedText = clean.slice(matchStart, matchEnd);

  // If matched substring in question is > 9 characters, clamp it in the middle to 9 characters (first 3 + '...' + last 3)
  let displayedMatch = rawMatchedText;
  if (displayedMatch.length > 9) {
    displayedMatch = `${displayedMatch.slice(0, 3)}...${displayedMatch.slice(-3)}`;
  }

  // Excerpt length must be up to 30 characters in total
  let budget = 30 - displayedMatch.length;
  let leftPos = matchStart;
  let rightPos = matchEnd;

  // Add a left and right character to either side repeatedly
  while (budget > 0 && (leftPos > 0 || rightPos < clean.length)) {
    if (leftPos > 0 && budget > 0) {
      leftPos--;
      budget--;
    }
    if (rightPos < clean.length && budget > 0) {
      rightPos++;
      budget--;
    }
  }

  const leftContext = clean.slice(leftPos, matchStart);
  const rightContext = clean.slice(matchEnd, rightPos);

  const prefix = leftPos > 0 ? '...' : '';
  const suffix = rightPos < clean.length ? '...' : '';

  return `${prefix}${leftContext}${displayedMatch}${rightContext}${suffix}`;
}

export const Sidebar: React.FC = () => {
  const isMac = useIsMac();
  const {
    pages,
    messages,
    notes,
    entities,
    todos,
    decisions,
    openInPane1,
    openInPane2,
    leftPane,
    rightPane,
    clearAllData,
    deletePage,
    toggleTodoDone,
    toggleTodoStarred,
    createEntityPage,
    createNotePage,
    createTodoPage,
    createDecisionPage,
  } = usePlanet();

  const [searchQuery, setSearchQuery] = useState('');
  const [messagesExpanded, setMessagesExpanded] = useState(true);
  const [notesExpanded, setNotesExpanded] = useState(true);
  const [todosExpanded, setTodosExpanded] = useState(true);
  const [decisionsExpanded, setDecisionsExpanded] = useState(true);
  const [entitiesExpanded, setEntitiesExpanded] = useState(true);

  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    pageId: string;
    pageTitle: string;
  } | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleContextMenu = (e: React.MouseEvent, pageId: string, pageTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 180);
    const y = Math.min(e.clientY, window.innerHeight - 80);
    setContextMenu({ x, y, pageId, pageTitle });
  };

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = () => setContextMenu(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(null);
    };
    window.addEventListener('click', handleClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [contextMenu]);

  // Global Ctrl+Shift+F / Cmd+Shift+F key listener to focus cute pill search bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        if (searchInputRef.current) {
          searchInputRef.current.focus();
          searchInputRef.current.select();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Substring filtering based on search query over titles, content, IDs, & slug filenames
  const queryLower = searchQuery.toLowerCase().trim();
  const filterPages = <T extends { title: string; content?: string; user_prompt?: string; id: string; type: string }>(
    pageList: T[]
  ): T[] => {
    if (!queryLower) return pageList;
    return pageList.filter((p) => substringMatchPage(p, queryLower, pages));
  };

  const filteredMessages = filterPages(messages);
  const filteredNotes = filterPages(notes);
  const filteredEntities = filterPages(entities);
  const filteredTodos = filterPages(todos);
  const filteredDecisions = filterPages(decisions);

  return (
    <aside className="w-64 bg-zinc-50 border-r border-zinc-200 flex flex-col h-full z-20 select-none text-zinc-900 font-sans">
      {/* Sidebar Content */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">

        {/* Cute Pill Search Bar */}
        <div className="px-1">
          <div className="relative flex items-center rounded-full bg-zinc-100/90 border border-zinc-200/90 px-2.5 py-1 text-xs text-zinc-900 focus-within:border-zinc-300 focus-within:bg-white focus-within:shadow-2xs transition-all">
            <Search className="h-3.5 w-3.5 text-zinc-400 shrink-0 mr-1.5 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search pages..."
              className="w-full bg-transparent text-xs font-normal text-zinc-900 placeholder-zinc-400 focus:outline-none"
            />
            {searchQuery ? (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="p-0.5 rounded-full hover:bg-zinc-200 text-zinc-400 hover:text-zinc-600 shrink-0 ml-1 transition-colors"
                title="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            ) : (
              <span className="text-[11px] font-sans font-medium text-zinc-500 bg-white px-1.5 py-0.5 rounded border border-zinc-200/80 shrink-0 ml-1 leading-none tracking-tight select-none">
                {isMac ? '⌘⇧F' : '^⇧F'}
              </span>
            )}
          </div>
        </div>

        {/* 1. Messages Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 text-xs font-bold text-zinc-700 tracking-wider">
            <button
              type="button"
              onClick={() => setMessagesExpanded(!messagesExpanded)}
              className="flex items-center gap-1 hover:text-zinc-950"
            >
              {messagesExpanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
              <MessageSquare className="h-3.5 w-3.5 text-sky-600 mr-1" />
              <span>Messages ({filteredMessages.length})</span>
            </button>
          </div>

          {messagesExpanded && (
            <div className="space-y-0.5 pl-3 pt-0.5 border-l-2 border-zinc-200 ml-3">
              {filteredMessages.length === 0 ? (
                <p className="px-2 text-[11px] text-zinc-400 italic">
                  {queryLower ? 'No matching messages' : 'No messages yet'}
                </p>
              ) : (
                filteredMessages.map((msg) => {
                  const isSelected =
                    (rightPane.type === 'message' && rightPane.id === msg.id) ||
                    (leftPane.type === 'message' && leftPane.id === msg.id);
                  const excerpt = queryLower ? getContextExcerpt(msg.content || msg.user_prompt || '', queryLower, pages) : null;
                  return (
                    <button
                      key={msg.id}
                      type="button"
                      onClick={() => openInPane2('message', msg.id, msg.title, searchQuery.trim() || undefined)}
                      onContextMenu={(e) => handleContextMenu(e, msg.id, msg.title)}
                      className={`w-full text-left px-2 py-1 rounded-md flex flex-col text-xs transition-all ${isSelected
                        ? 'bg-white text-zinc-950 font-semibold border border-zinc-200 shadow-2xs'
                        : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 font-medium'
                        }`}
                    >
                      <div className="flex items-center gap-2 truncate min-w-0 w-full">
                        <MessageSquare className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                        <span className="truncate">{renderHighlightedText(msg.title, searchQuery)}</span>
                      </div>
                      {excerpt && (
                        <p className="text-[10px] text-zinc-500 font-sans truncate pl-5 leading-tight mt-0.5">
                          {renderHighlightedText(excerpt, searchQuery)}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* 2. Notes Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 text-xs font-bold text-zinc-700 tracking-wider">
            <button
              type="button"
              onClick={() => setNotesExpanded(!notesExpanded)}
              className="flex items-center gap-1 hover:text-zinc-950"
            >
              {notesExpanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
              <FileText className="h-3.5 w-3.5 text-amber-500 mr-1" />
              <span>Notes ({filteredNotes.length})</span>
            </button>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const newNote = createNotePage('New Note', '');
                  openInPane2('note', newNote.id, newNote.title);
                }}
                className="p-1 rounded-md text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/80 transition-colors"
                title="Create New Note"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => openInPane2('note_index', null, 'Note Archive')}
                className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-950 px-1.5 py-0.5 rounded-md hover:bg-zinc-100 transition-colors"
              >
                View All
              </button>
            </div>
          </div>

          {notesExpanded && (
            <div className="space-y-0.5 pl-3 pt-0.5 border-l-2 border-zinc-200 ml-3">
              {filteredNotes.length === 0 ? (
                <p className="px-2 text-[11px] text-zinc-400 italic">
                  {queryLower ? 'No matching notes' : 'No notes yet'}
                </p>
              ) : (
                filteredNotes.map((note) => {
                  const isSelected =
                    (rightPane.type === 'note' && rightPane.id === note.id) ||
                    (leftPane.type === 'note' && leftPane.id === note.id);
                  const excerpt = queryLower ? getContextExcerpt(note.content || '', queryLower, pages) : null;
                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => openInPane2('note', note.id, note.title, searchQuery.trim() || undefined)}
                      onContextMenu={(e) => handleContextMenu(e, note.id, note.title)}
                      className={`w-full text-left px-2 py-1 rounded-md flex flex-col text-xs transition-all ${isSelected
                        ? 'bg-white text-zinc-950 font-semibold border border-zinc-200 shadow-2xs'
                        : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 font-medium'
                        }`}
                    >
                      <div className="flex items-center gap-2 truncate min-w-0 w-full">
                        <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                        <span className="truncate">{renderHighlightedText(note.title, searchQuery)}</span>
                      </div>
                      {excerpt && (
                        <p className="text-[10px] text-zinc-500 font-sans truncate pl-5 leading-tight mt-0.5">
                          {renderHighlightedText(excerpt, searchQuery)}
                        </p>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Extracted Structured Pages (Todos, Decisions, Entities) */}
        <div className="space-y-3">

          {/* 3. Todos Subfolder */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => setTodosExpanded(!todosExpanded)}
                className="flex items-center gap-1 text-xs font-bold text-zinc-700 hover:text-zinc-950"
              >
                {todosExpanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
                <CheckSquare className="h-3.5 w-3.5 text-emerald-600 mr-1" />
                <span>Todos ({filteredTodos.length})</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const newTodo = createTodoPage('New Task', '');
                    openInPane2('todo', newTodo.id, newTodo.title);
                  }}
                  className="p-1 rounded-md text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/80 transition-colors"
                  title="Create New Todo"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openInPane2('todo_board', null, 'Todo Board')}
                  className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-950 px-1.5 py-0.5 rounded-md hover:bg-zinc-100 transition-colors"
                >
                  View All
                </button>
              </div>
            </div>

            {todosExpanded && (
              <div className="space-y-0.5 pl-3 pt-0.5 border-l-2 border-zinc-200 ml-3">
                {filteredTodos.length === 0 ? (
                  <p className="text-[11px] text-zinc-400 italic px-2">
                    {queryLower ? 'No matching todos' : 'No active todos'}
                  </p>
                ) : (
                  filteredTodos.map((todo) => {
                    const isSelected =
                      (rightPane.type === 'todo' && rightPane.id === todo.id) ||
                      (leftPane.type === 'todo' && leftPane.id === todo.id);
                    const excerpt = queryLower ? getContextExcerpt(todo.content || '', queryLower, pages) : null;
                    return (
                      <button
                        key={todo.id}
                        type="button"
                        onClick={() => openInPane2('todo', todo.id, todo.title, searchQuery.trim() || undefined)}
                        onContextMenu={(e) => handleContextMenu(e, todo.id, todo.title)}
                        className={`w-full text-left px-2 py-1 rounded-md flex flex-col text-xs transition-all group ${isSelected
                          ? 'bg-white text-zinc-950 font-semibold border border-zinc-200 shadow-2xs'
                          : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 font-medium'
                          }`}
                      >
                        <div className="flex items-center justify-between w-full min-w-0">
                          <div className="flex items-center gap-2 truncate min-w-0 pr-1">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleTodoDone(todo.id);
                              }}
                              className="p-0.5 rounded hover:bg-zinc-200/70 transition-colors shrink-0 cursor-pointer"
                              title={todo.done ? 'Mark as active' : 'Mark as complete'}
                            >
                              {todo.done ? (
                                <CheckSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <Square className="h-3.5 w-3.5 text-emerald-600 hover:text-emerald-700 shrink-0" />
                              )}
                            </span>
                            <span className={`truncate ${todo.done ? 'line-through text-zinc-400' : ''}`}>
                              {renderHighlightedText(todo.title, searchQuery)}
                            </span>
                          </div>

                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTodoStarred(todo.id);
                            }}
                            className="p-0.5 rounded hover:bg-zinc-200/70 transition-colors shrink-0 cursor-pointer"
                            title={todo.starred ? 'Unstar todo' : 'Star todo'}
                          >
                            <Star
                              className={`h-3.5 w-3.5 transition-colors ${todo.starred
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-amber-400'
                                }`}
                            />
                          </span>
                        </div>
                        {excerpt && (
                          <p className="text-[10px] text-zinc-500 font-sans truncate pl-5 leading-tight mt-0.5">
                            {renderHighlightedText(excerpt, searchQuery)}
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* 4. Decisions Subfolder */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => setDecisionsExpanded(!decisionsExpanded)}
                className="flex items-center gap-1 text-xs font-bold text-zinc-700 hover:text-zinc-950"
              >
                {decisionsExpanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
                <Zap className="h-3.5 w-3.5 text-orange-500 mr-1" />
                <span>Decisions ({filteredDecisions.length})</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const newDec = createDecisionPage('New Decision', '');
                    openInPane2('decision', newDec.id, newDec.title);
                  }}
                  className="p-1 rounded-md text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/80 transition-colors"
                  title="Create New Decision"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openInPane2('decision_log', null, 'Decision Log')}
                  className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-950 px-1.5 py-0.5 rounded-md hover:bg-zinc-100 transition-colors"
                >
                  View All
                </button>
              </div>
            </div>

            {decisionsExpanded && (
              <div className="space-y-0.5 pl-3 pt-0.5 border-l-2 border-zinc-200 ml-3">
                {filteredDecisions.length === 0 ? (
                  <p className="text-[11px] text-zinc-400 italic px-2">
                    {queryLower ? 'No matching decisions' : 'No decisions logged'}
                  </p>
                ) : (
                  filteredDecisions.map((dec) => {
                    const isSelected =
                      (rightPane.type === 'decision' && rightPane.id === dec.id) ||
                      (leftPane.type === 'decision' && leftPane.id === dec.id);
                    const excerpt = queryLower ? getContextExcerpt(dec.content || '', queryLower, pages) : null;
                    return (
                      <button
                        key={dec.id}
                        type="button"
                        onClick={() => openInPane2('decision', dec.id, dec.title, searchQuery.trim() || undefined)}
                        onContextMenu={(e) => handleContextMenu(e, dec.id, dec.title)}
                        className={`w-full text-left px-2 py-1 rounded-md flex flex-col text-xs transition-all ${isSelected
                          ? 'bg-white text-zinc-950 font-semibold border border-zinc-200 shadow-2xs'
                          : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 font-medium'
                          }`}
                      >
                        <div className="flex items-center gap-2 truncate w-full min-w-0">
                          <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                          <span className="truncate">{renderHighlightedText(dec.title, searchQuery)}</span>
                        </div>
                        {excerpt && (
                          <p className="text-[10px] text-zinc-500 font-sans truncate pl-5 leading-tight mt-0.5">
                            {renderHighlightedText(excerpt, searchQuery)}
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

          {/* 5. Tracked Entities Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <button
                type="button"
                onClick={() => setEntitiesExpanded(!entitiesExpanded)}
                className="flex items-center gap-1 text-xs font-bold text-zinc-700 hover:text-zinc-950"
              >
                {entitiesExpanded ? <ChevronDown className="h-3.5 w-3.5 text-zinc-500" /> : <ChevronRight className="h-3.5 w-3.5 text-zinc-500" />}
                <Tag className="h-3.5 w-3.5 text-indigo-500 mr-1" />
                <span>Entities ({filteredEntities.length})</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    const newEnt = createEntityPage('New Entity', '');
                    openInPane2('entity', newEnt.id, `@${newEnt.title}`);
                  }}
                  className="p-1 rounded-md text-zinc-500 hover:text-zinc-950 hover:bg-zinc-200/80 transition-colors"
                  title="Create New Entity"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => openInPane2('entity_index', null, 'Entity Index')}
                  className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-950 px-1.5 py-0.5 rounded-md hover:bg-zinc-100 transition-colors"
                >
                  View All
                </button>
              </div>
            </div>

            {entitiesExpanded && (
              <div className="space-y-0.5 pl-3 pt-0.5 border-l-2 border-zinc-200 ml-3">
                {filteredEntities.length === 0 ? (
                  <p className="text-[11px] text-zinc-400 italic px-2">
                    {queryLower ? 'No matching entities' : 'No entities tracked'}
                  </p>
                ) : (
                  filteredEntities.map((ent) => {
                    const isSelected =
                      (rightPane.type === 'entity' && rightPane.id === ent.id) ||
                      (leftPane.type === 'entity' && leftPane.id === ent.id);
                    const excerpt = queryLower ? getContextExcerpt(ent.content || '', queryLower, pages) : null;
                    return (
                      <button
                        key={ent.id}
                        type="button"
                        onClick={() => openInPane2('entity', ent.id, ent.title, searchQuery.trim() || undefined)}
                        onContextMenu={(e) => handleContextMenu(e, ent.id, ent.title)}
                        className={`w-full text-left px-2 py-1 rounded-md flex flex-col text-xs transition-all ${isSelected
                          ? 'bg-white text-zinc-950 font-bold border border-zinc-200 shadow-2xs'
                          : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 font-medium'
                          }`}
                      >
                        <div className="flex items-center gap-2 truncate w-full min-w-0">
                          <Tag className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">{renderHighlightedText(ent.title, searchQuery)}</span>
                        </div>
                        {excerpt && (
                          <p className="text-[10px] text-zinc-500 font-sans truncate pl-5 leading-tight mt-0.5">
                            {renderHighlightedText(excerpt, searchQuery)}
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* Sidebar Footer with Reset / Clear Data Button */}
      <div className="p-2 border-t border-zinc-200/80">
        <button
          type="button"
          onClick={() => {
            if (confirm('Are you sure you want to reset conversation data?')) {
              clearAllData();
            }
          }}
          className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-zinc-100 transition-colors"
          title="Reset conversation data"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Clear Data</span>
        </button>
      </div>

      {/* Context Menu Floating Overlay */}
      {contextMenu && (
        <div
          style={{ top: `${contextMenu.y}px`, left: `${contextMenu.x}px` }}
          className="fixed z-50 bg-white border border-zinc-200/90 shadow-lg rounded-lg p-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => {
              deletePage(contextMenu.pageId);
              setContextMenu(null);
            }}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-zinc-100 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Delete Page</span>
          </button>
        </div>
      )}

    </aside>
  );
};

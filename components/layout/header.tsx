'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  Tag,
  FileText,
  Zap,
  CheckSquare,
  LogOut,
  LayoutDashboard,
  Folder,
} from 'lucide-react';
import { NotehookLogo } from '@/components/icons/notehook-logo';
import { openCommandPalette } from '@/components/modals/command-palette-modal';
import { useIsMac } from '@/lib/use-os';
import { useNotehook } from '@/lib/context';
import { useAuth } from '@/lib/auth-context';

export const Header: React.FC = () => {
  const isMac = useIsMac();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const userButtonRef = useRef<HTMLButtonElement>(null);

  const { user, loading: authLoading, signInWithGoogle, signOut } = useAuth();

  const {
    workspaceName,
    setWorkspaceName,
    createEntityPage,
    createNotePage,
    createDecisionPage,
    createTodoPage,
    openInPane2,
  } = useNotehook();

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node) &&
        userButtonRef.current &&
        !userButtonRef.current.contains(e.target as Node)
      ) {
        setIsUserMenuOpen(false);
      }
    };
    if (isDropdownOpen || isUserMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isDropdownOpen, isUserMenuOpen]);

  // Global Quick Action Keyboard Shortcuts (Cmd/Ctrl + E, N, D, T)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd (Mac) or Ctrl (Windows/Linux) without Shift/Alt
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const key = e.key.toLowerCase();
        if (key === 'e') {
          e.preventDefault();
          e.stopPropagation();
          const page = createEntityPage('New Entity');
          openInPane2('entity', page.id, `@${page.title}`);
          setIsDropdownOpen(false);
        } else if (key === 'n') {
          e.preventDefault();
          e.stopPropagation();
          const page = createNotePage('New Note');
          openInPane2('note', page.id, page.title);
          setIsDropdownOpen(false);
        } else if (key === 'd') {
          e.preventDefault();
          e.stopPropagation();
          const page = createDecisionPage('New Decision');
          openInPane2('decision', page.id, page.title);
          setIsDropdownOpen(false);
        } else if (key === 't') {
          e.preventDefault();
          e.stopPropagation();
          const page = createTodoPage('New Task');
          openInPane2('todo', page.id, page.title);
          setIsDropdownOpen(false);
        } else if (key === 'escape') {
          if (isDropdownOpen) {
            e.preventDefault();
            setIsDropdownOpen(false);
          }
          if (isUserMenuOpen) {
            e.preventDefault();
            setIsUserMenuOpen(false);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createEntityPage, createNotePage, createDecisionPage, createTodoPage, openInPane2, isDropdownOpen, isUserMenuOpen]);

  const handleCreate = (type: 'entity' | 'note' | 'decision' | 'todo') => {
    setIsDropdownOpen(false);
    if (type === 'entity') {
      const page = createEntityPage('New Entity');
      openInPane2('entity', page.id, `@${page.title}`);
    } else if (type === 'note') {
      const page = createNotePage('New Note');
      openInPane2('note', page.id, page.title);
    } else if (type === 'decision') {
      const page = createDecisionPage('New Decision');
      openInPane2('decision', page.id, page.title);
    } else if (type === 'todo') {
      const page = createTodoPage('New Task');
      openInPane2('todo', page.id, page.title);
    }
  };

  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;
  const userName = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User';

  return (
    <header className="h-14 px-5 bg-white border-b border-zinc-200 flex items-center justify-between z-30 text-zinc-900 shrink-0 select-none relative">
      {/* Brand Logo & Dashboard Button */}
      <div className="flex items-center gap-2.5">
        <Link href="/dashboard" className="flex items-center gap-2 group cursor-pointer hover:opacity-85 transition-opacity" title="Go to Workspaces Dashboard">
          <NotehookLogo className="w-7.5 h-7.5 text-purple-600 group-hover:text-purple-700 transition-colors" />
          <span className="text-sm font-bold tracking-tight text-zinc-950 font-heading">
            Notehook
          </span>
        </Link>

        <Link
          href="/dashboard"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold text-zinc-600 hover:text-zinc-950 bg-zinc-100/70 hover:bg-zinc-100 border border-zinc-200/80 transition-all cursor-pointer shadow-2xs"
          title="Open Workspaces Dashboard"
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-zinc-500" />
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
      </div>

      {/* Center Group: Workspace Name Input (Left) + Command Palette Button (Right) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-2.5">
        {/* Editable Workspace Name Text Field */}
        <div className="relative flex items-center">
          <Folder className="w-3.5 h-3.5 text-fuchsia-600 absolute left-2.5 pointer-events-none shrink-0" />
          <input
            type="text"
            value={workspaceName}
            onChange={(e) => {
              const clean = e.target.value
                .replace(/\[@.*?\]/g, '')
                .replace(/@\w+/g, '')
                .replace(/[@\[\]]/g, '');
              setWorkspaceName(clean);
            }}
            onKeyDown={(e) => {
              if (e.key === '@' || e.key === '[' || e.key === ']') {
                e.preventDefault();
              }
            }}
            placeholder="Workspace Name"
            className="h-8 pl-8 pr-2.5 py-1 text-xs font-semibold text-zinc-800 bg-zinc-100/70 hover:bg-zinc-100 focus:bg-white focus:ring-2 focus:ring-zinc-950/15 border border-zinc-200/80 focus:border-zinc-300 rounded-lg outline-none transition-all placeholder:text-zinc-400 font-sans cursor-text w-56 focus:w-72 text-ellipsis"
            title="Workspace Name (reference tags strictly forbidden)"
          />
        </div>

        {/* Command Palette Button */}
        <button
          type="button"
          onClick={openCommandPalette}
          className="relative flex items-center rounded-full bg-zinc-100/90 hover:bg-white border border-zinc-200/90 hover:border-zinc-300 px-3 py-1 text-xs text-zinc-900 transition-all shadow-2xs group cursor-pointer"
        >
          <Search className="h-3.5 w-3.5 text-zinc-400 group-hover:text-zinc-600 transition-colors shrink-0 mr-1.5 pointer-events-none" />
          <span className="text-zinc-500 group-hover:text-zinc-800 transition-colors mr-2">Jump to...</span>
          <span className="text-[11px] font-sans font-medium text-zinc-500 bg-white px-1.5 py-0.5 rounded border border-zinc-200/80 shrink-0 ml-1 leading-none tracking-tight select-none">
            {isMac ? '⌘K' : 'Ctrl+K'}
          </span>
        </button>
      </div>

      {/* Right Side: Quick Action + Auth State */}
      <div className="flex items-center gap-2">
        {/* Quick Action + Dropdown */}
        <div className="relative flex items-center">
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setIsDropdownOpen((prev) => !prev)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-50 border border-zinc-300 hover:border-zinc-400 text-zinc-900 transition-all shadow-2xs cursor-pointer ${
              isDropdownOpen ? 'bg-zinc-100 border-zinc-400' : ''
            }`}
            title="New Page (Quick Actions)"
          >
            <Plus className="w-3.5 h-3.5 text-zinc-700 shrink-0" />
            <span>New</span>
          </button>

          {/* Dropdown Menu */}
          {isDropdownOpen && (
            <div
              ref={dropdownRef}
              className="absolute right-0 top-full mt-2 w-56 bg-white rounded-md shadow-xl border border-zinc-200/90 p-1 z-50 animate-in fade-in zoom-in-95 duration-100 select-none text-xs"
            >
              <div className="px-2 py-1 text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                Create New Page
              </div>

              {/* New Entity */}
              <button
                type="button"
                onClick={() => handleCreate('entity')}
                className="w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <Tag className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                  <span className="font-medium text-zinc-800 group-hover:text-zinc-950 truncate">
                    Entity
                  </span>
                </div>
                <span className="text-[11px] font-sans font-medium text-zinc-500 bg-white px-1.5 py-0.5 rounded border border-zinc-200/80 shrink-0 leading-none tracking-tight select-none">
                  {isMac ? '⌘E' : 'Ctrl+E'}
                </span>
              </button>

              {/* New Note */}
              <button
                type="button"
                onClick={() => handleCreate('note')}
                className="w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <FileText className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                  <span className="font-medium text-zinc-800 group-hover:text-zinc-950 truncate">
                    Note
                  </span>
                </div>
                <span className="text-[11px] font-sans font-medium text-zinc-500 bg-white px-1.5 py-0.5 rounded border border-zinc-200/80 shrink-0 leading-none tracking-tight select-none">
                  {isMac ? '⌘N' : 'Ctrl+N'}
                </span>
              </button>

              {/* New Decision */}
              <button
                type="button"
                onClick={() => handleCreate('decision')}
                className="w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <Zap className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                  <span className="font-medium text-zinc-800 group-hover:text-zinc-950 truncate">
                    Decision
                  </span>
                </div>
                <span className="text-[11px] font-sans font-medium text-zinc-500 bg-white px-1.5 py-0.5 rounded border border-zinc-200/80 shrink-0 leading-none tracking-tight select-none">
                  {isMac ? '⌘D' : 'Ctrl+D'}
                </span>
              </button>

              {/* New Todo */}
              <button
                type="button"
                onClick={() => handleCreate('todo')}
                className="w-full text-left px-2 py-1.5 rounded flex items-center justify-between gap-2 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition-colors group cursor-pointer"
              >
                <div className="flex items-center gap-2 truncate min-w-0">
                  <CheckSquare className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="font-medium text-zinc-800 group-hover:text-zinc-950 truncate">
                    Todo
                  </span>
                </div>
                <span className="text-[11px] font-sans font-medium text-zinc-500 bg-white px-1.5 py-0.5 rounded border border-zinc-200/80 shrink-0 leading-none tracking-tight select-none">
                  {isMac ? '⌘T' : 'Ctrl+T'}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Auth Section: Google Sign In / User Profile */}
        {!authLoading && (
          <div className="relative flex items-center">
            {user ? (
              <>
                <button
                  ref={userButtonRef}
                  type="button"
                  onClick={() => setIsUserMenuOpen((prev) => !prev)}
                  className="flex items-center gap-1.5 p-1 rounded-full hover:bg-zinc-100 border border-zinc-200 transition-all cursor-pointer"
                  title={user.email || 'User Account'}
                >
                  {userAvatar ? (
                    <img
                      src={userAvatar}
                      alt={userName}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[10px] font-bold">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </button>

                {/* User Account Dropdown */}
                {isUserMenuOpen && (
                  <div
                    ref={userMenuRef}
                    className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-zinc-200/90 p-2 z-50 animate-in fade-in zoom-in-95 duration-100 text-xs select-none"
                  >
                    <div className="px-2 py-1.5 border-b border-zinc-100 mb-1">
                      <p className="font-semibold text-zinc-900 truncate">{userName}</p>
                      <p className="text-[11px] text-zinc-500 truncate">{user.email}</p>
                    </div>

                    <Link
                      href="/dashboard"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="w-full text-left px-2 py-1.5 rounded flex items-center gap-2 text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100 transition-colors cursor-pointer mb-1"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 text-zinc-500" />
                      <span className="font-medium">All Workspaces</span>
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setIsUserMenuOpen(false);
                        signOut();
                      }}
                      className="w-full text-left px-2 py-1.5 rounded flex items-center gap-2 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span className="font-medium">Sign Out</span>
                    </button>
                  </div>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={signInWithGoogle}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50/80 hover:bg-indigo-100/80 border border-indigo-200/90 hover:border-indigo-300 text-indigo-950 transition-all shadow-2xs cursor-pointer"
                title="Sign in with Google"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

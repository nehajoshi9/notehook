'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  ArrowRight,
  Folder,
  Tag,
  FileText,
  Zap,
  CheckSquare,
  MessageSquare,
  Trash2,
  Edit2,
  Check,
  X,
  Search,
  LayoutGrid,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { NotehookLogo } from '@/components/icons/notehook-logo';
import { useNotehook } from '@/lib/context';
import { useAuth } from '@/lib/auth-context';
import { Workspace } from '@/lib/types';

export const DashboardView: React.FC = () => {
  const router = useRouter();
  const { user, signInWithGoogle } = useAuth();
  const {
    workspaces,
    currentWorkspaceId,
    createWorkspace,
    switchWorkspace,
    deleteWorkspace,
    renameWorkspace,
  } = useNotehook();

  const [searchQuery, setSearchQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  const [editingWorkspaceId, setEditingWorkspaceId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const userName =
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'Explorer';
  const userAvatar = user?.user_metadata?.avatar_url || user?.user_metadata?.picture;

  const mostRecentWorkspace = [...workspaces].sort((a, b) => {
    const timeA = new Date(a.last_opened_at || a.updated_at || a.created_at || 0).getTime();
    const timeB = new Date(b.last_opened_at || b.updated_at || b.created_at || 0).getTime();
    return timeB - timeA;
  })[0];

  const handleBackToWorkspace = () => {
    if (mostRecentWorkspace) {
      handleOpenWorkspace(mostRecentWorkspace.id);
    } else {
      router.push('/');
    }
  };

  const handleOpenWorkspace = (workspaceId: string) => {
    switchWorkspace(workspaceId);
    router.push('/');
  };

  const handleCreateWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newWorkspaceName.trim() || 'Untitled Workspace';
    const newWs = createWorkspace(name);
    setIsCreating(false);
    setNewWorkspaceName('');
    router.push('/');
  };

  const startRenaming = (ws: Workspace, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingWorkspaceId(ws.id);
    setEditingName(ws.name);
  };

  const handleSaveRename = (wsId: string, e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (editingName.trim()) {
      renameWorkspace(wsId, editingName.trim());
    }
    setEditingWorkspaceId(null);
  };

  const handleDelete = (wsId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteWorkspace(wsId);
    setConfirmDeleteId(null);
  };

  const filteredWorkspaces = workspaces
    .filter((ws) => ws.name.toLowerCase().includes(searchQuery.toLowerCase()))
    .sort((a, b) => {
      const timeA = new Date(a.last_opened_at || a.created_at || 0).getTime();
      const timeB = new Date(b.last_opened_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });

  // Aggregated Stats
  const totalWorkspaces = workspaces.length;
  const totalPages = workspaces.reduce((acc, ws) => acc + (ws.pages?.length || 0), 0);
  const totalEntities = workspaces.reduce(
    (acc, ws) => acc + (ws.pages?.filter((p) => p.type === 'entity').length || 0),
    0
  );
  const totalTodos = workspaces.reduce(
    (acc, ws) => acc + (ws.pages?.filter((p) => p.type === 'todo' && !p.done).length || 0),
    0
  );

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col antialiased font-sans">
      {/* Top Header */}
      <header className="h-14 px-5 bg-white border-b border-zinc-200 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-2.5">
          <Link
            href="/"
            className="flex items-center gap-2 group cursor-pointer"
            title="Go to Notehook App"
          >
            <NotehookLogo className="w-7.5 h-7.5" />
            <span className="text-sm font-bold tracking-tight text-zinc-950 font-heading group-hover:text-zinc-800 transition-colors">
              Notehook
            </span>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBackToWorkspace}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-zinc-950 transition-all shadow-2xs cursor-pointer"
            title="Open most recently used workspace"
          >
            <span>Back to Workspace</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
          </button>

          {user ? (
            userAvatar ? (
              <img
                src={userAvatar}
                alt={userName}
                title={userName}
                className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-200"
              />
            ) : (
              <div
                title={userName}
                className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shadow-2xs"
              >
                {userName.charAt(0).toUpperCase()}
              </div>
            )
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
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-6 py-8 flex flex-col gap-8">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-zinc-200/80 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                Workspace Hub
              </span>
              <span className="text-xs text-zinc-400">•</span>
              <span className="text-xs text-zinc-500">Welcome, {userName}</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-950 font-heading">
              Your Notehook Workspaces
            </h1>
            <p className="text-sm text-zinc-500 mt-1">
              Organize independent conversation contexts, knowledge graphs, and backlink networks.
            </p>
          </div>

          {/* Quick Action */}
          <button
            type="button"
            onClick={() => {
              setIsCreating(true);
              setNewWorkspaceName('');
            }}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-50 border border-zinc-300 hover:border-zinc-400 text-zinc-900 transition-all shadow-2xs hover:shadow-xs active:scale-[0.98] shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-zinc-700" />
            <span>New Workspace</span>
          </button>
        </div>

        {/* Global Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-4 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Workspaces</span>
              <Folder className="w-4 h-4 text-fuchsia-600" />
            </div>
            <div className="text-2xl font-bold text-zinc-950">{totalWorkspaces}</div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Total Pages</span>
              <FileText className="w-4 h-4 text-zinc-400" />
            </div>
            <div className="text-2xl font-bold text-zinc-950">{totalPages}</div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Entities</span>
              <Tag className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-bold text-zinc-950">{totalEntities}</div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Open Tasks</span>
              <CheckSquare className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold text-zinc-950">{totalTodos}</div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              id="workspace-search-input"
              data-search-input="true"
              data-ignore-selection="true"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search workspaces..."
              className="w-full pl-9 pr-3.5 py-1.5 text-xs bg-white border border-zinc-200 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-950/10 rounded-lg outline-none transition-all placeholder:text-zinc-400 text-zinc-800"
            />
          </div>
          <span className="text-xs text-zinc-400 font-medium">
            Showing {filteredWorkspaces.length} of {workspaces.length} workspaces
          </span>
        </div>

        {/* Workspace Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card: Create New Workspace */}
          <div
            onClick={() => {
              if (!isCreating) {
                setIsCreating(true);
                setNewWorkspaceName('');
              }
            }}
            className={`group relative flex flex-col justify-between p-5 rounded-2xl border-2 border-dashed transition-all cursor-pointer min-h-[220px] ${isCreating
              ? 'border-zinc-400 bg-zinc-100/50 ring-2 ring-zinc-950/10'
              : 'border-zinc-200 hover:border-zinc-300 bg-zinc-50/60 hover:bg-zinc-100/60 shadow-2xs hover:shadow-xs'
              }`}
          >
            {isCreating ? (
              <form onSubmit={handleCreateWorkspace} className="flex-1 flex flex-col justify-between" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
                      Create Workspace
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCreating(false)}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-600 hover:bg-zinc-200/60 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <label className="text-xs font-semibold text-zinc-700">Workspace Name</label>
                  <input
                    type="text"
                    autoFocus
                    value={newWorkspaceName}
                    onChange={(e) => setNewWorkspaceName(e.target.value)}
                    placeholder="e.g. Project Apollo, Research Lab"
                    className="w-full px-3 py-2 text-xs font-medium bg-white border border-zinc-300 focus:border-zinc-500 focus:ring-2 focus:ring-zinc-950/10 rounded-lg outline-none transition-all text-zinc-900 placeholder:text-zinc-400"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsCreating(false)}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold text-zinc-600 hover:text-zinc-800 hover:bg-zinc-100 transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-50 border border-zinc-300 hover:border-zinc-400 text-zinc-900 transition-all shadow-2xs cursor-pointer"
                  >
                    Create & Open
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 border border-zinc-200/90 group-hover:bg-zinc-200 group-hover:border-zinc-300 text-zinc-600 group-hover:text-zinc-900 flex items-center justify-center transition-all shadow-2xs">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 group-hover:text-zinc-950 transition-colors font-heading">
                      Create New Workspace
                    </h3>
                    <p className="text-xs text-zinc-500 mt-1">
                      Start an isolated conversation workspace with custom notes and entities.
                    </p>
                  </div>
                </div>

                <div className="pt-4 flex items-center gap-1.5 text-xs font-semibold text-zinc-700 group-hover:text-zinc-950">
                  <span>Get Started</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </>
            )}
          </div>

          {/* Cards for each workspace */}
          {filteredWorkspaces.map((ws) => {
            const isActive = ws.id === currentWorkspaceId;
            const wsPages = ws.pages || [];
            const messageCount = wsPages.filter((p) => p.type === 'message').length;
            const entityCount = wsPages.filter((p) => p.type === 'entity').length;
            const todoCount = wsPages.filter((p) => p.type === 'todo').length;
            const decisionCount = wsPages.filter((p) => p.type === 'decision').length;
            const noteCount = wsPages.filter((p) => p.type === 'note').length;
            const isRenaming = editingWorkspaceId === ws.id;

            // Sample entities or recent titles
            const recentEntities = wsPages
              .filter((p) => p.type === 'entity')
              .slice(0, 3)
              .map((p) => p.title);

            return (
              <div
                key={ws.id}
                onClick={() => handleOpenWorkspace(ws.id)}
                className="group relative flex flex-col justify-between p-5 rounded-2xl border border-zinc-200/80 hover:border-zinc-300 shadow-2xs hover:shadow-xs transition-all cursor-pointer min-h-[220px] bg-white"
              >
                {/* Header of card */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border border-zinc-200/80 bg-zinc-50 text-zinc-600 transition-all">
                        <Folder className="w-4 h-4 text-fuchsia-600" />
                      </div>
                    </div>

                    {/* Actions menu */}
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={(e) => startRenaming(ws, e)}
                        className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                        title="Rename Workspace"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      {workspaces.length > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteId(ws.id);
                          }}
                          className="p-1 rounded-md text-zinc-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          title="Delete Workspace"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Title / Renaming */}
                  <div>
                    {isRenaming ? (
                      <form
                        onSubmit={(e) => handleSaveRename(ws.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="text"
                          autoFocus
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-full px-2 py-1 text-sm font-bold bg-white border border-zinc-400 rounded outline-none text-zinc-900"
                        />
                        <button
                          type="submit"
                          className="p-1 rounded bg-white hover:bg-zinc-50 border border-zinc-300 hover:border-zinc-400 text-zinc-900 shadow-2xs cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingWorkspaceId(null)}
                          className="p-1 rounded text-zinc-500 hover:bg-zinc-100 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    ) : (
                      <h3 className="text-base font-bold text-zinc-950 font-heading truncate">
                        {ws.name}
                      </h3>
                    )}

                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>
                        Created{' '}
                        {new Date(ws.created_at || Date.now()).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </span>
                    </div>
                  </div>

                  {/* Entity chips preview */}
                  {recentEntities.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {recentEntities.map((ent, idx) => (
                        <span
                          key={idx}
                          className="text-[10px] font-semibold text-zinc-700 bg-zinc-100 border border-zinc-200/80 px-1.5 py-0.5 rounded-md truncate max-w-[120px]"
                        >
                          @{ent}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer breakdown & action */}
                <div className="pt-4 border-t border-zinc-100 flex flex-col gap-3">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 flex-wrap">
                    {entityCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <Tag className="w-3 h-3 text-purple-600" />
                        {entityCount}
                      </span>
                    )}
                    {todoCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <CheckSquare className="w-3 h-3 text-emerald-600" />
                        {todoCount}
                      </span>
                    )}
                    {decisionCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <Zap className="w-3 h-3 text-rose-500" />
                        {decisionCount}
                      </span>
                    )}
                    {noteCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <FileText className="w-3 h-3 text-red-500" />
                        {noteCount}
                      </span>
                    )}
                    {messageCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <MessageSquare className="w-3 h-3 text-sky-500" />
                        {messageCount}
                      </span>
                    )}
                    {wsPages.length === 0 && (
                      <span className="text-[11px] text-zinc-400 italic">Empty workspace</span>
                    )}
                  </div>

                  <div className="flex justify-end items-center">
                    <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-950 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Large Delete Confirmation Modal */}
      {confirmDeleteId && (() => {
        const targetWs = workspaces.find((w) => w.id === confirmDeleteId);
        if (!targetWs) return null;
        const pageCount = targetWs.pages?.length || 0;
        const entityCount = targetWs.pages?.filter((p) => p.type === 'entity').length || 0;
        const todoCount = targetWs.pages?.filter((p) => p.type === 'todo').length || 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-xs animate-in fade-in duration-200">
            <div
              className="bg-white border border-zinc-200 shadow-2xl rounded-2xl max-w-lg w-full overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="p-6 pb-4 border-b border-zinc-100 flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 shrink-0">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-950 font-heading">
                      Delete Workspace?
                    </h3>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      This action is permanent and cannot be undone.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-4">
                <div className="p-4 bg-zinc-50 border border-zinc-200/80 rounded-xl flex flex-col gap-2">
                  <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    Workspace Details
                  </div>
                  <div className="text-base font-bold text-zinc-950 flex items-center gap-2">
                    <Folder className="w-4 h-4 text-fuchsia-600 shrink-0" />
                    <span>{targetWs.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-zinc-600 mt-1 pt-2 border-t border-zinc-200/60">
                    <span><strong>{pageCount}</strong> total pages</span>
                    <span>•</span>
                    <span><strong>{entityCount}</strong> entities</span>
                    <span>•</span>
                    <span><strong>{todoCount}</strong> tasks</span>
                  </div>
                </div>

                <div className="p-3.5 bg-red-50/60 border border-red-200/80 rounded-xl text-xs text-red-800 leading-relaxed">
                  Deleting <strong>"{targetWs.name}"</strong> will permanently remove all chat history, personal notes, tracked entities, decisions, and action items stored in this workspace.
                </div>
              </div>

              {/* Actions */}
              <div className="p-4 bg-zinc-50/80 border-t border-zinc-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-4 py-2 text-xs font-semibold text-zinc-700 hover:text-zinc-950 hover:bg-zinc-200/60 border border-zinc-300 rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={(e) => handleDelete(targetWs.id, e)}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50/80 rounded-xl shadow-2xs hover:shadow-xs transition-all cursor-pointer select-none"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Workspace</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Dashboard Footer */}
      <footer className="border-t border-zinc-200/80 bg-zinc-50/50 py-6 mt-12">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-700">Notehook</span>
            <span>© {new Date().getFullYear()} Notehook Inc. All rights reserved.</span>
          </div>

          <div className="flex items-center gap-6 font-medium">
            <Link href="/privacy" className="hover:text-zinc-900 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-zinc-900 transition-colors">
              Terms of Service
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

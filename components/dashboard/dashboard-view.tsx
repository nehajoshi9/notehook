'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Compass,
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
} from 'lucide-react';
import { useNotehook } from '@/lib/context';
import { useAuth } from '@/lib/auth-context';
import { Workspace } from '@/lib/types';

export const DashboardView: React.FC = () => {
  const router = useRouter();
  const { user, signInWithGoogle, signOut } = useAuth();
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

  const filteredWorkspaces = workspaces.filter((ws) =>
    ws.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

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
    <div className="min-h-screen bg-zinc-50 text-zinc-900 flex flex-col antialiased selection:bg-zinc-900 selection:text-white font-sans">
      {/* Top Header */}
      <header className="h-14 px-6 bg-white border-b border-zinc-200/80 flex items-center justify-between sticky top-0 z-30 shadow-2xs">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            title="Go to Notehook App"
          >
            <div className="p-1.5 rounded-md bg-zinc-950 text-white shadow-xs">
              <Compass className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold tracking-tight text-zinc-950 font-heading">
              Notehook
            </span>
          </Link>
          <div className="h-4 w-px bg-zinc-200" />
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-700 bg-zinc-100 px-2.5 py-1 rounded-md">
            <LayoutGrid className="w-3.5 h-3.5 text-zinc-500" />
            <span>Workspaces</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white hover:bg-zinc-100 border border-zinc-200 text-zinc-700 hover:text-zinc-950 transition-all shadow-2xs"
          >
            <span>Back to Workspace</span>
            <ArrowRight className="w-3.5 h-3.5 text-zinc-500" />
          </Link>

          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-zinc-200">
              {userAvatar ? (
                <img
                  src={userAvatar}
                  alt={userName}
                  className="w-7 h-7 rounded-full object-cover ring-1 ring-zinc-200"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-zinc-900 text-white flex items-center justify-center text-xs font-bold shadow-2xs">
                  {userName.charAt(0).toUpperCase()}
                </div>
              )}
              <button
                type="button"
                onClick={signOut}
                className="text-xs text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signInWithGoogle}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white transition-all shadow-2xs cursor-pointer"
            >
              Sign in
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
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 text-white transition-all shadow-sm hover:shadow active:scale-[0.98] shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Workspace</span>
          </button>
        </div>

        {/* Global Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-4 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Workspaces</span>
              <Folder className="w-4 h-4 text-zinc-400" />
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
              <Tag className="w-4 h-4 text-zinc-500" />
            </div>
            <div className="text-2xl font-bold text-zinc-950">{totalEntities}</div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-zinc-200/80 shadow-2xs">
            <div className="flex items-center justify-between text-zinc-400 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Open Tasks</span>
              <CheckSquare className="w-4 h-4 text-zinc-500" />
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
                : 'border-zinc-200 hover:border-zinc-400 bg-white hover:bg-zinc-50 shadow-2xs hover:shadow-xs'
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
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-zinc-950 hover:bg-zinc-800 text-white transition-all shadow-xs cursor-pointer"
                  >
                    Create & Open
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  <div className="w-10 h-10 rounded-xl bg-zinc-100 group-hover:bg-zinc-950 group-hover:text-white text-zinc-600 flex items-center justify-center transition-colors shadow-2xs">
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
                className={`group relative flex flex-col justify-between p-5 rounded-2xl border transition-all cursor-pointer min-h-[220px] bg-white ${isActive
                    ? 'border-zinc-400 ring-2 ring-zinc-950/10 shadow-sm'
                    : 'border-zinc-200/80 hover:border-zinc-300 shadow-2xs hover:shadow-md'
                  }`}
              >
                {/* Header of card */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${isActive
                            ? 'bg-zinc-950 text-white shadow-2xs'
                            : 'bg-zinc-100 text-zinc-700'
                          }`}
                      >
                        <Folder className="w-4 h-4" />
                      </div>
                      {isActive && (
                        <span className="text-[10px] font-bold text-zinc-800 bg-zinc-100 border border-zinc-200/90 px-2 py-0.5 rounded-full uppercase tracking-wider">
                          Active
                        </span>
                      )}
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
                        <>
                          {confirmDeleteId === ws.id ? (
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded-md">
                              <span className="text-[10px] text-red-700 font-semibold">Delete?</span>
                              <button
                                type="button"
                                onClick={(e) => handleDelete(ws.id, e)}
                                className="p-0.5 rounded text-red-700 hover:bg-red-100 cursor-pointer"
                                title="Confirm Delete"
                              >
                                <Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteId(null);
                                }}
                                className="p-0.5 rounded text-zinc-500 hover:bg-zinc-200 cursor-pointer"
                                title="Cancel"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
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
                        </>
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
                          className="p-1 rounded bg-zinc-900 text-white hover:bg-zinc-800 cursor-pointer"
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
                        <Tag className="w-3 h-3 text-zinc-500" />
                        {entityCount}
                      </span>
                    )}
                    {todoCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <CheckSquare className="w-3 h-3 text-zinc-500" />
                        {todoCount}
                      </span>
                    )}
                    {decisionCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <Zap className="w-3 h-3 text-zinc-500" />
                        {decisionCount}
                      </span>
                    )}
                    {noteCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <FileText className="w-3 h-3 text-zinc-500" />
                        {noteCount}
                      </span>
                    )}
                    {messageCount > 0 && (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200/80">
                        <MessageSquare className="w-3 h-3 text-zinc-500" />
                        {messageCount}
                      </span>
                    )}
                    {wsPages.length === 0 && (
                      <span className="text-[11px] text-zinc-400 italic">Empty workspace</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-800 group-hover:text-zinc-950 transition-colors">
                      {isActive ? 'Current Workspace' : 'Open Workspace'}
                    </span>
                    <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:text-zinc-950 group-hover:translate-x-0.5 transition-all" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
};

-- ==============================================================================
-- Notehook Supabase Schema & Row-Level Security (RLS)
-- ==============================================================================

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Workspaces Table
CREATE TABLE IF NOT EXISTS public.workspaces (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL DEFAULT 'Main Workspace',
  pinned_page_ids JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Unified Pages Table (Entities, Notes, Decisions, Todos, Messages)
CREATE TABLE IF NOT EXISTS public.pages (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  short_id TEXT,
  type TEXT NOT NULL CHECK (type IN ('message', 'todo', 'decision', 'entity', 'note')),
  title TEXT NOT NULL,
  content TEXT DEFAULT '',
  role TEXT CHECK (role IN ('user', 'assistant')),
  done BOOLEAN DEFAULT FALSE,
  starred BOOLEAN DEFAULT FALSE,
  pinned BOOLEAN DEFAULT FALSE,
  user_prompt TEXT,
  injected_context TEXT,
  referenced_page_ids JSONB DEFAULT '[]'::jsonb,
  canonical_version_id TEXT,
  current_version_num INTEGER DEFAULT 1,
  versions JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Unified Mentions Table
CREATE TABLE IF NOT EXISTS public.mentions (
  id TEXT PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  workspace_id TEXT REFERENCES public.workspaces(id) ON DELETE CASCADE,
  target_page_id TEXT NOT NULL,
  source_page_id TEXT NOT NULL,
  span_start INTEGER,
  span_end INTEGER,
  snippet TEXT,
  source TEXT NOT NULL CHECK (source IN ('auto', 'manual')),
  orphaned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes for fast lookup, workspace filtering & backlink queries
CREATE INDEX IF NOT EXISTS idx_workspaces_user_id ON public.workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_user_id ON public.pages(user_id);
CREATE INDEX IF NOT EXISTS idx_pages_workspace_id ON public.pages(workspace_id);
CREATE INDEX IF NOT EXISTS idx_pages_type ON public.pages(type);
CREATE INDEX IF NOT EXISTS idx_pages_created_at ON public.pages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mentions_user_id ON public.mentions(user_id);
CREATE INDEX IF NOT EXISTS idx_mentions_workspace_id ON public.mentions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_mentions_target_page ON public.mentions(target_page_id);
CREATE INDEX IF NOT EXISTS idx_mentions_source_page ON public.mentions(source_page_id);

-- 6. Enable Row-Level Security (RLS) on all tables
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mentions ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies (Drop existing first so this script can be re-run safely)

-- Workspaces Policies
DROP POLICY IF EXISTS "Users can manage their own workspaces" ON public.workspaces;
CREATE POLICY "Users can manage their own workspaces"
  ON public.workspaces
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Pages Policies
DROP POLICY IF EXISTS "Users can manage their own pages" ON public.pages;
CREATE POLICY "Users can manage their own pages"
  ON public.pages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Mentions Policies
DROP POLICY IF EXISTS "Users can manage their own mentions" ON public.mentions;
CREATE POLICY "Users can manage their own mentions"
  ON public.mentions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

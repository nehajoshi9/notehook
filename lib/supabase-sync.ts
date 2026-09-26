import { supabase } from './supabase';
import { Page, Mention, Workspace } from './types';

export async function fetchUserWorkspacesAndPages(userId: string): Promise<{
  workspaces: Workspace[] | null;
  activeWorkspaceId: string | null;
}> {
  if (!supabase || !userId) {
    return { workspaces: null, activeWorkspaceId: null };
  }

  try {
    // 1. Fetch all Workspaces for this user
    const { data: wsRows, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (wsError) {
      console.warn('Supabase fetch workspaces warning:', wsError.message);
    }

    // 2. Fetch all Pages for this user
    const { data: pageRows, error: pagesError } = await supabase
      .from('pages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (pagesError) {
      console.warn('Supabase fetch pages warning:', pagesError.message);
    }

    // 3. Fetch all Mentions for this user
    const { data: mentionRows, error: mentionsError } = await supabase
      .from('mentions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (mentionsError) {
      console.warn('Supabase fetch mentions warning:', mentionsError.message);
    }

    // If no workspaces and no pages exist in Supabase for this user, return null so we can initialize/migrate
    if ((!wsRows || wsRows.length === 0) && (!pageRows || pageRows.length === 0)) {
      return { workspaces: null, activeWorkspaceId: null };
    }

    const allPages: Page[] = (pageRows || []).map((row) => ({
      id: row.id,
      short_id: row.short_id,
      type: row.type,
      title: row.title,
      content: row.content || '',
      created_at: row.created_at,
      updated_at: row.updated_at,
      role: row.role,
      done: row.done,
      starred: row.starred,
      pinned: row.pinned,
      user_prompt: row.user_prompt,
      injected_context: row.injected_context,
      referenced_page_ids: Array.isArray(row.referenced_page_ids) ? row.referenced_page_ids : [],
      canonical_version_id: row.canonical_version_id,
      current_version_num: row.current_version_num || 1,
      versions: Array.isArray(row.versions) ? row.versions : [],
    }));

    const allMentions: Mention[] = (mentionRows || []).map((row) => ({
      id: row.id,
      target_page_id: row.target_page_id,
      source_page_id: row.source_page_id,
      span_start: row.span_start,
      span_end: row.span_end,
      snippet: row.snippet,
      source: row.source,
      orphaned: row.orphaned,
      created_at: row.created_at,
    }));

    // If workspaces exist, partition pages and mentions by workspace_id
    if (wsRows && wsRows.length > 0) {
      const workspaces: Workspace[] = wsRows.map((wRow) => {
        const wsPages = (pageRows || [])
          .filter((pRow) => pRow.workspace_id === wRow.id || (!pRow.workspace_id && wRow.id === wsRows[0].id))
          .map((pRow) => allPages.find((p) => p.id === pRow.id)!)
          .filter(Boolean);

        const wsMentions = (mentionRows || [])
          .filter((mRow) => mRow.workspace_id === wRow.id || (!mRow.workspace_id && wRow.id === wsRows[0].id))
          .map((mRow) => allMentions.find((m) => m.id === mRow.id)!)
          .filter(Boolean);

        let pinned: string[] = [];
        if (Array.isArray(wRow.pinned_page_ids)) {
          pinned = wRow.pinned_page_ids;
        }

        return {
          id: wRow.id,
          name: wRow.name || 'My Workspace',
          created_at: wRow.created_at,
          updated_at: wRow.updated_at,
          last_opened_at: wRow.updated_at || wRow.created_at,
          pages: wsPages,
          mentions: wsMentions,
          pinnedPageIds: pinned,
        };
      });

      return {
        workspaces,
        activeWorkspaceId: workspaces[0]?.id || null,
      };
    }

    // If pages exist but no workspace row, wrap them in a default workspace
    const defaultWs: Workspace = {
      id: `ws-${userId.slice(0, 8)}`,
      name: 'My Workspace',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
      pages: allPages,
      mentions: allMentions,
      pinnedPageIds: [],
    };

    return {
      workspaces: [defaultWs],
      activeWorkspaceId: defaultWs.id,
    };
  } catch (err) {
    console.error('Error fetching Supabase workspace data:', err);
    return { workspaces: null, activeWorkspaceId: null };
  }
}

export async function upsertWorkspaceToSupabase(userId: string, workspace: Workspace): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from('workspaces').upsert(
      {
        id: workspace.id,
        user_id: userId,
        name: workspace.name,
        pinned_page_ids: workspace.pinnedPageIds || [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.error('Failed to upsert workspace to Supabase:', err);
  }
}

export async function deleteWorkspaceFromSupabase(userId: string, workspaceId: string): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from('workspaces').delete().eq('id', workspaceId).eq('user_id', userId);
  } catch (err) {
    console.error('Failed to delete workspace from Supabase:', err);
  }
}

export async function upsertPageToSupabase(userId: string, page: Page, workspaceId?: string): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from('pages').upsert(
      {
        id: page.id,
        user_id: userId,
        workspace_id: workspaceId || null,
        short_id: page.short_id,
        type: page.type,
        title: page.title,
        content: page.content,
        role: page.role,
        done: page.done,
        starred: page.starred,
        pinned: page.pinned,
        user_prompt: page.user_prompt,
        injected_context: page.injected_context,
        referenced_page_ids: page.referenced_page_ids || [],
        canonical_version_id: page.canonical_version_id,
        current_version_num: page.current_version_num || 1,
        versions: page.versions || [],
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.error('Failed to upsert page to Supabase:', err);
  }
}

export async function deletePageFromSupabase(userId: string, pageId: string): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from('pages').delete().eq('id', pageId).eq('user_id', userId);
  } catch (err) {
    console.error('Failed to delete page from Supabase:', err);
  }
}

export async function deletePagesFromSupabase(userId: string, pageIds: string[]): Promise<void> {
  if (!supabase || !userId || pageIds.length === 0) return;
  try {
    await supabase.from('pages').delete().in('id', pageIds).eq('user_id', userId);
  } catch (err) {
    console.error('Failed to delete pages from Supabase:', err);
  }
}

export async function upsertMentionToSupabase(userId: string, mention: Mention, workspaceId?: string): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from('mentions').upsert(
      {
        id: mention.id,
        user_id: userId,
        workspace_id: workspaceId || null,
        target_page_id: mention.target_page_id,
        source_page_id: mention.source_page_id,
        span_start: mention.span_start,
        span_end: mention.span_end,
        snippet: mention.snippet,
        source: mention.source,
        orphaned: mention.orphaned,
      },
      { onConflict: 'id' }
    );
  } catch (err) {
    console.error('Failed to upsert mention to Supabase:', err);
  }
}

export async function deleteMentionFromSupabase(userId: string, mentionId: string): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from('mentions').delete().eq('id', mentionId).eq('user_id', userId);
  } catch (err) {
    console.error('Failed to delete mention from Supabase:', err);
  }
}

export async function syncAllWorkspacesToSupabase(userId: string, workspaces: Workspace[]): Promise<void> {
  if (!supabase || !userId || workspaces.length === 0) return;
  try {
    for (const ws of workspaces) {
      await upsertWorkspaceToSupabase(userId, ws);
      for (const p of ws.pages || []) {
        await upsertPageToSupabase(userId, p, ws.id);
      }
      for (const m of ws.mentions || []) {
        await upsertMentionToSupabase(userId, m, ws.id);
      }
    }
  } catch (err) {
    console.error('Failed to sync all workspaces to Supabase:', err);
  }
}

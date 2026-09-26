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
    // 1. Fetch all Pages for this user
    const { data: pageRows, error: pagesError } = await supabase
      .from('pages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (pagesError) {
      console.warn('Supabase fetch pages warning:', pagesError.message);
    }

    // 2. Fetch all Mentions for this user
    const { data: mentionRows, error: mentionsError } = await supabase
      .from('mentions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (mentionsError) {
      console.warn('Supabase fetch mentions warning:', mentionsError.message);
    }

    // 3. Fetch all Workspaces for this user (ordered by latest activity)
    const { data: wsRows, error: wsError } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (wsError) {
      console.warn('Supabase fetch workspaces warning:', wsError.message);
    }

    const hasPages = Array.isArray(pageRows) && pageRows.length > 0;
    const hasWorkspaces = Array.isArray(wsRows) && wsRows.length > 0;

    // If no workspaces and no pages exist in Supabase for this user, return null so we can initialize/migrate
    if (!hasPages && !hasWorkspaces) {
      return { workspaces: null, activeWorkspaceId: null };
    }

    const allPages: Page[] = (pageRows || []).map((row) => {
      let referencedPageIds: string[] = [];
      if (Array.isArray(row.referenced_page_ids)) {
        referencedPageIds = row.referenced_page_ids;
      } else if (typeof row.referenced_page_ids === 'string') {
        try {
          referencedPageIds = JSON.parse(row.referenced_page_ids);
        } catch {
          referencedPageIds = [];
        }
      }

      let versions: any[] = [];
      if (Array.isArray(row.versions)) {
        versions = row.versions;
      } else if (typeof row.versions === 'string') {
        try {
          versions = JSON.parse(row.versions);
        } catch {
          versions = [];
        }
      }

      let title = row.title || 'Untitled';
      let content = row.content || '';
      let needsDbUpdate = false;

      if (
        row.type === 'note' &&
        (title.toLowerCase() === 'welcome' ||
          title.toLowerCase().includes('welcome') ||
          row.short_id === 'n1' ||
          row.id?.includes('welcome'))
      ) {
        if (title.toLowerCase() === 'welcome' || title === 'Welcome') {
          title = 'Welcome to Notehook! 👋';
        }
        const cleanedContent = content.replace(/^\s*#\s+[^\n]*\n+/i, '').trim();
        if (cleanedContent !== content || title !== row.title) {
          content = cleanedContent;
          needsDbUpdate = true;
        }
      }

      const pageObj: Page = {
        id: row.id,
        short_id: row.short_id,
        type: row.type,
        title,
        content,
        created_at: row.created_at || new Date().toISOString(),
        updated_at: row.updated_at,
        role: row.role,
        done: Boolean(row.done),
        starred: Boolean(row.starred),
        pinned: Boolean(row.pinned),
        user_prompt: row.user_prompt,
        injected_context: row.injected_context,
        referenced_page_ids: referencedPageIds,
        canonical_version_id: row.canonical_version_id,
        current_version_num: row.current_version_num || 1,
        versions: versions,
      };

      if (needsDbUpdate) {
        upsertPageToSupabase(userId, pageObj, row.workspace_id);
      }

      return pageObj;
    });

    const allMentions: Mention[] = (mentionRows || []).map((row) => ({
      id: row.id,
      target_page_id: row.target_page_id,
      source_page_id: row.source_page_id,
      span_start: typeof row.span_start === 'number' ? row.span_start : undefined,
      span_end: typeof row.span_end === 'number' ? row.span_end : undefined,
      snippet: row.snippet || '',
      source: row.source || 'auto',
      orphaned: Boolean(row.orphaned),
      created_at: row.created_at || new Date().toISOString(),
    }));

    // If workspaces exist, partition pages and mentions by workspace_id
    if (hasWorkspaces && wsRows) {
      const workspaces: Workspace[] = wsRows.map((wRow, idx) => {
        // Collect pages matching workspace_id or unassigned pages attached to the first workspace
        const wsPages = (pageRows || [])
          .filter((pRow) => pRow.workspace_id === wRow.id || (!pRow.workspace_id && idx === 0))
          .map((pRow) => allPages.find((p) => p.id === pRow.id)!)
          .filter(Boolean);

        const wsMentions = (mentionRows || [])
          .filter((mRow) => mRow.workspace_id === wRow.id || (!mRow.workspace_id && idx === 0))
          .map((mRow) => allMentions.find((m) => m.id === mRow.id)!)
          .filter(Boolean);

        let pinned: string[] = [];
        if (Array.isArray(wRow.pinned_page_ids)) {
          pinned = wRow.pinned_page_ids;
        } else if (typeof wRow.pinned_page_ids === 'string') {
          try {
            pinned = JSON.parse(wRow.pinned_page_ids);
          } catch {
            pinned = [];
          }
        }
        if (pinned.length === 0) {
          pinned = wsPages.filter((p) => p.pinned).map((p) => p.id);
        }

        return {
          id: wRow.id,
          name: wRow.name || 'My Workspace',
          created_at: wRow.created_at || new Date().toISOString(),
          updated_at: wRow.updated_at || new Date().toISOString(),
          last_opened_at: wRow.updated_at || wRow.created_at || new Date().toISOString(),
          pages: wsPages,
          mentions: wsMentions,
          pinnedPageIds: pinned,
        };
      });

      // If all workspaces somehow ended up empty but allPages has data, put allPages in workspace 0
      if (allPages.length > 0 && workspaces.every((w) => w.pages.length === 0)) {
        workspaces[0].pages = allPages;
        workspaces[0].mentions = allMentions;
      }

      return {
        workspaces,
        activeWorkspaceId: workspaces[0]?.id || null,
      };
    }

    // If pages exist but no workspace row in DB, wrap them in a default workspace
    const defaultWs: Workspace = {
      id: `ws-${userId.slice(0, 8)}`,
      name: 'My Workspace',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      last_opened_at: new Date().toISOString(),
      pages: allPages,
      mentions: allMentions,
      pinnedPageIds: allPages.filter((p) => p.pinned).map((p) => p.id),
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
    const payload: any = {
      id: workspace.id,
      user_id: userId,
      name: workspace.name || 'My Workspace',
      pinned_page_ids: workspace.pinnedPageIds || [],
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('workspaces').upsert(payload, { onConflict: 'id' });
    if (error) {
      if (error.message?.includes('pinned_page_ids')) {
        delete payload.pinned_page_ids;
        await supabase.from('workspaces').upsert(payload, { onConflict: 'id' });
      } else {
        console.warn('Supabase upsert workspace warning:', error.message);
      }
    }
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
    const payload: any = {
      id: page.id,
      user_id: userId,
      short_id: page.short_id,
      type: page.type,
      title: page.title || 'Untitled',
      content: page.content || '',
      role: page.role || null,
      done: Boolean(page.done),
      starred: Boolean(page.starred),
      pinned: Boolean(page.pinned),
      user_prompt: page.user_prompt || null,
      injected_context: page.injected_context || null,
      referenced_page_ids: page.referenced_page_ids || [],
      canonical_version_id: page.canonical_version_id || null,
      current_version_num: page.current_version_num || 1,
      versions: page.versions || [],
      updated_at: new Date().toISOString(),
    };

    if (workspaceId) {
      payload.workspace_id = workspaceId;
    }

    const { error } = await supabase.from('pages').upsert(payload, { onConflict: 'id' });
    if (error) {
      // If error is caused by workspace_id column missing or FK constraint, retry without workspace_id
      if (error.message?.includes('workspace_id') || error.message?.includes('foreign key')) {
        delete payload.workspace_id;
        const { error: retryErr } = await supabase.from('pages').upsert(payload, { onConflict: 'id' });
        if (retryErr) {
          console.warn('Supabase upsert page retry warning:', retryErr.message);
        }
      } else {
        console.warn('Supabase upsert page warning:', error.message);
      }
    }
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
    const payload: any = {
      id: mention.id,
      user_id: userId,
      target_page_id: mention.target_page_id,
      source_page_id: mention.source_page_id,
      span_start: typeof mention.span_start === 'number' ? mention.span_start : null,
      span_end: typeof mention.span_end === 'number' ? mention.span_end : null,
      snippet: mention.snippet || '',
      source: mention.source || 'auto',
      orphaned: Boolean(mention.orphaned),
    };

    if (workspaceId) {
      payload.workspace_id = workspaceId;
    }

    const { error } = await supabase.from('mentions').upsert(payload, { onConflict: 'id' });
    if (error) {
      if (error.message?.includes('workspace_id') || error.message?.includes('foreign key')) {
        delete payload.workspace_id;
        const { error: retryErr } = await supabase.from('mentions').upsert(payload, { onConflict: 'id' });
        if (retryErr) {
          console.warn('Supabase upsert mention retry warning:', retryErr.message);
        }
      } else {
        console.warn('Supabase upsert mention warning:', error.message);
      }
    }
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


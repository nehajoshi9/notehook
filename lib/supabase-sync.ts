import { supabase } from './supabase';
import { Page, Mention } from './types';

export async function fetchUserWorkspaceData(userId: string): Promise<{
  pages: Page[] | null;
  mentions: Mention[] | null;
  workspaceName: string | null;
}> {
  if (!supabase || !userId) {
    return { pages: null, mentions: null, workspaceName: null };
  }

  try {
    // 1. Fetch Workspace Name
    const { data: wsData } = await supabase
      .from('workspaces')
      .select('name')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    // 2. Fetch Pages
    const { data: pagesData, error: pagesError } = await supabase
      .from('pages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (pagesError) {
      console.warn('Supabase fetch pages warning:', pagesError.message);
    }

    // 3. Fetch Mentions
    const { data: mentionsData, error: mentionsError } = await supabase
      .from('mentions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (mentionsError) {
      console.warn('Supabase fetch mentions warning:', mentionsError.message);
    }

    const pages: Page[] | null = pagesData ? pagesData.map((row) => ({
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
      referenced_page_ids: row.referenced_page_ids || [],
      canonical_version_id: row.canonical_version_id,
      current_version_num: row.current_version_num || 1,
      versions: row.versions || [],
    })) : null;

    const mentions: Mention[] | null = mentionsData ? mentionsData.map((row) => ({
      id: row.id,
      target_page_id: row.target_page_id,
      source_page_id: row.source_page_id,
      span_start: row.span_start,
      span_end: row.span_end,
      snippet: row.snippet,
      source: row.source,
      orphaned: row.orphaned,
      created_at: row.created_at,
    })) : null;

    return {
      pages,
      mentions,
      workspaceName: wsData?.name || null,
    };
  } catch (err) {
    console.error('Error fetching Supabase workspace data:', err);
    return { pages: null, mentions: null, workspaceName: null };
  }
}

export async function upsertPageToSupabase(userId: string, page: Page): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from('pages').upsert(
      {
        id: page.id,
        user_id: userId,
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

export async function upsertMentionToSupabase(userId: string, mention: Mention): Promise<void> {
  if (!supabase || !userId) return;
  try {
    await supabase.from('mentions').upsert(
      {
        id: mention.id,
        user_id: userId,
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

export async function saveWorkspaceNameToSupabase(userId: string, name: string): Promise<void> {
  if (!supabase || !userId) return;
  try {
    const { data: existing } = await supabase
      .from('workspaces')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase
        .from('workspaces')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
    } else {
      await supabase
        .from('workspaces')
        .insert({ user_id: userId, name });
    }
  } catch (err) {
    console.error('Failed to save workspace name to Supabase:', err);
  }
}

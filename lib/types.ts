export type PageType = 'message' | 'todo' | 'decision' | 'entity' | 'note';
export type MentionSource = 'auto' | 'manual';

export interface EntityVersion {
  id: string;
  entity_id: string;
  version_num: number;
  title: string;
  content: string;
  source_page_id?: string;
  created_at: string;
  updated_at?: string;
  is_canonical?: boolean;
}

// Unified Page Model (Superclass of everything in the system)
export interface Page {
  id: string;
  type: PageType;
  title: string; // short title (40-50 chars max, editable)
  content: string; // full text / body
  created_at: string;
  updated_at?: string;

  // Type-specific optional properties
  role?: 'user' | 'assistant'; // For chat message turns
  done?: boolean; // for type: 'todo'
  starred?: boolean; // for type: 'todo'
  user_prompt?: string; // Framing metadata: exact user prompt text
  versions?: EntityVersion[];
  canonical_version_id?: string;
  current_version_num?: number;
}

// Unified Mention Model (Sentence/excerpt level granularity)
export interface Mention {
  id: string;
  target_page_id: string; // target entity, todo, or decision page
  source_page_id: string; // source message page (turn)
  span_start?: number;
  span_end?: number;
  snippet?: string; // excerpt text surrounding mention
  source: MentionSource; // 'auto' | 'manual'
  orphaned?: boolean;
  created_at: string;
}

// Compat aliases
export type Message = Page;
export type Note = Page;
export type CanonicalEntity = Page;
export type TodoItem = Page;
export type DecisionItem = Page;
export type EntityMention = Mention;

export type ViewType = 'message' | 'note' | 'entity' | 'todo' | 'decision' | 'todo_board' | 'decision_log' | 'entity_index' | 'note_index' | 'chat' | 'empty';

export interface PaneState {
  type: ViewType;
  id: string | null; // page id or view type
  title?: string;
  highlightSpan?: string;
}

export interface AISettings {
  provider: 'openai' | 'anthropic' | 'gemini' | 'simulated';
  apiKey: string;
  model: string;
}


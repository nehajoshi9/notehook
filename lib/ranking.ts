import { Page } from './types';
import { formatCanonicalRawTag } from './scribe-parser';

export interface SuggestionItem {
  id: string;
  title: string;
  type: 'page' | 'primitive';
  itemType?: 'entity' | 'message' | 'todo' | 'decision' | 'note';
  primitiveType?: 'todo' | 'decision' | 'note';
  description?: string;
  score: number;
  scopeLabel: string;
  pageId?: string;
}

export function normalizeAutocompleteKey(value: string): string {
  return value.trim().toLowerCase();
}

export function compareAutocompleteOptions(
  a: string,
  b: string,
  normalizedDraft: string
): number {
  const na = normalizeAutocompleteKey(a);
  const nb = normalizeAutocompleteKey(b);

  const rank = (n: string): [number, number, number] => {
    if (n === normalizedDraft) return [0, 0, n.length];
    if (n.startsWith(normalizedDraft)) return [1, 0, n.length];
    const index = n.indexOf(normalizedDraft);
    return [2, index, n.length];
  };

  const ra = rank(na);
  const rb = rank(nb);
  for (let i = 0; i < 3; i += 1) {
    if (ra[i] !== rb[i]) return ra[i] - rb[i];
  }
  return na.localeCompare(nb);
}

/**
 * Deterministic Ranking Engine for Unified Pages:
 * Explicit @ trigger -> can suggest primitives & creating new pages.
 * Implicit 3-char trigger -> ONLY suggests existing known pages/entities.
 */
export function getRankedSuggestions(
  query: string,
  pages: Page[],
  currentPage: Page | null,
  isExplicitAtTrigger: boolean = false
): SuggestionItem[] {
  const cleanQuery = query.toLowerCase().trim().replace(/^@/, '');
  const suggestions: SuggestionItem[] = [];

  // Primitive creation shortcuts (only on explicit @ trigger or typing todo/decision/note)
  if (isExplicitAtTrigger || cleanQuery.startsWith('todo') || cleanQuery.startsWith('decision') || cleanQuery.startsWith('note')) {
    if (!cleanQuery || 'todo'.startsWith(cleanQuery)) {
      suggestions.push({
        id: 'primitive-todo',
        title: '@todo',
        type: 'primitive',
        primitiveType: 'todo',
        itemType: 'todo',
        description: 'Insert inline task item',
        score: 400,
        scopeLabel: 'Task',
      });
    }

    if (!cleanQuery || 'decision'.startsWith(cleanQuery)) {
      suggestions.push({
        id: 'primitive-decision',
        title: '@decision',
        type: 'primitive',
        primitiveType: 'decision',
        itemType: 'decision',
        description: 'Insert decision badge',
        score: 390,
        scopeLabel: 'Decision',
      });
    }

    if (!cleanQuery || 'note'.startsWith(cleanQuery)) {
      suggestions.push({
        id: 'primitive-note',
        title: '@note',
        type: 'primitive',
        primitiveType: 'note' as any,
        itemType: 'note',
        description: 'Insert user note',
        score: 385,
        scopeLabel: 'Note',
      });
    }
  }

  // Match known pages by Page sub-type (Entity vs Note vs Message vs Todo vs Decision)
  pages.forEach((page) => {
    const titleLower = page.title.toLowerCase();

    if (!cleanQuery || titleLower.startsWith(cleanQuery) || titleLower.includes(cleanQuery)) {
      let score = 100;
      let scopeLabel = 'Page';
      const pageSubtype = page.type || 'entity';

      if (pageSubtype === 'entity') {
        score = 300; // Entity pages rank right below primitives
        scopeLabel = 'Entity';
      } else if (pageSubtype === 'note') {
        score = 250;
        scopeLabel = 'Note';
      } else if (pageSubtype === 'todo') {
        score = 200;
        scopeLabel = 'Todo';
      } else if (pageSubtype === 'decision') {
        score = 200;
        scopeLabel = 'Decision';
      } else if (pageSubtype === 'message') {
        score = 10; // Messages score lowest as requested (rarely referenced)
        scopeLabel = 'Message';
      }

      if (titleLower === cleanQuery) {
        score += 50;
      } else if (titleLower.startsWith(cleanQuery)) {
        score += 25;
      }

      suggestions.push({
        id: page.id,
        title: page.title,
        type: 'page',
        itemType: pageSubtype as any,
        description: `${scopeLabel} page`,
        score,
        scopeLabel,
        pageId: page.id,
      });
    }
  });

  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return compareAutocompleteOptions(a.title, b.title, cleanQuery);
  });

  // 3. Create items when typing a non-existent page/todo/decision/note name
  if (isExplicitAtTrigger && cleanQuery) {
    const isTodoQuery = cleanQuery.startsWith('todo:') || cleanQuery.startsWith('todo ');
    const isDecisionQuery = cleanQuery.startsWith('decision:') || cleanQuery.startsWith('decision ');
    const isNoteQuery = cleanQuery.startsWith('note:') || cleanQuery.startsWith('note ');

    if (isTodoQuery) {
      const taskTitle = query.replace(/^[\[@]*todo:?\s*/i, '').trim();
      if (taskTitle && !pages.some((p) => p.type === 'todo' && p.title.toLowerCase() === taskTitle.toLowerCase())) {
        suggestions.unshift({
          id: `create-todo-${normalizeAutocompleteKey(taskTitle)}`,
          title: `[@todo: ${taskTitle}]`,
          type: 'page',
          itemType: 'todo',
          primitiveType: 'todo',
          description: `Create new task "${taskTitle}"`,
          score: 450,
          scopeLabel: 'New Todo',
        });
      }
    } else if (isDecisionQuery) {
      const decisionTitle = query.replace(/^[\[@]*decision:?\s*/i, '').trim();
      if (decisionTitle && !pages.some((p) => p.type === 'decision' && p.title.toLowerCase() === decisionTitle.toLowerCase())) {
        suggestions.unshift({
          id: `create-decision-${normalizeAutocompleteKey(decisionTitle)}`,
          title: `[@decision: ${decisionTitle}]`,
          type: 'page',
          itemType: 'decision',
          primitiveType: 'decision',
          description: `Create new decision "${decisionTitle}"`,
          score: 450,
          scopeLabel: 'New Decision',
        });
      }
    } else if (isNoteQuery) {
      const noteTitle = query.replace(/^[\[@]*note:?\s*/i, '').trim();
      if (noteTitle) {
        suggestions.unshift({
          id: `create-note-${normalizeAutocompleteKey(noteTitle)}`,
          title: formatCanonicalRawTag('note', noteTitle),
          type: 'page',
          itemType: 'note',
          primitiveType: 'note' as any,
          description: `Create new note "${noteTitle}"`,
          score: 450,
          scopeLabel: 'New Note',
        });
      }
    } else if (cleanQuery !== 'todo' && cleanQuery !== 'decision' && cleanQuery !== 'note') {
      const formattedTitle = query.replace(/^[\[@]+/, '').trim();
      if (formattedTitle) {
        suggestions.push({
          id: `create-entity-${normalizeAutocompleteKey(formattedTitle)}`,
          title: `[@${formattedTitle}]`,
          type: 'page',
          itemType: 'entity',
          description: `Create new entity page "${formattedTitle}"`,
          score: 350,
          scopeLabel: 'New Entity',
        });
        suggestions.push({
          id: `create-todo-${normalizeAutocompleteKey(formattedTitle)}`,
          title: `[@todo: ${formattedTitle}]`,
          type: 'page',
          itemType: 'todo',
          primitiveType: 'todo',
          description: `Create new task "${formattedTitle}"`,
          score: 340,
          scopeLabel: 'New Todo',
        });
        suggestions.push({
          id: `create-decision-${normalizeAutocompleteKey(formattedTitle)}`,
          title: `[@decision: ${formattedTitle}]`,
          type: 'page',
          itemType: 'decision',
          primitiveType: 'decision',
          description: `Create new decision "${formattedTitle}"`,
          score: 330,
          scopeLabel: 'New Decision',
        });
        suggestions.push({
          id: `create-note-${normalizeAutocompleteKey(formattedTitle)}`,
          title: formatCanonicalRawTag('note', formattedTitle),
          type: 'page',
          itemType: 'note',
          primitiveType: 'note' as any,
          description: `Create new note "${formattedTitle}"`,
          score: 320,
          scopeLabel: 'New Note',
        });
      }
    }
  }

  return suggestions;
}

export function getAutocompleteTail(draft: string, highlightedTitle: string): string {
  const normDraft = draft.trim().toLowerCase().replace(/^@/, '');
  const normHighlighted = highlightedTitle.trim().toLowerCase().replace(/^@/, '');

  if (normDraft && normHighlighted && normHighlighted.startsWith(normDraft)) {
    return highlightedTitle.replace(/^@/, '').slice(normDraft.length);
  }
  return '';
}

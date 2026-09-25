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
  shortId?: string;
  isBold?: boolean;
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
 * Ranks primitives & existing pages when typing @ or selecting text.
 * Recognizes both page titles and chip id tags (e.g. e1, m2, n1, d1, t3).
 */
export function getRankedSuggestions(
  query: string,
  pages: Page[],
  _currentPage: Page | null = null
): SuggestionItem[] {
  const cleanQuery = query.toLowerCase().trim().replace(/^[\[@]+/, '').replace(/[\]]+$/, '').trim();
  const suggestions: SuggestionItem[] = [];

  // Primitive creation shortcuts
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

  // Match known pages by Page sub-type (Entity vs Note vs Message vs Todo vs Decision)
  // Supports searching by title OR by chip ID tag (e.g. e1, m2, t3, d1, n4)
  pages.forEach((page) => {
    const titleLower = page.title.toLowerCase();
    const shortIdLower = page.short_id?.toLowerCase() || '';

    const titleMatches = !cleanQuery || titleLower.startsWith(cleanQuery) || titleLower.includes(cleanQuery);
    const shortIdExactMatch = Boolean(shortIdLower && shortIdLower === cleanQuery);
    const shortIdPrefixMatch = Boolean(shortIdLower && cleanQuery && shortIdLower.startsWith(cleanQuery));

    if (titleMatches || shortIdExactMatch || shortIdPrefixMatch) {
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
        score = 10; // Messages score lowest by default (rarely referenced)
        scopeLabel = 'Message';
      }

      if (titleLower === cleanQuery) {
        score += 50;
      } else if (titleLower.startsWith(cleanQuery)) {
        score += 25;
      }

      // ID Tag relevance scoring: exact ID tag match jumps directly to top (#1)
      if (shortIdExactMatch) {
        score = 1000;
      } else if (shortIdPrefixMatch && cleanQuery.length >= 2) {
        score += 200;
      } else if (shortIdPrefixMatch) {
        score += 25;
      }

      suggestions.push({
        id: page.id,
        title: page.title,
        type: 'page',
        itemType: pageSubtype as any,
        description: page.short_id ? `[@${page.short_id}] ${scopeLabel} page` : `${scopeLabel} page`,
        score,
        scopeLabel,
        pageId: page.id,
        shortId: page.short_id,
      });
    }
  });

  suggestions.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (cleanQuery) {
      const aExact = a.shortId?.toLowerCase() === cleanQuery;
      const bExact = b.shortId?.toLowerCase() === cleanQuery;
      if (aExact && !bExact) return -1;
      if (!aExact && bExact) return 1;
    }
    return compareAutocompleteOptions(a.title, b.title, cleanQuery);
  });

  // Create items when typing a non-existent page/todo/decision name
  if (cleanQuery) {
    const isTodoQuery = cleanQuery.startsWith('todo:') || cleanQuery.startsWith('todo ');
    const isDecisionQuery = cleanQuery.startsWith('decision:') || cleanQuery.startsWith('decision ');
    const isExistingShortId = pages.some(
      (p) => p.short_id && p.short_id.toLowerCase() === cleanQuery
    );

    if (isTodoQuery) {
      const taskTitle = query.replace(/^[\[@]*todo:?\s*/i, '').replace(/[\]]+$/, '').trim();
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
      const decisionTitle = query.replace(/^[\[@]*decision:?\s*/i, '').replace(/[\]]+$/, '').trim();
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
    } else if (
      cleanQuery !== 'todo' &&
      cleanQuery !== 'decision' &&
      cleanQuery !== 'note' &&
      !isExistingShortId
    ) {
      const formattedTitle = query.replace(/^[\[@]+/, '').replace(/[\]]+$/, '').trim();
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

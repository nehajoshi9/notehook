import React from 'react';
import { Page } from './types';
import { convertNotehookTextToHtml } from './notehook-parser';
import { useNotehook } from './context';

export function matchesExplicitReference(text: string, targetTitle: string, targetShortId?: string): boolean {
  if (!text) return false;

  if (targetTitle) {
    const cleanTarget = targetTitle.replace(/^@/, '').trim();
    if (cleanTarget) {
      const escaped = cleanTarget.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\[@(todo:|decision:|note:|message:)?\\s*${escaped}\\s*\\]`, 'i');
      if (regex.test(text)) return true;
    }
  }

  if (targetShortId) {
    const cleanShort = targetShortId.trim();
    if (cleanShort) {
      const escapedShort = cleanShort.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const shortRegex = new RegExp(`\\[@${escapedShort}\\]`, 'i');
      if (shortRegex.test(text)) return true;
    }
  }

  return false;
}

export interface NotehookToken {
  text: string;
  isPill: boolean;
  weight: number;
}

export function tokenizeNotehookText(text: string): NotehookToken[] {
  const tokens: NotehookToken[] = [];
  const tagRegex = /\[@(todo:|decision:|note:|message:)?\s*([^\]]+)\]/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    const plainBefore = text.slice(lastIndex, match.index);
    if (plainBefore) {
      const parts = plainBefore.split(/(\s+)/);
      parts.forEach((p) => {
        if (!p) return;
        tokens.push({
          text: p,
          isPill: false,
          weight: p.trim() ? 1 : 0,
        });
      });
    }

    const weight = 2; // All pills count as 2 words towards excerpt word budget

    tokens.push({
      text: match[0],
      isPill: true,
      weight,
    });

    lastIndex = match.index + match[0].length;
  }

  const plainAfter = text.slice(lastIndex);
  if (plainAfter) {
    const parts = plainAfter.split(/(\s+)/);
    parts.forEach((p) => {
      if (!p) return;
      tokens.push({
        text: p,
        isPill: false,
        weight: p.trim() ? 1 : 0,
      });
    });
  }

  return tokens;
}

export function extractSnippetsFromText(
  text: string,
  targetTitle: string,
  targetShortId?: string,
  prefix?: string
): string[] {
  if (!text || !text.trim()) return [];

  const cleanTarget = (targetTitle || '').replace(/^@/, '').trim();
  const cleanShortId = (targetShortId || '').trim();

  const tokens = tokenizeNotehookText(text.trim());
  if (tokens.length === 0) return [];

  const matchIndices: number[] = [];

  const escapedTitle = cleanTarget ? cleanTarget.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') : null;
  const titleRegex = escapedTitle ? new RegExp(`\\[@(todo:|decision:|note:|message:)?\\s*${escapedTitle}\\s*\\]`, 'i') : null;

  const escapedShort = cleanShortId ? cleanShortId.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') : null;
  const shortRegex = escapedShort ? new RegExp(`\\[@${escapedShort}\\]`, 'i') : null;

  tokens.forEach((tok, idx) => {
    if (tok.isPill) {
      if ((titleRegex && titleRegex.test(tok.text)) || (shortRegex && shortRegex.test(tok.text))) {
        matchIndices.push(idx);
      }
    }
  });

  if (matchIndices.length === 0) return [];

  const totalDocWeight = tokens.reduce((sum, t) => sum + t.weight, 0);
  const WORD_BUDGET = 26;

  // If entire text fits within word budget, return full text without truncation
  if (totalDocWeight <= WORD_BUDGET) {
    const full = tokens.map((t) => t.text).join('').trim();
    return [prefix ? `${prefix}${full}` : full];
  }

  return matchIndices.slice(0, 2).map((matchIdx) => {
    let midStart = matchIdx;
    let midEnd = matchIdx;
    let currentWeight = tokens[matchIdx].weight;

    while (currentWeight < WORD_BUDGET && (midStart > 0 || midEnd < tokens.length - 1)) {
      let expanded = false;
      if (midStart > 0 && currentWeight < WORD_BUDGET) {
        midStart--;
        currentWeight += tokens[midStart].weight;
        expanded = true;
      }
      if (midEnd < tokens.length - 1 && currentWeight < WORD_BUDGET) {
        midEnd++;
        currentWeight += tokens[midEnd].weight;
        expanded = true;
      }
      if (!expanded) break;
    }

    const hasStartGap = midStart > 0;
    const hasEndGap = midEnd < tokens.length - 1;

    const segmentText = tokens.slice(midStart, midEnd + 1).map((t) => t.text).join('').trim();
    const result = `${hasStartGap ? '… ' : ''}${segmentText}${hasEndGap ? ' …' : ''}`;

    return prefix ? `${prefix}${result}` : result;
  });
}

export function getMentionSnippetsForPage(page: Page, targetTitle: string, targetShortId?: string): string[] {
  if (!targetTitle && !targetShortId) return [];

  const snippets: string[] = [];

  // 1. Extract mentions from main content body first
  if (page.content) {
    const contentSnippets = extractSnippetsFromText(page.content, targetTitle, targetShortId);
    snippets.push(...contentSnippets);
  }

  // 2. Extract mentions from user_prompt only if user prompt explicitly references the target
  if (page.user_prompt) {
    const promptSnippets = extractSnippetsFromText(page.user_prompt, targetTitle, targetShortId, 'Prompt: ');
    if (promptSnippets.length > 0) {
      if (snippets.length === 0) {
        snippets.push(...promptSnippets);
      } else {
        snippets.unshift(...promptSnippets);
      }
    }
  }

  // 3. Fallback: If page was linked via relational junction without direct bracket match in text
  if (snippets.length === 0) {
    const fallbackSource = page.content || page.user_prompt || '';
    if (fallbackSource.trim()) {
      const tokens = tokenizeNotehookText(fallbackSource.trim());
      const excerpt = tokens.slice(0, 20).map((t) => t.text).join('').trim();
      snippets.push(tokens.length > 20 ? `${excerpt} …` : excerpt);
    }
  }

  return snippets.slice(0, 2);
}

export const MentionHighlightedText: React.FC<{ text: string; targetTitle: string }> = ({
  text,
}) => {
  const { pages } = useNotehook();
  const html = convertNotehookTextToHtml(text, 'auto', pages);
  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="text-xs text-zinc-700 leading-relaxed font-sans"
    />
  );
};

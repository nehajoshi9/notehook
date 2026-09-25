import React from 'react';
import { Page } from './types';
import { convertScribeTextToHtml } from './scribe-parser';

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

interface ScribeToken {
  text: string;
  isPill: boolean;
  weight: number;
}

export function tokenizeScribeText(text: string): ScribeToken[] {
  const tokens: ScribeToken[] = [];
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

    const tagTypeRaw = (match[1] || '').toLowerCase().replace(':', '');
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

export function getMentionSnippetsForPage(page: Page, targetTitle: string, targetShortId?: string): string[] {
  if (!targetTitle && !targetShortId) return [];

  const cleanTarget = (targetTitle || '').replace(/^@/, '').trim();
  const cleanShortId = (targetShortId || '').trim();

  const textToSearch = `${page.user_prompt || ''} ${page.content || ''}`.trim();
  if (!textToSearch) return [];

  const tokens = tokenizeScribeText(textToSearch);
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
  const WORD_BUDGET = 30;

  // If entire document is within 30 words, return full text without truncation
  if (totalDocWeight <= WORD_BUDGET) {
    return [tokens.map((t) => t.text).join('').trim()];
  }

  return matchIndices.slice(0, 3).map((matchIdx) => {
    // Representative sample budget allocation:
    // Reserve ~3 words for start segment, ~3 words for end segment, ~24 words for middle mention segment
    const START_RESERVE = 3;
    const END_RESERVE = 3;
    const MIDDLE_BUDGET = WORD_BUDGET - START_RESERVE - END_RESERVE; // 24 words

    let midStart = matchIdx;
    let midEnd = matchIdx;
    let midWeight = tokens[matchIdx].weight;

    while (midWeight < MIDDLE_BUDGET && (midStart > 0 || midEnd < tokens.length - 1)) {
      let expanded = false;
      if (midStart > 0) {
        midStart--;
        midWeight += tokens[midStart].weight;
        expanded = true;
      }
      if (midWeight < MIDDLE_BUDGET && midEnd < tokens.length - 1) {
        midEnd++;
        midWeight += tokens[midEnd].weight;
        expanded = true;
      }
      if (!expanded) break;
    }

    const overlapsStart = midStart <= 4;
    const overlapsEnd = midEnd >= tokens.length - 5;

    let startTokens: ScribeToken[] = [];
    let endTokens: ScribeToken[] = [];
    let hasStartGap = false;
    let hasEndGap = false;

    if (overlapsStart && overlapsEnd) {
      midStart = 0;
      midEnd = tokens.length - 1;
    } else if (overlapsStart && !overlapsEnd) {
      midStart = 0;
      let w = tokens.slice(0, midEnd + 1).reduce((s, t) => s + t.weight, 0);
      while (w < WORD_BUDGET - END_RESERVE && midEnd < tokens.length - 1) {
        midEnd++;
        w += tokens[midEnd].weight;
      }
      const lastTokens = tokens.slice(-3);
      if (midEnd < tokens.length - 4) {
        endTokens = lastTokens;
        hasEndGap = true;
      } else {
        midEnd = tokens.length - 1;
      }
    } else if (!overlapsStart && overlapsEnd) {
      midEnd = tokens.length - 1;
      let w = tokens.slice(midStart).reduce((s, t) => s + t.weight, 0);
      while (w < WORD_BUDGET - START_RESERVE && midStart > 0) {
        midStart--;
        w += tokens[midStart].weight;
      }
      const firstTokens = tokens.slice(0, 3);
      if (midStart > 3) {
        startTokens = firstTokens;
        hasStartGap = true;
      } else {
        midStart = 0;
      }
    } else {
      startTokens = tokens.slice(0, 3);
      hasStartGap = midStart > 3;

      endTokens = tokens.slice(-3);
      hasEndGap = midEnd < tokens.length - 4;
    }

    const parts: string[] = [];

    if (startTokens.length > 0) {
      parts.push(startTokens.map((t) => t.text).join('').trim());
    }

    if (hasStartGap) {
      parts.push('...');
    }

    parts.push(tokens.slice(midStart, midEnd + 1).map((t) => t.text).join('').trim());

    if (hasEndGap) {
      parts.push('...');
    }

    if (endTokens.length > 0) {
      parts.push(endTokens.map((t) => t.text).join('').trim());
    }

    return parts.join(' ').replace(/\s+/g, ' ').trim();
  });
}

import { usePlanet } from './context';

export const MentionHighlightedText: React.FC<{ text: string; targetTitle: string }> = ({
  text,
}) => {
  const { pages } = usePlanet();
  const html = convertScribeTextToHtml(text, 'auto', pages);
  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      className="text-xs text-zinc-700 leading-relaxed font-sans"
    />
  );
};

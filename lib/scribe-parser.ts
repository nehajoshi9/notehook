import { Page, MentionSource } from './types';
import { getPastelColorForTitle } from './color';
import { Marked } from 'marked';
import katex from 'katex';

const marked = new Marked({
  gfm: true,
  breaks: true,
});

export interface ParsedItem {
  type: 'entity' | 'todo' | 'decision' | 'note';
  rawText: string;
  nameOrTitle: string;
  fullText: string;
  spanStart?: number;
  spanEnd?: number;
}

/**
 * Checks if the current cursor position in a text string lies inside an existing reference tag `[@... ]`.
 */
export function isCursorInsideReference(text: string, cursorPos: number): boolean {
  if (!text || cursorPos <= 0) return false;
  const textBefore = text.slice(0, cursorPos);
  const textAfter = text.slice(cursorPos);

  const lastOpenAt = textBefore.lastIndexOf('[@');
  if (lastOpenAt === -1) return false;

  const closingBeforeCursor = textBefore.indexOf(']', lastOpenAt);
  if (closingBeforeCursor !== -1 && closingBeforeCursor < cursorPos) {
    return false;
  }

  const closingAfterCursor = textAfter.indexOf(']');
  if (closingAfterCursor === -1) {
    return false;
  }

  const nextOpenAfterCursor = textAfter.indexOf('[@');
  if (nextOpenAfterCursor !== -1 && nextOpenAfterCursor < closingAfterCursor) {
    return false;
  }

  const nextNewlineAfterCursor = textAfter.indexOf('\n');
  if (nextNewlineAfterCursor !== -1 && nextNewlineAfterCursor < closingAfterCursor) {
    return false;
  }

  return true;
}

/**
 * Calculates exact character offset inside fullText from mouse click coordinates (x, y) on containerEl.
 * Fallbacks to fullText.length (end of area, after last character) if point is out of range or unresolvable.
 */
export function getCaretOffsetFromPoint(containerEl: HTMLElement | null, x: number, y: number, fullText: string): number {
  if (!containerEl || !fullText) return (fullText || '').length;

  try {
    let textNode: Node | null = null;
    let nodeOffset = 0;

    if (typeof document !== 'undefined') {
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(x, y);
        if (range) {
          textNode = range.startContainer;
          nodeOffset = range.startOffset;
        }
      } else if ((document as any).caretPositionFromPoint) {
        const pos = (document as any).caretPositionFromPoint(x, y);
        if (pos) {
          textNode = pos.offsetNode;
          nodeOffset = pos.offset;
        }
      }
    }

    if (textNode && containerEl.contains(textNode)) {
      const preCaretRange = document.createRange();
      preCaretRange.selectNodeContents(containerEl);
      preCaretRange.setEnd(textNode, nodeOffset);
      const offsetInHtmlText = preCaretRange.toString().length;

      return Math.min(Math.max(0, offsetInHtmlText), fullText.length);
    }
  } catch (e) {
    // Fallback on error
  }

  return fullText.length;
}

/**
 * Formats concise title truncated after maxWords (1 word for notes/entities, 2 words for todos/decisions)
 */
export function truncateTitleWords(titleText: string, maxWords: number): string {
  const cleaned = titleText.replace(/^(todo:|decision:|note:|\s*)+/i, '').trim();
  if (!cleaned) return 'Untitled';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return cleaned;
  }
  return `${words.slice(0, maxWords).join(' ')}…`;
}

/**
 * Untags reference tags from a text string, converting [@tag: Name] or @Name into plain text Name.
 */
export function untagReferences(text: string): string {
  if (!text) return '';
  let clean = text;
  // 1. Untag bracket tags [@todo: task], [@decision: rule], [@note: title], [@entity]
  clean = clean.replace(/\[@(todo|decision|note|message):\s*([^\]]+)\]/gi, '$2');
  clean = clean.replace(/\[@([^\]]+)\]/g, '$1');
  // 2. Untag unbracketed @tags: @todo: task, @decision: rule, @note: title, @entity
  clean = clean.replace(/@(?:todo|decision|note|message):\s*([^\s@\[\]]+)/gi, '$1');
  clean = clean.replace(/@([a-zA-Z0-9_\-\.]+)/g, '$1');
  return clean.replace(/\s+/g, ' ').trim();
}

/**
 * Formats item title without truncating raw text with ellipsis
 */
export function formatItemTitle(text: string, maxLen?: number): string {
  const cleaned = text.replace(/^(todo:|decision:|note:|\s*)+/i, '').trim();
  if (!cleaned) return 'Untitled';

  const normalized = cleaned.replace(/…$/, '').trim();

  if (maxLen !== undefined && normalized.length > maxLen) {
    // Reserve space for the ellipsis if maxLen allows
    return maxLen > 1
      ? normalized.slice(0, maxLen - 1).trimEnd() + '…'
      : normalized.slice(0, maxLen);
  }

  return normalized;
}
/**
 * Formats canonical raw bracket tag syntax according to architecture rules:
 * - Entity: [@Entity Title]
 * - Todo: [@todo: Task Description]
 * - Decision: [@decision: Architectural Decision]
 * - Note: [@note: Note Title]
 * - Message: [@message: Message Title]
 */
export function formatCanonicalRawTag(
  type: 'entity' | 'todo' | 'decision' | 'note' | 'message',
  title: string
): string {
  const cleanTitle = title.replace(/^@/, '').replace(/^(todo:|decision:|note:|message:|\s*)+/i, '').trim();
  switch (type) {
    case 'todo':
      return `[@todo: ${cleanTitle}]`;
    case 'decision':
      return `[@decision: ${cleanTitle}]`;
    case 'note':
      return `[@note: ${cleanTitle}]`;
    case 'message':
      return `[@message: ${cleanTitle}]`;
    case 'entity':
    default:
      return `[@${cleanTitle}]`;
  }
}

/**
 * Normalizes any unbracketed legacy tags (e.g. `@todo: Task`, `@decision: Decision`, `@Entity`)
 * into strict canonical bracket syntax (`[@todo: Task]`, `[@decision: Decision]`, `[@Entity]`).
 */
export function normalizeRawContentToCanonicalBrackets(text: string, pages?: Page[]): string {
  if (!text) return text;
  let result = text;

  // 1. Protect code blocks (```...``` and `...`) with placeholders
  const codeBlocks: string[] = [];
  result = result.replace(/(```[\s\S]*?```|`[^`\n]+`)/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_SPAN_PROTECTED_${codeBlocks.length - 1}__`;
  });

  // 2. Unbracketed @todo: task -> [@todo: task]
  result = result.replace(/(?<!\[)@todo:\s*([^@\n\r[\]<]+)/gi, (_, task) => {
    return `[@todo: ${task.trim()}]`;
  });

  // 3. Unbracketed @decision: choice -> [@decision: choice]
  result = result.replace(/(?<!\[)@decision:\s*([^@\n\r[\]<]+)/gi, (_, choice) => {
    return `[@decision: ${choice.trim()}]`;
  });

  // 4. Unbracketed @note: title -> [@note: title]
  result = result.replace(/(?<!\[)@note:\s*([^@\n\r[\]<]+)/gi, (_, title) => {
    return `[@note: ${title.trim()}]`;
  });

  // 5. Unbracketed @message: title -> [@message: title]
  result = result.replace(/(?<!\[)@message:\s*([^@\n\r[\]<]+)/gi, (_, title) => {
    return `[@message: ${title.trim()}]`;
  });

  // 6. Unbracketed page titles and chip id tags matching existing pages
  if (pages && pages.length > 0) {
    const sortedPages = [...pages].sort((a, b) => b.title.length - a.title.length);
    for (const p of sortedPages) {
      if (p.short_id) {
        const escapedShort = p.short_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const shortRegex = new RegExp(`(?<!\\[)@${escapedShort}(?!\\])`, 'gi');
        result = result.replace(shortRegex, `[@${p.short_id}]`);
        const bracketedShortRegex = new RegExp(`(?<!@)\\[${escapedShort}\\]`, 'gi');
        result = result.replace(bracketedShortRegex, `[@${p.short_id}]`);
      }
      const cleanTitle = p.title.replace(/^@/, '').trim();
      if (!cleanTitle) continue;
      const escaped = cleanTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const unbracketedRegex = new RegExp(`(?<!\\[)@${escaped}(?!\\])`, 'gi');
      result = result.replace(unbracketedRegex, `[@${cleanTitle}]`);
    }
  }

  // 7. Generic unbracketed @Word or @Multi-word titles (e.g. @Supabase)
  result = result.replace(/(?<!\[)@([A-Z][a-zA-Z0-9_\-\.\s&]{0,40}?)(?=[,.\n\r;!?]|\s*$)(?!\])/g, (fullMatch, tagContent) => {
    const trimmed = tagContent.trim();
    if (!trimmed) return fullMatch;
    if (trimmed.startsWith('todo:') || trimmed.startsWith('decision:') || trimmed.startsWith('note:') || trimmed.startsWith('message:')) {
      return fullMatch;
    }
    return `[@${trimmed}]`;
  });

  // 8. Restore code blocks
  result = result.replace(/__CODE_SPAN_PROTECTED_(\d+)__/g, (_, idx) => {
    return codeBlocks[parseInt(idx, 10)] || '';
  });

  return result;
}

/**
 * Generates an AI-style concise topic title (max 40-50 chars) from a user prompt.
 * Converts conversational prompts into clean topic titles instead of using raw prompt text.
 */
export function generateTopicTitle(promptText: string): string {
  if (!promptText || !promptText.trim()) return 'Discussion Topic';

  const text = promptText.trim();

  // If prompt explicitly starts with TITLE: <title>, extract it
  const titleMatch = text.match(/^TITLE:\s*(.+)$/im);
  if (titleMatch) {
    return formatItemTitle(titleMatch[1].trim(), 45);
  }

  // Strip conversational prefix noise
  let cleaned = text.replace(/^(can (we|you)|how (do|to|can)|please|tell me|explain|what is|let's|i want to|could you|help me with|could we|why does|how does)\s+/i, '');
  cleaned = cleaned.replace(/\?+$/, '').replace(/^(the|a|an)\s+/i, '').trim();

  if (!cleaned || cleaned.length <= 3) {
    cleaned = text;
  }

  // Capitalize first character
  const formatted = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return formatItemTitle(formatted, 45);
}

/**
 * Strips code blocks (```...```) and inline code (`...`) from raw markdown/text
 * so tags inside code fences are completely ignored during parsing.
 */
export function stripCodeSpans(text: string): { cleanText: string; codeRanges: Array<[number, number]> } {
  const codeRanges: Array<[number, number]> = [];
  let cleanText = text;

  // 1. Multi-line code blocks ``` ... ```
  const blockRegex = /```[\s\S]*?```/g;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(text)) !== null) {
    codeRanges.push([match.index, match.index + match[0].length]);
  }

  // Replace code block interiors with spaces to preserve string indices
  cleanText = cleanText.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length));

  // 2. Inline code spans ` ... `
  const inlineRegex = /`[^`\n]+`/g;
  while ((match = inlineRegex.exec(cleanText)) !== null) {
    codeRanges.push([match.index, match.index + match[0].length]);
  }
  cleanText = cleanText.replace(/`[^`\n]+`/g, (m) => ' '.repeat(m.length));

  return { cleanText, codeRanges };
}

/**
 * Parse inline markup tags: [@EntityName], [@todo: task text], [@decision: decision text], [@note: note text]
 */
export function parseScribeMarkup(
  rawContent: string,
  existingEntities: Page[] = []
): ParsedItem[] {
  const items: ParsedItem[] = [];
  const { cleanText } = stripCodeSpans(rawContent);

  const isOverlapping = (start: number, end: number) => {
    return items.some(
      (item) => item.spanStart !== undefined && item.spanEnd !== undefined && start < item.spanEnd && end > item.spanStart
    );
  };

  // 1. Todos: [@todo: task text] or legacy @todo: task text
  const todoRegex = /\[@todo:\s*([^\]]+)\]|@todo:\s*([^@\n\r]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = todoRegex.exec(cleanText)) !== null) {
    const fullText = (match[1] || match[2] || '').trim();
    const start = match.index;
    const end = match.index + match[0].length;
    if (fullText && !isOverlapping(start, end)) {
      items.push({
        type: 'todo',
        rawText: match[0],
        nameOrTitle: formatItemTitle(fullText),
        fullText,
        spanStart: start,
        spanEnd: end,
      });
    }
  }

  // 2. Decisions: [@decision: decision text] or legacy @decision: decision text
  const decisionRegex = /\[@decision:\s*([^\]]+)\]|@decision:\s*([^@\n\r]+)/gi;
  while ((match = decisionRegex.exec(cleanText)) !== null) {
    const fullText = (match[1] || match[2] || '').trim();
    const start = match.index;
    const end = match.index + match[0].length;
    if (fullText && !isOverlapping(start, end)) {
      items.push({
        type: 'decision',
        rawText: match[0],
        nameOrTitle: formatItemTitle(fullText),
        fullText,
        spanStart: start,
        spanEnd: end,
      });
    }
  }

  // 3. Notes: [@note: note text] or legacy @note: note text
  const noteRegex = /\[@note:\s*([^\]]+)\]|@note:\s*([^@\n\r]+)/gi;
  while ((match = noteRegex.exec(cleanText)) !== null) {
    const fullText = (match[1] || match[2] || '').trim();
    const start = match.index;
    const end = match.index + match[0].length;
    if (fullText && !isOverlapping(start, end)) {
      items.push({
        type: 'note',
        rawText: match[0],
        nameOrTitle: formatItemTitle(fullText),
        fullText,
        spanStart: start,
        spanEnd: end,
      });
    }
  }

  // 4. Messages: [@message: message text] or legacy @message: message text
  const messageRegex = /\[@message:\s*([^\]]+)\]|@message:\s*([^@\n\r]+)/gi;
  while ((match = messageRegex.exec(cleanText)) !== null) {
    const fullText = (match[1] || match[2] || '').trim();
    const start = match.index;
    const end = match.index + match[0].length;
    if (fullText && !isOverlapping(start, end)) {
      items.push({
        type: 'message' as any,
        rawText: match[0],
        nameOrTitle: formatItemTitle(fullText),
        fullText,
        spanStart: start,
        spanEnd: end,
      });
    }
  }

  // 5. Entities: [@EntityName] or legacy @EntityName / @[EntityName]
  const entityRegex = /\[@(?!(?:todo|decision|note|message):)([^\]]+)\]|@(?:\[([^\]]+)\]|(?!todo:|decision:|note:|message:|\s)([a-zA-Z0-9_\-\.]+))/gi;
  while ((match = entityRegex.exec(cleanText)) !== null) {
    const rawName = (match[1] || match[2] || match[3] || '').trim();
    const start = match.index;
    const end = match.index + match[0].length;
    if (rawName && !rawName.startsWith('todo:') && !rawName.startsWith('decision:') && !rawName.startsWith('note:') && !rawName.startsWith('message:') && !isOverlapping(start, end)) {
      const existing = existingEntities.find(
        (e) => e.title.toLowerCase() === rawName.toLowerCase()
      );
      const canonicalName = existing ? existing.title : rawName;

      items.push({
        type: 'entity',
        rawText: match[0],
        nameOrTitle: canonicalName,
        fullText: rawName,
        spanStart: start,
        spanEnd: end,
      });
    }
  }

  return items;
}

/**
 * Converts raw markdown string containing Scribe tags into HTML or ProseMirror JSON AST
 */
export function convertScribeTextToHtml(
  rawText: string,
  source: MentionSource = 'auto',
  pages?: Page[]
): string {
  if (!rawText) return '';
  let html = rawText;

  const isPageExists = (type: 'todo' | 'decision' | 'note' | 'message' | 'entity', cleanName: string): boolean => {
    if (!pages || pages.length === 0) return true;
    const clean = cleanName.replace(/^(todo:|decision:|note:|message:|\s*)+/i, '').trim().toLowerCase();
    if (!clean) return true;

    return pages.some((p) => {
      const pShortId = p.short_id?.trim().toLowerCase();
      if (pShortId === clean) return true;
      if (p.type !== type) return false;
      const pTitle = p.title.trim().toLowerCase();
      return pTitle === clean || pTitle.startsWith(clean) || clean.startsWith(pTitle);
    });
  };

  // Escape HTML entities first to prevent XSS
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 1. Preserve Code Blocks ``` ... ```
  const codeBlocks: string[] = [];
  html = html.replace(/```([a-zA-Z0-9_\-\+]*)\s*\n?([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `%%%CODEBLOCK${codeBlocks.length}%%%`;
    const escapedCode = code.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const langAttr = lang ? ` data-lang="${lang}"` : '';
    codeBlocks.push(
      `<pre class="bg-zinc-900 text-zinc-100 p-3 rounded-xl text-xs font-mono my-2.5 overflow-x-auto shadow-2xs"${langAttr}><code>${escapedCode}</code></pre>`
    );
    return placeholder;
  });

  // 2. Preserve Inline Code ` ... `
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `%%%INLINECODE${inlineCodes.length}%%%`;
    const escapedCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    inlineCodes.push(
      `<code class="bg-zinc-100 border border-zinc-200/80 px-1.5 py-0.5 rounded text-[11px] font-mono text-zinc-900">${escapedCode}</code>`
    );
    return placeholder;
  });

  // 3. Preserve KaTeX Math Blocks ($$ ... $$ or \[ ... \]) & Inline Math ($ ... $ or \( ... \))
  const mathBlocks: string[] = [];
  html = html.replace(/\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g, (match, math1, math2) => {
    const text = (math1 || math2 || '').trim();
    if (!text) return match;
    try {
      const rendered = katex.renderToString(text, { displayMode: true, throwOnError: false });
      const placeholder = `%%%KATEXMATH${mathBlocks.length}%%%`;
      mathBlocks.push(
        `<div class="my-3 overflow-x-auto text-center font-sans katex-display-container" data-latex="${encodeURIComponent(text)}" data-math-mode="display">${rendered}</div>`
      );
      return placeholder;
    } catch (e) {
      return match;
    }
  });

  html = html.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)|\\\(([^\n]+?)\\\)/g, (match, math1, math2) => {
    const text = (math1 || math2 || '').trim();
    if (!text) return match;
    try {
      const rendered = katex.renderToString(text, { displayMode: false, throwOnError: false });
      const placeholder = `%%%KATEXMATH${mathBlocks.length}%%%`;
      mathBlocks.push(
        `<span class="inline-math font-sans katex-inline-container" data-latex="${encodeURIComponent(text)}" data-math-mode="inline">${rendered}</span>`
      );
      return placeholder;
    } catch (e) {
      return match;
    }
  });

  // 4. Preserve Generated Reference Pills into placeholders to prevent nesting
  const pills: string[] = [];
  const storePill = (pillHtml: string): string => {
    const placeholder = `%%%SCRIBEPILL${pills.length}%%%`;
    pills.push(pillHtml);
    return placeholder;
  };

  const sourceAttr = source === 'manual' ? 'data-source="manual"' : 'data-source="auto"';

  // [@todo: text] -> Truncates to 2 words by default, untruncates on hover
  html = html.replace(/\[@todo:\s*([^\]]+)\]|@todo:\s*([^@\n\r<]+)/gi, (match, todoBracketed, todoUnbracketed) => {
    const fullClean = (todoBracketed || todoUnbracketed || '').trim();
    if (!fullClean) return match;
    const shortTitle = truncateTitleWords(fullClean, 2);
    if (pages && !isPageExists('todo', fullClean)) {
      return match;
    }
    const colorHex = getPastelColorForTitle(fullClean, 'todo');
    const bodyContent = `<span class="pill-short">@${shortTitle}</span><span class="pill-full">@${fullClean}</span>`;

    return storePill(`<span class="page-mention-pill inline-scribe-todo cursor-pointer" style="background-color: ${colorHex}; color: #0f172a;" data-type="todo" data-title="${shortTitle}" data-full="${fullClean}" ${sourceAttr} title="Todo - ${fullClean}">${bodyContent}</span>`);
  });

  // [@decision: text] -> Truncates to 2 words by default, untruncates on hover
  html = html.replace(/\[@decision:\s*([^\]]+)\]|@decision:\s*([^@\n\r<]+)/gi, (match, decBracketed, decUnbracketed) => {
    const fullClean = (decBracketed || decUnbracketed || '').trim();
    if (!fullClean) return match;
    const shortTitle = truncateTitleWords(fullClean, 2);
    if (pages && !isPageExists('decision', fullClean)) {
      return match;
    }
    const colorHex = getPastelColorForTitle(fullClean, 'decision');
    const bodyContent = `<span class="pill-short">@${shortTitle}</span><span class="pill-full">@${fullClean}</span>`;

    return storePill(`<span class="page-mention-pill inline-scribe-decision cursor-pointer" style="background-color: ${colorHex}; color: #0f172a;" data-type="decision" data-title="${shortTitle}" data-full="${fullClean}" ${sourceAttr} title="Decision - ${fullClean}">${bodyContent}</span>`);
  });

  // [@note: text] -> Truncates to 2 words by default, untruncates on hover
  html = html.replace(/\[@note:\s*([^\]]+)\]|@note:\s*([^@\n\r<]+)/gi, (match, noteBracketed, noteUnbracketed) => {
    const fullClean = (noteBracketed || noteUnbracketed || '').trim();
    if (!fullClean) return match;
    const shortTitle = truncateTitleWords(fullClean, 2);
    if (pages && !isPageExists('note', fullClean)) {
      return match;
    }
    const colorHex = getPastelColorForTitle(fullClean, 'note');
    const bodyContent = `<span class="pill-short">@${shortTitle}</span><span class="pill-full">@${fullClean}</span>`;

    return storePill(`<span class="page-mention-pill inline-scribe-note cursor-pointer" style="background-color: ${colorHex}; color: #0f172a;" data-type="note" data-title="${shortTitle}" data-full="${fullClean}" ${sourceAttr} title="Note - ${fullClean}">${bodyContent}</span>`);
  });

  // [@message: text] -> Truncates to 2 words by default, untruncates on hover
  html = html.replace(/\[@message:\s*([^\]]+)\]|@message:\s*([^@\n\r<]+)/gi, (match, msgBracketed, msgUnbracketed) => {
    const fullClean = (msgBracketed || msgUnbracketed || '').trim();
    if (!fullClean) return match;
    const shortTitle = truncateTitleWords(fullClean, 2);
    if (pages && !isPageExists('message', fullClean)) {
      return match;
    }
    const colorHex = getPastelColorForTitle(fullClean, 'message');
    const bodyContent = `<span class="pill-short">@${shortTitle}</span><span class="pill-full">@${fullClean}</span>`;

    return storePill(`<span class="page-mention-pill inline-scribe-message cursor-pointer" style="background-color: ${colorHex}; color: #0f172a;" data-type="message" data-title="${shortTitle}" data-full="${fullClean}" ${sourceAttr} title="Message - ${fullClean}">${bodyContent}</span>`);
  });

  // Pre-pass: auto-wrap unbracketed mentions of multi-word entity titles from pages
  if (pages && pages.length > 0) {
    const entityPages = pages.filter((p) => p.type === 'entity').sort((a, b) => b.title.length - a.title.length);
    for (const ep of entityPages) {
      if (ep.title.includes(' ')) {
        const escaped = ep.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const unbracketedRegex = new RegExp(`(?<!\\[)@${escaped}(?!\\])`, 'gi');
        html = html.replace(unbracketedRegex, `[@${ep.title}]`);
      }
    }
  }

  // [@EntityName] -> Truncates to 2 words by default, untruncates on hover
  html = html.replace(/\[@(?!(?:todo|decision|note|message):)([^\]]+)\]|@(?:\[([^\]]+)\]|(?!todo:|decision:|note:|message:|\s)([a-zA-Z0-9_\-\.]+))/gi, (match, bracket1, bracket2, unbracketed) => {
    let entityName = (bracket1 || bracket2 || unbracketed || '').trim();
    if (!entityName) return match;

    const clean = entityName.replace(/^@/, '').trim().toLowerCase();
    const existingByShortId = pages?.find((p) => p.short_id?.toLowerCase() === clean);
    const existingEntity = existingByShortId || pages?.find(
      (p) => p.type === 'entity' && (p.title.toLowerCase() === clean || p.title.toLowerCase().startsWith(clean) || clean.startsWith(p.title.toLowerCase()))
    );

    const fullEntityName = existingEntity ? existingEntity.title : entityName;
    const shortTitle = truncateTitleWords(fullEntityName, 2);

    if (pages && !isPageExists('entity', entityName)) {
      return match;
    }
    const targetType = existingEntity?.type || 'entity';
    const colorHex = getPastelColorForTitle(fullEntityName, targetType);
    const bodyContent = `<span class="pill-short">@${shortTitle}</span><span class="pill-full">@${fullEntityName}</span>`;
    const shortIdAttr = existingEntity?.short_id ? `data-short-id="${existingEntity.short_id}"` : '';

    return storePill(`<span class="page-mention-pill inline-scribe-${targetType} cursor-pointer" style="background-color: ${colorHex}; color: #0f172a;" data-type="${targetType}" ${shortIdAttr} data-entity="${fullEntityName}" data-full="${fullEntityName}" ${sourceAttr} title="${targetType} - ${fullEntityName}">${bodyContent}</span>`);
  });

  // 5. Open-Source Markdown Parsing via `marked`
  let parsedHtml = marked.parse(html) as string;

  // 6. Restore Placeholders (KaTeX Math, Code Blocks, Inline Code, Reference Pills)
  mathBlocks.forEach((mathHtml, i) => {
    parsedHtml = parsedHtml.replaceAll(`%%%KATEXMATH${i}%%%`, mathHtml);
  });
  pills.forEach((pillHtml, i) => {
    parsedHtml = parsedHtml.replaceAll(`%%%SCRIBEPILL${i}%%%`, pillHtml);
  });
  inlineCodes.forEach((codeHtml, i) => {
    parsedHtml = parsedHtml.replaceAll(`%%%INLINECODE${i}%%%`, codeHtml);
  });
  codeBlocks.forEach((blockHtml, i) => {
    parsedHtml = parsedHtml.replaceAll(`%%%CODEBLOCK${i}%%%`, blockHtml);
  });

  // 7. Decorate each top-level Markdown block with its own gutter button handle
  let blockIndex = 0;
  const blockTagsRegex = /<(p|h1|h2|h3|h4|h5|h6|ul|ol|blockquote|pre|table)(?:\s[^>]*)?>[\s\S]*?<\/\1>/gi;

  parsedHtml = parsedHtml.replace(blockTagsRegex, (blockContent) => {
    const currentIdx = blockIndex++;
    const checkboxHtml = `<div class="scribe-gutter-handle" title="Select markdown block" onmousedown="event.preventDefault()" data-block-index="${currentIdx}"><button type="button" class="scribe-gutter-btn" title="Select markdown block" onmousedown="event.preventDefault()" data-block-id="block-${currentIdx}"><svg class="w-4.5 h-4.5 square-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg><svg class="w-4.5 h-4.5 check-square-icon hidden fill-indigo-50 text-indigo-600" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/></svg></button></div>`;
    return `<div class="scribe-markdown-block" data-block-index="${currentIdx}">${checkboxHtml}${blockContent}</div>`;
  });

  return `<div class="prose-scribe">${parsedHtml}</div>`;
}

/**
 * Selects the entire content of a markdown block in the browser (highlighting text in blue)
 */
export function selectMarkdownBlock(blockEl: HTMLElement | null | undefined): void {
  if (!blockEl || typeof window === 'undefined') return;
  blockEl.classList.add('is-block-selected');
  blockEl.querySelector('.scribe-gutter-btn')?.classList.add('is-checked');
  blockEl.querySelector('.scribe-gutter-handle')?.classList.add('is-checked');
  window.getSelection()?.removeAllRanges();
}

/**
 * Clears any active browser text selection
 */
export function clearMarkdownBlockSelection(): void {
  if (typeof window === 'undefined') return;
  window.getSelection()?.removeAllRanges();
}

/**
 * Synchronizes browser text selection across all currently checked markdown blocks
 */
export function syncMultiBlockSelection(scopeContainer?: HTMLElement | null): void {
  if (typeof window === 'undefined') return;

  if (scopeContainer) {
    document
      .querySelectorAll<HTMLElement>(
        '.scribe-markdown-block.is-block-selected, .scribe-gutter-btn.is-checked, .scribe-gutter-handle.is-checked'
      )
      .forEach((el) => {
        if (!scopeContainer.contains(el)) {
          el.classList.remove('is-block-selected', 'is-checked');
        }
      });
  }

  // Clear native browser text selection range so it doesn't create a competing second blue layer
  window.getSelection()?.removeAllRanges();
}

/**
 * Handles gutter checkbox click and contiguous range selection
 * - Shift + Click selects contiguous range [anchor ... clicked]
 * - Regular Click on contiguous (adjacent) gutter expands selection to keep both
 * - Regular Click on non-contiguous gutter switches selection to the clicked gutter
 * - Regular Click on an already-selected single gutter deselects it
 */
export function handleGutterRangeClick(
  targetEl: HTMLElement,
  scopeContainer: HTMLElement,
  shiftKey: boolean = false
): boolean {
  const gutterHandle = targetEl.closest('.scribe-gutter-handle') as HTMLElement;
  const gutterBtn = (targetEl.closest('.scribe-gutter-btn') || gutterHandle?.querySelector('.scribe-gutter-btn')) as HTMLElement;

  if (!gutterBtn && !gutterHandle) {
    return false;
  }

  const activeBtn = gutterBtn || (gutterHandle?.querySelector('.scribe-gutter-btn') as HTMLElement);
  const activeHandle = gutterHandle || (activeBtn?.closest('.scribe-gutter-handle') as HTMLElement);
  const clickedBlock = (activeBtn?.closest('.scribe-markdown-block') || activeHandle?.closest('.scribe-markdown-block')) as HTMLElement;

  if (!clickedBlock) return false;

  // Find all markdown blocks within this container
  const allBlocks = Array.from(scopeContainer.querySelectorAll<HTMLElement>('.scribe-markdown-block'));
  if (allBlocks.length === 0) return false;

  const clickedIdx = allBlocks.indexOf(clickedBlock);
  if (clickedIdx === -1) return false;

  // Clear selections in other containers
  document
    .querySelectorAll<HTMLElement>(
      '.scribe-markdown-block.is-block-selected, .scribe-gutter-btn.is-checked, .scribe-gutter-handle.is-checked'
    )
    .forEach((el) => {
      if (!scopeContainer.contains(el)) {
        el.classList.remove('is-block-selected', 'is-checked');
      }
    });

  const currentlySelectedIndices = allBlocks
    .map((b, i) => (b.classList.contains('is-block-selected') ? i : -1))
    .filter((i) => i !== -1);

  const anchorAttr = scopeContainer.getAttribute('data-gutter-anchor');
  let anchorIdx = anchorAttr !== null ? parseInt(anchorAttr, 10) : -1;
  if (isNaN(anchorIdx) || !allBlocks[anchorIdx]) {
    anchorIdx = currentlySelectedIndices.length > 0 ? currentlySelectedIndices[0] : clickedIdx;
  }

  let startIdx: number;
  let endIdx: number;

  if (currentlySelectedIndices.length === 0) {
    // 1. Nothing was selected: select the clicked block
    anchorIdx = clickedIdx;
    scopeContainer.setAttribute('data-gutter-anchor', String(anchorIdx));
    startIdx = clickedIdx;
    endIdx = clickedIdx;
  } else if (shiftKey) {
    // 2. Shift + Click: select contiguous range from anchorIdx to clickedIdx
    startIdx = Math.min(anchorIdx, clickedIdx);
    endIdx = Math.max(anchorIdx, clickedIdx);
  } else {
    // 3. Regular Click (without Shift)
    const minIdx = currentlySelectedIndices[0];
    const maxIdx = currentlySelectedIndices[currentlySelectedIndices.length - 1];

    if (currentlySelectedIndices.length === 1 && currentlySelectedIndices[0] === clickedIdx) {
      // Clicking the only selected block deselects it
      allBlocks.forEach((b) => {
        b.classList.remove('is-block-selected');
        b.querySelector('.scribe-gutter-btn')?.classList.remove('is-checked');
        b.querySelector('.scribe-gutter-handle')?.classList.remove('is-checked');
      });
      scopeContainer.removeAttribute('data-gutter-anchor');
      clearMarkdownBlockSelection();
      return true;
    }

    const isContiguousAdjacent = clickedIdx === maxIdx + 1 || clickedIdx === minIdx - 1;

    if (isContiguousAdjacent) {
      // Contiguous gutter clicked: keep them both/all selected
      startIdx = Math.min(minIdx, clickedIdx);
      endIdx = Math.max(maxIdx, clickedIdx);
    } else if (clickedIdx >= minIdx && clickedIdx <= maxIdx) {
      // Clicked inside existing range: toggle edge off or collapse
      if (clickedIdx === maxIdx) {
        startIdx = minIdx;
        endIdx = maxIdx - 1;
      } else if (clickedIdx === minIdx) {
        startIdx = minIdx + 1;
        endIdx = maxIdx;
      } else {
        // Clicked in middle: switch selection to this block
        anchorIdx = clickedIdx;
        scopeContainer.setAttribute('data-gutter-anchor', String(anchorIdx));
        startIdx = clickedIdx;
        endIdx = clickedIdx;
      }
    } else {
      // Non-contiguous gutter clicked: switch selection to the non-contiguous one
      anchorIdx = clickedIdx;
      scopeContainer.setAttribute('data-gutter-anchor', String(anchorIdx));
      startIdx = clickedIdx;
      endIdx = clickedIdx;
    }
  }

  // Apply selection to contiguous range [startIdx...endIdx]
  allBlocks.forEach((b, i) => {
    const isSelected = i >= startIdx && i <= endIdx;
    if (isSelected) {
      b.classList.add('is-block-selected');
      b.querySelector('.scribe-gutter-btn')?.classList.add('is-checked');
      b.querySelector('.scribe-gutter-handle')?.classList.add('is-checked');
    } else {
      b.classList.remove('is-block-selected');
      b.querySelector('.scribe-gutter-btn')?.classList.remove('is-checked');
      b.querySelector('.scribe-gutter-handle')?.classList.remove('is-checked');
    }
  });

  // Synchronize browser text selection across range
  syncMultiBlockSelection(scopeContainer);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gutter-selection-change'));
  }
  return true;
}

/**
 * Handles mousedown on gutter handle to prevent focus/caret clearing
 */
export function handleGutterMouseDown(e: React.MouseEvent, _scopeContainer?: HTMLElement): void {
  const targetEl = e.target as HTMLElement;
  const gutterHandle = targetEl.closest('.scribe-gutter-handle') as HTMLElement;
  const gutterBtn = (targetEl.closest('.scribe-gutter-btn') || gutterHandle?.querySelector('.scribe-gutter-btn')) as HTMLElement;

  if (gutterBtn || gutterHandle) {
    e.preventDefault();
  }
}

/**
 * Deselects all currently selected gutter blocks and clears browser text selection
 */
export function clearAllGutterSelections(): boolean {
  if (typeof window === 'undefined') return false;
  const selected = document.querySelectorAll<HTMLElement>(
    '.scribe-markdown-block.is-block-selected, .scribe-gutter-btn.is-checked, .scribe-gutter-handle.is-checked'
  );
  if (selected.length === 0) return false;

  selected.forEach((el) => {
    el.classList.remove('is-block-selected', 'is-checked');
  });

  document.querySelectorAll<HTMLElement>('[data-gutter-anchor]').forEach((el) => {
    el.removeAttribute('data-gutter-anchor');
  });

  clearMarkdownBlockSelection();
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('gutter-selection-change'));
  }
  return true;
}

/**
 * Serializes any DOM node or DocumentFragment back into canonical Markdown format,
 * preserving headings, bold, italic, strikethrough, lists, code blocks, blockquotes,
 * tables, links, LaTeX math, and reference pills ([@Entity], [@todo: Task], etc.).
 */
export function domToMarkdown(node: Node | null | undefined): string {
  if (!node) return '';

  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    return Array.from(node.childNodes)
      .map(domToMarkdown)
      .join('');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // 1. Ignore gutter handles and buttons completely
  if (
    el.classList?.contains('scribe-gutter-handle') ||
    el.classList?.contains('scribe-gutter-btn') ||
    el.classList?.contains('square-icon') ||
    el.classList?.contains('check-square-icon')
  ) {
    return '';
  }

  // 2. Page Mention Pills: [@EntityName], [@todo: Task], [@decision: Dec], [@note: Note], [@m1]
  if (el.classList?.contains('page-mention-pill')) {
    const type = el.getAttribute('data-type') || 'entity';
    const full = el.getAttribute('data-full') || el.getAttribute('data-title') || el.getAttribute('data-entity') || '';
    const shortId = el.getAttribute('data-short-id') || '';

    if (type === 'todo') {
      return `[@todo: ${full}]`;
    }
    if (type === 'decision') {
      return `[@decision: ${full}]`;
    }
    if (type === 'note') {
      return `[@note: ${full}]`;
    }
    if (type === 'message') {
      return shortId ? `[@${shortId}]` : `[@message: ${full}]`;
    }
    if (shortId && !full) {
      return `[@${shortId}]`;
    }
    return `[@${full}]`;
  }

  // 3. KaTeX Math Blocks & Inline Math
  if (el.hasAttribute('data-latex')) {
    const latex = decodeURIComponent(el.getAttribute('data-latex') || '');
    const mode = el.getAttribute('data-math-mode');
    if (mode === 'display') {
      return `\n\n$$${latex}$$\n\n`;
    }
    return `$${latex}$`;
  }
  if (el.classList?.contains('katex')) {
    const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
    const tex = annotation?.textContent?.trim() || '';
    if (tex) {
      if (el.closest('.katex-display-container') || el.parentElement?.classList?.contains('katex-display-container')) {
        return `\n\n$$${tex}$$\n\n`;
      }
      return `$${tex}$`;
    }
  }

  // 4. Code Blocks (<pre>)
  if (tag === 'pre') {
    const codeEl = el.querySelector('code');
    const codeText = codeEl ? codeEl.textContent : el.textContent;
    const lang = el.getAttribute('data-lang') || codeEl?.getAttribute('data-lang') || '';
    return `\n\n\`\`\`${lang}\n${codeText || ''}\n\`\`\`\n\n`;
  }

  // Recursively process child nodes
  const childMd = Array.from(el.childNodes)
    .map(domToMarkdown)
    .join('');

  // 5. Headings (h1 - h6)
  if (/^h[1-6]$/.test(tag)) {
    const level = parseInt(tag[1], 10);
    const hashes = '#'.repeat(level);
    return `\n\n${hashes} ${childMd.trim()}\n\n`;
  }

  // 6. Paragraphs
  if (tag === 'p') {
    return `\n\n${childMd.trim()}\n\n`;
  }

  // 7. Blockquote
  if (tag === 'blockquote') {
    const lines = childMd.trim().split('\n');
    const quoted = lines.map((l) => `> ${l}`).join('\n');
    return `\n\n${quoted}\n\n`;
  }

  // 8. Inline Code (<code> outside <pre>)
  if (tag === 'code') {
    return `\`${childMd}\``;
  }

  // 9. Bold
  if (tag === 'strong' || tag === 'b') {
    return `**${childMd}**`;
  }

  // 10. Italic
  if (tag === 'em' || tag === 'i') {
    return `*${childMd}*`;
  }

  // 11. Strikethrough
  if (tag === 'del' || tag === 's') {
    return `~~${childMd}~~`;
  }

  // 12. Lists: ul and ol
  if (tag === 'ul' || tag === 'ol') {
    const isOrdered = tag === 'ol';
    const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === 'li');
    const listMd = items
      .map((li, idx) => {
        const checkbox = li.querySelector('input[type="checkbox"]');
        let checkPrefix = '';
        if (checkbox) {
          checkPrefix = (checkbox as HTMLInputElement).checked ? '[x] ' : '[ ] ';
        }
        const liContentNodes = Array.from(li.childNodes).filter((n) => {
          return !(n instanceof HTMLElement && n.tagName.toLowerCase() === 'input' && n.getAttribute('type') === 'checkbox');
        });
        const liText = liContentNodes.map(domToMarkdown).join('').trim();
        const prefix = isOrdered ? `${idx + 1}. ` : '- ';
        return `${prefix}${checkPrefix}${liText}`;
      })
      .join('\n');
    return `\n\n${listMd}\n\n`;
  }

  // 13. List Item (when serialized standalone)
  if (tag === 'li') {
    const checkbox = el.querySelector('input[type="checkbox"]');
    let checkPrefix = '';
    if (checkbox) {
      checkPrefix = (checkbox as HTMLInputElement).checked ? '[x] ' : '[ ] ';
    }
    const liContentNodes = Array.from(el.childNodes).filter((n) => {
      return !(n instanceof HTMLElement && n.tagName.toLowerCase() === 'input' && n.getAttribute('type') === 'checkbox');
    });
    return `- ${checkPrefix}${liContentNodes.map(domToMarkdown).join('').trim()}\n`;
  }

  // 14. Links
  if (tag === 'a') {
    const href = el.getAttribute('href');
    if (href && href !== '#' && !href.startsWith('javascript:')) {
      return `[${childMd}](${href})`;
    }
    return childMd;
  }

  // 15. Horizontal Rule
  if (tag === 'hr') {
    return '\n\n---\n\n';
  }

  // 16. Tables
  if (tag === 'table') {
    const rows = Array.from(el.querySelectorAll('tr'));
    if (rows.length > 0) {
      const tableLines: string[] = [];
      let isFirstRow = true;
      rows.forEach((row) => {
        const cells = Array.from(row.querySelectorAll('th, td'));
        const rowText = `| ${cells.map((c) => Array.from(c.childNodes).map(domToMarkdown).join('').trim()).join(' | ')} |`;
        tableLines.push(rowText);
        if (isFirstRow && row.querySelector('th')) {
          const separator = `| ${cells.map(() => '---').join(' | ')} |`;
          tableLines.push(separator);
        }
        isFirstRow = false;
      });
      return `\n\n${tableLines.join('\n')}\n\n`;
    }
  }

  // 17. Line break
  if (tag === 'br') {
    return '\n';
  }

  // 18. Blocks (.scribe-markdown-block)
  if (el.classList?.contains('scribe-markdown-block')) {
    return `\n\n${childMd.trim()}\n\n`;
  }

  return childMd;
}

export function cleanMarkdownSpacing(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function htmlToMarkdown(html: string): string {
  if (typeof window === 'undefined' || !html) return '';
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    return cleanMarkdownSpacing(domToMarkdown(doc.body));
  } catch (e) {
    return '';
  }
}

// Detect and apply the browser's native text selection highlight color
export function detectBrowserSelectionColor(): string {
  if (typeof window === 'undefined') return '#b4d5fe';
  try {
    const probe = document.createElement('div');
    probe.style.position = 'fixed';
    probe.style.pointerEvents = 'none';
    probe.style.opacity = '0';
    probe.style.zIndex = '-99999';
    probe.style.backgroundColor = 'Highlight';
    document.body.appendChild(probe);

    const computed = window.getComputedStyle(probe);
    const bg = computed.backgroundColor;
    document.body.removeChild(probe);

    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
      return bg;
    }
  } catch (e) {
    // fallback
  }

  const ua = navigator.userAgent.toLowerCase();
  const isMac = navigator.platform?.toLowerCase().includes('mac') || ua.includes('macintosh');
  return isMac ? '#b4d5fe' : '#cce8ff';
}

if (typeof window !== 'undefined') {
  try {
    const nativeSelectionBg = detectBrowserSelectionColor();
    if (nativeSelectionBg) {
      document.documentElement.style.setProperty('--browser-selection-bg', nativeSelectionBg);
    }
  } catch (e) {
    // ignore
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      clearAllGutterSelections();
    }
  });

  // Global listener: Clicking away once something is selected deselects both the gutters and gets rid of the blue selected text region
  window.addEventListener('pointerdown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('.scribe-gutter-handle, .scribe-gutter-btn, [data-floating-toolbar]')) {
      return;
    }
    clearAllGutterSelections();
  });

  // Helper to extract source page ID tag from DOM selection or element
  function findSourcePageTag(elements: (Node | HTMLElement | null | undefined)[]): string | null {
    for (const n of elements) {
      if (!n) continue;
      const el = n.nodeType === Node.ELEMENT_NODE ? (n as HTMLElement) : n.parentElement;
      if (!el) continue;
      const pageContainer = el.closest<HTMLElement>('[data-page-id], [data-message-id]');
      if (pageContainer) {
        const shortId = pageContainer.getAttribute('data-page-short-id') ||
          pageContainer.getAttribute('data-short-id');
        if (shortId) return `[@${shortId}]`;
        const pId = pageContainer.getAttribute('data-page-id') || pageContainer.getAttribute('data-message-id');
        if (pId) return `[@${pId}]`;
      }
    }
    return null;
  }

  function prependSourceTag(text: string, tag: string | null): string {
    if (!tag || !text.trim()) return text;
    const prefix = `From ${tag}:`;
    if (text.startsWith(prefix) || text.startsWith(`From ${tag}`)) return text;
    return `${prefix}\n${text}`;
  }

  // Global listener: Cmd+C / Ctrl+C copies markdown format of selected gutter blocks or highlighted prose selection
  // prepended with 'From [ID tag]' when copied from a page
  window.addEventListener('copy', (e) => {
    const activeEl = document.activeElement;

    // 1. If user is inside an input or textarea
    if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')) {
      if (activeEl.closest('#global-search, [data-global-search], aside, [data-sidebar]')) {
        return;
      }
      const sourceTag = findSourcePageTag([activeEl as HTMLElement]);
      if (sourceTag) {
        const inputEl = activeEl as HTMLInputElement | HTMLTextAreaElement;
        const start = inputEl.selectionStart || 0;
        const end = inputEl.selectionEnd || 0;
        let text = inputEl.value.slice(start, end).trim();
        if (text) {
          text = prependSourceTag(text, sourceTag);
          e.clipboardData?.setData('text/plain', text);
          e.clipboardData?.setData('text/markdown', text);
          e.preventDefault();
          return;
        }
      }
      return;
    }

    const selectedBlocks = Array.from(
      document.querySelectorAll<HTMLElement>('.scribe-markdown-block.is-block-selected')
    );

    // 2. If gutter blocks are selected: serialize them to Markdown and prepend source tag
    if (selectedBlocks.length > 0) {
      const textToCopy = selectedBlocks
        .map((b) => domToMarkdown(b))
        .join('\n\n');
      let cleanMd = cleanMarkdownSpacing(textToCopy);
      if (cleanMd) {
        const sourceTag = findSourcePageTag([selectedBlocks[0]]);
        cleanMd = prependSourceTag(cleanMd, sourceTag);
        e.clipboardData?.setData('text/plain', cleanMd);
        e.clipboardData?.setData('text/markdown', cleanMd);
        e.preventDefault();
        return;
      }
    }

    // 3. If user highlighted text in rendered prose content (Command+C)
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const commonNode = range.commonAncestorContainer;
      const parentEl =
        commonNode.nodeType === Node.ELEMENT_NODE
          ? (commonNode as HTMLElement)
          : commonNode.parentElement;

      if (parentEl && parentEl.closest('.prose-scribe, .scribe-markdown-block, [data-chat-thread], [data-page-id], [data-message-id]')) {
        const cloned = range.cloneContents();
        let cleanMd = cleanMarkdownSpacing(domToMarkdown(cloned));
        if (cleanMd) {
          const sourceTag = findSourcePageTag([
            parentEl,
            range.startContainer,
            range.endContainer,
          ]);
          cleanMd = prependSourceTag(cleanMd, sourceTag);
          e.clipboardData?.setData('text/plain', cleanMd);
          e.clipboardData?.setData('text/markdown', cleanMd);
          e.preventDefault();
          return;
        }
      }
    }
  });
}

/**
 * Resolves any clicked pill element (entity, todo, decision, or message) to its target Page
 */
export function findPageForPill(target: HTMLElement, pages: Page[]): Page | undefined {
  const dataType = target.getAttribute('data-type');
  const entityAttr = target.getAttribute('data-entity');
  const titleAttr = target.getAttribute('data-title');
  const fullAttr = target.getAttribute('data-full');
  const shortIdAttr = target.getAttribute('data-short-id');

  if (shortIdAttr) {
    const matchedByShortId = pages.find((p) => p.short_id?.toLowerCase() === shortIdAttr.toLowerCase());
    if (matchedByShortId) return matchedByShortId;
  }

  let pillType: 'entity' | 'todo' | 'decision' | 'note' | undefined;
  if (dataType === 'entity' || target.classList.contains('inline-scribe-entity') || entityAttr) {
    pillType = 'entity';
  } else if (dataType === 'todo' || target.classList.contains('inline-scribe-todo')) {
    pillType = 'todo';
  } else if (dataType === 'decision' || target.classList.contains('inline-scribe-decision')) {
    pillType = 'decision';
  } else if (dataType === 'note' || target.classList.contains('inline-scribe-note')) {
    pillType = 'note';
  }

  // Filter candidates by pillType if known
  const candidatePages = pillType ? pages.filter((p) => p.type === pillType) : pages;

  // Primary query text
  const primaryQuery = entityAttr || titleAttr || fullAttr || target.innerText || '';
  if (!primaryQuery) return undefined;

  const cleanQuery = primaryQuery
    .replace(/^@/, '')
    .replace(/^(todo:|decision:)\s*/i, '')
    .trim()
    .toLowerCase();

  if (!cleanQuery) return undefined;

  // 1. Direct ID or Short ID match
  let matched = pages.find((p) => p.id.toLowerCase() === cleanQuery || p.short_id?.toLowerCase() === cleanQuery);
  if (matched) return matched;

  // 2. Exact Title match
  matched = candidatePages.find((p) => p.title.toLowerCase() === cleanQuery);
  if (matched) return matched;

  // 3. Exact Title match against data-title attribute
  if (titleAttr) {
    const cleanTitle = titleAttr.replace(/^(todo:|decision:)\s*/i, '').trim().toLowerCase();
    matched = candidatePages.find((p) => p.title.toLowerCase() === cleanTitle);
    if (matched) return matched;
  }

  // 4. Exact Content or fullText match
  if (fullAttr) {
    const cleanFull = fullAttr.trim().toLowerCase();
    matched = candidatePages.find((p) => p.content.toLowerCase() === cleanFull || p.title.toLowerCase() === cleanFull);
    if (matched) return matched;
  }

  // 5. Prefix / Substring match (scoped ONLY to candidatePages of matching pillType!)
  matched = candidatePages.find(
    (p) =>
      p.title.toLowerCase().startsWith(cleanQuery) ||
      cleanQuery.startsWith(p.title.toLowerCase())
  );
  if (matched) return matched;

  // 6. Content includes cleanQuery (scoped ONLY to candidatePages of matching pillType!)
  matched = candidatePages.find((p) => p.content && p.content.toLowerCase().includes(cleanQuery));
  if (matched) return matched;

  // 7. Fallback across all pages
  if (pillType) {
    return pages.find((p) => p.title.toLowerCase() === cleanQuery || p.id.toLowerCase() === cleanQuery);
  }

  return undefined;
}

/**
 * Smoothly scrolls to the exact mention pill or element inside container, highlighting it with a temporary ring outline.
 */
export function scrollToMentionOrElement(
  container: HTMLElement,
  highlightSpan?: string
): HTMLElement | null {
  if (!container) return null;

  // Clean up any previously active mention highlight border boxes
  document.querySelectorAll('.mention-target-highlight').forEach((el) => {
    el.classList.remove('mention-target-highlight');
  });

  let targetEl: HTMLElement | null = null;

  if (highlightSpan && highlightSpan.trim()) {
    const query = highlightSpan.trim().toLowerCase();
    const rawClean = query
      .replace(/^\[/, '')
      .replace(/\]$/, '')
      .trim();
    const cleanQuery = rawClean
      .replace(/^@/, '')
      .replace(/^(todo:|decision:|note:|message:|\s*)+/i, '')
      .trim();

    // EXCLUDE any pills/tags located inside the Mentions / Backlinks section
    const pills = Array.from(
      container.querySelectorAll(
        '.page-mention-pill, [data-entity], [data-title], [data-full], [data-short-id], button[data-short-id]'
      )
    ).filter(
      (el) => !el.closest('.mentions-card-container, [data-mentions-feed], .mentions-panel-excerpt')
    ) as HTMLElement[];

    // 1. Search for exact or substring matching pill/tag attribute
    for (const pill of pills) {
      const full = (pill.getAttribute('data-full') || '').toLowerCase();
      const entity = (pill.getAttribute('data-entity') || '').toLowerCase();
      const title = (pill.getAttribute('data-title') || '').toLowerCase();
      const shortId = (pill.getAttribute('data-short-id') || '').toLowerCase();
      const text = (pill.textContent || '').trim().toLowerCase();

      if (
        (shortId && (shortId === cleanQuery || shortId === rawClean || cleanQuery === `@${shortId}`)) ||
        (full && (full === cleanQuery || full === rawClean || full.includes(cleanQuery) || cleanQuery.includes(full))) ||
        (entity && (entity === cleanQuery || entity === rawClean || entity.includes(cleanQuery))) ||
        (title && (title === cleanQuery || title === rawClean || title.includes(cleanQuery) || cleanQuery.includes(title))) ||
        (text && (text === cleanQuery || text === rawClean || text === `@${cleanQuery}` || text.includes(cleanQuery)))
      ) {
        targetEl = pill;
        break;
      }
    }

    // 2. Search for leaf element containing text if pill was not found
    if (!targetEl && cleanQuery) {
      const elements = Array.from(container.querySelectorAll('*')).filter(
        (el) => !el.closest('.mentions-card-container, [data-mentions-feed], .mentions-panel-excerpt')
      ) as HTMLElement[];
      for (const el of elements) {
        if (el.children.length === 0 && el.textContent) {
          const t = el.textContent.toLowerCase();
          if (t.includes(cleanQuery) || t.includes(rawClean)) {
            targetEl = (el.closest('.page-mention-pill, button[data-short-id]') as HTMLElement) || el;
            break;
          }
        }
      }
    }
  }

  const elToScroll = targetEl || container;

  try {
    elToScroll.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
  } catch (e) {
    // fallback if smooth inline scrolling unsupported
    elToScroll.scrollIntoView({ block: 'center' });
  }

  // Apply temporary blue border box around the tag (never in mentions area)
  if (targetEl && !targetEl.closest('.mentions-card-container, [data-mentions-feed], .mentions-panel-excerpt')) {
    targetEl.classList.add('mention-target-highlight');
    setTimeout(() => {
      targetEl?.classList.remove('mention-target-highlight');
    }, 2500);
  }

  return elToScroll;
}

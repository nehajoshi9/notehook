import { Page, MentionSource } from './types';
import { getPastelColorForTitle } from './color';

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
 * Formats item title without truncating raw text with ellipsis
 */
export function formatItemTitle(text: string, _maxLen?: number): string {
  const cleaned = text.replace(/^(todo:|decision:|note:|\s*)+/i, '').trim();
  if (!cleaned) return 'Untitled';
  return cleaned.replace(/…$/, '').trim();
}

/**
 * Formats canonical raw bracket tag syntax according to architecture rules:
 * - Entity: [@Entity Title]
 * - Todo: [@todo: Task Description]
 * - Decision: [@decision: Architectural Decision]
 * - Note: [@note: Note Title]
 * - Message: [@Message Title]
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

  // 5. Unbracketed @message: title -> [@title]
  result = result.replace(/(?<!\[)@message:\s*([^@\n\r[\]<]+)/gi, (_, title) => {
    return `[@${title.trim()}]`;
  });

  // 6. Unbracketed page titles matching existing pages (entities, messages, notes, etc.)
  if (pages && pages.length > 0) {
    const sortedPages = [...pages].sort((a, b) => b.title.length - a.title.length);
    for (const p of sortedPages) {
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
      if (p.type !== type) return false;
      const pTitle = p.title.trim().toLowerCase();
      return pTitle === clean || pTitle.startsWith(clean) || clean.startsWith(pTitle);
    });
  };

  // Escape HTML entities first to prevent XSS
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // 1. Preserve Code Blocks ``` ... ```
  const codeBlocks: string[] = [];
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    const placeholder = `%%%CODEBLOCK${codeBlocks.length}%%%`;
    codeBlocks.push(
      `<pre class="bg-zinc-900 text-zinc-100 p-3 rounded-xl text-xs font-mono my-2.5 overflow-x-auto shadow-2xs"><code>${code.trim()}</code></pre>`
    );
    return placeholder;
  });

  // 2. Preserve Inline Code ` ... `
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `%%%INLINECODE${inlineCodes.length}%%%`;
    inlineCodes.push(
      `<code class="bg-zinc-100 border border-zinc-200/80 px-1.5 py-0.5 rounded text-[11px] font-mono text-zinc-900">${code}</code>`
    );
    return placeholder;
  });

  // 3. Preserve Generated Reference Pills into placeholders to prevent nesting (pills inside pills / dead pills inside living pills)
  const pills: string[] = [];
  const storePill = (pillHtml: string): string => {
    const placeholder = `%%%SCRIBEPILL${pills.length}%%%`;
    pills.push(pillHtml);
    return placeholder;
  };

  const sourceAttr = source === 'manual' ? 'data-source="manual"' : 'data-source="auto"';

  // [dead@...] -> Render explicit dead reference pills
  html = html.replace(/\[dead@(?:(todo|decision|note|message):)?\s*([^\]]+)\]/gi, (match, pType, titleText) => {
    const cleanType = (pType || 'entity').toLowerCase();
    const fullClean = titleText.trim();
    if (!fullClean) return match;
    const shortTitle = truncateTitleWords(fullClean, 2);
    const bodyContent = `<span class="pill-short line-through">@${shortTitle}</span><span class="pill-full line-through">@${fullClean}</span>`;
    return storePill(
      `<span class="page-mention-pill deleted-mention-pill line-through cursor-not-allowed text-zinc-500" style="background-color: #e4e4e7; color: #71717a;" data-type="${cleanType}" data-deleted="true" ${sourceAttr} title="${cleanType} - Deleted ${cleanType}">${bodyContent}</span>`
    );
  });

  // [@todo: text] -> Truncates to 2 words by default, untruncates on hover
  html = html.replace(/\[@todo:\s*([^\]]+)\]|@todo:\s*([^@\n\r<]+)/gi, (match, todoBracketed, todoUnbracketed) => {
    const fullClean = (todoBracketed || todoUnbracketed || '').trim();
    if (!fullClean) return match;
    const shortTitle = truncateTitleWords(fullClean, 2);
    if (pages && !isPageExists('todo', fullClean)) {
      const bodyContent = `<span class="pill-short line-through">@${shortTitle}</span><span class="pill-full line-through">@${fullClean}</span>`;
      return storePill(`<span class="page-mention-pill deleted-mention-pill line-through cursor-not-allowed text-zinc-500" style="background-color: #e4e4e7; color: #71717a;" data-type="todo" data-deleted="true" ${sourceAttr} title="Todo - Deleted todo">${bodyContent}</span>`);
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
      const bodyContent = `<span class="pill-short line-through">@${shortTitle}</span><span class="pill-full line-through">@${fullClean}</span>`;
      return storePill(`<span class="page-mention-pill deleted-mention-pill line-through cursor-not-allowed text-zinc-500" style="background-color: #e4e4e7; color: #71717a;" data-type="decision" data-deleted="true" ${sourceAttr} title="Decision - Deleted decision">${bodyContent}</span>`);
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
      const bodyContent = `<span class="pill-short line-through">@${shortTitle}</span><span class="pill-full line-through">@${fullClean}</span>`;
      return storePill(`<span class="page-mention-pill deleted-mention-pill line-through cursor-not-allowed text-zinc-500" style="background-color: #e4e4e7; color: #71717a;" data-type="note" data-deleted="true" ${sourceAttr} title="Note - Deleted note">${bodyContent}</span>`);
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
      const bodyContent = `<span class="pill-short line-through">@${shortTitle}</span><span class="pill-full line-through">@${fullClean}</span>`;
      return storePill(`<span class="page-mention-pill deleted-mention-pill line-through cursor-not-allowed text-zinc-500" style="background-color: #e4e4e7; color: #71717a;" data-type="message" data-deleted="true" ${sourceAttr} title="Message - Deleted message">${bodyContent}</span>`);
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
    const existingEntity = pages?.find(
      (p) => p.type === 'entity' && (p.title.toLowerCase() === clean || p.title.toLowerCase().startsWith(clean) || clean.startsWith(p.title.toLowerCase()))
    );

    const fullEntityName = existingEntity ? existingEntity.title : entityName;
    const shortTitle = truncateTitleWords(fullEntityName, 2);

    if (pages && !isPageExists('entity', entityName)) {
      const bodyContent = `<span class="pill-short line-through">@${shortTitle}</span><span class="pill-full line-through">@${fullEntityName}</span>`;
      return storePill(`<span class="page-mention-pill deleted-mention-pill line-through cursor-not-allowed text-zinc-500" style="background-color: #e4e4e7; color: #71717a;" data-type="entity" data-deleted="true" ${sourceAttr} title="Entity - Deleted entity">${bodyContent}</span>`);
    }
    const colorHex = getPastelColorForTitle(fullEntityName, 'entity');
    const bodyContent = `<span class="pill-short">@${shortTitle}</span><span class="pill-full">@${fullEntityName}</span>`;

    return storePill(`<span class="page-mention-pill inline-scribe-entity cursor-pointer" style="background-color: ${colorHex}; color: #0f172a;" data-type="entity" data-entity="${fullEntityName}" data-full="${fullEntityName}" ${sourceAttr} title="Entity - ${fullEntityName}">${bodyContent}</span>`);
  });

  // 4. Canonical Markdown Syntax Parsing
  // Headings (# Header)
  html = html.replace(/^#### (.*$)/gim, '<h4 class="text-xs font-bold text-zinc-800 mt-2.5 mb-1">$1</h4>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-zinc-900 mt-3 mb-1.5">$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="text-base font-extrabold text-zinc-950 mt-4 mb-2 tracking-tight">$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1 class="text-lg font-black text-zinc-950 mt-4 mb-2 tracking-tight">$1</h1>');

  // Horizontal rules
  html = html.replace(/^(---|[*]{3})$/gim, '<hr class="border-t border-zinc-200 my-3" />');

  // Blockquotes (> quote)
  html = html.replace(/^> (.*$)/gim, '<blockquote class="border-l-3 border-indigo-400 pl-3 py-1 my-2 bg-indigo-50/40 text-zinc-700 italic rounded-r text-xs">$1</blockquote>');

  // Bold & Italics
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Strikethrough
  html = html.replace(/~~(.*?)~~/g, '<del class="line-through text-zinc-400">$1</del>');

  // Bullet list items (- item or * item)
  html = html.replace(/^[\s]*[-*+]\s+(.*$)/gim, '<li class="ml-4 list-disc my-0.5">$1</li>');

  // Numbered list items (1. item)
  html = html.replace(/^[\s]*\d+\.\s+(.*$)/gim, '<li class="ml-4 list-decimal my-0.5">$1</li>');

  // 5. Restore Reference Pills, Inline Code & Code Blocks
  pills.forEach((pillHtml, i) => {
    html = html.replace(`%%%SCRIBEPILL${i}%%%`, pillHtml);
  });
  inlineCodes.forEach((codeHtml, i) => {
    html = html.replace(`%%%INLINECODE${i}%%%`, codeHtml);
  });
  codeBlocks.forEach((blockHtml, i) => {
    html = html.replace(`%%%CODEBLOCK${i}%%%`, blockHtml);
  });

  // Paragraphs & Linebreaks
  html = html.replace(/\n\n/g, '</p><p class="my-1.5 font-sans">').replace(/\n/g, '<br />');

  return `<div class="prose-scribe space-y-1"><p class="my-1 font-sans">${html}</p></div>`;
}

/**
 * Resolves any clicked pill element (entity, todo, decision, or message) to its target Page
 */
export function findPageForPill(target: HTMLElement, pages: Page[]): Page | undefined {
  const dataType = target.getAttribute('data-type');
  const entityAttr = target.getAttribute('data-entity');
  const titleAttr = target.getAttribute('data-title');
  const fullAttr = target.getAttribute('data-full');

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

  // 1. Direct ID match
  let matched = candidatePages.find((p) => p.id.toLowerCase() === cleanQuery);
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

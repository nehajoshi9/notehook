import { Page } from './types';

/**
 * Tiptap JSON AST Leaf Node Traversal & Auto-Linking Utility for Multi-Word Page Titles
 */
export function autoLinkAstContent(contentJson: any, pages: Page[]): { contentJson: any; replacementsCount: number } {
  if (!contentJson || !pages || pages.length === 0) {
    return { contentJson, replacementsCount: 0 };
  }

  // Filter out invalid/empty titles or system primitive keywords
  const validPages = pages.filter(
    (p) =>
      p.title &&
      p.title.trim().length > 0 &&
      p.title.toLowerCase() !== 'todo' &&
      p.title.toLowerCase() !== 'decision'
  );

  if (validPages.length === 0) {
    return { contentJson, replacementsCount: 0 };
  }

  let count = 0;
  const pageMap = new Map<string, Page>();
  validPages.forEach((p) => pageMap.set(p.title.trim().toLowerCase(), p));

  // Sort pages by title length descending so multi-word titles (e.g. "Mark Zuckerberg") match before single words ("Mark")
  const sortedPages = [...validPages].sort((a, b) => b.title.trim().length - a.title.trim().length);

  const regexPatterns = sortedPages
    .map((p) => `\\b${escapeRegExp(p.title.trim())}\\b`)
    .join('|');

  if (!regexPatterns) return { contentJson, replacementsCount: 0 };

  const regex = new RegExp(regexPatterns, 'gi');

  function transformNode(node: any): any {
    if (!node) return node;

    if (Array.isArray(node)) {
      return node.flatMap(transformNode);
    }

    // Do NOT touch existing pageMention, todoItem, or decision nodes
    if (node.type === 'pageMention' || node.type === 'todoItem' || node.type === 'decision') {
      return node;
    }

    if (node.type === 'text' && typeof node.text === 'string') {
      const text: string = node.text;
      regex.lastIndex = 0;
      if (!regex.test(text)) {
        return node;
      }

      regex.lastIndex = 0;
      let segments: any[] = [];
      let lastIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = regex.exec(text)) !== null) {
        const matchedTitle = match[0];
        const matchIndex = match.index;

        if (matchIndex > lastIndex) {
          segments.push({
            type: 'text',
            text: text.slice(lastIndex, matchIndex),
          });
        }

        const matchedPage = pageMap.get(matchedTitle.toLowerCase());
        const canonicalTitle = matchedPage ? matchedPage.title : matchedTitle;

        segments.push({
          type: 'pageMention',
          attrs: {
            id: canonicalTitle,
            label: canonicalTitle,
          },
        });

        count++;
        lastIndex = matchIndex + matchedTitle.length;
      }

      if (lastIndex < text.length) {
        segments.push({
          type: 'text',
          text: text.slice(lastIndex),
        });
      }

      return segments.length > 0 ? segments : node;
    }

    if (node.content && Array.isArray(node.content)) {
      return {
        ...node,
        content: node.content.flatMap(transformNode),
      };
    }

    return node;
  }

  const newAst = transformNode(contentJson);
  return { contentJson: newAst, replacementsCount: count };
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

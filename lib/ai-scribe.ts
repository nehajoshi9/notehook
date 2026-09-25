import { Page, AISettings, Mention } from './types';
import { parseScribeMarkup } from './scribe-parser';

export function getTopRecentEntityTitles(entities: Page[], mentions: Mention[] = []): string[] {
  const getRecency = (e: Page): number => {
    let maxTime = new Date(e.created_at || 0).getTime();
    for (const m of mentions) {
      if (m.target_page_id === e.id || m.source_page_id === e.id) {
        const t = new Date(m.created_at || 0).getTime();
        if (t > maxTime) maxTime = t;
      }
    }
    return maxTime;
  };

  const sorted = [...entities].sort((a, b) => getRecency(b) - getRecency(a));
  return sorted.slice(0, 25).map((e) => e.title);
}

interface TrieNode {
  children: Map<string, TrieNode>;
  page?: Page;
}

export class MentionIndex {
  private exactMap = new Map<string, Page>();
  private root: TrieNode = { children: new Map() };

  constructor(pages: Page[]) {
    for (const page of pages) {
      this.indexPage(page);
    }
  }

  private addKey(key: string, page: Page) {
    const normalized = key.toLowerCase();
    this.exactMap.set(normalized, page);

    let node = this.root;
    for (let i = 0; i < normalized.length; i++) {
      const ch = normalized[i];
      let next = node.children.get(ch);
      if (!next) {
        next = { children: new Map() };
        node.children.set(ch, next);
      }
      node = next;
    }
    if (!node.page) {
      node.page = page;
    }
  }

  private indexPage(page: Page) {
    // 1. Direct page IDs
    this.exactMap.set(page.id.toLowerCase(), page);

    // 2. Short ID
    if (page.short_id) {
      const shortId = page.short_id.trim();
      this.exactMap.set(shortId.toLowerCase(), page);
      this.addKey(`[@${shortId}]`, page);
      this.addKey(`@${shortId}`, page);
    }

    // 3. Title variations
    const cleanTitle = page.title.replace(/^@/, '').trim();
    if (cleanTitle) {
      this.exactMap.set(cleanTitle.toLowerCase(), page);
      this.addKey(`[@${cleanTitle}]`, page);
      this.addKey(`@${cleanTitle}`, page);

      if (page.type) {
        this.addKey(`[@${page.type}:${cleanTitle}]`, page);
        this.addKey(`[@${page.type}: ${cleanTitle}]`, page);
      }
    }

    // 4. Version titles (for entities)
    if (page.versions && page.versions.length > 0) {
      for (const v of page.versions) {
        const vTitle = v.title.replace(/^@/, '').trim();
        if (vTitle) {
          this.exactMap.set(vTitle.toLowerCase(), page);
          this.addKey(`[@${vTitle}]`, page);
          this.addKey(`@${vTitle}`, page);
        }
      }
    }
  }

  public lookupExact(key: string): Page | undefined {
    if (!key) return undefined;
    const clean = key.replace(/^@/, '').trim().toLowerCase();
    return this.exactMap.get(clean) || this.exactMap.get(key.trim().toLowerCase());
  }

  // Scan text in O(L) time using the Trie with exact span tracking
  public searchMentionsWithSpans(text: string): Array<{ page: Page; start: number; end: number }> {
    const matches: Array<{ page: Page; start: number; end: number }> = [];
    const lower = text.toLowerCase();
    const len = lower.length;

    let i = 0;
    while (i < len) {
      // Mentions start with '@' or '[@'
      if (lower[i] === '@' || (lower[i] === '[' && i + 1 < len && lower[i + 1] === '@')) {
        let node = this.root;
        let lastMatchedPage: Page | undefined;
        let matchEndIndex = -1;

        let j = i;
        while (j < len) {
          const ch = lower[j];
          const next = node.children.get(ch);
          if (!next) break;

          node = next;
          j++;

          if (node.page) {
            const isBracketed = lower[i] === '[';
            if (isBracketed) {
              if (lower[j - 1] === ']') {
                lastMatchedPage = node.page;
                matchEndIndex = j;
              }
            } else {
              const nextChar = j < len ? lower[j] : '';
              const isWordChar = /[a-z0-9_]/i.test(nextChar);
              if (!isWordChar) {
                lastMatchedPage = node.page;
                matchEndIndex = j;
              }
            }
          }
        }

        if (lastMatchedPage) {
          matches.push({
            page: lastMatchedPage,
            start: i,
            end: matchEndIndex,
          });
          i = matchEndIndex;
          continue;
        }
      }
      i++;
    }

    return matches;
  }

  public searchMentions(text: string): Page[] {
    const spans = this.searchMentionsWithSpans(text);
    const results = new Map<string, Page>();
    for (const match of spans) {
      results.set(match.page.id, match.page);
    }
    return Array.from(results.values());
  }
}

export function getReferencedPagesFromPrompt(prompt: string, allPages: Page[] = []): Page[] {
  if (!prompt || !allPages || allPages.length === 0) return [];

  const index = new MentionIndex(allPages);
  const referencedMap = new Map<string, Page>();

  // 1. O(L) Trie scan for bracketed and unbracketed mentions with span tracking
  const foundSpans = index.searchMentionsWithSpans(prompt);
  for (const match of foundSpans) {
    referencedMap.set(match.page.id, match.page);
  }

  // 2. Parse scribe markup tags and resolve in O(1) via inverted index, ignoring tags subsumed by longer Trie spans
  const parsedItems = parseScribeMarkup(prompt, allPages);
  for (const item of parsedItems) {
    if (item.spanStart !== undefined && item.spanEnd !== undefined) {
      const isSubsumed = foundSpans.some(
        (span) => item.spanStart! >= span.start && item.spanEnd! <= span.end && (item.spanEnd! - item.spanStart!) < (span.end - span.start)
      );
      if (isSubsumed) continue;
    }

    const key = item.nameOrTitle || item.fullText || '';
    const matched = index.lookupExact(key);
    if (matched && !referencedMap.has(matched.id)) {
      referencedMap.set(matched.id, matched);
    }
  }

  return Array.from(referencedMap.values());
}

export function buildReferencedContextSystemPromptSection(referencedPages: Page[]): string {
  if (!referencedPages || referencedPages.length === 0) return '';

  const blocks = referencedPages.map((page) => {
    let pageContent = (page.content || '').trim();
    // For versioned entity pages, append the active / canonical version content
    if (page.type === 'entity' && page.versions && page.versions.length > 0) {
      const canonicalVersion = page.versions.find(
        (v) => v.id === page.canonical_version_id || v.is_canonical
      );
      const activeVersion = canonicalVersion || page.versions[page.versions.length - 1];
      if (activeVersion && activeVersion.content) {
        pageContent = `${pageContent}\n\n[Active Version "${activeVersion.title}"]: ${activeVersion.content.trim()}`;
      }
    }

    const shortIdStr = page.short_id ? ` (ID: ${page.short_id})` : '';
    const userPromptMeta = page.user_prompt ? `\nUser Prompt Framing: "${page.user_prompt}"` : '';

    return `--- REFERENCED PAGE: [@${page.title}]${shortIdStr} [type: ${page.type}] ---${userPromptMeta}\nContent:\n${pageContent}`;
  });

  return `\n\n=== REFERENCED CONTEXT FOR THIS TURN ===\nThe user's prompt in this turn explicitly references the following workspace page(s). Use this injected context to inform your answer:\n\n${blocks.join('\n\n')}\n=== END REFERENCED CONTEXT ===`;
}

export function buildPinnedKnowledgeSection(allPages: Page[], pinnedPageIds: string[] = []): string {
  if (!pinnedPageIds || pinnedPageIds.length === 0) return '';

  const pinnedPages = allPages
    .filter((p) => pinnedPageIds.includes(p.id) && (p.type === 'entity' || p.type === 'decision' || p.type === 'note'))
    .slice(0, 3)
    .sort((a, b) => (a.short_id || a.title).localeCompare(b.short_id || b.title));

  if (pinnedPages.length === 0) return '';

  const blocks = pinnedPages.map((page) => {
    let pageContent = (page.content || '').trim();
    if (page.type === 'entity' && page.versions && page.versions.length > 0) {
      const canonicalVersion = page.versions.find(
        (v) => v.id === page.canonical_version_id || v.is_canonical
      );
      const activeVersion = canonicalVersion || page.versions[page.versions.length - 1];
      if (activeVersion && activeVersion.content) {
        pageContent = `${pageContent}\n\n[Active Version "${activeVersion.title}"]: ${activeVersion.content.trim()}`;
      }
    }
    const shortIdStr = page.short_id ? ` [@${page.short_id}]` : '';
    return `### PINNED ${page.type.toUpperCase()}: [@${page.title}]${shortIdStr}\nContent:\n${pageContent}`;
  });

  return `\n\n=== PINNED SESSION KNOWLEDGE (GROUND TRUTH ANCHORS) ===\nThe architect has pinned the following high-priority page(s) for this working session. Treat these as active system constraints:\n\n${blocks.join('\n\n')}\n=== END PINNED SESSION KNOWLEDGE ===`;
}

export function buildKnowledgeCatalogueSection(allPages: Page[]): string {
  const knowledgePages = allPages
    .filter((p) => p.type === 'entity' || p.type === 'decision' || p.type === 'note')
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 25)
    .sort((a, b) => (a.short_id || a.title).localeCompare(b.short_id || b.title));

  if (knowledgePages.length === 0) return '';

  const lines = knowledgePages.map((p) => {
    const shortId = p.short_id ? `[@${p.short_id}] ` : '';
    const cleanTitle = p.title.replace(/^@/, '').trim();
    let snippet = (p.content || '').replace(/\s+/g, ' ').trim();
    if (snippet.length > 100) snippet = snippet.slice(0, 97) + '...';
    return `- ${shortId}[@${cleanTitle}] (${p.type}): ${snippet || 'Architectural page'}`;
  });

  return `\n\n=== WORKSPACE KNOWLEDGE CATALOGUE (TOP 25) ===\nThe workspace contains the following knowledge pages. If relevant, you may reference them by [@title] or short ID:\n${lines.join('\n')}\n=== END WORKSPACE CATALOGUE ===`;
}

export function buildDynamicReferencedSection(
  referencedPages: Page[],
  changedPageIds?: Set<string>,
  // Maps page ID -> turn label string (e.g. "[Turn 3 | msg: M-42]") for message-type pages
  // so the LLM can correlate injected message content back to a specific history position.
  messageTurnLabels?: Map<string, string>
): string {
  if (!referencedPages || referencedPages.length === 0) return '';

  let ordered = referencedPages;
  if (changedPageIds && changedPageIds.size > 0) {
    const fresh = referencedPages
      .filter((p) => !changedPageIds.has(p.id))
      .sort((a, b) => (a.short_id || a.title).localeCompare(b.short_id || b.title));
    const reinjected = referencedPages
      .filter((p) => changedPageIds.has(p.id))
      .sort((a, b) => (a.short_id || a.title).localeCompare(b.short_id || b.title));
    ordered = [...fresh, ...reinjected];
  } else {
    ordered = [...referencedPages].sort((a, b) => (a.short_id || a.title).localeCompare(b.short_id || b.title));
  }

  const blocks = ordered.map((page) => {
    let pageContent = (page.content || '').trim();
    if (page.type === 'entity' && page.versions && page.versions.length > 0) {
      const canonicalVersion = page.versions.find(
        (v) => v.id === page.canonical_version_id || v.is_canonical
      );
      const activeVersion = canonicalVersion || page.versions[page.versions.length - 1];
      if (activeVersion && activeVersion.content) {
        pageContent = `${pageContent}\n\n[Active Version "${activeVersion.title}"]: ${activeVersion.content.trim()}`;
      }
    }
    const cleanTitle = page.title.replace(/^@/, '').trim();
    const shortIdStr = page.short_id ? ` (ID: ${page.short_id})` : '';
    const userPromptMeta = page.user_prompt ? `\nUser Prompt Framing: "${page.user_prompt}"` : '';
    const statusMeta = page.type === 'todo'
      ? ` [Status: ${page.done ? 'COMPLETED / DONE' : 'PENDING / OPEN'}]`
      : '';
    // For message-type pages, annotate which labeled history turn this content came from
    // so the LLM can match the injected content to the correct turn in the conversation history.
    const historyPositionMeta = page.type === 'message' && messageTurnLabels?.has(page.id)
      ? `\nIn conversation history as: ${messageTurnLabels.get(page.id)}`
      : '';
    return `--- REFERENCED PAGE: [@${cleanTitle}]${shortIdStr} [type: ${page.type}]${statusMeta} ---${historyPositionMeta}${userPromptMeta}\nContent:\n${pageContent}\n--- END REFERENCED PAGE ---`;
  });

  return `=== REFERENCED CONTEXT FOR THIS TURN ===\n${blocks.join('\n\n')}\n=== END REFERENCED CONTEXT ===`;
}

export async function generateScribeResponse(
  userPrompt: string,
  existingEntities: Page[],
  aiSettings: AISettings,
  onChunk?: (chunk: string) => void,
  mentions: Mention[] = [],
  allPages: Page[] = [],
  pinnedPageIds: string[] = []
): Promise<{ text: string; parsedItems: ReturnType<typeof parseScribeMarkup>; injectedContext?: string; referencedPageIds?: string[] }> {
  // TIER 1: Invariant System Contract (100% frozen)
  const baseSystemPrompt = `Role: Engineering intelligence engine for Notehook, a Git-backed architectural workspace. Human reviews and commits all state.

CRITICAL TAGGING CONTRACT (STRICTLY CONSERVATIVE):
By default, output standard Markdown with ZERO tags. Most explanations, definitions, trade-offs, and advice must NOT contain tags.

1. [@EntityName]:
   - Formal architecture or system components (e.g., [@AuthFlow], [@DatabasePool]).
   - Do NOT invent entities for external libraries, generic concepts, or third-party tools (e.g., NO [@PostgreSQL], NO [@Redis]).

2. [@decision: ADR Title]:
   - ONLY emit when the user explicitly commits to a specific choice (e.g., "Let's go with X", "We decided on Y") or explicitly asks to record an ADR.
   - FORBIDDEN on suggestions, recommendations, or definitions (e.g., "You should use caching" is NOT a decision).

3. [@todo: Imperative task]:
   - ONLY emit when the user explicitly asks for actionable next steps, a task breakdown, or specifies a direct task to track.
   - FORBIDDEN on study tips, general advice, or generic steps.

4. [@note: Short Title]:
   - ONLY for cross-referencing human scratchpads. Never put long body text inside a note tag.

PROHIBITED SYNTAX:
- Never use [@msg:], [@chat:], [@task:], [@adr:], or generic bracket tags like [important].
- Standard Markdown links [text](url) are permitted.

STYLE & REASONING:
- Concise, technical, and grounded. Zero conversational filler ("Sure!", "Here you go!").
- When asked to draft a spec or code, output clean Markdown/code blocks.
- Never claim you updated or committed to Git directly; you only propose drafts.

CONTRAST EXAMPLES (BEHAVIOR TARGETS):
- User: "How does connection pooling work in Postgres?"
  Assistant: (Explains connection pooling cleanly in Markdown with ZERO tags. No [@PostgreSQL], no [@decision], no [@todo].)
- User: "We decided to cap max pool size at 20. Remind me to update the env vars."
  Assistant: "Noted:
  - [@decision: Cap PostgreSQL max connection pool at 20]
  - [@todo: Update DATABASE_POOL_MAX in environment variables]"`;

  // TIER 2: Top 25 Knowledge Catalogue (100% stable, deterministic, decoupled from pin state)
  const catalogueSection = buildKnowledgeCatalogueSection(allPages);

  // TIER 3: Pinned Knowledge Session Anchors (Session-wide cacheable)
  const pinnedSection = buildPinnedKnowledgeSection(allPages, pinnedPageIds);

  // CACHED SYSTEM PREFIX: Tier 1 (Contract) + Tier 2 (Catalogue) + Tier 3 (Pinned)
  const cachedSystemPrompt = `${baseSystemPrompt}${catalogueSection}${pinnedSection}`;

  // TIER 5: Verbatim Conversation History (Last 15 completed turns)
  const MAX_VERBATIM_TURNS = 12;
  const pastTurns = allPages
    .filter((p) => p.type === 'message' && p.user_prompt?.trim() && p.content?.trim())
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .slice(-MAX_VERBATIM_TURNS);

  // Extract all referenced pages in current prompt
  const allReferenced = getReferencedPagesFromPrompt(userPrompt, allPages.length > 0 ? allPages : existingEntities);
  // Exclude any already pinned in Tier 3 (since Tier 3 already has their full canonical content)
  const nonPinnedReferenced = allReferenced.filter((p) => !pinnedPageIds.includes(p.id));

  // Set of page IDs that are already present verbatim in history and have NOT changed since that turn
  const alreadyVerbatimUnchangedIds = new Set<string>();
  // Set of page IDs that were previously present in history but changed, requiring re-injection to the end
  const changedPageIds = new Set<string>();

  // 1. Any message turn already in the active verbatim history buffer is already present verbatim to the LLM
  for (const turn of pastTurns) {
    alreadyVerbatimUnchangedIds.add(turn.id);
  }

  const index = new MentionIndex(allPages.length > 0 ? allPages : existingEntities);

  // Process past turns:
  // If an injected page in a past turn was modified after that turn, remove its stale reference block
  const processedPastTurns = pastTurns.map((turn, turnIdx) => {
    let turnInjected = turn.injected_context || '';
    const turnTime = new Date(turn.created_at).getTime();

    // Identify referenced pages either from referenced_page_ids or extracted from injected_context
    const referencedIdsInTurn = new Set<string>(turn.referenced_page_ids || []);
    if (turnInjected) {
      const titleMatches = turnInjected.matchAll(/--- REFERENCED PAGE: \[@?([^\]]+)\]/g);
      for (const m of titleMatches) {
        const title = m[1].replace(/^@/, '').trim();
        const p = allPages.find(
          (page) => page.title.replace(/^@/, '').trim().toLowerCase() === title.toLowerCase()
        );
        if (p) referencedIdsInTurn.add(p.id);
      }
    }

    // Also detect items (especially todos) mentioned directly or created in this turn
    const mentionedInTurn = [
      ...index.searchMentions(turn.content),
      ...(turn.user_prompt ? index.searchMentions(turn.user_prompt) : []),
      ...allPages.filter((p) => p.type === 'todo' && (p.created_at === turn.created_at || turn.content.includes(p.title))),
    ];
    for (const item of mentionedInTurn) {
      const itemUpdatedTime = new Date(item.updated_at || item.created_at).getTime();
      const hasChanged = itemUpdatedTime > turnTime;
      if (hasChanged) {
        changedPageIds.add(item.id);
      } else {
        alreadyVerbatimUnchangedIds.add(item.id);
      }
    }

    if (referencedIdsInTurn.size > 0) {
      for (const refId of referencedIdsInTurn) {
        const page = allPages.find((p) => p.id === refId);
        if (!page) continue;

        let latestVersionTime = 0;
        if (page.versions && page.versions.length > 0) {
          for (const v of page.versions) {
            const vTime = new Date(v.updated_at || v.created_at).getTime();
            if (vTime > latestVersionTime) latestVersionTime = vTime;
          }
        }

        const pageUpdatedTime = Math.max(
          new Date(page.updated_at || page.created_at).getTime(),
          latestVersionTime
        );
        const hasChanged = pageUpdatedTime > turnTime;

        const isPinned = pinnedPageIds.includes(page.id);
        if (hasChanged || isPinned) {
          if (hasChanged) {
            changedPageIds.add(page.id);
          }
          // File changed since this turn, or is already pinned in Tier 3 session anchors!
          // Strip duplicate/stale reference block from history
          const cleanTitle = page.title.replace(/^@/, '').trim();
          const escapedTitle = cleanTitle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          const blockRegex = new RegExp(`--- REFERENCED PAGE: \\[@?${escapedTitle}\\][\\s\\S]*?--- END REFERENCED PAGE ---(\\n\\n)?`, 'gi');
          turnInjected = turnInjected.replace(blockRegex, '').trim();
        } else {
          // Page has NOT changed: model already has access to it verbatim in history!
          alreadyVerbatimUnchangedIds.add(page.id);
        }
      }
    }

    // Clean up empty section wrapper if all reference blocks inside were removed
    if (!turnInjected.includes('--- REFERENCED PAGE:')) {
      turnInjected = '';
    }

    const userBody = turnInjected
      ? `${turnInjected}\n\n${turn.user_prompt!.trim()}`
      : turn.user_prompt!.trim();

    // Label each history turn so the model can refer back to it by number or ID.
    // Format: [Turn N | msg: <short_id>] — short_id is the human-readable page handle.
    const turnLabel = turn.short_id
      ? `[Turn ${turnIdx + 1} | msg: ${turn.short_id}]`
      : `[Turn ${turnIdx + 1}]`;

    return {
      turnLabel,
      turnNumber: turnIdx + 1,
      userText: `${turnLabel}\n${userBody}`,
      modelText: turn.content.trim(),
    };
  });

  // TIER 4: Dynamic Turn References
  // Do NOT re-insert pages if the model already has access to them verbatim and unchanged in history!
  // Re-injected changed pages are pushed to the very end of the list of full text bodies!
  const toInjectCurrentTurn = nonPinnedReferenced.filter(
    (p) => !alreadyVerbatimUnchangedIds.has(p.id)
  );

  // Build a lookup from message page ID -> its labeled turn header, so that when a message-type
  // page is injected into the current turn's context block, the LLM can correlate the injected
  // content to the exact labeled turn it appeared in (e.g. "[Turn 3 | msg: M-42]").
  const messageTurnLabels = new Map<string, string>();
  for (const [i, turn] of pastTurns.entries()) {
    const label = turn.short_id ? `[Turn ${i + 1} | msg: ${turn.short_id}]` : `[Turn ${i + 1}]`;
    messageTurnLabels.set(turn.id, label);
  }

  // Pages referenced in the current prompt but intentionally skipped from re-injection because they
  // are already present verbatim and unchanged in conversation history. Emit a one-line backpointer
  // stub for each so the LLM has an ID anchor for every [@mention] in the user prompt even without
  // a full re-injection block.
  const alreadyInHistoryReferenced = nonPinnedReferenced.filter(
    (p) => alreadyVerbatimUnchangedIds.has(p.id) && p.type !== 'message' // messages already get turn labels in history
  );
  const backpointerStubs = alreadyInHistoryReferenced.length > 0
    ? alreadyInHistoryReferenced
      .map((p) => {
        const cleanTitle = p.title.replace(/^@/, '').trim();
        const shortIdStr = p.short_id ? ` (ID: ${p.short_id})` : '';
        return `--- CONTEXT POINTER: [@${cleanTitle}]${shortIdStr} [type: ${p.type}] — already present verbatim in your context from an earlier turn; no re-injection needed. ---`;
      })
      .join('\n')
    : '';

  // Full section merges fresh/re-injected full blocks (from buildDynamicReferencedSection) with
  // backpointer stubs for already-present pages. Stored as dynamicRefSection for downstream use.
  const dynamicRefSectionBase = buildDynamicReferencedSection(toInjectCurrentTurn, changedPageIds, messageTurnLabels);
  const dynamicRefSection = [dynamicRefSectionBase, backpointerStubs].filter(Boolean).join('\n\n');

  const freshIds = toInjectCurrentTurn.filter((p) => !changedPageIds.has(p.id)).map((p) => p.id);
  const reinjectedIds = toInjectCurrentTurn.filter((p) => changedPageIds.has(p.id)).map((p) => p.id);
  const currentReferencedPageIds = [...freshIds, ...reinjectedIds];

  // Gemini contents: Alternating user/model history concluding with current prompt + dynamic references
  const geminiContents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of processedPastTurns) {
    geminiContents.push({
      role: 'user',
      parts: [{ text: turn.userText }],
    });
    geminiContents.push({
      role: 'model',
      parts: [{ text: turn.modelText }],
    });
  }

  // TIER 6: Current User Turn — labeled as Turn N (current) so the model knows its position
  const currentTurnNumber = processedPastTurns.length + 1;
  const currentTurnLabel = `[Turn ${currentTurnNumber} (current)]`;
  const currentUserBody = dynamicRefSection
    ? `${dynamicRefSection}\n\n${userPrompt.trim()}`
    : userPrompt.trim();
  const finalTurnText = `${currentTurnLabel}\n${currentUserBody}`;

  geminiContents.push({
    role: 'user',
    parts: [{ text: finalTurnText }],
  });

  // OpenAI messages: System prompt with Tier 1+2+3, history, and current turn
  const openAiMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: cachedSystemPrompt },
  ];
  for (const turn of processedPastTurns) {
    openAiMessages.push({
      role: 'user',
      content: turn.userText,
    });
    openAiMessages.push({
      role: 'assistant',
      content: turn.modelText,
    });
  }
  openAiMessages.push({
    role: 'user',
    content: finalTurnText, // already labeled as [Turn N (current)] above
  });

  const apiKey = aiSettings.apiKey || process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const effectiveProvider = (aiSettings.provider === 'simulated' && apiKey) ? 'gemini' : aiSettings.provider;

  // 1. If no API key or simulated provider, fallback to simulator
  if (effectiveProvider === 'simulated' || !apiKey) {
    return generateSimulatedResponse(
      userPrompt,
      existingEntities,
      onChunk,
      dynamicRefSection || undefined,
      currentReferencedPageIds.length > 0 ? currentReferencedPageIds : undefined
    );
  }

  // 2. Gemini Provider
  if (effectiveProvider === 'gemini') {
    const primaryModel = aiSettings.model && aiSettings.model !== 'gpt-4o-mini' && aiSettings.model !== 'gemini-1.5-flash' && aiSettings.model !== 'gemini-2.5-flash'
      ? aiSettings.model
      : 'gemini-3.6-flash';
    // Broader candidate list: newer models first, stable fallbacks at the end.
    // gemini-2.0-flash and gemini-1.5-flash are on separate infra and less likely
    // to share the same overload queue as 3.x / 2.5 models.
    const candidateModels = Array.from(new Set([
      primaryModel,
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-flash-latest',
      'gemini-2.0-flash',
      'gemini-1.5-flash',
    ]));

    let lastErrorDetails = '';
    let allOverloaded = true; // flipped to false if any error is NOT a 503

    for (const model of candidateModels) {
      try {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: cachedSystemPrompt }] },
              contents: geminiContents,
            }),
          }
        );

        if (res.ok) {
          const reader = res.body?.getReader();
          const decoder = new TextDecoder();
          let fullText = '';

          if (reader) {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              const chunk = decoder.decode(value, { stream: true });
              const lines = chunk.split('\n');
              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  try {
                    const json = JSON.parse(line.substring(6));
                    const textPart = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    if (textPart) {
                      fullText += textPart;
                      if (onChunk) onChunk(textPart);
                    }
                  } catch (e) {
                    // ignore SSE parse errors
                  }
                }
              }
            }
          }

          if (fullText) {
            const parsedItems = parseScribeMarkup(fullText, existingEntities);
            return {
              text: fullText,
              parsedItems,
              injectedContext: dynamicRefSection || undefined,
              referencedPageIds: currentReferencedPageIds.length > 0 ? currentReferencedPageIds : undefined,
            };
          }
        }

        // Check if this was a 503/overloaded response — if so, skip the non-streaming
        // retry for this model (hitting it again will get the same error).
        const isOverloaded = res.status === 503;
        if (!isOverloaded) allOverloaded = false;

        if (isOverloaded) {
          lastErrorDetails = `${model}: 503 UNAVAILABLE (overloaded)`;
          continue; // skip non-streaming retry, try next candidate model
        }

        // Fallback to non-streaming POST (only for non-503 errors)
        const fallbackRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              system_instruction: { parts: [{ text: cachedSystemPrompt }] },
              contents: geminiContents,
            }),
          }
        );

        if (fallbackRes.ok) {
          const data = await fallbackRes.json();
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          if (text) {
            if (onChunk) onChunk(text);
            const parsedItems = parseScribeMarkup(text, existingEntities);
            return {
              text,
              parsedItems,
              injectedContext: dynamicRefSection || undefined,
              referencedPageIds: currentReferencedPageIds.length > 0 ? currentReferencedPageIds : undefined,
            };
          }
        } else {
          if (fallbackRes.status !== 503) allOverloaded = false;
          lastErrorDetails = await fallbackRes.text();
        }
      } catch (err: any) {
        allOverloaded = false;
        lastErrorDetails = err?.message || String(err);
      }
    }

    // All candidate models failed. Surface a human-readable error in the chat
    // rather than falling back to the simulator (which would produce fake output).
    console.warn('Gemini model calls failed:', lastErrorDetails);
    const errorMsg = allOverloaded
      ? `⚠️ Gemini is currently experiencing high demand across all fallback models. Please wait a moment and try again.\n\n*Models tried: ${candidateModels.join(', ')}*`
      : `⚠️ All Gemini model calls failed. Last error: ${lastErrorDetails}\n\n*Models tried: ${candidateModels.join(', ')}*`;
    if (onChunk) onChunk(errorMsg);
    const parsedItems = parseScribeMarkup(errorMsg, existingEntities);
    return {
      text: errorMsg,
      parsedItems,
      injectedContext: dynamicRefSection || undefined,
      referencedPageIds: currentReferencedPageIds.length > 0 ? currentReferencedPageIds : undefined,
    };
  }

  // 3. OpenAI Provider
  if (aiSettings.provider === 'openai') {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: aiSettings.model || 'gpt-4o-mini',
          messages: openAiMessages,
          stream: true,
        }),
      });

      if (!res.ok) {
        throw new Error(`OpenAI API error: ${res.statusText}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ') && line !== 'data: [DONE]') {
              try {
                const json = JSON.parse(line.substring(6));
                const delta = json.choices[0]?.delta?.content || '';
                if (delta) {
                  fullText += delta;
                  if (onChunk) onChunk(delta);
                }
              } catch (e) {
                // ignore SSE parse errors
              }
            }
          }
        }
      }

      const parsedItems = parseScribeMarkup(fullText, existingEntities);
      return {
        text: fullText,
        parsedItems,
        injectedContext: dynamicRefSection || undefined,
        referencedPageIds: currentReferencedPageIds.length > 0 ? currentReferencedPageIds : undefined,
      };
    } catch (err: any) {
      console.warn('OpenAI call failed, falling back to simulator:', err);
      return generateSimulatedResponse(
        userPrompt,
        existingEntities,
        onChunk,
        dynamicRefSection || undefined,
        currentReferencedPageIds.length > 0 ? currentReferencedPageIds : undefined
      );
    }
  }

  // Fallback to simulator
  return generateSimulatedResponse(
    userPrompt,
    existingEntities,
    onChunk,
    dynamicRefSection || undefined,
    currentReferencedPageIds.length > 0 ? currentReferencedPageIds : undefined
  );
}

async function generateSimulatedResponse(
  userPrompt: string,
  existingEntities: Page[],
  onChunk?: (chunk: string) => void,
  injectedContext?: string,
  referencedPageIds?: string[]
): Promise<{
  text: string;
  parsedItems: ReturnType<typeof parseScribeMarkup>;
  injectedContext?: string;
  referencedPageIds?: string[];
}> {
  // Generate intelligent mock response based on prompt context
  const p = userPrompt.toLowerCase();

  let responseText = '';
  if (p.includes('auth') || p.includes('login') || p.includes('user')) {
    responseText = `I analyzed the authentication requirements for our application.

Here is the architectural proposal using [@Supabase] and [@Next.js]:

[@decision: Use Supabase JWT cookies with Next.js Middleware for session validation]
[@decision: Enforce strict Row Level Security (RLS) on all user table schemas]

Action items for implementation:
[@todo: Set up Supabase auth listener hook in app state]
[@todo: Add OAuth provider configurations for Google and GitHub]
[@todo: Write integration test suite for multi-tenant token refresh]

For code reference, make sure not to tag inside code snippets like \`const token = auth\` or code blocks:
\`\`\`ts
// Example middleware snippet
export function middleware(req: NextRequest) {
  return updateSession(req);
}
\`\`\``;
  } else if (p.includes('database') || p.includes('schema') || p.includes('sql') || p.includes('postgres')) {
    responseText = `Here is the database design for our entity & mention storage layer:

[@decision: Store entity mentions in a relational junction table with span_start and span_end coordinates]
[@decision: Enforce canonical entity names at write-time with aliasing fallback]

Tasks to complete:
[@todo: Implement PostgreSQL migration script for entity_mentions table]
[@todo: Create co-mention filter query using deterministic node joins]
[@todo: Build orphaned mention detector for note edit events]

Referenced tools: [@Supabase], [@Tiptap Editor].`;
  } else {
    responseText = `Thanks for bringing this up regarding "${userPrompt.slice(0, 40)}...".

Here is how we should structure this feature:

[@decision: Maintain a 2-pane split screen view with opposite-pane link resolution]
[@decision: Clean inline reference syntax with [@todo: ...] and [@decision: ...]]

Next steps:
[@todo: Validate inline tag parser against static transcript fixtures]
[@todo: Add floating selection toolbar for manual select-to-tag actions]
[@todo: Test entity backlink view with React 19 state management]`;
  }

  // Stream in small chunks to simulate real LLM generation
  let currentText = '';
  const chunks = responseText.split(/(?<=\s|\n)/);
  for (const chunk of chunks) {
    currentText += chunk;
    if (onChunk) onChunk(chunk);
    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  const parsedItems = parseScribeMarkup(currentText, existingEntities);
  return {
    text: currentText,
    parsedItems,
    injectedContext,
    referencedPageIds,
  };
}


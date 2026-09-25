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

export function getReferencedPagesFromPrompt(prompt: string, allPages: Page[] = []): Page[] {
  if (!prompt || !allPages || allPages.length === 0) return [];

  const referencedMap = new Map<string, Page>();

  // 1. Parse scribe markup tags in prompt
  const parsedItems = parseScribeMarkup(prompt, allPages);
  for (const item of parsedItems) {
    const cleanTitle = (item.nameOrTitle || item.fullText || '').trim().toLowerCase();
    if (!cleanTitle) continue;

    const matched = allPages.find((p) => {
      if (p.id.toLowerCase() === cleanTitle) return true;
      if (p.short_id && p.short_id.toLowerCase() === cleanTitle) return true;
      const cleanPTitle = p.title.replace(/^@/, '').trim().toLowerCase();
      if (cleanPTitle === cleanTitle) return true;
      return false;
    });

    if (matched && !referencedMap.has(matched.id)) {
      referencedMap.set(matched.id, matched);
    }
  }

  // 2. Scan all pages for short_id (e.g. [@m1], @m1) or title matches in prompt
  for (const page of allPages) {
    if (referencedMap.has(page.id)) continue;

    if (page.short_id) {
      const escapedShort = page.short_id.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const shortRegex = new RegExp(`\\[@${escapedShort}\\]|@${escapedShort}\\b`, 'i');
      if (shortRegex.test(prompt)) {
        referencedMap.set(page.id, page);
        continue;
      }
    }

    const cleanTitle = page.title.replace(/^@/, '').trim();
    if (cleanTitle && cleanTitle.length >= 2) {
      const escapedTitle = cleanTitle.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const titleRegex = new RegExp(`\\[@(todo:|decision:|note:|message:)?\\s*${escapedTitle}\\s*\\]|@${escapedTitle}\\b`, 'i');
      if (titleRegex.test(prompt)) {
        referencedMap.set(page.id, page);
      }
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

export function buildDynamicReferencedSection(referencedPages: Page[]): string {
  if (!referencedPages || referencedPages.length === 0) return '';

  const sorted = [...referencedPages].sort((a, b) => (a.short_id || a.title).localeCompare(b.short_id || b.title));

  const blocks = sorted.map((page) => {
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
    return `--- REFERENCED PAGE: [@${cleanTitle}]${shortIdStr} [type: ${page.type}] ---${userPromptMeta}\nContent:\n${pageContent}\n--- END REFERENCED PAGE ---`;
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
  const MAX_VERBATIM_TURNS = 15;
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

  // Process past turns:
  // If an injected page in a past turn was modified after that turn, remove its stale reference block
  const processedPastTurns = pastTurns.map((turn) => {
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

    if (referencedIdsInTurn.size > 0) {
      for (const refId of referencedIdsInTurn) {
        const page = allPages.find((p) => p.id === refId);
        if (!page) continue;

        const pageUpdatedTime = new Date(page.updated_at || page.created_at).getTime();
        const hasChanged = pageUpdatedTime > turnTime;

        if (hasChanged) {
          // File changed since this turn! Strip stale reference block from history
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

    const turnFullPrompt = turnInjected
      ? `${turnInjected}\n\n${turn.user_prompt!.trim()}`
      : turn.user_prompt!.trim();

    return {
      userText: turnFullPrompt,
      modelText: turn.content.trim(),
    };
  });

  // TIER 4: Dynamic Turn References
  // Do NOT re-insert pages if the model already has access to them verbatim and unchanged in history!
  const toInjectCurrentTurn = nonPinnedReferenced.filter(
    (p) => !alreadyVerbatimUnchangedIds.has(p.id)
  );
  const dynamicRefSection = buildDynamicReferencedSection(toInjectCurrentTurn);
  const currentReferencedPageIds = toInjectCurrentTurn.map((p) => p.id);

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

  // TIER 6: Current User Turn
  const finalTurnText = dynamicRefSection
    ? `${dynamicRefSection}\n\n${userPrompt.trim()}`
    : userPrompt.trim();

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
    content: finalTurnText,
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
    const candidateModels = Array.from(new Set([primaryModel, 'gemini-3.6-flash', 'gemini-3.5-flash', 'gemini-flash-latest']));

    let lastErrorDetails = '';

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

        // Fallback to non-streaming POST
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
          lastErrorDetails = await fallbackRes.text();
        }
      } catch (err: any) {
        lastErrorDetails = err?.message || String(err);
      }
    }

    console.warn('Gemini model calls failed, falling back to simulator:', lastErrorDetails);
    return generateSimulatedResponse(
      userPrompt,
      existingEntities,
      onChunk,
      dynamicRefSection || undefined,
      currentReferencedPageIds.length > 0 ? currentReferencedPageIds : undefined
    );
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


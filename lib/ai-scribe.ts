import { Page, AISettings } from './types';
import { parseScribeMarkup } from './scribe-parser';

export async function generateScribeResponse(
  userPrompt: string,
  existingEntities: Page[],
  aiSettings: AISettings,
  onChunk?: (chunk: string) => void
): Promise<{ text: string; parsedItems: ReturnType<typeof parseScribeMarkup> }> {
  const entityListStr = existingEntities.map((e) => `[@${e.title}]`).join(', ');

  const systemPrompt = `You are Planet Scribe, an intelligent project partner.
You write responses using custom inline markup primitives in bracketed format:
1. Entities: [@EntityName] - Tag tools, libraries, concepts, or people (e.g. [@Supabase], [@Mark Zuckerberg]). REUSE existing project entities whenever possible: ${entityListStr || '(No existing entities yet)'}.
2. Action Items: [@todo: <task description>] - Tag actionable tasks or next steps.
3. Decisions: [@decision: <decision description>] - Tag agreed architectural choices, trade-offs, rules, or constraints.

Rules:
- NEVER place markup tags inside code blocks (\`\`\` or \`).
- Always enclose tags inside brackets: [@EntityName], [@todo: description], [@decision: description].
- Use reasoning/thinking before giving structured response.`;

  // 1. If provider is Simulated or no API key, use rich mock AI stream generator
  if (aiSettings.provider === 'simulated' || !aiSettings.apiKey) {
    return generateSimulatedResponse(userPrompt, existingEntities, onChunk);
  }

  // 2. OpenAI Provider
  if (aiSettings.provider === 'openai') {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${aiSettings.apiKey}`,
        },
        body: JSON.stringify({
          model: aiSettings.model || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
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
      return { text: fullText, parsedItems };
    } catch (err: any) {
      console.warn('OpenAI call failed, falling back to simulator:', err);
      return generateSimulatedResponse(userPrompt, existingEntities, onChunk);
    }
  }

  // Fallback to simulator
  return generateSimulatedResponse(userPrompt, existingEntities, onChunk);
}

async function generateSimulatedResponse(
  userPrompt: string,
  existingEntities: Page[],
  onChunk?: (chunk: string) => void
): Promise<{ text: string; parsedItems: ReturnType<typeof parseScribeMarkup> }> {
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
  return { text: currentText, parsedItems };
}


# AGENTS.md — Notehook Spec & Guidelines

## 1. Project Overview & Philosophy
Notehook is a lightweight navigation and dual-pane knowledge layer over long AI-assisted conversations. Important decisions and action items are surfaced automatically, entity specs are human-curated and versioned, and sacred notes are kept isolated from AI modifications — all within a clean, unbroken chat experience.

- **Core Goal**: Allow users to return to a long conversation and find specific decisions, tasks, entities, or sacred notes faster than scrolling or Ctrl+F.
- **Scope**: Dual-pane workspace (Chat Feed in Pane 1; Detail cards, Todo board, Entity specs, Decision logs, and Sacred Notes in Pane 2).
- **Non-goal**: Not a model memory system across sessions — it is purely a navigation & structured backlink layer over conversation history.

---

## 2. The Unified Page Model
Everything mentionable and addressable in the system is a **Page**:
- `id`: string
- `type`: `message` | `todo` | `decision` | `entity` | `note`
- `title`: short title (40–50 characters max, editable, auto-truncated)
- `content`: full text / body content
- `created_at`: timestamp
- `done` / `starred`: boolean (for `todo` type)
- `version`: string / number (for `entity` versioning)

### Raw Tag Syntax
All raw text representations maintain canonical bracket syntax:
- `[@Entity Title]`
- `[@todo: Task Description]`
- `[@decision: Architectural Decision]`
- `[@note: Note Title]`
- `[@message: Message Title]`

### Rendering by Type & Pill Colors
- `message` (conversation page turn): rendered with `#e0f2fe` (Pastel Blue) pill color, icon `📄`.
- `entity` (tracked entity page): rendered with `#e4d3fd` (Pastel Purple) pill color, icon `🏷️`.
- `todo` (action item page): rendered with `#dcfce7` (Pastel Green) pill color, icon `✓`.
- `decision` (agreed decision page): rendered with `#fef08a` (Pastel Yellow) pill color, icon `⚡`.
- `note` (sacred human note page): rendered with `#fee2e2` (Pastel Red) pill color, icon `📝` / Red `📄`.

---

## 3. Primitives & Extraction Logic
1. **Entities (`type: entity`)**:
   - Tracked recurring concepts, tools, people, or evolving documents (e.g. `@Stripe`, `@Pitch`).
   - **Created manually by the user only** via text selection floating toolbar — NEVER auto-detected by the LLM model.
   - Supports primary versioning, snapshot history, and "Promote to Version" bridge actions.
2. **Todos (`type: todo`)**:
   - Actionable next steps (`@todo:`).
   - Created automatically by LLM classification during response generation or asserted manually by user.
3. **Decisions (`type: decision`)**:
   - Agreed trade-offs, rules, or constraints (`@decision:`).
   - Created automatically by LLM classification during response generation or asserted manually by user.
4. **Sacred Notes (`type: note`)**:
   - Dedicated human scratchpad notes (`@note:`).
   - Strictly isolated from automated AI modifications. Created and managed directly by the user.

---

## 4. Deterministic Mentions & Backlinks
- **Mentions (`Mention` schema)**:
  - `id`, `target_page_id`, `source_page_id`, `span_start`, `span_end`, `snippet`, `source` (`auto` | `manual`), `created_at`
- **Closed-List Lookup**: Mentioning an existing entity, todo, decision, or note is ALWAYS a deterministic lookup against existing pages, never a spontaneous duplicate creation event.
- **Backlink View**: Clicking an entity pill or mention opens its compact detail card showing excerpts (surrounding text span highlighted). Clicking an excerpt jumps directly to that page in the chat feed and highlights it.
- **Orphaned Mentions**: If source page text changes and tagged substring disappears, mention is marked orphaned (`orphaned: true`) and surfaced faintly rather than vanishing silently.

---

## 5. UI Components & Interaction Features
- **Dual-Pane Split Workspace**: Pane 1 (left) holds continuous chat thread feed; Pane 2 (right) holds detail cards, todo boards, entity specs, decision logs, and sacred notes.
- **Real-time `@` Mention Autocomplete**: Triggers popover suggestions filtered by prefix (`@todo:`, `@decision:`, `@note:`, `@entity`).
- **Floating Selection Toolbar**: Appears on text selection. Category-first search-as-you-type (`Entity` / `Todo` / `Decision` / `Note`) against existing pages with pinned `+ Create new` option. Untruncated copy mapping (`[@Full Title]`).
- **Title Constraints**: 40–50 characters max limit. Enforced both as an LLM prompt constraint and hard-truncated at the parser/DB layer (`slice(0, 50)`). Editable inline after creation.
- **Graceful Degradation**: Malformed or unclosed tag syntax mid-stream renders as plain visible text, never dropping content or crashing.

---

## 6. Tech Stack & Commands
- **Framework**: Next.js 16 (App Router with Turbopack), React 19, TypeScript 5
- **Styling**: Tailwind CSS (zinc/indigo/emerald/amber color palette)
- **Editor Engine**: Tiptap / ProseMirror
- **Icons**: `lucide-react`

### Commands
- Dev server: `npm run dev`
- Typecheck: `npx tsc --noEmit`
- Build: `npm run build`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


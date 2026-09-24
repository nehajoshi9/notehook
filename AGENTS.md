# AGENTS.md — Planet Scribe (V1 Spec)

## 1. Project Overview & Philosophy
Planet Scribe is a lightweight navigation layer over long AI-assisted conversations. Important decisions and action items are surfaced automatically, while entities and recurring concepts are tracked manually by the user — all within a clean, unbroken chat experience.

- **Core Goal**: Allow users to return to a long conversation and find specific decisions, tasks, or tracked concepts faster than scrolling or Ctrl+F.
- **Scope (V1)**: Flat list of pages (no project grouping, no cross-conversation linking).
- **Non-goal (V1)**: Not a model memory system across sessions — it is purely a navigation & structured backlink layer over conversation history.

---

## 2. The Unified Page Model
Everything mentionable and addressable in the system is a **Page**:
- `id`: string
- `type`: `message` | `todo` | `decision` | `entity`
- `title`: short title (40–50 characters max, editable, auto-truncated)
- `content`: full text / body content
- `created_at`: timestamp
- `done` / `starred`: boolean (for `todo` type)

### Rendering by Type & Pill Colors
- `message` (conversation page turn): rendered with `#e0f2fe` (Pastel Blue) pill color.
- `entity` (tracked entity page): rendered with `#e4d3fd` (Pastel Purple) pill color.
- `todo` (action item page): rendered with `#dcfce7` (Pastel Green) pill color.
- `decision` (agreed decision page): rendered with `#fee2e2` (Pastel Red) pill color.

---

## 3. Primitives & Extraction Logic
1. **Entities (`type: entity`)**:
   - Tracked recurring concepts, tools, people, or evolving documents (e.g. `@Stripe`, `@Pitch`).
   - **Created manually by the user only** via text selection floating toolbar — NEVER auto-detected by the LLM model.
   - Once created, mentionable by user or model.
2. **Todos (`type: todo`)**:
   - Actionable next steps (`@todo:`).
   - Created automatically by LLM classification during response generation or asserted manually by user.
3. **Decisions (`type: decision`)**:
   - Agreed trade-offs, rules, or constraints (`@decision:`).
   - Created automatically by LLM classification during response generation or asserted manually by user.

---

## 4. Deterministic Mentions & Backlinks
- **Mentions (`Mention` schema)**:
  - `id`, `target_page_id`, `source_page_id`, `span_start`, `span_end`, `snippet`, `source` (`auto` | `manual`), `created_at`
- **Closed-List Lookup**: Mentioning an existing entity, todo, or decision is ALWAYS a deterministic lookup against existing pages, never a spontaneous duplicate creation event.
- **Backlink View**: Clicking an entity pill or mention opens its compact card showing excerpts (surrounding text span highlighted) rather than full notes. Clicking an excerpt jumps directly to that page in the chat feed and highlights it.
- **Orphaned Mentions**: If source page text changes and tagged substring disappears, mention is marked orphaned (`orphaned: true`) and surfaced faintly rather than vanishing silently.

---

## 5. Floating Toolbar & Title Constraints
- **Floating Toolbar**: Appears on text selection. Category-first search-as-you-type (`Entity` / `Todo` / `Decision`) against existing pages, with pinned `+ Create new` option.
- **Title Constraints**: 40–50 characters max limit. Enforced both as an LLM prompt constraint and hard-truncated at the parser/DB layer (`slice(0, 50)`). Editable inline after creation.
- **Graceful Degradation**: Malformed or unclosed tag syntax mid-stream renders as plain visible text, never dropping content or crashing.


---

## 6. Tech Stack & Commands
- **Framework**: Next.js (App Router), React 19, TypeScript
- **Styling**: Tailwind CSS (Vanilla CSS & Tailwind classes, zinc/indigo/emerald/amber color palette)
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


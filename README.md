# 🪝 Notehook

> **The Navigation & Knowledge Layer for Long AI-Assisted Conversations**

![Next.js](https://img.shields.io/badge/Next.js-16_Turbopack-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38bdf8?style=flat-square&logo=tailwind-css)

---

## 💡 Why Notehook? (Product Vision & Utility)

In standard AI chat interfaces (ChatGPT, Claude, Cursor), long technical conversations suffer from severe **"Chat Amnesia"**:
1. **Buried Decisions**: Critical architectural trade-offs made 30 messages ago get lost under walls of text.
2. **Forgotten Action Items**: Next steps (`[@todo: ...]`) generated during brainstorming disappear unless manually copy-pasted into external task trackers.
3. **Fragmented Concepts**: Recurring entities, project terms, and key tools have no centralized source of truth or aggregated backlinks.
4. **Frictional Search**: Native `Ctrl+F` only matches raw text strings—it provides zero backlink context, structured decision logs, or status tracking.

**Notehook** solves this by layering a **fluid dual-pane knowledge system** over your conversation history. It turns ephemeral chat turns into structured, bi-directionally linked workspace pages without breaking your conversation flow.

---

## ✨ Key Features

- ⚡ **AI-Assisted Extraction**: Notehook automatically extracts decisions and action items from conversations. Entities are human-curated workspace objects that users can create, reference, version, and link to conversation content.
- 📑 **Dual-Pane Split Workspace**: Continuous chat thread feed in Pane 1 (left); detail cards, todo boards, entity specs, and decision logs in Pane 2 (right).
- 🔍 **Real-time `@` Mention Autocomplete**: Typing `@` in chat inputs or note editors triggers popover suggestions filtered by prefix (`@todo:`, `@decision:`, `@note:`, `@entity`) with keyboard navigation.
- 🏷️ **Clean Visual Reference Pills**: Raw bracketed tags (`[@todo: ...]`, `[@decision: ...]`) render visually as `@Title` with distinct accessibility icons (`✓`, `⚡`, `📄`, `🏷️`).
- ✍️ **Floating Selection Toolbar**: Select text anywhere to tag entities, tasks, or decisions with 60fps selection positioning and under-the-hood untruncated copy mapping (`[@Full Title]`).
- 📜 **Entity Version History & Spec Evolution**: Track evolving entity specs with primary versioning, snapshot history, and "Promote to Version" bridge actions.
- 📝 **Sacred Notes System**: Dedicated human scratchpad notes isolated from automated AI modifications.
- 🎯 **Instant Context Jumping & Backlinks**: Click any mention excerpt in the right pane to instantly scroll to the exact historical message turn with highlighted visual feedback.
- 📋 **Interactive Todo Board & Decision Log**: Dedicated index views for viewing, starring, completing, filtering, and organizing action items and ADRs.


---

## 📐 Architecture & Unified Page Model

Everything in Notehook is represented by a unified **Page Primitive**:
- `message`: Turn-by-turn conversation messages with prompt & response.
- `todo`: Action items tracked with star, completion state, and source backlinks.
- `decision`: Logged trade-offs, architecture decisions, and status badges.
- `entity`: Custom tracked workspace concepts with version snapshots.
- `note`: Sacred human scratchpad notes strictly isolated from AI modification.

### Raw Tag Format Guidelines
All raw text representations of reference tags maintain canonical bracket syntax:
- `[@Entity Title]`
- `[@todo: Task Description]`
- `[@decision: Architectural Decision]`
- `[@note: Note Title]`
- `[@message: Message Title]`

---

## 🛠️ Getting Started

### Installation & Running Locally

```bash
# Clone the repository
git clone https://github.com/your-username/notehook.git
cd notehook

# Install dependencies
npm install

# Start the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔮 Roadmap & Future Expansion

- [x] **Phase 1 & 2**: Dual-pane split navigation, real-time `@` autocomplete, reference pill rendering, context injection bridge, and Sacred Notes.
- [x] **Phase 3**: Interactive Todo Board, Decision viewer, floating selection toolbar, entity versioning, and title collision resolution.
- [ ] **Phase 4**: Multi-session knowledge graphs, Git export formatting (`notehook/entities/`, `notehook/decisions/`), and 2-way sync with Linear/GitHub/Notion.

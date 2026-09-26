import { Page, Mention, Workspace } from './types';

export const WELCOME_NOTE_CONTENT = `Have you ever had a long, productive brainstorm with an AI, only to find that important decisions, specs, and to-do items got lost under a mountain of scrolling?

**Notehook solves that.** It gives your AI conversations a structured, dual-pane workspace where your ideas, decisions, tasks, and notes stay organized, linked, and easy to find—without breaking the flow of your chat.

---

## 1. The Dual-Pane Workspace

Notehook gives you two side-by-side panes so you can chat and organize at the same time:

- **Left Pane (Chat Stream)**: Your continuous conversation with the AI assistant. Ask questions, explore ideas, and generate content here.
- **Right Pane (Knowledge Workspace)**: Where you inspect and edit your cards, read entity specifications, manage to-do boards, check decision logs, and write notes.
- **Pane Controls**: Click any item or mention pill to open it on the right. Use the swap button (**⇄**) in the header to switch pane positions, or use the history arrows (**←** / **→**) to step back and forth through pages you've viewed.

---

## 2. The 5 Types of Pages

Everything in Notehook is a **Page**. Each page has a short reference tag (like \`[@Pitch Deck]\` or \`[@todo: Set up database]\`) so you can link to it anywhere.

### 🏷️ Entities
**What they are**: Key concepts, features, APIs, project specs, or evolving documents.  
**How they work**: Entities are created manually by you (never hallucinated by the AI). They support full version history, allowing you to save snapshots as your project evolves and promote any version to the canonical main view.  
*Examples: \`[@Stripe Billing & Webhooks]\`, \`[@Auth & Session Architecture]\`, \`[@Design System & UI Tokens]\`*

### 📝 Notes
**What they are**: Your private scratchpads, meeting takeaways, and personal thoughts.  
**How they work**: Notes are your dedicated space. The AI will never modify or overwrite your notes, so you can freely jot down thoughts, draft outlines, and keep snippets handy.  
*Examples: \`[@note: Launch Strategy & Pricing Matrix]\`*

### ⚡ Decisions
**What they are**: Agreed trade-offs, architecture choices, technical constraints, and conclusions.  
**How they work**: Decisions can be surfaced automatically when you and the AI settle on a choice in chat, or you can add them manually. They populate your workspace's Decision Log so you never have to re-debate settled questions.  
*Examples: \`[@decision: Use Next.js 16 App Router & Server Actions]\`, \`[@decision: Store Stripe session IDs in Redis for idempotency]\`*

### ✅ Todos
**What they are**: Actionable next steps and task items.  
**How they work**: Todos can be created automatically during conversation turns or added by hand. Check them off when completed or star high-priority tasks to keep them prominent on your Todo Board.  
*Examples: \`[@todo: Configure Stripe webhook endpoint in staging]\`, \`[@todo: Implement rate limiting on auth endpoints]\`*

### 📄 Messages
**What they are**: Saved chat turns and reasoning steps.  
**How they work**: Each turn in your conversation is addressable with its own prompt framing and linked references.  

### 🆔 Short IDs & Entity Versioning
Every page is automatically assigned a concise **Short ID** handle:
- **\`e1\`, \`e2\`...** for Entities
- **\`n1\`, \`n2\`...** for Notes
- **\`d1\`, \`d2\`...** for Decisions
- **\`t1\`, \`t2\`...** for Todos
- **\`m1\`, \`m2\`...** for Messages

**Referencing Specific Entity Versions (\`short_id.version\` or \`title.version\`)**:  
For Entities with snapshot history, you can reference a specific version by appending \`.version_number\` (e.g. \`[@e1.3]\` or \`[@Stripe Billing & Webhooks.3]\`). Referencing this will target and load that exact historical version!

---

## 3. How to Navigate & Get Things Done

- **\`@\` Mention Autocomplete**: Type \`@\` anywhere in the chat prompt or within notes to search and link existing pages on the fly (e.g. \`@Stripe\`, \`@todo:\`, \`@decision:\`).
- **Floating Highlight Toolbar**: Select any text in your chat messages or notes. A quick toolbar will pop up, letting you tag existing items or turn that snippet into a brand new Entity, Note, Decision, or Todo in one click.
- **Interactive Backlinks & Excerpts**: Every time you mention a page, Notehook tracks where it was referenced. Clicking any mention pill or excerpt jumps directly to the exact point in the chat where it was discussed.
- **Command Palette (\`⌘K\` or \`Ctrl+K\`)**: Press \`⌘K\` anytime to open the universal search. Quickly jump to any note, entity, decision, or workspace action.
- **Multiple Workspaces**: Keep separate projects isolated. Switch workspaces or create new ones using the workspace switcher in the header or by visiting the **Workspace Dashboard** (\`/dashboard\`).
- **Pinning Key Context (📌)**: Pin up to 3 essential pages to keep them top-of-mind for the AI during long conversations.

---

## 🔒 Privacy & Sensitive Data Disclaimer

Notehook operates using Google's Gemini API free tier. Under Google's free-tier terms, data submitted to the API may be logged or used by Google for model training and service quality improvements.

**Please do not submit sensitive personal information, passwords, private keys, financial details, or confidential data.**

---

*Tip: Feel free to explore the tabs on the right, click any pastel mention pill to jump to its source in chat, or ask a question in Pane 1!*
`;

export function createDefaultWelcomePage(): Page {
  return {
    id: 'seed-welcome-note',
    short_id: 'n1',
    type: 'note',
    title: 'Welcome to Notehook! 👋',
    content: WELCOME_NOTE_CONTENT,
    created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
  };
}

const now = Date.now();
const timeMinusHours = (hours: number) => new Date(now - hours * 60 * 60 * 1000).toISOString();

export const SEED_PAGES: Page[] = [
  createDefaultWelcomePage(),
];

export const SEED_MENTIONS: Mention[] = [];

export const DEFAULT_DEMO_WORKSPACE_NAME = 'My Workspace';

export function createDefaultDemoWorkspace(): Workspace {
  const nowIso = new Date().toISOString();
  return {
    id: 'ws-default-workspace',
    name: DEFAULT_DEMO_WORKSPACE_NAME,
    created_at: nowIso,
    updated_at: nowIso,
    last_opened_at: nowIso,
    pages: [createDefaultWelcomePage()],
    mentions: [],
    pinnedPageIds: ['seed-welcome-note'],
  };
}


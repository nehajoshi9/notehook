import { Page, Mention } from './types';

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
*Examples: \`[@Stripe Integration]\`, \`[@User Onboarding Flow]\`, \`[@Design System]\`*

### 📝 Notes
**What they are**: Your private scratchpads, meeting takeaways, and personal thoughts.  
**How they work**: Notes are your dedicated space. The AI will never modify or overwrite your notes, so you can freely jot down thoughts, draft outlines, and keep snippets handy.  
*Examples: \`[@note: Weekly Sync Takeaways]\`, \`[@note: Marketing Angles]\`*

### ⚡ Decisions
**What they are**: Agreed trade-offs, architecture choices, technical constraints, and conclusions.  
**How they work**: Decisions can be surfaced automatically when you and the AI settle on a choice in chat, or you can add them manually. They populate your workspace's Decision Log so you never have to re-debate settled questions.  
*Examples: \`[@decision: Use Next.js App Router]\`, \`[@decision: Max file upload capped at 10MB]\`*

### ✅ Todos
**What they are**: Actionable next steps and task items.  
**How they work**: Todos can be created automatically during conversation turns or added by hand. Check them off when completed or star high-priority tasks to keep them prominent on your Todo Board.  
*Examples: \`[@todo: Verify OAuth credentials]\`, \`[@todo: Benchmark API response time]\`*

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

**Referencing Specific Entity Versions (\`short_id.version\`)**:  
For Entities with snapshot history, you can reference a specific version by appending \`.version_number\` (e.g. \`[@e1.2]\`). Referencing \`[@e1.2]\` will target and load version 2 of Entity \`e1\`, allowing you to inspect historical specifications or prompt the AI with a past version!

You can type \`@e1\` or \`[@e1]\` anywhere as a fast shorthand to link directly to any page without typing out its full title.

---

## 3. How to Navigate & Get Things Done

- **\`@\` Mention Autocomplete**: Type \`@\` anywhere in the chat prompt or within notes to search and link existing pages on the fly (e.g. \`@Stripe\`, \`@todo:\`, \`@decision:\`).
- **Floating Highlight Toolbar**: Select any text in your chat messages or notes. A quick toolbar will pop up, letting you tag existing items or turn that snippet into a brand new Entity, Note, Decision, or Todo in one click.
- **Interactive Backlinks & Excerpts**: Every time you mention a page, Notehook tracks where it was referenced. Clicking any mention pill or excerpt jumps directly to the exact point in the chat where it was discussed.
- **Command Palette (\`⌘K\` or \`Ctrl+K\`)**: Press \`⌘K\` anytime to open the universal search. Quickly jump to any note, entity, decision, or workspace action.
- **Multiple Workspaces**: Keep separate projects isolated. Switch workspaces or create new ones using the workspace switcher in the header or by visiting the **Workspace Dashboard** (\`/dashboard\`).
- **Pinning Key Context (📌)**: Pin up to 3 essential pages to keep them top-of-mind for the AI during long conversations.

---

## 4. Common Use Cases

- **Living Entity Specs & Versioning**: Highlight text in chat to create living entity documents (like \`@API Schema\`, \`@PRD\`, or \`@Data Model\`). As requirements evolve across turns, save snapshot versions (e.g. \`[@API Schema.2]\`) or promote new revisions to canonical without losing prior versions.
- **Product & Feature Planning**: Brainstorm user stories in chat, save finalized feature requirements as versioned **Entities**, and track implementation steps as **Todos**.
- **Software Architecture**: Discuss system trade-offs with AI, record agreed approaches in **Decisions**, and keep living architectural specs updated.
- **Research & Strategy**: Analyze articles or data in chat, write summaries into **Notes**, and link related concepts together with \`@mentions\`.

---

## 🔒 Privacy & Sensitive Data Disclaimer

Notehook operates using Google's Gemini API free tier. Under Google's free-tier terms, data submitted to the API may be logged or used by Google for model training and service quality improvements.

**Please do not submit sensitive personal information, passwords, private keys, financial details, or confidential data.**

---

*Tip: Feel free to edit or pin this welcome note, highlight some text to create your first Entity, or start a new conversation in Pane 1!*
`;

export function createDefaultWelcomePage(): Page {
  return {
    id: `welcome-note-${Date.now()}`,
    short_id: 'n1',
    type: 'note',
    title: 'Welcome to Notehook! 👋',
    content: WELCOME_NOTE_CONTENT,
    created_at: new Date().toISOString(),
  };
}

export const SEED_PAGES: Page[] = [
  {
    id: 'seed-welcome-note',
    short_id: 'n1',
    type: 'note',
    title: 'Welcome',
    content: WELCOME_NOTE_CONTENT,
    created_at: new Date().toISOString(),
  },
];

export const SEED_MENTIONS: Mention[] = [];

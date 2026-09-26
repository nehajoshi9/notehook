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
  // Welcome Guide Note (n1)
  {
    id: 'seed-welcome-note',
    short_id: 'n1',
    type: 'note',
    title: 'Welcome to Notehook! 👋',
    content: WELCOME_NOTE_CONTENT,
    created_at: timeMinusHours(4),
    pinned: true,
  },

  // Sacred Launch Strategy Note (n2)
  {
    id: 'note-launch-strategy',
    short_id: 'n2',
    type: 'note',
    title: 'Launch Strategy & Pricing Matrix',
    content: `# Launch Strategy & Pricing Matrix

Private workspace planning scratchpad for Q2 product launch.

## Target Milestones:
- **Week 1**: Complete [@Auth & Session Architecture] verification and staging dry-run.
- **Week 2**: Hook up [@Stripe Billing & Webhooks] with production webhook endpoints.
- **Week 3**: Finalize [@decision: Use Next.js 16 App Router & Server Actions] optimizations and execute [@todo: Implement rate limiting on auth endpoints].

## Pricing Tiers:
| Tier | Price | Highlights |
| :--- | :--- | :--- |
| **Free** | $0/mo | 3 workspaces, 50 AI turns/mo |
| **Pro** | $29/mo | Unlimited workspaces, Gemini 1.5 Flash, Version history |
| **Team** | $99/mo | Shared workspaces, Custom LLM keys, Dedicated support |

> Note: All subscribers get instant access to living entity specifications and backlink search.`,
    created_at: timeMinusHours(2.5),
    pinned: true,
  },

  // Entity 1: Stripe Billing & Webhooks (e1) - with 3 versions
  {
    id: 'entity-stripe',
    short_id: 'e1',
    type: 'entity',
    title: 'Stripe Billing & Webhooks',
    current_version_num: 3,
    canonical_version_id: 'ver-stripe-3',
    created_at: timeMinusHours(3.5),
    updated_at: timeMinusHours(1.2),
    pinned: true,
    content: `# Production Webhook Architecture (v3)

Production-ready resilient webhook handler with Redis idempotency and signature validation.

### Core Invariants:
1. **HMAC Signature Check**: Verify \`stripe-signature\` header against \`STRIPE_WEBHOOK_SECRET\`.
2. **Idempotency Guard**: Acquire atomic Redis lock using \`event.id\` with 24-hour TTL before processing.
3. **Event Handlers**:
   - \`checkout.session.completed\`: Provision workspace seats and initialize customer record.
   - \`invoice.payment_succeeded\`: Extend active billing period timestamp.
   - \`customer.subscription.deleted\`: Downgrade workspace to free tier.
4. **Dead Letter Queue (DLQ)**: Failed events retry up to 5 times with exponential backoff before alerting.`,
    versions: [
      {
        id: 'ver-stripe-1',
        entity_id: 'entity-stripe',
        version_num: 1,
        title: 'Stripe Checkout v1',
        content: `# Stripe Checkout v1

Initial implementation uses standard Stripe Checkout sessions for one-time payments.

- API Endpoint: \`/api/checkout\`
- Success Redirect: \`/dashboard?session_id={CHECKOUT_SESSION_ID}\`
- Cancel Redirect: \`/pricing\``,
        created_at: timeMinusHours(3.5),
        is_canonical: false,
      },
      {
        id: 'ver-stripe-2',
        entity_id: 'entity-stripe',
        version_num: 2,
        title: 'Stripe Subscriptions & Tiers',
        content: `# Stripe Subscriptions v2

Upgraded billing engine to handle monthly/annual recurring subscriptions.

- Plans: Starter ($19/mo), Pro ($49/mo), Enterprise ($199/mo)
- Metered billing overages tracked via Stripe Usage Records API
- Customer Portal integration for self-serve cancellation and payment method updates.`,
        created_at: timeMinusHours(2.5),
        is_canonical: false,
      },
      {
        id: 'ver-stripe-3',
        entity_id: 'entity-stripe',
        version_num: 3,
        title: 'Production Webhook Architecture',
        content: `# Production Webhook Architecture (v3)

Production-ready resilient webhook handler with Redis idempotency and signature validation.

### Core Invariants:
1. **HMAC Signature Check**: Verify \`stripe-signature\` header against \`STRIPE_WEBHOOK_SECRET\`.
2. **Idempotency Guard**: Acquire atomic Redis lock using \`event.id\` with 24-hour TTL before processing.
3. **Event Handlers**:
   - \`checkout.session.completed\`: Provision workspace seats and initialize customer record.
   - \`invoice.payment_succeeded\`: Extend active billing period timestamp.
   - \`customer.subscription.deleted\`: Downgrade workspace to free tier.
4. **Dead Letter Queue (DLQ)**: Failed events retry up to 5 times with exponential backoff before alerting.`,
        created_at: timeMinusHours(1.2),
        is_canonical: true,
      },
    ],
  },

  // Entity 2: Auth & Session Architecture (e2) - with 2 versions
  {
    id: 'entity-auth',
    short_id: 'e2',
    type: 'entity',
    title: 'Auth & Session Architecture',
    current_version_num: 2,
    canonical_version_id: 'ver-auth-2',
    created_at: timeMinusHours(3.8),
    updated_at: timeMinusHours(2.2),
    content: `# Supabase SSR Auth & RLS (v2)

Multi-tenant security architecture with encrypted HTTP-only session cookies.

### Security Model:
- **PKCE Flow**: Next.js App Router Server Actions exchange auth codes securely without leaking credentials to client JS.
- **Session Storage**: \`sb-access-token\` and \`sb-refresh-token\` set as \`SameSite=Lax\`, \`Secure\`, \`HttpOnly\`.
- **Database RLS Policies**: Every table enforces \`auth.uid() = user_id\` or workspace membership matching.
- **Rate Limiting**: Auth endpoints protected via Redis sliding-window limiter (10 req/min/IP).`,
    versions: [
      {
        id: 'ver-auth-1',
        entity_id: 'entity-auth',
        version_num: 1,
        title: 'JWT Bearer Token Scheme',
        content: `# JWT Auth Spec (v1 - Deprecated)

Initial client-side token storage scheme.

- Access tokens stored in localStorage
- Refresh token in memory
- Vulnerable to XSS token theft; replaced by HTTP-only cookies in v2.`,
        created_at: timeMinusHours(3.8),
        is_canonical: false,
      },
      {
        id: 'ver-auth-2',
        entity_id: 'entity-auth',
        version_num: 2,
        title: 'Supabase SSR Auth & RLS',
        content: `# Supabase SSR Auth & RLS (v2)

Multi-tenant security architecture with encrypted HTTP-only session cookies.

### Security Model:
- **PKCE Flow**: Next.js App Router Server Actions exchange auth codes securely without leaking credentials to client JS.
- **Session Storage**: \`sb-access-token\` and \`sb-refresh-token\` set as \`SameSite=Lax\`, \`Secure\`, \`HttpOnly\`.
- **Database RLS Policies**: Every table enforces \`auth.uid() = user_id\` or workspace membership matching.
- **Rate Limiting**: Auth endpoints protected via Redis sliding-window limiter (10 req/min/IP).`,
        created_at: timeMinusHours(2.2),
        is_canonical: true,
      },
    ],
  },

  // Entity 3: Design System & UI Tokens (e3)
  {
    id: 'entity-design-system',
    short_id: 'e3',
    type: 'entity',
    title: 'Design System & UI Tokens',
    current_version_num: 1,
    canonical_version_id: 'ver-design-1',
    created_at: timeMinusHours(3.0),
    updated_at: timeMinusHours(3.0),
    content: `# Design System & UI Guidelines

Dual-pane layout specifications and pastel semantic color hierarchy.

### Semantic Tag Colors:
- **Todo (\`#dcfce7\`)**: Pastel Green (Emerald icon)
- **Decision (\`#ffe1baff\`)**: Pastel Orange (Zap icon)
- **Entity (\`#e4d3fd\`)**: Pastel Purple (Tag icon)
- **Note (\`#fee2e2\`)**: Pastel Red (FileText icon)
- **Message (\`#e0f2fe\`)**: Pastel Sky Blue (MessageSquare icon)

### Layout Rules:
- Desktop: Split 50/50 dual-pane with independent scroll preservation.
- Title Truncation: Hard cap at 50 characters for scannability.
- Micro-interactions: Plastic inset shadows with smooth hover un-truncation.`,
    versions: [
      {
        id: 'ver-design-1',
        entity_id: 'entity-design-system',
        version_num: 1,
        title: 'Design System & UI Tokens',
        content: `# Design System & UI Guidelines

Dual-pane layout specifications and pastel semantic color hierarchy.

### Semantic Tag Colors:
- **Todo (\`#dcfce7\`)**: Pastel Green (Emerald icon)
- **Decision (\`#ffe1baff\`)**: Pastel Orange (Zap icon)
- **Entity (\`#e4d3fd\`)**: Pastel Purple (Tag icon)
- **Note (\`#fee2e2\`)**: Pastel Red (FileText icon)
- **Message (\`#e0f2fe\`)**: Pastel Sky Blue (MessageSquare icon)

### Layout Rules:
- Desktop: Split 50/50 dual-pane with independent scroll preservation.
- Title Truncation: Hard cap at 50 characters for scannability.
- Micro-interactions: Plastic inset shadows with smooth hover un-truncation.`,
        created_at: timeMinusHours(3.0),
        is_canonical: true,
      },
    ],
  },

  // Decision 1 (d1)
  {
    id: 'decision-nextjs',
    short_id: 'd1',
    type: 'decision',
    title: 'Use Next.js 16 App Router & Server Actions',
    content: 'Decided to adopt Next.js 16 with App Router, Turbopack, and Server Actions for fast streaming and optimized zero-JS server components.',
    created_at: timeMinusHours(3.2),
  },

  // Decision 2 (d2)
  {
    id: 'decision-redis-idempotency',
    short_id: 'd2',
    type: 'decision',
    title: 'Store Stripe session IDs in Redis for idempotency',
    content: 'Prevent double-processing of Stripe webhook events (such as checkout.session.completed) using atomic Redis SETNX with 24-hour expiration.',
    created_at: timeMinusHours(2.1),
  },

  // Decision 3 (d3)
  {
    id: 'decision-title-constraint',
    short_id: 'd3',
    type: 'decision',
    title: 'Enforce 50-character title constraint across all pages',
    content: 'Keep all entity, todo, decision, and note titles concise (under 50 characters) to optimize dual-pane tab headers, command palette search, and mention pills.',
    created_at: timeMinusHours(1.4),
  },

  // Decision 4 (d4)
  {
    id: 'decision-dual-pane-split',
    short_id: 'd4',
    type: 'decision',
    title: 'Dual-pane split ratio 50/50 with responsive collapse',
    content: 'Dual-pane workspace defaults to 50/50 split on desktop screens (>=1024px) with persistent pane memory and responsive single-pane drawer mode for mobile.',
    created_at: timeMinusHours(1.0),
  },

  // Todo 1 (t1) - Completed
  {
    id: 'todo-stripe-staging',
    short_id: 't1',
    type: 'todo',
    title: 'Configure Stripe webhook endpoint in staging',
    content: 'Add the Stripe webhook signing secret (STRIPE_WEBHOOK_SECRET) to staging environment variables and test webhook receipt.',
    done: true,
    starred: false,
    created_at: timeMinusHours(3.2),
  },

  // Todo 2 (t2) - Starred
  {
    id: 'todo-rate-limiting',
    short_id: 't2',
    type: 'todo',
    title: 'Implement rate limiting on auth endpoints',
    content: 'Configure Upstash Redis token bucket rate limiting on /api/auth routes (max 10 attempts / minute per IP).',
    done: false,
    starred: true,
    created_at: timeMinusHours(2.1),
  },

  // Todo 3 (t3) - Starred
  {
    id: 'todo-e2e-tests',
    short_id: 't3',
    type: 'todo',
    title: 'Add E2E tests for entity version promotion',
    content: 'Write Playwright end-to-end tests validating version snapshot creation, rollback, and promotion to canonical view.',
    done: false,
    starred: true,
    created_at: timeMinusHours(1.4),
  },

  // Todo 4 (t4) - Open
  {
    id: 'todo-benchmark-ttft',
    short_id: 't4',
    type: 'todo',
    title: 'Benchmark TTFT on Gemini streaming responses',
    content: 'Profile Time-To-First-Token latency across streaming chunks and verify smooth Markdown AST hydration.',
    done: false,
    starred: false,
    created_at: timeMinusHours(0.8),
  },

  // Message 1 (m1)
  {
    id: 'msg-stack-planning',
    short_id: 'm1',
    type: 'message',
    role: 'assistant',
    title: 'SaaS Stack & Architecture Planning',
    user_prompt: "Let's outline our architecture for the new SaaS launch. What stack should we choose for auth, payments, and real-time data?",
    content: `Great plan! Here is the recommended technical foundation for our SaaS launch:

### 1. Framework & Server Architecture
We should build on Next.js 16 with Turbopack and React 19 Server Components. This gives us lightning-fast streaming and zero client-bundle overhead for static views.
- Agreement: [@decision: Use Next.js 16 App Router & Server Actions]

### 2. Authentication & Data Security
We will implement [@Auth & Session Architecture] backed by Supabase with Row-Level Security (RLS) and HTTP-only session cookies.

### 3. Payment Processing & Billing
We will integrate [@Stripe Billing & Webhooks] to handle checkout sessions, usage-based subscriptions, and customer self-serve billing.

### 4. Immediate Action Item
- First step: [@todo: Configure Stripe webhook endpoint in staging]`,
    created_at: timeMinusHours(3.2),
  },

  // Message 2 (m2)
  {
    id: 'msg-stripe-webhooks',
    short_id: 'm2',
    type: 'message',
    role: 'assistant',
    title: 'Stripe Webhook Idempotency & Subscriptions',
    user_prompt: 'How should we handle Stripe subscription webhooks reliably without double-charging or dropped events?',
    content: `Handling webhooks reliably in production requires strict idempotency and cryptographic signature validation:

### Recommended Architecture:
1. **Cryptographic Validation**: Verify every incoming payload with \`stripe.webhooks.constructEvent\` using our webhook signing secret.
2. **Idempotent Lock**: Before executing database updates, store the event ID in Redis with an atomic TTL lock. This completely eliminates duplicate processing during Stripe retries:
   - Agreement: [@decision: Store Stripe session IDs in Redis for idempotency]
3. **Living Specification**: I have referenced the updated specification in [@Stripe Billing & Webhooks.3].

### Next Security Step:
- Critical task: [@todo: Implement rate limiting on auth endpoints]`,
    created_at: timeMinusHours(2.1),
  },

  // Message 3 (m3)
  {
    id: 'msg-design-system',
    short_id: 'm3',
    type: 'message',
    role: 'assistant',
    title: 'Design System & Dual-Pane UI Polish',
    user_prompt: 'What are the key design rules for our dual-pane layout and pastel badge pill color system?',
    content: `Here is the design specification for Notehook's dual-pane interface:

### Dual-Pane Layout & Aesthetics
- **Layout Agreement**: [@decision: Dual-pane split ratio 50/50 with responsive collapse]
- **Design Token Spec**: Review the token definitions in [@Design System & UI Tokens].
- **Concise Titles**: To keep pills elegant in both panes, we established [@decision: Enforce 50-character title constraint across all pages].

### Cross References & Testing
- Refer to our strategy in [@note: Launch Strategy & Pricing Matrix].
- High-priority task: [@todo: Add E2E tests for entity version promotion]`,
    created_at: timeMinusHours(1.0),
  },
];

export const SEED_MENTIONS: Mention[] = [
  // Turn 1 Mentions (msg-stack-planning)
  {
    id: 'men-seed-1',
    target_page_id: 'entity-auth',
    source_page_id: 'msg-stack-planning',
    snippet: 'We will implement [@Auth & Session Architecture] backed by Supabase with Row-Level Security',
    source: 'auto',
    created_at: timeMinusHours(3.2),
  },
  {
    id: 'men-seed-2',
    target_page_id: 'entity-stripe',
    source_page_id: 'msg-stack-planning',
    snippet: 'We will integrate [@Stripe Billing & Webhooks] to handle checkout sessions',
    source: 'auto',
    created_at: timeMinusHours(3.2),
  },
  {
    id: 'men-seed-3',
    target_page_id: 'decision-nextjs',
    source_page_id: 'msg-stack-planning',
    snippet: 'Agreement: [@decision: Use Next.js 16 App Router & Server Actions]',
    source: 'auto',
    created_at: timeMinusHours(3.2),
  },
  {
    id: 'men-seed-4',
    target_page_id: 'todo-stripe-staging',
    source_page_id: 'msg-stack-planning',
    snippet: 'First step: [@todo: Configure Stripe webhook endpoint in staging]',
    source: 'auto',
    created_at: timeMinusHours(3.2),
  },

  // Turn 2 Mentions (msg-stripe-webhooks)
  {
    id: 'men-seed-5',
    target_page_id: 'decision-redis-idempotency',
    source_page_id: 'msg-stripe-webhooks',
    snippet: 'Agreement: [@decision: Store Stripe session IDs in Redis for idempotency]',
    source: 'auto',
    created_at: timeMinusHours(2.1),
  },
  {
    id: 'men-seed-6',
    target_page_id: 'entity-stripe',
    source_page_id: 'msg-stripe-webhooks',
    snippet: 'I have referenced the updated specification in [@Stripe Billing & Webhooks.3].',
    source: 'auto',
    created_at: timeMinusHours(2.1),
  },
  {
    id: 'men-seed-7',
    target_page_id: 'todo-rate-limiting',
    source_page_id: 'msg-stripe-webhooks',
    snippet: 'Critical task: [@todo: Implement rate limiting on auth endpoints]',
    source: 'auto',
    created_at: timeMinusHours(2.1),
  },

  // Turn 3 Mentions (msg-design-system)
  {
    id: 'men-seed-8',
    target_page_id: 'decision-dual-pane-split',
    source_page_id: 'msg-design-system',
    snippet: 'Layout Agreement: [@decision: Dual-pane split ratio 50/50 with responsive collapse]',
    source: 'auto',
    created_at: timeMinusHours(1.0),
  },
  {
    id: 'men-seed-9',
    target_page_id: 'entity-design-system',
    source_page_id: 'msg-design-system',
    snippet: 'Design Token Spec: Review the token definitions in [@Design System & UI Tokens].',
    source: 'auto',
    created_at: timeMinusHours(1.0),
  },
  {
    id: 'men-seed-10',
    target_page_id: 'decision-title-constraint',
    source_page_id: 'msg-design-system',
    snippet: 'we established [@decision: Enforce 50-character title constraint across all pages].',
    source: 'auto',
    created_at: timeMinusHours(1.0),
  },
  {
    id: 'men-seed-11',
    target_page_id: 'note-launch-strategy',
    source_page_id: 'msg-design-system',
    snippet: 'Refer to our strategy in [@note: Launch Strategy & Pricing Matrix].',
    source: 'auto',
    created_at: timeMinusHours(1.0),
  },
  {
    id: 'men-seed-12',
    target_page_id: 'todo-e2e-tests',
    source_page_id: 'msg-design-system',
    snippet: 'High-priority task: [@todo: Add E2E tests for entity version promotion]',
    source: 'auto',
    created_at: timeMinusHours(1.0),
  },

  // Sacred Note Mentions (note-launch-strategy)
  {
    id: 'men-seed-13',
    target_page_id: 'entity-auth',
    source_page_id: 'note-launch-strategy',
    snippet: 'Complete [@Auth & Session Architecture] verification and staging dry-run.',
    source: 'manual',
    created_at: timeMinusHours(2.5),
  },
  {
    id: 'men-seed-14',
    target_page_id: 'entity-stripe',
    source_page_id: 'note-launch-strategy',
    snippet: 'Hook up [@Stripe Billing & Webhooks] with production webhook endpoints.',
    source: 'manual',
    created_at: timeMinusHours(2.5),
  },
  {
    id: 'men-seed-15',
    target_page_id: 'decision-nextjs',
    source_page_id: 'note-launch-strategy',
    snippet: 'Finalize [@decision: Use Next.js 16 App Router & Server Actions] optimizations',
    source: 'manual',
    created_at: timeMinusHours(2.5),
  },
  {
    id: 'men-seed-16',
    target_page_id: 'todo-rate-limiting',
    source_page_id: 'note-launch-strategy',
    snippet: 'execute [@todo: Implement rate limiting on auth endpoints].',
    source: 'manual',
    created_at: timeMinusHours(2.5),
  },
];

export const DEFAULT_DEMO_WORKSPACE_NAME = 'SaaS Platform & Launch';

export function createDefaultDemoWorkspace(): Workspace {
  const nowIso = new Date().toISOString();
  return {
    id: 'ws-demo-saas',
    name: DEFAULT_DEMO_WORKSPACE_NAME,
    created_at: timeMinusHours(4),
    updated_at: nowIso,
    last_opened_at: nowIso,
    pages: SEED_PAGES,
    mentions: SEED_MENTIONS,
    pinnedPageIds: ['seed-welcome-note', 'entity-stripe', 'note-launch-strategy'],
  };
}

# 🪝 Notehook

> **A Dual-Pane Navigation & Knowledge Layer for Long AI Conversations**

🚀 **Try it out live**: [https://notehook.vercel.app](https://notehook.vercel.app)

![Next.js](https://img.shields.io/badge/Next.js-16_Turbopack-black?style=flat-square&logo=next.js)
![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Auth_&_DB-3ECF8E?style=flat-square&logo=supabase)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38bdf8?style=flat-square&logo=tailwind-css)

---

## 💡 What is Notehook?

When having long, complex technical conversations with AI, context quickly gets lost. Architectural decisions get buried 40 turns deep, next steps generated during brainstorming fade into history, and recurring project concepts lack a single source of truth.

**Notehook** solves this by adding a fluid **dual-pane knowledge layer** over your AI chat experience:
- **Pane 1 (Left)**: Continuous AI chat thread feed with context-aware assistant responses.
- **Pane 2 (Right)**: Dynamic workspace inspector surfacing auto-extracted decisions, actionable tasks, versioned entity specifications, and isolated human notes.

It transforms long AI chats into an organized, bi-directionally linked workspace without breaking your conversation flow.

---

## ✨ Core Highlights

- 🌐 **Live Workspaces & Multi-Tenancy**: Organize independent project contexts, knowledge graphs, and backlink networks with Google OAuth sign-in and Supabase persistence.
- ⚡ **Automated Decision & Task Extraction**: AI model output automatically surfaces agreed trade-offs (`@decision:`) and action items (`@todo:`) into structured index boards.
- 🏷️ **Human-Curated Entity Tracking**: Track recurring tools, systems, or concepts (`@Entity`) with version snapshot history and version promotion tools.
- 📝 **Protected Notes Scratchpad**: Human notes strictly isolated from AI modifications—allowing you to keep personal ideas clean and untouched.
- 🔍 **Bi-Directional Context Backlinks**: Click any mention or excerpt in your workspace to instantly jump to the exact historical conversation turn with visual highlight feedback.
- 🎯 **Real-time `@` Autocomplete & Selection Toolbar**: Type `@` anywhere or select text to instantly tag, filter, or create new linked workspace items.

---

## 🛠️ Tech Stack & Architecture

- **Framework**: Next.js 16 (App Router + Turbopack) & React 19
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS (zinc/indigo/purple palette)
- **Database & Auth**: Supabase (PostgreSQL with Row-Level Security & Google OAuth)
- **Editor Engine**: Tiptap / ProseMirror

---

## 🚀 Local Development

### 1. Prerequisites & Environment Setup

Create a `.env.local` file in the root directory:

```env
# Google Gemini API Key
NEXT_PUBLIC_GEMINI_API_KEY=your_gemini_api_key

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-id>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 2. Database Schema

Run the SQL script located at `supabase/schema.sql` inside your Supabase **SQL Editor** to initialize the database tables and Row-Level Security policies.

### 3. Installation & Run

```bash
# Clone repository
git clone https://github.com/your-username/notehook.git
cd notehook

# Install dependencies
npm install

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🤝 Contributing

Contributions, feature requests, and feedback are always welcome! Notehook is an open repository for everyone.

### How to Open Your GitHub Repo to Contributors:
1. **Public Repository**: Ensure your GitHub repository visibility is set to **Public** in *Settings > General > Danger Zone*.
2. **Issue Tracker**: Enable **Issues** under *Settings > Features* so community members can report bugs and suggest ideas.
3. **Pull Requests**: Anyone can fork a public repository and submit a **Pull Request (PR)** without needing administrative permissions.
4. **Add a `CONTRIBUTING.md` / `LICENSE`**: Adding an open-source license (e.g. MIT) and clear contribution guidelines makes it inviting for others to jump in.

Feel free to fork the repository, make changes, and open a Pull Request!

---

## 📜 License & Legal

Distributed under the MIT License. See [Terms of Service](https://notehook.vercel.app/terms) and [Privacy Policy](https://notehook.vercel.app/privacy) for more info.

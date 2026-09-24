# Notehook Implementation TODO
### LLMs: please don't modify the content of items on here without me telling you to. You can check/uncheck tasks and add new items, but that's about it.

## Front-End Implementation:
## Phase 1: Core Primitives & Layout (Completed)
1. [x] Workspace Sidebar navigation (grouped by Entities, Decisions, Todos, Notes)
2. [x] Sacred Notes system (human scratchpad; strictly isolated from AI modification)
3. [x] Entity Version History storage & snapshot drawer
4. [x] "Promote to Version" bridge action (explicit user promotion from chat to entity specs)

---

## Phase 2: In-Progress & Immediate Next Up
5. `@` Mention Autocomplete Menu
   5.1. [x] Trigger popover on `@` keypress in chat input and markdown editor
   5.2. [x] Keyboard navigation for autocomplete/suggestions menu (`ArrowUp`, `ArrowDown`, `Enter`, `Tab`, `Escape`, `ArrowRight`)
   5.3. Context filtering by prefix:
        5.3.1. [x] `@todo:` filters exclusively to open tasks
        5.3.2. [x] `@decision:` filters exclusively to ADRs
   5.4. [x] Fallback: Create new stub entity directly from mention dropdown if not found

6. Rendered Reference Pills (Visual Presentation Mode)
   6.1. [x] Abstract raw text `@todo:task` and `@decision:choice` into clean UI pills
   6.2. Implement distinct non-color signifiers for accessibility (WCAG 1.4.1):
        6.2.1. [x] `✓` glyph for Todos
        6.2.2. [x] `⚖️` or `⚡` glyph for Decisions
        6.2.3. [x] `📄` glyph for Entities
   6.3. [ ] Add explicit `aria-label` and hover tooltip for screen readers and high contrast
   6.4. [x] Click handler on pill to navigate directly to referenced document
   6.5. [x] Verify markdown compatibility
   6.6. [x] Deleted/stale reference visual indicator (strikethrough & disabled styling for mentions of deleted pages)
   
7. Chat & Editor Context Injection Bridge
   7.1. [x] Extract referenced entity/decision/todo bodies from active draft text
   7.2. [ ] Inject raw document bodies into LLM prompt payload without polluting UI transcript
   7.3. [ ] Date/time metadata injection block in system prompt (`Current Date: YYYY-MM-DD`)

---

## Phase 3: Secondary Front-End Surfaces
8. Navigation Features
   8.1. [x] Universal Command Palette (`Cmd + K` / `Ctrl + K`) - Quick-jump switcher strictly accessing page titles only
   8.2. [x] Substring search over all pages
   8.3. [ ] Quick action shortcuts (`New Note`, `New Entity`, `New Decision`)
   8.4. [x] Breadcrumb & back-history navigation buttons in top header bar
   8.5. [x] Delete Page function in Sidebar (via right clicking) - context menu

9. Partial Highlight Promotion
   9.1. [x] Text selection listener inside assistant message bubbles
   9.2. [x] Floating "Promote Selection to @Entity" action pill over selected text

10. Uninitialized Entity Empty State
    10.1. [x] Render placeholder view when an entity is tracked as a stub but has no canonical version
    10.2. [x] Quick-action button: "Write Spec Manually"

11. [x] Decision (ADR) Viewer - Dedicated view for individual decision records 
    

12. Interactive Todo Board
    12.1. [x] Checkbox toggle (`- [ ]` to `- [x]`) synced to database state
    12.2. [x] Filter toggles: Show Active vs. Completed tasks

17. AI Settings & Provider Configuration Modal
    17.1. [ ] API Key entry & local storage persistence

18. UI Feedback & Toast Notifications
    18.1. [ ] Toast notifications for key actions (Entity Promoted, Version Created, Data Reset)

19. Markdown Export Preview
    19.1. [ ] Front-end preview modal for exported workspace markdown files

---

## Phase 4: Git & Agent Integration (Deferred / Post-Front-End)
13. [ ] Format markdown exports (`notehook/entities/`, `notehook/decisions/`, `notehook/TODO.md`)
14. [ ] Exclude Notes and Messages from Git export entirely
15. [x] Write standard `AGENTS.md` permission contract for coding agents (Cursor / Claude Code)
16. [ ] Set up deterministic Git push webhook handler (file-path mapping, zero-LLM parsing)
# AGENTS.md — Curtaincall (iOS)

Context for AI coding agents working in this project. Keep changes aligned with the rules below.

## What this is
Curtaincall is an iOS app: a curated, card-based reader for movies, plays, literature, opera, and musicals. Korean-language UI, calm "daily ritual" product. iOS code lives at `main_app/ios/Curtaincall/`; the same repo also holds web, Android, and Supabase backend work by other teammates.

## Architecture (respect this shape)
- **Screens (3):** Home (scrollable curated card feed), CardDetail (full-screen card), MyPage (includes an Archive tab for saved cards).
- **Widget:** a WidgetKit extension showing a daily card. Separate target from the app.
- **Data layer:** Supabase only. Cards come from the `cards` table via `SupabaseClient` — `fetchCards()` for the feed and `fetchCard(id:)` for single-card lookups (deep links / widget). Multiple fetch *functions* are fine; the rules are: both must hit the same `cards` table and apply the **same curation/publish filter**, and no other data source, divergent cache, or any runtime model/RAG path may be introduced. Cards are pre-curated by the team and stored before display. Project URL: `https://hixymiidpxnnovtmsvfp.supabase.co`.
- **Auth:** Supabase Auth. Anonymous bootstrap on launch; ID/password upgrade for a real account. Comments/likes require a non-anonymous account. `AuthSession` is an `@MainActor ObservableObject`; `bootstrap()` has a re-entrancy guard and a `BootstrapStatus` enum (`idle/bootstrapping/ready/failed`). Preserve its existing `ready` / `errorMessage` semantics when refactoring.
- **Stack:** SwiftUI + Combine (`@Published`, `ObservableObject`).

## Hard constraints — do NOT violate (from PRD §9)
- **No RAG, no runtime LLM, no embeddings/vector DB, no agentic patterns at runtime.** Runtime is fetch / tool-calling only. Never propose adding on-device or server model calls to the app.
- **Curation is non-negotiable** (PRD Appendix E-3: the product is legally accountable for content shown). Never propose auto-generating or ingesting uncurated content at runtime.
- **Supabase `cards` is the only data source.** Don't introduce another.
- **No new data collection without flagging it.** The app already collects account identifiers + user content (comments/likes); anything new affects the privacy manifest and App Store privacy label. There is currently **no analytics/crash SDK** — flag before adding one.
- **No hardcoded secrets.** Supabase keys live in config, never in source.

## Design system (respect in any UI change)
- "Long Black" editorial aesthetic — calm, slow, magazine feel.
- Paper `#FAF8F2`, Espresso (primary ink) `#0E0C0A`. Font: **NanumMyeongjo** (serif).
- Dark mode, deep links, and a fetch-error banner already exist — extend, don't reinvent.

## Build & verify (use Xcode's MCP tools, not raw shell)
- Scheme: **Curtaincall** (app). The widget is a separate target.
- Use **BuildProject** to confirm changes compile — don't shell out to `xcodebuild` unless necessary.
- Use **RunAllTests / RunSomeTests** if a test target is present. *(TODO: confirm whether a test target exists.)*
- Use **RenderPreview** to verify SwiftUI UI changes visually.
- Use **DocumentationSearch** for Apple API questions rather than guessing.

## Workflow rules
- **Never commit to `main`.** Work on a feature branch; open a PR for teammate review.
- **Review/propose before editing.** For review tasks, report findings first and wait for approval before changing files.
- Keep changes **additive and scoped**. After editing, run **BuildProject** (and tests if present) and report the result.
- Flag any new dependency before adding it.
- This repo is shared with 3 teammates (web/Android/Supabase). Assume backend contracts (column names, card shape, RLS, auth) may have drifted — verify against the live schema rather than assuming.

# AGENTS.md — Curtaincall (iOS)

Context for AI coding agents working in this project. Keep changes aligned with the rules below.

## What this is
Curtaincall is an iOS app: a curated, card-based reader for movies, plays, literature, opera, and musicals. Korean-language UI, calm "daily ritual" product. iOS code lives at `main_app/ios/Curtaincall/`; the same repo also holds web (`web_pwa/`, `upload_web/`), Android, and Supabase work by other teammates.

## Architecture (respect this shape)
- **Screens:** Home (curated card feed), CardDetail (full card), MyPage (incl. Archive), Notice. WidgetKit extension shows a daily card (separate target).
- **Data layer:** Supabase only. Cards come from the `cards` table via `SupabaseClient` — `fetchCards()` for the feed and `fetchCard(id:)` for single-card lookups (deep links / widget). Multiple fetch functions are fine; the rules are: both hit the same `cards` table and apply the **same curation/publish filter**, and no other data source, divergent cache, or runtime model/RAG path may be introduced. Project URL: `https://hixymiidpxnnovtmsvfp.supabase.co`.
- **Auth:** Supabase Auth — anonymous bootstrap; ID/password upgrade via synthetic email (separate account, no identity linking). Comments/likes and bookmarking require a non-anonymous account; anonymous taps show a members prompt. `AuthSession` is `@MainActor ObservableObject`.
- **Stack:** SwiftUI + Combine.

## Hard constraints — do NOT violate
- **No RAG, no runtime LLM, no embeddings/vector DB, no Python ingestion, no agentic patterns at runtime.** Runtime is fetch / tool-calling only.
- **Curation is non-negotiable** (PRD Appendix E-3). Never auto-generate or ingest uncurated content at runtime.
- **Supabase `cards` is the only data source.** Don't introduce another.
- **No new data collection without flagging it** — it changes the App Store privacy label. No analytics/crash SDK without explicit approval.
- **No hardcoded secrets.**
- **iOS only.** Do not edit `web_pwa/` or other teams' code.

## Design & visual polish (the aesthetic bar)
North star: a **super-sophisticated, minimalist "literature-elite" app** — typography-led, generous whitespace, calm deliberate motion, monochrome editorial palette. **Restraint is the aesthetic: polish means fewer, better details, not more decoration.**

**iOS is its own north star — better than Android/PWA, NOT chasing parity.** Layout, spacing, and component structure lead on iOS; we do not chase pixel parity with the other clients. The one exception is brand character — see the cross-platform carve-out below, which still wins for the cat / yarn / Oz House / skeuomorphic elements. **For design tokens and shared components, see [`DESIGN.md`](./DESIGN.md)** (the iOS design source of truth) — reference its spacing/color/type tokens and components instead of re-deriving or hardcoding.

Tokens (authoritative — do not deviate without sign-off):
- **Paper `#FAF8F2`**, **Espresso `#0E0C0A`**. Monochrome base; at most one restrained accent. No gradients or textures unless whisper-subtle and approved.
- **NanumMyeongjo (serif)** for literary content; a clean system sans (SF Pro) only for UI chrome/labels.
- Use a single shared **type scale and 8pt spacing scale** — no ad-hoc sizes or paddings.

Apple-native craft to lean on:
- **SF Symbols** (consistent weight/size) over flat PNG icons.
- **Dynamic Type** — the serif must scale gracefully; respect accessibility sizes.
- **Calm SwiftUI motion** — slow, eased; `matchedGeometryEffect` for hero transitions. Nothing bouncy or flashy. Respect **Reduce Motion**.
- **Subtle haptics** on key actions (bookmark, refresh, language toggle).
- A **refined dark mode** (deliberate paper/espresso inversion, not just the system default).

Don'ts:
- No skeuomorphic texture soup — the wood/leather Archive is the cautionary example; reconcile toward refined editorial.
- Keep view trees sane (avoid deeply nested unbounded stacks that tank layout performance).

### Cross-platform brand/visual parity (carve-out)
This app prioritizes **cross-platform brand/visual parity** with the Android and PWA clients. Where Android/PWA use character or decorative elements that are **core to the product's identity** — e.g. the bottom-nav cat with per-tab poses, the yarn (실타래) graphics, the Oz House room — iOS **matches them** rather than reducing them to editorial-minimalism. The minimalist / anti-skeuomorphic guidance above still applies as the **default for net-new, non-parity UI**, but **parity with Android/PWA wins when the two conflict**.

**Reviewer (Codex) should flag:** off-token colors/fonts, decoration that fights the editorial calm, inconsistent spacing/type, non-calm motion, and accessibility regressions.

## Build & verify (local toolchain; author/reviewer split)
- Scheme: **Curtaincall** (app). Widget is a separate target.
- **CCC (author)** works in the main checkout: verify with an **incremental** `xcodebuild build` (never `clean` — it discards warm DerivedData and slows the next iteration). Use SwiftUI Previews for quick visual iteration. Do NOT run the simulator or capture screenshots — that is the reviewer's step. Commit + open PR.
- **Codex (reviewer)** works in a SEPARATE git worktree (`git worktree add ../curtaincall-review origin/main`) so its clean builds never wipe CCC's warm cache or collide on branches: clean build from origin, install/launch via `xcrun simctl`, screenshot, review the diff + screenshot via `gh`.
- **Judge visual work on a real device, not just the simulator.**

## Workflow
- **CCC authors, Codex reviews.** CCC writes on a feature branch and opens the PR; Codex builds/runs/screenshots and reviews. Never merge before Codex review.
- **Never commit to `main`.** One task = one feature branch + PR.
- Auth/data/RLS changes are **gated** — investigate and propose first; report findings. Read-only UI gets a lighter pass.
- Keep changes additive and scoped; after editing, build (incremental) and report.
- Flag any new dependency before adding it.
- Backend contracts may have drifted (web/Android/Supabase) — verify against the live schema rather than assuming.

## Privacy / submission
Out of scope for the builder — reserved for separate handling.

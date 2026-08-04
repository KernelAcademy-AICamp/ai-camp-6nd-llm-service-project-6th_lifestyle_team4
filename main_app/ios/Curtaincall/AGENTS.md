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

**iOS is its own north star — better than Android/PWA, NOT chasing parity.** Layout, spacing, and component structure lead on iOS; we do not chase pixel parity with the other clients. The one exception is the **named brand characters** — see the brand-character carve-out below, which wins **only** for those named elements (the cat / yarn-ball / Oz House / the skeuomorphic `ArchiveView` book), not skeuomorphism in general. **For design tokens and shared components, see [`DESIGN.md`](./DESIGN.md)** (the iOS design source of truth) — reference its spacing/color/type tokens and components instead of re-deriving or hardcoding.

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
- No skeuomorphic texture soup in **net-new** UI — default to refined editorial. ⚠️ This is **not** a mandate to strip the existing `ArchiveView` opened-book / leather treatment: that is a **protected brand carve-out** (decision 2026-08-05, see `DESIGN.md` → Brand carve-outs). Keep it, don't extend it, and don't cite it as precedent for adding texture elsewhere. (This line previously named the Archive as the cautionary example, which contradicted DESIGN.md; the two now agree.)
- Keep view trees sane (avoid deeply nested unbounded stacks that tank layout performance).

**Pop-up vs. sheet (app-wide rule):** small, self-contained content/action modals (check-in, sign-in, profile-edit) use the **centered `PopupDialog`** (`Views/Components/PopupDialog.swift`) — full content shown immediately, no bottom-sheet animation hiding it. Keep `.sheet` only for composers, list/detail, the shake `RandomQuotePeek`, and **system share** (`ActivityShareSheet`/`ShareLink`). Don't reach for `.sheet` for a small dialog.

### Brand-character carve-out (scoped under the north star)
**This carve-out sits UNDER the iOS north star above, not beside it.** Layout, screens, spacing, and interaction follow the **iOS north star** (see "iOS is its own north star" above). The exceptions are the **named brand-character elements** — the bottom-nav cat with per-tab poses, the yarn-ball (실타래) graphics, the Oz House room, and the skeuomorphic `ArchiveView` opened-book / leather treatment. For **those named elements only**, brand character outranks editorial-minimalism: when minimalist/anti-skeuomorphic guidance conflicts with one of them, brand character wins. Everywhere else — all net-new and non-character UI — the minimalist editorial north star governs.

**Parity is NOT the justification (decision 2026-08-05).** These elements are kept because they are the product's identity **on iOS**, not because Android/PWA also have them. Earlier wording had iOS "defer to cross-platform brand consistency and **match** Android/PWA"; that is retired. Where a carve-out happens to match another client it is a consequence, not an obligation — iOS already diverges deliberately where it has reason to (e.g. the Library cat's height is 78 against Android's `CatHeightLibrary=90`, changed for small-screen clearance). Android/PWA changing one of these does **not** oblige iOS to follow, and "Android does it this way" is not on its own an argument for an iOS change. Brand **colour hex** and **asset naming** remain worth keeping aligned — that narrower check lives in `DESIGN.md` → "Cross-platform brand check" and is explicitly flag-only.

**Reviewer (Codex) should flag:** off-token colors/fonts, decoration that fights the editorial calm, inconsistent spacing/type, non-calm motion, and accessibility regressions.

## Build & verify (local toolchain; author/reviewer split)
- Scheme: **Curtaincall** (app). Widget is a separate target.
- **Xcode version is pinned** — see [`.xcode-version`](./.xcode-version) (read the file; don't trust a version quoted in prose). Build with the same major so Xcode doesn't re-serialize `project.pbxproj` differently.
- **`project.pbxproj` hygiene:** the project uses Xcode **synchronized folder groups**, so new/removed `.swift` files need **no** pbxproj edit. Stage iOS files **explicitly** (`git add <files>`, never `git add .`) so incidental churn can't ride into a feature commit. If `git status` shows *only* pbxproj `TARGETED_DEVICE_FAMILY` quote churn, it's Xcode reformatting — discard it (`git restore`), don't commit it. Commit the pbxproj **only** for deliberate project-structure/build-setting changes.
- **CCC (author)** works in the main checkout: verify with an **incremental** `xcodebuild build` (never `clean` — it discards warm DerivedData and slows the next iteration). Use SwiftUI Previews for quick visual iteration. Do NOT run the simulator or capture screenshots — that is the reviewer's step. Commit + open PR.
- **Codex (reviewer)** works in a SEPARATE git worktree off the **current integration branch** (`git worktree add ../curtaincall-review origin/$(…the branch you resolved per "Branch model" below…)`) so its clean builds never wipe CCC's warm cache or collide on branches: clean build from that integration branch, install/launch via `xcrun simctl`, screenshot, review the diff + screenshot via `gh`.
- **Judge visual work on a real device, not just the simulator.**

## Branch model (two-level: version branch → feature branches)
Enforced by the repo's `.githooks/pre-commit` hook — **enable once per clone**: `git config core.hooksPath .githooks`. The hook **refuses any commit made directly on `main` or a `release/*` branch** (see `.githooks/README.md`).

- **`main`** — shared trunk. All teams (iOS / web / PWA / Android) merge here. **We do NOT commit iOS work directly to `main`.**
- **Version / integration branch** — `release/<version>`, where a whole cycle's iOS work collects. The name **rotates per build cycle**, so this doc deliberately does not name one. **Resolve it, never assume it:**

  ```sh
  git fetch --prune && git branch -r --no-merged main --list 'origin/release/*'
  ```

  **`--no-merged main` is the whole trick.** Finished cycles are never deleted from the remote, so a
  plain `--list 'origin/release/*'` returns *every cycle the project has ever run* — at time of writing
  that's four, and picking one from that list is a coin flip. A cycle is finished exactly when it has
  been merged into `main` and tagged, so the **unmerged** ones are the live ones.

  - **Exactly one** → that's the live cycle. Branch off it, PR into it.
  - **More than one** → ask; don't guess which cycle is live.
  - **None** → **no cycle is open.** The last release merged to `main` and was tagged, and the next one
    hasn't started. Do **not** invent the next `release/*` to have something to branch from — opening a
    cycle is the owner's call, not the author's. In this window, docs/admin changes PR **directly into
    `main`** (they are self-review tier and touch no app code); app work waits for the cycle to open.
- **Feature branches** — base off the **current version branch** (not `main`); set the **PR base to that same version branch**. One task = one feature branch + PR.
- **NEVER commit directly to `main` or a `release/*` branch** — now hard-blocked by the pre-commit hook (override only with `--no-verify`, discouraged).

**Before every commit:** explicitly `git checkout <feature-branch>` immediately before `git add` / `git commit` — **do not assume HEAD is still on the feature branch you created earlier.** Concurrent Codex review, syncing, and teammate pushes can leave HEAD elsewhere (this has bitten us). The hook is the backstop; the explicit checkout is the habit.

**Version → `main` merge ritual** (runs **only when a build is approved/released** — not per feature PR):
1. `git checkout main && git pull` — reconcile teammate commits first.
2. Merge the current version branch into `main`.
3. `git push`.
4. Tag the released build.

## Workflow
- **CCC authors, Codex reviews and merges (by default).** CCC writes on a feature branch and opens the PR; Codex builds/runs/screenshots, reviews, and merges. CCC does **not** merge by default. The one exception — self-merge of self-review-eligible PRs — is spelled out under **Merge authority** in the Commit / PR conventions below.
- **Never commit to `main` or the version branch.** One task = one feature branch + PR — see **Branch model** above (now enforced by the pre-commit hook).
- Auth/data/RLS changes are **gated** — investigate and propose first; report findings. Read-only UI gets a lighter pass.
- Keep changes additive and scoped; after editing, build (incremental) and report.
- Flag any new dependency before adding it.
- Backend contracts may have drifted (web/Android/Supabase) — verify against the live schema rather than assuming.

## Commit / PR conventions
Per-brief boilerplate, captured here so briefs needn't restate it.
- **Language:** English conventional-commit prefix (`feat` / `fix` / `chore` / `docs` / …); **Korean** summary + body.
- **Base branch:** resolve the live integration branch (see **Branch model**), branch off it, and set the **PR base to that same branch — NEVER `main`** while a cycle is open. The one exception is the no-open-cycle window described there: with no `release/*` on the remote, docs/admin PRs go to `main`.
- **Pre-commit guard:** the `.githooks/pre-commit` hook hard-blocks commits on `main` / `release/*` (enable once per clone: `git config core.hooksPath .githooks`). Habit: `git checkout <feature-branch>` **immediately before** `git add` / `git commit` — don't assume HEAD is unchanged since you branched. See **Branch model**.
- **Review tier:**
  - *Self-review eligible* — trivial docs, dead-code deletions, version bumps, project-setting one-liners.
  - *Gated (Codex build/screenshot; + on-device QA when interaction is involved)* — gestures, navigation, animation, auth/RLS, layout, report/block.
- **Merge authority:**
  - **Default:** Codex reviews and merges. CCC authors and opens the PR; CCC does **not** merge by default.
  - **Self-merge exception:** CCC **MAY** self-merge a PR **without** Codex review **only if** it falls in the **self-review-eligible** tier above (trivial docs, dead-code deletions, version bumps, project-setting one-liners). This holds **whether or not Codex is available** — it's a routine time-saver, not just a Codex-outage fallback. The trivial tier is the **only** thing that authorizes self-merge.
  - **Hard boundary (never self-merge):** anything **gated** — auth / data / RLS, gestures, navigation, animation feel, layout / visual regressions, report/block — **always** requires Codex review + (where interaction is involved) on-device QA before merge, **regardless of how small the change looks**. "Looks simple" does **not** move a gated change into the trivial tier.
- **Device QA batching:** when **≥2 device-gated PRs** are ready, collapse their device passes into ONE install + ONE attributed checklist instead of N separate checkout→rebuild→reinstall cycles — see [`DEVICE-QA-BATCH-SOP.md`](./DEVICE-QA-BATCH-SOP.md). Batch-eligible only if device-gated **and** no shared files with any other batched PR (attribution) **and** builds clean alone. **Never batch** auth/data/RLS, migration-touching, or same-file clusters (e.g. MY-Page = one sequential lane). Never batch Codex review; one failing item never blocks passing siblings.

## Privacy / submission
Out of scope for the builder — reserved for separate handling.

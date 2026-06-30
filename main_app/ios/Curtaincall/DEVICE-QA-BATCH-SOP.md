# Device QA Batch — SOP

**Purpose:** collapse N per-PR device passes (each a checkout → rebuild → reinstall → re-test →
switch-back cycle) into ONE install and ONE checklist sitting, WITHOUT losing the ability to tell which
PR caused a failure. This is the batching that saves time. Batching *Codex review* does not — don't.

Referenced from AGENTS.md (sits next to the merge-authority rules). CCC follows this automatically when
≥2 device-gated PRs are ready.

---

## What enters a device QA batch (and what doesn't)

A PR is **batch-eligible** only if ALL of these hold:
- It's in a **device-gated category** (gesture / scroll / nav / animation / keyboard / report-block, or
  a "light device QA" layout item). Pure self-review-tier PRs (static UI / spacing / icon / copy / color)
  do NOT enter QA at all — CCC self-merges those per AGENTS.md. They never touch this SOP.
- It has **clean file ownership vs every other PR in the batch** — no two batched PRs touch the same
  file. (The partition rule from the worktree model.) If two PRs share a file, a failed checklist item
  could be either PR *or their interaction* → not attributable → not batchable. Hold one for the next
  batch.
- It **builds clean on its own** (BUILD SUCCEEDED) before being stacked.

**Never batch — verify these post-merge, individually:**
- **auth / data / RLS** PRs (login, onboarding, age/gender, account, yarn writes). "Works in the batch
  build" and "works after merging into a moved main" can diverge exactly here. Device-test these AFTER
  their own merge, not in a shared QA build.
- Anything touching a **Supabase migration** (only one migration runs at a time; never stack two).
- The **MY-Page cluster** items against each other (back-nav, yarn-pill, check-in pop-up all live on
  `MyPageView.swift`) — they share a file, so they're one sequential lane, not a batch.

---

## Procedure (CCC)

1. **Collect.** Gather the ready, batch-eligible gated PRs. Confirm pairwise no shared files
   (`git diff --name-only` per branch; the sets must not intersect). Drop any that collide into the next
   batch.
2. **Stack.** Create a throwaway QA branch off the current version branch:
   `git checkout release/1.1-b7 && git pull && git checkout -b qa/device-batch-N`
   Merge each eligible feature branch into it. If any merge conflicts, that PR is not clean-ownership →
   pull it from the batch.
3. **Build once.** `BUILD SUCCEEDED` on `qa/device-batch-N`. One archive, one install to the iPhone.
4. **Generate the attributed checklist** (format below) and hand it to the developer.
5. **Resolve.** For each item the developer marks:
   - **PASS** → merge that PR's own branch into the version branch (Codex first if gated and Codex has
     tokens; the QA pass is the device gate, Codex is the code gate).
   - **FAIL** → that feature branch bounces back for a fix; the OTHER passing PRs still merge. Never
     hold a passing PR hostage to a failing sibling.
6. **Discard** `qa/device-batch-N` — it was only a test harness, never merged anywhere.

CCC must `git checkout <feature-branch>` immediately before any `add`/`commit` (branch-slip guard +
pre-commit hook backstop), including when assembling the QA branch.

---

## Checklist format (CCC generates this per batch)

Each item is tagged with its PR# and written as `repro / pass-if / also` so it's a real test, not a
"looks fine," and so a failure points at one PR.

```
DEVICE QA BATCH N — build: qa/device-batch-N (one install)

[ ] #PR  <short title>
    repro:   <exact steps to reproduce the change>
    pass if: <the specific observable that means it works>
    also:    <edge cases — dark mode, small screen (SE), the forward-compat / category check>
```

- **repro** = the tap-by-tap path. No ambiguity.
- **pass if** = one concrete observable, not a vibe.
- **also** = the cheap extra checks: dark mode, SE-class small screen, and the "did this close the
  *category* not just the instance" check (e.g. for a nav-reset fix: test a NON-original sub-page too).

---

## The one honest caveat (state it on every batch)

**A green batch proves the batch, not the post-merge state.** The integration build tests all these
changes *merged together*. After QA:
- **Merge passing PRs promptly** — don't let them age while `main`/the version branch moves under them.
  The longer the gap, the less the QA build resembles what actually lands.
- For **auth/data** (excluded above): re-verify post-merge regardless of a green batch.
- For low-churn solo cadence this is a non-issue 95% of the time. The 5% lives in auth/data — which is
  why those don't batch.

---

## What this SOP deliberately does NOT do
- It does not batch **Codex review** (review catch-rate drops as diff size grows; failures resurface on
  device = net slower).
- It does not pull **self-merge-tier** PRs into QA (they need no device pass; batching them adds work).
- It does not let one failing item block passing ones.

The net: per-PR branch-switching gone, one device sitting instead of N, attribution kept.

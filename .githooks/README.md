# .githooks

Version-controlled git hooks for this repo. Unlike `.git/hooks/`, this directory is
committed and shared across clones.

## Enable (one-time, per clone)

```sh
git config core.hooksPath .githooks
```

## Hooks

- **`pre-commit`** — refuses commits made directly on `main` or any `release/*`
  (version/integration) branch. iOS work belongs on a **feature branch** that is then
  PR'd into the current version branch (see `main_app/ios/Curtaincall/AGENTS.md` →
  "Branch model"). The `release/*` pattern auto-protects each cycle's version branch
  with no maintenance.

### Notes / limits
- **Local safety net only.** It can be bypassed (`git commit --no-verify`) and a fresh
  clone won't enforce it until `core.hooksPath` is set. It complements — does not
  replace — server-side branch protection (owner-level, configured separately).

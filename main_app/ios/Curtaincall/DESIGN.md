# DESIGN.md — Curtaincall (iOS) design system

The **iOS design source of truth**. When building or changing any sheet, modal, or
screen, reference the tokens and components below instead of re-deriving them.
Values here are extracted from the iOS codebase (`main_app/ios/Curtaincall/Curtaincall`),
not invented — if you change a token in code, update it here in the same PR.

See also [`AGENTS.md`](./AGENTS.md) (architecture, hard constraints, the brand carve-out rule).

## North star

**iOS is its own north star: better-than-Android/PWA, iPhone-tuned, editorial-minimalist,
with the brand-character (cat / yarn / skeuomorphic) exceptions.**

Layout, spacing, and component structure lead on iOS — we do **not** chase pixel parity with
Android/PWA. The single exception is brand character (the bottom-nav cat, yarn / 실타래 graphics,
Oz House room, the skeuomorphic Archive book), where parity *does* win. That carve-out is owned by
`AGENTS.md` — see [Brand carve-outs](#4-brand-carve-outs) below; it is not restated here.

## 1. Spacing tokens

Source: `Curtaincall/DesignSystem/SheetMetrics.swift`. These define the **sheet-chrome rhythm**
(grabber → title → body → button) so every bottom sheet / modal feels the same. Content-internal
spacing (calendar grids, form fields) stays local to each screen.

**Rule: reference these tokens, never hardcode sheet/modal spacing.**

- `SheetMetrics.grabberTop` = **12** — grabber ↔ first content (custom header / title)
- `SheetMetrics.headerHeight` = **56** — sheet custom header bar height (title + close row)
- `SheetMetrics.titleToBody` = **12** — title ↔ body
- `SheetMetrics.bodyToButton` = **24** — body ↔ primary action button
- `SheetMetrics.buttonGap` = **10** — between stacked buttons
- `SheetMetrics.cardPadding` = **20** — centered modal-card inner padding + header horizontal padding

Consumers today: `AttendanceView`, `MyPageView`, `CardDetailView`, `AccountRequiredPrompt`.

## 2. Color tokens

Source: `Curtaincall/DesignSystem/DesignTokens.swift` (`extension Color`). A two-tone editorial
palette: **paper** is the surface, **espresso** is the ink/contrast (text, filled buttons, chips).

**Dark-mode adaptive pattern (authoritative):** each token is built by
`adaptive(light:dark:)`, which returns `Color(uiColor: UIColor { traits in … })` and resolves
`light` vs `dark` per `traits.userInterfaceStyle` at draw time. Dark mode **inverts paper ↔ espresso**
so every existing call site (`.paper` surfaces, `.espresso` ink/filled buttons) flips correctly with
no per-screen edits. Driven by the app's `preferredColorScheme`. For one-off literals there is also a
`Color(hex:)` initializer — prefer a semantic token over a raw hex.

Token — light → dark:

- `espresso` — `#0E0C0A` → `#FAF8F2`  (ink / filled-button bg)
- `paper` — `#FAF8F2` → `#0E0C0A`  (page surface)
- `roast` — `#2C2620` → `#E6DFD1`  (pressed state of filled button)
- `walnut` — `#6B5D4F` → `#B0A290`  (secondary text / meta)
- `latte` — `#E8E1D3` → `#2A2620`  (hairline / subtle panel)
- `sand` — `#C9B89A` → `#7A6B57`  (neutral accent)
- `cta` — `#D85A30` → `#E0683E`  (coral call-to-action — the one restrained accent)
- `highlight` — `#F4C20D` → `#F4C20D`  (signal: LIVE, star; same in both themes)
- `cardWarm` — `#FFFDF7` → `#15120E`  (raised card surface: Daily / Onboarding / Notice)
- `feedCard` — `#E6E1D7` → `#1C1813`  (feed post/card container)

## 3. Typography

Source: `Curtaincall/DesignSystem/Typography.swift`.

- **Serif — `NanumMyeongjo`** for literary content. Helpers: `displaySerif(32)`,
  `headlineSerif(22)`, `titleSerif(16)`, `numericSerif(28)` (defaults shown; pass a size to override).
- **Sans — `Pretendard-Regular` / `Pretendard-Medium`** for UI chrome/labels. Helpers:
  `bodySans(15)`, `metaSans(12)`, `uiSans(size, weight:)` (medium → Pretendard-Medium, else Regular).
- **`labelCaps(color:size:)`** — uppercase eyebrow/label: Pretendard-Medium, `tracking = size*0.2`,
  default `walnut`, default size 11.
- **`bookLeading(size:)`** — literary line spacing: `lineSpacing = size*0.6`.

**Rule: use these helpers — no ad-hoc `.font(.system(...))` sizes for content.**

## 4. Component conventions

**Rule: reuse the shared component; don't re-roll a one-off.**

- **Sheet chrome standard** — every bottom sheet / modal builds its grabber→title→body→button
  rhythm from the §1 `SheetMetrics` tokens. New sheets follow the same chrome.
- **Auth / "membership required" modal** — `Views/Components/AccountRequiredPrompt.swift`. Centered
  card: `maxWidth 340`, corner radius 8, `espresso.opacity(0.18)` scrim, "Members" serif eyebrow
  (`headlineSerif(22)`) + title (`titleSerif(20)`) + message (`bodySans(14)`, `walnut`) + filled
  로그인 / outlined 회원가입 buttons. Reuse this for any anonymous-gate prompt; don't build a new one.
- **Editorial buttons** — `Views/Components/EditorialButton.swift`. Real buttons use
  `.buttonStyle(EditorialButtonStyle(.filled))` or `(.outlined)`: height 52, corner radius 8,
  `labelCaps` label, filled `espresso`→`roast` on press, outlined `walnut` 1pt stroke + faint espresso
  wash. The `editorialButton(style:)` view modifier is for **decorative, non-interactive** labels only.
- **WorkCover (book cover)** — `Views/Components/WorkCover.swift`. The shared "book": loads
  `works.cover_url` (http only) with a deterministic leather fallback (spine + inset border + centered
  title/subtitle/author), memory-cached via `WorkCoverCache`. Corner radius 4 (regular) / 3 (`compact`).
  Mirrors Android `ui/components/BookCover`. Reuse for any book rendering. (Note: `ArchiveView.BookCover`
  is a *separate*, intentionally skeuomorphic opened-book cover — see §4 brand carve-outs.)
- **Corner radii** — standard editorial chrome (buttons, modals, cards) = **8**; book covers = **3–4**.
  Stay on these; don't introduce new radii without sign-off.
- **Empty states** — use the brand cat imagery (`cat_empty`, `cat_confused`, …), a brand carve-out
  (below), not a plain text placeholder.

### Brand carve-outs

Skeuomorphic / character elements that intentionally break the editorial-minimalist default:

- **Cat** — per-pose mascot art (`cat_today`, `cat_empty`, `cat_struck`, `cat_pen`, `cat_confused`,
  `cat_idle`, `cat_library`, `cat_computer`, `cat_shelf_few`, `cat_shelf_many`, `library-cat-2`).
- **Yarn / 실타래** — reward currency graphics (`yarn_balance`).
- **Oz House room**, and the **skeuomorphic Archive** opened-book / leather treatment.

The policy for these — *parity with Android/PWA wins for brand character, minimalism is the default for
net-new non-parity UI* — lives in `AGENTS.md` → "Cross-platform brand/visual parity (carve-out)" and is
**not duplicated here**. Read that section before touching brand-character UI.

---

## Cross-platform brand check

Reference only — **flag, don't fix**, and iOS is *not* chasing layout parity. Scope is strictly
**brand color hex** + **brand-asset naming**; spacing/layout/components are intentionally excluded.
Android (`main_app/android`) is a real app and weighed over PWA (`web_pwa`, static pages under
`public/m/`). Sources: iOS `DesignTokens.swift`; Android `ui/theme/AppColors.kt`; PWA per-page CSS vars.

Color tokens — `light / dark` hex, and whether each platform matches iOS:

```
token       iOS (light/dark)     Android (light/dark)   PWA (canonical)        match?
paper       FAF8F2 / 0E0C0A      FAF8F2 / 0E0C0A        FAF8F2 / 0E0C0A        ✅ all
espresso    0E0C0A / FAF8F2      0E0C0A / FAF8F2        0E0C0A / FAF8F2        ✅ (¹)
cta         D85A30 / E0683E      D85A30 / E0683E        D85A30                 ✅ light
highlight   F4C20D / F4C20D      F4C20D / F4C20D        F4C20D                 ✅ all
roast       2C2620 / E6DFD1      2C2620 / E6DFD1        2C2620 / E8E1D3        ⚠️ dark drift
walnut      6B5D4F / B0A290      6B5D4F / B0A290        6B5D4F / 9C8B79…       ⚠️ dark drift
latte       E8E1D3 / 2A2620      E8E1D3 / 2A2620        E8E1D3 / 2C2620        ⚠️ dark drift
sand        C9B89A / 7A6B57      C9B89A / 7A6B57        C9B89A / 6B5D4F        ⚠️ dark drift
cardWarm    FFFDF7 / 15120E      FFFDF7 / 15120E        (not defined)          ✅ Android
feedCard    E6E1D7 / 1C1813      E6E1D7 / 1C1813        (not defined)          ✅ Android
```

- **iOS ↔ Android: exact parity** on all 10 tokens — same names, same light/dark hex, same
  paper↔espresso inversion ("LongBlack" palette). No action.
- **iOS ↔ PWA:** primary brand colors (paper, espresso, cta, highlight, and every *light* value)
  match. Divergences to flag for the developer: (a) PWA **dark** secondary tokens (roast/walnut/latte/
  sand) drift slightly from iOS; (b) ¹ one dev/demo page (`public/m/dev-attendance-anim.html`,
  `assets/m-app.js`) uses an off-token `--espresso: #3B2A1A` and `--latte: #E6DBC6`. These are static
  mockups, not the shipped app, but worth reconciling.

Brand-asset naming — **consistent across all three**: cat poses share identical filenames
(`cat_today`, `cat_empty`, `cat_struck`, …) in iOS `Assets.xcassets/*.imageset`, Android
`assets/cat/*.png`, and PWA `public/m/assets/cat/*.png`; yarn/실타래 is named consistently
(iOS `yarn_balance`, Android `YarnRepository`/`ic_yarn`/`YarnIcon`). No action.

> Flag for the developer to decide: align PWA dark-mode secondary tokens (roast/walnut/latte/sand)
> and the off-token dev mockup with the iOS/Android values, or accept the web divergence.

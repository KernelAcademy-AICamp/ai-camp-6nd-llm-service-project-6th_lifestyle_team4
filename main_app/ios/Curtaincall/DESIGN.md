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
For the full per-role type scale (sizes, weights, leading, Dynamic Type behavior) see [§5](#5-typography-scale-per-role).

## 4. Component conventions

**Rule: reuse the shared component; don't re-roll a one-off.**

- **Sheet chrome standard** — every bottom sheet / modal builds its grabber→title→body→button
  rhythm from the §1 `SheetMetrics` tokens. New sheets follow the same chrome.
- **Pop-up dialog (centered)** — `Views/Components/PopupDialog.swift`. The app-standard centered modal:
  `espresso.opacity(0.18)` scrim + paper card (corner radius 12, `latte` 0.5pt stroke, `maxWidth` ~360),
  `.transition(.opacity)`. Apply like a sheet: `.popup(isPresented:)`. Content closes itself via the
  injected `\.dismissPopup` env (an overlay doesn't get `\.dismiss`). `fitContent:` true = size to content
  (check-in / profile-edit); false = **form mode** (login) — the card fills the space above the keyboard
  so the inner `ScrollView` reaches the focused field. `AccountRequiredPrompt` (below) is the same
  scrim+card scaffold specialized for the auth gate.
  - **Pop-up vs. sheet (decide once):** small, self-contained content/action modals — check-in, sign-in,
    profile-edit — use the centered `PopupDialog` (full content shown immediately, no bottom-sheet
    animation hiding it). Keep `.sheet` only for composers, list/detail, the shake `RandomQuotePeek`, and
    **system share** (`ActivityShareSheet` / `ShareLink`). Don't reach for `.sheet` for a small dialog.
    (Mirrors the same rule in `AGENTS.md`.)
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

## 5. Typography scale (per-role)

The §3 helpers are the vocabulary; this is how they map to **real text roles**, with the actual values
from code. Two type worlds coexist on purpose: the **in-app reading surface** renders the 대본/명대사 as
a *monospaced screenplay* (`CardDetailView` → `SelectableScriptText`), while the **share/export card**
(`QuoteCardView`, a rasterized image) sets the quote in *NanumMyeongjo serif*. Document/maintain both.

**Rule: use the §3 helpers for every role below — no ad-hoc `.font(.system(size:))`.**

Sources: `Typography.swift`; `CardDetailView.swift`; `QuoteCardView.swift`.

```
role                          font (family)              size   weight    line-height / leading      tracking    align         dynamic type
— in-app reading surface —
script / 명대사 body          SF mono (system)           14     reg¹      lineSpacing 8 (≈22pt)      kern 0.28   text_align²   FIXED 14 (UITextView, not scaled)
SCENE description             Pretendard-Regular         16     reg       bookLeading → +9.6 (×0.6)  —           leading       scales
작품의 의의 (significance)     Pretendard-Regular         16     reg       bookLeading → +9.6 (×0.6)  —           center        scales
detail work title            NanumMyeongjo (serif)       20     reg       default                    —           center(1 ln)  scales
eyebrow / section label       Pretendard-Medium          11     med       default                    2.2 (×0.2)  uppercase     scales
meta / count line             Pretendard-Regular         12     reg       default                    —           center        scales
button text (Editorial)       Pretendard-Medium          11     med       default                    2.2 (×0.2)  uppercase     scales
coral action pill             Pretendard-Medium          14     med       default                    0.8         center        scales
toast                         Pretendard-Regular         13     reg       default                    —           center        scales
— share / export card (QuoteCardView, raster image) —
quote body (share)            NanumMyeongjo (serif)       19–30³ reg       lineSpacing size×0.5       —           center        pinned .large (export)
decorative quote mark         NanumMyeongjo (serif)       60     reg       —                          —           center        pinned .large
work title (share)            NanumMyeongjo (serif)       15     reg       default                    —           center        pinned .large
attribution (share)           Pretendard-Medium          11     med       default                    2.2         uppercase     pinned .large
wordmark                      NanumMyeongjo (serif)       13     reg       default                    —           center        pinned .large
```

¹ Speaker lines (text matching `work.characters`) and `**…**` spans render **bold**; everything else regular.
² Body alignment follows the admin-saved `text_align` (migration 042): `center` / `right` / `left`; when
  NULL it defaults by format — **poem → center, else → left**.
³ Length-based auto-shrink (see §6 long-quote handling): `<60`→30, `<120`→26, `<200`→22, else→19 chars.

**Dynamic Type:** SwiftUI text built via the §3 helpers uses `Font.custom(_:size:)`, which scales with the
system text size by default — so serif/sans roles above scale. Two deliberate exceptions: the in-app script
is a `UITextView` with a fixed `monospacedSystemFont(ofSize: 14)` (not scaled — preserves the script grid),
and the share export pins `dynamicTypeSize = .large` so every shared image is identical regardless of the
user's setting. `TODO: confirm` whether the fixed-14 script should adopt `UIFontMetrics` for accessibility.

## 6. Card reading surface

The core feature is reading, so this is the most important spacing/type contract. There are **two surfaces**;
keep them distinct.

### 6a. In-app reading surface — `CardDetailView` (the primary read)

Not a bounded "card": a full-height vertical `ScrollView` on `Color.paper`, top bar (height 64) + `Hairline`,
then the scrolling column. **Reading measure = device width − 40pt** (the column's `.padding(.horizontal, 20)`);
there is no narrower max-width clamp. `SelectableScriptText` itself adds **zero** internal inset
(`textContainerInset = .zero`, `lineFragmentPadding = 0`) so the script sits flush to that 20pt column edge.

- **Background / container:** `paper`; no corner radius (full-bleed scroll, not a panel).
- **Quote / script body:** SF monospaced **14**, `lineSpacing 8`, `kern 0.28`, `espresso` ink; speaker lines
  bold (§5 note ¹). **Semantic line-break chunks** (의미 묶음 줄바꿈 from the extraction prompt) arrive as
  `\n`-separated lines and each renders as its own paragraph — **inter-chunk spacing = the 8pt `lineSpacing`**
  (no extra blank line). Alignment follows `text_align` (§5 note ²: poem center, prose left).
- **SCENE block** (optional, above the script): `bodySans 16` `walnut`, `bookLeading(16)`, leading-aligned,
  inside a `RoundedRectangle(cornerRadius: 4)` with a `latte` 0.5pt stroke, padding v16 / h18.
  (Note the **radius 4** here — an annotation box; it intentionally differs from the editorial-8 chrome radius.)
- **작품의 의의** (optional, below the script): `bodySans 16` `espresso`, **center**, `bookLeading(16)`.
- **Vertical rhythm** (top→down, in pt): topSpacer 40 · metadata · 28 · [lang-toggle row: Hairline / pad 14 /
  Hairline · 24] · [SCENE · 24] · **script** · [significance: 32 · Hairline · 24 · label · 12 · body] · 48 ·
  Hairline · 32 · CTA(filled) · 10 · CTA(outlined) · 16 · edition label · 40 · Hairline · 28 · comments · cat.
- **Quote → attribution gap:** there is no separate attribution under the script here; the work title/author
  live in the **top bar** (serif 20 title + `labelCaps` eyebrow/subtitle) and in the centered **metadata block**
  at the top (`format · AUTHOR` eyebrows, then `year · 👁 · 🔖 · 💬` meta at `bodySans 12` walnut).
- **Long-quote handling:** the whole view **scrolls**; the script self-sizes to its full wrapped height
  (`SelectableScriptText.sizeThatFits` returns the wrapped height for the proposed width) — **no truncation,
  no auto-shrink**. A "scroll-to-top" FAB appears past 80% scroll.

### 6b. Share / export card — `QuoteCardView` (rasterized artifact)

A fixed typeset card rendered to an image via `ImageRenderer` (Messages / IG-story share). Not interactive.

- **Container:** width **360**, `minHeight 460`, `background paper`, text insets **h34 / v40**. No corner radius
  (it's a full-bleed image). Export pins `colorScheme .light` + `dynamicTypeSize .large` so it always looks
  deliberate.
- **Quote body:** NanumMyeongjo, **auto-size 19–30 by length** (§5 note ³), center, `lineSpacing = size×0.5`;
  chunk breaks are the `\n`s in `card.quote`, spaced by that same `size×0.5`.
- **Quote → attribution:** `Spacer(minLength: 28)` → `sand` divider 36×1 → 14 → title (`titleSerif 15`) → 6 →
  attribution (`labelCaps 11`, `author · year · format`).
- **Long-quote handling:** font auto-shrinks with length down to a **floor of 19pt**; the card grows past its
  460 minimum rather than truncating.

### Readability rationale (the north-star reasoning)

- **In-app:** the monospaced face + 8pt line spacing + 0.28 kern read as a *manuscript / script page*, and
  speaker-line bolding makes dialogue scannable; the 20pt column keeps a comfortable measure on iPhone, and
  honoring `text_align` (poem center / prose left) respects each literary form. The fixed 14pt preserves that
  deliberate grid — at the cost of Dynamic Type scaling (the `TODO` in §5).
- **Share card:** serif + generous `×0.5` leading + centered + length-based auto-shrink make a single quote
  read as one balanced, intentional literary object at any length; pinning light + size guarantees a
  consistent exported image.

**Rule: in-card type and spacing reference these tokens (§1 spacing, §2 color, §3/§5 type) — never hardcode
per-screen values.**

> Cross-platform note (flag-only): Android's in-app quote/script font size was **not** compared — it lives
> deep in the detail-screen Compose code and the brief scoped this to a cheap check only. `TODO: confirm` if a
> token-level iOS↔Android reading-size comparison is wanted later. iOS is the readability north star regardless.

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

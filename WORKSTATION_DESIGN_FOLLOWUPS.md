# Workstation Design Followups

**UI polish items** — visual fixes, layout tweaks, alignment corrections, and UX improvements to existing features. Each entry is a bounded design change that doesn't require new data models or significant new capabilities.

**Bigger ideas** (new features, new data models, analytical capabilities) have been moved to `PRODUCT_VISION.md` where they're organized into a layered feature stack. Entries marked `→ MOVED` below have their full description there.

**How to use this file:**
- Resolved entries get marked `[RESOLVED on YYYY-MM-DD]` rather than deleted
- `→ MOVED` entries are one-line pointers to PRODUCT_VISION.md

---

## 1. Property Physical tile — bed/bath duplication

**Surfaced:** 2026-04-11 during 3E.3.a (Property Physical bed/bath mini-grid)
**Status:** Open
**Severity:** Cosmetic — does not affect correctness
**Scope:** `components/workstation/subject-tile-row.tsx` Property Physical tile

### The issue

After 3E.3.a added the bed/bath level mini-grid to the Property Physical tile, the tile now shows beds and baths in **two places**:

1. The inline `Beds` and `Baths` rows in the existing 8-column physical grid (position rows 1 and 2)
2. The new mini-grid below the main grid, where `Tot` is the same value

Dan's preference: the mini-grid should **replace** the inline Beds/Baths rows, not duplicate them. The mini-grid shows the same total plus per-level breakdown, so the inline rows are redundant.

### The complication

The screening modal at `/screening` also consumes `<SubjectTileRow>` and **does not have per-level bed/bath data** (its `ScreeningCompData` source only has `bedsTotal` and `bathsTotal`, not per-level fields). The modal currently relies on the inline Beds/Baths rows to show those totals — if we just delete the inline rows, the modal loses Beds/Baths entirely.

### Possible fixes

- **(a) Conditional rendering.** When `bedBathLevels` is provided (Workstation), hide the inline Beds/Baths rows and show only the mini-grid. When `bedBathLevels` is omitted (modal), show the inline rows as today and don't render the mini-grid. Single-prop branch in the existing 8-column grid.
- **(b) Restructure the 8-column grid.** Pull beds/baths out of the main grid entirely. Both consumers always render some kind of bed/bath display; the modal gets a 2-row inline mini-grid (Bd/Ba with Tot only), the Workstation gets the full 5-column mini-grid. Cleaner but bigger refactor.
- **(c) Modal also fetches per-level data.** Expand `ScreeningCompData` and the screening loader to expose the per-level fields. Both consumers render the full mini-grid. Bigger schema/loader work; longest path.

### Recommended next step

When Dan does the design polish pass, start with (a) — it's the smallest change that achieves the goal (no duplication in the Workstation, no regression in the modal). Revisit (b) or (c) only if (a) creates layout issues.

---

---

## 2. Missing tile titles on MLS Info and Property Physical tiles

**Surfaced:** 2026-04-11 during 3E.3.c (QuickStatusTile)
**Status:** Open
**Severity:** Cosmetic — visual consistency
**Scope:** `components/workstation/subject-tile-row.tsx` (MLS Info tile + Property Physical tile)

### The issue

The `QUICK ANALYSIS` and `QUICK STATUS` tiles each have a small uppercase title at the top of the tile (e.g. "QUICK STATUS" in blue-600 text). The MLS Info and Property Physical tiles do NOT have titles — they just render the data grid directly. This creates visual inconsistency in the top tile row: 2 of the 4 tiles have titles, 2 don't.

Dan's preference: every tile in the top row should have a small uppercase title for consistency.

### Proposed titles

| Tile | Title |
|---|---|
| MLS Info | `MLS DATA` |
| Property Physical | `PROPERTY DATA` |
| Quick Analysis | `QUICK ANALYSIS` (already has it) |
| Quick Status | `QUICK STATUS` (already has it) |

### The complication

The MLS Info and Property Physical tiles live in `<SubjectTileRow>`, which is also consumed by the screening modal. Adding titles there changes the modal's visual appearance too. That's probably fine — the modal would also benefit from consistent tile titles — but it's a visual change to a daily-use surface.

### Possible fixes

- **(a) Add the titles directly to SubjectTileRow.** Both consumers (modal + Workstation) get the titles. Single change. The modal becomes slightly taller per tile.
- **(b) Make the title optional via a prop.** `SubjectTileRowProps` gains optional `mlsTitle?: string` and `physicalTitle?: string` props. The Workstation passes them; the modal omits them. More flexibility, more prop surface.

### Recommended next step

(a) — add the titles directly in SubjectTileRow with the proposed labels. The modal benefits from the same consistency as the Workstation. Smallest change.

---

## 3. DetailModal card width too wide — left/right column gap is hard to scan

**Surfaced:** 2026-04-11 during 3E.7.e (HoldTransCardModal)
**Status:** Open
**Severity:** Readability — affects every card modal
**Scope:** `components/workstation/detail-modal.tsx` (the shared modal wrapper)

### The issue

The DetailModal renders at `max-w-[720px]`. Inside each card modal, the CostLine rows (label on the left, value on the right) have a wide horizontal gap between the label and the value. When the analyst's eyes scan from the label to the corresponding number, the distance is large enough to require conscious eye movement, making it easy to land on the wrong row.

### Dan's preference

Narrower modal cards. Reducing max-width would bring the label and value columns closer together, making the label-to-value scan tighter and faster. Alternatively, larger text/numbers could anchor the eye better, but Dan leans toward narrower.

### Possible fixes

- **(a) Reduce max-w from 720px to ~520-560px.** Single CSS change in detail-modal.tsx. Affects all modals equally.
- **(b) Add a max-width to the CostLine container inside each modal.** Only affects waterfall-style modals (Holding/Trans, Cash Required, Financing). More targeted but more per-file changes.
- **(c) Increase font size of CostLine values.** Makes the numbers more prominent and easier to track horizontally, but doesn't reduce the gap.

### Recommended next step

(a) — reduce the DetailModal max-width. Single change, uniform effect. Test at ~540px to see if the content still fits comfortably.

---

## 4. Right tile column should move to the LEFT side of the layout

**Surfaced:** 2026-04-11 during 3E.7.e (HoldTransCardModal)
**Status:** Open
**Severity:** Layout — major UX improvement, affects the core Workstation structure
**Scope:** `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx` (grid layout)

### The issue

The 9 collapsible detail cards currently live in a **right-side column** (~320px) next to the hero comp workspace, per the original spec §2 layout diagram. Dan's observation after using the real cards: "These cards are an amazing add and are working out perfectly. They should not be on the right side. The user wants to interact with them. They will eventually be on the left."

The analyst's primary workflow involves opening these cards, reviewing numbers, and occasionally editing values. Having the cards on the right means the analyst's attention bounces between the right column (cards) and the center/left (comp workspace) — the cards feel like secondary context rather than the primary interaction surface they've become.

### Dan's preference

Move the detail cards to the **left side** of the layout. The comp workspace shifts to the right. This puts the cards — the analyst's primary interaction targets — closer to where the eye naturally starts (left edge of the viewport).

### The complication

This is a layout flip of the main Workstation grid. The current structure is:

```
┌────────────────────────────────────┬──────────────┐
│ HERO COMP WORKSPACE (1fr)          │ RIGHT COLUMN │
│                                    │ (320px)      │
└────────────────────────────────────┴──────────────┘
```

The change flips it to:

```
┌──────────────┬────────────────────────────────────┐
│ LEFT COLUMN  │ HERO COMP WORKSPACE (1fr)          │
│ (320px)      │                                    │
└──────────────┴────────────────────────────────────┘
```

This is a single `gridTemplateColumns` change in the Workstation's JSX + swapping the order of the two grid children. Small code change, but it affects the visual hierarchy of the entire Workstation and may interact with the top tile row alignment, the Deal Stat Strip width, and the header layout.

### Possible fixes

- **(a) Swap columns in the grid.** Change `gridTemplateColumns: "1fr 320px"` to `gridTemplateColumns: "320px 1fr"` and swap the JSX order of the two children. Single commit.
- **(b) Full layout redesign.** Rethink the header/tiles/strip width budget with the card column on the left. May want the tiles and strip to span full width ABOVE both columns, or just above the hero. More work.

### Recommended next step

(a) is the quick-swap MVP. Try it and see if the visual hierarchy feels better. If the tiles/strip need width adjustments, handle those as a follow-on within the same polish pass.

---

## 5. CostLine subscript notes displace numbers from the value column

**Surfaced:** 2026-04-11 during 3E.7.f (FinancingCardModal)
**Status:** Open
**Severity:** Layout — affects readability and trust in every waterfall card
**Scope:** `components/workstation/cost-line.tsx` (the shared cost-line primitive used by Holding/Trans, Financing, Cash Required)

### The issue

The `CostLine` component renders a small subscript note (`sub` prop) to the RIGHT of the dollar value. Example: `$4,846 67d` or `$2,200 informational`. The subscript displaces the dollar value leftward out of the natural "number column" alignment. When scanning a waterfall of cost lines, the eye expects all numbers to right-align consistently — but the subscript pushes some numbers further left than others depending on the subscript's length.

Dan's view: "This is intended to be a reliable accounting model. Notes do not belong in the number column."

### Dan's preference

The subscript note should render to the LEFT of the number, not to the right. The number stays in its rightmost position, consistently aligned with every other value in the waterfall. The subscript sits between the label and the number, serving as context without disrupting the alignment.

### Possible fixes

- **(a) Move the sub to the left of the value in CostLine.** Change the `<div className="text-right shrink-0">` container so the sub comes first (left) and the value comes second (right). The value stays anchored at the right edge. Small change in cost-line.tsx, affects all waterfalls uniformly.
- **(b) Render the sub as a separate column.** Convert CostLine from a 2-column layout (label | value+sub) to a 3-column layout (label | sub | value). More structured but requires changing the grid/flex in every CostLine consumer.

### Recommended next step

(a) — move the sub to the left of the value within CostLine's existing flex layout. Single file change, uniform effect across all waterfall cards.

---

## 6. Notes modal UX refinements — delete confirmation, inline editing, note list visibility

**Surfaced:** 2026-04-11 during 3E.7.h (NotesCardModal)
**Status:** Open
**Severity:** UX — affects daily note-taking workflow
**Scope:** `app/(workspace)/analysis/[analysisId]/notes-card-modal.tsx`

### The issues (3 related)

**6a. Delete note needs "are you sure" confirmation.**
Currently clicking × on a note deletes it immediately with no confirmation. Accidental deletion of an important note is unrecoverable. Dan wants an "Are you sure?" alert or inline confirmation before the delete fires.

**6b. Existing notes should always be visible in the modal.**
The analyst needs to see all existing notes while composing a new one — otherwise they may repeat something already noted. The current layout shows the Add Note form at the top and the note list below, which works spatially, but if the list is long and the form is expanded, the notes may scroll out of view. Dan wants zero friction: the note list should always be visible alongside the form.

**6c. Clicking an existing note should open inline editing.**
Currently notes are read-only display with a delete button. Dan wants: click on an existing note → it becomes editable in-place (body text, category, visibility all editable). Save on blur or via a small save affordance. Zero friction for updates and new information. This turns every note row into a potential edit surface.

### Possible fixes

- **(a) Delete confirmation:** wrap the × click in a `window.confirm("Delete this note?")` call. Simplest. Or render a small inline "Delete? Yes / No" confirmation that replaces the × button for 3 seconds.
- **(b) Note list always visible:** ensure the note list scrolls independently from the form. Or keep the form compact (collapsed by default, expands on click). Or render the form in a sticky header/footer within the modal body.
- **(c) Inline editing:** on note row click, swap the read-only text with an editable textarea + category/visibility controls. Auto-persist on blur (same useDebouncedSave pattern). Requires a new server action `updateAnalysisNoteAction` for editing existing notes (currently only add + delete exist).

### Recommended next step

Implement all three in the design polish pass. (a) is the quickest win. (c) requires a new server action but the pattern is established. (b) may require rethinking the modal's scroll layout.

---

## 7. Deal Stat Strip pills shift horizontally as digits change during Quick Analysis typing

**Surfaced:** 2026-04-11 during 3E.8 (cross-card cascades + polish)
**Status:** Open
**Severity:** UX — distracting motion during the core editing workflow
**Scope:** `components/workstation/deal-stat-strip.tsx` + `components/workstation/deal-stat.tsx`

### The issue

When the analyst types into a Quick Analysis input (e.g. Manual ARV), the Deal Stat Strip recomputes every value synchronously on every keystroke. Because the dollar amounts have variable digit counts (e.g. "$1,125,000" → "$112,500" → "$11,250" as the user deletes digits), every pill in the strip resizes horizontally, causing all pills to the right to shift left/right chaotically. The visual effect is a "jittering" strip where all 7 stat columns wobble back and forth with each keystroke.

Dan's observation: "I like knowing that the edit is happening in real time, but I don't like the numbers moving back and forth."

### Dan's preference

1. **Fix the pills in place** — each pill should occupy a stable column width that doesn't change as the value changes. The strip should feel like a fixed-width table, not a flex container that reflows.
2. **Visually highlight the pill(s) that are changing** — when a Quick Analysis override affects a strip value, the affected pills should flash or glow briefly to draw the eye to the change without the distracting horizontal motion.

### Possible fixes

- **(a) Fixed-width pills via `min-width` per column.** Set a `min-w-[X]` on each DealStat that's wide enough for the longest expected value in that column (e.g. "$1,999,999" for ARV, "99.9%" for Offer%). Pills stay put; values right-align within their fixed column. Simple CSS.
- **(b) CSS Grid layout for the strip instead of flex.** Replace the `flex gap-4` container with `grid grid-cols-7` (or similar). Each column gets a fixed fraction of the strip width. More structured but may need per-column width tuning.
- **(c) Transition animation on value change.** When a pill's value changes, briefly flash the value text (e.g. scale up to 105% and back, or a subtle background pulse) before settling. Draws the eye to the change. Implemented via a `useEffect` that watches the value and triggers a CSS transition class.

### Recommended next step

(a) + (c) combined. Fixed-width columns stop the jittering; the pulse animation tells the analyst which values just changed. Both are small CSS changes. Start with (a) alone to see if the fixed layout is sufficient — the motion problem is the primary complaint; the highlight is a nice-to-have.

---

## 8. Property Physical tile — square footage values should be right-aligned

**Surfaced:** 2026-04-11 after 3F completion
**Status:** Open
**Severity:** Cosmetic — minor alignment inconsistency
**Scope:** `components/workstation/subject-tile-row.tsx` Property Physical tile

### The issue

Square footage values in the Property Physical tile (Total SF, Above SF, Below SF, Bsmt Fin, Lot SF) are left-aligned within their grid cells. When a value is short (e.g. "900" for a small basement), it sits at the left edge of its column while longer values in the same column are naturally wider. Numbers in an accounting-style layout should right-align so the digits line up consistently.

### Recommended fix

Add `text-right` to the value `<span>` elements for numeric fields in the Property Physical grid. Single class addition per cell. Same principle as the CostLine number-column alignment in entry 5.

---

## 9. Screening modal needs a visible Deal Math waterfall card

**Surfaced:** 2026-04-12
**Status:** Open
**Severity:** UX — affects the core screening workflow
**Scope:** `components/screening/screening-comp-modal.tsx` + possibly a new shared component

### The issue

The screening modal shows the Deal Stat Strip (horizontal pills: ARV, Max Offer, Offer%, Gap/sqft, Rehab, Target Profit, Trend) but does NOT show the step-by-step waterfall that explains HOW the offer price is computed. The analyst sees the final numbers but can't see the math chain at a glance.

Dan's view: "At all times, the user should see how the math works for the offer price."

### What the analyst needs to see in the modal

A visible Deal Math waterfall — the same concept as the Workstation's Deal Math section but rendered vertically alongside the comp workspace:

```
  Effective ARV        $1,125,000
  − Rehab                 $71,400
  − Holding               $12,800
  − Transaction           $53,600
  − Financing              $4,846
  − Target Profit         $40,000
  ─────────────────────────────────
  = Max Offer            $942,354
  
  Offer %                  88.6%
  Spread                $182,646
  Gap/sqft                  $219
```

This should be visible WITHOUT clicking — either as a permanent sidebar panel next to the comp workspace, or as a collapsible section that defaults to expanded.

### The complication

The screening modal is already dense (map + table + subject tiles + deal strip + footer actions). Adding a permanent waterfall card means either:
- Shrinking the comp table width to make room for a sidebar
- Adding it below the deal strip (pushes the comp table down)
- Making it a floating/sticky panel that overlays part of the workspace

### Possible fixes

- **(a) Vertical sidebar.** Add a ~200px column to the right of the comp table inside the modal. The waterfall renders as a compact vertical stack using `<CostLine>` from 3C. The comp table loses ~200px of width — still functional at ~560px on a 1440 viewport.
- **(b) Collapsible section below the Deal Stat Strip.** A "Show Deal Math ▾" toggle that expands the waterfall between the strip and the comp workspace. Defaults to expanded. Collapses to save space when the analyst wants more room for comps.
- **(c) Reuse the new Workstation's right-column card pattern.** Render a subset of the DetailCard stack (just Deal Math / ARV / Rehab) in a narrow column alongside the modal's comp workspace. Heavier but consistent with the Workstation design language.

### Recommended next step

(b) is the lowest-risk MVP — it doesn't change the modal's horizontal layout, just adds vertical content. The deal math waterfall is small (~10 lines of CostLine items) and the toggle lets the analyst reclaim space. Start with (b); if the analyst always leaves it expanded, consider promoting to (a) in a future iteration.

---

## 10. Workstation Deal Stat Strip missing Copy MLS Selected / Copy All buttons

**Surfaced:** 2026-04-12
**Status:** Open
**Severity:** Functional gap — spec §3.3 explicitly calls for these; the modal has them but the Workstation doesn't
**Scope:** `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx` (DealStatStrip `rightSlot` prop)

### The issue

The screening modal's Deal Stat Strip has a right-aligned section with comp count text + "Copy Selected" + "Copy All" MLS# buttons (wired via the `rightSlot` prop on `<DealStatStrip>` in 3C Task 10). The new Workstation's Deal Stat Strip was wired in 3E.4 WITHOUT a `rightSlot`, so the Copy MLS buttons are missing.

The spec §3.3 says: "On the right side of the strip: small comp count + Copy Selected MLS# / Copy All MLS# buttons (matches modal). The Copy Selected button should still be the Tab target from Quick Analysis (existing keyboard flow preserved)."

### The fix

The Workstation parent already has `compData` (ScreeningCompData) in state from the hero CompWorkspace loading. The fix is:

1. Extract `CopyMlsButton` from the screening modal (currently a private component at ~20 lines) into `components/workstation/copy-mls-button.tsx`
2. Pass a `rightSlot` to the Workstation's `<DealStatStrip>` with the comp count text + two CopyMlsButton instances (same pattern as the modal)
3. Wire the Copy Selected button ref for the Tab-from-Quick-Analysis keyboard flow (the `onTargetProfitTab` callback on QuickAnalysisTile)

~15 min fix. Requires compData to be loaded (which it is after the hero mounts).

---

## 11. → MOVED to PRODUCT_VISION.md §3.1 — Map view for screening queue + Watch List

---

## 12. Hold & Trans collapsed card headline is messy

**Surfaced:** 2026-04-12
**Status:** Open
**Severity:** Cosmetic — affects readability of the right column at a glance
**Scope:** `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx` (Hold & Trans DetailCard instance)

### The issue

The Hold & Transaction collapsed card currently renders:

```
Hold & Trans     Hold $12,800 · Trans $53,600   ▾
                 120 days held
```

The headline tries to show both holding AND transaction totals in one line, making it long and cluttered compared to the other cards which have a single clean number. "Hold $12,800 · Trans $53,600" is a lot of visual noise for a collapsed card that's meant to be scannable.

### Possible fixes

- **(a) Single combined total.** Headline: `$66,400` (holding + transaction combined). Context: `Hold $12.8K · Trans $53.6K · 120 days`. Cleaner headline, detail in context line.
- **(b) Two-line headline.** Line 1: `Hold $12,800`. Line 2: `Trans $53,600`. But DetailCard's headline prop is a single string.
- **(c) Shorter format.** Headline: `H $12.8K · T $53.6K`. Abbreviated labels + compact numbers. Still noisy.
- **(d) Show only the dominant number.** Headline: `$53,600` (transaction, the larger component). Context: `+ $12,800 holding · 120 days`. Highlights the bigger cost.

### Recommended next step

(a) — single combined total as the headline, breakdown in the context line. Matches the pattern of other cards (one prominent number + supporting context). Easy change in the DetailCard props.

---

## 13. → MOVED to PRODUCT_VISION.md §4.2 — Separate deal-math cards from non-math cards

---

## 14. → MOVED to PRODUCT_VISION.md §4.1 — Show Market Conditions button

---

## 15. → MOVED to PRODUCT_VISION.md §3.2 — Close/list ratio + DOM per comp

---

## 16. → MOVED to PRODUCT_VISION.md §3.3 — Nearby Analyses

---

## 17. → MOVED to PRODUCT_VISION.md §4.3 — Listing agent relationship tracking

---

## 18. → MOVED to PRODUCT_VISION.md §4.4 — Deal urgency fuse + agent behavior

## 19. Quick Status for un-promoted screening results

**Surfaced:** 2026-04-12 during screening modal Quick Status addition
**Status:** Open — discuss when reaching this area
**Severity:** Feature gap — not a bug

### The issue

Quick Status (Interest, Condition, Location, Next Step) currently only appears in the screening modal when the property has been promoted to an analysis, because the dropdowns auto-persist to `manual_analysis` and `analysis_pipeline` — tables that require an `analysis_id`. For un-promoted screening results there's no analysis row to write to, so Quick Status is hidden.

### The complication

Adding Quick Status to un-promoted items would require either: (a) creating an analysis row at screening time just to hold status fields, which blurs the screening → analysis promotion boundary, or (b) adding status columns to `screening_results` itself, which duplicates the concept across two tables. There may also be a valid product reason to keep screening intentionally lightweight — the screening modal is a triage tool, and forcing status decisions before promotion could slow down the workflow.

### Possible fixes
- (a) Add `interest_level`, `condition_rating`, `location_rating`, `next_step` columns to `screening_results` — local to screening, no analysis needed
- (b) Auto-create a lightweight analysis stub when the user first interacts with Quick Status, effectively a "soft promote"
- (c) Leave as-is — Quick Status appears only after promotion, keeping screening fast and uncluttered

### Recommended next step
Discuss pros/cons when the screening workflow is next revisited. The current behavior (Quick Status after promotion only) may be the right design.

---

## How to add new entries

Append a new section below using the same template:

```markdown
## N. <Short title>

**Surfaced:** YYYY-MM-DD during 3E.X.Y (<sub-task name>)
**Status:** Open
**Severity:** Cosmetic / Info-density / Layout / Other
**Scope:** <file path or component>

### The issue
<one paragraph>

### The complication (if any)
<one paragraph>

### Possible fixes
- (a) ...
- (b) ...

### Recommended next step
<one sentence>
```

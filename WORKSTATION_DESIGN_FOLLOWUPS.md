# Workstation Design Followups

A running log of **design refinements** surfaced during 3E build that we deliberately deferred to a focused polish pass. Each entry is a small visual or layout change Dan wants to make once the structural work in 3E is done. None of these affect functional correctness — they're aesthetic / information-density / hierarchy choices that benefit from a coherent end-to-end review rather than per-sub-task tweaking.

The point of this file is to **let 3E build keep moving** without losing track of the polish requests. Each 3E sub-task that surfaces a design refinement appends an entry here; the polish pass at the end of 3E (or during 3E.8 / a follow-up) addresses them in a batch.

**How to use this file:**
- Each entry is dated and tagged with the surfacing sub-task
- Entries describe the issue + the change (or possible changes)
- Resolved entries get marked `[RESOLVED on YYYY-MM-DD]` rather than deleted, so the history is preserved

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

## 11. Screening queue + Watch List need a map view for geographic deal selection

**Surfaced:** 2026-04-12
**Status:** Open
**Severity:** Feature — new capability, not a fix to existing UI
**Scope:** `app/(workspace)/screening/page.tsx`, `app/(workspace)/analysis/page.tsx` (Watch List), possibly a new shared `<DealMapView>` component

### The issue

The screening queue and Watch List are currently table-only views. The analyst has no way to see deals spatially — where they are relative to each other, which neighborhoods have clusters of opportunity, or which deals are near a property they're already evaluating.

### Dan's vision

A map view toggle on the screening queue and Watch List that plots deals geographically. Pins are color-coded by a selectable metric (Gap/sqft or Offer%) so the analyst can visually scan for opportunity clusters and choose which properties to evaluate based on location + deal quality together.

### Design sketch

```
┌────────────────────────────────────────────────────────┐
│  Screening Queue          [ Table View | Map View 🗺 ] │
│                                                        │
│  Color by: [ Gap/sqft ▾ ]   Filter: [ Prime Only ☐ ]  │
│                                                        │
│  ┌──────────────────────────────────────────────────┐  │
│  │                                                  │  │
│  │     🟢         🟢                                │  │
│  │          🟡                                      │  │
│  │                    🟢    🔴                       │  │
│  │     🟡                                           │  │
│  │              🔴          🟢                       │  │
│  │                                                  │  │
│  │  Click pin → opens screening modal for that      │  │
│  │  property (same as clicking a table row today)   │  │
│  └──────────────────────────────────────────────────┘  │
│                                                        │
│  Pin colors (Gap/sqft):                                │
│  🟢 ≥$60  🟡 $30–$59  🔴 <$30                         │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Implementation notes

- Reuses the existing `<CompMap>` component from `components/properties/comp-map.tsx` (already battle-tested in the screening modal and Workstation hero)
- Data: `analysis_queue_v` already has `subject_address`, latitude/longitude (via the mls_listings join), `est_gap_per_sqft`, `offer_pct`, `is_prime_candidate`
- Watch List: `watch_list_v` has the same fields via the property/listing joins
- Pin click handler: opens the screening modal (queue) or navigates to `/analysis/[id]` (Watch List)
- Toggle between Table View and Map View (or render both side-by-side on wide viewports)
- Color metric selector: Gap/sqft (default) or Offer% — drives the pin color thresholds

### Recommended approach

Build a shared `<DealMapView>` component that takes an array of `{ id, lat, lng, label, metric, metricValue }` pins and renders them on a CompMap with color coding. Both the screening queue page and the Watch List page can use it by mapping their respective view data into the pin format. The toggle between table and map view is a per-page state (`useState<"table" | "map">("table")`).

This is a feature addition, not a design fix. Scope it as a standalone task outside the design polish pass — possibly after Step 4 or as a parallel track.

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

## 13. Future layout direction: separate deal-math cards from non-math cards

**Surfaced:** 2026-04-12
**Status:** Open — directional vision, not an immediate fix
**Severity:** Architecture / UX direction — informs future layout decisions
**Scope:** The overall Workstation right-column card organization

### Dan's vision

The 9 right-column cards currently mix four fundamentally different concerns into one vertical stack:

| Concern | Cards | Role |
|---|---|---|
| **Deal Math** | ARV, Rehab, Holding & Trans, Financing, Cash Required | Numbers that feed the offer price waterfall. Each cascades into the next. |
| **Market Data** | Price Trend | External context — informs the analyst's judgment but doesn't directly compute the offer price |
| **Action / Status** | Pipeline Status | Deal mechanics — showings, offers, contracts. Operational state, not math. |
| **Communication** | Notes, Partner Sharing | Collaboration and record-keeping. No math influence. |

Dan's insight: the deal-math cards should be **visually organized to mirror the deal math waterfall itself** — the analyst should see the cascade (ARV → minus Rehab → minus Hold → minus Trans → minus Financing → minus Profit = Max Offer) reflected in the card layout. The non-math cards (Price Trend, Pipeline, Notes, Partner Sharing) belong in a separate visual region since they serve a different purpose.

### Why this matters

Today all 9 cards are in one flat stack. The analyst has to mentally separate "which of these affect my offer price?" from "which of these are context / communication?" When the deal-math cards are intermixed with the non-math cards, the waterfall relationship between them is invisible — you can't see that ARV feeds into Cash Required, or that changing Days Held cascades through Holding into the offer price.

### Possible future layouts

- **(a) Two card groups.** "Deal Math" group (5 cards, ordered to match the waterfall: ARV → Rehab → Hold/Trans → Financing → Cash Required) + "Context & Action" group (4 cards: Price Trend, Pipeline, Notes, Partner Sharing). Two visually distinct sections in the column, with a subtle divider or different background.

- **(b) Deal Math cards laid out AS the waterfall.** Instead of 5 separate collapsed cards, render the deal math as a single interactive waterfall card where each line item is expandable in-place. Click "Rehab $71,400" in the waterfall → it expands to show the category breakdown without opening a separate modal. The non-math cards stay as a separate card stack. This would be the most natural representation — the layout IS the math.

- **(c) Two columns.** Deal math on the left, context/action on the right. The comp workspace occupies the center. Three-column layout on wide viewports.

### Recommended approach

This is a Phase 2+ layout evolution, not a Phase 1 task. The current flat stack works — it just doesn't communicate the relationships between cards. When the time comes:

1. Start with **(a)** — two card groups with a divider. Lowest-risk layout change that immediately communicates the separation.
2. If (a) feels right, explore **(b)** — the interactive waterfall card. This is the more ambitious but more elegant solution. It would replace 5 separate DetailCards with one unified waterfall component where each line item is its own expand-in-place section.
3. Consider **(b)** alongside design followup #4 (moving the card column to the left) — if the cards move left AND become a waterfall, the analyst's primary interaction surface becomes a vertical deal-math cascade on the left with the comp workspace on the right. That's a strong layout.

---

## 14. "Show Market Conditions" button — active/expired/withdrawn listings overlay

**Surfaced:** 2026-04-12
**Status:** Open — feature idea, not a fix
**Severity:** Feature — new analytical capability
**Scope:** The Workstation comp workspace (hero) + possibly the screening modal

### Dan's insight

The ARV comp workspace shows **closed sales** — historical transactions used to estimate After Repair Value. But it doesn't show **current market conditions**: what's currently listed (active competition), what expired (couldn't sell), what was withdrawn (pulled off market). A property with a strong ARV can still be a bad deal if 5 similar homes are actively listed and competing for the same buyers.

Dan's view: "A good deal can turn bad if there is too much competition."

### The feature

A "Show Market Conditions" button in the comp workspace that, when clicked, overlays the comp map + table with current market data:

- **Active listings** (green pins) — current competition. How many similar homes are listed right now? At what prices?
- **Expired listings** (amber pins) — couldn't sell. Were they priced too high? How long were they on market?
- **Withdrawn listings** (red pins) — pulled off market. Why? Price too high? Condition issues?

This data is already in the `mls_listings` table (MLS status field distinguishes Active / Expired / Withdrawn / Closed / etc.) but the comp engine currently only queries closed sales. The market conditions overlay would query the SAME geographic area + property filters but for non-closed statuses.

### Why on-demand (not automatic)

The comp engine pre-loads closed sales into memory for the bulk screening runner. Adding active/expired/withdrawn to every screening run would:
- Increase the data load significantly (active listings are numerous)
- Slow down bulk screening without benefiting most properties
- Add noise to the default comp display

Instead, the analyst triggers the market conditions overlay **on demand** when they're evaluating a specific deal and want competitive context. One button press fetches the data for this property's area and renders it alongside the ARV comps.

### Design sketch

```
┌──────────────��─────────────────────────────────────��─────────────┐
│  Comp Workspace                                                  │
│                                                                  │
│  Tabs: [ ARV (12) ] [ As-Is (5) ] [ Scrape — ] [ Rental — ]    │
│                                                                  │
│  [ Show Market Conditions 🏘 ]     ← new button                  │
│                                                                  │
│  When clicked:                                                   │
│  ┌─────────────┐  ┌──────────────────────────┐                  │
│  │ MAP         │  │ Split or tabbed display:  │                  │
│  │ • Closed    │  │ Active (7) | Expired (3)  │                  │
│  │   (existing)│  │ | Withdrawn (1)           │                  │
│  │ • Active 🟢│  │                            │                  │
│  │ • Expired 🟡│  │ Address | Status | List $ │                  │
│  │ • Withdrawn │  │ | DOM | Sqft | Bd/Ba      │                  │
│  │   🔴       │  │                            │                  │
│  └─────────────┘  └────────────────────────���─┘                  │
│                                                                  │
│  Market summary: 7 active · avg $685K · avg 42 DOM              │
│  Competition index: MODERATE (7 active in 0.5mi, similar size)  │
└──────────────────────────────────────────────────────────────────┘
```

### Implementation notes

- **Data source:** `mls_listings` table, filtered by: same geographic radius as the comp search, similar property type/size, MLS status IN ('Active', 'Expired', 'Withdrawn', 'Coming Soon')
- **Server action:** `loadMarketConditionsAction(propertyId, { radius, propertyType, sqftRange })` — fetches non-closed listings matching the comp search parameters
- **Map integration:** reuse CompMap with additional pin types (active/expired/withdrawn get distinct colors/shapes from the existing closed-sale comp pins)
- **Table:** new lightweight table (or a tab in the existing comp table) showing the non-closed listings with: address, status, list price, DOM, sqft, beds/baths
- **Competition summary:** a small stat bar showing active count, avg list price, avg DOM, and possibly a qualitative "competition index" (low / moderate / high based on active listing density relative to the subject's price point)
- **Processing:** on-demand only — NOT part of the bulk screening pipeline. No pre-loading. The button triggers a single query scoped to this property's comp area.

### Recommended approach

Scope this as a standalone feature task after Step 4. The data is already in the database; the comp search parameters are already defined per property. The main work is:
1. A new server action to query non-closed listings
2. Extending CompMap to render additional pin types
3. A market conditions panel/tab in the comp workspace
4. A competition summary stat bar

Could be a ~1-2 day feature addition. High analytical value — gives the analyst competitive context that's currently invisible in the platform.

---

## 15. Comp sales need close/list price ratio + DOM context for market health signal

**Surfaced:** 2026-04-12
**Status:** Open — analytical enhancement, related to Price Trend card
**Severity:** Feature — new analytical signal from existing data
**Scope:** Comp table columns + possibly the Price Trend card or a new Market Health summary

### Dan's insight

The comp table shows each comparable sale's net price, implied ARV, gap, and days since close — but it doesn't tell the analyst HOW that sale happened. Two comps with the same close price tell very different stories:

- **Comp A:** Listed at $680K, closed at $710K on day 3. ← Hot market. Bidding war. Buyers paying over ask.
- **Comp B:** Listed at $750K, two price reductions, closed at $680K on day 45. ← Soft market. Sellers capitulating.

Both appear similar in the current comp table but represent opposite market conditions. The analyst needs to see the close/list price ratio and DOM per comp to judge market health.

### What's needed

**Per-comp data points (already in the database):**
- `list_price` (original list price of the comp sale)
- `close_price` (what it actually sold for)
- **Close/List ratio** = `close_price / list_price` (derived). >1.0 = sold over ask. <1.0 = sold under ask.
- `DOM` (days on market) — already partially exposed as `days_since_close` in the comp table, but DOM (listing date to contract date) is a different and more useful metric than days since close

**Display options:**
- **(a) Add columns to the comp table.** Two new columns: `C/L%` (close/list ratio as percentage, e.g. "104%" or "91%") and `DOM` (days on market). Color code: C/L ≥100% green, <95% red. DOM <14 green, >45 red.
- **(b) Market Health summary in the Price Trend card.** Aggregate the per-comp close/list ratios and DOM into a market health indicator: "Avg C/L: 98.2% · Avg DOM: 34 days · 3 of 12 comps sold over ask". This tells the macro story alongside the trend rate.
- **(c) Both.** Per-comp columns in the table AND an aggregate summary in the Price Trend card.

### Data availability

- `mls_listings.list_price` — the original (or current) list price. Available for most listings.
- `mls_listings.close_price` — the sale price. Available for closed sales.
- `mls_listings.listing_contract_date` — the date the listing went active.
- `mls_listings.purchase_contract_date` — the date the property went under contract (if available).
- DOM can be computed as `purchase_contract_date - listing_contract_date` (for pending/closed) or `current_date - listing_contract_date` (for active).

The comp engine already loads comp listing data including `close_price` via `metrics_json`. The `list_price` may need to be added to the comp candidate's `metrics_json` if it's not already there — depends on what `loadScreeningCompDataAction` populates.

### Relationship to Price Trend

The Price Trend card currently shows the annual appreciation/depreciation rate based on a time-decay regression. The close/list ratio and DOM data is complementary — the trend rate says "prices are rising/falling" while the close/list + DOM says "sellers are getting their price quickly" or "sellers are struggling." Together they paint the full market health picture.

Dan's note: "This is related to market trend, and may need to be incorporated." Two paths:
1. **Keep separate.** Comp table gets per-comp C/L% and DOM columns. Price Trend card gets an aggregate market health summary. Both are visible independently.
2. **Integrate.** The Price Trend card evolves into a broader "Market Health" card that combines the trend rate + close/list aggregate + DOM aggregate + competition data (from followup #14). A single card that answers "what is this market doing?"

### Recommended approach

Start with **(a)** — add C/L% and DOM columns to the comp table. The data is per-comp and belongs next to the other per-comp metrics. Then evaluate whether the aggregate belongs in the Price Trend card (option b) or warrants a new Market Health card. The per-comp columns are the foundation; the aggregate is the synthesis.

Check whether `list_price` is available in the comp candidate's `metrics_json`. If yes, the C/L% column is a pure UI addition. If no, the comp engine needs to include it in the metrics — a small loader change.

---

## 16. "Nearby Analyses" — show other properties we've analyzed in the area

**Surfaced:** 2026-04-12
**Status:** Open — feature idea, workflow efficiency
**Severity:** Feature — operational efficiency for showings and route planning
**Scope:** Workstation (possibly the header or a new card) + Watch List / Pipeline views

### Dan's insight

When the analyst is scheduling showings for a property, they should know if there are other properties of interest nearby. If two Watch List properties are 3 blocks apart, the analyst should see them both on the same trip. Today there's no way to discover this proximity — each analysis is isolated.

Dan's view: "Let's create efficiency."

### The feature

A "Nearby Analyses" indicator that surfaces other properties the analyst has analyzed (or is watching) that are geographically close to the current property. This creates showing-route efficiency and cross-deal awareness.

### Where it could appear

- **Workstation header or a small card:** "2 other analyses within 0.5 mi" with a mini-map or link list. Click to open the other Workstation.
- **Watch List / Pipeline table:** a "cluster" indicator on rows that have nearby siblings. "3 properties in Capitol Hill" grouped visually.
- **Map view (#11):** if the map view is built, nearby analyses are automatically visible as pins. This feature becomes implicit in the map — no separate UI needed.

### Implementation notes

- **Data:** `real_properties` has `latitude` + `longitude` for every property. `analyses` links to `real_properties`. A simple proximity query: `SELECT * FROM analyses JOIN real_properties ON ... WHERE ST_DDistance(lat/lng, subject_lat/lng) < threshold AND analyses.id != current_analysis_id AND analyses.is_archived = false`.
- **Or simpler without PostGIS:** Haversine distance calculation in a server action, filtering analyses within 0.5mi (or configurable radius). We already have the `haversine()` function in `deals/actions.ts` from the manual comp addition feature.
- **Performance:** the analysis count is small (dozens to hundreds, not thousands). A simple distance filter over all active analyses is fast.
- **Display:** a compact list: address + distance + lifecycle stage (screening / analysis / showing / offer) + interest level. Click → navigate to that Workstation.

### Design sketch

```
┌──────────────────────────────────────────────┐
│ 📍 Nearby Analyses (2 within 0.5 mi)         │
│                                              │
│  742 Pearl St (0.2 mi) · Watch List · Hot    │
│  818 Grant St (0.4 mi) · Showing · Warm      │
│                                              │
│  → Great for a combined showing trip          │
└──────────────────────────────────────────────┘
```

### Relationship to other followups

- **#11 (Map view for screening/Watch List):** if the map view is built, nearby analyses are visible automatically as pins on the map. The "Nearby Analyses" card becomes a quick reference for the non-map view.
- **#14 (Market Conditions):** nearby analyses + active market conditions together give the analyst full spatial awareness — "what am I analyzing here, what's competing, and what else do I have going on in this neighborhood?"

### Recommended approach

Start simple: a small "Nearby" section in the Workstation (below the header or as a mini-card) that queries active analyses within 0.5mi and lists them. The haversine function already exists. The query is cheap. If the map view (#11) ships, this becomes redundant for map users but still useful as a text summary.

Could be a ~half-day feature addition. High operational value for analysts managing multiple deals in the same neighborhood.

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

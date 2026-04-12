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

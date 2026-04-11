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

# Phase 1 — Step 3C — Component Extraction

> **Goal:** Extract the components the new Workstation will reuse, without changing any existing user-visible behavior. After 3C, both `ScreeningCompModal` and the current `AnalysisWorkstation` continue to work exactly as before, but they now share underlying components that 3E will plug into. Pure refactoring — the test is "everything still works exactly the same."
> **Status:** DRAFT — awaiting Dan's review before execution
> **Authority:** `WORKSTATION_CARD_SPEC.md` §6 (component reuse strategy, locked) + `PHASE1_STEP3_MASTER_PLAN.md` §3C (3C scope) + completion of Phase 1 Step 3B
> **Date:** 2026-04-11
> **Risk level:** Low to medium — refactoring is mechanical but touches load-bearing UI; the main risk is import path mismatches and accidentally changing JSX behavior during the lift
> **Estimated scope:** 0 SQL migrations, ~8-12 new component files, ~3 source files modified, ~1 dead file deleted, ~6-10 commits

---

## 1. What 3C Accomplishes

3C is the **plumbing sub-step** of Step 3. Three things:

1. **Deduplicate primitives that are already copy-pasted** between `ScreeningCompModal`, the current `AnalysisWorkstation`, and the legacy duplicate workstation file. Specifically: `DealStat`, `TrendDirectionBadge`, `TrendTierColumn`, `CostLine`. These exist in 2-3 places already and just need to be lifted to a shared module.

2. **Extract inline-private components** out of `ScreeningCompModal` so the new Workstation can reuse them. Specifically: `AddCompByMls`, `ExpandSearchPanel`. These are already named functions inside the modal file but they're not exported and no other file can use them.

3. **Build new shared composition components** by extracting the inline JSX patterns the spec requires both the modal AND the new Workstation to render. Specifically: `<SubjectTileRow>`, `<DealStatStrip>`, `<CompWorkspace>`. These don't exist as named components yet — the JSX is inline in the modal and/or the workstation. 3C lifts that JSX into clean shared components.

4. **Introduce two new generic wrappers** that don't yet have any consumer: `<DetailCard>` and `<DetailModal>`. These are forward-looking infrastructure for the 3E card layout. 3C creates the files; 3E plugs them in.

5. **Move `RehabCard` to its own file.** It's already a self-contained component inside `analysis-workstation.tsx` (~310 lines, lines 216-525). Moving it out unblocks 3E and shrinks the workstation file.

6. **Delete dead code** discovered during the audit: the legacy `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` file is no longer imported anywhere (after Step 3B Task 4 turned its sibling `page.tsx` into a redirect). It has its own duplicated copies of `TrendDirectionBadge`, `TrendTierColumn`, `CostLine` that confuse any grep. Cleaning it up is part of the dedupe story.

**3C explicitly does NOT do these things — they belong to later sub-steps:**

| Out of scope | Belongs to |
|---|---|
| Auto-persist infrastructure (`useDebouncedSave`, `<SaveStatusDot>`) | 3D |
| Per-card modal components (`<ArvCardModal>`, `<RehabCardModal>`, etc.) | 3E |
| Building the actual new Workstation card layout | 3E |
| Wiring `<DetailCard>` and `<DetailModal>` into anything | 3E |
| Notes visibility three-tier UI | 3E |
| Quick Status tile | 3E |
| Removing the current `AnalysisWorkstation` file | 3F |
| Removing `analysis_notes.is_public` and other 3F cleanups | 3F |
| Any database changes | None — 3C is pure UI refactoring |

---

## 2. The #1 Constraint

**Both `ScreeningCompModal` and the current `AnalysisWorkstation` must continue to work exactly as before.** Same UI, same behavior, same data, same edge cases. 3C is a refactor, not a redesign.

The verification standard is binary: open the screening modal and walk through the comp workspace, then open a current Workstation and walk through every panel. If anything looks or behaves differently from before, that's a bug.

The two areas with the highest risk:

- **`SubjectTileRow`, `DealStatStrip`, `CompWorkspace` are "extract by unification".** Today the JSX exists in two slightly different forms — once in the modal, once in the workstation. They render the same data but with subtle differences in spacing, prop names, or null handling. The extraction has to either (a) standardize on one form (and accept that the other consumer's UI may shift slightly) or (b) keep both forms behind a prop. Standardizing is cleaner; the risk is making someone's familiar UI feel unfamiliar.
- **The screening modal is load-bearing for the daily screening workflow.** Breaking it blocks the entire screening pipeline. Per the spec it's also the basis for the new Workstation hero, so 3C is doing major surgery on it.

---

## 3. Risk & Rollback

| Workstream | Risk | Why | Mitigation |
|---|---|---|---|
| Lift duplicated primitives (`DealStat`, `TrendDirectionBadge`, `TrendTierColumn`, `CostLine`) | Low | Mechanical move + import update; the existing call sites are stable | Typecheck + visual diff in dev |
| Move `RehabCard` to its own file | Low | Self-contained component, no logic change | Typecheck + manual smoke test of the workstation Rehab section |
| Extract `AddCompByMls` and `ExpandSearchPanel` from the modal | Low-Medium | Already named functions, but they may close over local state in the modal that needs to become props | Read each function's closures carefully before extracting |
| Build `SubjectTileRow` and `DealStatStrip` | Medium | Need to design a clean prop interface that fits both consumers; risk of subtle JSX divergence | Standardize on one form; visual diff both consumers after the lift |
| Build `CompWorkspace` | Medium-High | Largest and most complex extraction; the modal's hero is dense state-laden JSX with map + table + filter chips + add comp + expand search | Save for last; do it in a single dedicated commit; thorough smoke test |
| Build `<DetailCard>` and `<DetailModal>` (greenfield) | Low | Pure new code with no current consumer; can't break anything | Lightweight design; defer hard parts (focus trap, etc.) until 3E actually uses them |
| Delete dead legacy workstation file | Very Low | No imports, file is unreachable | Final grep before deletion |

**Rollback procedure:**

3C is purely additive at the file level (new shared components) plus localized edits to the two source files (modal + current workstation). To roll back:

1. `git revert` the 3C commits in reverse order
2. The modal and the current workstation return to their pre-3C state
3. The new shared component files in `components/workstation/` are deleted by the revert

**Catastrophic rollback:** if everything goes badly, `phase1-step3b-complete` (the tag we'll cut after 3B's last push, or the equivalent commit hash `919b498`) is the recovery point. 3C's risk profile is low enough that I don't expect needing a full rollback.

---

## 4. File Inventory — What Already Exists

Audit results from grepping for each component name in `WORKSTATION_CARD_SPEC.md` §6:

### Already shared (DO NOT TOUCH)

| Component | Location | Used by |
|---|---|---|
| `CompMap` | `components/properties/comp-map.tsx` | Modal, current Workstation, reports viewer |
| `ArvBreakdownTooltip` | `components/screening/arv-breakdown-tooltip.tsx` | Modal, current Workstation |

These are already in the right place and exported. The new Workstation in 3E will import them via the same paths.

### Duplicated primitives (need DEDUPE)

| Component | Locations |
|---|---|
| `DealStat` | `screening-comp-modal.tsx:1138` AND `deals/watchlist/[analysisId]/analysis-workstation.tsx:82` |
| `TrendDirectionBadge` | `deals/watchlist/[analysisId]/analysis-workstation.tsx:59` AND `screening/[batchId]/[resultId]/page.tsx:647` AND `analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx:54` (DEAD) |
| `TrendTierColumn` | `deals/watchlist/[analysisId]/analysis-workstation.tsx:91` AND `analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx:68` (DEAD) |
| `CostLine` | `deals/watchlist/[analysisId]/analysis-workstation.tsx:143` AND `analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx:120` (DEAD) |

For each: lift the canonical version into a shared file, replace each call site with an import. The DEAD legacy duplicates get dropped when we delete that file (Task 1).

### Inline private to the modal (need EXTRACT)

| Component | Location |
|---|---|
| `ExpandSearchPanel` | `screening-comp-modal.tsx:1189` |
| `AddCompByMls` | `screening-comp-modal.tsx:1296` |

These are already named functions, just not exported. Extract by lifting them into their own files and updating the modal to import.

### Move-only (already a component, just relocate)

| Component | Current location | New location |
|---|---|---|
| `RehabCard` | `deals/watchlist/[analysisId]/analysis-workstation.tsx:216` (~310 lines) | `components/workstation/rehab-card.tsx` |

### New shared components to BUILD (extract by unification)

These don't exist as named components yet — the JSX is inline in one or both source files.

| Component | Source of JSX today |
|---|---|
| `SubjectTileRow` | Inline JSX in both modal and current workstation. Both render a 3-tile row (MLS Info / Property Physical / Quick Analysis). |
| `DealStatStrip` | Inline JSX in both modal and current workstation. The horizontal strip of `DealStat` pills above the comp workspace and below the subject tile row. |
| `CompWorkspace` | Most of the `<ScreeningCompModal>` body — map + comp table + tab bar + filter chips + add comp + expand search. The largest and most complex extraction. |

### New greenfield components (NO consumer in 3C)

| Component | Purpose |
|---|---|
| `<DetailCard>` | Generic collapsed card wrapper. Props: `title`, `headline`, `context`, `badge?`, `onClick`. Used by 3E to build the right column. |
| `<DetailModal>` | Generic partial-screen modal wrapper. Props: `title`, `onClose`, `children`. Handles ESC-to-close, click-outside, backdrop. Used by 3E for card expansion. |

3C creates these as forward-looking files. They have no consumer until 3E plugs them in.

### Dead code (DELETE)

| File | Why dead |
|---|---|
| `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` | The sibling `page.tsx` is now a redirect (Step 3B Task 4). Grep confirms zero imports of this file from anywhere in the app. Dead since 3B. |

---

## 5. Decisions to Lock Before Execution

🟡 **5.1 — Where do the new shared components live?**

Three reasonable directory layouts:

**(a) `components/workstation/` (single new directory).** All workstation-specific shared UI lives in one place. `components/workstation/rehab-card.tsx`, `components/workstation/subject-tile-row.tsx`, `components/workstation/comp-workspace.tsx`, etc. The generic `<DetailCard>` and `<DetailModal>` also live here even though they're "generic" because their first consumer is the workstation.

**(b) Mixed: primitives in `components/ui/`, workstation-specific in `components/workstation/`.** The truly generic wrappers (`DetailCard`, `DetailModal`, maybe `CostLine`) go to `components/ui/`. Workstation-domain components (`RehabCard`, `SubjectTileRow`, `CompWorkspace`, `DealStatStrip`) go to `components/workstation/`. More structure, more decisions per component.

**(c) Keep them where they are and just add `export`.** Minimal directory churn. The downside is that `components/screening/screening-comp-modal.tsx` becomes the canonical home of `ExpandSearchPanel` and `AddCompByMls` even though the new Workstation also uses them, which feels backwards.

**My recommendation: (a).** It's the simplest mental model: "anything used by the Workstation lives in `components/workstation/`". If a partner portal or another consumer ever needs `<DetailCard>`, it can be promoted to `components/ui/` later. For now, single-directory keeps the navigation tight.

Whatever we pick, we should be consistent — no mixed strategies within 3C.

🟡 **5.2 — Are `<DetailCard>` and `<DetailModal>` namespaced or generic?**

Two reasonable name patterns:

**(a) Generic — `DetailCard`, `DetailModal`.** Reusable in any context. Implies "this is a UI primitive."

**(b) Namespaced — `WorkstationDetailCard`, `WorkstationDetailModal`.** Signals that it's purpose-built for the Workstation. If a different page wants a "detail card" it builds its own.

**My recommendation: (a) generic.** The spec's partner portal compatibility section (§7) explicitly designs the cards so the partner view can reuse the same components with feature flags. Namespacing them as "Workstation*" boxes us in for partner reuse later. Generic names fit the future direction.

🟡 **5.3 — Delete the dead legacy workstation file in 3C, or wait for 3F?**

**(a) Delete in 3C.** Cleaner — we're already touching all the duplicate component definitions, deleting the file removes one of the duplicates as a side effect. Reduces grep noise immediately.

**(b) Wait for 3F.** 3F is the dedicated cleanup sub-step. Bundling all "delete unused files" work in one place is more disciplined.

**My recommendation: (a).** The file is genuinely dead (zero imports), it pollutes every grep, and removing it now makes the dedupe tasks cleaner. There's no risk and no reason to wait.

🟡 **5.4 — Are `<SubjectTileRow>`, `<DealStatStrip>`, and `<CompWorkspace>` in scope for 3C?**

This is the biggest scope question. The master plan §3C lists them, but they're "build by extracting from inline JSX" rather than "lift an existing component" — much more design work than the dedupe / move tasks.

**(a) Full scope — all three in 3C.** The plan ships with the new Workstation having shared components ready to plug into. 3E becomes a "compose existing pieces" task instead of a "build everything" task. More 3C work, less 3E work.

**(b) Partial scope — only the easy ones.** 3C does the dedupes, the moves, and `<DetailCard>` / `<DetailModal>`. The "extract by unification" components (`SubjectTileRow`, `DealStatStrip`, `CompWorkspace`) get punted to **3E.0** as the first task of 3E. This keeps 3C tightly bounded and reduces the chance of subtle UI regressions in the existing modal/workstation.

**(c) Hybrid — easy "extract by unification" in 3C, hard ones in 3E.** Do `SubjectTileRow` and `DealStatStrip` in 3C (smaller, cleaner inline JSX). Defer `CompWorkspace` (the modal hero, the largest and most state-laden extraction) to 3E.

**My recommendation: (c) hybrid.** `SubjectTileRow` and `DealStatStrip` are bounded extractions of small JSX blocks; they're worth doing now to validate the shared-component pattern before 3E. `CompWorkspace` is large enough that it's basically its own sub-step — lumping it into 3C inflates the scope and risk. Saving it for 3E.5 (per the spec's internal decomposition) keeps 3C achievable.

If you push back and want everything in 3C (option a), I can do it — it just means 3C grows to 12-15 commits and the per-task risk goes up.

🟡 **5.5 — `DealStat` has two subtly different implementations. Which wins?**

Need to read both copies (modal `:1138` and workstation `:82`) and diff them. If they're identical, no decision. If they differ, we either:

- **(a) Standardize on one form.** Whichever is closer to what the spec wants. Accept that the other consumer's UI may shift slightly.
- **(b) Keep both behind a prop.** The shared `DealStat` accepts a `variant` prop and renders the right one for each consumer.

**My recommendation: defer this until I've actually read both files in detail at the start of the dedupe task.** I'll surface the diff and we'll decide then. 90% chance they're identical or near-identical and (a) wins.

🟡 **5.6 — Order of extraction.**

Should we go bottom-up (smallest primitives first) or top-down (start with the biggest extraction)?

**(a) Bottom-up.** Start with the trivial dedupes (`TrendDirectionBadge`, `CostLine`, etc.), then medium (`AddCompByMls`, `ExpandSearchPanel`), then large (`SubjectTileRow`, `DealStatStrip`). Each commit builds on the previous one.

**(b) Top-down.** Start with the new components (`<DetailCard>`, `<DetailModal>`), then the larger extractions, then the small dedupes.

**My recommendation: (a) bottom-up.** Each step is independently verifiable, and the early commits have very low risk. By the time we get to the harder extractions, we have momentum and the import patterns are established.

---

## 6. Application Code Changes

Eight workstreams (six extractions, one greenfield, one cleanup), all TypeScript/React. No schema migrations.

### 6.1 Delete the dead legacy workstation file

`app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` is unreachable after Step 3B Task 4. Delete it. Verify with one final grep that nothing imports it before the commit.

This becomes a dedupe-by-deletion: it removes one copy of `TrendDirectionBadge`, `TrendTierColumn`, and `CostLine` for free.

### 6.2 Lift small duplicated primitives

For each of `DealStat`, `TrendDirectionBadge`, `TrendTierColumn`, `CostLine`:

1. Read both implementations side-by-side. Diff them. If they differ, decide which form wins (per Decision 5.5).
2. Create the shared file (e.g. `components/workstation/cost-line.tsx`).
3. Export the canonical implementation.
4. Update both call sites to import from the new file.
5. Delete the local definitions in the source files.
6. Typecheck. Visual smoke test.

Each component is one commit.

### 6.3 Move `RehabCard` to its own file

Lift lines 216-525 of `deals/watchlist/[analysisId]/analysis-workstation.tsx` into `components/workstation/rehab-card.tsx`. Update the workstation file's imports. Verify the Rehab section of the current Workstation still renders identically. One commit.

### 6.4 Extract `ExpandSearchPanel` and `AddCompByMls` from the modal

Both are already named function components inside `screening-comp-modal.tsx`. Read each carefully — they may close over local state from the modal that needs to become props. Lift each into its own file in `components/workstation/`. Update the modal to import. Verify the modal still works end-to-end (open from queue, run search, expand, add comp by MLS#).

Two commits, one per component.

### 6.5 Build `<SubjectTileRow>` and `<DealStatStrip>` (per Decision 5.4 hybrid)

For each:

1. Find the inline JSX in both the modal and the workstation.
2. Diff them. Identify any subtle differences in rendering, prop shape, or null handling.
3. Design a clean prop interface that covers both call sites (likely just takes the same `WorkstationData` slice both files already use, plus a few display-only props).
4. Create the new component file in `components/workstation/`.
5. Replace the inline JSX in both source files with the shared component.
6. Typecheck. Visual smoke test BOTH consumers.

Each one is one commit. Skipped: `<CompWorkspace>` (deferred to 3E.5 per Decision 5.4 hybrid recommendation).

### 6.6 Build `<DetailCard>` and `<DetailModal>` (greenfield)

Pure new code. No current consumer.

**`<DetailCard>`** props per spec §6:
- `title: string` — the card title (e.g. "ARV", "Rehab", "Holding & Trans")
- `headline: string` — the prominent number (e.g. "$590k", "$78k")
- `context?: string` — small caption below headline (e.g. "5 comps · ±10% conf")
- `badge?: ReactNode` — optional indicator (e.g. trend arrow, status pill)
- `onClick: () => void` — fires when the user clicks the card to expand it
- Standard 3-line layout, click-anywhere-to-expand, hover state

**`<DetailModal>`** props per spec §6 + Decision 4 (partial-screen, not full-screen):
- `title: string`
- `onClose: () => void`
- `children: ReactNode`
- Centered overlay, ~70% viewport width, dimmed backdrop
- ESC-to-close, click-outside-to-close, focus trap (basic — full a11y can come in 3E if it doesn't ship clean here)

Both go in `components/workstation/`. Both ship with no consumer; 3E plugs them in. One commit per wrapper.

---

## 7. Ordered Task List

Each task is independently committable. Bottom-up order per Decision 5.6.

### Phase A — Cleanup (1 commit)

**Task 1:** Delete `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx`. Final grep confirms zero imports.
- Verification: typecheck passes; manual smoke test of `/analysis/<some-id>` (hits the new canonical Workstation, untouched)

### Phase B — Small primitive dedupe (4 commits)

**Task 2:** Lift `CostLine` to `components/workstation/cost-line.tsx`. Update the current Workstation file to import.
- Verification: typecheck; smoke test the Holding/Trans/Cash/Financing waterfall lines in the current Workstation

**Task 3:** Lift `TrendDirectionBadge` to `components/workstation/trend-badges.tsx` (or similar — single file holds both trend badges). Update the current Workstation AND `screening/[batchId]/[resultId]/page.tsx` to import.
- Verification: typecheck; smoke test the Price Trend display in both surfaces

**Task 4:** Lift `TrendTierColumn` into the same `trend-badges.tsx` file (it's tightly coupled to the trend display). Update the current Workstation.
- Verification: typecheck; smoke test the trend tier columns in the current Workstation

**Task 5:** Lift `DealStat` to `components/workstation/deal-stat.tsx`. **Diff the two implementations first**, surface any divergence, decide which form wins (Decision 5.5). Update both consumers (modal + current Workstation).
- Verification: typecheck; smoke test the deal stat strip in BOTH the modal AND the current Workstation

### Phase C — Move-only (1 commit)

**Task 6:** Move `RehabCard` to `components/workstation/rehab-card.tsx`. Update the current Workstation import.
- Verification: typecheck; full smoke test of the Rehab section in the current Workstation (multiple property types, manual override field)

### Phase D — Modal-internal extractions (2 commits)

**Task 7:** Extract `ExpandSearchPanel` to `components/workstation/expand-search-panel.tsx`. Read its closures carefully; lift any modal-local state into props. Update the modal to import.
- Verification: typecheck; smoke test the expand search workflow in the screening modal

**Task 8:** Extract `AddCompByMls` to `components/workstation/add-comp-by-mls.tsx`. Same approach.
- Verification: typecheck; smoke test the "add comp by MLS#" workflow in the screening modal

### Phase E — Build new shared composition components (2 commits)

**Task 9:** Build `<SubjectTileRow>` in `components/workstation/subject-tile-row.tsx`. Replace inline JSX in both the modal and the current Workstation.
- Verification: typecheck; visual diff BOTH surfaces — the 3-tile row should look identical to before

**Task 10:** Build `<DealStatStrip>` in `components/workstation/deal-stat-strip.tsx`. Replace inline JSX in both surfaces.
- Verification: typecheck; visual diff BOTH surfaces — the strip should look identical

### Phase F — Greenfield wrappers (2 commits)

**Task 11:** Build `<DetailCard>` in `components/workstation/detail-card.tsx`. Standalone, no consumer yet.
- Verification: typecheck; the file compiles. (No runtime test possible until 3E.)

**Task 12:** Build `<DetailModal>` in `components/workstation/detail-modal.tsx`. Standalone.
- Verification: typecheck; compiles. (No runtime test possible until 3E.)

### Phase G — Verification + closeout (2 commits)

**Task 13:** Full smoke test pass. Run through every existing analyst workflow that touches the modal or the current Workstation. Confirm zero behavioral differences from pre-3C.

**Task 14:** CHANGELOG entry for 3C + push to origin.

---

## 8. Files Touched

| File | Type | Why |
|---|---|---|
| `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` | DELETE | Dead code after Step 3B Task 4 |
| `components/workstation/cost-line.tsx` | NEW | Shared cost line item primitive |
| `components/workstation/trend-badges.tsx` | NEW | Shared `TrendDirectionBadge` + `TrendTierColumn` |
| `components/workstation/deal-stat.tsx` | NEW | Shared stat pill primitive |
| `components/workstation/rehab-card.tsx` | NEW | Lifted from current Workstation |
| `components/workstation/expand-search-panel.tsx` | NEW | Lifted from screening modal |
| `components/workstation/add-comp-by-mls.tsx` | NEW | Lifted from screening modal |
| `components/workstation/subject-tile-row.tsx` | NEW | Built from inline JSX in both consumers |
| `components/workstation/deal-stat-strip.tsx` | NEW | Built from inline JSX in both consumers |
| `components/workstation/detail-card.tsx` | NEW | Greenfield wrapper for 3E |
| `components/workstation/detail-modal.tsx` | NEW | Greenfield wrapper for 3E |
| `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` | EDIT | Strip ~310+ lines of duplicated/inline definitions, replace with imports |
| `components/screening/screening-comp-modal.tsx` | EDIT | Strip extracted components, replace with imports |
| `app/(workspace)/screening/[batchId]/[resultId]/page.tsx` | EDIT | Update `TrendDirectionBadge` import |
| `CHANGELOG.md` | EDIT | Phase 1 Step 3C entry |

**Approximate count:** 10 new files + 3 modified files + 1 deleted file + 1 changelog = ~15 files touched.

**NOT modified in 3C — by design:**
- Any database migration
- Any business logic, calculation engine, comp loader
- `lib/analysis/load-workstation-data.ts` and the `WorkstationData` type
- `lib/screening/*` engines
- Any route file or `page.tsx`
- Any server action file
- Navigation (`components/layout/app-chrome.tsx`)
- The `/home` performance fix (untouched)

---

## 9. Verification Checklist

After every task, run typecheck (`npx tsc --noEmit`) and reload the affected surface in the browser. Phase G is the consolidated regression check.

### Build verification

- [ ] `npx tsc --noEmit` passes after every task

### ScreeningCompModal regression check

- [ ] Open the screening queue at `/screening`
- [ ] Click any candidate to open the comp modal
- [ ] Subject tile row renders correctly (3 tiles: MLS Info / Property Physical / Quick Analysis)
- [ ] Deal stat strip renders correctly (DealStat pills)
- [ ] Comp map loads with subject + comp markers
- [ ] Comp table loads with selected comps
- [ ] Tab bar (ARV / As-Is) works
- [ ] Add Comp by MLS# workflow works
- [ ] Expand Search panel works
- [ ] Promote to Watch List works
- [ ] Pass works
- [ ] Modal close works
- [ ] No console errors

### Current Workstation regression check

- [ ] Open any property in the Watch List → `/analysis/<id>`
- [ ] Subject tile row renders (3 tiles)
- [ ] Deal stat strip renders
- [ ] ARV section renders correctly (Trend badges, tier columns)
- [ ] Rehab section renders correctly (after RehabCard move)
- [ ] Holding & Transaction section renders correctly (CostLine items)
- [ ] Financing section renders correctly (CostLine items)
- [ ] Cash Required section renders correctly (CostLine items)
- [ ] Comp map loads
- [ ] Comp table loads
- [ ] Notes section works
- [ ] Pipeline status save works
- [ ] Manual override save works (via Overrides form)
- [ ] Generate Report still works
- [ ] No console errors

### Other surfaces touched

- [ ] `/screening/<batchId>/<resultId>` renders the trend display correctly (after `TrendDirectionBadge` lift)

### Dead code verification

- [ ] After Task 1, grep the entire codebase for `analysis/properties/[id]/analyses/[analysisId]/analysis-workstation` — zero matches
- [ ] After Task 1, `/analysis/<some-id>` still loads correctly (it imports from `deals/watchlist/[analysisId]/analysis-workstation.tsx`, untouched)

---

## 10. Definition of Done

3C is complete when:

1. All planned components have been extracted, deduplicated, or built
2. The dead legacy workstation file has been deleted
3. The screening modal and the current Workstation behave **identically** to pre-3C
4. Every box in §9 is checked
5. CHANGELOG has a Phase 1 Step 3C entry
6. All commits pushed to origin
7. The new `components/workstation/` directory contains 10 new files ready for 3E to consume

---

## 11. What 3D and 3E Build on Top

**3D (Auto-persist infrastructure)** is independent of 3C and could land in parallel. It builds `useDebouncedSave`, `<SaveStatusDot>`, and the per-field server action wrapper. 3D's components do NOT depend on 3C's components; they touch different parts of the stack.

**3E (New Workstation card layout)** is the consumer of everything 3C built. 3E.1 builds the Workstation header and the orchestrating page, importing components from `components/workstation/`. 3E.2-3E.4 build the top tile row using `<SubjectTileRow>` and `<DealStatStrip>`. 3E.5 builds the hero by extracting `<CompWorkspace>` from the modal (the deferred extraction per Decision 5.4 hybrid). 3E.6 builds the right column using `<DetailCard>`. 3E.7 builds the per-card modals using `<DetailModal>`. Without 3C, 3E would have to do all of this work itself; with 3C, 3E becomes a "compose existing pieces" task with clean prop interfaces already designed.

---

## 12. Open Questions — RESOLVED

🟢 **5.1 — DECIDED: (a) `components/workstation/` single new directory.** All extracted and new shared components live here. If a partner portal or another consumer ever needs `<DetailCard>`, it can be promoted to `components/ui/` later.

🟢 **5.2 — DECIDED: (a) generic names.** `DetailCard` and `DetailModal` keep generic names — the spec's partner portal compatibility (§7) explicitly designs for cross-context reuse and namespacing them as `Workstation*` would box us in.

🟢 **5.3 — DECIDED: (a) delete in 3C.** The dead legacy workstation file gets removed as Task 1.

🟢 **5.4 — DECIDED: (c) hybrid scope.** `SubjectTileRow` and `DealStatStrip` are in 3C (Tasks 9 and 10). `CompWorkspace` is deferred to 3E.5 where the spec's internal decomposition already places it.

🟢 **5.5 — DEFERRED to Task 5 execution.** Read both `DealStat` implementations side-by-side at the start of Task 5, surface any divergence, and decide then. Current expectation: 90% chance they're identical or near-identical and we standardize on one form.

🟢 **5.6 — DECIDED: (a) bottom-up order.** Small primitives first (Tasks 2-5), then move-only (Task 6), then modal-internal extractions (Tasks 7-8), then build-new-by-unification (Tasks 9-10), then greenfield wrappers (Tasks 11-12).

All decisions locked 2026-04-11. Ready to execute.

---

*Drafted by Claude Opus | 2026-04-11 | Awaiting Dan's review before execution*

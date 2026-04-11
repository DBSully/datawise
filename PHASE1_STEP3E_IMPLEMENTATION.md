# Phase 1 — Step 3E — New Workstation Card Layout

> **Goal:** Build the new Analysis Workstation per `WORKSTATION_CARD_SPEC.md`. **Largest single piece of work in Step 3.** Decomposed into 8 internal sub-tasks (3E.1 through 3E.8) so each piece is independently verifiable. Per Dan's call (locked Decision 5.1), the side-by-side rollout from master plan Decision 6.6 is dropped — the legacy Workstation file gets deleted in 3E.1 and only the new Workstation exists from that point onward. Daily underwriting work during 3E falls back to the screening modal at `/screening` (which is independent of the Workstation).
> **Status:** READY TO EXECUTE — all 7 decisions locked (5.1 dropped side-by-side; 5.2 filename; 5.3 read-only modals first; 5.4 Partner Sharing stub; 5.5 ship Notes DEFAULT migration in 3E.7; 5.6 pre-locked override indicator; 5.7 per-sub-task smoke test)
> **Authority:** `WORKSTATION_CARD_SPEC.md` (locked, all 9 master decisions resolved) + `PHASE1_STEP3_MASTER_PLAN.md` §3E (sub-step decomposition + Decisions 6.1, 6.7) + completion of 3A, 3B, 3C, 3D. Master plan Decision 6.6 (side-by-side rollout) is **superseded** by 3E plan Decision 5.1.
> **Date:** 2026-04-11
> **Risk level:** Highest in Step 3. Mitigation: internal sub-step ordering means each piece is verifiable in isolation, per-sub-task smoke testing catches regressions early, and the screening modal at `/screening` remains the daily-work fallback for property review. The Workstation itself is only available in its in-progress state during 3E.
> **Estimated scope:** 0 SQL migrations (1 small DEFAULT change in 3E.7), ~20-23 commits, ~15-25 new files, 4 modified files, ~3,000-5,000 net lines of new code

---

## 1. What 3E Accomplishes

3E is the **payoff sub-step** of Step 3. Everything 3A through 3D built up to this moment:
- 3A's schema work (notes visibility, next_step column, transaction engine restructure, cash required schema, bed/bath level fields) is now consumed by the cards that read those fields.
- 3B's route restructure put the canonical Workstation at `/analysis/[analysisId]` so 3E has a real home for the new code.
- 3C's component extraction populated `components/workstation/` with 11 reusable building blocks the new Workstation imports.
- 3D's auto-persist infrastructure (`useDebouncedSave`, `SaveStatusDot`, `saveManualAnalysisFieldAction`) is consumed by every editable input in the new tiles and modals.

The 8 sub-tasks deliver the spec's full layout:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  HEADER BAR — address, status badges, Mark Complete / Share / Generate Report  │  ← 3E.2
├─────────────────────────────────────────────────────────────────────────────────┤
│  [ MLS Info ] [ Property Physical + bed/bath grid ] [ Quick Analysis ] [ QStat ] │  ← 3E.3
├─────────────────────────────────────────────────────────────────────────────────┤
│  DEAL STAT STRIP — ARV │ Max Offer │ Offer% │ Gap/sqft │ Rehab │ Profit │ Trend │  ← 3E.4
├──────────────────────────────────────────────────────┬──────────────────────────┤
│                                                      │                          │
│  HERO — COMP WORKSPACE                               │  RIGHT TILE COLUMN       │  ← 3E.5 + 3E.6
│  Map left, comp table right, tab bar, controls       │  9 collapsible cards     │
│                                                      │  with click-to-expand    │
│                                                      │  → DetailModal (3E.7)    │
└──────────────────────────────────────────────────────┴──────────────────────────┘
```

**3E explicitly does NOT do these things — they belong to 3F or beyond:**

| Out of scope | Belongs to |
|---|---|
| Deleting the legacy `analysis-workstation.tsx` at `deals/watchlist/[analysisId]/` | 3F |
| Removing the existing `saveManualAnalysisAction` bulk form action | 3F |
| Removing `analysis_notes.is_public` deprecated column | 3F |
| Removing the dev test harness from 3D | 3F |
| Activating the legacy `/deals/watchlist/*` redirect to `/analysis/*` | 3F |
| Final Step 3 CHANGELOG + tag `phase1-step3-complete` | 3F |
| Partner Sharing card full backend (Realtime sync, share tokens, partner_analysis_versions, partner_feedback) | Step 4 |
| Scrape and Rental comp engine work | Future phases |
| Per-card override-rate adjustments (e.g., per-deal Acquisition Fee override) | Out of scope |
| Responsive layout below ~1280px viewport | Out of scope per spec |

---

## 2. The #1 Constraint

**Each sub-task must leave the Workstation in a viewable state, even if not all features work yet.** Per Decision 5.1, the legacy Workstation gets deleted in 3E.1 and there is no Workstation fallback during 3E. Sub-task quality matters more than ever — a broken sub-task blocks the entire Workstation until fixed.

**Two key implications:**

1. **Each sub-task gets its own smoke test before moving on** (per Decision 5.7). 3E is high-risk and 8 sub-tasks deep; catching a regression in 3E.3 before building 3E.4 on top of it is much cheaper than finding it after 3E.8.

2. **Every sub-task should leave the Workstation viewable.** Even if a section is just a placeholder, the page should render without errors. Stub-but-visible is the bar — never "compiles but crashes when navigating".

**The 3B wrapper pattern is preserved.** Today, `/deals/watchlist/[analysisId]/page.tsx` is a one-line re-export of `/analysis/[analysisId]/page.tsx`. Without side-by-side, this is fine — both URLs serve the new Workstation. The legacy URL becomes a redundant alias for the canonical URL throughout 3E. In 3F, the legacy URL gets converted from a re-export wrapper into a hard `redirect()` call.

**The legacy Workstation file gets deleted in 3E.1.** `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` is removed as part of the first sub-task. The screening modal at `/screening` is independent of the legacy Workstation file (it imports `<SubjectTileRow>` and other shared components from `components/workstation/`, not from the legacy Workstation), so deleting the legacy file does not affect the screening modal.

**Daily-work fallback during 3E:** the **screening modal at `/screening`** is independent of the Workstation and stays fully functional throughout 3E. For property review and comp selection, the screening modal is the fallback. For deep underwriting work that requires the full Workstation card layout, the new Workstation is the only option — and it's incrementally usable as 3E progresses (header + tile row + strip after ~Task 7, full read-only after Task 11, full edit after Task 20).

---

## 3. Risk & Rollback

| Workstream | Risk | Why | Mitigation |
|---|---|---|---|
| 3E.1 (skeleton + delete legacy) | Low | Pure file delete + skeleton creation; no migration of state, no behavior carry-over | Verify the new skeleton renders at `/analysis/<id>` and that the screening modal still loads |
| 3E.2 (header) | Low | Mostly visual; reuses existing server actions | Visual diff against the spec mockup |
| 3E.3 (top tile row) | Medium | Quick Analysis + Quick Status are the first consumers of 3D's auto-persist; cascades feed Deal Stat Strip in 3E.4. The screening modal still uses `<SubjectTileRow>` so the prop API for any extension has to keep both consumers happy. | Per-tile sub-commits; each tile verified independently before moving on; smoke test the screening modal after each `<SubjectTileRow>` change |
| 3E.4 (deal stat strip + override indicators) | Medium | Override indicator math (manual vs cascading-derived) is new; cascade rule must be correct | Spot-check by toggling Manual ARV / Rehab Override / Target Profit and verifying the cascade highlighting |
| 3E.5 (hero comp workspace + CompWorkspace extraction) | High | Largest extraction in 3E (deferred from 3C); replicates the screening modal's hero in a new wrapper; map + table + controls + tabs all wired together. The screening modal is the SECOND consumer of `<CompWorkspace>` so the prop API has to support both. | Save for after 3E.3-3E.4 are stable; build the extracted shell first, plug into screening modal first (regression test), then plug into the new Workstation hero |
| 3E.6 (right column collapsed cards) | Low-Medium | 9 DetailCard instances reading from WorkstationData; pure presentation, no state | Each card's headline/context computation is a small pure function; visual diff against legacy Workstation values from memory or git history |
| 3E.7 (per-card detail modals — 9 total) | High | Each modal is its own self-contained editor; some need 3D auto-persist; some are read-only; one per commit means many sub-commits. **Highest-risk phase** because there's no Workstation fallback if a save path breaks. | One modal per commit; full smoke test of editing workflow per card; verify save persistence by reloading the page after each test |
| 3E.8 (cross-card cascades + polish) | Medium | Cascades like "Days Held in Quick Analysis updates Holding card headline" require shared state across cards; keyboard navigation; final visual polish | Verify cascade chain end-to-end after each cascade is wired |

**Rollback procedure:**

Without side-by-side, the rollback strategy depends on the failure mode:

1. **Single sub-task fails:** `git revert` the sub-task's commits in reverse order. The Workstation reverts to its prior in-progress state. Each prior sub-task should leave the Workstation in a viewable (if incomplete) state, so reverting should always land on a usable surface.

2. **A sub-task fails but commits before discovery:** Same as #1, but discovered later. Same revert procedure.

3. **Catastrophic state where the Workstation can't render at all:** `git reset --hard` to the last known-good commit (the `phase1-step3d-complete` reference is `569d768`; each Phase A-G boundary is also a recovery point). The screening modal stays functional throughout for property review.

The screening modal at `/screening` is the daily-work fallback and is independent of any 3E code. Even in the worst-case rollback scenario, the screening modal continues to work.

---

## 4. Existing Infrastructure 3E Consumes

### From 3A (schema)

| Field | Where | Used by |
|---|---|---|
| `analysis_notes.visibility` enum + `visible_to_partner_ids` | Notes card modal (3E.7) | Three-tier visibility selector |
| `manual_analysis.next_step` | Quick Status tile (3E.3) | Next Step dropdown |
| `TransactionDetail` 6-line breakdown + `acquisitionSubtotal` / `dispositionSubtotal` | Holding & Trans card modal (3E.7) | New transaction display |
| `cashRequired` extended fields (`acquisitionCommission`, `acquisitionFee`, `acquisitionSubtotal`, `carrySubtotal`) | Cash Required card modal (3E.7) | New breakdown |
| `WorkstationData.physical` bed/bath level fields | Property Physical tile (3E.3) | Bed/bath mini-grid |

### From 3B (routes)

- `app/(workspace)/analysis/[analysisId]/page.tsx` — server component, currently imports the legacy client. 3E.1 updates this to import the new client.
- `app/(workspace)/deals/watchlist/[analysisId]/page.tsx` — currently a wrapper. 3E.1 breaks the wrapper.

### From 3C (components/workstation/)

| Component | Used by |
|---|---|
| `CardTitle` | Every card modal in 3E.7 |
| `CostLine` | Holding/Trans, Financing, Cash Required modals |
| `DealStat` | Deal Stat Strip in 3E.4 |
| `DealStatStrip` | 3E.4 directly |
| `RehabCard` | Rehab card modal (3E.7), lifted out of the legacy workstation in 3C Task 6 — 3E.7's task is to wire it up inside DetailModal and remove its current Save button |
| `SubjectTileRow` | The first 3 tiles of the top row in 3E.3 |
| `TrendDirectionBadge` + `TrendTierColumn` | Price Trend card modal (3E.7) |
| `AddCompByMls` + `ExpandSearchPanel` | Hero comp workspace (3E.5) |
| `DetailCard` | All 9 right-column cards in 3E.6 |
| `DetailModal` | All 9 card modals in 3E.7 |

### From 3D (lib/auto-persist/)

| Primitive | Used by |
|---|---|
| `useDebouncedSave` hook | Quick Analysis tile (3E.3, 4 inputs), Quick Status tile (3E.3, 4 dropdowns), Financing card modal (3E.7, 3 inputs), Pipeline card modal (3E.7, status fields), Notes card modal (3E.7, edit visibility on existing notes) |
| `SaveStatusDot` | Inline next to every input in the above |
| `saveManualAnalysisFieldAction` | Backing every auto-persist call |

### Existing components (not touched, just imported)

- `CompMap` (`components/properties/comp-map.tsx`) — used by the hero comp workspace
- `ArvBreakdownTooltip` (`components/screening/arv-breakdown-tooltip.tsx`) — used by the comp table inside the hero
- `loadWorkstationData` (`lib/analysis/load-workstation-data.ts`) — the server-side data loader, called by `app/(workspace)/analysis/[analysisId]/page.tsx`

---

## 5. Decisions to Lock Before Execution

🟢 **5.1 — DECIDED: Drop side-by-side rollout.**

Per Dan's call, supersedes master plan Decision 6.6. The legacy Workstation file at `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` is **deleted in 3E.1**. The 3B re-export wrapper at `/deals/watchlist/[analysisId]/page.tsx` is **preserved throughout 3E** — both URLs serve the new Workstation via the wrapper. In 3F the wrapper converts to a hard `redirect()` call.

**Rationale:** the project is in active development with one user. The screening modal at `/screening` is independent of the Workstation and remains the daily-work fallback for property review during 3E. The complexity reduction from dropping side-by-side (~1-2 fewer commits, smaller 3F, no two-Workstation maintenance burden) outweighs the loss of Workstation fallback during the multi-day 3E execution. If a sub-task ships broken, `git revert` rollback is fast and the screening modal continues to work for property review.

**Implications for 3E execution:**
- 3E.1 deletes the legacy file as one of three bundled actions (skeleton + page.tsx import update + legacy delete)
- The screening modal must keep working after every sub-task that touches a shared component (`<SubjectTileRow>`, `<DealStatStrip>`, `<CompWorkspace>`, etc.) — this is a regression-test requirement at every sub-task boundary
- 3F is smaller — the legacy Workstation file deletion that originally lived in 3F is now part of 3E.1

🟡 **5.2 — Filename for the new Workstation client.**

The new Workstation client component lives at `app/(workspace)/analysis/[analysisId]/`. Two name options:

**(a) `analysis-workstation.tsx`** — same name as the legacy client (which lives at `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx`). Different directory means no collision. Signals "this IS the canonical Workstation" — the new one inherits the canonical name.

**(b) `analysis-workstation-v2.tsx`** — clearer that it's distinct from the legacy. Less risk of confusing the two during 3E.

**My recommendation: (a) `analysis-workstation.tsx`.** They're in different directories so there's no name collision. The "v2" suffix would feel temporary and would have to be renamed in 3F when the legacy is deleted. Using the same name from the start signals the right hierarchy.

🟡 **5.3 — Per-card modal order in 3E.7.**

The spec lists 9 right-column cards (ARV, Rehab, Holding & Trans, Financing, Cash Required, Price Trend, Pipeline Status, Notes, Partner Sharing). 3E.7 builds one modal per card. Three reasonable orderings:

**(a) Read-only first, then edit-heavy.** Start with cards that don't write (ARV, Cash Required, Price Trend) so the modal pattern is established with low risk. Then move to cards with auto-persist inputs (Rehab, Financing, Pipeline, Notes). Partner Sharing last (it's a stub).

**(b) Master plan order.** ARV → Rehab → Holding/Trans → Financing → Cash Required → Price Trend → Pipeline → Notes → Partner Sharing. Mirrors the order in the master plan §3E.7.

**(c) Spec section order.** §5.1 ARV → §5.2 Rehab → §5.3 Holding/Trans → §5.4 Financing → §5.5 Cash Required → §5.6 Price Trend → §5.7 Pipeline → §5.8 Notes → §5.9 Partner Sharing. Same as master plan order.

**My recommendation: (a) read-only first.** Build ARV first as the canonical example of a read-only modal. Then Cash Required (also read-only, but cascades from Decision 5). Then Price Trend (read-only). That establishes the DetailModal usage pattern across 3 cards before any editing UI is wired. After that, move to the editing modals: Rehab → Holding/Trans → Financing → Pipeline → Notes → Partner Sharing. Each editing modal is more complex than the last (Notes has the three-tier visibility model, Partner Sharing has the share creation form).

If you want to mirror the spec section order instead, (b) and (c) are also valid. The order just affects developer flow during 3E.7, not the final result.

🟡 **5.4 — Realtime in 3E.7's Partner Sharing card.**

Decision 9 in the spec says "Use Supabase Realtime in Phase 1" for the Partner Sharing card. The realtime hookup subscribes to `analysis_shares` and `partner_feedback` table events for the current analysis and updates the card live without page refresh.

**(a) Ship Realtime in 3E.7.** The Partner Sharing card modal includes the full Realtime subscription. Requires the underlying tables (`analysis_shares`, `partner_feedback`) to exist — they don't yet. Would require a schema migration to land in 3E. Significantly expands 3E's scope.

**(b) Ship a STUB in 3E.7, defer Realtime to Step 4.** The Partner Sharing card renders as a placeholder explaining "Phase 1 partner portal is coming in Step 4". No Realtime, no schema. Card modal shows the future structure but isn't functional. Recommended.

**My recommendation: (b) stub in 3E.7, full Partner Sharing card in Step 4.** The full feature requires new tables (`analysis_shares`, `partner_analysis_versions`, `partner_feedback`), new server actions, an email integration via Resend, and Realtime subscriptions. All of that is Step 4 scope per the master plan. 3E.7's Partner Sharing card is a placeholder so the layout reserves the slot, but the implementation is deferred. The header Share button is also a placeholder for the same reason.

🟡 **5.5 — Notes card visibility model migration timing.**

3A added the `visibility` enum column to `analysis_notes` and backfilled it to `'all_partners'` (per 3A's "transition period default" rationale). The full visibility model with the three-tier UI ships in 3E.7's Notes card modal. At that point, the spec calls for changing the column DEFAULT from `'all_partners'` to `'internal'` (the eventual target).

Two options for the DEFAULT change:

**(a) Ship the DEFAULT change as part of the 3E.7 Notes modal commit.** A small migration `ALTER COLUMN visibility SET DEFAULT 'internal'` lands alongside the new Notes card modal that writes the `visibility` field directly. New notes created via the new Notes card use the new tier UI; new notes created via the legacy Notes card modal (still active in the legacy Workstation through 3F) get DEFAULT `'internal'`. Recommended.

**(b) Defer the DEFAULT change to 3F.** 3F handles all post-migration cleanup; the DEFAULT change ships there. 3E.7's Notes modal writes `visibility` explicitly so the DEFAULT doesn't matter for new notes from the new card.

**My recommendation: (a) ship the DEFAULT change in 3E.7.** It's a one-line `ALTER` and it removes a piece of "transition period" cruft as soon as the new Notes UI exists. (a) and (b) produce identical end-state — (a) just lands the cleanup sooner.

🟡 **5.6 — Override indicator visual treatment in 3E.4 (Decision 6.1 was already locked at master plan level — surfacing for visibility).**

🟢 **Pre-locked at master plan level** — Decision 6.1: A + B combined. Manually-overridden values render in `indigo-700` (cascading values in `indigo-500`) and carry a small `ᴹ` superscript marker. Default automated values render in `slate-900`. No new decision needed.

🟡 **5.7 — Test verification cadence.**

Each sub-task touches a different surface area. How to verify each:

**(a) Per-sub-task manual smoke test.** After each sub-task commit, walk through the sub-task's specific functionality at `/analysis/[id]`. Catches regressions early but adds verification overhead per sub-task.

**(b) End-of-3E full regression sweep.** Build all 8 sub-tasks, then do a single comprehensive smoke test at the end. Less per-sub-task overhead but risks compounding bugs.

**My recommendation: (a) per-sub-task.** 3E is high-risk and 8 sub-tasks deep. Catching a regression in 3E.3 before building 3E.4 on top of it is much cheaper than finding it after 3E.8.

---

## 6. Application Code Changes

Eight workstreams (3E.1 through 3E.8). Each workstream becomes one or more commits.

### 6.1 — 3E.1: Skeleton + delete legacy

**Three things in this sub-task, all bundled into a single commit since they have to land atomically (none of the three works without the others):**

**(a) Create the new Workstation client skeleton.** New file at `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx` (per Decision 5.2 — `analysis-workstation.tsx`, same name as the legacy file but in a different directory). Initial skeleton:

```typescript
// app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx
// Phase 1 Step 3E.1 — new Workstation skeleton.
//
// Builds up incrementally throughout 3E.2-3E.8. At this point only
// the layout regions are stubbed; actual content arrives in
// subsequent sub-tasks.

"use client";

import type { WorkstationData } from "@/lib/reports/types";

type AnalysisWorkstationProps = {
  data: WorkstationData;
};

export function AnalysisWorkstation({ data }: AnalysisWorkstationProps) {
  return (
    <div className="dw-section-stack-compact">
      {/* HEADER BAR — 3E.2 */}
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        HEADER BAR (3E.2)
      </div>

      {/* TOP TILE ROW — 3E.3 */}
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-500">
        TOP TILE ROW (3E.3) — MLS Info / Property Physical / Quick Analysis / Quick Status
      </div>

      {/* DEAL STAT STRIP — 3E.4 */}
      <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-2 text-xs text-slate-500">
        DEAL STAT STRIP (3E.4)
      </div>

      {/* HERO + RIGHT COLUMN — 3E.5 + 3E.6 */}
      <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 320px" }}>
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-xs text-slate-500">
          HERO COMP WORKSPACE (3E.5)
        </div>
        <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-4 py-12 text-xs text-slate-500">
          RIGHT TILE COLUMN (3E.6 + 3E.7)
        </div>
      </div>

      {/* Reference: analysis ID for verification */}
      <div className="text-[10px] text-slate-400">
        analysisId: <span className="font-mono">{data.analysisId}</span>
      </div>
    </div>
  );
}
```

**(b) Update the canonical page.tsx to import the new client via the relative path.** Currently `/analysis/[analysisId]/page.tsx` imports the legacy client via absolute path. Change the import:

```typescript
// app/(workspace)/analysis/[analysisId]/page.tsx
// Update line 21 from:
// import { AnalysisWorkstation } from "@/app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation";
// To:
import { AnalysisWorkstation } from "./analysis-workstation";
```

**(c) Delete the legacy Workstation file.** Once the canonical page.tsx no longer imports from the legacy path, the legacy file is orphaned. Delete `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx`. Verify with one final grep that nothing else in the codebase imports from that path before deletion.

**The 3B re-export wrapper at `/deals/watchlist/[analysisId]/page.tsx` is preserved.** It continues to be `export { default } from "@/app/(workspace)/analysis/[analysisId]/page"`. After 3E.1, both `/analysis/<id>` and `/deals/watchlist/<id>` serve the new Workstation skeleton because both routes resolve to the same canonical page.tsx, which now imports the new client. In 3F, the legacy wrapper file gets converted from a re-export into a hard `redirect()` call.

**Verification:** open `/analysis/<some-id>` → see the dashed-box skeleton. Open `/deals/watchlist/<some-id>` → see the **same** dashed-box skeleton (the wrapper still works, just points at the new client now). Open `/screening` → screening modal still works. Grep confirms zero imports of the deleted legacy file.

### 6.2 — 3E.2: Header bar + status badges + share pill

Per spec §3.1. Implements:
- Left: `← Hub` link to `/admin/properties/<property-id>` (or wherever the hub link goes — the legacy Workstation has this; preserve the same target)
- Center: address + city/state/zip (truncate on overflow)
- Right side, stacked:
  - Status badges row: MLS#, MLS status, strategy type, completed-at timestamp if set
  - **Active share pill placeholder** — renders nothing in 3E.2 (Step 4 wires it)
  - Action buttons row: Mark Complete / Update Complete (toggles based on `analysis_completed_at`), Share (placeholder per Decision 5.4), Generate Report (calls existing `generateReportAction`)

The Mark Complete and Generate Report buttons reuse the existing server actions from the legacy Workstation (`markAnalysisCompleteAction`, `generateReportAction`). No new server-side work for the header.

**Verification:** open `/analysis/<id>` → see header bar with address and the 3 action buttons. Click Mark Complete → state updates and the button label flips. Click Generate Report → existing report dialog opens.

### 6.3 — 3E.3: Four-tile top row

Four tiles, each its own commit if size warrants splitting. 3C's `<SubjectTileRow>` covers Tiles 1-3 (MLS Info / Property Physical / Quick Analysis), but 3E.3 needs to UPGRADE that component:

**Tile 1 (MLS Info)** — already done by `<SubjectTileRow>`. No new work.

**Tile 2 (Property Physical with bed/bath grid)** — `<SubjectTileRow>` currently renders the property physical fields but does NOT have the bed/bath level mini-grid that 3A's schema work prepared for. 3E.3 EXTENDS `<SubjectTileRow>` (or carves the Property Physical part out into its own component) to include the 5-column mini-grid using the new bed/bath level fields from `WorkstationData.physical`. Per spec §3.2:

```
┌──────────────────────────┐
│       Tot  Main  Up  Lo  │
│  Bd    4    2    2   —   │
│  Ba    2    1    1   —   │
└──────────────────────────┘
```

**Tile 3 (Quick Analysis with auto-persist)** — `<SubjectTileRow>`'s current Quick Analysis tile uses local-only state (no auto-persist). The screening modal at `/screening` continues to use `<SubjectTileRow>` and continues to want the local-only Quick Analysis (it's a what-if scratchpad in the modal context). 3E.3 either:
- (i) Updates `<SubjectTileRow>` to wire each input to `useDebouncedSave` + `saveManualAnalysisFieldAction` behind a `mode: "modal" | "workstation"` prop. The screening modal opts out of auto-persist via `mode="modal"` (default).
- (ii) Carves the Quick Analysis tile OUT of `<SubjectTileRow>` into a new `<QuickAnalysisTile>` component that handles the auto-persist itself. The screening modal keeps its current `<SubjectTileRow>` with the local-only Quick Analysis tile included; the new Workstation uses `<SubjectTileRow>` for tiles 1-2 only (or extracts the MLS+Physical pair into a new component) and uses the new `<QuickAnalysisTile>` for tile 3.

**My recommendation: (ii) carve out.** Two reasons:
- The auto-persist version of Quick Analysis has fundamentally different state semantics (controlled by parent + saved to DB) than the local-only version (transient scratchpad). Mixing them behind a `mode` prop forces every prop to be either-or, and the prop list balloons.
- The screening modal's Quick Analysis tile is conceptually a what-if scratchpad — typing a value there should NOT persist to the analysis. That's a deliberate design difference, not an accident. Carving them out makes the difference explicit.

This means after 3E.3:
- Screening modal: still uses `<SubjectTileRow>` with all 3 of its tiles including the local-only Quick Analysis (no change to the modal)
- New Workstation: uses `<SubjectTileRow>` for tiles 1-2 only AND uses the new `<QuickAnalysisTile>` for tile 3

**Tile 4 (Quick Status with auto-persist)** — brand new component. Single column of 4 dropdowns: Interest Level, Condition, Location, Next Step. Each dropdown wired to `useDebouncedSave` + `saveManualAnalysisFieldAction` with the right field name (Interest Level → `interest_level` on `analysis_pipeline`; the other 3 → `manual_analysis`). The `useDebouncedSave` hook works fine with discrete dropdown changes — the debounce just fires immediately on the next render since the value is settled.

**Sub-task structure (4 commits inside 3E.3):**
- 3E.3.a — extend Property Physical with the bed/bath mini-grid
- 3E.3.b — build `<QuickAnalysisTile>` with auto-persist on 4 numeric fields
- 3E.3.c — build `<QuickStatusTile>` with auto-persist on 4 dropdowns
- 3E.3.d — wire all 4 tiles into the Workstation skeleton, replace the dashed-box stub

**Verification:** open `/analysis/<id>` → see all 4 tiles with real data. Type into Manual ARV → status dot cycles, value persists. Change Next Step dropdown → persists. Reload page → values still there.

### 6.4 — 3E.4: Deal Stat Strip with override indicators

3C's `<DealStatStrip>` already does most of the work (rendered identically in both legacy Workstation and screening modal after the 3C Task 10 unification). 3E.4 adds the **override indicator** treatment per Decision 6.1.

The override indicator is a per-value visual marker that shows whether the value came from automated calculation or a manual override. Three states per value:

| State | Visual | When |
|---|---|---|
| Auto | `text-slate-900` (default) | No override active for this value or any upstream value |
| Manual | `text-indigo-700` + `ᴹ` superscript | Value is directly manually overridden (e.g., user typed Manual ARV) |
| Cascading | `text-indigo-500` (lighter) | Value derives from a manual override upstream (e.g., Max Offer when Manual ARV is set) |

**Cascade rules:**
- `arv_manual` set → ARV is "manual"; Max Offer / Offer% / Gap-sqft are "cascading"
- `rehab_manual` set → Rehab is "manual"; Max Offer / Offer% are "cascading" (Rehab affects Max Offer, which affects Offer%)
- `target_profit_manual` set → Target Profit is "manual"; Max Offer / Offer% are "cascading"
- `days_held_manual` set → no Deal Stat Strip implication directly (cascades into Holding card instead)

3E.4 either extends `<DealStatStrip>` with override-indicator props OR builds a new `<WorkstationDealStatStrip>` wrapper that adds the override-indicator logic on top. **My recommendation: extend `<DealStatStrip>`** with optional override indicator props (`arvOverride?`, `rehabOverride?`, etc.) so the screening modal can keep its current variant and the Workstation passes the override flags.

Also adds the right-side comp count + Copy MLS buttons to the Workstation's strip (the modal already has them via the `rightSlot`; the Workstation needs them too).

**Verification:** open `/analysis/<id>` → strip shows all 7 stats + Trend. Type a Manual ARV value → ARV pill turns indigo with `ᴹ` superscript; Max Offer / Offer% / Gap-sqft go lighter indigo. Clear the Manual ARV → all 4 revert to slate-900.

### 6.5 — 3E.5: Hero comp workspace (`<CompWorkspace>` extraction)

This is the **largest extraction in 3E** and the deferred extraction from 3C per Decision 5.4 hybrid. Builds a new shared `<CompWorkspace>` component that wraps:
- The map (left side, ~380px)
- The comp table (right side, fills remaining width)
- The 4-tab bar (ARV / As-Is / Scrape placeholder / Rental placeholder)
- The map under-controls (`<AddCompByMls>` + `<ExpandSearchPanel>` from 3C)
- The "Show Selected Only" filter checkbox
- The subject row (sticky) at the top of the comp table

The screening modal currently has all of this inline (~400 lines of JSX). 3E.5 extracts it into `components/workstation/comp-workspace.tsx` as a single shared component, then plugs it into BOTH:
- The screening modal (replaces the inline JSX with `<CompWorkspace>`)
- The new Workstation hero (3E.5)

This is the deferred Task 9 from 3C — the spec called for extracting `<CompWorkspace>` in 3C, but it was the largest and most state-laden extraction so we deferred it. 3E.5 finally does it.

**Sub-tasks inside 3E.5:**
- 3E.5.a — design the `<CompWorkspace>` prop interface (data flows, callback shape, selection state lifting)
- 3E.5.b — extract the inline JSX from the screening modal into the new file
- 3E.5.c — verify the modal still works identically (regression smoke test — this is critical because the screening modal is the daily-work fallback during 3E)
- 3E.5.d — wire `<CompWorkspace>` into the new Workstation, replace the hero skeleton stub

**Verification:** open `/analysis/<id>` → see comp map and comp table side by side. Pick a comp → selection persists. Click an inactive tab → see the Scrape/Rental placeholder. **Critical regression check:** open the screening modal from `/screening` → still works exactly as before. Pick comps, run Expand Search, Add by MLS#, Promote to Watch List — all workflows verified. The screening modal is the daily-work fallback during 3E and breaking it has high impact.

### 6.6 — 3E.6: Right column collapsed cards

9 `<DetailCard>` instances stacked vertically in a column on the right side of the layout. Each card computes its headline/context strings from a combination of `WorkstationData` (server-loaded) AND **live state from the Quick Analysis tile** (per the cross-card cascade requirement — see the call-out below). Clicking a card calls `onExpand` which sets state in the parent to open the corresponding modal — but the modals don't exist yet (3E.7 builds them). For 3E.6, clicking a card just toggles a placeholder modal that says "<Card name> modal coming in 3E.7".

**🚨 Known legacy bug 3E.6 must NOT replicate:** the legacy Workstation has a "Deal Math" card whose displayed values come from server-loaded `d.dealMath` instead of the live `liveDeal` memo computed from Quick Analysis inputs. So in the legacy Workstation, typing a Manual ARV updates the Deal Stat Strip (which reads from `liveDeal`) but **not** the Deal Math card (which reads from server data). Dan surfaced this during Step 3D testing.

The new Workstation **proactively avoids this** because:
1. The spec doesn't have a standalone "Deal Math" card — its content is split across the Deal Stat Strip (3E.4) + ARV card + Cash Required card + Holding/Trans card.
2. Every one of those cards must compute its **headline from live state** (the same `liveDeal` memo the Deal Stat Strip uses), not from server-loaded `d.dealMath`/`d.cashRequired`/`d.holding`/etc.

**Explicit requirement for 3E.6 implementation:** the parent component (the new `AnalysisWorkstation` in `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx`) must hoist the `liveDeal` computation to its top level and pass derived headline values down to each `<DetailCard>` as props. Cards must NOT read directly from `data.dealMath`, `data.cashRequired`, etc. for any value that depends on Quick Analysis overrides — they must read from the parent's hoisted live state.

**Cards affected by this requirement** (each must reflect Quick Analysis cascade):
- **ARV card** — headline = `liveDeal.arv` (responds to Manual ARV)
- **Rehab card** — headline = `liveDeal.rehabTotal` (responds to Rehab Override + Condition cascade)
- **Holding & Transaction card** — headline = `liveDeal.holdingTotal + liveDeal.transactionTotal` (responds to Days Held)
- **Cash Required card** — headline = `liveDeal.totalCashRequired` (responds to ARV / Rehab / Days Held cascade through Max Offer)
- **Financing card** — headline = `liveDeal.financingTotal` (responds to manual rate/LTV/points cascade — NOT in Quick Analysis but in Financing card modal)

**Cards unaffected** (read directly from `WorkstationData` since their headlines don't depend on Quick Analysis):
- **Price Trend card** — pure market data
- **Pipeline Status card** — pipeline state, not deal math
- **Notes card** — note count
- **Partner Sharing card** — share state (stub)

**The 9 cards** (sorted in the spec's order):
1. ARV
2. Rehab
3. Holding & Transaction
4. Financing
5. Cash Required
6. Price Trend
7. Pipeline Status
8. Notes
9. Partner Sharing (placeholder)

For each card, 3E.6 implements just the COLLAPSED state — title, headline number, context line, optional override badge. The expansion (modal) is 3E.7's job.

**Verification:** open `/analysis/<id>` → see 9 collapsible cards stacked in the right column. Click each → see the placeholder modal. Verify each card's headline matches the value shown in the corresponding section of the legacy Workstation.

### 6.7 — 3E.7: Per-card detail modals

9 modals, one per card. Per Decision 5.3 the order is read-only first, then editing modals:

**Read-only modals (3E.7.a, 3E.7.b, 3E.7.c):**
1. **`<ArvCardModal>`** — 3-tier display (Auto / Selected / Final), per-comp ARV table, comp summary stats. No editable fields. Footer: `Edit Manual ARV →` link that focuses the Quick Analysis tile.
2. **`<CashRequiredCardModal>`** — full breakdown with the new acquisition section (down payment + acq title + acq commission signed + acq fee + origination + acq subtotal) and project carry section (rehab OOP + holding total + interest cost + carry subtotal). All read-only.
3. **`<PriceTrendCardModal>`** — confidence badge, direction badge (uses 3C's `TrendDirectionBadge` with `prominent` variant), local + metro tier columns (uses 3C's `TrendTierColumn`), summary text. All read-only.

**Edit modals (3E.7.d through 3E.7.i):**

4. **`<RehabCardModal>`** — wraps 3C's existing `RehabCard` component (already extracted in 3C Task 6). 3E.7 mounts it inside `<DetailModal>`, removes the existing Save button, and wires each scope button + custom item input to its own debounced auto-save. Also adds the "Rehab Override active" banner if Quick Analysis has a manual rehab value.

5. **`<HoldTransCardModal>`** — combined Holding + Transaction modal per Decision 5. New 6-line transaction breakdown (3 acquisition + 3 disposition) using the new TransactionDetail fields from 3A. All read-only display. Footer: `Edit Days Held →` link.

6. **`<FinancingCardModal>`** — loan summary, rate/LTV/points/days held, interest cost, origination cost, monthly I/O. Three editable inputs (Manual Rate %, Manual LTV %, Manual Points %) each wired to auto-persist with `financing_rate_manual` / `financing_ltv_manual` / `financing_points_manual` field names. Each has a `× clear` affordance.

7. **`<PipelineCardModal>`** — Showing Status select, Offer Status select, Showing Date input, Offer Submitted Date, Offer Deadline Date, Watch List Note. All auto-persist. Footer: `Open in Action →` link to `/action` (per Decision 7).

8. **`<NotesCardModal>`** — three-tier visibility model UI (visibility selector with 3 radio options + conditional partner picker chip-list). Add Note form retains its Save button (transactional). Visibility edits on existing notes auto-persist. Filter chips by category AND by visibility tier. Per Decision 5.5, ALSO ships the migration that changes `analysis_notes.visibility` DEFAULT to `'internal'`.

9. **`<PartnerSharingCardModal>` STUB** — per Decision 5.4, ships as a placeholder card explaining "Phase 1 partner portal arrives in Step 4". No actual functionality. The card's collapsed state shows "Not yet implemented" or similar.

Each modal is its own commit (9 sub-commits inside 3E.7).

**Verification per modal:** click the corresponding card, modal opens, all displayed values match the legacy Workstation's equivalent section, edit workflow (where applicable) persists correctly with status dot feedback, ESC and click-outside close.

### 6.8 — 3E.8: Cross-card cascades + polish

The final sub-task verifies all cross-card cascades work end-to-end and does final visual polish. Most of the cascade infrastructure is already in place by 3E.6 (the parent hoists `liveDeal` and passes derived headlines down) — 3E.8's job is to **verify each cascade chain** and fix any gaps where a card's headline still reads from server data instead of live state.

**Cross-card cascades to verify:**
- **Manual ARV (Quick Analysis) → ARV card headline + Cash Required card headline (via Max Offer cascade) + Deal Stat Strip indicators** — when the analyst types a Manual ARV, all three reflect the new effective ARV synchronously.
- **Rehab Override (Quick Analysis) → Rehab card headline + Rehab card modal banner + Cash Required card headline (rehab cascades through Max Offer)** — when set, the Rehab card's collapsed headline shows the override value, the modal shows the override banner, and Cash Required reflects the new Max Offer.
- **Days Held (Quick Analysis) → Holding & Transaction card headline + Cash Required card headline** — Holding total recomputes with the new day count; Cash Required reflects the new holding line.
- **Target Profit (Quick Analysis) → Deal Stat Strip + Cash Required card headline (via Max Offer cascade)** — Max Offer = ARV − costs − Target Profit; changing Target Profit changes Max Offer changes Cash Required.
- **Condition (Quick Status) → Rehab card headline (via the condition multiplier)** — when the analyst changes Condition, the auto rehab calculation updates UNLESS Rehab Override is set in Quick Analysis. The Rehab card's collapsed headline reflects the new value.
- **Manual rate/LTV/Points (Financing card modal) → Financing card headline + Cash Required card headline** — financing changes flow through the loan amount and origination cost cascades.

**Verification approach:** open the Workstation, type a value into one Quick Analysis input, and watch which cards in the right column update. Every card whose headline depends on that value must reflect it synchronously. If any card stays stale, it's reading from server data instead of live state — fix by routing it through the parent's `liveDeal` memo.

**This is the proactive fix for the legacy "Deal Math card doesn't reflect Quick Analysis" bug Dan surfaced during Step 3D testing.** The legacy Workstation had this bug because its Deal Math card read from `d.dealMath` (server) instead of `liveDeal` (computed). The new Workstation's design avoids this by structuring every card to receive its headline from the parent's hoisted live state.

**Keyboard navigation polish:**
- Tab order: header → tile row → deal stat strip → hero → right column cards
- ESC closes any open modal
- Tab from Quick Analysis Target Profit input → focuses Copy Selected MLS button (preserved from legacy Workstation behavior)

**Final visual polish:**
- Spacing tweaks
- Border / shadow consistency
- Dark mode (out of scope for Phase 1, flagged for future)
- Responsive behavior below 1280px (out of scope per spec)

**Verification:** full smoke test of every interaction in the new Workstation. Side-by-side comparison with the legacy Workstation across multiple properties.

---

## 7. Ordered Task List

Each task is independently committable.

### Phase A — Skeleton + foundation (1-3 commits)

**Task 1 (3E.1):** Break the wrapper at `/deals/watchlist/[analysisId]/page.tsx`, create new client skeleton at `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx`, update canonical page.tsx import. Both URLs diverge.
- Verification: `/analysis/<id>` shows the dashed-box skeleton; `/deals/watchlist/<id>` shows the legacy Workstation working

### Phase B — Top sections (4-6 commits)

**Task 2 (3E.2):** Header bar.

**Task 3 (3E.3.a):** Property Physical bed/bath mini-grid (extends `<SubjectTileRow>`).

**Task 4 (3E.3.b):** New `<QuickAnalysisTile>` with auto-persist on 4 numeric fields.

**Task 5 (3E.3.c):** New `<QuickStatusTile>` with auto-persist on 4 dropdowns.

**Task 6 (3E.3.d):** Wire all 4 tiles into the Workstation. Replace the top tile row stub.

**Task 7 (3E.4):** Deal Stat Strip with override indicators. Extend `<DealStatStrip>` with override props. Wire override + cascade rules.

### Phase C — Hero (3-5 commits)

**Task 8 (3E.5.a):** Design `<CompWorkspace>` prop interface (no implementation yet — surfaces the API for review before extraction).

**Task 9 (3E.5.b):** Extract inline JSX from the screening modal into `components/workstation/comp-workspace.tsx`.

**Task 10 (3E.5.c):** Wire `<CompWorkspace>` into the new Workstation, replace the hero stub.

### Phase D — Right column collapsed cards (1 commit)

**Task 11 (3E.6):** All 9 `<DetailCard>` instances rendering collapsed state, reading from `WorkstationData`. Click handlers fire placeholder modals.

### Phase E — Per-card modals (9 commits, one per card)

**Task 12 (3E.7.a):** `<ArvCardModal>` — read-only.

**Task 13 (3E.7.b):** `<CashRequiredCardModal>` — read-only with new acquisition section.

**Task 14 (3E.7.c):** `<PriceTrendCardModal>` — read-only.

**Task 15 (3E.7.d):** `<RehabCardModal>` — wraps 3C's `RehabCard`, removes Save button, wires inputs to auto-persist, adds override banner.

**Task 16 (3E.7.e):** `<HoldTransCardModal>` — combined Holding + Transaction with new 6-line breakdown.

**Task 17 (3E.7.f):** `<FinancingCardModal>` — auto-persist on Rate / LTV / Points.

**Task 18 (3E.7.g):** `<PipelineCardModal>` — auto-persist on showing/offer fields.

**Task 19 (3E.7.h):** `<NotesCardModal>` — three-tier visibility model + DEFAULT migration.

**Task 20 (3E.7.i):** `<PartnerSharingCardModal>` — STUB only.

### Phase F — Cascades + polish (1-2 commits)

**Task 21 (3E.8.a):** Cross-card cascades (Days Held → Holding card recompute, etc.).

**Task 22 (3E.8.b):** Keyboard navigation + final visual polish.

### Phase G — CHANGELOG + push (1 commit)

**Task 23 (3E closeout):** CHANGELOG entry for 3E + push to origin.

**Total estimated commits: 21-25**

---

## 8. Files Touched

| Category | Estimated count |
|---|---|
| New files in `app/(workspace)/analysis/[analysisId]/` (Workstation client + tile components + modal components) | ~15-20 |
| New files in `components/workstation/` (`<CompWorkspace>`, possibly extracted modal helpers) | 1-3 |
| Modified files (CHANGELOG, possibly `<SubjectTileRow>` and `<DealStatStrip>` extensions) | 3-5 |
| Migration files (DEFAULT change for `analysis_notes.visibility`) | 1 |
| Total | ~20-30 |

**Detailed file plan finalized at execution time** — the exact filenames depend on how the per-card modals are organized (one file per modal vs grouped by section).

---

## 9. Verification Checklist

### Per-sub-task verification (cumulative — each sub-task adds new items)

After Task 1: both URLs serve different components.

After Task 7 (3E.4 done): top section is fully functional. Side-by-side with legacy: header / tiles / strip should show the same data.

After Task 10 (3E.5 done): hero comp workspace works in both new Workstation AND screening modal. Visual diff against legacy state.

After Task 11 (3E.6 done): all 9 cards visible and clickable. Headlines match legacy Workstation values.

After Task 20 (3E.7 done): every modal opens, displays correct data, and (for editing modals) persists correctly. Side-by-side with legacy: every editable field works in both.

After Task 22 (3E.8 done): cross-card cascades work end-to-end. Type Days Held → Holding card headline updates. Type Manual ARV → all dependent cards reflect the new value.

### Full regression at the end of 3E

- [ ] Sign in works
- [ ] Open `/analysis/<id>` → new Workstation renders
- [ ] Open `/deals/watchlist/<id>` → legacy Workstation still renders (and is functionally identical to its pre-3E state)
- [ ] Every tile, card, and modal in the new Workstation displays correct data
- [ ] Every auto-persist input persists correctly with status dot feedback
- [ ] Rehab Override active state shows the banner in the Rehab card modal
- [ ] Three-tier visibility model in Notes works (create new note with each tier, edit existing note's tier)
- [ ] Mark Complete / Generate Report still work
- [ ] Open the screening modal from `/screening` → still works after the `<CompWorkspace>` extraction
- [ ] No console errors

---

## 10. Definition of Done

3E is complete when:

1. All 23 tasks are executed and committed
2. Every box in §9 is checked
3. The new Workstation at `/analysis/[analysisId]` is functionally complete per `WORKSTATION_CARD_SPEC.md` (Partner Sharing card is a stub per Decision 5.4)
4. The legacy Workstation at `/deals/watchlist/[analysisId]` continues to work as a fallback
5. CHANGELOG has a Phase 1 Step 3E entry
6. All commits pushed to origin
7. The codebase is ready for 3F to retire the legacy Workstation and ship final cleanup

---

## 11. What 3F builds on top

3F's job after 3E ships (smaller scope than originally planned because dropping side-by-side already deleted the legacy Workstation file in 3E.1):

- **Activate the legacy redirect.** `/deals/watchlist/[analysisId]/page.tsx` is currently a re-export wrapper of the canonical `/analysis/[analysisId]/page.tsx`. 3F converts it into a hard `redirect("/analysis/[analysisId]")` call so the legacy URL becomes a permanent redirect rather than a parallel-serving alias.
- **Delete the legacy `saveManualAnalysisAction`** (the bulk form action) — every field it wrote is now covered by 3D's `saveManualAnalysisFieldAction` per-field action. Deletable once no consumer references it.
- **Drop deprecated columns**: `analysis_notes.is_public` (replaced by `visibility` enum from 3A).
- **Delete the dev test harness** at `app/(workspace)/dev/auto-persist-test/`.
- **Remove the layout-level auth check** at `app/(workspace)/layout.tsx:16` (defense-in-depth retired per master plan §3F).
- **Final Step 3 CHANGELOG entry** + git tag `phase1-step3-complete`.

The legacy Workstation file deletion that originally lived in 3F is now part of 3E.1, so 3F is smaller than the master plan estimated. Original master plan estimate: 2-4 commits. Revised estimate: 2-3 commits.

---

## 12. Open Questions

🟢 **5.1 — DECIDED: Drop side-by-side rollout.** Per Dan's call, supersedes master plan Decision 6.6. The legacy Workstation file at `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` is deleted in 3E.1. The 3B re-export wrapper at `/deals/watchlist/[analysisId]/page.tsx` is preserved throughout 3E (both URLs serve the new Workstation via the wrapper) and only converts to a hard redirect in 3F. The screening modal at `/screening` remains the daily-work fallback for property review during 3E since it's independent of the Workstation. Reasoning: only one user, project in active development, complexity reduction (~1-2 fewer commits, smaller 3F, cleaner mental model) outweighs the loss of Workstation fallback during the multi-day 3E execution.

🟢 **5.2 — DECIDED: (a) `analysis-workstation.tsx`.** Same name as the legacy file. With the legacy file deleted in 3E.1, there's no naming collision concern. Signals "this IS the canonical Workstation" — the new one inherits the canonical name.

🟢 **5.3 — DECIDED: (a) read-only modals first.** Order in 3E.7: ARV → Cash Required → Price Trend → Rehab → Holding/Trans → Financing → Pipeline → Notes → Partner Sharing. Establishes the DetailModal usage pattern across 3 read-only cards before any editing UI is wired.

🟢 **5.4 — DECIDED: (b) ship a STUB in 3E.7, defer the full Partner Sharing card to Step 4.** The full feature requires new tables (`analysis_shares`, `partner_analysis_versions`, `partner_feedback`), new server actions, an email integration via Resend, and Realtime subscriptions — all of which are Step 4 scope. 3E.7's Partner Sharing card is a placeholder so the layout reserves the slot, but the implementation is deferred. The header Share button is also a placeholder for the same reason.

🟢 **5.5 — DECIDED: (a) ship the DEFAULT change with the 3E.7 Notes card commit.** A small `ALTER COLUMN visibility SET DEFAULT 'internal'` migration lands alongside the new Notes card modal that writes the `visibility` field directly. Removes a piece of "transition period" cruft as soon as the new Notes UI exists.

🟢 **5.6 — Pre-locked at master plan level** (Decision 6.1: A + B combined). Manually-overridden values render in `indigo-700` + `ᴹ` superscript; cascading values render in `indigo-500`.

🟢 **5.7 — DECIDED: (a) per-sub-task manual smoke test.** 3E is high-risk and 8 sub-tasks deep. **Especially important now** that side-by-side has been dropped — there's no Workstation fallback if a sub-task ships broken, so catching regressions immediately is the only defense. The screening modal at `/screening` remains available for property review during the smoke-test gap between sub-tasks.

**Pre-locked at master plan / spec level (no decision needed in 3E):**
- 🟢 **Decision 1** — `Share` is a header action button AND a right-column card
- 🟢 **Decision 2** — Eliminate the Overrides card; consolidate to Quick Analysis with auto-persist
- 🟢 **Decision 3a** — All 4 comp tabs always visible
- 🟢 **Decision 4** — Card expansion uses partial-screen modal overlay
- 🟢 **Decision 5** — Combine Holding & Transaction; restructure transaction into 6 lines
- 🟢 **Decision 6** — Keep Cash Required as its own card
- 🟢 **Decision 6.1** — Manual override values render in `indigo-700` + `ᴹ` superscript; cascading values in `indigo-500`
- 🟢 **Decision 6.6** — Side-by-side rollout (master plan) — **SUPERSEDED by 3E plan Decision 5.1**
- 🟢 **Decision 7** — Pipeline Status card stays in Workstation with `Open in Action →` link
- 🟢 **Decision 8** — Three-tier notes visibility model
- 🟢 **Decision 9** — Use Supabase Realtime in Phase 1 (deferred to Step 4 per Decision 5.4 above)

All decisions locked 2026-04-11. Ready to execute.

---

*Drafted by Claude Opus | 2026-04-11 | Awaiting Dan's review before execution*

# Phase 1 — Step 3 — Route Restructure + Workstation Rebuild — Master Plan

> **Goal:** Move the application from its current `/deals/watchlist/[analysisId]` route structure to the canonical `Intake → Screening → Analysis → Action` flow, rebuild the Workstation against the locked `WORKSTATION_CARD_SPEC.md`, and complete the Phase 1 deferred items (SECURITY DEFINER audit, layout auth check removal).
> **Status:** DRAFT MASTER PLAN — sub-step plans drafted separately when each begins
> **Authority:** Implementation against `WORKSTATION_CARD_SPEC.md` (locked) + `DataWiseRE_Restructure_Plan.md` § 5 Phase 1 Step 3 + completion of `PHASE1_STEP1_IMPLEMENTATION.md` and `PHASE1_STEP2_IMPLEMENTATION.md`
> **Date:** 2026-04-11
> **Risk level:** HIGH (largest milestone in Phase 1) — but the risk is **distributed across many small changes**, not concentrated in one dangerous moment like Step 2's Migration 4

---

## 1. What Step 3 Accomplishes

Step 3 takes the database foundation built in Steps 1 and 2 and uses it to ship the user-visible restructure. Specifically:

1. **Move the route tree** from the current legacy structure to the canonical `Intake → Screening → Analysis → Action` flow. The Workstation moves from `/deals/watchlist/[analysisId]` to `/analysis/[analysisId]`. Pipeline becomes Action.

2. **Rebuild the Analysis Workstation** against the locked `WORKSTATION_CARD_SPEC.md`. This is the bulk of the visual work in Phase 1 and the centerpiece of the analyst experience: 4-tile top row, comps + map as the hero, 9 collapsible right-column cards opened via modals, no Save buttons (auto-persist with status indicators), three-tier override system surfaced visually.

3. **Solve the Quick Analysis / Overrides ambiguity** that tripped up Step 2's verification testing. The new Quick Analysis tile IS the persistent override surface. There is no separate Overrides card.

4. **Add the underlying schema** that the new card layout requires: notes visibility model, transaction engine restructure, bed/bath level columns surfaced, `next_step` column, Cash Required subtotals.

5. **Complete the Phase 1 deferred items**: audit and fix any SECURITY DEFINER functions (per Decision 12.2 in the Step 2 plan), and remove the layout-level auth check at `app/(workspace)/layout.tsx:16` once the proxy enforcement has been proven in production for the duration of Step 3.

**Step 3 explicitly does NOT do these things — they belong to Step 4 or later:**

| Out of scope | Belongs to |
|---|---|
| `analysis_shares`, `partner_analysis_versions`, `partner_feedback` tables | Step 4 — Partner Portal MVP |
| Partner-side RLS policies | Step 4 — Partner Portal MVP |
| Resend email integration | Step 4 — Partner Portal MVP |
| The `/portal/deals/[shareToken]` partner-facing route | Step 4 — Partner Portal MVP |
| Realtime subscriptions for Partner Sharing card | Step 4 — Partner Portal MVP |
| Functional Scrape and Rental comp tabs | Phase 2+ (placeholder UI ships in Step 3 per Decision 3a) |
| Full Option C alert system | Phase 2+ (data is in place from the interim queue fix; UX comes later) |
| Multi-tenancy provisioning (admin-creates-org flow) | Phase 3 |
| Post-close reconciliation UI (`deal_actuals`) | Phase 4 |

---

## 2. Why Step 3 Needs Sub-Step Decomposition

Step 1 was 9 commits. Step 2 was 6 commits. Step 3 will likely be **20-30 commits** across at least six distinct workstreams that have different risk profiles, different testing strategies, and different "fail modes." Putting them in one plan document creates two problems:

1. **The plan goes stale.** Earlier sub-steps will teach us things that change the assumptions in later sub-steps.

2. **Verification gets compressed.** A single mega-plan tempts us to verify everything once at the end. Sub-step plans give each workstream its own checklist, catching issues earlier when they're cheaper to fix.

**The solution:** this master plan covers the entire Step 3 scope at the level of *what each sub-step does, in what order, with what dependencies*. When we're ready to start each sub-step, I draft a focused implementation plan for it (same pattern as Steps 1 and 2), execute, verify, ship, then plan the next.

---

## 3. Sub-Step Decomposition

### 3A — Schema preparation (NO UI changes)

**Goal:** All schema changes the new Workstation will need, applied first in isolation so the application code in later sub-steps can reference them.

**Scope:**
- New column: `manual_analysis.next_step text` (free-form, no CHECK initially)
- **Notes visibility model migration:**
  - Add `analysis_notes.visibility text CHECK (visibility IN ('internal', 'specific_partners', 'all_partners'))` default `'internal'`
  - Add `analysis_notes.visible_to_partner_ids uuid[]`
  - Backfill: `is_public = true` → `'all_partners'`, `is_public = false` → `'internal'`
  - Deprecate `is_public` (mark with COMMENT, drop in 3F)
  - Rename `note_type = 'internal'` → `'workflow'` (small UPDATE)
- **Transaction engine restructure:**
  - `TransactionDetail` type expanded with: `acquisitionCommission` (signed), `acquisitionFee`, `dispositionCommissionBuyer`, `dispositionCommissionSeller`, `acquisitionSubtotal`, `dispositionSubtotal`
  - `FlipStrategyProfile` parameters expanded: `acquisitionCommissionPct`, `acquisitionFeeFlat`, `dispositionCommissionBuyerPct`, `dispositionCommissionSellerPct`
  - `transaction-engine.ts` rewritten to compute the new breakdown
  - `screening_results` may need new columns if it persists transaction details (TBD during planning)
- `cashRequired` shape extended with two new derived subtotals (`acquisitionSubtotal`, `carrySubtotal`) plus the two new acquisition-side line items
- `WorkstationData.physical` extended with level-specific bed/bath fields (`bedroomsMain`, `bedroomsUpper`, `bedroomsLower`, `bathroomsMain`, `bathroomsUpper`, `bathroomsLower`) — underlying columns already exist in `property_physical`
- `load-workstation-data.ts` updated to fetch the level-specific bed/bath fields
- **SECURITY DEFINER function audit** (deferred from Step 2 per Decision 12.2):
  - Run the audit query from §8.1 of the Step 2 plan
  - For each non-whitelisted SECURITY DEFINER function found, decide convert-to-INVOKER vs add-explicit-org-filter
  - Land fixes as part of 3A so RLS is fully consistent before Step 3 UI work touches anything

**Dependencies:** None — Step 2 is complete

**Risk:** Low to medium. Schema additions are mostly additive. The transaction engine rewrite touches the screening pipeline (deal math is computed during screening) and could subtly affect existing screening_results values. The notes visibility migration is straightforward but touches a table the app actively writes to, so migration ordering matters.

**Estimated commits:** 5-8

---

### 3B — Route restructure (mechanical file moves + redirects)

**Goal:** Move the workspace route tree to the canonical shape, with legacy redirects.

**Scope:**

**Routes that move:**

| Old | New |
|---|---|
| `/deals/watchlist` | `/analysis` |
| `/deals/watchlist/[analysisId]` | `/analysis/[analysisId]` |
| `/deals/pipeline` | `/action` |
| `/deals/closed` | `/action?status=closed` (filtered view) |
| `/admin/properties/new` | `/intake/manual` (consolidate duplicate entry points) |

**Routes that don't move:** `/admin/properties`, `/admin/properties/[id]`, `/reports`, `/reports/[reportId]`, `/screening`, `/intake/imports`, `/home`

**Navigation update (`components/layout/app-chrome.tsx`):**
- Primary nav changes from `Home | Intake | Screening | Deals | Reports | Admin` to `Home | Intake | Screening | Analysis | Action | Reports | Admin`
- Section configs added for `/analysis` and `/action`
- Section configs for `/deals/*` removed (routes still exist as redirect-only shells)

**Internal link updates:** every reference to `/deals/watchlist`, `/deals/watchlist/[id]`, `/deals/pipeline`, `/deals/closed` updated to the new paths

**Legacy redirects:**
- `app/(workspace)/deals/watchlist/page.tsx` → `redirect('/analysis')`
- `app/(workspace)/deals/watchlist/[analysisId]/page.tsx` → `redirect('/analysis/[analysisId]')`
- `app/(workspace)/deals/pipeline/page.tsx` → `redirect('/action')`
- `app/(workspace)/deals/closed/page.tsx` → `redirect('/action?status=closed')`
- `app/(workspace)/admin/properties/new/page.tsx` → `redirect('/intake/manual')`

**The current Workstation component logic stays exactly where it is at first** — just renamed/moved to the new path. No behavior change. The actual UI rebuild happens in 3E.

**Dependencies:** Should land before 3E. Can land in parallel with 3C and 3D.

**Risk:** Medium. Mechanics are simple but easy to miss a reference or create a redirect loop.

**Estimated commits:** 4-6

---

### 3C — Component extraction (no behavioral change)

**Goal:** Extract the components the new Workstation will reuse, without changing any existing user-visible behavior. After 3C, both ScreeningCompModal and the current Workstation continue to work exactly as before, but they now share underlying components that 3E will plug into.

**Scope (per `WORKSTATION_CARD_SPEC.md` §6):**

**Extract from `ScreeningCompModal`:**
- `<CompWorkspace>` — map + comp table + tab bar
- `<AddCompByMls>` — lifted to its own file
- `<ExpandSearchPanel>` — same
- `<SubjectTileRow>` — the 3-tile row currently duplicated between modal and workstation
- `<DealStatStrip>` — same

**Extract from current `analysis-workstation.tsx`:**
- `<RehabCard>` (already a component, just moved out of the workstation file)
- `<TrendDirectionBadge>`, `<TrendTierColumn>` (small helpers)
- `<CostLine>` (currency line item helper)
- `<DealStat>` (stat pill)

**Generic wrappers introduced (used by 3E):**
- `<DetailCard>` — collapsed card wrapper. Props: `title`, `headline`, `context`, `badge?`, `onClick`
- `<DetailModal>` — partial-screen modal wrapper. Props: `title`, `onClose`, `children`. Handles ESC-to-close, click-outside, backdrop, focus trap

**Constraint:** existing ScreeningCompModal and Workstation continue to work via the extracted components. Pure refactoring — test is "everything still works exactly the same."

**Dependencies:** Needs 3A's schema changes if any extracted component touches new fields.

**Risk:** Low to medium. Refactoring is mechanical but touches load-bearing UI.

**Estimated commits:** 6-10 (one extraction per commit)

---

### 3D — Auto-persist infrastructure

**Goal:** Build the "no Save buttons, every edit persists immediately" pattern that the new Workstation depends on (Decision 2).

**Scope:**

**Custom hook `useDebouncedSave`:**
- Takes a value, a save function (typically a server action call), and a debounce delay (default 500ms)
- Returns the current "save state": `idle | saving | saved | error`
- Handles concurrent edits (newer keystrokes cancel older pending saves)
- Handles errors with retry semantics

**Status indicator component `<SaveStatusDot>`:**
- Visual indicator: `idle (slate)` → `saving (amber)` → `saved (emerald, fades after 1s)` → `idle`
- On error: `error (red)` with hover tooltip showing the message
- Sized to fit inline next to an input field
- Accessible (proper aria attributes)

**Server action wrapper:**
- Existing `saveManualAnalysisAction` is a single big action that takes a FormData and updates many fields. The auto-persist pattern needs **per-field actions** so individual inputs save themselves without affecting others
- Likely shape: a single generic action `saveManualAnalysisFieldAction({ analysisId, field, value })` (see open question §6.3)

**Optimistic update pattern:**
- Inputs render the user's typed value immediately
- The save runs in the background
- On error, the value can stay (user retries) or be reverted (see open question §6.4)

**Cascading recalculation:**
- When a user types `arv_manual` in Quick Analysis, the Deal Stat Strip recalculates synchronously (no waiting on server)
- Same for `rehab_manual`, `target_profit_manual`, `days_held_manual`
- The cascade mirrors the existing `useMemo` pattern but reads from persisted (debounced-save) values

**Edge cases the sub-step plan must address:**
- User types fast and the network is slow — debounce coalesces but the user might leave the page mid-save
- Server action fails after a successful UI update
- Concurrent edits from two browser tabs
- Save happens but the next page load shows stale data

**Dependencies:** Needs 3A. Can be built in parallel with 3B and 3C. Must land before 3E.

**Risk:** Medium. New infrastructure with new failure modes.

**Estimated commits:** 4-6

---

### 3E — New Workstation card layout

**Goal:** Build the new Analysis Workstation per `WORKSTATION_CARD_SPEC.md`. Largest single piece of work in Step 3.

**Scope — internal ordering:**

**3E.1 — Skeleton**
- Create new `analysis-workstation.tsx` at `app/(workspace)/analysis/[analysisId]/`
- Stub the layout: header bar + 4-tile row + deal stat strip + hero comp workspace + right column
- Wire it to load `WorkstationData`
- Render placeholders for each section
- App builds, route loads, everything is empty

**3E.2 — Header bar + status badges + share pill**
- Per spec §3.1
- Mark Complete / Generate Report buttons
- Active share pill (placeholder for now — Partner Sharing is mostly Step 4)

**3E.3 — Four-tile top row**
- Tile 1 (MLS Info): port from current Workstation
- Tile 2 (Property Physical) with new bed/bath level grid (depends on 3A)
- Tile 3 (Quick Analysis) with auto-persist on 4 fields (depends on 3D)
- Tile 4 (Quick Status) with 4 dropdowns and auto-persist (depends on 3A's `next_step` column and 3D)

**3E.4 — Deal Stat Strip with override indicators**
- Port the strip
- Add override indicators (visual treatment per open question §6.1)
- Cascade rule for downstream values

**3E.5 — Hero comp workspace**
- Use `<CompWorkspace>` from 3C
- 4-tab bar: ARV (functional) / As-Is (functional) / Scrape (placeholder per Decision 3a) / Rental (placeholder)
- Map left, comp table right
- Add Comp by MLS# + Expand Search controls

**3E.6 — Right column collapsed cards**
- Use `<DetailCard>` wrapper from 3C
- 9 cards stacked vertically
- Clicking does nothing yet (modals come in 3E.7)

**3E.7 — Detail modals (one card at a time)**
- `<ArvCardModal>` first as the canonical example
- Then `<RehabCardModal>` (existing `RehabCard` lifted into a modal)
- Then `<HoldTransCardModal>` (depends on 3A's transaction engine restructure)
- Then `<FinancingCardModal>`
- Then `<CashRequiredCardModal>` (depends on 3A's cashRequired schema changes)
- Then `<PriceTrendCardModal>`
- Then `<PipelineCardModal>` (with `Open in Action →` link from Decision 7)
- Then `<NotesCardModal>` with three-tier visibility model (depends on 3A's notes migration)
- Then `<PartnerSharingCardModal>` — analyst-side stub only; full Step 4

**3E.8 — Polish + integration**
- Cross-card cascades (Days Held in Quick Analysis updates Holding & Transaction headline)
- Keyboard navigation (Tab order, ESC to close modals)
- Final visual polish

**Dependencies:** 3A + 3B + 3C + 3D

**Risk:** Highest in Step 3. Mitigation: internal sub-step ordering means each piece is verifiable in isolation. Current Workstation continues working in parallel as a fallback (per open question §6.6).

**Estimated commits:** 12-20

---

### 3F — Cleanup

**Goal:** Retire defense-in-depth code and remove dead routes.

**Scope:**

- **Remove the layout-level auth check** at `app/(workspace)/layout.tsx:16` — proxy enforcement has been the primary protection through Steps 2 and 3 by this point. Defense-in-depth retired.
- **Drop deprecated columns**: `analysis_notes.is_public` (replaced by `visibility` enum)
- **Final CHANGELOG entry** for the entire Step 3
- **Tag** `phase1-step3-complete`

**Dependencies:** Everything else in Step 3 must be complete and verified

**Risk:** Low

**Estimated commits:** 2-4

---

## 4. Sub-Step Ordering and Dependencies

```
3A (schema)
  │
  ├──> 3B (routes)         ─┐
  │                         │
  ├──> 3C (extraction)      ├──> 3E (new Workstation)  ──> 3F (cleanup)
  │                         │
  └──> 3D (auto-persist)   ─┘
```

**3A goes first** — everything else benefits from the schema being in place.

**3B, 3C, 3D can run in parallel** after 3A (independent), but I'd recommend running them sequentially to avoid coordinating multiple in-flight branches.

**3E depends on all of 3A through 3D.**

**3F is the wrap-up** after 3E is verified end-to-end.

---

## 5. Risk Model

| Sub-step | Risk | Why | Mitigation |
|---|---|---|---|
| 3A | Low-Medium | Schema changes touch live tables; transaction engine rewrite could shift screening totals | Backfill verification, recompute spot-check, comprehensive verification queries |
| 3B | Medium | Route restructure can create redirect loops or break in-flight links | Per-route verification matrix, smoke test of every workspace URL after the moves |
| 3C | Low-Medium | Refactoring load-bearing UI; risk of import path breaks | Typecheck + build + manual smoke test after every commit |
| 3D | Medium | New infrastructure with new failure modes | Edge case enumeration in the sub-step plan, integration tests with throttling |
| 3E | Highest | Largest sub-step, most new code | Internal decomposition (3E.1-3E.8), each piece independently verifiable, current Workstation as fallback |
| 3F | Low | House-cleaning | Verify nothing references the things being removed before removing them |

**Catastrophic rollback:** if any sub-step goes badly enough to need a full Step 3 rollback, the tag `phase1-step2-complete` is the recovery point.

---

## 6. Open Questions — RESOLVED

🟢 All seven decisions resolved 2026-04-11. See individual sections below for the answers.

## 6. Open Questions for Dan

These need to be answered before I draft detailed sub-step plans. Several were flagged in `WORKSTATION_CARD_SPEC.md` for resolution at implementation time — they're now load-bearing.

### 6.1 Override indicator visual (from spec §3.3)

Three options for how the Deal Stat Strip distinguishes manually-overridden values from automated values:

- **(A) Color shift** — auto values render in `slate-900`; manually overridden values render in `indigo-700`. Cascading values get a lighter `indigo-500`.
- **(B) Superscript marker** — small `ᴹ` superscript next to manually overridden values
- **(C) Underline + caption** — manual values get a thin indigo underline and a small `manual` caption below

**My recommendation: A + B combined.** Color shift for instant glanceability + superscript marker for unambiguous labeling. C is too noisy.

🟢 **DECIDED 6.1 — A + B combined.** Manually-overridden values render in `indigo-700` (cascading values in `indigo-500`) and carry a small `ᴹ` superscript marker. Default automated values render in `slate-900`.

### 6.2 Quick Status "Next Step" dropdown options

In `WORKSTATION_CARD_SPEC.md` §3.2 Tile 4, I proposed a starter set:

- `none`
- `analyze_deeper`
- `schedule_showing`
- `request_partner_input`
- `make_offer`
- `wait_price_drop`
- `pass`

Since the column has no CHECK constraint, options can evolve without migrations.

🟢 **DECIDED 6.2 — Keep the starter list.** Seven options as proposed: `none`, `analyze_deeper`, `schedule_showing`, `request_partner_input`, `make_offer`, `wait_price_drop`, `pass`. Will evolve as the app gets used.

### 6.3 Auto-persist save action shape (Decision 2 / sub-step 3D)

- **(a) One generic action** (`saveManualAnalysisFieldAction`) that takes `{ analysisId, field, value }` and does a single-field UPSERT. Smaller surface.
- **(b) Multiple typed actions** — one per field. More explicit, more typesafe, more code.

**My recommendation: (a) one generic action.** Less duplication, easier to add fields later. Tight types via discriminated union.

🟢 **DECIDED 6.3 — (a) One generic action.** `saveManualAnalysisFieldAction({ analysisId, field, value })` with a TypeScript discriminated union for type-safe field/value pairing. Single allow-list of editable columns inside the action body. Adding a new persistable field is one entry to the union plus one entry to the allow-list. If a future field grows bespoke validation logic, we can carve out a dedicated action while keeping everything else under the generic one.

### 6.4 Auto-persist error handling (Decision 2 / sub-step 3D)

When a debounced save fails:

- **(a) Keep the value in the input** with red error indicator + tooltip on hover. User can retry. Their work isn't lost.
- **(b) Revert to last saved value** — input snaps back. User loses their typed text.
- **(c) (a) + a toast notification** in the corner. More visible than just the dot.

**My recommendation: (a) keep value + red dot.** (c) is also reasonable. **Don't pick (b)** — losing user-typed work is the worst outcome.

🟢 **DECIDED 6.4 — (a) Keep value + red dot indicator with hover tooltip.** No corner toast. The user sees what they typed plus an inline error indicator they can investigate by hovering. Their work is never lost.

### 6.5 SECURITY DEFINER audit findings — no decision needed upfront

I'll run the audit query as the very first task in 3A. Possible outcomes:
- **(i)** Zero non-whitelisted functions → no-op
- **(ii)** Simple functions safely converted to SECURITY INVOKER → easy fix
- **(iii)** Functions that genuinely need SECURITY DEFINER → need explicit org filtering

If (iii), I might need to defer some specific fixes. I'll surface findings when I have them.

🟢 **DECIDED 6.5 — Defer to testing.** I run the audit as the first task in 3A and bring findings back to Dan with concrete recommendations.

### 6.6 New Workstation rollout strategy

When 3E.1 lands, the new Workstation exists at `/analysis/[analysisId]` but is mostly empty.

- **(a) Side-by-side until 3E.8** — OLD Workstation at `/deals/watchlist/[analysisId]` keeps working throughout 3E. The legacy redirect from 3B is staged but commented out until 3E.8. Both workstations exist in the codebase. When 3E.8 ships, the legacy redirect activates and the old Workstation becomes a redirect-only shell.
- **(b) Hard cutover at 3E.1** — legacy redirect activates immediately. The only Workstation is the new (mostly empty) one.

**Recommendation: (a) side-by-side.** Lower risk — you keep using the working Workstation while the new one is built up.

🟢 **DECIDED 6.6 — (a) Side-by-side rollout.** During 3E, the new Workstation at `/analysis/[analysisId]` is built up incrementally while the old one at `/deals/watchlist/[analysisId]` keeps working. The legacy redirect from 3B is staged but not active until 3E.8 ships and verification passes. At that point, the old route becomes a redirect-only shell and the new Workstation is the canonical destination.

### 6.7 Sub-step plan format

- **(a) One detailed `.md` per sub-step** — same pattern as Step 1 and Step 2 plans. `PHASE1_STEP3A_IMPLEMENTATION.md`, etc. Substantial documents (~500-800 lines each).
- **(b) Lighter sub-step docs** — shorter (~200-400 lines each), focused only on tasks and verification, with cross-references to this master plan for context.
- **(c) Single rolling document** — one `PHASE1_STEP3_IMPLEMENTATION.md` that grows as we go.

**Recommendation: (a) one document per sub-step.** Same pattern as before. Each is a self-contained reviewable artifact.

🟢 **DECIDED 6.7 — (a) One detailed `.md` per sub-step.** `PHASE1_STEP3A_IMPLEMENTATION.md`, `PHASE1_STEP3B_IMPLEMENTATION.md`, etc. Same shape as `PHASE1_STEP1_IMPLEMENTATION.md` and `PHASE1_STEP2_IMPLEMENTATION.md`. Consistent with prior milestones.

---

## 7. What I Need From You

Before I draft the detailed implementation plan for sub-step 3A, please answer the open questions in §6:

- **6.1** Override indicator visual: A / B / A+B / other?
- **6.2** Next Step dropdown options: keep starter / revise?
- **6.3** Auto-persist action shape: generic / per-field?
- **6.4** Auto-persist error handling: (a) / (a)+toast / other?
- **6.5** No decision needed
- **6.6** Workstation rollout: side-by-side / hard cutover?
- **6.7** Sub-step plan format: detailed / lighter / rolling?

Once those are settled, I draft `PHASE1_STEP3A_IMPLEMENTATION.md` covering schema preparation in detail, and we proceed task-by-task as we did with Steps 1 and 2.

---

## 8. Estimated Total Scope

Rough numbers for the full Step 3, summing across all sub-steps:

| Metric | Estimate |
|---|---|
| Schema migrations | 5-8 |
| New TypeScript files | 20-30 (mostly card components and modal wrappers) |
| Modified TypeScript files | 30-50 (most of the existing workstation surface plus link updates from 3B) |
| Total commits | 30-50 |
| Total wall time | This is the longest milestone in Phase 1 — likely several days to a week of focused work |

Compared to Step 2 (5 migrations, ~6 commits total), Step 3 is roughly 5-7x larger.

---

## 9. Definition of Done for the Whole Step

Step 3 is complete when:

1. Every sub-step (3A through 3F) is independently verified and committed
2. The new `/analysis/[analysisId]` Workstation is the canonical Workstation, with all 9 right-column cards functional, auto-persist working on every input, override indicators visible, comp workspace with 4 tabs (2 functional + 2 placeholder)
3. Every legacy URL redirects correctly
4. Every analyst workflow that worked at the end of Step 2 still works in the new Workstation, with feature parity at minimum
5. SECURITY DEFINER audit is complete with all findings either fixed or explicitly documented as deferred
6. Layout-level auth check is removed; proxy enforcement is single source of truth
7. CHANGELOG entry committed
8. Tag `phase1-step3-complete` is created and pushed
9. The "127 stale queue entries" interim fix still works
10. Existing analyst workflows verified end-to-end as final regression check

---

## 10. What Step 4 Builds On Top

Step 3 is the foundation for Step 4 — Partner Portal MVP. After Step 3:

- The Workstation has a Partner Sharing card stub (collapsed state visible, modal exists with limited functionality)
- Component structure supports `viewMode: "analyst" | "partner"` for reuse at `/portal/deals/[shareToken]`
- Schema is ready for Step 4 additions: `analysis_shares`, `partner_analysis_versions`, `partner_feedback`, `share_forwards`
- Auto-persist infrastructure is in place and battle-tested
- Notes visibility model is in place; the "specific_partners" tier becomes meaningful when partners exist

Step 4 work (don't think about it yet):
- Email service integration (Resend)
- Partner sign-up flow
- `/portal/*` route tree
- `analysis_shares` and related schema
- Realtime subscriptions for the Partner Sharing card
- Partner-side RLS policies on the new tables
- Email-invite + open-link-prompt-to-register flow

---

*Drafted by Claude Opus | 2026-04-11 | Awaiting Dan's answers to §6 open questions before drilling into 3A*

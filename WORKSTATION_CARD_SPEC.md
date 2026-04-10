# Analysis Workstation — Card Structure Specification

> **For:** Phase 1 implementation planning (Step 3 — Route Restructure / Step 4 — Partner Portal MVP)
> **From:** Dan Sullivan (project owner) + Claude Opus (drafting)
> **Date:** 2026-04-10
> **Status:** DRAFT — awaiting Dan's review of decision points (search this doc for `🟡 DECISION`)
> **Authority:** This document specifies the new Analysis Workstation layout. The Phase 1 implementation plan will be written *against this spec*, so changes here propagate forward. If anything is wrong, fix it here first.

---

## 1. Design Direction (Locked)

These directives came from Dan and are not up for revision in this spec:

1. **Build on the ScreeningCompModal pattern, not the legacy Access workspace.** The modal's compactness and dense single-page layout work well — extend that pattern into a full-page workspace.
2. **Comps + map are the hero.** They occupy the main viewport and represent the work the analyst is actually doing most of the time.
3. **Detail tiles live in a column along the right side.** Each tile is collapsed by default showing 1–2 headline numbers; clicking expands it for editing and detail.
4. **Single-page workspace, no navigation away.** Everything the analyst needs is on one screen. Expansions happen in-place via modal/panel overlays — they never load a new page.
5. **Partial-screen modals, not full-screen.** When a tile expands, it overlays the workspace but does not consume the whole viewport.
6. **3-tier override system stays.** Auto → Computed → Manual. Each calculation card surfaces all three tiers and the effective value.
7. **The Workstation must support partner sharing as a first-class feature.** Sharing is a Phase 1 deliverable and needs a dedicated card, not a buried button.
8. **No Save buttons. Every edit persists immediately.** The Workstation eliminates the "scratchpad vs persisted override" distinction entirely. If you type a value into a field, it is live. All inputs auto-persist via debounced save (~500ms after the user stops typing). A small inline status indicator on each input shows `idle → saving → saved → idle` (or `error` on failure). The user never has to remember to save anything.
9. **Manual overrides are visually distinct from automated values.** Anywhere the Deal Stat Strip or detail cards display a value that originated from a manual override (rather than from automated calculation), that value renders in a distinct visual treatment so the analyst can tell at a glance whether they're looking at auto-computed math or a value they (or a teammate) entered by hand.

---

## 2. Layout Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│  HEADER BAR                                                                     │
│  ← Hub  Address, City ST ZIP                Status badges        Actions buttons │
├─────────────────────────────────────────────────────────────────────────────────┤
│  [ MLS Info ] [ Property Physical + bed/bath grid ] [ Quick Analysis ] [ Quick Status ] │
├─────────────────────────────────────────────────────────────────────────────────┤
│  DEAL STAT STRIP — ARV │ Max Offer │ Offer% │ Gap/sqft │ Rehab │ Profit │ Trend │
├──────────────────────────────────────────────────────┬──────────────────────────┤
│                                                      │                          │
│  HERO — COMP WORKSPACE                               │  RIGHT TILE COLUMN       │
│                                                      │  (sticky, ~300px)        │
│  ┌─────────────┐  ┌─────────────────────────────┐    │                          │
│  │             │  │                             │    │  ▸ ARV                   │
│  │  MAP        │  │  COMP TABLE                 │    │  ▸ Rehab                 │
│  │  (~380px)   │  │  - Subject row sticky       │    │  ▸ Holding & Transaction │
│  │             │  │  - Sortable columns         │    │  ▸ Financing             │
│  │  + Add MLS# │  │  - Pick / Picked toggles    │    │  ▸ Cash Required         │
│  │  + Expand   │  │  - 19 cols matching modal   │    │  ▸ Price Trend           │
│  │    search   │  │                             │    │  ▸ Pipeline Status       │
│  └─────────────┘  └─────────────────────────────┘    │  ▸ Notes                 │
│                                                      │  ▸ Partner Sharing  ★    │
│  Tabs: [ARV (12)] [As-Is (5)] [Scrape —] [Rental —] │                          │
│                                                      │                          │
└──────────────────────────────────────────────────────┴──────────────────────────┘
```

**Width budget (target 1440–1920 viewport):**
- Right tile column: ~300px (collapsed cards 28–44px tall, scannable as a vertical stack)
- Map: ~380px (matches ScreeningCompModal exactly)
- Comp table: remaining width (~760–1240px depending on viewport)
- Top tile row and stat strip span full width minus the right column

**Responsive behavior (out of scope for Phase 1, flagged for later):** below ~1280px the right column collapses into a horizontal scroll-snap row above the hero; below ~960px tiles stack vertically. Phase 1 targets the analyst's primary monitor (≥1440).

---

## 3. Top Section — Always Visible

These three regions sit above the hero and never collapse. They mirror the ScreeningCompModal exactly so the workstation feels like an extended version of the modal Dan already loves.

### 3.1 Header Bar

**Purpose:** Identity, quick navigation, stage-transition actions.

**Layout (single row):**

| Left | Center | Right |
|---|---|---|
| `← Hub` link to property page | `1005 Garfield Street, Denver CO 80206` (truncate on overflow) | Status badges + action buttons |

**Status badges (right of address):**
- `MLS# 3261850` (mono, slate-50 chip)
- `Active` / `Coming Soon` / `Pending` etc. (uppercase chip)
- `Flip` / `Rental` / `Scrape` (strategy type chip)
- `Completed 4/8 14:32` if `analysis_completed_at` is set (small text)
- **Active share pill** (per Decision 10) — only renders when at least one active share exists for this analysis. Examples:
  - `2 shared` — slate, no pending feedback
  - `2 shared · 1 new ●` — indigo with pulsing red dot when Realtime delivers new feedback
  - Click → opens the Partner Sharing card modal (same modal as expanding the right column card per Decision 1)
  - The pill subscribes to the same Realtime channels as the Partner Sharing card so its state is always current

**Action buttons (rightmost):**
- `Mark Complete` / `Update Complete` (amber if not yet, blue if already)
- `Share` ★ NEW — opens Partner Sharing modal (Phase 1)
- `Generate Report` (emerald)

**Data:** `analysis.*`, `property.*`, `listing.*`

🟢 **DECIDED 1 — (c) Both.** `Share` is a header action button (the verb — quick way to initiate a new share) AND a right-column card (the persistent dashboard — see who you've shared with, view counts, feedback). Implementation: header button opens the same modal as expanding the card.

### 3.2 Top Tile Row (4 tiles)

This row extends ScreeningCompModal's top tile row by adding a fourth tile for analyst status tags. The first three tiles closely mirror the modal; the fourth is new to the Workstation. Width budget on a 1440+ viewport: ~1300px total (320 + 440 + 300 + 240) leaving room for gaps.

**Conceptual split between Tile 3 and Tile 4 (per Dan's note):**

| | Tile 3 — Quick Analysis | Tile 4 — Quick Status |
|---|---|---|
| **Purpose** | Numeric overrides that affect deal math | Qualitative tags / analyst state about the property |
| **Inputs** | Manual ARV, Rehab Override, Target Profit, Days Held | Interest Level, Condition, Location, Next Step |
| **Affects calculation?** | Yes — cascades through ARV, max offer, holding cost, etc. | No (mostly) — Condition feeds the rehab condition multiplier indirectly, but the others are purely state tags |
| **Persistence** | `manual_analysis.*_manual` columns | `manual_analysis` (Condition / Location existing) + new column for Next Step |
| **Partner sees?** | Yes (their own private values per Decision 11) | No — this is analyst-side working state |

#### Tile 1 — MLS Info (max 320px)

```
MLS Status     Active        MLS#         3261850
MLS Change     New Listing   List Date    01/16/2026
Orig List      $700,000      U/C Date     —
List Price     $700,000      Close Date   —
```

**Data:** `listing.mlsStatus`, `listing.listingId`, `listing.mlsMajorChangeType`, `listing.listingContractDate`, `listing.originalListPrice`, `listing.purchaseContractDate`, `listing.listPrice`, `listing.closeDate`

#### Tile 2 — Property Physical (max ~440px)

The Property Physical tile gets a small embedded bed/bath level grid (per Dan's note) so the analyst can see the bedroom and bathroom distribution by level at a glance — critical context for evaluating layout, marketability, and rehab scope.

```
┌────────────────────────────────────────────────────────────────┐
│ Total SF  1,942      Type     House       Year     1908 ⚠     │
│ Above SF  1,314      Levels   One         Garage   2          │
│ Below SF  628        Lot SF   5,410       Tax/HOA  $4,260|$0  │
│ Bsmt Fin  522                                                  │
│                                                                │
│           ┌──────────────────────────┐                        │
│           │       Tot  Main  Up  Lo  │                        │
│           │  Bd    4    2    2   —   │                        │
│           │  Ba    2    1    1   —   │                        │
│           └──────────────────────────┘                        │
└────────────────────────────────────────────────────────────────┘
```

**Existing rules preserved:**
- Year < 1950 renders red bold
- Tax/HOA shown as `$tax | $hoa` compact
- Empty cells render as `—`

**New: bed/bath level grid**
- 5-column × 3-row mini table embedded in the tile
- Columns: row label / Tot / Main / Up (Upper) / Lo (Lower or Basement)
- Rows: Beds / Baths
- Each cell renders the count for that level, or `—` if zero/null
- Total column shows the property-level totals (matches `physical.bedroomsTotal` / `physical.bathroomsTotal`)
- Width: ~180px embedded; tile grows to ~440px max to accommodate it

**Data dependencies (NEW — schema work needed):**

The `WorkstationData.physical` type currently exposes only totals. To support this grid, the type needs to expose the level-specific fields that already exist in the `property_physical` table:

```typescript
// In lib/reports/types.ts — physical property type
physical: {
  // ...existing fields
  bedroomsTotal: number | null;
  bathroomsTotal: number | null;
  // NEW: level breakdown
  bedroomsMain: number | null;
  bedroomsUpper: number | null;
  bedroomsLower: number | null;     // basement / lower level
  bathroomsMain: number | null;
  bathroomsUpper: number | null;
  bathroomsLower: number | null;
}
```

The underlying columns already exist in `property_physical` (`main_level_bedrooms`, `upper_level_bedrooms`, `lower_level_bedrooms`, `main_level_bathrooms`, `upper_level_bathrooms`, `lower_level_bathrooms` per the Phase 1 handoff schema work). The data work is just exposing them through the workstation loader — no new database columns required.

**Data:** `physical.*`, `financials.annualTax`, `financials.annualHoa`, `subjectContext.levelsRaw`, plus the new level-bedrooms/bathrooms fields above

#### Tile 3 — Quick Analysis (max ~300px) — Numeric Overrides (auto-persist)

This tile is the analyst's primary control surface for **numeric overrides that affect the deal math**. Every value typed here persists immediately to `manual_analysis` and takes effect everywhere in the workstation. Qualitative tags (Condition, Location) and analyst state (Interest Level, Next Step) live in Tile 4 (Quick Status) per Dan's note.

```
┌──────────────────────────────────────┐
│ QUICK ANALYSIS                       │
│                                      │
│  Manual ARV       Rehab Override     │
│  [1,125,000]●     [71,400]●          │
│                                      │
│  Target Profit    Days Held          │
│  [40,000]●        [120]●             │
└──────────────────────────────────────┘
```

**Four fields, all auto-persist:**

| Field | Type | Persists to | Effect |
|---|---|---|---|
| Manual ARV | number ($) | `manual_analysis.arv_manual` | Overrides effective ARV in all calcs and the Deal Stat Strip |
| Rehab Override | number ($) | `manual_analysis.rehab_manual` | Overrides total rehab cost (bypasses category math entirely) |
| Target Profit | number ($) | `manual_analysis.target_profit_manual` | Replaces default $40K profit target in deal math |
| Days Held | number (int) | `manual_analysis.days_held_manual` | Overrides auto-computed days held; cascades into holding cost |

**Persistence behavior:**
- On every keystroke, the Deal Stat Strip recalculates **synchronously** (no waiting). The strip always shows live values.
- 500ms after the user stops typing, the value is **saved** to the database via `saveManualAnalysisAction`.
- Each input has a tiny inline status dot (the `●` in the diagram above) that cycles through `idle (slate) → saving (amber) → saved (emerald, fades after 1s) → idle`. On error: `error (red)` with hover tooltip showing the error message.
- **Empty input = use auto value.** Clearing a field reverts to the auto-computed value. The placeholder text shows the current auto value at all times.

**Width:** ~300px max — 2 columns × 2 rows of compact dollar inputs. Smaller than my earlier 440px draft because Condition and Location moved to Tile 4.

**Field interactions:**
- Setting `Manual ARV` cascades through the entire Deal Stat Strip (Max Offer, Offer%, Gap/sqft all derive from ARV).
- Setting `Rehab Override` bypasses the entire category math in the Rehab card (which still displays the breakdown for context but shows a banner indicating the override is active — see §5.2).
- Setting `Days Held` cascades into the Holding & Transaction card's headline number (the holding total recomputes with the new day count).
- Setting `Condition` in **Tile 4** changes the auto-computed rehab cost (via the condition multiplier). If a `Rehab Override` is set in this tile, the override wins regardless of Condition.

#### Tile 4 — Quick Status (max ~240px) — Analyst Tags (auto-persist)

NEW per Dan's note. Tile 4 is the analyst's quick-status surface for qualitative tags about the property and the analyst's working state. Lives at the far right of the top tile row.

```
┌──────────────────────────────────┐
│ QUICK STATUS                     │
│                                  │
│  Interest                        │
│  [ Hot ▾ ]●                      │
│                                  │
│  Condition                       │
│  [ Average ▾ ]●                  │
│                                  │
│  Location                        │
│  [ Good ▾ ]●                     │
│                                  │
│  Next Step                       │
│  [ Schedule Showing ▾ ]●         │
└──────────────────────────────────┘
```

**Four dropdowns, all auto-persist:**

| Field | Persists to | Options | Cascade |
|---|---|---|---|
| **Interest** | `analysis_pipeline.interest_level` (existing — moved from Pipeline card) | Low / Medium / High / Hot | None — pure analyst state. Drives Watch List sort/filter. |
| **Condition** | `manual_analysis.analyst_condition` (existing — moved from Quick Analysis) | Fixer / Poor / Fair / Average / Good / Excellent | Feeds the rehab condition multiplier; cascades into auto rehab calc unless Rehab Override is set in Quick Analysis |
| **Location** | `manual_analysis.location_rating` (existing — moved from Quick Analysis) | Poor / Fair / Average / Good / Excellent | None currently — qualitative tag |
| **Next Step** | `manual_analysis.next_step` (NEW column) | TBD — see below | None — analyst's prospective intent |

**Next Step options (proposed — Dan to confirm or adjust in a future pass):**

- `none` — no decision yet
- `analyze_deeper` — needs more underwriting work
- `schedule_showing` — wants to walk the property
- `request_partner_input` — sharing with partners for feedback
- `make_offer` — ready to make an offer
- `wait_price_drop` — monitoring for a price reduction
- `pass` — decided not to pursue (different from formally passing in screening)

The "Next Step" is the analyst's prospective intent — *what I plan to do next* — distinct from Pipeline's reactive state (showing scheduled, offer submitted). It's a forward-looking working tag, not a record of what's happened.

**Schema additions (small):**

```sql
ALTER TABLE manual_analysis ADD COLUMN next_step text;
-- No CHECK constraint initially — keep it free-form so the option set
-- can evolve without migrations. A CHECK can be added later.
```

The Interest Level field already exists in `analysis_pipeline.interest_level`. Moving it from the Pipeline card to Tile 4 is a UI change, not a schema change. The Pipeline card's underlying data is unchanged; one of its inputs just renders elsewhere now.

**Persistence behavior:** Same as Quick Analysis — dropdowns persist on `onChange` instantly via `saveManualAnalysisAction` (or `savePipelineAction` for Interest Level). Status dot per dropdown.

**Width:** ~240px — single column of stacked dropdowns. Compact footprint at the far right of the row.

**Cascade implication for Pipeline Status card (§5.7):** Interest Level no longer renders inside the Pipeline card. The card's headline drops Interest from the comma-separated string. The Pipeline card now focuses purely on deal mechanics (showing, offer status, dates). See updated §5.7.

🟢 **DECIDED 2 — Eliminate the separate Overrides card; consolidate all general overrides into Quick Analysis with auto-persist.** Quick Analysis grows from 3 fields to 6 (adds Days Held, Condition, Location). Rate%, LTV%, and Points% overrides remain in the Financing card because they belong contextually with loan structure. No Save buttons anywhere — all edits persist immediately via debounced auto-save (~500ms). A small inline status dot per input shows save state. The "what-if scratchpad" semantic is eliminated entirely: if you type it, it's live.

### 3.3 Deal Stat Strip

```
ARV           Max Offer    Offer%      Gap/sqft    Rehab        Target Profit    Trend
$1,125,000ᴹ   $620,000     88.6%       $219        $71,400ᴹ     $40,000          +3.2%/yr
 manual                                              manual                       Appreciating
```

**Behavior:** Recomputes live from Quick Analysis inputs above. Mirrors the modal's strip exactly. ARV and Max Offer bold-highlighted in emerald.

**Override indicator (per-value):** Each value in the strip carries a per-value indicator showing whether it came from automated calculation or a manual override. Three options for the visual treatment — pick one in your notes:

- **(A) Color shift** — auto values render in `slate-900`; manually overridden values render in `indigo-700`. Subtle but unmistakable. Cascading values (Max Offer derived from a manual ARV) get a lighter `indigo-500` to show "downstream of override."
- **(B) Superscript marker** — small `ᴹ` superscript next to manually overridden values (as shown in the diagram above). Quiet but explicit.
- **(C) Underline + label** — manual values get a thin indigo underline and a small `manual` caption below (also shown in the diagram). Loudest of the three; hardest to miss but most visual noise.

*My recommendation: A + B combined.* Color shift for instant glanceability + superscript marker for unambiguous labeling. The underline/caption (C) is too noisy for a strip that's meant to be scannable.

**Cascade rule:** When a Quick Analysis override is active for one value (e.g., Manual ARV), the strip needs to clearly show *which downstream values are affected*. Max Offer, Offer%, and Gap/sqft all depend on ARV — when ARV is overridden, those three should also display the indicator (in a slightly muted treatment to convey "derived from override" rather than "directly overridden"). Same logic for Rehab Override → cascades into Max Offer and Offer%.

**On the right side of the strip:** small comp count + Copy Selected MLS# / Copy All MLS# buttons (matches modal). The Copy Selected button should still be the Tab target from Quick Analysis (existing keyboard flow preserved).

**Data:** `liveDeal.*` memo, `compSummary.*`, `trend.blendedAnnualRate`, `trend.direction`, plus `manualAnalysis.*` to determine override state per value.

---

## 4. Hero — Comp Workspace

This is where the analyst spends most of their time. It's a near-direct port of ScreeningCompModal's body.

### 4.1 Layout

```
┌──────────────────┐  ┌─────────────────────────────────────────┐
│                  │  │  Tabs: [ARV (12)] [As-Is (5)] [Scrape —] [Rental —]  │
│  COMP MAP        │  │  Filter: ☐ Show Selected Only           │
│  (380×320)       │  │                                          │
│                  │  │  ┌─────────────────────────────────┐    │
│  • Subject       │  │  │ SUBJECT row (sticky, red)       │    │
│  • Picked (grn)  │  │  ├─────────────────────────────────┤    │
│  • Candidates    │  │  │ Comp 1 (sortable, click pick)   │    │
│    (gap-coded)   │  │  │ Comp 2                          │    │
│                  │  │  │ Comp 3                          │    │
│  Click pin to    │  │  │ ...                             │    │
│  toggle pick     │  │  │ Comp N                          │    │
│                  │  │  └─────────────────────────────────┘    │
│  ┌────────────┐  │  │                                          │
│  │+ Add Comp  │  │  │                                          │
│  │  by MLS#   │  │  │                                          │
│  └────────────┘  │  │                                          │
│  ┌────────────┐  │  │                                          │
│  │Expand      │  │  │                                          │
│  │  Search ▾  │  │  │                                          │
│  └────────────┘  │  │                                          │
└──────────────────┘  └─────────────────────────────────────────┘
```

### 4.2 Comp Table Columns (matches modal exactly)

`Pick | Dist | Address | Subdiv | Net Price | Imp ARV | Gap | Days | Lvl | Year | Bd | Ba | Gar | Bldg SF | Abv SF | Bsmt | BsFin | Lot | Score`

- `Pick` button toggles `selected_yn` (or `selected_as_is_yn` depending on active tab)
- `Imp ARV` shows per-comp ARV with `<ArvBreakdownTooltip>` on hover (existing component)
- Sortable: Gap, Imp ARV, Days, Bldg SF
- Color coding: gap ≥$60 emerald, <$30 red; days <60 emerald, >180 red; distance ≤0.2mi emerald, ≥0.6mi red
- Subject row pinned at top (sticky below header) showing the subject's stats inline with comp columns for easy comparison

### 4.3 Comp Type Tab Bar

The hero comp workspace is shared across multiple comp types. A tab bar at the top of the workspace switches between them. The same map + table component renders whichever type is active. Picking a comp persists to the appropriate selection flag based on the active tab.

```
┌──────────────────────────────────────────────────────────────────┐
│  [ ARV (12) ]  [ As-Is (5) ]  [ Scrape — ]  [ Rental — ]         │
└──────────────────────────────────────────────────────────────────┘
```

**Tab badge format:** `(<count>)` shows the number of *selected* comps for that type. `—` means the type is not yet active (placeholder).

#### 4.3.1 Active Tabs (Phase 1 functional)

**ARV** — recently sold comps similar in size, age, and style. Drives the After Repair Value calculation. Selection persists to `comparable_search_candidates.selected_yn`. *Replaces the current top-level ARV Comparables section.*

**As-Is** — recently sold comps in similar current condition. Drives the as-is value calculation (relevant for wholesale and as-is listing strategies). Selection persists to `comparable_search_candidates.selected_as_is_yn`. *Replaces the current top-level As-Is Comparables section.*

**Both share the same candidate pool** from `comparable_search_runs` where `purpose = 'arv'` or `'standard'`. The tab determines which selection flag is being toggled and which subset is highlighted on the map and pinned at the top of the table. The existing `toggleComparableCandidateSelectionAction` and `toggleAsIsComparableCandidateSelectionAction` server actions already work — they just need to be wired to the active tab.

**Switching tabs preserves state:** changing from ARV to As-Is doesn't unselect anything. The two selection sets are independent. The map and table re-render to show the active tab's selection.

#### 4.3.2 Placeholder Tabs (Phase 1 UI only — engine work deferred)

Both Scrape and Rental render as visible-but-disabled tabs in Phase 1. Clicking either switches the workspace into a placeholder empty state explaining what the tab will support and that it's not yet implemented.

**Scrape** — recently sold *new construction* comps in the area. Used for evaluating the "scrape and rebuild" strategy: how much could we sell a brand-new house for at this address? Answers the question *"is the land worth more than the structure?"*

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   📐  Scrape Comps                                       │
│                                                          │
│   New construction comp analysis is coming in a future   │
│   phase. This tab will surface recently sold new-build   │
│   homes in the area to evaluate scrape-and-rebuild       │
│   strategy.                                              │
│                                                          │
│   Future requirements:                                   │
│   • Comp engine filter for new construction              │
│   • Separate selection set per analysis                  │
│   • Land-value-aware ARV calculation                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Rental** — currently or recently rented properties. Used for rental strategy underwriting: what monthly rent could this property achieve? Drives cash flow calculations.

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│   🏠  Rental Comps                                       │
│                                                          │
│   Rental comp analysis is coming in a future phase.      │
│   This tab will surface currently and recently rented    │
│   properties to underwrite rental strategy and cash      │
│   flow projections.                                      │
│                                                          │
│   Future requirements:                                   │
│   • Rental MLS feed ingestion (different data source)    │
│   • Separate comparable_search_runs (purpose='rental')   │
│   • Rent-per-month metric instead of sale price          │
│   • Cash flow / cap rate calculation engine              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

#### 4.3.3 Tab Visual Design

- All four tabs are always visible (regardless of analysis strategy type)
- Active type tab: white background, dark text, slight emerald accent on active selection
- Inactive type tabs (Scrape, Rental in Phase 1): muted slate-300 text, subtle disabled cursor
- Tab badge: emerald count for active types with selections; `—` for placeholder types
- Optional small `coming soon` micro-label under placeholder tabs in slate-400 for first-time clarity

🟢 **DECIDED 3a — (a) Always visible.** All four tabs render for every analysis regardless of strategy type. Visual consistency, no per-property branching logic, and the analyst can preview the future shape of the tool by clicking into any tab.

#### 4.3.4 Architectural Notes (for Phase 2+ implementation)

When Scrape and Rental are wired up in a future phase, the data architecture will look something like this:

| Comp Type | Source Run | Candidate Pool | Selection Flag |
|---|---|---|---|
| ARV | `purpose = 'arv'` (existing) | Sale comps | `selected_yn` |
| As-Is | (same run as ARV) | Same sale comps | `selected_as_is_yn` |
| Scrape | `purpose = 'scrape'` (NEW) | Sale comps with new-construction filter | new flag `selected_as_scrape_yn` OR separate run+candidates |
| Rental | `purpose = 'rental'` (NEW) | **Rental listings** (separate data source) | new flag OR separate run+candidates |

**Open architecture question for the future phase:** should ARV+As-Is+Scrape share one run (single candidate pool, multiple flags) OR should Scrape get its own run? Sharing the pool is simpler but forces them to use the same filter parameters. Separate runs give full flexibility but require multiple loads. *No decision needed now — flag for the phase that builds Scrape support.*

🟢 **DECIDED 3 — YES.** Replace the current ARV/As-Is dual sections with a single comp workspace + tab bar. Add Scrape and Rental as visible-but-disabled placeholder tabs in Phase 1. Engine work for Scrape and Rental is deferred to future phases.

### 4.4 Map Controls (under map)

Reuse from modal:
- `AddCompByMls` — text input + Add button to manually pull a comp by MLS#
- `ExpandSearchPanel` — collapsible panel with override knobs (radius, day range, building SF tolerance, etc.) and "Expand Search" button that re-runs comparable search with relaxed filters

These are pure UI ports — the underlying actions (`addManualScreeningCompAction`, `expandComparableSearchAction`) already work in workstation mode since the modal already supports it.

---

## 5. Right Tile Column

This is the new design's centerpiece. A vertical stack of 9 collapsible cards. Each card is **collapsed by default** showing only headline numbers and a small expand affordance. Clicking opens a partial-screen modal for editing/detail.

### 5.0 Card Anatomy

**Collapsed state (always visible, ~32–48px tall):**
```
┌──────────────────────────────────────┐
│  ARV               $1,125,000   ▾    │
│  12 comps · $580/sf      [Override]  │
└──────────────────────────────────────┘
```

- Title (uppercase, 9px tracking)
- One headline number (font-mono, bold)
- One context line (small, slate-400)
- Optional `Override` badge (emerald) if a manual value is active
- Click anywhere on the card → open modal
- Optional inline + button on the right edge for the most common action (e.g., "Add Note")

**Expanded state (modal overlay, partial-screen, ~600–800px wide × auto height):**
- Header: card title + close button
- Body: full editing UI matching the current dense workstation card content
- Footer: Save / Cancel / Reset to Auto buttons
- Closes on Escape, click-outside, or Save success
- Partial-screen with backdrop dim — you can still see the comp map/table behind it

🟢 **DECIDED 4 — (a) Modal overlay.** Card expansion uses a partial-screen modal overlay that dims the backdrop and focuses attention. When the analyst opens a card, they're committing to that interaction — total focus on the detail at hand, not multitasking with the comp workspace behind it. This matches the existing ScreeningCompModal interaction pattern exactly.

---

### 5.1 ARV Card

**Headline:** `Effective ARV` value in dollars
**Context:** `<comp count> comps · $<psf>/sf`
**Override badge:** if `arv.final` is non-null

**Expanded modal contains:**
- 3-tier display: Auto / Selected / Final (3 colored chips, mirror current ARV card)
- `Effective ARV` row (the headline number again, with $/sqft)
- PSF Bldg / PSF AG with red ⚠ if above local trend high
- Per-comp ARV table: Address | Close | ARV Adj | Weight (existing UI)
- Comp summary stats: avg price, avg psf, avg distance
- (No editable fields — manual ARV override lives in the Quick Analysis tile per Decision 2.)
- A small footer link: `Edit Manual ARV →` that scrolls/focuses the Quick Analysis tile's Manual ARV input

**Data:** `arv.*`, `arv.selectedDetail.perCompDetails`, `compSummary.*`, `physical.buildingSqft`, `physical.aboveGradeSqft`, `trend.detailJson?.localStats`, `manualAnalysis.arv_manual` (read-only here, edited in Quick Analysis)

**Save action:** none — this card is read-only display

---

### 5.2 Rehab Card

**Headline:** `Total Rehab` in dollars
**Context:** `$<perSqft>/sf bldg · <scope label>` (e.g., "Light", "Moderate", "Heavy")
**Override badge:** if `rehab.manual` is non-null

**Expanded modal contains:**
- Multiplier summary: `Type 0.85 · Cond 1.0 · Price 1.1 · Age 1.2 · Base 1.122` (existing — note that Cond derives live from Quick Analysis Condition input)
- Per-category scope grid (existing `RehabCard` component, lifted out of the main page):
  - Categories: Above Grade, Below Grade (fin), Below Grade (unfin), Exterior, Landscaping, Systems
  - Scope buttons: None (0x) / Light (0.5x) / Mod (1x) / Heavy (1.5x) / Gut (2x) / Custom $
  - Live cost per category
- Custom items section (label + cost rows, up to 7)
- Total + per-sqft displays (bldg and AG)
- (No "Total rehab manual" field here — that override lives in the Quick Analysis tile per Decision 2. If a Rehab Override is set in Quick Analysis, the entire category math in this modal is bypassed but still visible for context. The modal shows a banner at the top: `⚠ Rehab Override active in Quick Analysis ($X). Category math below is informational only.`)

**Data:** `rehab.*` (entire object), `physical.buildingSqft`, `physical.aboveGradeSqft`, `manualAnalysis.rehab_manual` (read-only here, edited in Quick Analysis)

**Persistence behavior (no Save button):**
- Each scope button click → instant persist (writes new `rehab_category_scopes` JSON to `manual_analysis`)
- Each custom dollar input → debounced persist (~500ms after typing stops)
- Each custom item add/remove/edit → instant or debounced persist as appropriate
- Each input shows the inline status dot (idle/saving/saved/error) — same pattern as Quick Analysis
- The total recomputes synchronously on every interaction; the persist is async in the background

**Note:** The existing `RehabCard` component is ~310 lines and already does instant client-side recalc. The Phase 1 work is to (a) *extract it* into a modal-mounted component, (b) remove its current Save button, (c) wire each input to its own debounced auto-save, and (d) remove the manual rehab $ field (it lives in Quick Analysis now).

---

### 5.3 Holding & Transaction Card (combined)

**Headline:** `Hold $<n> · Trans $<n>`
**Context:** `<days> days held`
**Override badge:** if `manualAnalysis.days_held_manual` is non-null

**Expanded modal contains:**

```
HOLDING                                      [N days held]
  Property Tax              $ X       $ X/d
  Insurance                 $ X       $ X/d
  HOA                       $ X       $ X/d
  Utilities                 $ X       $ X/d
  ─────────────────────────────────────────────
  Holding Total             $ X       $ X/d

TRANSACTION
  ── Acquisition side ──
  Acquisition Title          $ X
  Acquisition Commission    ±$ X      (signed — can be credit)
  Acquisition Fee            $ X
  ── Disposition side ──
  Disposition Title          $ X
  Disp. Commission — Buyer Agent      $ X
  Disp. Commission — Seller Agent     $ X
  ─────────────────────────────────────────────
  Transaction Total          $ X

  Acquisition subtotal (cash impact)  $ X
  Disposition subtotal (from proceeds) $ X
```

**Holding section:** Same as current — Property Tax, Insurance, HOA, Utilities each shown with daily rate, plus daily total.

**Transaction section — refined per Decision 5:**

The transaction breakdown is split into 6 individual line items grouped by acquisition vs disposition. Each line item is configurable via the strategy profile (`DENVER_FLIP_V1` and successors).

| Line | Sign | Default rate/$ | Cash flow timing |
|---|---|---|---|
| Acquisition Title | positive | 0.3% of purchase | OOP at purchase → flows into Cash Required |
| **Acquisition Commission** | **signed** (can be negative) | 0 by default | OOP at purchase if positive; CREDIT at closing if negative |
| **Acquisition Fee** | positive | $0 default flat | OOP at purchase → flows into Cash Required |
| Disposition Title | positive | 0.47% of sale | Deducted from sale proceeds (not OOP) |
| **Disposition Commission — Buyer Agent** | positive | 2.0% of sale | Deducted from sale proceeds |
| **Disposition Commission — Seller Agent** | positive | 2.0% of sale | Deducted from sale proceeds |

Defaults preserve the current ~4.77% effective transaction cost (0.3 + 0 + 0 + 0.47 + 2 + 2 = 4.77%) while exposing each as an individually configurable parameter.

**Display rules for Acquisition Commission (signed):**
- Positive: `$1,500` (slate-700, normal cost rendering)
- Zero: `—` (slate-300)
- Negative: `($1,500)` in emerald-700 with a small `credit` caption
- The Transaction Total includes the signed value (a negative acquisition commission reduces total transaction cost)

**Two subtotals at the bottom of the transaction section:**
- **Acquisition subtotal** = Acquisition Title + Acquisition Commission (signed) + Acquisition Fee — this is the OOP impact at purchase
- **Disposition subtotal** = Disposition Title + Buyer Agent + Seller Agent — this is what comes out of sale proceeds

The acquisition subtotal flows into the **Cash Required** card (§5.5) — see the cascade note below.

**Cascade to Cash Required:** Currently `cashRequired` includes `acquisitionTitle`. Per Decision 5, it must also include the (signed) `acquisitionCommission` and `acquisitionFee`. The Cash Required card's expanded modal needs an updated breakdown reflecting all three acquisition-side costs. This is a downstream change flagged here for the implementation plan.

(No editable fields in this card modal — Days Held override lives in Quick Analysis per Decision 2; the transaction line items are configured at the strategy profile level, not per-analysis.)

A small footer link: `Edit Days Held →` that focuses the Quick Analysis tile's Days Held input.

**Data:** `holding.*` (entire object), `transaction.*` (entire object — needs new fields per below), `manualAnalysis.days_held_manual` (read-only here, edited in Quick Analysis)

**Save action:** none — this card is read-only display

**Schema and engine changes required (beyond Phase 1 UI work) — flag for implementation plan:**

1. **`TransactionDetail` type** (`lib/reports/types.ts`) needs new fields:
   ```typescript
   type TransactionDetail = {
     acquisitionTitle: number;
     acquisitionCommission: number;     // NEW — signed
     acquisitionFee: number;            // NEW
     dispositionTitle: number;
     dispositionCommissionBuyer: number;  // NEW (replaces dispositionCommissions)
     dispositionCommissionSeller: number; // NEW
     acquisitionSubtotal: number;       // NEW — derived
     dispositionSubtotal: number;       // NEW — derived
     total: number;
   };
   ```

2. **`FlipStrategyProfile`** (`lib/screening/strategy-profiles.ts`) needs new parameters:
   ```typescript
   acquisitionTitlePct: 0.003,
   acquisitionCommissionPct: 0,        // NEW (default 0; signed)
   acquisitionFeeFlat: 0,              // NEW (default 0 flat $)
   dispositionTitlePct: 0.0047,
   dispositionCommissionBuyerPct: 0.02,   // NEW (was bundled)
   dispositionCommissionSellerPct: 0.02,  // NEW (was bundled)
   ```

3. **`transaction-engine.ts`** needs to compute all 6 line items + 2 subtotals + total. The math is straightforward:
   - Acquisition subtotal = title + commission + fee (commission is signed, so a negative commission reduces the subtotal)
   - Disposition subtotal = title + buyer agent + seller agent
   - Total = acquisition subtotal + disposition subtotal
   - Total math is unchanged in structure — just a more granular breakdown.

4. **`screening_results` columns** — currently the screening pipeline persists `transaction_total`. It may also persist individual transaction breakdowns; if so, the column set needs to expand. (To be confirmed during the implementation plan.)

5. **`cashRequired` calculation** — must add `acquisitionCommission` (signed) and `acquisitionFee` to the acquisition-side cash flow. The `cashRequired.purchasePrice + cashRequired.acquisitionTitle` formula becomes `purchasePrice + acquisitionTitle + acquisitionCommission + acquisitionFee` (with commission contributing its sign).

6. **Existing `manual_analysis` overrides** — currently no per-line transaction overrides exist. None are added by Decision 5. Transaction line items are governed by the strategy profile, not by per-analysis manual overrides. If a future need arises (e.g., "this specific deal has a $5K assignment fee paid to a wholesaler"), an override could be added, but it's out of scope for now.

🟢 **DECIDED 5 — Combine Holding & Transaction into one card.** AND restructure the transaction breakdown into 6 line items: Acquisition Title, Acquisition Commission (signed), Acquisition Fee, Disposition Title, Disposition Commission — Buyer Agent, Disposition Commission — Seller Agent. Defaults preserve the current ~4.77% effective cost. The signed Acquisition Commission supports credit-at-closing scenarios with parenthesis-and-emerald display. Acquisition-side costs flow into Cash Required.

---

### 5.4 Financing Card

**Headline:** `Financing $<total>`
**Context:** `$<loan> loan · <ltv>% · <rate>%`
**Override badge:** if any of `financing_rate_manual`, `financing_ltv_manual`, `financing_points_manual` are non-null

**Expanded modal contains:**
- Loan amount summary
- LTV / Annual Rate / Points / Days Held (Days Held read-only here — edit in Quick Analysis)
- Interest cost (with daily rate sub)
- Origination cost
- Total
- Monthly I/O payment
- **Manual Rate %** input (lives here, not in Quick Analysis — financing-specific)
- **Manual LTV %** input
- **Manual Points %** input
- Each manual input has its own status dot and a small `× clear` affordance to revert to auto

**Data:** `financing.*`, `manualAnalysis.financing_rate_manual`, `manualAnalysis.financing_ltv_manual`, `manualAnalysis.financing_points_manual`

**Persistence behavior (no Save button):**
- Each manual input persists via debounced auto-save (~500ms after typing stops)
- Status dot per input: `idle → saving → saved → idle` (or `error`)
- Clearing a field reverts to auto value
- The Financing card's collapsed headline updates instantly as you type

---

### 5.5 Cash Required Card

**Headline:** `Cash $<total>`
**Context:** `@ Max Offer $<purchase>`
**Override badge:** none (this is purely derived)

This card answers one of the most important questions in deal evaluation: *how much cash does the analyst need to bring to closing and through the project?* It's read-only because every value here is derived from inputs in other cards (Financing, Holding, Rehab, Transaction). But its prominence as a top-level card is justified by the importance of the question, not by edit affordances.

> **Cash Required cascade (per Dan's note):** When Decision 5 added Acquisition Commission and Acquisition Fee as new transaction line items, those costs needed to flow into Cash Required because they're acquisition-side OOP costs (paid by the buyer at closing). The breakdown below already incorporates this cascade — Acquisition Commission (signed) and Acquisition Fee both appear in the Acquisition section of the modal. Confirmed.

**Expanded modal contains:**

```
CASH REQUIRED                           @ Max Offer  $ <purchase>

  ── Acquisition (paid at closing) ──
  Down Payment            $ X      ( <rate>% of purchase )
  Acquisition Title       $ X
  Acquisition Commission  ±$ X     (signed — credit reduces cash required)
  Acquisition Fee         $ X
  Origination Cost        $ X
  Acquisition subtotal    $ X

  ── Project carry (paid through hold period) ──
  Rehab Out-of-Pocket     $ X      ( of $ Y total — $ Z covered by loan )
  Holding Total           $ X
  Interest Cost           $ X
  Carry subtotal          $ X

  ─────────────────────────────────────────────
  TOTAL CASH REQUIRED     $ X

  Loan → purchase         $ X      ( informational )
  Loan → rehab            $ X      ( informational )
```

**Acquisition section (cash needed at closing):**
- Down Payment — derived from financing LTV
- Acquisition Title — from transaction engine
- **Acquisition Commission (signed)** — NEW per Decision 5 cascade. If positive, adds to cash required. If negative (credit), reduces cash required. Display follows the signed rules from §5.3 (parentheses + emerald for negative).
- **Acquisition Fee** — NEW per Decision 5 cascade. Flat fee, always positive.
- Origination Cost — from financing engine

**Project carry section (cash needed during the hold period):**
- Rehab Out-of-Pocket — the portion of rehab not covered by loan rehab proceeds
- Holding Total — full holding cost (tax + ins + HOA + utilities × days held)
- Interest Cost — full interest payment over the hold period

**Total Cash Required** — the headline number, sum of acquisition + carry subtotals

**Footer (informational):**
- Loan → purchase (how much of the loan goes toward the purchase)
- Loan → rehab (how much of the loan is available for rehab)

(No editable fields — this card is purely a derived summary. Every input flows from other cards or the strategy profile.)

**Data:** `cashRequired.*` (entire object — schema needs new fields per Decision 5)

**Save action:** none

**Schema cascade from Decision 5:** The `cashRequired` type and computation must add `acquisitionCommission` (signed) and `acquisitionFee` to the acquisition subtotal:

```typescript
// Updated cashRequired shape
{
  purchasePrice: number;
  downPaymentRate: number;
  downPayment: number;
  acquisitionTitle: number;
  acquisitionCommission: number;     // NEW (signed)
  acquisitionFee: number;            // NEW
  originationCost: number;
  acquisitionSubtotal: number;       // NEW (derived) — sum of above
  rehabTotal: number;
  rehabFromLoan: number;
  rehabOutOfPocket: number;
  holdingTotal: number;
  interestCost: number;
  carrySubtotal: number;             // NEW (derived) — sum of carry items
  totalCashRequired: number;         // sum of both subtotals
  loanForPurchase: number;
  loanAvailableForRehab: number;
}
```

The two new subtotal fields (`acquisitionSubtotal`, `carrySubtotal`) make the breakdown explicit and easier to display without having to recompute in the UI.

🟢 **DECIDED 6 — Keep Cash Required as its own card.** Read-only does not mean unimportant. The "how much cash do I need to bring" question is one of the most important in deal evaluation and deserves a top-level slot. Plus the card incorporates the Decision 5 cascade (Acquisition Commission and Acquisition Fee added to acquisition subtotal).

---

### 5.6 Price Trend Card

**Headline:** `<rate>%/yr` (the blended applied rate)
**Context:** Direction badge (`Strong Appreciation` / `Appreciating` / `Flat` / etc.)
**Override badge:** none (trend is purely market data)

**Expanded modal contains:**
- Confidence badge (high / low / fallback)
- Direction badge
- Fallback warning if applicable
- Applied Rate (the blended value)
- Local 10% / Metro 90% blend visualization bar
- Local tier stats column: rate, low/high segments, price range, PSF building/AG range
- Metro tier stats column: same
- Summary text

**Data:** `trend.*` (entire `TrendData` object)

**Save action:** none (read-only)

---

### 5.7 Pipeline Status Card

**Headline:** `<showing_status> · <offer_status>` (compact comma-separated, deal mechanics only)
**Context:** if there's an `offer_submitted_date`, show `Offer due <date>` or similar
**Override badge:** none

> **Note:** Interest Level used to live in this card but moved to **Tile 4 (Quick Status)** per Dan's note. The Pipeline card now focuses purely on deal mechanics — what's *happening with the deal in the world* — while Tile 4 carries the analyst's *internal feeling* about the deal (Interest, Condition, Location, Next Step). One field, one home.

**Expanded modal contains:**
- Showing Status select (Not Scheduled / Scheduled / Complete / Virtual Complete)
- Offer Status select (No Offer / Drafting / Submitted / Accepted / Expired / Rejected)
- Showing Date input (if applicable)
- Offer Submitted Date input (if applicable)
- Offer Deadline Date input (if applicable)
- Watch List Note text input
- **Footer link:** `Open in Action →` — navigates to `/action/[analysisId]` (the deal mechanics page in the new top-level Action section per the restructure plan)

**Data:** `pipeline.*` (the analysis_pipeline row)

**Persistence behavior (no Save button):**
- Dropdowns persist instantly on `onChange` via `savePipelineAction`
- Date and text inputs persist via debounced auto-save (~500ms)
- Status dot per input

**Why this card stays in the Analysis Workstation even though Pipeline lives in the Action section:**
The Workstation needs the analyst to see deal status as context while underwriting — *"this is a Hot deal with a showing tomorrow, sharpen the pencil"*. But the heavy deal mechanics (offer drafting, contract management, closing checklists) belong in `/action/[analysisId]` where they can have their own focused workspace. The Workstation's Pipeline card is the **read-and-quickly-update view**; the Action page is the **deep workspace**. The footer link bridges the two.

🟢 **DECIDED 7 — Yes to both.** Pipeline Status card stays in the Workstation as quick-access context for the analyst while underwriting. Card modal footer includes an `Open in Action →` link that navigates to the corresponding `/action/[analysisId]` page for full deal mechanics.

---

### 5.8 Notes Card

**Headline:** `<count> notes`
**Context:** category breakdown — `3 location · 2 scope · 2 valuation` (top 3 categories with counts)
**Override badge:** none
**Inline action:** `+` button to add note quickly without opening the full modal (creates a small inline form)

#### Three-tier visibility model (per Decision 8)

Replaces the current `is_public` boolean with a richer model that supports targeted note sharing with specific partners.

| Tier | Schema value | Who can see it | Default |
|---|---|---|---|
| **Internal** | `'internal'` | Analyst (and other analysts in the same org) only. Never visible to any partner. | ✓ default for new notes |
| **Specific Partners** | `'specific_partners'` | A curated subset of partners who already have an active share of this analysis. The analyst picks which partners. | — |
| **All Partners** | `'all_partners'` | Every partner who has an active share of this analysis. | — |

**The access boundary rule:** A note can only be shared with partners *who already have an active share of this analysis*. You cannot share a note with someone who doesn't have access to the underlying analysis. The note inherits the analysis's access as its outer boundary and narrows from there.

This means:
- The "specific partners" picker in the note form is populated from `analysis_shares` for THIS analysis, not from a global partner list.
- If a partner's share is revoked, they automatically lose access to any notes that were shared with them — no separate cleanup needed.
- A note shared with specific partners stays in `visible_to_partner_ids` even if those partners haven't viewed it yet.

#### Category list — rename "Internal" → "Workflow"

The current category list (`Location / Scope / Valuation / Property / Internal / Offer`) has a name conflict with the new Internal visibility tier. The "Internal" *category* was historically used as a topic label for notes about analyst-team coordination ("ask Mike about this", "follow up on permit status"), which is conceptually different from the Internal *visibility tier* (audience setting).

**Rename:** `Internal` (category) → `Workflow` (icon `W`).

The new label captures the topic intent (notes about how the analysis is being conducted) without the audience-flag conflation. Existing notes get migrated to the new value.

**New category list:** `Location | Scope | Valuation | Property | Workflow | Offer`

**Migration required (small, ships with the Notes card work in Phase 1):**

```sql
UPDATE analysis_notes SET note_type = 'workflow' WHERE note_type = 'internal';
```

**Code change required:** Update `NOTE_CATEGORIES` constant in the workstation component:

```typescript
const NOTE_CATEGORIES = [
  { value: "location",  label: "Location",  icon: "L" },
  { value: "scope",     label: "Scope",     icon: "S" },
  { value: "valuation", label: "Valuation", icon: "V" },
  { value: "property",  label: "Property",  icon: "P" },
  { value: "workflow",  label: "Workflow",  icon: "W" },  // was "internal" / "I"
  { value: "offer",     label: "Offer",     icon: "O" },
];
```

#### Visibility UI in the Add Note form

The form replaces the current single Public toggle with a 3-way selector:

```
┌─────────────────────────────────────────────────────┐
│ Category:  [ Location ▾ ]                           │
│                                                     │
│ Visibility:                                         │
│   ( • ) 🔒 Internal      ( ) 👥 Partners ( ) 🌐 All│
│                                                     │
│   [ when Partners is selected: ]                    │
│   Share with: [×Mike Smith] [×Jane K.] [+ add ▾]    │
│   (only partners with active shares of this         │
│    analysis appear in the picker)                   │
│                                                     │
│ Body:                                               │
│ [  textarea — note body  ]                          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

- The picker chip-list under "Specific Partners" only shows when that tier is selected
- Picker source: `analysis_shares` rows for this analysis where `is_active = true`
- Empty picker state (no partners shared yet): show inline message "No partners have active shares yet. Share the analysis first." with a link to open the Partner Sharing card

#### Visibility display in the existing notes list

Each existing note row in the modal shows a small visibility badge so the analyst can scan at a glance who can see what:

```
[L] Location  · Basement permit issue at 1005 Garfield...      🔒 INT      [×]
[V] Valuation · Comp 4 ARV looks aggressive, dropping it       👥 2 ptnrs  [×]
[P] Property  · Photos show heavy water damage in kitchen      🌐 ALL      [×]
```

- 🔒 INT — internal (slate)
- 👥 N ptnrs — specific partners (indigo, where N is the count from `visible_to_partner_ids`)
- 🌐 ALL — all partners (emerald)

Clicking the visibility badge on an existing note opens an inline editor that lets the analyst change the tier or adjust the partner list — visibility is editable after creation, not just at creation time.

#### Filter chips

Existing filter by category (Location / Scope / Valuation / Property / Internal / Offer) — preserved.

NEW: filter by visibility tier — small chip group below the category chips:
- All visibility | Internal only | Shared with partners | All-partners visible

This is useful when prepping to share an analysis ("let me make sure no internal notes are accidentally visible") or when reviewing what a specific partner can see.

#### Expanded modal contents (full)

- Add Note form: category select, **3-way visibility selector**, **conditional partner picker**, body textarea
- Filter chips by category
- Filter chips by visibility tier
- List of existing notes: category badge, body, **visibility badge** (clickable to edit), delete button
- Sorted by `created_at` desc

**Data:** `notes[]` (with new `visibility` and `visible_to_partner_ids` fields), `analysis_shares[]` (for the partner picker)

**Persistence behavior (no Save button):**
- Add Note form has a single Save button (Add Note is a transactional action — creating a row, not editing)
- Existing note edits (visibility tier change, partner list change) auto-persist on `onChange`
- Delete is a confirmed-then-instant action

**Save actions (updates from existing):**
- `addAnalysisNoteAction` — update to accept `visibility` and `visible_to_partner_ids`
- `updateAnalysisNoteVisibilityAction` (NEW) — for changing tier or partner list on an existing note
- `deleteAnalysisNoteAction` (existing)

#### Schema migration (flag for implementation plan)

```sql
-- Step 1: Add new columns with defaults
ALTER TABLE analysis_notes
  ADD COLUMN visibility text
    CHECK (visibility IN ('internal', 'specific_partners', 'all_partners'))
    DEFAULT 'internal';
ALTER TABLE analysis_notes
  ADD COLUMN visible_to_partner_ids uuid[] DEFAULT NULL;

-- Step 2: Backfill existing rows
UPDATE analysis_notes
  SET visibility = CASE WHEN is_public THEN 'all_partners' ELSE 'internal' END;

-- Step 3: Mark old column for removal (drop in follow-up migration after verification)
COMMENT ON COLUMN analysis_notes.is_public IS 'DEPRECATED — use visibility column. Will be dropped in next migration.';
```

#### RLS policy implications (Phase 1 partner portal work)

When the partner-facing view at `/portal/deals/[shareToken]` queries notes for an analysis, the RLS policy needs to filter by the visibility model:

```sql
-- Pseudocode for the partner-side notes RLS policy
USING (
  -- Internal notes are never visible to partners
  visibility != 'internal'
  AND (
    -- All-partners notes are visible if they have any active share of this analysis
    visibility = 'all_partners'
    OR
    -- Specific-partner notes are visible only if they're in the array
    (visibility = 'specific_partners' AND auth.uid() = ANY(visible_to_partner_ids))
  )
  AND EXISTS (
    SELECT 1 FROM analysis_shares
    WHERE analysis_id = analysis_notes.analysis_id
      AND shared_with = auth.uid()
      AND is_active = true
  )
)
```

This is more complex than the current "all authenticated full access" policy and is part of the broader RLS rewrite in Phase 1 — Step 2 of the restructure plan.

🟢 **DECIDED 8 — Three-tier visibility.** Replace the `is_public` boolean with `visibility` enum (`internal` / `specific_partners` / `all_partners`) plus a `visible_to_partner_ids` array. Specific-partner notes are scoped to partners who already have an active share of the analysis. Visibility is editable after creation. The partner-side RLS policy enforces the boundary.

---

### 5.9 Partner Sharing Card ★ NEW for Phase 1

This is the heart of the Phase 1 partner portal deliverable. The card lives in the right column AND has a parallel `Share` button in the header (Decision 1).

**Headline (state-dependent):**
- Not yet shared: `Not shared` (slate-400)
- Shared, no responses: `Shared with <n> partners`
- Shared with responses: `<n> shared · <m> viewed · <k> interested`

**Context line:**
- Most recent action: `<Partner Name> marked Interested · 2h ago`
- Or: `Awaiting feedback`

**Override badge:** none

**Expanded modal contains:**
- **Top section — Add new share:**
  - Pick from registered partners (multi-select chips) OR
  - Invite new partner by email + name (creates a `partner_email` placeholder until they register)
  - Optional message field (gets included in the email)
  - "Send Share" button → calls `createAnalysisShareAction` → generates `share_token`, creates `analysis_shares` row, sends email via Resend
- **Middle section — Active shares list:**
  - Each row: partner name (or email if not registered) + sent date + view count + total time + last action + chevron
  - Click row to expand: shows partner's `partner_analysis_versions` adjustments (their ARV, rehab, days_held), their `partner_feedback` action (interested / pass / showing_request / discussion_request), pass reason if any, free-text notes, second-degree forwards
  - Per-row "Revoke" button (sets `is_active = false` on `analysis_shares`)
- **Bottom section — Realtime feedback indicator:**
  - "↻ Refresh" button (or auto-refresh via Supabase Realtime — Phase 2)
  - Pending feedback red dot if there's anything new since `last_viewed_by_analyst_at`

**Data:** new tables in Phase 1 schema:
- `analysis_shares`
- `partner_analysis_versions`
- `partner_feedback`
- `share_forwards` (Phase 2)

**Save actions (NEW for Phase 1):**
- `createAnalysisShareAction` — creates share, sends email
- `revokeAnalysisShareAction` — sets is_active false
- `markFeedbackReadAction` — clears the unread indicator

🟢 **DECIDED 9 — Use Supabase Realtime in Phase 1.** The Partner Sharing card auto-refreshes via Supabase Realtime channel subscriptions. New feedback, new views, and partner adjustments appear live without the analyst having to refresh anything. This was originally proposed as a Phase 2 polish item; Dan elevated it because *"this would be an amazing / addictive feature"* and the value is too high to defer.

**Realtime architecture:**

```typescript
// Subscribe on Workstation mount, unsubscribe on unmount
const channel = supabase
  .channel(`workstation:${analysisId}`)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'analysis_shares',
        filter: `analysis_id=eq.${analysisId}` },
      handleShareChange)
  .on('postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'partner_feedback',
        filter: `analysis_id=eq.${analysisId}` },
      handleNewFeedback)
  .on('postgres_changes',
      { event: '*', schema: 'public', table: 'partner_analysis_versions',
        filter: `analysis_id=eq.${analysisId}` },
      handlePartnerAdjustment)
  .subscribe();
```

**Three event streams:**

1. **`analysis_shares` changes** — new shares created, shares revoked, view count / first viewed timestamps updated. Updates the card's headline counts and the rows in the active shares list.
2. **`partner_feedback` inserts** — new actions taken by partners (Interested / Pass / Showing Request / Discussion Request). Triggers the unread feedback indicator and a subtle visual pulse on the card.
3. **`partner_analysis_versions` changes** — partners adjusting their ARV / rehab / days held in their sandbox. Updates the per-partner detail rows in the active shares list.

**Visual feedback when Realtime events arrive:**

- New feedback insert: small red unread badge appears on the Partner Sharing card (collapsed) and pulses for ~2 seconds. Optional toast notification at the top-right of the workstation: `★ New feedback from <partner name>`.
- Partner adjustment: the relevant share row in the modal (if open) updates in place with a subtle highlight fade (slate-50 → indigo-50 → slate-50 over 1 second).
- View count update: silent — just refreshes the number, no animation.
- Share revoked (by another analyst in the org): the row updates to show "Revoked" state.

**Bidirectional Realtime — partner side too:**

The partner-facing view at `/portal/deals/[shareToken]` should ALSO subscribe to Realtime so:
- The partner sees if the analyst updates the underlying analysis (rare during a partner's session, but possible)
- The analyst's `markFeedbackReadAction` doesn't fire conflicting updates
- A future feature where multiple partners can collaborate would just plug into the same channel

This is a small additional cost but makes the system feel coherent across both sides.

**Subscription lifecycle:**

- Subscribe in a `useEffect` on Workstation mount, with `analysisId` and `supabase` client as dependencies
- Unsubscribe in the cleanup return — Supabase will clean up the channel server-side
- Handle reconnection automatically (Supabase Realtime client manages this)
- On error or disconnect, fall back to manual refresh (the existing `loadAnalysisShares` action) so the analyst is never stuck looking at stale data

**Phase 1 scope addition:**

This adds ~150–200 LOC of subscription wiring + state management to the Partner Sharing card and a small bit to the partner-side view. It's not a huge add but it's real work — flag for the implementation plan. Trade-off accepted: slightly more Phase 1 surface area in exchange for an "addictive" UX that turns the workstation into a live dashboard.

**`markFeedbackReadAction` is still needed.** Realtime delivers the *event*; the "read" state is a separate persistent flag (`analysis_shares.last_viewed_by_analyst_at` or similar) that needs explicit dismissal so the unread indicator doesn't keep firing on every page load.

🟢 **DECIDED 10 — Yes, surface the share state in the header.** Small inline pill in the header bar next to the strategy badge showing the active share count and any pending feedback. Click the pill to open the Partner Sharing card modal. This means the analyst sees share state from anywhere in the workstation without having to scan to the right column.

**Pill content (state-dependent):**
- No shares: pill is not rendered
- Shares exist, no pending feedback: `2 shared` (slate)
- Shares exist, pending feedback: `2 shared · 1 new ●` (indigo with red dot — also pulses subtly when Realtime delivers a new event)
- All shares revoked: pill is not rendered

The pill is a Realtime-aware micro-component that subscribes to the same `analysis_shares` and `partner_feedback` channels as the Partner Sharing card. They share state via a small Zustand store or React context.

---

## 6. Component Reuse Strategy

The Phase 1 implementation should aggressively reuse existing components rather than rewrite. Specifically:

| Existing component | New role | Action |
|---|---|---|
| `ScreeningCompModal` | The basis for the new Workstation hero | Extract its body (map + comp table) into a new `<CompWorkspace>` component shared with the modal |
| `RehabCard` (current `analysis-workstation.tsx` ~310 lines) | Body of the Rehab card modal | Lift into `components/workstation/rehab-card-modal.tsx` |
| `ArvBreakdownTooltip` | Per-comp ARV tooltips in the comp table | Reuse as-is |
| `CompMap` | Hero map | Reuse as-is |
| `AddCompByMls` (currently inside modal) | Under-map control in hero | Extract from modal into shared component |
| `ExpandSearchPanel` (currently inside modal) | Under-map control in hero | Extract from modal into shared component |
| `DealStat` (currently in workstation) | Stat strip pill | Reuse as-is |
| `TrendDirectionBadge`, `TrendTierColumn` | Body of Price Trend card modal | Lift into `components/workstation/trend-card-modal.tsx` |
| `CostLine` (currently in workstation) | Cost line rows in Holding/Trans/Financing/Cash modals | Reuse as-is |

**New components needed:**
- `<WorkstationHeader>` — header bar
- `<SubjectTileRow>` — the 3-tile MLS/Physical/QuickAnalysis row (extract from both modal and workstation)
- `<DealStatStrip>` — extract from both
- `<CompWorkspace>` — the hero (map + table + tab toggle + add/expand)
- `<RightTileColumn>` — the container for the 9 cards
- `<DetailCard>` — generic collapsible card wrapper (props: title, headline, context, badge, onExpand)
- `<DetailModal>` — generic modal wrapper for expanded card content
- One modal per card: `<ArvCardModal>`, `<RehabCardModal>`, `<HoldTransCardModal>`, `<FinancingCardModal>`, `<CashRequiredCardModal>`, `<PriceTrendCardModal>`, `<PipelineCardModal>`, `<NotesCardModal>`, `<PartnerSharingCardModal>`

**Result:** the new `app/(workspace)/analysis/[analysisId]/page.tsx` becomes a thin orchestrator (~150 lines) that loads `WorkstationData` and renders the layout. The detail logic lives in the modal components.

---

## 7. Partner View Compatibility

The plan calls for a partner-facing view at `/portal/deals/[shareToken]` that is a stripped-down sandboxed version of the same analysis. The card structure above is designed so the partner view can reuse the same components with feature flags.

**Tiles partners SEE (with edit-disabled where appropriate):**
- Header (limited — no Mark Complete, no Generate Report, no Share button, no active share pill)
- Property Physical tile (including the bed/bath level grid)
- Quick Analysis tile (their own private values, persisted to `partner_analysis_versions` per Decision 11)
- Deal Stat strip (live-recalculated from their Quick Analysis values)
- Comp Workspace (read-only map + table; can pick comps in their own private set)
- ARV card
- Rehab card (with their own override field via their Quick Analysis)
- Price Trend card (read-only)

**Tiles partners DO NOT SEE:**
- MLS Info tile (raw MLS data — show only public-safe summary)
- **Quick Status tile (Tile 4)** — this is the analyst's working state (Interest, Condition, Location, Next Step). Partners shouldn't see how the analyst is internally categorizing the deal.
- Holding & Transaction card (analyst back-office)
- Financing card (analyst back-office)
- Cash Required card (analyst back-office)
- Pipeline Status card (analyst's deal mechanics)
- Notes card (visibility-filtered per Decision 8 — only notes where the partner is in the audience are visible)
- Partner Sharing card (this is the analyst's dashboard of *who they shared with*)

**Partner-only tiles:**
- An `Action Buttons` card with: "I'm Interested" / "Schedule Showing" / "Request Discussion" / "Pass" (with reason prompt)

This is a Phase 1 deliverable and should be considered when designing the card components — pass `viewMode: "analyst" | "partner"` as a prop to gate features.

🟢 **DECIDED 11 — Partner adjustments persist permanently.** All partner-side inputs (their ARV override, rehab override, days held, target profit, selected comp set, notes) save to `partner_analysis_versions` and persist forever — not session-only. Partners can return to their analysis days, weeks, or months later and see their own projections preserved.

**Dan's rationale (worth preserving):** *"Partner should be able to return to their notes and analysis, even months later, to see if their ARV was accurate and if they are missing opportunities that others are successfully executing."*

This decision unlocks a meaningful future feature: **partner self-reconciliation.** When a deal is closed (or even just observed in the market), partners can compare their original projections to actual outcomes. *"My ARV was $1.05M, the property closed at $1.12M — I was conservative."* Or worse: *"My ARV was $1.20M, the property closed at $1.05M and the analyst was right that I was too aggressive."* This creates a feedback loop that makes partners better evaluators over time and reinforces trust in the analyst's recommendations.

**Persistence model (mirrors the analyst Quick Analysis pattern from Decision 2):**
- Every partner input auto-persists via debounced save (~500ms) to `partner_analysis_versions`
- One row per partner per analysis (created on first interaction, upserted on every change)
- Inline status dots on each input show save state (idle / saving / saved / error)
- No Save buttons anywhere on the partner side either — same "if you type it, it's live" philosophy as the analyst side
- Partner returning to the analysis: their saved values pre-fill the inputs automatically; they can continue adjusting from where they left off

**Schema implication for `partner_analysis_versions`:**

The table needs to support all the inputs the partner can adjust. Per Decision 2, the analyst's Quick Analysis tile has 6 fields (ARV, Rehab, Target Profit, Days Held, Condition, Location). Partners get a similar but smaller set:

```sql
partner_analysis_versions (
  id uuid PRIMARY KEY,
  share_id uuid REFERENCES analysis_shares(id),
  partner_id uuid REFERENCES profiles(id),
  -- The partner's own override values (mirror analyst's Quick Analysis structure)
  arv_override numeric,
  rehab_override numeric,
  target_profit_override numeric,    -- NEW relative to original Sonnet plan
  days_held_override integer,
  -- Their curated comp selection
  selected_comp_ids uuid[],
  -- Their freeform notes about the deal
  notes text,
  -- Lifecycle
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  last_viewed_at timestamptz,
  -- Reconciliation hook (Phase 4 work)
  archived_at timestamptz,            -- set when partner explicitly closes/archives their version
  UNIQUE (share_id, partner_id)
);
```

Note: this slightly extends the original `partner_analysis_versions` schema in the Sonnet restructure plan by adding `target_profit_override` (per Decision 2 cascading to partner side) and `last_viewed_at` (for the "you haven't looked at this in 60 days" Phase 4 reconciliation reminder).

**Partner does NOT get the analyst's Condition or Location overrides** because:
- Condition feeds the rehab calculation in the analyst's flow; if a partner cares about rehab, they override rehab directly with their own dollar number rather than fiddling with multiplier inputs
- Location is a qualitative tag with no current calc impact and is more meaningful to the analyst than to the partner

**Phase 4 reconciliation hook:** Once a deal closes, the archived `partner_analysis_versions` row becomes the partner's "what I predicted" record that can be compared to the actual outcome. This is Phase 4 territory but the schema supports it now so we don't need a future migration.

---

## 8. Data Loading

**Server-side load** (no change to API surface):
- `loadWorkstationData(analysisId)` → returns the existing `WorkstationData` type
- All cards source from this single load

**No additional queries needed for Phase 1** EXCEPT:
- New `loadAnalysisShares(analysisId)` to populate the Partner Sharing card
- This should be a separate function so the Partner Sharing card can refresh independently without re-loading the entire workstation

**New WorkstationData fields needed for Phase 1:**
```typescript
shares: {
  totalCount: number;
  viewedCount: number;
  feedbackCount: number;
  unreadFeedbackCount: number;
  shares: Array<{
    id: string;
    partnerName: string | null;
    partnerEmail: string;
    sentAt: string;
    firstViewedAt: string | null;
    viewCount: number;
    totalTimeSeconds: number;
    lastFeedback: { actionType: string; submittedAt: string } | null;
    isActive: boolean;
  }>;
}
```

This is a small, additive change to `WorkstationData`. No existing field changes.

---

## 9. Open Decision Summary

| # | Decision | My Recommendation |
|---|---|---|
| 1 | Where does `Share` button live? | 🟢 **DECIDED — (c) Both** header button + right column card |
| 2 | Override architecture & persistence model | 🟢 **DECIDED — Eliminate Overrides card; consolidate to Quick Analysis (6 fields, auto-persist); Rate%/LTV%/Points% stay in Financing card; no Save buttons anywhere; manual values visually distinct in Deal Stat Strip** |
| 3 | Replace ARV/As-Is dual sections with tab bar? | 🟢 **DECIDED — YES.** Plus Scrape and Rental added as placeholder tabs (Phase 1 UI scaffolding only) |
| 3a | Placeholder tab visibility | 🟢 **DECIDED — (a) Always visible** for all analyses regardless of strategy type |
| 4 | Card expansion mechanism? | 🟢 **DECIDED — (a) Modal overlay.** Total focus on detail when card is open |
| 5 | Combine Holding+Transaction card or split? | 🟢 **DECIDED — Combine.** PLUS restructure transaction into 6 line items: Acq Title, Acq Commission (signed), Acq Fee, Disp Title, Disp Commission Buyer, Disp Commission Seller. Acq-side costs cascade to Cash Required. |
| 6 | Cash Required as own card or fold into Financing? | 🟢 **DECIDED — Own card.** Read-only doesn't mean unimportant; "how much cash do I need" deserves top-level visibility. Card now incorporates Decision 5 cascade (Acquisition Commission + Fee added to acquisition subtotal). |
| 7 | Pipeline card stays + links to /action? | 🟢 **DECIDED — Yes to both.** Card stays in Workstation as quick-update context. Modal footer link `Open in Action →` to `/action/[analysisId]` for full deal mechanics. |
| 8 | Notes visibility model | 🟢 **DECIDED — Three tiers.** `internal` / `specific_partners` (with curated picker) / `all_partners`. Replaces `is_public` boolean. Partner picker scoped to active analysis_shares. Visibility editable after creation. RLS enforces boundary. |
| 8a | Notes category cleanup | 🟢 **DECIDED — Rename `Internal` → `Workflow`** (icon `W`). Small migration: `UPDATE analysis_notes SET note_type='workflow' WHERE note_type='internal'`. Eliminates collision with Internal visibility tier. |
| 9 | Partner Sharing realtime updates? | 🟢 **DECIDED — Supabase Realtime in Phase 1.** Subscribes to `analysis_shares`, `partner_feedback`, `partner_analysis_versions` filtered by analysis_id. Bidirectional (partner side too). Visual pulse + unread badge on new feedback. |
| 10 | Header pill showing active share state? | 🟢 **DECIDED — Yes.** Small pill next to strategy badge. State-dependent rendering. Click → opens Partner Sharing modal. Realtime-aware. |
| 11 | Partner Quick Analysis persists? | 🟢 **DECIDED — Yes, permanently.** All partner inputs auto-persist to `partner_analysis_versions` with same debounced save model. Enables Phase 4 partner self-reconciliation. |

**Please walk through each of these and give me a verdict** (accept / modify / reject + alternative). Once locked, I'll write the Phase 1 — Step 1 implementation plan against this spec.

---

## 10. What Phase 1 Implementation Will Need (Preview)

This is not the implementation plan — it's a sanity check that the spec is implementable. Phase 1 — Step 3 (Route Restructure) and Step 4 (Partner Portal MVP) will need:

1. **New route:** `app/(workspace)/analysis/[analysisId]/page.tsx` (server component, loads `WorkstationData` + `analysis_shares`)
2. **New client component:** `analysis-workstation.tsx` (the orchestrator, slim wrapper)
3. **Extract shared components** from modal and current workstation per §6
4. **9 detail card components** (1 collapsed + 1 modal each = 18 small components, but most are ~50–100 lines)
5. **3 new server actions** for sharing (`createAnalysisShareAction`, `revokeAnalysisShareAction`, `markFeedbackReadAction`)
6. **3 new tables** per the restructure plan (`analysis_shares`, `partner_analysis_versions`, `partner_feedback`)
7. **Resend integration** for share invite emails (separate concern, scoped in the email service decision)
8. **Legacy redirect** from `/deals/watchlist/[analysisId]` → `/analysis/[analysisId]`
9. **Partner view** at `/portal/deals/[shareToken]` reusing the same card components with `viewMode="partner"`
10. **Schema migrations** for the 3 new tables + RLS policies + `organization_id` columns per the restructure plan

This is a lot, but most of it is straightforward extract-and-render once the spec is locked. The hard architectural questions are answered by §5 and §6 above.

---

*Drafted by Claude Opus | 2026-04-10 | Awaiting Dan's review of Decisions 1–11*

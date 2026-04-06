## 2026-04-05 — Quick Comps Modal: Evaluate and Pick Comps from the Queue

### Summary

Added a one-click "Quick Comps" modal to both the **Screening Batch Results** and **Analysis Queue** pages. Users can now view the comp map, pick/unpick comps, and promote directly to a full analysis — all without leaving the queue. This eliminates the 3–4 click workflow that previously forced users to create an analysis before they could evaluate comparable quality.

### What changed

#### New components

- **`components/screening/screening-comp-modal.tsx`** — Modal with a 420×420 square map (left) and condensed candidate table (right). Supports pick/unpick from both the map pins and table buttons with optimistic local state updates. Footer bar shows "Begin Analysis →" to promote the screening result, or "Open Analysis →" if already promoted. Escape / backdrop click to close.
- **`components/screening/batch-results-table.tsx`** — Client wrapper for the screening batch results table. Manages modal state and renders the Map button as the far-left column.
- **`components/screening/queue-results-table.tsx`** — Client wrapper for the analysis queue table with the same Map button + modal support, plus promoted-analysis awareness.

#### New server actions (`screening/actions.ts`)

- **`loadScreeningCompDataAction`** — Fetches comp candidates with coordinates and subject data for a given screening result.
- **`toggleScreeningCompSelectionAction`** — Toggles comp candidate `selected_yn` without requiring an analysis ID (screening-context selection).

#### Updated pages

- **`/analysis/screening/[batchId]`** — Now uses `BatchResultsTable` client component. Map button is the first column.
- **`/analysis/queue`** — Now uses `QueueResultsTable` client component. Map button is the first column.

### Design decisions

- **No analysis required to evaluate comps.** The toggle action works directly on `comparable_search_candidates` without an analysis ID, so comp picks persist on the screening result and carry forward when the user eventually promotes.
- **Modal width 1060px** — wide enough for the square map + 8-column condensed table to display without horizontal scroll.
- **Promote from modal.** The "Begin Analysis →" button calls the existing `promoteToAnalysisAction` which creates the analysis, links the comp search run, and redirects to the workstation with comps pre-loaded.

---

## 2026-04-05 — Fix Screening Subject Query Pagination

### Summary

Fixed a bug where screening batches were silently capped at ~1,000 subjects due to the default Supabase/PostgREST row limit. The subject listing query in `app/(workspace)/analysis/screening/actions.ts` was fetching matching MLS listings without pagination, so only the first 1,000 rows were returned. After deduplication this yielded 984 unique properties instead of the expected 6,410+ active listings.

### What changed

- **`actions.ts` → `runScreeningAction`**: Replaced the single unpaginated Supabase query with a paginated loop that fetches listings in pages of 1,000 and accumulates all `real_property_id` values until no more rows remain.

### Root cause

Same class of bug as the import batch processing cap documented in CLAUDE.md §21.7 — any Supabase `.select()` without explicit `.range()` or `.limit()` silently returns at most 1,000 rows.

---

## 2026-04-05 — Data-Driven Market Trend Engine

### Summary

Replaced the fixed -5%/year market time adjustment with an intelligent, data-driven rolling trend rate derived from actual closed sales in the database. Each subject property now receives a per-property blended market trend rate computed via OLS regression on $/sqft vs. close date across two geographic tiers (local neighbourhood and broader metro area). The trend rate flows through the entire ARV pipeline using a two-pass calculation and is fully auditable on every screening result.

---

### Trend Engine (`lib/screening/trend-engine.ts`)

Pure function module with zero DB dependencies. Takes a pre-loaded pool of closed sales and subject property parameters, returns a full `TrendResult` with:

- **OLS regression** on $/sqft vs. time for annualized rate of change
- **Two-tier radius**: local (≤0.75 mi) and metro (≤12 mi), blended 70/30
- **Similar property filtering**: same property type, ±20% sqft, ±15 years built, ±25% price tier
- **Segment trends**: low-end (25th percentile) and high-end (75th percentile) computed independently per tier
- **Guardrails**: minimum 8 comps required (fallback to fixed -5% with flag), asymmetric clamp (-20%/+12%)
- **Direction classification**: strong appreciation / appreciating / flat / softening / declining / sharp decline
- **Per-tier stats**: comp count, sale price range, PSF Building range, PSF Above Grade range

### Two-Pass ARV in Bulk Runner

1. **Pass 1**: Rough ARV using fallback rate → establishes price anchor for trend filtering
2. **Trend calculation**: Per-subject trend rate using rough ARV as the price tier anchor
3. **Pass 2**: Final ARV using the data-driven trend rate

The trend sales pool is built from the same pre-loaded comp pool — zero additional DB queries per batch.

### Strategy Profile (`TrendConfig`)

All trend parameters are configurable in the strategy profile, not in engine code:

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `localRadiusMiles` | 0.75 | Local neighbourhood radius |
| `metroRadiusMiles` | 12 | Broader metro radius |
| `localWeight` / `metroWeight` | 0.7 / 0.3 | Blend weights |
| `minComps` | 8 | Fallback threshold |
| `clampMin` / `clampMax` | -0.20 / +0.12 | Asymmetric rate clamp |
| `fallbackRate` | -0.05 | Fixed rate when data insufficient |

Asymmetric clamp rationale: wider downside (-20%) lets depreciation signals flow through to protect against overpaying in falling markets; tighter upside (+12%) prevents chasing appreciation-inflated ARVs.

### Database

- 13 new columns on `screening_results`: `trend_annual_rate`, `trend_local_rate`, `trend_metro_rate`, comp counts, radii, confidence, segment rates, summary text, and full `trend_detail_json`
- `analysis_queue_v` recreated to expose trend columns

### UI: Deal Detail — Market Trend Card

New section card on the screening deal detail page (`/analysis/screening/[batchId]/[resultId]`) showing:

- **Confidence badge** ("Confidence: High/Low/Fallback") + **Direction badge** ("Softening", "Declining", etc.)
- Applied blended rate
- Two-column Local / Metro breakdown: rate, low-end segment (with comp count), high-end segment (with comp count), sale price range, PSF ranges
- Plain-English summary with fallback explanation when applicable

### UI: Analysis Workstation — Price Trend Card

New card between ARV and Rehab in the analysis workstation (`/analysis/properties/[id]/analyses/[analysisId]`):

- Same dual badges (confidence + direction)
- Two-column Local / Metro layout with per-tier segments, comp counts, and ranges
- Trend rate from screening flows into the analysis ARV calculation (overrides the fixed profile rate)

### UI: ARV Card — Subject PSF with Range Check

The Effective ARV box now shows:

- **PSF Building** and **PSF Above Grade** derived from effective ARV / subject sqft
- Values turn **red** with "> local" indicator when they exceed the local tier's PSF range high from trend data

### UI: Analysis Queue — Trend Column

New **Trend** column after ARV in the analysis queue table. Each cell shows the annualized rate as a color-coded pill matching the direction classification (green → amber → red spectrum).

---

## 2026-04-05 — Analysis Workstation Redesign, Cost Breakdown Cards, and Cash-to-Close

### Summary

Complete redesign of the analysis workstation page for single-screen productivity. Replaced the spread-out card layout with a dense 5-column analysis grid showing the deal waterfall, detailed cost breakdown cards for all five calculation components (ARV, Rehab, Holding, Transaction, Financing), and compressed analyst overrides — all above the comp map and table. Added rehab scope tiers (Cosmetic/Moderate/Heavy/Gut), a Cash Required calculator, and dual max offer display (Financed vs Cash buyer).

---

### Analysis Workstation UX Redesign

#### Compact header bar
Property facts (type, beds/baths, sqft, basement, year built, lot, tax, HOA, list price) collapsed into a single dense inline bar, replacing the oversized Property Facts card and 7-chip stat row.

#### 5-column analysis grid
All cost analysis fits in one horizontal band:

| Column | Content |
|--------|---------|
| Deal Waterfall (180px) | ARV → costs → Max Offer (Financed + Cash) with Offer %, Spread, Gap/sqft, Project Costs |
| ARV Detail | 3-tier ARV (Auto/Selected/Final), per-comp ARV table with adjusted values and decay weights |
| Rehab Detail | Scope tier selector, multiplier breakdown, line items (above/below grade, exterior, landscaping, systems) |
| Holding + Transaction (stacked) | Holding: daily cost breakdown with daily rates. Transaction: title + commission line items with percentages |
| Financing + Cash Required + Overrides (stacked) | Financing detail, cash-to-close breakdown, compressed override form |

#### Comps + map
Map (340px) and selected comps table side by side below the analysis grid. Notes and Pipeline compressed side by side at the bottom.

---

### Rehab Scope Tiers (New Feature)

Added analyst-selectable renovation depth that multiplies all rehab line items:

| Tier | Multiplier | Description |
|------|-----------|-------------|
| Cosmetic | 0.6x | Paint, carpet, cleaning |
| Moderate | 1.0x | Standard rehab (default) |
| Heavy | 1.4x | Significant structural/mechanical |
| Gut | 2.0x | Down to studs |

- Clickable buttons in the Rehab card — saves immediately and recalculates
- Scope multiplier applied on top of existing composite multiplier (type × condition × price × age × scope)
- New `rehab_scope` column in `manual_analysis` table
- New `scopeMultipliers` config in `RehabConfig` type and `DENVER_FLIP_V1` profile
- New `RehabScopeTier` type in `lib/screening/types.ts`

#### Database migration
- `20260405180000_add_rehab_scope.sql` — adds `rehab_scope text` with check constraint for valid values

---

### Cash Required Calculator (New Feature)

Answers "how much cash do I need in the bank to execute this deal?" based on the max offer price:

```
Down Payment     = Max Offer × 20%
Loan for Purchase = Max Offer − Down Payment
Origination      = deducted from loan at closing
Loan for Rehab   = Loan Amount − Purchase Portion − Origination
Rehab OOP        = max(0, Rehab Total − Loan Available for Rehab)

Total Cash = Down Payment + Acq Title + Origination + Rehab OOP + Holding + Interest
```

- Uses max offer (not list price) as purchase basis
- Shows loan utilization: how much funds purchase vs rehab draws
- Excludes disposition costs (paid from sale proceeds)
- Notes that down payment is equity returned at sale
- New `downPaymentRate` field in `FinancingConfig` (default 20%)

---

### Dual Max Offer Display

Deal Math waterfall now shows two offer lines:
- **Financed** — standard max offer accounting for all costs including financing
- **Cash** — max offer + financing cost (cash buyer avoids interest + origination, can offer more for same profit)

---

### Full Calculation Detail Cards

All five cost components now show detailed breakdowns inline (previously only totals were visible):

- **ARV**: per-comp table with close price, time-adjusted ARV, and decay weight
- **Rehab**: scope selector, individual multipliers, 6 line items with per-sqft rates
- **Holding**: daily rates for each cost category (tax, insurance, HOA, utilities) alongside period totals
- **Transaction**: each line item with its rate percentage
- **Financing**: loan parameters, daily interest rate inline with interest cost, I/O monthly payment

---

### Technical Changes

- **page.tsx**: Now computes and passes full `RehabResult`, `HoldingResult`, `TransactionResult`, and ARV per-comp details to the client component (previously only totals)
- **strategy-profiles.ts**: Added `scopeMultipliers` to `RehabConfig`, `downPaymentRate` to `FinancingConfig`
- **types.ts**: Added `RehabScopeTier`, `CashRequiredResult` types
- **actions.ts**: `saveManualAnalysisAction` now persists `rehab_scope`
- "Total Costs" renamed to "Project Costs" in Deal Math to distinguish from Cash Required

---

## 2026-04-05 — Financing Engine, Methodology Report, and Map Enrichments

### Summary

Implemented hard money financing costs as a new calculation engine in the fix-and-flip pipeline. This was the #1 priority gap identified during a full methodology audit — max offer was systematically overstated by $5k–$25k+ per deal because loan interest and origination fees were not included. Also generated a comprehensive methodology report documenting every formula in the system, and enriched the comp map with rich tooltips and gap/sqft color-coded borders.

---

### Financing Engine

#### New module: `lib/screening/financing-engine.ts`

Pure function following the same pattern as all other engines. Loan amount is based on ARV × LTV, which breaks the circular dependency between financing costs and offer price — ARV is already computed upstream, matching how hard money lenders actually underwrite.

**Core formulas:**

```
loanAmount      = ARV × LTV
interestCost    = loanAmount × annualRate × (daysHeld / 365)
originationCost = loanAmount × pointsRate
totalFinancing  = interestCost + originationCost
```

**Reference values also computed:** monthly interest-only payment, daily interest rate.

#### Strategy profile: `DENVER_FLIP_V1` financing defaults

| Parameter | Default | Override Field |
|-----------|---------|---------------|
| Annual Rate | 11% | `financing_rate_manual` |
| Origination Points | 1% | `financing_points_manual` |
| LTV (of ARV) | 80% | `financing_ltv_manual` |
| Enabled | true | Profile-level only |

The `financingEnabled` flag was removed from `TransactionConfig` and replaced with a proper `FinancingConfig` type on the strategy profile, with its own `enabled` boolean.

#### Type system updates (`lib/screening/types.ts`)

- New `FinancingResult` type with 10 fields: `loanAmount`, `ltvPct`, `annualRate`, `pointsRate`, `daysHeld`, `interestCost`, `originationCost`, `monthlyPayment`, `dailyInterest`, `total`
- `DealMathResult` now includes `financingTotal`
- `ScreeningResultRow` now includes `financing: FinancingResult | null`

#### Deal math updated (`lib/screening/deal-math.ts`)

Total costs formula changed from:
```
totalCosts = rehabTotal + holdTotal + transactionTotal
```
to:
```
totalCosts = rehabTotal + holdTotal + transactionTotal + financingTotal
```

Max offer is now lower (more conservative) by the amount of financing costs, which is the correct behavior.

#### Bulk runner integration (`lib/screening/bulk-runner.ts`)

- Imports and calls `calculateFinancing()` between transaction and deal math
- Financing is computed only when `profile.financing.enabled` is true
- Results written to 5 new `screening_results` columns + detail JSON
- All early-return/error paths updated to include `financing: null`

#### Database migration: `20260405160000_add_financing_costs.sql`

**screening_results** — 5 new columns:
- `financing_total` (numeric 14,2)
- `financing_interest` (numeric 14,2)
- `financing_origination` (numeric 14,2)
- `financing_loan_amount` (numeric 14,2)
- `financing_detail_json` (jsonb) — stores LTV, rate, points, days, monthly payment, daily interest

**manual_analysis** — 3 new override columns:
- `financing_rate_manual` (numeric 6,4) — constrained 0–1
- `financing_points_manual` (numeric 6,4) — constrained 0–0.2
- `financing_ltv_manual` (numeric 6,4) — constrained 0–1

All three have CHECK constraints to prevent invalid values.

#### Analysis workstation integration

**Server-side (`page.tsx`):**
- Reads financing overrides from `manual_analysis`
- Calls `calculateFinancing()` with overrides (analyst override → profile default)
- Passes full `FinancingResult` to the workstation component

**Client-side (`analysis-workstation.tsx`):**
- **Deal waterfall:** "− Financing" line added between Transaction and Target Profit. Clickable — opens the financing detail modal.
- **Cost breakdown summary:** Financing line shows rate and LTV at a glance (e.g., "Financing (11.0% @ 80.0% LTV)")
- **Financing detail modal:** Partial-screen popup showing:
  - Loan Parameters: ARV basis, LTV, loan amount, annual rate, points, hold period
  - Cost Breakdown: interest cost, origination fee, total financing
  - Reference: monthly payment (I/O), daily interest
- **Analyst Overrides form:** 3 new fields — Loan Rate %, Points %, LTV % — entered as human-readable percentages (e.g., "11" for 11%), converted to decimals (0.11) for storage

**Server action (`actions.ts`):**
- New `nullablePctToDecimal()` helper — parses percentage input and divides by 100 for storage
- Saves `financing_rate_manual`, `financing_points_manual`, `financing_ltv_manual` in the `manual_analysis` upsert

#### Screening pages integration

**Batch results table (`/screening/[batchId]`):**
- New "Fin." column between Trans. and Max Offer showing `financing_total`
- Table min-width increased from 1400px to 1500px
- Empty-state colspan updated

**Result detail page (`/screening/[batchId]/[resultId]`):**
- "− Financing" line added to Deal Math waterfall
- New **Financing Costs** section after Holding Costs with two-column layout:
  - Left: Loan Amount, Interest Cost, Origination Fee, Total Financing
  - Right: LTV, Annual Rate, Points, Hold Period, Monthly Payment (I/O), Daily Interest
- Parses `financing_detail_json` for the detailed breakdown

#### Backward compatibility

Existing screening results (pre-financing) have null in all financing columns. The UI conditionally renders financing sections only when data is present, so old results display correctly without the financing line.

---

### Methodology Report

Generated a comprehensive "DataWiseRE Methodology Report" documenting every formula and calculation in the system.

**Output:** `reports/DataWiseRE_Methodology_Report.pdf` (also `reports/methodology-report.html` source)

**Structure:**
1. Executive Overview — pipeline summary, design philosophy, source file index
2. System Architecture Map — end-to-end data flow diagram, database schema summary, page/component map
3. Comparable Selection & Scoring — hard filters, 10-component weighted scoring, Haversine formula
4. ARV Calculations — dual-layer size adjustment, dampening, time adjustment, exponential decay aggregation
5. Rehab Budget — 4-factor composite multiplier system, 6 line items, property-type rates
6. Holding Costs — size-scaled days held, daily tax/insurance/HOA/utility
7. Transaction Costs — acquisition/disposition title, agent commissions
7.5. Financing Costs — hard money loan interest and origination (new section)
8. Deal Math & Max Offer — waterfall with financing included, updated example
9. Prime Candidate Qualification — multi-comp confirmation rules
10. Manual Override System — 3-tier priority waterfall
11. Complete Strategy Profile Reference — every DENVER_FLIP_V1 parameter
12. Cross-Cutting Recommendations — 12 prioritized suggestions (financing now marked resolved)

Each category includes: formulas with variable names, input/output mapping to database columns and UI components, configurable parameters, and an assessment with strengths and improvement suggestions.

---

### Comp Map Enrichments

#### Rich tooltips (`comp-map.tsx`)

- New `MapPinTooltipData` type with 10 optional fields: closePrice, closeDate, sqft, sqftDelta, sqftDeltaPct, ppsf, distance, gapPerSqft, listPrice
- Subject tooltip shows: list price, sqft, gap/sqft
- Comp tooltips show: sale price, close date, PSF, sqft with delta (e.g., "+150 (+8.3%)"), distance, gap/sqft
- Selected comps show "Click to deselect", candidates show "Click to select"
- Delta coloring: green for positive, red for negative
- Gap/sqft coloring: green ≥$60, amber ≥$30, gray below

#### Smart tooltip positioning

- Tooltips dynamically reposition toward the map center on each hover
- Calculates best direction (top/bottom/left/right) based on pin position relative to map center
- Prevents tooltips from being clipped at map edges

#### Gap-coded candidate borders

- Candidate pin border color reflects gap/sqft: green (≥$60), amber (≥$30), red (below)
- Provides instant visual deal quality assessment on the map

#### Tooltip styling (`globals.css`)

- New `.comp-map-tooltip` class: white background, subtle border, rounded corners, shadow, max-width 260px

#### Workstation map pin data (`analysis-workstation.tsx`)

- Subject pin now includes listPrice, sqft, gapPerSqft in tooltipData
- Comp pins include: closePrice, closeDate, sqft, sqftDelta, sqftDeltaPct, ppsf, distance, perCompGapPerSqft
- Per-comp gap calculated as: `(compClosePrice − subjectListPrice) / subjectSqft`

---

### Target Profit Manual Override

#### Database migration: `20260405140000_add_target_profit_manual.sql`

- Added `target_profit_manual` (numeric 14,2) to `manual_analysis` with CHECK constraint ≥ 0
- Enables per-deal override of the $40,000 default target profit

This was already wired into the workstation UI and server action in the prior commit but the migration was not yet applied.

---

### Files Changed

| File | Change |
|------|--------|
| `lib/screening/financing-engine.ts` | **New** — Pure function financing calculator |
| `lib/screening/types.ts` | Added `FinancingResult`, updated `DealMathResult` and `ScreeningResultRow` |
| `lib/screening/strategy-profiles.ts` | Added `FinancingConfig` type, financing section in `DENVER_FLIP_V1`, removed `financingEnabled` from `TransactionConfig` |
| `lib/screening/deal-math.ts` | Added `financingTotal` to inputs and `totalCosts` |
| `lib/screening/bulk-runner.ts` | Calls financing engine, stores results, updated all result construction paths |
| `app/.../analyses/[analysisId]/page.tsx` | Computes financing with overrides, passes to workstation |
| `app/.../analyses/[analysisId]/analysis-workstation.tsx` | Financing in waterfall, detail modal, override fields, rich map tooltips |
| `app/.../analysis/properties/actions.ts` | `nullablePctToDecimal()` helper, saves financing overrides |
| `app/.../screening/[batchId]/page.tsx` | Financing column in batch results table |
| `app/.../screening/[batchId]/[resultId]/page.tsx` | Financing in waterfall + full breakdown section |
| `components/properties/comp-map.tsx` | Rich tooltips, smart positioning, gap-coded borders |
| `components/properties/comparable-workspace-panel.tsx` | Layout adjustments for map integration |
| `app/globals.css` | Comp map tooltip styles |
| `supabase/migrations/20260405140000_...` | `target_profit_manual` column |
| `supabase/migrations/20260405160000_...` | Financing columns on `screening_results` and `manual_analysis` |
| `reports/methodology-report.html` | Full methodology report source |
| `reports/DataWiseRE_Methodology_Report.pdf` | Generated PDF |

---

## 2026-04-05 — Comp Map, Interactive Selection, and Queue Improvements

### Summary

Added a Leaflet-based comparable map to the analysis workstation with distance circles, interactive pin-based comp selection in the modal, and a selected comps table visible on the main workspace. Also improved the analysis queue table with MLS status/contract date columns and tighter layout.

---

### Comp Map Component

- New `components/properties/comp-map.tsx` — Leaflet map with three pin tiers: red (subject), green (selected), gray/dark-ringed (candidate)
- 0.5mi and 1mi dashed distance circles anchored to the ring edges with inline labels
- Dynamic `next/dynamic` import with SSR disabled (Leaflet requires browser APIs)
- Added `leaflet`, `react-leaflet`, and `@types/leaflet` dependencies

### Analysis Workstation — Map and Selected Comps Table

- Comp summary section redesigned as two-column layout: 400px square map (left) + selected comps table (right)
- Selected comps table shows address, close price, PSF, sqft, distance, and close date — visible on the main page so analysts can walk clients through selections without opening the modal
- Background map replaced with placeholder when comp modal is open to prevent Leaflet z-index overlap
- Comp candidates' lat/lng resolved from `real_properties` at page load (not dependent on metrics_json) so existing comps display without re-running searches

### Interactive Comp Selection in Modal

- Modal map is square (500px, centered) with `onPinClick` callback
- Clicking a candidate pin (gray) selects it; clicking a selected pin (green) deselects it
- Calls `toggleComparableCandidateSelectionAction` server action and refreshes the page
- Pin legend displayed below the modal map

### Analysis Queue Table Improvements

- New migration `20260405120000_queue_view_add_listing_fields.sql` — updated `analysis_queue_v` view to join `mls_listings`, adding `mls_status` and `listing_contract_date` columns
- Added **MLS Status** and **Contract** columns between Type and List Price
- Renamed "Status" filter to **"Prime"** — "Status" reserved for MLS status
- Tightened table padding (3px 5px) and changed cell vertical-align to middle

### Data Pipeline Fixes

- Added `latitude`/`longitude` to comp `metrics_json` in both `lib/comparables/engine.ts` and `lib/screening/bulk-runner.ts` for future comp searches

---

## 2026-04-05 — Screening → Analysis Continuity and Single-Page Analysis Workstation

### Summary

This update delivers two major milestones: (1) unified comp scoring and seamless data flow between screening and analysis, and (2) a complete single-page analysis workstation where the analyst can review comps, adjust deal math, write notes, track pipeline status, and prepare for report generation — all without leaving the page.

---

### Screening → Analysis Continuity

#### Shared comp scoring system

Extracted all scoring functions from `lib/comparables/engine.ts` into a new shared module `lib/comparables/scoring.ts`. Both the analysis comparables engine and the screening bulk runner now use the same 10-component weighted scoring system (distance, recency, size, lot size, year, beds, baths, building form, level class, condition) with purpose-driven weights.

Functions shared:
- `resolveComparableMode()` — determines scoring weights and metric flags based on purpose (flip/rental/scrape/standard) and property type family
- `buildWeightedScore()` — assembles weighted composite score from individual components
- `componentScoreFromDelta()` — linear decay scoring for tolerance-based metrics
- Match score functions for building form, level class, and condition
- `haversineMiles()`, `pctDelta()`, and utility helpers

This ensures that comps scored during screening produce identical scoring output to comps scored during interactive analysis.

#### Screening now uses tolerance-based filtering

The bulk runner's comp finder was rewritten to apply the same tolerance-based filtering as the analysis engine, but with wider thresholds to cast a broader net:

| Parameter | Screening | Analysis Default |
|-----------|-----------|-----------------|
| Max Distance | 0.75 mi | 0.5 mi |
| Sqft Tolerance | ±30% | ±20% |
| Year Tolerance | ±25 years | ±25 years |
| Bed Tolerance | ±2 | ±1 |
| Bath Tolerance | ±2 | ±1 |
| Max Candidates | 25 | 15 |

Previously, screening had no size/year/bed/bath tolerance filtering at all — it accepted any comp within distance and sorted by proximity. Now it filters and scores the same way analysis does, just wider.

#### Relational comp persistence

Screening now creates `comparable_search_runs` and `comparable_search_candidates` records for every screened property, with full `metrics_json` and `score_breakdown_json` — the same relational structure used by the analysis comparables engine. Previously, comps were only stored as a JSON blob in `screening_results.arv_detail_json`.

This means:
- Screening comps are stored in the same tables as analysis comps
- Each comp has a score, delta metrics, and full detail breakdown
- The screening detail page now shows comps with analysis-style columns (MLS#, GLA, GLA Δ%, Year, Beds, Baths, Garage, Level, PSF, Score) instead of the old ARV-only view

#### Comp carry-forward on promotion

When a screening result is promoted to a full analysis via "Promote to Analysis", the screening's `comparable_search_runs` record is linked to the new analysis by updating `analysis_id`. The analysis workstation opens with comps pre-loaded — no need to re-run the comp search from scratch.

#### Analysis Queue

Added a new "Analysis Queue" page at `/analysis/queue` — a consolidated view of the latest screening result per property, deduplicated across all screening batches. This is the analyst's daily workspace for finding the next deal to work.

Features:
- Filters: city, property type, prime candidate toggle
- Sorts: gap/sqft, offer %, spread, ARV, max offer, rehab, list price
- Shows promoted/not-promoted status with links to analysis if promoted
- Pagination support

Database: new `analysis_queue_v` view using `DISTINCT ON (real_property_id)` to show only the latest screening result per property.

Navigation: added "Queue" tab to the Analysis section in app chrome.

#### Offer % sort

Added Offer % as a sort option on the screening batch results page.

---

### Single-Page Analysis Workstation

#### Complete rewrite of the analysis overview page

The analysis overview page at `/analysis/properties/[id]/analyses/[analysisId]` was previously broken (showing property hub content). It has been completely rewritten as a single-page analysis workstation. The analyst never needs to leave this page.

#### Page layout

The workstation is organized into these sections:

1. **Header** — property address, city/state, MLS number, strategy type badge, listing status
2. **Stat chips** — list price, type, beds/baths, building sqft, year built, effective ARV, max offer
3. **Property Facts + Deal Analysis** (two-column grid)
   - Left: physical details, financial details (taxes, HOA)
   - Right: three-tier ARV display, deal math waterfall, rehab/hold summary
4. **Analyst Overrides** — inline form for manual ARV, manual rehab, days held, condition, location rating, rent estimate
5. **Comp Summary** — selected count with average metrics, "Edit Comps" button
6. **Notes** — categorized notes with add/delete and public/internal toggle
7. **Pipeline** — interest level, showing status, offer status dropdowns

#### Three-tier ARV

The deal analysis section displays three ARV values:
- **Auto ARV** — from the screening result (frozen, never changes after screening)
- **Selected ARV** — recalculated live from currently selected comps using the ARV engine with exponential decay weighting
- **Final ARV** — manual override entered by the analyst

The "effective ARV" used in deal math calculations = Final ?? Selected ?? Auto. This cascade ensures the most informed value is always used while preserving the original automated estimate for reference.

#### Deal math waterfall

Displays the full deal math calculation inline:
```
Effective ARV
− Rehab (manual override or auto-calculated)
− Holding costs (computed from property data + strategy profile)
− Transaction costs (computed from effective ARV + strategy profile)
− Target profit ($40,000 default)
────────────────
= Max Offer
```

Also shows: offer %, spread (ARV − list price), and gap/sqft.

Holding and transaction costs are computed on the fly using the screening pipeline's pure engine functions — no additional database storage needed.

#### Comp selection modal

The "Edit Comps" button opens a partial-screen modal (85% width, 90% height) with backdrop blur. The modal wraps the existing `ComparableWorkspacePanel` component with all its search controls, candidate table, pick/unpick, and selected comp summary.

The modal is intentionally not full-screen — the analyst can see the analysis page behind it, maintaining context that they are taking a brief focus break rather than navigating away.

When the modal is closed, the page refreshes and Selected ARV recalculates from the updated comp selection.

#### Categorized notes

Notes are organized by category: Location, Scope, Valuation, Property, Internal, Offer. Each note has:
- A category badge with icon
- The note text
- A public/internal toggle (public notes appear on reports; internal notes do not)
- A delete button

The "Internal" category defaults to non-public. All other categories default to public.

Server actions: `addAnalysisNoteAction`, `deleteAnalysisNoteAction`.

#### Pipeline tracking

Inline dropdowns for:
- Interest Level: Low / Medium / High / Hot
- Showing Status: Not Scheduled / Scheduled / Complete / Virtual Complete
- Offer Status: No Offer / Drafting / Submitted / Accepted / Expired / Rejected

Saves to the existing `analysis_pipeline` table via `savePipelineAction`.

---

### Database changes

#### New migration: `20260404200000_analysis_queue_view.sql`
- `analysis_queue_v` view — latest screening result per property, deduplicated

#### New migration: `20260405100000_analysis_workspace_updates.sql`
- `analysis_notes.is_public` — boolean flag for report visibility (default true)
- `analysis_pipeline` — added date columns: `showing_date`, `offer_submitted_date`, `offer_deadline_date`, `offer_accepted_date`
- `analysis_reports` table — for future report snapshot storage (id, analysis_id, report_type, title, content_json, access_token)
- RLS policies including public read access via access_token for shared report links

---

### Current state

DataWise now has a complete Screen → Analyze workflow:

1. **Screen** — batch screen properties with unified comp scoring, tolerance filtering, and deal qualification
2. **Queue** — browse all screened properties in one consolidated view, filter to Prime Candidates
3. **Promote** — one click to carry comps and deal data into a full analysis
4. **Analyze** — single-page workstation with 3-tier ARV, deal math waterfall, comp modal, categorized notes, pipeline tracking
5. **Next: Report** — report generation infrastructure is in place (table created, report page planned)

---

### Immediate next priorities

- Comp map with Leaflet (subject + comp pins with lat/lng)
- Report generation (snapshot → printable report page with DataWiseRE branding)
- Auto-screening on import
- Financing calculations (optional per deal)

## 2026-04-04 — Fix-and-Flip Screening Pipeline

### Summary

This is a major feature milestone. DataWise now has a fully automated deal-screening pipeline that can screen any subset of properties through the complete fix-and-flip underwriting workflow: comparable search → ARV calculation → rehab budget estimation → holding cost estimation → transaction cost estimation → offer price calculation → Prime Candidate qualification.

The pipeline was designed to be configurable via strategy profiles so that all business assumptions (rates, weights, thresholds) live in one place rather than scattered across code. Property type intelligence ensures that detached homes, condos, and townhomes are each evaluated with appropriate parameters.

---

### Architecture

#### Screening as a funnel, not an analysis

A critical design decision was made to keep screening separate from the existing analysis/scenario system. Screening produces lightweight `screening_results` rows — not full `analyses` records. This prevents the analyses table from being polluted with thousands of automated records that may never be reviewed. When a user identifies a deal worth pursuing, they can "promote" it to a full analysis with one click.

#### Strategy profiles

All configurable assumptions for the fix-and-flip strategy are bundled into a single `FlipStrategyProfile` type. The default profile (`DENVER_FLIP_V1`) encodes all legacy Access system values with improvements. Parameters include:

- ARV blending weights and dampening factors per property type
- Rehab base rates and multiplier tiers per property type
- Holding cost formula parameters
- Transaction cost percentages
- Prime Candidate qualification thresholds
- Comparable profile mapping per property type

This means adjusting any assumption requires editing one configuration object — not hunting through engine code.

#### Bulk runner with pre-loaded comp pool

The batch screening runner loads the entire comparable sales pool (all properties, physicals, and closed listings) into memory once, then processes each subject property without additional database queries. This makes screening thousands of properties feasible without hitting Supabase with tens of thousands of individual queries.

#### Property type intelligence

Different property types receive different treatment throughout the pipeline:

- **Detached SFR**: 40/60 building/above-grade ARV blend, full exterior/landscaping rehab, systems at $1.70/sqft
- **Condo**: 15/85 blend (above-grade dominates), no exterior/landscaping rehab, flat $1,500 systems
- **Townhome**: 35/65 blend, partial exterior ($3.30/sqft) and landscaping ($1.50/sqft), flat $3,000 systems

This intelligence is driven by keyed lookups in the strategy profile — not if/else chains in engine code.

---

### Engine modules built

All engine modules are pure functions with no database dependencies, making them independently testable.

#### ARV Engine (`lib/screening/arv-engine.ts`)

Ported and improved the legacy Access ARV calculation:

- **Per-comp size adjustment**: Two layers (building total and above-grade) with dampening factors that prevent marginal square footage from contributing linearly to value
- **Blended ARV**: Weighted combination of building-based and above-grade-based estimates, with weights varying by property type
- **Time adjustment**: Configurable annual rate applied per-comp (default -5%/year, conservative)
- **Exponential decay weighted aggregation**: Replaces the legacy linear time adjustment for the aggregate ARV. Recent comps are naturally weighted more heavily: `Sum(ARV × e^(-days/365)) / Sum(e^(-days/365))`
- **Confidence tiers**: Distance-based confidence levels (≤0.3mi = 1.0, ≤0.5 = 0.8, ≤0.6 = 0.6, ≤0.75 = 0.4)

The exponential decay aggregation is a significant improvement over the legacy system's -5%/year flat rate. It produces the same effect (recent comps matter more) without requiring a market-direction assumption.

#### Rehab Engine (`lib/screening/rehab-engine.ts`)

Ported the legacy Access rehab budget estimation with a bug fix:

- **Composite multiplier**: type × condition × price tier × age tier
- **Line items**: above-grade interior ($35/sqft), below-grade finished ($39/sqft), below-grade unfinished ($49/sqft), exterior, landscaping, systems
- **Property-type-aware rates**: Condos have no exterior/landscaping costs; townhomes have reduced rates; systems use flat amounts for condos/townhomes and per-sqft for detached
- **Bug fix**: The legacy Access SQL had the ≥$900k price multiplier (1.20) nested inside the ≥$700k check, making it unreachable. Fixed by evaluating ≥$900k before ≥$700k.

#### Holding Engine (`lib/screening/holding-engine.ts`)

- **Auto days held**: `max(67, 190 + (building_sqft - 2500) × 0.085)` — larger properties take longer
- **Daily costs**: property tax, insurance (0.55% of list price annualized), HOA, utilities ($0.08/sqft/month)
- **Total**: daily costs × days held

#### Transaction Engine (`lib/screening/transaction-engine.ts`)

- Acquisition title: 0.3% of acquisition price
- Disposition title: 0.47% of acquisition price
- Disposition commissions: 4% of ARV
- Financing: placeholder for future implementation

#### Deal Math (`lib/screening/deal-math.ts`)

- **Max offer**: ARV − rehab − hold − transaction − target profit ($40k default)
- **Spread**: ARV − list price
- **Est gap/sqft**: spread ÷ building sqft (the primary opportunity signal)
- **Offer %**: max offer ÷ list price

#### Qualification Engine (`lib/screening/qualification-engine.ts`)

Ported the legacy "Bangers" logic, renamed to **Prime Candidates**:

- Each comp is individually evaluated: distance ≤ 0.4mi, closed within 213 days (~7 months), per-comp gap ≥ $60/sqft
- A property earns Prime Candidate status when ≥ 2 comps pass all three criteria
- Returns human-readable reasons and disqualifiers for UI transparency

---

### Database schema

Added migration `20260404180000_create_screening_tables.sql`:

#### `screening_batches`

Tracks batch screening runs with:

- name, trigger type (manual/import_auto), status
- strategy profile slug
- subject filter criteria (JSON)
- counts: total subjects, screened, qualified, prime candidates
- timestamps and user linkage

#### `screening_results`

One row per screened property per batch:

- Denormalized subject snapshot for fast dashboard reads
- ARV outputs: aggregate, per-sqft, comp count, per-comp detail JSON
- Rehab outputs: total and line-item breakdown with composite multiplier
- Holding and transaction totals
- Deal math: max offer, spread, gap/sqft, offer %
- Prime Candidate flag with qualification JSON
- Promotion linkage to `analyses` table

Both tables have RLS policies, updated_at triggers, and indexes optimized for dashboard queries (batch + prime filter, gap descending, offer descending).

---

### UI pages

#### Screening Dashboard (`/analysis/screening`)

- Quick-action buttons: Screen Active Listings, Screen Coming Soon, Screen Both
- Recent batches table with status badges, subject/screened/prime counts, timestamps
- All-time summary stats

#### Batch Results (`/analysis/screening/[batchId]`)

The ranked deal dashboard:

- Batch metadata header
- Prime Candidates toggle (show all vs. prime only)
- Sort controls: by gap/sqft, spread, ARV, max offer, rehab
- Results table with: address, city, type, list price, ARV, spread, gap/sqft, comps, rehab, hold, transaction, max offer, offer %
- Color-coded Prime Candidate rows
- Click-through to deal detail

#### Deal Detail (`/analysis/screening/[batchId]/[resultId]`)

Full breakdown of one screening result:

- Subject property snapshot
- Deal math waterfall: ARV − Rehab − Hold − Transaction − Profit = Max Offer
- Rehab breakdown with multiplier detail
- Holding cost summary
- Per-comp ARV table showing: close price, distance, days, PSF, blended ARV, time adjustment, adjusted ARV, confidence, decay weight
- Qualification reasons/disqualifiers
- "Promote to Analysis" button that creates an analysis record and redirects to the analysis workspace

#### Navigation

Added "Screening" tab to the Analysis section in the app chrome navigation.

---

### Bug fix

Fixed a PostgREST URL length limit error that occurred when screening large batches (Active listings). The `.in()` filter was receiving thousands of property IDs at once, exceeding Supabase's URL length limit. Fixed by chunking ID arrays into groups of 200 for the financials and listings queries in `loadSubjects`.

---

### Current state

DataWise now has:

- Automated deal-screening pipeline
- Configurable strategy profiles with property type intelligence
- ARV calculation with exponential decay weighted aggregation
- Rehab budget estimation with composite multiplier system
- Holding and transaction cost estimation
- Max offer and deal qualification logic
- Prime Candidate identification
- Screening dashboard, batch results, and deal detail pages
- Promotion path from screening result to full analysis

---

### Why this matters

This transforms DataWise from a property data viewer into a **deal-finding engine**. Instead of manually analyzing properties one at a time, the system can screen the entire active inventory and surface the best opportunities. A skilled analyst can review a Prime Candidate and prepare an investment proposal in approximately 5 minutes.

The architecture supports future expansion to:

- Auto-screening on import (new listings screened automatically)
- Rental and listing strategy profiles
- Financing calculations
- Market trend-based time adjustments (replacing fixed rate)
- Investment proposal generation

---

### Immediate next priorities

- Test and validate screening results against legacy Access output for accuracy
- Add auto-screening hook to the import pipeline
- Add financing calculations (optional per deal)
- Build re-screening capability with updated parameters
- Begin building the investment proposal output

## 2026-04-03 - Transition to Claude - See Handoff

## 2026-04-03 - Comparable table usability improvements

- Refactored the comparable candidate list into a dedicated table component for easier iteration and extension.
- Added a subject reference row above the candidate list so the subject property can be compared in the same table layout as the comps.
- Added signed GLA difference display to make subject-vs-comp size comparisons easier to scan.
- Added beds, baths, and garage space columns to improve direct side-by-side comparison within the candidate list.
- Extended the comp detail expansion panel to surface more subject-vs-candidate comparison context.

## 2026-04-01 - Comparables workspace upgrades

- Added visible comp-search controls for Purpose, Snapshot mode, size basis, and detached level-class selection.
- Added historical market snapshot logic so comp windows and recency scoring can anchor to a prior market date instead of always using today.
- Added snapshot fallback behavior for properties without a subject listing contract date.
- Expanded comp scoring context with lot-size deltas, level-class filtering, and richer score-breakdown metadata for candidate review.
- Improved comparables data plumbing so listing contract dates, lot size, and building-form/structure data are available to the comp engine.
- Verified the updated comparables UI and backend flow are working end-to-end.

## 2026-03-26 — Scenario-Based Analysis Foundation, Dedicated Comparables Workspace, and Operational UI Improvements

### Summary

This update is a major architectural checkpoint for DataWise.

The platform has moved from a single-page property workflow toward a more durable structure built around:

- **property-first navigation**
- **analysis-scenario-based workspaces**
- a dedicated **comparables workspace**
- improved **import recovery / monitoring**
- improved **property browser filtering**
- a cleaner separation between:
  - the **comparables engine**
  - the future **valuation engine**

This lays the foundation for multiple analysts, multiple scenarios per property, and later owner-facing report delivery.

---

### Key architecture decision

A critical design decision was finalized:

- the app remains **property-based in navigation**
- the underlying work becomes **analysis-based in data ownership**

This means:

- one property can have **many analyses**
- one analyst can create **many scenarios** for the same property
- multiple analysts can eventually work on the same property independently
- detailed workspaces are tied to an **analysis scenario**, not globally to the property

This replaces the earlier idea of “one active analysis per user per property,” which was too restrictive for real-world use cases such as:

- flip vs rental vs wholesale vs listing vs new-build
- multiple scenario versions for the same strategy
- eventual owner/client review of multiple strategy outcomes

---

## Data model and schema updates

### Analysis scenario foundation

Expanded `analyses` to support scenario-based work by adding / formalizing:

- `created_by_user_id`
- `scenario_name`
- `strategy_type`
- `status`
- `is_archived`

This makes `analyses` the parent scenario record for all future workspaces.

### Comparable engine naming correction

Renamed the earlier “valuation” search layer into a true **comparables** layer.

Current structure now aligns conceptually with the product design:

- `valuation_profiles` → `comparable_profiles`
- `valuation_runs` → `comparable_search_runs`
- `valuation_run_candidates` → `comparable_search_candidates`

This reflects the correct separation:

- **comparables engine** finds and organizes candidate comps
- **valuation engine** will later consume selected comp sets and produce values

### Comparable set foundation

Added the beginning of the selected-comp-set layer:

- `comparable_sets`
- `comparable_set_members`

This is an important long-term foundation because the true output of the comparables engine is not a valuation — it is a **selected comp set**.

### Backfill / continuity work

Applied backfill steps so current data continues to function under the new foundation:

- existing analyses were associated with the current user
- existing comparable search runs were tied to `analysis_id` where possible

---

## Import pipeline and operational improvements

### Large-batch processing fix

Resolved the issue where large import batches were stopping after the first ~1,000 staged rows.

Root cause:

- row retrieval was being limited by the default max row cap per request

Resolution:

- updated batch processing to page through remaining `validated` rows in chunks
- confirmed that larger batches can now be resumed and processed fully

### Imports dashboard improvements

Enhanced `/analysis/imports` with better operational visibility:

- progress meter by batch
- processed / remaining / error row counts
- clear **Resume** behavior for partially processed batches
- better support for working through large import backlogs

### REcolorado usage dashboard

Expanded the usage dashboard to track MLS data consumption more clearly:

- rolling 30-day imported records
- remaining capacity under the 75,000-record limit
- imported today
- imported yesterday
- 7-day average
- 30-day average
- 60-day compact bar chart
- compliance guidance summary

This turns the imports page into both an intake tool and an operational dashboard.

---

## Property browser improvements

### Reliable filter option sourcing

Resolved the issue where property browser dropdowns were incomplete.

Cause:

- filter options were previously being derived from limited API result sets

Resolution:

- added database-backed filter option views:
  - `property_city_options_v`
  - `property_status_options_v`
  - `property_type_options_v`

### Property browser enhancements

Improved `/analysis/properties` with:

- city filter
- listing status filter
- property type filter
- sort by latest import date
- sort by latest listing date
- pagination
- result counts

This makes the browser much more usable as the dataset grows.

---

## Property workspace evolution

### Previous property detail page evolved into a transition state

The earlier single property detail page was useful as a proof of concept, but it was becoming overloaded with:

- imported facts
- manual analysis
- comparable search controls
- selected comp review
- future rehab / rental / listing / new-build logic

This update formalizes the move away from a single overloaded page.

### New property hub role

`/analysis/properties/[propertyId]` is now intended to become the **Property Hub**:

- subject snapshot
- latest imported facts
- analysis scenario list
- scenario creation
- navigation into scenario-specific workspaces

### New analysis overview role

`/analysis/properties/[propertyId]/analyses/[analysisId]` is now intended to become the **Analysis Overview**:

- manual analysis summary
- comparable summary
- scenario-level outputs
- links into deep workspaces

This separates:

- **property-level subject context**
  from
- **scenario-level work product**

---

## Dedicated analysis workspace route scaffold

Added / scaffolded the new scenario-based route structure:

- `/analysis/properties/[propertyId]`
- `/analysis/properties/[propertyId]/analyses/[analysisId]`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/comparables`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/rehab-budget`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/rental`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/wholesale`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/listing`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/new-build`

Placeholder pages were added for:

- rehab-budget
- rental
- wholesale
- listing
- new-build

This locks in the workspace architecture before deeper features are added.

---

## Comparables workspace improvements

### Dedicated comparables page direction

The heavy comparable review tool is now being moved toward its own dedicated scenario page:

- `/analysis/properties/[propertyId]/analyses/[analysisId]/comparables`

This is important because the comparables workflow needs far more room than the old combined property page could provide.

### Comparable workspace enhancements

The comparable review tool now supports:

- dedicated comparable search controls
- candidate ranking display
- denser comparable grid
- more usable layout for analyst review

### Selectable comp candidates

Added analyst selection behavior:

- candidate rows can be marked as selected
- selected rows are highlighted
- selected rows float to the top

This begins turning the comp engine into a real analyst-driven selection workflow.

### MLS number quick-copy tools

Added clipboard utilities to support real MLS workflow:

- **subject MLS# + all candidate MLS#s**
- **subject MLS# + selected MLS#s**

These can be copied directly into the MLS for:

- photo review
- map review
- listing detail inspection
- neighborhood context review

### Selected comp summary

Added a compact selected-comp summary section showing:

- selected count
- average distance
- average close price
- average PPSF
- selected MLS-number copy box
- compact selected-comp table

This provides a real summary of the active comp set.

---

## Linked MLS listing behavior

Improved ordering of linked MLS listings on the property page so the most relevant/current record appears first.

Current ordering prioritizes:

1. `listing_contract_date` descending
2. null contract dates first
3. `created_at` descending

This keeps “Coming Soon” / no-contract-date listings appropriately visible near the top while preserving recency.

---

## Visual context refinement

Adjusted the visual context placeholders to better reflect the intended final workspace.

Changes:

- “Primary photo area” and “Map + comparable pins” now sit side by side as square placeholders
- space is used more efficiently within the right-side workspace column

This is still placeholder UI, but it better matches the long-term analyst workflow.

---

## Strategic product decision: comparables engine vs valuation engine

A major conceptual clarification was made:

### Comparables engine

Responsible for:

- searching the database
- applying hard filters
- ranking candidate comps
- enabling analyst review and comp selection

### Valuation engine

Responsible for:

- consuming a selected comp set
- applying valuation-specific math
- producing ARV / as-is / rental / new-build value outputs later

This is an important long-term separation and prevents the platform from collapsing candidate search and valuation math into one fragile module.

---

## Strategic product decision: owner-facing reporting layer

Confirmed the long-term direction for owner/client access:

- owners will **not** use internal analysis pages directly
- a later `/reports/[reportId]` layer will present curated analysis outputs
- reports can eventually aggregate one or more analyses for one property

This fits the property-first / analysis-scenario-based architecture cleanly.

---

## Current state after this update

DataWise now has:

- authenticated internal workspace
- stable route structure
- MLS upload / staging / processing pipeline
- large-batch processing support
- import usage dashboard and resume behavior
- filtered and sortable property browser
- property hub direction
- scenario-based analysis foundation
- comparable engine naming corrected
- dedicated analysis workspace scaffold
- dedicated comparables workspace direction
- selectable comps
- selected comp summary
- MLS clipboard workflow support
- placeholder workspaces for:
  - rehab-budget
  - rental
  - wholesale
  - listing
  - new-build

---

## Why this matters

This update is a true structural milestone.

The system is now being shaped around the way real analyst workflow actually works:

- one property
- many scenarios
- many strategies
- potentially many analysts
- later, clean owner-facing report outputs

This is a much stronger foundation than trying to keep everything on one oversized property page.

---

## Immediate next priorities

- complete the move of the comparables workflow onto the dedicated comparables page
- simplify the property hub into a cleaner subject-and-scenarios page
- simplify the analysis overview into a true scenario summary page
- continue improving comparable candidate quality, filters, and transparency
- later, build the next deep workspaces:
  - rehab-budget
  - rental
  - wholesale
  - listing
  - new-build

## 2026-03-25 — Batch Processing Fixes, Import Dashboard Improvements, Property Browser Filters, and Comparable Workspace Enhancements

### Summary

This update focused on stabilizing the MLS intake pipeline at larger scale, improving operational visibility, tightening the property browsing experience, and making the comparable-sales workspace more useful for real analyst workflow.

The biggest technical fix in this cycle was correcting large-batch processing so staged import batches larger than 1,000 rows can now be processed fully instead of stopping after the first page of results.

### Major infrastructure and workflow improvements

#### Large-batch import processing fix

Identified and fixed the issue where large processed batches were stopping at exactly 1,000 rows.

Key findings:

- staged rows were being loaded through a query limited by the default row cap
- large batches were showing `processed` status while many rows still remained in `validated`
- there were no row-level processing errors, which helped isolate the problem

Resolution:

- updated `process-batch.ts` to fetch staged rows in paginated chunks
- changed processing logic so batches repeatedly pull the next page of remaining `validated` rows
- confirmed successful full processing on previously partial batches

Result:

- large staged batches can now be resumed and processed to completion
- processed row counts can now match total batch row counts for large imports
- the MLS intake pipeline is now viable at much larger volume

#### Import dashboard improvements

Enhanced `/analysis/imports` to better support monitoring and recovery during batch processing.

Improvements include:

- batch progress meter
- processed / remaining / error counts
- better visibility into partial progress
- clear `Resume` behavior for partially processed batches
- better operational control while working through import backlogs

#### Import usage / MLS limit dashboard

Expanded the usage dashboard on the imports page to continuously show REcolorado usage metrics, including:

- rolling 30-day imported record count
- remaining 30-day capacity
- imported today
- imported yesterday
- 7-day average imports per day
- 30-day average imports per day
- compact 60-day bar chart
- summary guidance for staying within the 75,000-record limit

This makes the imports page a real compliance and workflow dashboard, not just an upload tool.

### Property browser improvements

#### Filter reliability fix

Resolved the issue where filter dropdowns on `/analysis/properties` were incomplete.

Cause:

- filter options were previously being derived from limited result sets

Resolution:

- added database-backed option views for:
  - city
  - listing status
  - property type

Views added:

- `property_city_options_v`
- `property_status_options_v`
- `property_type_options_v`

Result:

- filter dropdowns now reflect the full available dataset

#### Browser filtering and sorting

Improved the property browser with:

- city filter
- listing status filter
- property type filter
- sort by latest import date
- sort by latest listing date
- clearer pagination and result counts

This makes the property browser much more useful as the dataset grows.

### Property workspace improvements

#### Latest comparable run summary

Added a compact `Latest Comp Run` summary panel to the property detail page.

It now surfaces:

- run status
- run date
- candidate count
- selected count
- max distance
- max days since close
- square footage tolerance
- run ID

This gives the analyst immediate context on whether a comp search has already been run and how it was configured.

#### Comparable workspace tightening

Refined the comparable workspace to make it more useful in a compact analyst dashboard layout.

Improvements include:

- denser comparable candidate table
- tighter search controls
- better fit within the right-side workspace column
- easier scanning of candidate rows

#### Selectable comparable candidates

Added the ability to actively select and deselect comp candidates.

Behavior:

- each comparable row now has a `Pick` / `Picked` action
- selected candidates are highlighted
- selected candidates float to the top of the candidate list

This is the first step toward a true user-curated preferred comp set.

#### MLS quick-copy tools

Added MLS-number copy tools to support analyst workflow in the MLS system.

New features:

- quick-copy box containing subject MLS# first, followed by all candidate comp MLS#s
- quick-copy box containing subject MLS# first, followed by selected comp MLS#s
- clipboard copy feedback in the UI

This supports the practical workflow of jumping back into the MLS to review:

- photos
- map position
- listing details
- neighborhood context

#### Selected comp summary

Added a compact selected-comp summary section that shows:

- selected comp count
- average selected distance
- average selected close price
- average selected PPSF
- selected MLS-number copy box
- compact selected-comp table for quick review

This gives the analyst an immediate snapshot of the actively chosen comp set.

#### Linked MLS listing ordering

Improved the ordering of linked MLS listings on the property detail page so the most relevant/newest listing appears first.

Ordering logic now prioritizes:

1. `listing_contract_date` descending
2. null contract dates first
3. `created_at` descending

This keeps `Coming Soon` or not-yet-contracted listings near the top while still preserving recency.

#### Visual Context refinement

Adjusted the visual context placeholders so:

- the primary photo area
- the map / comparable pins area

now sit side by side as square placeholders instead of stacked rectangles.

This better reflects the intended long-term workspace layout and uses the right-side panel area more efficiently.

### Current state

At this point, DataWise now has:

- a stable route and dashboard structure
- authenticated internal workspace
- MLS upload, staging, and processing pipeline
- large-batch processing support
- import usage tracking and resume controls
- filtered and sortable property browser
- compact property workspace
- manual analysis panel
- comparable search proof of concept
- selectable comp candidates
- MLS quick-copy workflow support

### Why this matters

This update significantly improved both the reliability and usability of the system.

The platform is now much closer to being a practical daily-use underwriting tool because:

- large imports can be processed correctly
- partial work can be resumed safely
- properties can be browsed more intelligently
- comp search results can be reviewed and curated more effectively
- key MLS workflow steps are supported directly in the UI

### Immediate next priorities

- continue improving comp candidate quality and filtering logic
- expand visual context with real photos and mapped comps
- begin surfacing stronger comp-run summaries and interpretation
- prepare for the next stage of valuation / final calculations

##2026-03-24 - Next.config.ts settings

## Quick Fix

Adjusted settings to allow larger upload sizes for property imports (bodySizeLimit = 5mb)

## 2026-03-24 — Property Workspace and Working MLS Intake Engine

### Summary

Completed the first full property workspace and the first end-to-end MLS intake pipeline.

DataWise can now:

- upload REcolorado CSV files
- validate them
- stage them in batch tables
- process staged batches into core tables
- display imported property records in a compact workspace
- save manual analyst inputs directly on the property page

This is the point where the platform shifts from setup/infrastructure into actual underwriting workflow.

### What was completed

#### Route and workspace structure

- Finalized the app structure into:
  - Public → `/`
  - Reports → `/reports`
  - Analysis → `/analysis/...`
  - Admin → `/admin`
- Confirmed the refactored route structure builds and loads cleanly.
- Established `/analysis/properties/[id]` as the first true property workspace.

#### Import pipeline

Built and verified the first working MLS import pipeline for REcolorado.

The system can now:

1. upload CSV files
2. validate headers and rows
3. stage raw files and rows in the database
4. process staged batches into core DataWise tables

Database tables actively used in this flow:

- `import_batches`
- `import_batch_files`
- `import_batch_rows`
- `mls_listings`
- `real_properties`
- `property_physical`
- `property_financials`

#### Import dashboard

Expanded `/analysis/imports` into a true intake dashboard with:

- upload panel
- multi-file support
- optional import notes
- recent batches table
- processing actions
- rolling import usage tracking

#### MLS usage tracking

Added always-visible import monitoring for REcolorado:

- rolling 30-day imported records
- remaining 30-day capacity
- daily counts
- short-term and 30-day averages
- compact 60-day history chart
- guidance to stay within the 75,000 record limit

#### Property workspace

Built the first compact property detail workspace at:

- `/analysis/properties/[id]`

The page now includes:

- subject property snapshot
- physical facts
- financial facts
- linked MLS listings
- reserved comp workspace
- reserved visual/photo/map workspace
- record metadata in a lower-visibility panel

#### Manual analysis

Added the first working `manual_analysis` panel directly into the property workspace.

The page now supports saving:

- analyst condition
- update year estimate
- update quality
- UAD condition / updates
- manual ARV
- manual margin
- manual rehab
- days held
- monthly rent estimate
- design rating
- location rating
- workflow statuses

This is the first time the imported data and manual analysis layers are working together in the web application.

### Successful outcomes

- Multiple REcolorado test batches have been uploaded and processed successfully.
- Core tables are being populated from imported MLS records.
- The property workspace is now functional and usable for analyst review.
- Manual analysis entries can be saved from within the property detail page.
- Import-limit monitoring is visible from the imports dashboard.

### Why this matters

This is one of the most important checkpoints in the project so far.

DataWise is now:

- a working MLS intake system
- a working canonical property database
- a working internal analysis workspace

The platform is no longer just an app shell or a staging system. It is now ready for the next phase:

### Next priority

Build the comparable sales engine:

- subject property selection
- candidate comparable search
- comparable scoring
- ARV calculation
- rehab and opportunity modeling
- batch ranking of active listings

## 2026-03-24 - Intelligent download dashboard

### Summary

Intelligent dashboard, showing individual download statistics for MLS data limit compliance

- Rolling 30 days
- Remaining capacity
- Today
- Yesterday
- 7-Day Avereage / Day
- 30-Day Average / Day
- utilization bar
- 60 day bar chart
- short policy guidance summary

## 2026-03-24 — Batch Processing into Core Tables

### Summary

Completed the first working end-to-end MLS intake pipeline for DataWise.

The application can now:

- upload REcolorado CSV files
- validate and stage them
- process staged batches into core DataWise tables
- populate canonical property and listing records for downstream analysis

This moves DataWise from a staging-only importer into a true intake engine.

### What was completed

#### Application structure

- Finalized the four-level site structure:
  - Public → `/`
  - Reports → `/reports`
  - Analysis → `/analysis/...`
  - Admin → `/admin`
- Refactored existing internal pages under the `/analysis` route group.
- Confirmed that the new route structure builds and loads cleanly.

#### Import architecture

- Expanded the import pipeline to support:
  - multi-file CSV uploads
  - batch-level notes
  - file-level tracking
  - daily import counts
  - rolling 30-day import counts
- Added executable import profile support for:
  - `recolorado_basic_50`
- Added import profile documentation under:
  - `docs/import-profiles/recolorado_basic_50_mapping.md`

#### Staging layer

Confirmed a working staging flow into:

- `import_batches`
- `import_batch_files`
- `import_batch_rows`

This allows DataWise to:

- preserve raw uploaded data
- track source files
- validate before processing
- measure MLS usage limits

#### Batch processing

Built and verified the first working batch processor.

The processor now reads staged rows and writes them into:

- `mls_listings`
- `real_properties`
- `property_physical`
- `property_financials`

The processor also:

- parses and cleans raw source values
- generates standardized DataWise fields
- matches or creates canonical property records
- updates staged row processing status
- updates batch status after completion

### Successful batch processing results

Processed staged REcolorado test batches successfully.

At this point:

- two batches have been staged and processed
- the working test set totals 82 imported records
- batches display as `processed`
- core tables are being populated from imported MLS data

This confirms that the first full MLS intake path is working:

1. upload
2. validate
3. stage
4. process
5. populate core tables

### Why this matters

This is one of the most important milestones in the project so far.

DataWise is no longer only:

- a schema design
- a manual property-entry tool
- or a staging-only uploader

It is now a working MLS intake system that transforms imported source data into:

- canonical property records
- physical fact records
- financial fact records
- listing records

### Known issue

A `NEXT_REDIRECT` message is appearing at the top of the imports page after batch processing.

Current understanding:

- processing appears to complete successfully
- the issue is likely caused by Next.js `redirect()` being surfaced through the server action instead of being handled cleanly

Planned fix:

- remove the unnecessary redirect from the processing action and keep the user on the imports page with a success state

### Current state

DataWise now has:

- working authenticated workspace
- stable route structure
- shared app shell
- manual property creation
- MLS upload/staging
- MLS batch processing into core tables

### Immediate next priorities

- clean up the `NEXT_REDIRECT` behavior on batch processing
- build `/analysis/properties/[id]` as the first property detail / analysis workspace
- inspect imported data through the app instead of SQL only
- begin tightening matching, QA, and property review workflows

## 2026-03-24 — Working MLS Upload and Staging Flow

### Summary

Completed the first working MLS intake/staging workflow for DataWise under the new route structure.

This is a major milestone because the platform can now accept REcolorado CSV uploads through the web application, validate them, stage them in the database, and return a structured batch summary to the user.

### What was completed

- Finalized the new application structure:
  - Public → `/`
  - Reports → `/reports`
  - Analysis → `/analysis/...`
  - Admin → `/admin`
- Confirmed that the refactored route structure builds and loads cleanly.
- Established `/analysis/imports` as the internal intake entry point.
- Added support for the first executable MLS import profile:
  - `recolorado_basic_50`
- Added multi-file upload support for CSV intake.
- Added optional `import_notes` at the batch level.
- Added tracking for:
  - total rows in upload
  - unique listings
  - unique properties
  - imported today
  - rolling 30-day imported rows
- Added the database structure needed for staged intake:
  - `import_batches`
  - `import_batch_files`
  - `import_batch_rows`
- Confirmed that the upload flow can:
  1. accept a CSV file
  2. validate headers and rows
  3. create an import batch
  4. create file-level records
  5. stage raw rows for later processing
  6. display a clean summary in the UI

### First successful staging test

Ran a successful test upload using `recolorado_basic_50.csv` and confirmed:

- Files: `1`
- Total Rows: `19`
- Unique Listings: `19`
- Unique Properties: `19`
- Duplicate Listings: `0`
- Row Errors: `0`
- Row Warnings: `0`

The application displayed a success message and generated a valid batch ID, confirming that the upload/staging layer is now working end-to-end.

### Why this matters

This is the first working MLS “front door” for DataWise.

The platform can now:

- receive source files through the app
- preserve raw uploaded records
- track batch metadata
- measure MLS usage against import limits
- prepare staged records for transformation into canonical property data

This moves DataWise from schema/design mode into a real intake workflow.

### Current state after this update

DataWise now has:

- authenticated internal workspace
- canonical property creation flow
- stable route structure
- shared app shell and navigation
- import batch/file/row staging system
- first working MLS upload and validation flow

### Next priority

Build the next-stage processing workflow:

- select/process a staged batch
- transform staged rows into:
  - `mls_listings`
  - `real_properties`
  - `property_physical`
  - `property_financials`
- update import statuses and return a processing summary

### Commit reference

This update corresponds to:

`Add working MLS upload and staging flow`

## 2026-03-24 - Continued framework building for database and structure for importing raw csv data from MLS

- Created property_financials
- Created mls_listings
- Created import_batches and import_batch_rows
- adopted migration-based schema workflow
- established recolorado_basic_50 as first MLS import profile

## 2026-03-23 — Foundation and First Working Web Flow

### Project goals

DataWise is being built as a property-centric real estate analytics platform.

The long-term objective is to maintain a canonical database of real property records that can be populated from multiple sources, including:

- MLS data
- public records
- manual entry

The platform is being designed so that:

- the database framework belongs to DataWise rather than to any single MLS
- manual spreadsheet imports can work immediately
- API-based MLS/public-record ingestion can be added later
- analyst judgment, workflow, and reporting can be layered on top of clean property records
- the product can evolve from a personal tool into a multi-user SaaS platform

### Major architecture decisions completed

- Confirmed that DataWise should be **property-centric**, not listing-centric.
- Established `real_properties` as the canonical table for durable property identity/location facts.
- Established `property_physical` as the table for current best-known physical facts used in analysis.
- Confirmed that MLS/public-record/manual inputs should feed a DataWise-controlled model rather than dictate the schema.
- Defined that legacy Access tables should be treated as discovery/prototype tools, not as tables to copy directly into the web app.
- Identified the need for a translation layer between raw source fields and DataWise-standardized fields.

### Database work completed

Created and migrated the following core tables into Supabase:

- `real_properties`
- `property_physical`
- `analyses`
- `manual_analysis`
- `analysis_pipeline`
- `analysis_notes`
- `analysis_showings`
- `analysis_offers`
- `analysis_links`

Additional schema work completed:

- added lot size fields to `real_properties`
- enabled Row Level Security (RLS)
- created temporary authenticated development policies
- aligned local and remote migration history

### Development environment work completed

- Created the Next.js project locally.
- Initialized Git and connected the repo to GitHub.
- Created and linked the Supabase project.
- Verified that migrations are the source of truth for schema changes.
- Implemented Supabase Auth sign-up/sign-in.
- Confirmed that authenticated sessions work in the app.

### First working application flow completed

Built and verified the first complete web flow:

1. user signs up / signs in
2. authenticated session is established
3. user opens `/properties/new`
4. user submits a manual property form
5. the app inserts into `real_properties`
6. the app inserts into `property_physical`
7. the inserted records are confirmed in Supabase

This is the first complete proof that the DataWise web architecture works in practice.

### Legacy system analysis completed

Reviewed and classified legacy Access schema:

From `Property_T`:

- canonical property identity/location fields
- physical-analysis fields
- listing/event fields
- financial fields
- display/compliance fields
- agent/office fields
- DataWise-standardized helper fields

From `Manual_Database_T`:

- manual analysis
- pipeline status
- notes
- showings
- offers
- links

This work clarified how the Access-era logic should be decomposed into normalized web tables.

### Current state

At this point, DataWise has:

- a working local Next.js app
- a hosted Supabase database and auth setup
- migration-based schema management
- authenticated database access with RLS policies
- a working manual property-creation flow
- a clear path toward listing ingestion, public-record ingestion, comparable workflows, and analyst tools

### Immediate next priorities

- Deploy the GitHub repo to Vercel
- Build `/properties` to display saved property records
- Build `/properties/[id]` detail pages
- Establish a shared layout, navigation system, and theme
- Begin building the first import/staging pipeline
- Expand the analyst workflow layer

### Long-term direction

DataWise is being built as a scalable, source-agnostic real estate analysis platform with SaaS potential, including future support for:

- MLS/API ingestion
- public-record integration
- ownership tracking
- comparable selection
- underwriting workflows
- investor/client outputs
- multi-user teams
- expansion beyond Denver

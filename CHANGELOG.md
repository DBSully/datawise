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

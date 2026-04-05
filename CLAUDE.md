## CLAUDE.MD

The purpose of this file os to provide a project overview and handoff to Claude. Additional update and progress details can be found in the CHANGELOG.md file.

# 2026-04-04 — DataWiseRE Project Handoff Summary

Checkpoint summary for continuing development with Claude.

## Executive Summary

**DataWiseRE** is being built as a **property-centric residential real estate analysis platform** with long-term SaaS potential. The project now has:

- a real web application
- a normalized property database
- a working MLS intake pipeline foundation
- scenario-based analysis foundations
- a proof-of-concept comparables workflow
- a clear architecture for scaling into multiple analysts, multiple scenarios, multiple strategies, and owner-facing reports
- **a fully automated fix-and-flip screening pipeline** (see Phase 4 below)

This work did not just build pages. It established the conceptual and structural foundation for the next stages of the product.

---

## Phase 4: Fix-and-Flip Screening Pipeline (2026-04-04)

> Full details in `CHANGELOG.md` under the 2026-04-04 entry.

### What it does

Batch-screens any subset of properties through the full fix-and-flip underwriting workflow:

**comp search → ARV → rehab budget → holding costs → transaction costs → offer price → Prime Candidate qualification**

Users select a filter (e.g. Active listings, Coming Soon) and the system screens all matching properties in one run, ranking them by opportunity and flagging **Prime Candidates** — deals with strong comp-supported ARV gaps.

### Key architecture decisions

- **Screening is a funnel, not an analysis.** Results live in `screening_batches` / `screening_results`, not `analyses`. This keeps analyses clean for human-reviewed work. A screening result can be "promoted" to a full analysis with one click.
- **Strategy profiles bundle all assumptions.** A `FlipStrategyProfile` (in `lib/screening/strategy-profiles.ts`) contains every configurable parameter: ARV weights, rehab rates, holding formulas, transaction percentages, qualification thresholds. The default is `DENVER_FLIP_V1`. To change any assumption, edit the profile — not engine code.
- **Property type intelligence.** Different property types (detached/condo/townhome) get different ARV blending weights, rehab rates, and comp profiles, driven by keyed lookups in the strategy profile.
- **Bulk runner pre-loads the comp pool.** `lib/screening/bulk-runner.ts` loads all closed sales into memory once, then processes each subject without additional DB queries. This makes screening thousands of properties feasible.
- **Exponential decay weighted ARV.** Replaces the legacy -5%/year linear adjustment. Aggregate ARV is `Sum(ARV × e^(-days/365)) / Sum(e^(-days/365))`, naturally weighting recent comps more heavily.

### Module structure

```
lib/screening/
  types.ts                — Shared types (ArvResult, RehabResult, etc.)
  strategy-profiles.ts    — FlipStrategyProfile type + DENVER_FLIP_V1 default
  arv-engine.ts           — Per-comp size-adjusted blended ARV + decay aggregation
  rehab-engine.ts         — Multiplier system (type × condition × price × age) × base rates
  holding-engine.ts       — Auto days held + daily tax/insurance/HOA/utility
  transaction-engine.ts   — Acquisition/disposition title + commissions
  deal-math.ts            — Max offer, spread, gap/sqft, offer %
  qualification-engine.ts — Prime Candidate identification
  bulk-runner.ts          — Batch orchestrator with pre-loaded comp pool
```

All engines are **pure functions** with no DB dependencies — the bulk runner is the only module that touches Supabase.

### Database tables

- `screening_batches` — One row per screening run (status, counts, filter criteria)
- `screening_results` — One row per screened property (denormalized subject snapshot, ARV, rehab, hold, transaction, deal math, qualification, promotion link)

### UI routes

- `/analysis/screening` — Dashboard with quick-action buttons and recent batches
- `/analysis/screening/[batchId]` — Ranked deal table with Prime toggle and sort controls
- `/analysis/screening/[batchId]/[resultId]` — Full deal detail with ARV comps, rehab breakdown, deal math waterfall, and "Promote to Analysis" button

### Legacy logic ported from MS Access

- ARV: per-comp size adjustments with dampening factors (0.3 building, 0.4 above-grade), 40/60 blend, time adjustment, confidence tiers
- Rehab: composite multiplier (type/condition/price/age) applied to per-sqft base rates with property-type-specific exterior/landscaping/systems
- Holding: auto days held formula, daily cost rates
- Transaction: title and commission percentages
- Prime Candidates (formerly "Bangers"): ≥2 comps within 0.4mi, 7 months, $60/sqft gap

### What's next

- Auto-screening on import (new listings screened automatically)
- Financing calculations (optional per deal)
- Market trend-based time adjustment (replacing fixed -5%/year rate)
- Rental and listing strategy profiles
- Investment proposal generation

---

## Phase 1: Basic Real Estate System Design

### 1. Project Purpose and Vision

DataWiseRE is intended to:

- ingest residential property data from multiple sources
- normalize that data into a durable, DataWise-owned schema
- support multiple types of real estate analysis on the same property
- allow analysts to review comparables, assumptions, budgets, and strategy-specific outputs
- eventually publish clean owner/client-facing reports from internal analysis work

### Core strategies / use cases

DataWiseRE is intended to support:

- fix-and-flip
- rental
- wholesale
- sale as-is / listing strategy
- new-build / scrape / infill redevelopment

### Guiding architecture principles established

- **Property-first navigation**
- **Analysis-scenario-based work**
- **Comparables engine separate from valuation engine**
- **Strong database foundation first**
- **UI/workflow built on top of normalized, source-agnostic data**
- **Internal workspaces separate from owner/client-facing reports**

### 2. Legacy System Context and Rebuild Philosophy

#### 2.1 Where the project came from

Before the web app, DataWiseRE existed as:

- Excel models
- then a more structured **MS Access + Power Query + Excel** system

The legacy system already handled:

- comparable selection logic
- ARV calculations
- rehab assumptions
- manual analyst overrides
- deal sorting/ranking

#### 2.2 Crucial early mindset shift

One of the most important strategic decisions was:

> We are **not** trying to port the Access database directly online.  
> We are rebuilding from zero with a stronger, more scalable architecture.

The old tools were treated as:

- prototypes
- learning tools
- sources of business logic insight

But **not** as the schema to copy blindly.

### 3. Major Architecture Decisions Made

#### 3.1 Property-centric, not listing-centric

The system now treats a property as:

- a durable real-world asset
- a structure attached to land
- a canonical record that can exist with or without an MLS listing

MLS listing IDs remain important, but they are treated as:

- source/event records
- not the primary identity of the system

**Resulting model**

- one canonical property record
- many source/event records attached to it over time

This supports:

- MLS imports
- public record imports
- manual entry
- future off-market properties

#### 3.2 Split between durable facts and physical facts

The schema was intentionally split into two foundational layers.

##### `real_properties`

Stores the most durable identity/location facts:

- address
- parcel/APN
- city/state/zip
- latitude/longitude
- lot size
- normalized address key
- address slug
- geocode source
- timestamps

##### `property_physical`

Stores current best-known physical/analytical facts:

- property type
- structure type
- level class
- square footage
- beds/baths
- garage spaces
- year built
- above/below-grade metrics
- related physical fields

**Why this matters**

This keeps:

- stable identity/location data
- mutable analysis-facing physical data

from being mixed together.

#### 3.3 Source-agnostic ingestion

DataWiseRE should **not be beholden to any one MLS schema**.

**Chosen approach**

1. ingest source data in source-specific/raw form
2. map source-specific fields into DataWise-standardized fields
3. populate canonical tables from those mapped values

This matters because MLS exports differ across markets and systems.

**Markets / sources discussed**

- REcolorado / Denver
- future Phoenix MLS
- future public records
- manual input
- future API-based MLS sources such as MLSGrid

**Philosophy adopted**

- the **DataWise schema belongs to DataWise**
- sources feed it
- sources do not define it

#### 3.4 Comparables engine separate from valuation engine

A major conceptual clarification was made.

##### Comparables engine

Its job is to:

- find comparable candidates
- apply hard filters
- rank candidates
- present them to the analyst
- let the analyst select a comp set

Its output is **not** a value.  
Its output is a **selected comp set**.

##### Valuation engine

Its job is to:

- consume a selected comp set
- apply valuation-specific math
- produce value outputs such as:
  - ARV
  - as-is value
  - rental acquisition value
  - later new-build / land value outputs

**Key dependency**

The valuation engine is built **on top of** the comparables engine.

This was explicitly established as:

- two separate modules
- not one blended system

#### 3.5 Property-first URLs, analysis-scenario-based work

Users still start from the property:

- `/analysis/properties`
- `/analysis/properties/[propertyId]`

Detailed work then becomes analysis-scenario-based:

- `/analysis/properties/[propertyId]/analyses/[analysisId]`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/comparables`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/rehab-budget`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/rental`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/wholesale`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/listing`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/new-build`

Originally there was discussion of “one active analysis per user per property,” but that was rejected as too restrictive.

A single analyst may need multiple scenarios on the same property, for example:

- Flip — Moderate Rehab
- Rental — Hold
- New Build — Scrape + Rebuild

So the correct model became:

> One property can have many analyses.  
> One analyst can create many scenarios for the same property.

#### 3.6 Internal workspaces vs. owner/client-facing results

A major architectural separation was established:

- internal work happens under `/analysis/...`
- owner/client-facing outputs will later live under `/reports/[reportId]`

Owners/clients should **not** see:

- raw internal pages
- analyst working notes
- full internal workspaces

The future reports layer will:

- aggregate one or more analyses
- present selected conclusions cleanly
- keep internal analyst work private

### 4. MLS / Source Strategy Work Completed

#### 4.1 Current and long-term ingestion path

**MVP approach**

- manually updated CSV imports

**Long-term approach**

- API-based ingestion such as MLSGrid
- public-records integration
- automated intake pipelines

This allows the database/application framework to be built now while keeping the path open for future automation.

#### 4.2 MLSGrid and feed strategy research

MLSGrid documentation was reviewed to understand:

- access/feed types
- usage/display rules
- media/photo limitations
- API structure
- permission implications for IDX / VOW / BO
- latitude/longitude availability differences by feed

**Important takeaways**

- feed type affects what can be shown publicly
- photo/media rights must be handled carefully
- lat/long availability varies by feed
- some desired fields may need hybrid/manual sourcing in MVP

This reinforced the need for:

- source-aware design
- hybrid ingestion in MVP
- future API flexibility

#### 4.3 Standardized import profile approach

Instead of permanently relying on Power Query–processed files, DataWiseRE should eventually ingest:

- raw/native MLS CSV exports
- then clean/map them internally

This keeps:

- the import process simpler for the user
- the transformation logic inside DataWise
- the mapping reproducible and testable

**First standardized profile**

- `recolorado_basic_50`

This became the initial live MLS import profile for REcolorado.

---

## Phase 2: Import Boundary Stabilization

### 5. First Concrete Import Blocker Identified

The first concrete implementation issue in DataWiseRE surfaced on the `app/(workspace)/analysis/imports/page.tsx` route while importing a CSV.

The runtime error shown in the browser was:

> Body exceeded 1 MB limit.

The stack trace pointed to the rendered `<ImportUploadPanel />` in `page.tsx`, and the error banner linked directly to the Next.js Server Actions body size documentation.

This established the real scope of the issue:

- the platform was **not yet failing** on CSV parsing, field mapping, analysis logic, or persistence
- it was failing at the **request ingestion boundary**, before any import logic could run

That distinction mattered because it showed the first blocker was infrastructural rather than domain-specific.

### 6. What Was Diagnosed

The import flow was identified as a Next.js App Router form submission path using Server Actions, or an equivalent Server Action-backed upload flow.

In practice, the flow looked like this:

1. a user navigates to `analysis/imports`
2. the page renders the upload interface via `<ImportUploadPanel />`
3. the selected file is submitted through a form-style request path
4. the upload arrives on the server as request body data, typically `FormData`
5. Next.js attempts to parse and accept the request before app-specific import logic runs
6. the request is rejected because it exceeds the default 1 MB Server Action body size limit
7. the CSV never reaches parsing, validation, mapping, persistence, or analysis logic

You reported that the current largest CSV import was **2,084 KB**, a little over 2 MB. That meant the file was well above the default 1 MB limit, so the observed failure was expected under the current configuration.

### 7. Root Cause

The root cause was that the CSV upload was being sent through a request path constrained by the default Next.js Server Action body size limit.

Since the body exceeded the 1 MB ceiling, the request was rejected during request/body handling before the CSV could be:

- parsed
- validated
- transformed
- saved

The most important implication for handoff purposes is this:

> No downstream ingestion logic was reached.

That means the failure was **not** caused by:

- CSV parser logic
- schema normalization
- column mapping
- deduplication
- database write logic
- analysis code

All of those remained downstream concerns for later validation.

### 8. Solution Designed

The correct fix was determined to be raising the Server Action request body limit in the project’s root Next.js configuration using `experimental.serverActions.bodySizeLimit`.

**Recommended thresholds**

- minimum workable setting: `3mb`
- preferred setting for headroom: `5mb`

**Reasoning**

- the current largest CSV is just over 2 MB
- multipart or form-based uploads have some overhead
- a limit barely above the file size would be unnecessarily fragile

**Practical root config**

```ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb",
    },
  },
};

export default nextConfig;
```

This change belongs in `next.config.ts` or `next.config.js`, not inside `page.tsx`, because `bodySizeLimit` is a framework configuration setting rather than a route-level prop or component option.

After changing it, the development server must be restarted so Next.js reloads the config.

### 9. What This Clarified About the Import Flow

This debugging step established a clean model for future import issues. From this point forward, import problems should be categorized into distinct layers:

1. transport / request acceptance
2. file parsing
3. schema validation
4. column mapping / normalization
5. persistence / database writes
6. analysis pipeline execution

Step 1 resolved the first of those layers conceptually.

### 10. Tools and Framework Components Involved

#### 10.1 Next.js App Router

The import page lives under `app/(workspace)/analysis/imports/page.tsx`, which places it in the App Router architecture.

#### 10.2 Server Actions

This issue is directly tied to Server Actions, since Next.js uses them for form submissions and applies the default request body limit there.

#### 10.3 `ImportUploadPanel`

This component was the visible UI boundary where the error surfaced. It was the likely origin point for file selection and submission behavior, even though its internal implementation was not reviewed yet.

#### 10.4 `next.config.ts` / `next.config.js`

This is the actual control point for the fix. The key configuration is:

- `experimental.serverActions.bodySizeLimit`

#### 10.5 Turbopack / local development runtime

The app was reproducing the issue locally in a Next.js `16.2.1` Turbopack dev environment, confirming the problem was not only deployment-time.

### 11. Challenges Overcome

#### 11.1 Identifying the actual failure layer

A likely misstep would have been to start debugging:

- CSV parsing logic
- column mapping logic
- UI state handling
- component code in `page.tsx`

That was avoided by recognizing from the runtime message that the failure was happening **before** any of that code could meaningfully process the file.

#### 11.2 Distinguishing between page code, framework config, and hosting limits

Three possible problem areas were separated:

- a component/page implementation issue
- a Next.js Server Action request-size issue
- a deployment/provider payload limit

The immediate problem was correctly identified as the Next.js Server Action limit, and the immediate fix was correctly identified as raising `serverActions.bodySizeLimit`.

### 12. Strategic Implications for Import Architecture

For current DataWiseRE needs, raising the Server Action body limit is the correct short-term solution.

For future larger-file workflows, the roadmap became:

#### Short term

Raise `serverActions.bodySizeLimit` so current CSVs can be uploaded.

#### Medium term

Consider moving uploads into a dedicated Route Handler for finer request handling control.

#### Long term

For much larger files, use a direct-to-storage upload model and process files from storage rather than sending large bodies through the application server.

### 13. Additional Edge Case Identified

A related but secondary configuration was also noted:

- `experimental.proxyClientMaxBodySize`

This is **not** the primary fix for the error shown here, but it becomes relevant if the app uses `proxy.ts` and the proxy reads or buffers the request body.

**Guidance**

- do not change `proxyClientMaxBodySize` unless the project actually uses `proxy.ts` in the upload path
- the first-line fix remains `serverActions.bodySizeLimit`

### 14. What Was Completed in This Phase

This phase completed the following:

- identified the first import-blocking issue on `analysis/imports`
- confirmed that the error was a framework request-size problem, not CSV business logic
- mapped the failure to the App Router / Server Action upload path
- selected the correct root-level Next.js config change
- recommended a practical body limit for current file sizes
- documented future architecture considerations for larger uploads

### 15. What Was Not Completed in This Phase

The following work was **not** completed yet:

- no review of `app/(workspace)/analysis/imports/page.tsx` source code
- no review of the `ImportUploadPanel` implementation
- no review of the actual Server Action or upload handler code
- no validation of CSV parsing, schema mapping, field normalization, or database persistence
- no end-to-end test confirming successful import after the config change

### 16. Handoff Note for the Next Engineer

Treat this phase as the ingestion-boundary stabilization step for DataWiseRE.

**Recommended immediate follow-up sequence**

1. Add `experimental.serverActions.bodySizeLimit` to the project’s root Next config.
2. Restart the dev server.
3. Re-test the import using the `2,084 KB` CSV.
4. If the file now reaches the server, inspect the next stages of the pipeline:
   - `page.tsx`
   - `ImportUploadPanel`
   - the Server Action or upload handler
   - CSV parsing
   - schema validation
   - column mapping
   - persistence / writes
5. If body-size errors persist, check whether a `proxy.ts` layer exists and whether `proxyClientMaxBodySize` is relevant.

### 17. Roadmap-Ready One-Sentence Summary

Step 1 of DataWiseRE unblocked the CSV ingestion entry point by diagnosing a Next.js Server Action request body limit error on `analysis/imports`, identifying the root cause as the default 1 MB Server Action body cap, and defining the correct root-level `next.config` fix to support current ~2 MB CSV uploads while documenting Route Handlers and direct-to-storage as the future path for larger-file import architecture.

---

## Phase 3: Buildout Progress, Schema, Workflows, and Debugging

### 18. Development Environment and Toolchain Set Up

#### 18.1 Local project setup

The web app was initialized locally and worked from:

```text
C:\Users\Dan Sullivan\code\datawise
```

**Stack used**

- Next.js
- TypeScript
- Supabase
- Vercel
- Git / GitHub

#### 18.2 Git / GitHub

The project was initialized in Git and pushed to GitHub.

After that:

- code was committed regularly
- GitHub became the source of truth for code
- migration files became part of version control
- work could move cleanly between desktop and laptop

#### 18.3 Vercel deployment

The GitHub repo was imported into Vercel and configured with:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

This created:

- a live deployment
- preview/prod deployment structure
- a hosted Next.js runtime

**Tool roles clarified**

- GitHub = stores code
- Supabase = database + auth
- Vercel = hosts the Next.js app

#### 18.4 Supabase project setup

A Supabase project was created and linked locally via the CLI.

This included:

- remote Postgres database
- auth
- row-level security
- migration-based schema workflow

#### 18.5 Auth setup

Supabase Auth was configured with:

- email/password sign-up
- sign-in page
- browser and server clients
- cookie/session refresh layer

For MVP simplicity:

- email confirmation was temporarily disabled

A full authenticated flow was confirmed:

- create user
- sign in
- access protected pages
- use browser-safe client with publishable key

### 19. Database / Schema Work Completed

One of the biggest accomplishments of this stage was the foundational schema design and implementation.

#### 19.1 Migration-based schema workflow adopted

A major process improvement was made.

Instead of using the Supabase SQL editor as the primary schema workflow, the project adopted:

1. create migration file locally
2. paste SQL into `supabase/migrations`
3. run:

```bash
npx supabase db push --dry-run
npx supabase db push
```

4. commit migration file to Git

This was a very important improvement in discipline and reproducibility.

#### 19.2 Core tables implemented

##### `real_properties`

Canonical property identity/location facts.

Includes fields such as:

- `id`
- `public_code`
- `unparsed_address`
- parsed address parts
- `city`
- `county`
- `state`
- `postal_code`
- `parcel_id`
- `latitude`
- `longitude`
- `lot_size_sqft`
- `lot_size_acres`
- `normalized_address_key`
- `address_slug`
- `geocode_source`
- timestamps

##### `property_physical`

Current best-known physical facts.

Includes fields such as:

- `real_property_id`
- `property_type`
- `property_sub_type`
- `structure_type`
- `architectural_style`
- `property_attached_yn`
- `living_area_sqft`
- `building_area_total_sqft`
- `above_grade_finished_area_sqft`
- `below_grade_total_sqft`
- `below_grade_finished_area_sqft`
- `below_grade_unfinished_area_sqft`
- `basement_yn`
- `bedrooms_total`
- `bathrooms_total`
- `garage_spaces`
- `year_built`
- `levels_raw`
- `level_class_standardized`
- main / upper / basement / lower level bed-bath fields
- timestamps

**Important additions made after field review**

- `below_grade_total_sqft`
- `upper_level_bedrooms`
- `upper_level_bathrooms`

##### `property_financials`

Added to hold property-level financial facts:

- annual property tax
- annual HOA dues
- source system
- source record ID
- timestamps

This kept durable financial facts out of listing/event rows.

##### `mls_listings`

Built to store source/event-level listing data.

Includes:

- listing ID
- source system
- listing status
- major change type
- condition source
- list/close prices
- concessions
- listing/contract/close dates
- subdivision / ownership / occupant / school / agent fields
- linkage back to `real_property_id`
- batch linkage

This is where MLS event data properly lives.

##### Import tables

A full staging and ingestion framework was built.

###### `import_batches`

One row per upload session:

- source system
- import profile
- notes
- row counts
- unique listing/property counts
- file count
- status
- summary JSON

###### `import_batch_files`

One row per uploaded file:

- original filename
- normalized filename base
- file size
- row count
- unique listing count
- content hash

###### `import_batch_rows`

One row per staged raw CSV row:

- batch/file linkage
- row number
- source record key
- raw row payload
- processing status
- validation errors
- error message

This became a very strong ingestion foundation.

##### Analysis tables

The legacy Access-era manual layer was decomposed into normalized web tables:

- `analyses`
- `manual_analysis`
- `analysis_pipeline`
- `analysis_notes`
- `analysis_showings`
- `analysis_offers`
- `analysis_links`

This was a major cleanup of the old `Manual_Database_T` concept.

##### Scenario foundation in `analyses`

`analyses` was later expanded to support scenario-based work with fields like:

- `created_by_user_id`
- `scenario_name`
- `strategy_type`
- `status`
- `is_archived`

This made `analyses` the parent scenario record.

##### Comparables engine tables

The earlier proof-of-concept comp-search tables were renamed to match the clarified architecture:

- `comparable_profiles`
- `comparable_search_runs`
- `comparable_search_candidates`

This naming correction aligned the schema with the actual product design.

##### Selected comp set foundation

A new bridge layer was added to support the future valuation engine:

- `comparable_sets`
- `comparable_set_members`

This was critical because the real output of the comparables engine is a selected comp set, not a valuation.

#### 19.3 Views implemented

##### `property_browser_v`

A browser-friendly flattened property/listing view for the properties table page.

##### `import_batch_progress_v`

A progress-tracking view for recent batches, including:

- total rows
- processed rows
- remaining validated rows
- errors
- progress percentage

##### Filter option views

Added to support correct dropdown values:

- `property_city_options_v`
- `property_status_options_v`
- `property_type_options_v`

These were added after filter dropdowns were found to be incomplete.

### 20. UI / Workflow Features Built

#### 20.1 Shared app shell

A shared application shell was built with:

- top-level nav
- main header
- two subheaders
- dense layout
- centralized styles in `globals.css`

This created a compact analyst-friendly workspace feel.

#### 20.2 Public vs. workspace layouts

The app was split into:

- public-facing layout
- authenticated workspace layout

This matched the long-term product plan.

#### 20.3 Manual property creation flow

A fully working manual property-entry flow was built.

**Flow**

1. authenticated user opens `/analysis/properties/new`
2. submits property information
3. data writes to:
   - `real_properties`
   - `property_physical`
4. rows appear in Supabase

This was the first fully working end-to-end app flow.

#### 20.4 Imports dashboard

The `/analysis/imports` page became a major operational milestone.

It now supports:

- one or many CSV uploads
- optional import notes
- upload + preview
- validation
- staging
- processing into canonical tables
- import usage dashboard
- recent batch progress
- resume behavior for partial batches

This became a real operator dashboard.

#### 20.5 Property browser

`/analysis/properties` evolved into a real browser with:

- filters
- sorting
- pagination
- links into property pages

Later it became the entry point into the new property hub / scenario structure.

#### 20.6 Property workspace (before route split)

A compact property detail workspace was built and iterated on.

It included:

- subject snapshot
- physical facts
- financial facts
- linked MLS listings
- manual analysis panel
- comparable workspace panel
- selected comp summary
- visual context placeholders
- compact metadata panel

This page proved useful, but also revealed that too much detailed work was being forced onto one page.

That directly led to the later property hub / analysis overview / dedicated comparables page architecture.

#### 20.7 Manual analysis panel

A working `ManualAnalysisPanel` was built.

It supports saving:

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

This was the first point where:

- imported facts
- analyst-entered judgment

were working together in the web app.

#### 20.8 Comparable workspace proof of concept

A working comp-search proof of concept was built.

Features included:

- run comp search button
- adjustable comp parameters
- candidate ranking
- candidate selection
- selected comp summary
- MLS number clipboard tools
- denser candidate grid

Originally this lived on the property page. Later it was recognized as deserving its own dedicated workspace page.

#### 20.9 Scenario route scaffold

A scenario-based route scaffold was designed and built.

The intended route structure became:

- `/analysis/properties/[propertyId]` → property hub
- `/analysis/properties/[propertyId]/analyses/[analysisId]` → analysis overview
- `/analysis/properties/[propertyId]/analyses/[analysisId]/comparables`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/rehab-budget`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/rental`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/wholesale`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/listing`
- `/analysis/properties/[propertyId]/analyses/[analysisId]/new-build`

Placeholder pages were scaffolded for future detailed workspaces.

### 21. Major Debugging / Troubleshooting Work Completed

A substantial amount of important engineering and debugging happened during this stage.

#### 21.1 Supabase migration history alignment

**Problem**

A table had been created directly in Supabase instead of via migration, and local migration history and the remote DB became misaligned.

**Solution**

- drop manually created table
- recreate properly through migrations
- re-sync migration history

This reinforced migration discipline.

#### 21.2 Stale `.next` / validator issues after route refactor

After route restructuring, generated `.next` validator files caused errors.

**Root cause**

- stale generated route/type files

**Solution**

- do not edit generated validator files
- delete `.next`
- restart dev/build

This solved the route/type mismatch.

#### 21.3 Missing module / wrong file placement

Several errors were caused by:

- files placed in wrong folders
- imports pointing to wrong files
- page code accidentally pasted into the wrong route file

**Example**

- imports page code accidentally replacing properties page code

**Solution**

- restore full files to correct paths
- use full file replacements rather than trying to patch stale partial code

This became a key recovery pattern.

#### 21.4 Shared state imported from a `"use server"` file

The imports page initially had a client component importing a runtime constant from a server-action file.

**Problem**

- undefined state / `useActionState` issues

**Solution**

- move shared state/type definitions into `lib/imports/import-preview-state.ts`
- keep server actions in server files
- keep constants/types in shared modules

This was an important server/client module-boundary fix.

#### 21.5 `NEXT_REDIRECT` issue

Batch processing showed `NEXT_REDIRECT` in the UI.

**Root cause**

- `redirect()` was being treated like a normal error inside `try/catch`

**Solution**

- move redirect handling outside the normal catch flow
- understand `redirect()` as special Next.js behavior, not a normal exception

The data processing had been succeeding; the redirect handling was wrong.

#### 21.6 SQL accidentally entered into PowerShell

At one point, SQL was pasted directly into PowerShell.

**Symptoms**

- shell “errors” from commands like `select`, `create`, etc.

**Cause**

- SQL was entered in the wrong place

**Fix**

- use PowerShell only for CLI commands
- use migration files or the Supabase SQL editor for SQL

#### 21.7 Supabase 1000-row processing cap on large batches

This was one of the biggest technical debugging wins in the project.

**Symptoms**

- import staging had over 52k rows
- downstream tables had only ~7.6k rows
- many batches processed exactly 1000 rows
- “processed” batches still had many rows in `validated`

**Diagnosis**

SQL checks showed:

- large batches consistently stopped at exactly 1000 rows
- no row-level processing errors
- remaining rows stayed in `validated`

This clearly pointed to the default Supabase/PostgREST row-return cap.

**Root cause**

- the batch processor was only fetching the first page of `import_batch_rows`

**Fix**

`process-batch.ts` was rewritten to:

- fetch rows in pages/chunks
- repeatedly fetch the next page of remaining validated rows
- continue until no validated rows remain

**Additional repair**

- partially processed batches were reset to `staged` and resumed

This was a critical infrastructure fix.

#### 21.8 Incomplete filter dropdowns

The property browser dropdowns initially showed incomplete values.

**Symptoms**

- only a few cities
- only one property type
- incomplete listing statuses

**Root cause**

- filter options were being derived from limited app-side query result sets

**Fix**

Move distinct option sourcing into database-backed views:

- `property_city_options_v`
- `property_status_options_v`
- `property_type_options_v`

This solved the issue correctly and permanently.

#### 21.9 Type mismatches in comparable workspace

The comparable workspace had `defaultValue` / prop errors because values from JSON were `unknown`.

**Fix**

Normalize them first using:

- `readNumberParam`
- `readBooleanParam`

This cleaned up prop typing and stabilized the component.

#### 21.10 Scenario-route typing mismatches

As the new scenario-based route structure was scaffolded, some file/type mismatches appeared, such as:

- `analysisId` prop mismatch
- `AnalysisWorkspaceNav` not lining up with consuming pages
- `ComparableWorkspacePanel` prop mismatch

**Fix**

- replace full files with aligned prop signatures
- keep route/page/component contracts consistent

This reinforced the value of full-file synchronization when architecture is changing.

### 22. Comparables vs. Valuation Structure Clarified

A very important conceptual correction happened late in the project.

#### Comparables engine

Now clearly understood as responsible for:

- subject definition
- candidate search
- filters
- ranking
- analyst review
- comp selection

**Its output**

- selected comp set

#### Valuation engine

Reserved for later:

- consumes selected comp sets
- applies valuation formulas
- produces pricing/value outputs

**Code/module direction**

##### Comparables layer

Suggested structure:

- `lib/comparables/engine.ts`
- future `candidate-search.ts`
- future `profiles.ts`
- future `scoring.ts`
- future `selection.ts`
- future `summaries.ts`

##### Valuation layer

Reserved for later:

- `lib/valuation/*`

This is one of the most important long-term design clarifications in the project.

### 23. Current State at End of Step 1

At the end of this stage, the project had achieved the following.

#### Working foundations

- local dev environment
- Git / GitHub
- Vercel deployment
- Supabase project
- auth
- app shell
- migrations workflow

#### Working schema foundation

- canonical property tables
- listing/source tables
- import staging tables
- analysis tables
- comparable engine tables
- selected-comp-set foundation

#### Working workflows

- sign up / sign in
- manual property creation
- CSV upload + validation
- staging
- batch processing into canonical tables
- batch progress / resume
- property browser
- manual analysis entry
- proof-of-concept comp search and comp selection

#### Strong architectural direction

- property hub
- analysis scenario overview
- dedicated workspace pages
- comparables separate from valuation
- future reports layer reserved for owners

### 24. What Was Not Fully Built Yet

The following areas were scaffolded or planned, but not yet fully developed:

- fully polished dedicated comparables page
- rehab budgeting engine
- rental underwriting engine
- wholesale engine
- listing strategy engine
- new-build engine
- valuation engine on top of selected comp sets
- map/photo real integrations
- owner/client-facing reports layer
- multi-analyst admin review layer
- final strategy recommendation dashboard

The work in this stage was intentionally focused on foundations first.

### 25. Recommended Immediate Next Steps After Step 1

#### 25.1 Complete the page-role separation

- finish simplifying the Property Hub
- finish making the Analysis Overview the scenario summary page
- fully move heavy comp work to the dedicated Comparables page

#### 25.2 Improve the comparables engine

Continue improving:

- candidate quality
- filtering logic
- transparency
- purpose-specific profiles
- selected comp set persistence

#### 25.3 Build the next deep workspaces

Likely order:

1. Comparables (finish first)
2. Rehab Budget
3. Rental
4. New Build
5. Wholesale
6. Listing

#### 25.4 Build valuation engine later

Once selected comp sets are stable:

- create valuation engine on top
- produce ARV / as-is / rental / new-build outputs

#### 25.5 Build owner/client reports layer later

- `/reports/[reportId]`
- curated outputs
- likely aggregate multiple analyses per property

### 26. Critical Handoff Notes

If someone else takes over this project, the most important things to understand are:

#### A. Do not merge comparables and valuation

They are intentionally separate systems.

#### B. Do not return to property-only detailed work

Detailed work belongs to analysis scenarios, not globally to a property page.

#### C. Do not use Supabase dashboard SQL as the primary schema workflow

Use migrations.

#### D. Watch for row caps / paging

Large dataset queries must be paginated or moved into DB-side views carefully.

#### E. Prefer full-file replacements when architectural changes are underway

This project repeatedly showed that partial stale edits create confusion fast.

#### F. Keep the property hub clean

Do not let it become the giant working canvas again.

#### G. Internal and external pages are different products

- internal analyst work = `/analysis/...`
- owner/client outputs = `/reports/...`

### 27. Tools Used and How They Worked Together

#### Next.js

Used for:

- app routing
- page layouts
- authenticated workspace structure
- server actions
- UI pages and forms

#### Supabase

Used for:

- Postgres database
- auth
- row-level security
- remote DB hosting
- migration deployment

#### Vercel

Used for:

- live hosting of the Next.js app
- deployment environment
- GitHub-linked deploy workflow

#### Git / GitHub

Used for:

- version control
- migration history tracking
- sync between desktop and laptop
- project checkpoints

#### PowerShell / CLI

Used for:

- local dev commands
- Git commands
- Supabase migration commands
- build/test workflow

### 28. Final Summary of Step 1

Step 1 of DataWiseRE successfully established the product foundation.

The project now has:

- a real web application
- a normalized property database
- a working MLS intake pipeline
- scenario-based analysis foundations
- a comp-search proof of concept
- a clear long-term architecture for scaling into:
  - multiple analysts
  - multiple scenarios
  - multiple strategies
  - owner-facing reports

This stage did not just “build pages.” It established the correct conceptual and structural foundation for the next phases of the product.

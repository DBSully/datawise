# DataWiseRE — Workflow Restructure Planning Prompt

> **For:** Claude Sonnet
> **From:** Dan Sullivan (project owner) + Claude Opus (handoff)
> **Date:** 2026-04-09
> **Purpose:** Help plan a comprehensive site/schema restructure aligned to the intended deal flow.

---

## Your Role

You are being asked to **help plan a restructure**, not to write code yet. The user has built a working application but is recognizing that the site structure is starting to drift from how the actual business workflow operates. Before any restructure begins, we need to align the website's information architecture with the real-world deal flow and the future product vision.

**Critical instruction:** Do not propose a restructure plan immediately. First, read the current state below carefully, then ask the user a comprehensive set of detailed questions to fully understand the workflow, the goals, and the constraints. Only after the user has answered should you (in a follow-up turn) propose a restructure plan. The user will return those answers to a separate Opus session that will produce the implementation plan.

---

## The Intended Deal Flow

The user wants the entire application to reflect this canonical flow:

```
INTAKE  →  SCREENING  →  ANALYSIS  →  ACTION
```

Each stage represents a distinct phase of work with distinct tools, distinct data states, and distinct user activity. Currently the site partially reflects this but has some legacy structure mixing the stages together.

A second major architectural concern: there will be **two audiences** for this application:
1. **Analysts** (internal) — full access to all underwriting tools, pipeline, raw data, screening, comp work
2. **Clients/Owners/Users** (external) — restricted access via a separate user-facing area, scoped to their own properties/reports/profile

These will be separated by a **password / authentication boundary** with **distinct user profiles** controlling what each user sees. The internal analyst workspace and the external client-facing area should be cleanly separated — likely as separate route trees with different layouts and different RLS policies.

---

## Current State — Site Structure

### Top-level navigation (workspace, after recent change)

```
Home  |  Intake  |  Screening  |  Deals  |  Reports  |  Admin
```

### Routes by section

**Public area** — `app/(public)/`
- `/` — Marketing homepage
- `/offerings` — Product/services page
- `/methodology` — Methodology documentation
- `/contact` — Contact page
- `/auth/sign-in` — Email/password login (Supabase Auth)

**Workspace area** — `app/(workspace)/` (auth-required, wrapped in AppChrome)

| Route | Purpose |
|---|---|
| `/home` | Dashboard — daily metrics, unreviewed primes, watch list alerts, pipeline actions, activity log |
| `/intake/imports` | CSV upload, preview, staging, batch processing |
| `/intake/manual` | Manual property entry form |
| `/screening` | Screening Queue — latest screening result per property, filters, sorting |
| `/screening/[batchId]` | Screening batch results |
| `/screening/[batchId]/[resultId]` | Single screening result detail |
| `/deals/watchlist` | Promoted deals awaiting action; inline interest level / showing / notes |
| `/deals/watchlist/[analysisId]` | **Analysis Workstation** — full underwriting UI: comps, ARV, rehab scoping, financing, holding, deal math, report generation |
| `/deals/pipeline` | Deals in showing / offer / under-contract stages |
| `/deals/closed` | Historical closed deals |
| `/reports` | Report library grouped by property |
| `/reports/[reportId]` | Single report view (also publicly accessible via access_token) |
| `/admin` | Placeholder admin overview |
| `/admin/properties` | Properties browser (full inventory) |
| `/admin/properties/new` | Manual property entry (admin path) |
| `/admin/properties/[id]` | Property edit |

**Legacy redirect routes** (still present in code, now redirect to new locations):
- `/analysis` → `/home`
- `/analysis/queue` → `/screening`
- `/analysis/screening/...` → `/screening/...`
- `/analysis/properties` → `/admin/properties`
- `/analysis/properties/[id]/analyses/[analysisId]` → `/deals/watchlist/[analysisId]`

### Where current structure does NOT cleanly match the intended flow

- **The Analysis Workstation lives under `/deals/watchlist/[analysisId]`.** The most powerful underwriting tool in the application is buried inside the "Deals" section, when conceptually "Analysis" is its own stage of the workflow. There is no top-level "Analysis" section.
- **"Deals" is an ambiguous label.** It currently contains *both* the watch list (which is really the holding pen between screening and analysis) *and* the pipeline (offers, under contract — which is really the "Action" stage).
- **There is no top-level "Action" section.** Pipeline/offers/closings live inside Deals.
- **The Reports section is currently only an internal artifact view.** It is not yet structured as a client-facing report layer.
- **There is no client/owner-facing area at all.** All workspace routes assume an analyst user. Public routes are marketing only.
- **Manual property entry exists in two places** (`/intake/manual` and `/admin/properties/new`), reflecting some duplication.
- **`/admin/properties` is the de facto property browser**, even though properties are not really "admin" content — they are core operational data.

### Auth & user model (current)

- Supabase Auth, email/password
- No `middleware.ts` — auth is enforced at the layout level (`(workspace)/layout.tsx` calls `supabase.auth.getUser()` and redirects if missing)
- **No `profiles` table.** All user identity comes from `auth.users`.
- **No role/permission system.** Every authenticated user sees everything.
- **All RLS policies are currently "dev authenticated full access"** — every authenticated user can read/write every row. This was a temporary scaffold and needs to be replaced before any external user is given access.
- `analysis_reports` has a special second RLS policy allowing **anonymous read via `access_token`** — this is the only existing public-facing data path.

---

## Current State — Database Schema

### Property layer
- `real_properties` — canonical property identity (address, parcel, geo, lot)
- `property_physical` — beds/baths/sqft/year/levels (1:1 with real_properties)
- `property_financials` — taxes, HOA (1:1 with real_properties)

### Listing/source layer
- `mls_listings` — MLS listing events (status, prices, dates, agents) tied to a real_property; unique by `(source_system, listing_id)`

### Import layer
- `import_batches` — one row per upload session (counts, status, summary)
- `import_batch_files` — one row per file in a batch
- `import_batch_rows` — one row per raw CSV row (status: pending → validated → processed)

### Screening layer
- `screening_batches` — one row per screening run (filter, status, counts, prime count)
- `screening_results` — one row per screened property; denormalized subject snapshot + ARV + rehab + holding + transaction + deal math + qualification + financing + trend + review status + promotion link to analysis

### Analysis layer
- `analyses` — parent scenario record (`scenario_name`, `strategy_type`, `status`, `is_archived`, `created_by_user_id`)
- `manual_analysis` — analyst overrides (1:1): condition, ARV manual, rehab scope, days held, financing manual, etc.
- `analysis_pipeline` — pipeline state (1:1): `interest_level`, `showing_status`, `offer_status`, dates, `lifecycle_stage` (screening|analysis|showing|offer|under_contract|closed), `disposition` (active|passed|closed), watch list note
- `analysis_notes` — notes with `note_type` and `is_public` flag
- `analysis_showings` — showing records
- `analysis_offers` — offer records
- `analysis_links` — URLs/resources
- `analysis_reports` — frozen JSON snapshots; has `access_token` for public sharing

### Comparables layer
- `comparable_profiles` — named search strategies (purpose: arv, standard, rental, land)
- `comparable_search_runs` — one execution of a comp search
- `comparable_search_candidates` — candidate comps from a run, with scoring and selection flags
- `comparable_sets` — saved named comp set
- `comparable_set_members` — comps in a saved set

### Key views
- `analysis_queue_v` — latest screening result per property + MLS + batch + trend (drives screening queue)
- `watch_list_v` — expanded deals/watchlist
- `pipeline_v` — active deals in showing/offer/under_contract
- `closed_deals_v` — passed and closed
- `dashboard_pipeline_summary_v` — funnel by stage
- `daily_activity_v` — screening + analysis completions
- `import_outcomes_v` — join import → screening → promotion
- `property_browser_v`, `mls_status_counts_v`, plus filter option views

### Functions
- `count_unscreened_properties`, `get_unscreened_property_ids` — for auto-screening
- `get_import_batch_property_ids` — link import → properties
- `get_daily_scorecard` — dashboard metrics

### Stage relationships (the funnel)

```
import_batches
   └──> screening_batches
           └──> screening_results
                   └──(promotion)──> analyses
                                       ├── manual_analysis
                                       ├── analysis_pipeline (lifecycle/disposition)
                                       ├── analysis_notes
                                       ├── analysis_offers / analysis_showings
                                       └── analysis_reports
```

### Schema gaps for the future state

- **No `profiles` table** — needed for user metadata, role assignment, and client-user identity
- **No `clients` / `owners` / `accounts` table** — needed if external users can be associated with properties or reports
- **No `user_roles` or permission system** — needed to gate analyst vs client access
- **No `report_shares` or `client_property_assignments` table** — needed if clients should see only "their" properties or reports
- **All RLS is permissive** — every policy will need to be rewritten when external users are added
- **`analysis_reports.access_token`** is the only existing public read path and is not tied to any user identity

---

## Major Open Questions (what Sonnet needs to ask)

The user wants you, Sonnet, to ask **comprehensive, detailed questions** before proposing any plan. The user is a domain expert (real estate analyst with prior MS Access tooling) and has strong opinions — your job is to extract those opinions cleanly so the eventual restructure plan is built on the user's actual mental model, not your assumptions.

Here are the question areas you should cover. You don't have to ask these verbatim — adapt them, group them, dig deeper where it matters — but make sure each area is fully addressed before you stop asking and start proposing.

### A. The four stages — what *is* each stage?

For each of Intake / Screening / Analysis / Action, ask the user to define:
1. What activities happen in this stage? What does the analyst actually *do*?
2. What is the "input" to this stage and what is the "output"? (e.g., "input is a raw CSV, output is a staged property record")
3. What triggers a property/deal to move *from* this stage to the next? Is the transition manual, automatic, or both?
4. Can a property be in multiple stages at once, or is it strictly one stage at a time?
5. Can a property move *backwards* (e.g., from Analysis back to Screening)? Under what circumstances?
6. What does the analyst need to *see* on screen during this stage? What's the primary view?
7. What auxiliary tools/views does the analyst need to be able to jump to from within the stage?

### B. Mapping current routes to the new structure

1. The current Analysis Workstation lives at `/deals/watchlist/[analysisId]`. Should it move to `/analysis/[analysisId]`? Or stay where it is and have the nav simply rename around it?
2. Should "Watch List" become part of the Analysis stage (it's where deals sit awaiting analyst attention), or part of Screening (it's the output queue of screening), or its own thing?
3. Should "Pipeline" + "Closed" become "Action"? Or is "Action" something broader that also covers offer drafting, closing checklists, post-close project tracking?
4. Where does the property browser belong? Is it cross-stage infrastructure (an admin/data view), or does it belong inside one of the stages?
5. Where does Manual Entry belong — Intake (a way to add a property) or Admin (a data management tool)?
6. Should `/home` (the dashboard) be redesigned around the four stages — e.g., one "lane" per stage showing what needs attention?

### C. The user/profile/client-facing layer

1. What does a "client" / "owner" / "external user" actually do in this system? Are they:
   - Reviewing reports the analyst has prepared for them?
   - Browsing properties the analyst has shortlisted for them?
   - Submitting their own properties for analysis?
   - Tracking deals the analyst is working on their behalf?
   - Something else?
2. Does each external user belong to one analyst, multiple analysts, or no specific analyst (organization-wide)?
3. Are there other roles besides "analyst" and "external user"? (admin, junior analyst, viewer, brokerage partner, lender, etc.)
4. Should external users have logins and persistent profiles, or is access via shareable tokenized links sufficient?
5. Should the external user area be a completely separate sub-app (e.g., `/portal/...`) with its own layout and navigation, or live alongside the analyst workspace with permission gating?
6. What data should an external user be able to see for "their" property? Full underwriting? Only the report? Only the recommendation?
7. Should external users be able to comment, request changes, approve, reject, or sign anything?
8. Are there compliance/legal concerns about what data external users see? (e.g., showing them comp properties' addresses, MLS data redistribution rules)

### D. The Analysis stage specifically

1. The current Analysis Workstation is a single dense page. Is that the right shape going forward, or should Analysis become a multi-step workflow (comps → ARV → rehab → financing → decision)?
2. Should there be multiple analysis "scenarios" per property in the navigation, or is one active analysis per property the working model?
3. Where do rental, wholesale, listing, and new-build strategies fit? Are they alternative analysis types, separate modules, or future tabs within the workstation?
4. Where does the "promote to analysis" decision happen? Inside screening? On the watch list? Both?

### E. The Action stage specifically

1. What does "action" actually contain? Offer drafting? Showing scheduling? Closing checklists? Project management after close?
2. Is "Action" the same as the current `analysis_pipeline.lifecycle_stage` values (showing | offer | under_contract | closed), or is it broader?
3. Should each action sub-stage have its own UI, or is one unified pipeline view sufficient?
4. What integrations might Action need (DocuSign, Google Calendar, email, contractor management)?

### F. Reports — internal artifact vs client deliverable

1. Are reports currently meant to be delivered to clients, or are they internal records?
2. Should the Reports section become the bridge to the client-facing area? (e.g., "publish report" makes it visible in the client portal)
3. Should there be a difference between "internal analysis snapshot" and "client-facing polished report"?
4. Who generates reports — the analyst manually, or automatically at certain stage transitions?

### G. Constraints and non-negotiables

1. Are there any current routes, URLs, or page structures that *must not change* (e.g., bookmarks, external links, integrations)?
2. Are there any database tables or schema decisions that should be considered locked in?
3. What's the user's tolerance for breaking changes during this restructure? Big bang vs. incremental?
4. Is there a timeline pressure (e.g., need to onboard a real client by a specific date)?
5. Are there other analysts who will be using this system soon, or is it still single-user?

### H. Vision check

1. Five years from now, what does DataWiseRE *do* and *who uses it*? Single-analyst tool? Multi-analyst firm tool? SaaS for many firms? Direct-to-consumer property analysis service?
2. What's the next 90 days focused on — building the client-facing layer, perfecting the analyst workflow, or something else?
3. If you had to pick *one* thing the restructure must deliver, what would it be?

---

## What to produce after the user answers

Once the user has answered these questions, produce in your reply:

1. A **revised four-stage definition** (Intake / Screening / Analysis / Action) written in the user's own terms, confirming alignment.
2. A **proposed route map** for the new structure, showing both the analyst workspace and the client-facing area.
3. A **schema delta** — what new tables/columns/policies are needed, what existing ones should move or be deprecated.
4. A **migration strategy** — what order the work should happen in, what can be done incrementally vs. what needs a coordinated cutover.
5. **Open risks and unresolved questions** — anything the user's answers didn't fully clarify.

This output will be carried back to a Claude Opus session for implementation planning, so be precise and structured rather than narrative.

---

## Style guidance

- Ask questions in batches grouped by area, not one at a time. The user is fast and prefers efficient turns.
- Don't restate the project context back to the user — assume they know it.
- When the user gives an answer that has architectural implications, briefly acknowledge the implication so they can confirm or correct.
- If an answer reveals something you didn't account for, follow up immediately rather than waiting for the next batch.
- Avoid prescribing solutions during the question phase. Stay in discovery mode until the user signals they're done answering.

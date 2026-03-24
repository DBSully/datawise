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

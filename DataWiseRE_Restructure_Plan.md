# DataWiseRE — Restructure Plan
**For:** Claude Opus (Implementation Planning)
**From:** Dan Sullivan (project owner) + Claude Sonnet (discovery)
**Date:** April 10, 2026
**Purpose:** Comprehensive restructure plan derived from full discovery session. Opus should use this document as the authoritative specification for implementation planning. Do not re-ask questions already answered here — treat this as locked-in decisions.

---

## 1. Revised Four-Stage Definition

These definitions are written in Dan's own terms, confirmed through discovery.

### INTAKE
Getting MLS data into the system. Currently a manual CSV import process; eventually will be an API call. Analysts may never interact with this screen in a mature workflow. No decision-making happens here — it is pure data ingestion and staging.

- **Input:** Raw CSV export from REcolorado MLS
- **Output:** Validated, staged property records in `real_properties`, `property_physical`, `property_financials`, `mls_listings`
- **Transition trigger:** Automatic — every property that enters the system is immediately eligible for screening
- **Key constraint:** REcolorado Content Export and License Agreement (signed 3/7/2026) governs all data. License is personal to Dan Sullivan / Office 2HOME, non-sublicensable. Multi-tenant orgs in other markets must hold their own MLS agreements.

### SCREENING
An automated "checkup" run on every property that enters the system, triggered by the MLS listing event. Screening is an opportunity identification engine, not a precision appraisal tool. Its job is to rapidly surface properties worth a closer look.

- **Input:** Staged property records + comparable database
- **Output:** Ranked list of opportunities sorted by likelihood of success, with Prime Candidate flags for properties with strong multi-comp support
- **Batch vs. single:** Primarily batch runs, but single-property screening must be supported (currently partially implemented as "Expand Comparables" — should be formalized as a first-class event)
- **Re-screening:** Properties can and should be re-screened as new comparable data becomes available. Historical screening runs do not all need to be retained, but a lightweight subset (comp count, automated ARV per run) should be kept to flag when meaningful new data appears
- **Transition trigger:** Analyst manually promotes a property to Analysis (Watch List), OR in a EUREKA moment, carries it through the full pipeline without a formal pause
- **Primary UI:** The ScreeningCompModal has organically become the canonical screening experience. The `/screening/[batchId]/[resultId]` detail page remains but is expected to evolve into a fixed (non-modal) version of the same experience
- **Fast path:** A "Full Analysis" button in the screening modal immediately promotes and opens the Analysis Workstation — no friction, no blocking

### ANALYSIS
Deep underwriting of a specific property. The analyst's primary workspace. This is where comps are curated, ARV is refined, rehab scope is set, deal math is confirmed, and the analyst decides whether to share the opportunity with partners.

- **Input:** Promoted screening result + analyst judgment
- **Output:** Completed analysis ready to share, OR a pass decision
- **Primary UI:** The Analysis Workstation — comps + map as the hero element occupying the main viewport. Deal summary cards are collapsed by default showing only final numbers; each card opens into a rich modal for detailed interaction and override. The goal is a clean, uncluttered workspace most of the time
- **Multiple scenarios:** The system should formally support multiple analysis types per property (flip is current priority). Future types: as-is, scrape (new construction comps), rental (cash flow perspective). A quick "Add Scrape Analysis" or "Add Rental Analysis" button is the right UX pattern. The existing multi-scenario foundation needs cleanup — the original approach was too broad.
- **Watch List:** The list of all properties that have been promoted from Screening. This is the START of Analysis, not the end of Screening. Status column shows what is happening with each property. Elevating a deal to Pipeline does NOT remove it from Watch List — Pipeline is a focused filtered view of the same underlying list.
- **Transition trigger:** Analyst completes analysis and clicks "Share" to send to partners, OR decides to make an offer (advancing to Action)

### ACTION
Getting a deal to closing. This is where the focus shifts from property characteristics to deal mechanics — negotiations, showings, offers, contract, close.

- **Input:** Analyzed deal the analyst has decided to pursue
- **Output:** Closed deal (or pass at any stage)
- **Pipeline:** A distinct page from Watch List, focused on deal mechanics rather than property characteristics. Stages map to the existing `analysis_pipeline.lifecycle_stage` values: `showing → offer → under_contract → closed`
- **Post-close reconciliation:** Build the schema framework now (actual sale price vs ARV, actual hold time vs projected, actual rehab vs estimate), implement the UI later. Low priority for now.
- **External integrations:** Not in scope for the near term. Future considerations: DocuSign, calendar, contractor management.

---

## 2. Proposed Route Map

### Route Tree

```
app/
├── (public)/                          # Marketing site, no auth required
│   ├── /                              # Homepage
│   ├── /offerings
│   ├── /methodology
│   ├── /contact
│   └── /auth/sign-in
│
├── (portal)/                          # Partner/investor portal, auth required (partner role)
│   ├── /portal/                       # Partner dashboard — deals shared with them
│   ├── /portal/deals/[shareToken]     # Shared analysis view (simplified, sandboxed)
│   └── /portal/profile                # Partner profile, preferences
│
├── (workspace)/                       # Analyst workspace, auth required (analyst role)
│   ├── /home                          # Dashboard — start of day view (see Section 4)
│   ├── /intake/
│   │   ├── /intake/imports            # CSV upload, preview, staging, batch processing
│   │   └── /intake/manual             # Manual property entry (consolidate with admin path)
│   ├── /screening/
│   │   ├── /screening                 # Screening queue — latest result per property
│   │   ├── /screening/[batchId]       # Batch results
│   │   └── /screening/[batchId]/[resultId]  # Detail page (non-modal version, evolving)
│   ├── /analysis/
│   │   ├── /analysis                  # Watch List — all promoted properties with status
│   │   └── /analysis/[analysisId]     # Analysis Workstation (MOVED from /deals/watchlist/[analysisId])
│   ├── /action/
│   │   ├── /action                    # Pipeline — showing/offer/under-contract/closed
│   │   └── /action/[analysisId]       # Deal action detail — offer tracking, key dates
│   ├── /reports/
│   │   ├── /reports                   # Internal report library grouped by property
│   │   └── /reports/[reportId]        # Single report view
│   └── /admin/
│       ├── /admin                     # Admin overview
│       ├── /admin/properties          # Full property browser / inventory
│       ├── /admin/properties/[id]     # Property detail / edit
│       ├── /admin/users               # User management (analyst + partner accounts)
│       └── /admin/organizations       # Org settings (logo, market, strategy profile)
│
└── (shared)/                          # Token-based public access (no login required)
    └── /share/[accessToken]           # Read-only report view (existing access_token pattern)
```

### Internal Navigation (Analyst Workspace)

```
Dashboard  |  Intake  |  Screening  |  Analysis  |  Action  |  Reports  |  Admin
```

### Partner Portal Navigation

```
My Deals  |  Profile
```

### Key Route Changes from Current State

| Current Route | New Route | Notes |
|---|---|---|
| `/deals/watchlist` | `/analysis` | Watch List becomes top-level Analysis |
| `/deals/watchlist/[analysisId]` | `/analysis/[analysisId]` | Workstation promoted to top-level |
| `/deals/pipeline` | `/action` | Pipeline becomes Action |
| `/deals/closed` | `/action?status=closed` | Filtered view of Action |
| `/admin/properties/new` | `/intake/manual` | Consolidate duplicate entry points |
| (none) | `/portal/...` | New partner portal route tree |
| (none) | `/share/[accessToken]` | Formalize existing token pattern |

### Legacy Redirects to Add

All existing legacy redirects are preserved. Add:
- `/deals/watchlist` → `/analysis`
- `/deals/watchlist/[analysisId]` → `/analysis/[analysisId]`
- `/deals/pipeline` → `/action`
- `/deals/closed` → `/action`

---

## 3. The Partner Portal — Detailed Specification

This is the #1 priority feature. Everything else is secondary.

### Share Flow (Analyst Side)

1. Analyst completes analysis in the Workstation
2. Analyst clicks "Share" — opens a sharing panel
3. Analyst selects one or more registered partners from their partner list (or broadcasts to a group)
4. System generates a unique `share_token` per partner per analysis
5. System sends notification to partner (email + in-portal notification)
6. Analyst can track sharing status in real time from the Workstation or their feedback dashboard

### Partner Experience

**Access flow:**
- Partner receives link (email or direct)
- Link opens a simplified read-only view of the analysis — no login required to view
- To interact (adjust numbers, leave feedback, take action), partner is prompted to create/log into their account
- This is the "open tokenized link → prompt to register" model (Option 2 from discovery)

**What the partner sees:**
- Property summary (address, photos, key stats)
- Comparable sales — all comps including unselected ones; gross sale price only (NOT analyst's internal per-comp ARV estimates)
- Final ARV (analyst's concluded value, shown as the starting point)
- Rehab budget (single number, adjustable)
- Deal math output (max offer, spread, projected profit)
- Map with comps

**What the partner can adjust (in their private sandbox):**
- Add or remove comps from their version
- Adjust final ARV (their number, does not affect analyst's)
- Adjust rehab budget
- Adjust project timeline (days held)
- These adjustments recalculate deal math in real time for the partner

**Partner action buttons:**
- "I'm Interested — Let's Pursue" → logs intent, triggers analyst notification
- "Schedule a Showing" → logs intent, triggers analyst notification
- "Request a Call / Discussion" → logs intent, triggers analyst notification
- "Pass" → prompts for reason (location / condition / price / style / other + free text notes)
- All actions log to the system and appear in analyst's feedback dashboard

**What partners cannot see:**
- Each other's feedback (default; future feature for teams/groups)
- Analyst's internal per-comp ARV calculations
- Other analyses not shared with them

### Feedback Dashboard (Analyst Side)

Real-time dashboard showing for each shared analysis:
- Who received the share link
- Who has viewed it (timestamp of first view)
- Time spent viewing
- Whether they interacted (adjustments made Y/N)
- Their adjusted ARV, rehab, and days — displayed alongside analyst's numbers
- Their action button response (interested / pass / showing request / etc.)
- Their pass reason and notes
- Whether they forwarded the link (second-degree sharing)
- Second-degree viewer activity (view-only analytics — time on page, etc.)

### Second-Degree Sharing

Partners can share the analysis further with their own investors. The downstream link is view-only and does not require a login. The analyst gets basic analytics on downstream views (view count, time on page) but downstream viewers are not prompted to create accounts unless they take action.

---

## 4. Dashboard — Start of Day View

The `/home` dashboard should orient the analyst to what needs attention right now. Proposed lanes:

- **New Prime Candidates** — unreviewed properties flagged since last login
- **Watch List Updates** — properties with status changes (price drops, new comps, re-screening flags)
- **Partner Feedback** — new responses received since last login (who responded, on which deal, what action)
- **Pipeline** — deals with upcoming deadlines or pending next steps
- **Activity Log** — recent system events

---

## 4. Schema Delta

### New Tables Required

```sql
-- User profiles and roles
profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id),
  organization_id uuid REFERENCES organizations(id),
  role text CHECK (role IN ('analyst', 'partner', 'admin')),
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz DEFAULT now()
)

-- Organizations (for multi-tenancy)
organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  market text,                          -- e.g. 'denver', 'phoenix'
  logo_url text,
  strategy_profile_slug text,           -- default strategy profile for this org
  mls_agreement_confirmed boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
)

-- Analysis shares (one row per partner per analysis)
analysis_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id),
  organization_id uuid REFERENCES organizations(id),   -- analyst's org
  shared_by uuid REFERENCES profiles(id),              -- analyst who shared
  shared_with uuid REFERENCES profiles(id),            -- partner (null until registered)
  share_token text UNIQUE NOT NULL,                    -- tokenized access key
  partner_email text,                                  -- email used to send share
  sent_at timestamptz DEFAULT now(),
  first_viewed_at timestamptz,
  view_count integer DEFAULT 0,
  total_time_seconds integer DEFAULT 0,
  is_active boolean DEFAULT true
)

-- Partner's sandboxed version of the analysis
partner_analysis_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid REFERENCES analysis_shares(id),
  partner_id uuid REFERENCES profiles(id),
  arv_override numeric,
  rehab_override numeric,
  days_held_override integer,
  selected_comp_ids uuid[],            -- partner's curated comp set
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
)

-- Partner feedback and actions
partner_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  share_id uuid REFERENCES analysis_shares(id),
  partner_id uuid REFERENCES profiles(id),
  action_type text CHECK (action_type IN ('interested', 'pass', 'showing_request', 'discussion_request')),
  pass_reason text CHECK (pass_reason IN ('location', 'condition', 'price', 'style', 'other')),
  notes text,
  submitted_at timestamptz DEFAULT now()
)

-- Second-degree share tracking
share_forwards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_share_id uuid REFERENCES analysis_shares(id),
  forward_token text UNIQUE NOT NULL,
  forwarded_by uuid REFERENCES profiles(id),
  view_count integer DEFAULT 0,
  total_time_seconds integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
)

-- Post-close reconciliation framework (schema now, UI later)
deal_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid REFERENCES analyses(id),
  actual_purchase_price numeric,
  actual_rehab_cost numeric,
  actual_days_held integer,
  actual_sale_price numeric,
  actual_profit numeric,
  closed_at date,
  notes text,
  created_at timestamptz DEFAULT now()
)

-- Lightweight screening history (subset only)
screening_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  real_property_id uuid REFERENCES real_properties(id),
  screening_result_id uuid REFERENCES screening_results(id),
  screened_at timestamptz DEFAULT now(),
  comp_count integer,
  arv_aggregate numeric,
  is_prime_candidate boolean,
  organization_id uuid REFERENCES organizations(id)
)
```

### Columns to Add to Existing Tables

```sql
-- Add org scoping to all core tables (for multi-tenancy)
ALTER TABLE real_properties ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE screening_batches ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE screening_results ADD COLUMN organization_id uuid REFERENCES organizations(id);
ALTER TABLE analyses ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Add share tracking to analyses
ALTER TABLE analyses ADD COLUMN share_count integer DEFAULT 0;
ALTER TABLE analyses ADD COLUMN last_shared_at timestamptz;

-- Add screening history flag
ALTER TABLE screening_results ADD COLUMN superseded_by uuid REFERENCES screening_results(id);
```

### Tables to Deprecate / Consolidate

- `/admin/properties/new` form → fold into `/intake/manual` (duplicate entry point)
- Existing `analysis_reports.access_token` pattern → fold into `analysis_shares.share_token` scheme (keep backward compatible during transition)

### RLS Policy Strategy

Current state: all policies are "dev authenticated full access." This must be replaced before any external user accesses the system.

**Policy model:**

```
analysts → full access to their organization's data only
partners → read access to analysis_shares where shared_with = their id OR share_token matches
           write access to partner_analysis_versions and partner_feedback for their shares only
admins → full access to all data within their organization
service_role → bypasses RLS (used for screening engine, bulk operations)
anon → read access to analysis_shares via share_token only (view-only, no write)
```

All tables get `organization_id` column. Base RLS policy on every table:
```sql
USING (organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid()))
```

---

## 5. Migration Strategy

### Phase 0 — Git Checkpoint (Before Any Work)
Create a tagged release of the current working state. This is the rollback point.
```
git tag v0-pre-restructure
git push origin v0-pre-restructure
```

### Phase 1 — Foundation (Week 1 goal: partner portal MVP)
These must happen in order. Each step is independently deployable.

**Step 1: Auth & Profiles**
- Create `organizations` table with a single seed row (Dan's org)
- Create `profiles` table
- Add `middleware.ts` for proper auth enforcement (replace layout-level auth checks)
- Add role field: analyst / partner / admin
- Wire existing auth.users to profiles on sign-in

**Step 2: RLS Scaffolding**
- Add `organization_id` to all core tables
- Backfill Dan's org ID on all existing rows
- Write new RLS policies (analyst full access to own org, replace permissive dev policies)
- Test: existing analyst workflow must be fully functional

**Step 3: Route Restructure**
- Create `/analysis/` route tree
- Move Analysis Workstation to `/analysis/[analysisId]`
- Create `/action/` route tree
- Add all legacy redirects
- Update internal nav: Dashboard | Intake | Screening | Analysis | Action | Reports | Admin

**Step 4: Partner Portal MVP**
- Create `analysis_shares` table
- Create `partner_analysis_versions` table
- Create `partner_feedback` table
- Build sharing panel in Analysis Workstation (select partner → generate token → send)
- Build `/portal/deals/[shareToken]` — simplified analysis view (view-only, no login)
- Add "Create account to interact" prompt gate
- Build partner interaction layer (ARV adjust, rehab adjust, days adjust, action buttons)
- Build feedback dashboard in Workstation (who viewed, time, adjustments, action taken)
- Build `/portal/` partner dashboard (list of deals shared with them)

**Definition of done for Phase 1:** Analyst completes analysis → shares with partner → partner opens link without login → creates account → adjusts numbers → submits feedback → analyst sees it in real time.

### Phase 2 — Polish & Stabilize (Weeks 2-4)
- Second-degree share tracking (`share_forwards` table)
- Dashboard (`/home`) redesign with the four-lane layout
- ScreeningCompModal formalization (single-property screening as a named event)
- Screening history lightweight table
- Watch List / Analysis page polish (status column, filters)
- Action / Pipeline page (deal mechanics focus)
- Re-screening trigger and new-data flagging

### Phase 3 — Multi-Tenancy Foundation (Month 2)
- Organization registration flow (admin-provisioned, not self-serve, for now)
- Per-org strategy profile configuration
- Per-org logo/branding
- Analyst invitation flow (analyst invites partners to register)
- Full RLS audit across all tables

### Phase 4 — Scale & Reconciliation (Month 3)
- Post-close reconciliation UI (`deal_actuals`)
- Multi-analysis type UI (as-is, scrape, rental buttons)
- ROI and annualized return metrics in deal math
- Dashboard analytics (screening conversion rates, partner engagement metrics)
- Construction cost index tie-in for rehab rates

---

## 6. Open Risks and Unresolved Questions

### Resolved by Discovery
- ✅ Route structure confirmed
- ✅ Partner portal is #1 priority
- ✅ Partner sandbox model confirmed (does not affect analyst's numbers)
- ✅ Open link → account prompt model confirmed
- ✅ Multi-tenancy: Option A (shared app, org-level RLS silos) confirmed
- ✅ Each org holds their own MLS agreement — DataWiseRE is software provider only
- ✅ REcolorado AI clause reviewed — internal AI use is permitted; MLS data must not be sent to non-compliant AI systems

### Still Open / Needs Decision Before Implementation

**1. Partner invitation flow**
How does a partner get their account created? Options:
- Analyst enters partner email in sharing panel → system sends invite link → partner self-registers
- Admin manually creates partner accounts
- Partner self-registers on public site and analyst "approves" them

Recommendation: Email invite from sharing panel is the smoothest UX and should be the MVP path.

**2. Partner email delivery**
What email service sends the share notification and invite? Supabase has built-in email for auth; for transactional share emails, a provider like Resend or Postmark needs to be configured.

**3. View time tracking**
Measuring "time on page" for the feedback dashboard requires a client-side heartbeat (ping every N seconds while tab is active). This is straightforward to implement but needs a server endpoint and decision on granularity.

**4. Analysis Workstation card layout**
The collapsed-card-with-modal design needs a UX design pass before implementation. The current dense layout needs to be mapped to the new card structure explicitly — which cards exist, what they show collapsed, what they show expanded.

**5. ScreeningCompModal vs. detail page**
The modal is the primary experience but lives inside the screening batch flow. Formalizing single-property screening as a standalone event (not just "expand comparables") needs a trigger point — where does the analyst initiate a single-property screen outside of a batch?

**6. Notification system**
When a partner takes an action (submits feedback, requests showing), the analyst needs to be notified. For MVP, this can be an in-app notification (red badge on feedback dashboard). Email notification is a Phase 2 feature. Supabase Realtime can power the in-app notification without additional infrastructure.

---

## 7. Architecture Strengths to Preserve

From the methodology report — these are explicitly worth protecting in the restructure:

- Pure function calculation engines with no DB dependencies
- Single strategy profile as source of truth for all parameters
- Screening separate from analysis
- 3-tier override system (auto → computed → manual)
- Denormalized screening results for fast dashboard queries
- Comparables engine separate from valuation engine

None of these are affected by the route restructure. The schema additions are additive — no existing engine inputs or outputs change.

---

## 8. What Opus Should Produce

Using this document, produce a detailed implementation plan for **Phase 1 only**, in this format:

1. **Ordered task list** — every discrete coding task, in the order it must be done, with file paths and a one-line description of the change
2. **Schema migrations** — exact SQL for each new table and column addition, with RLS policies
3. **Component tree** — new components needed for the partner portal, with props interfaces
4. **Data flow diagrams** — for the share → view → interact → feedback loop
5. **Risk flags** — anything in the Phase 1 scope that could break the existing analyst workflow

Do not plan Phase 2+ yet. The user will return after Phase 1 is complete.

---

*DataWiseRE Restructure Plan | Sonnet Discovery Session | April 10, 2026*
*Strategy Profile: DENVER_FLIP_V1 | MLS: REcolorado | License: Dan Sullivan #005794*

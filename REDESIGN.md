# DataWise — Funnel Redesign Planning Document
*Created: April 2026 | Status: Approved for implementation*

---

## Background

DataWise was built feature-by-feature over several months. The individual components (screening engine, ARV calculator, comp selection, deal math, workstation, reports) are sophisticated and largely correct. What is broken is the **flow between them** — the navigation, information architecture, and the moments where a human makes a decision.

This document defines the complete redesign of that flow. It should be read alongside `CHANGELOG.md`, which contains the full history of what was built and why.

---

## The Core Problem

The word "Analysis" is overloaded. It currently describes both a section of the site *and* an act of human judgment. As a result, raw computer-screened data and carefully curated analyst deals live in the same space with no meaningful separation. The user cannot tell what has been reviewed by a human and what has not.

The fix is a clean architectural separation between two fundamentally different types of work.

---

## The Mental Model

### Two sides. Two types of work.

| | Screener Side | Analyst Side |
|---|---|---|
| **Who** | Automated system (reviewed quickly) | Senior analyst |
| **Data** | Full dataset — thousands of properties | Curated deals — dozens of properties |
| **Decision** | Does this have potential? | How do we act on this? |
| **Time per property** | Seconds | Minutes to hours |
| **Output** | Promote or Pass | Offer, Report, Close |

**Rule: Nothing appears on the Analyst side unless a human explicitly put it there.**

This is the single most important constraint in the redesign. Every page under the Deals section must contain only human-promoted properties.

---

## New Navigation Structure

### Current (broken)
```
Reports | Analysis | Admin
         └── Dashboard
         └── Properties
         └── Manual Entry
         └── Screening
         └── Queue
         └── Imports
         └── Analyses
```

### Proposed
```
Home | Intake | Deals | Reports | Admin
```

### Top-level nav items

**Home** — The daily dashboard. The single screen that orients the user each morning.

**Intake** — The Screener side. Everything the computer touches before a human reviews it.
```
Intake
└── Imports        (upload CSVs, view batches, auto-triggers screening)
└── Screening      (review auto-screened results, promote or pass)
```

**Deals** — The Analyst side. Everything a human has deliberately promoted.
```
Deals
└── Watch List     (promoted deals being actively evaluated)
└── Pipeline       (deals with showings, offers, contracts in progress)
└── Closed         (completed deals — won and lost)
```

**Reports** — Report library and generation.
```
Reports
└── Deal Memos      (internal — analyst working document, data-rich)
└── Partner Reports (external — polished PDF for partners/lenders)
```

**Admin** — System configuration, manual entry, user management.

---

## Proposed URL Structure

```
/                                    → Home dashboard
/intake/imports                      → Import batches list
/intake/imports/[batchId]            → Single batch + its screening results
/intake/screening                    → All screening results, consolidated
/intake/screening/[resultId]         → Single screening result detail

/deals                               → Redirect to /deals/watchlist
/deals/watchlist                     → Watch List (all promoted deals)
/deals/watchlist/[analysisId]        → Full analysis workstation
/deals/pipeline                      → Pipeline (offer stage and beyond)
/deals/closed                        → Closed deals (won + lost)

/reports                             → Report library
/reports/[reportId]                  → Report viewer

/admin                               → Admin tools
```

Old URLs (`/analysis/...`) should redirect to their new equivalents to avoid broken links.

---

## Stage-by-Stage Flow

### Stage 0 — Import
**Location:** `Intake > Imports`

**Behavior:**
- User uploads one or more CSV files. Batch is created.
- Auto-screening fires immediately after import completes. This should not require a manual button press — Import and Screen are one seamless pipeline step.
- The import batch page shows: listings imported, screened, prime candidates found.
- Primary CTA after batch completes: **"Review [N] Prime Candidates →"** which navigates to the Screening view filtered to that batch's unreviewed prime results.

**Key change from current:** Remove the manual "Screen Imported Listings" button as a required step. Screening should be automatic on import.

---

### Stage 1 — Screening
**Location:** `Intake > Screening`

#### Two views within Screening:

**A) Batch view** (accessible from Imports)
- Shows screening results for a single import batch.
- Default filter: Prime candidates only, unreviewed only.
- Toggle to show all results or show previously reviewed.

**B) Consolidated Screening Queue** (the current `/analysis/queue`, renamed and moved)
- Shows all unreviewed prime candidates across all batches.
- This is the primary daily working view for triaging new opportunities.
- Sorted by gap/sqft descending by default.
- Filters: city, property type, urgency assigned, date range.

**Important:** The Screening Queue is not an Analysis Queue. Nothing here has been touched by a human. Rename all references accordingly.

#### The Screening Map Popup — Critical Redesign

This is the most important UX change in the entire redesign.

**Current behavior:** Map popup → "Begin Analysis" → goes straight to the analysis workstation.

**Problem:** This skips the deliberate human promotion step and pollutes the analysis section with unreviewed deals.

**New behavior:**

```
User clicks "Map" on a screening result row
→ Map popup opens, showing:
    - Comp map (existing — keep as-is)
    - Deal math summary: ARV, Max Offer, Gap/sqft, Offer%
    - Market trend indicator
    - Comp quality summary (count, avg distance, avg score)

Two primary action buttons at the bottom of the popup:

[✓ Add to Watch List]          [✗ Pass on This Property]

--- If "Add to Watch List" clicked: ---
Popup expands to show a quick form:
  Urgency (required, one of):
    🔴 Hot   — act immediately, time-sensitive
    🟡 Warm  — strong candidate, review soon
    🟢 Watch — interesting, monitor for now
  Note (optional free text, e.g. "great comps, check basement finish")

Two confirm buttons:
  [Save to Watch List]         [Save + Open Analysis →]

"Save to Watch List" → saves, marks screening result as reviewed,
                        returns user to screening queue (triage mode)

"Save + Open Analysis →" → saves, marks as reviewed,
                            immediately opens the full workstation
                            (for obvious deals — skip the queue)

--- If "Pass on This Property" clicked: ---
Popup expands to show a reason selector (required):
  - Comps too weak
  - Rehab too heavy
  - Price too high / offer% too low
  - Location concern
  - Already analyzed / duplicate
  - Other (free text)

[Confirm Pass]
→ Tags screening result with rejection reason + timestamp
→ Marks as reviewed
→ Removes from default Screening Queue view
→ Returns user to queue
```

**A "Show Reviewed" toggle on the Screening Queue allows recovery of passed properties if needed.**

Passed properties are never deleted — they remain in the database with their rejection reason, which provides useful signal over time (e.g., consistently passing on "rehab too heavy" properties).

---

### Stage 2 — Watch List
**Location:** `Deals > Watch List`

**What it is:** The analyst's curated list of deals worth pursuing. Every property here was manually promoted from Screening. This is the primary working view during deal evaluation.

**What it shows (table columns):**
- Urgency indicator (🔴 / 🟡 / 🟢)
- Address, city, type
- List price, ARV, Max Offer, Gap/sqft
- Comp quality (count + avg score)
- Days on Watch List
- Last action / note
- Current status (No contact / Agent contacted / Showing scheduled / Showing complete)
- Quick actions: Open Analysis, Move to Pipeline, Pass

**Default sort:** Urgency (Hot first), then Gap/sqft descending.

**Actions available directly from Watch List (without opening workstation):**
- Update status (contact made, showing scheduled, etc.)
- Change urgency level
- Add a quick note
- Pass (with reason) — archives the deal, removes from Watch List
- Move to Pipeline — advances lifecycle stage
- Open Full Analysis → goes to the workstation

**Key principle:** An analyst should be able to manage 30+ Watch List properties from this view without ever opening the workstation for routine status updates.

---

### Stage 3 — Full Analysis Workstation
**Location:** `Deals > Watch List > [Property]`

The workstation itself is well-built and requires minimal changes. Key adjustments:

1. **Entry point is always from Watch List**, not from a screening batch. The property arrives pre-loaded with its screening result, comps, and deal math.

2. **Urgency indicator** is visible in the workstation header (can be changed here too).

3. **"Move to Pipeline" button** is prominent in the workstation header. Clicking it advances lifecycle stage and the property appears in the Pipeline view.

4. **Report generation CTA** is clearly the terminal action of the analysis workflow:
   - "Generate Deal Memo" → internal report
   - "Generate Partner Report" → external report

5. **ARV Comparables and As-Is Comparables** tiles remain as built (dual comp selection).

---

### Stage 4 — Pipeline
**Location:** `Deals > Pipeline`

**What it is:** Deals where active deal-making is happening. Showing is complete. Offer is being drafted, submitted, or has received a response. Under contract.

**View:** Master list with a visible stage column, sortable and filterable.

**Stages:**
```
Offer Drafting
→ Offer Submitted    → Accepted → Under Contract → Closed Won
                     → Rejected / Expired         → Closed Lost (with reason)
```

**Each row shows:** Address, offer amount, offer deadline, days since last update, current stage, next required action.

**Deals needing action** (surfaced on Home dashboard) = any Pipeline deal with:
- An offer submitted more than 3 days ago with no response logged
- An offer deadline within 24 hours
- A closing date within 7 days

---

### Stage 5 — Closed
**Location:** `Deals > Closed`

Tracks both outcomes:
- **Closed Won** — successful acquisition, with purchase price, close date, actual rehab cost (when known)
- **Closed Lost** — passed at some stage, with reason

This view feeds future analytics: average gap/sqft on winning deals, most common rejection reasons, batch-to-close conversion rates.

---

### Stage 6 — Reports
**Location:** `Reports`

**Two report types:**

**Deal Memo (internal):**
- Triggered from workstation when analysis is complete
- Data-rich: full deal math waterfall, comp table with numbered map, rehab breakdown, market trend, notes
- Used for internal review and partner alignment before making an offer
- Shareable via private link

**Partner Report (external):**
- Triggered from workstation
- Polished, less raw data — emphasizes opportunity and returns
- Designed for lenders, equity partners, or sellers
- DataWise-branded

Both types appear in the Report Library (`/reports`), grouped by property, with type clearly labeled.

---

## Home Dashboard
**Location:** `/` (root — the app landing page after login)

**Purpose:** Orient the analyst in under 10 seconds each morning. Surface everything that needs attention without requiring navigation.

**Four sections:**

### 1. Today at a Glance (top strip)
- New listings imported today
- Unreviewed prime candidates (across all batches)
- Active Watch List count
- Pipeline deals needing action (highlighted in red if > 0)

### 2. Unreviewed Prime Candidates
- Top 5–10 unreviewed prime candidates sorted by gap/sqft
- Each row has a "Review" button that opens the map popup inline (no navigation)
- "View All [N] →" links to the full Screening Queue

### 3. Watch List — Needs Attention
- Properties with no activity in 3+ days
- Properties with showings scheduled today or tomorrow
- Properties recently changed to Hot urgency

### 4. Pipeline — Action Required
- Offers with deadlines within 24 hours
- Offers submitted with no response in 3+ days
- Under-contract deals with closing milestones approaching

---

## What Gets Removed or Retired

| Current element | Disposition |
|---|---|
| `Analysis > Queue` | Renamed to Screening Queue, moved to `Intake > Screening` |
| `Analysis > Dashboard` | Replaced by Home dashboard at `/` |
| `Analysis > Properties` | Retired or moved to Admin as a reference browser |
| `Analysis > Manual Entry` | Moved to Admin |
| `Analysis > Analyses` | Replaced by `Deals > Watch List` |
| `Analysis > Screening` | Moved to `Intake > Screening` |
| `Analysis > Imports` | Moved to `Intake > Imports` |
| "Begin Analysis" in map popup | Replaced by Promote / Pass flow (see Stage 1) |
| Manual post-import screening trigger | Replaced by automatic screening on import |

---

## Data Model Notes

The database schema is largely correct. Key additions needed:

**On `analysis_pipeline` (or equivalent Watch List table):**
- `urgency` — enum: `hot`, `warm`, `watch`
- `promoted_at` — timestamp of when human promoted from screening
- `promoted_from_screening_result_id` — FK back to screening result
- `watch_list_note` — free text note added at promotion time
- `lifecycle_stage` — already exists, ensure values align with: `watch_list`, `pipeline`, `under_contract`, `closed_won`, `closed_lost`

**On `screening_results`:**
- `reviewed_at` — timestamp when human reviewed (promoted or passed)
- `reviewed_by_user_id` — FK to users
- `review_action` — enum: `promoted`, `passed`
- `pass_reason` — enum + free text for rejection reason
- `urgency_assigned` — copied from Watch List entry at promotion time (for reporting)

**On `comparable_search_candidates`:**
- `selected_as_is_yn` — already added (April 6 changelog)

No new screening or ARV engine changes are required for this redesign. All engine logic stays as-is.

---

## The One-Paragraph Brief

DataWise needs a clean separation between its Screener side (automated, high-volume, pre-human) and its Analyst side (curated, deliberate, human-reviewed). The top nav restructures into: Home, Intake, Deals, Reports, Admin. Intake contains Imports and Screening — everything the computer touches before a human reviews it. Deals contains Watch List, Pipeline, and Closed — everything a human has deliberately promoted. The critical new interaction is the Screening map popup, which replaces the current "Begin Analysis" button with two explicit human choices: "Add to Watch List" (with required urgency level and optional note) or "Pass" (with required reason). On promotion, the analyst can either return to the queue for continued triage, or immediately open the full workstation for obvious deals. Nothing appears in the Deals section unless a human put it there. The Home dashboard shows four things every morning: today's import activity, unreviewed prime candidates, Watch List properties needing attention, and Pipeline deals requiring action.

---

*This document was produced through a structured design session in April 2026. It supersedes any implicit navigation or workflow assumptions in the existing codebase. When in doubt, defer to the mental model: Screener side = automated + unreviewed. Analyst side = human-promoted only.*

# DataWiseRE — Session Handoff (2026-04-13)

This document consolidates all open work, known issues, deferred items, and design ideas into a single launching point for the next session. It replaces the need to read multiple tracking files at the start of a new conversation.

---

## What Was Accomplished (April 12-13)

### Production Launch
- **www.datawisere.com is live** — custom domain on Vercel with SSL, GoDaddy DNS
- **Resend email integration** — partner share notifications from `analysis@datawisere.com`
- **Supabase auth URLs** configured for production redirects
- **Environment variables** in Vercel: `NEXT_PUBLIC_SITE_URL`, `RESEND_API_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

### Access Control
- Default signup role changed to **partner** (analysts promoted manually)
- **Role-based routing** in proxy.ts — partners blocked from workspace routes, redirected to `/portal`
- Analyst dashboard moved from `/home` to `/dashboard`
- Post-login redirect: analysts → `/dashboard`, partners → `/portal`
- **Partner portal chrome** — header with My Deals, Profile, Sign out, public page links
- **Profile page** at `/portal/profile`

### Public Pages
- **Methodology page** — full-bleed hero, 6 numbered sections, deal waterfall, limitations, CTA
- **Offerings page** — partner-facing service descriptions with hero layout

### Screening & Workstation
- `/screening` page: **12.6s → 3.7s** (parallelized queries, dropped count:exact)
- Quick Analysis tile: **2x2 layout** with Days Held (was 3x1)
- Quick Status tile in screening modal for promoted items
- **Copy MLS buttons unified** in CompWorkspace (serves both modal and workstation)
- **Live ARV recalculation** when toggling comps in the workstation

### Per-Comp Analyst Adjustments (Major Feature)
- 6 categories: View/Location, Layout, Lot Size, Garage, Condition, Other
- ARV engine: `arvFinal = arvTimeAdjusted + analystAdjustments`
- Expandable per-comp rows in ARV modal with editable inputs + Save + `router.refresh()`
- Migration: `analyst_adjustments_json` JSONB column on `comparable_search_candidates`

---

## Immediate Issues to Address

### 1. Remove debug logging (cleanup)
**Files:** `lib/partner-portal/load-partner-view-data.ts`, `app/portal/deals/[shareToken]/page.tsx`
**What:** Console.error logging added during 404 debugging. Remove once share links are confirmed stable in production.
**Effort:** 5 minutes

### 2. Update `computeArvForCandidates` to use `arvFinal`
**File:** `app/(workspace)/screening/actions.ts` line 72
**What:** Still uses `d.arvTimeAdjusted` instead of `d.arvFinal` when building `arvByCompListingId`. Won't affect screening (no analyst adjustments during screening) but should be consistent.
**Effort:** 1 line change

### 3. Contact page is a placeholder
**File:** `app/(public)/contact/page.tsx`
**What:** Still shows "This page will contain contact details and inquiry options." Linked from every page's nav. Needs real content now that the site is live.
**Effort:** 30 minutes — decide on content (email, phone, form?)

### 4. Landing page (`/`) needs a value proposition
**File:** `app/(public)/page.tsx`
**What:** Currently shows logo + "Sign in" button. No explanation of what DataWise does. First thing a visitor sees.
**Effort:** 1-2 hours for content + design

---

## Deferred Feature Work

### Live Reports (Hybrid Model) — AGREED, NOT YET BUILT
**Discussion:** Reports currently freeze as snapshots via `buildReportSnapshot()`. Agreed to make them live by default (render from `loadWorkstationData` at view time), snapshot only on share/export. This means a report always shows current analysis data, and the frozen version is created when it matters (partner delivery, PDF).
**Files:** `lib/reports/snapshot.ts`, `app/(workspace)/reports/[reportId]/page.tsx`, `app/(workspace)/reports/actions.ts`
**Effort:** ~3-4 hours

### Partner Portal — Deferred from Step 4
- Partner comp picking (private selection set → `partner_analysis_versions.selected_comp_ids`)
- Visibility-filtered notes in the partner view
- Second-degree sharing (`share_forwards` table — Phase 2)

### Admin Page
**File:** `app/(workspace)/admin/page.tsx`
**What:** Placeholder — "Import profiles, mappings, user controls, and system configuration will live here." Needs: user management (promote partner → analyst), import profiles, system config.

### Strategy Workspace Placeholders
These routes exist as stubs under `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/`:
- `rehab-budget/page.tsx`
- `rental/page.tsx`
- `wholesale/page.tsx`
- `listing/page.tsx`
- `new-build/page.tsx`

---

## Workstation Design Polish (WORKSTATION_DESIGN_FOLLOWUPS.md)

12 open items, roughly ordered by user impact:

| # | Issue | Scope |
|---|---|---|
| 4 | Right tile column should move to the LEFT side of the layout | Layout restructure |
| 9 | Screening modal needs a visible Deal Math waterfall card | New component |
| 6 | Notes modal UX — delete confirmation, inline editing, note list visibility | UX overhaul |
| 12 | Hold & Trans collapsed card headline is messy | Cosmetic |
| 10 | Workstation Deal Stat Strip missing Copy MLS buttons | **RESOLVED** (shipped 4/12 in CompWorkspace) |
| 7 | Deal Stat Strip pills shift horizontally during Quick Analysis typing | Layout/CSS |
| 3 | DetailModal card width too wide | CSS tweak |
| 5 | CostLine subscript notes displace numbers | CSS tweak |
| 1 | Property Physical tile — bed/bath duplication | Remove inline rows when mini-grid present |
| 2 | Missing tile titles on MLS Info and Property Physical tiles | Add titles |
| 8 | Property Physical tile — SF values should be right-aligned | CSS tweak |
| 19 | Quick Status for un-promoted screening results | Design discussion needed |
| 20 | Per-comp analyst adjustments follow-up | Verify flow through reports, partner view, tooltip, bulk runner |

---

## Performance (PERFORMANCE_FOLLOWUPS.md)

| Issue | Status | Next trigger |
|---|---|---|
| `analysis_queue_v` slow (~2.3s per materialization) | Partially fixed — collapsed 2 calls to 1 on `/home`. Proper fix: RLS-compatible cache table. | Page wall exceeds 3s or data scale grows |
| `/screening` page | **Fixed** (12.6s → 3.7s via parallelization + drop count:exact) | Same root cause as above at scale |

---

## Product Vision (PRODUCT_VISION.md)

Organized as a 4-layer feature stack:

**Layer 1 — Foundation** (shipped): Screening pipeline, workstation, partner portal

**Layer 2 — Spatial Awareness:**
- Map view for screening queue + Watch List
- Close/list price ratio + DOM per comp
- Nearby Analyses for showing efficiency

**Layer 3 — Priority + Context:**
- Market Conditions overlay (active/expired/withdrawn listings)
- Layout evolution (separate deal-math from non-math cards)
- Listing agent relationship tracking
- Deal urgency "fuse" timer

**Layer 4 — Learning:**
- Dashboard as living analytical surface (circles that open and close)
- Analyst accuracy scorecard (predicted vs actual outcomes)
- Partner Management Panel (cross-deal, cross-partner tracking)

---

## Recommended Priority for Next Session

1. **Cleanup** — remove debug logging, fix `arvFinal` consistency (15 min)
2. **Contact page** — real content for the live site (30 min)
3. **Landing page** — value proposition for visitors (1-2 hours)
4. **Mark #10 resolved** in WORKSTATION_DESIGN_FOLLOWUPS.md (done — Copy MLS shipped)
5. **Live reports** — hybrid model implementation (3-4 hours)
6. **Analyst adjustments follow-up (#20)** — verify reports, partner view, tooltips (1 hour)
7. **Design polish pass** — tackle the highest-impact items from the design followups list

---

## Key Files Reference

| Purpose | Path |
|---|---|
| Proxy (auth + role routing) | `proxy.ts` |
| Session refresh + role lookup | `lib/supabase/proxy.ts` |
| Service-role client | `lib/supabase/service.ts` |
| Partner view data loader | `lib/partner-portal/load-partner-view-data.ts` |
| Share actions (email send) | `lib/partner-portal/share-actions.ts` |
| Workstation data loader | `lib/analysis/load-workstation-data.ts` |
| ARV engine | `lib/screening/arv-engine.ts` |
| ARV types + analyst adjustments | `lib/screening/types.ts` |
| Report snapshot builder | `lib/reports/snapshot.ts` |
| Workstation client component | `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx` |
| ARV card modal (with adjustments) | `app/(workspace)/analysis/[analysisId]/arv-card-modal.tsx` |
| Screening comp modal | `components/screening/screening-comp-modal.tsx` |
| CompWorkspace (shared) | `components/workstation/comp-workspace.tsx` |
| Comp adjustment save action | `lib/auto-persist/save-comp-adjustment-action.ts` |
| Public layout | `app/(public)/layout.tsx` |
| Partner portal layout | `app/portal/layout.tsx` |
| Analyst nav chrome | `components/layout/app-chrome.tsx` |

---

## Tracking Files

- `CHANGELOG.md` — what shipped, when, with architecture notes
- `WORKSTATION_DESIGN_FOLLOWUPS.md` — UI polish items (20 entries, 12 open)
- `PERFORMANCE_FOLLOWUPS.md` — diagnosed performance issues with proper-fix proposals
- `PRODUCT_VISION.md` — layer 2-4 feature stack + partner management panel
- `PARTNER_PORTAL_DESIGN.md` — empty template for Dan's partner UX ideas
- `SESSION_HANDOFF.md` — this file

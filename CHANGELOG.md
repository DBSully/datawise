## 2026-04-12 — Role-Based Access Control + Partner Portal Chrome

Partners and analysts now have separate experiences. The kitchen is locked.

### What shipped

- **Default role changed to `partner`.** New signups get `role = 'partner'` by default. Analysts are promoted manually. Migration updates both the `profiles` table default and the `handle_new_auth_user` trigger.

- **Role-based route protection in `proxy.ts`.** Partners are blocked from all workspace routes (`/dashboard`, `/intake`, `/screening`, `/analysis`, `/action`, `/reports`, `/admin`) and redirected to `/portal`. Analysts pass through as before. The proxy looks up the user's role from `profiles` on each request.

- **Analyst dashboard moved from `/home` to `/dashboard`.** `/home` now redirects to `/dashboard`. AppChrome nav updated: "Home" → "Dashboard". All `revalidatePath("/home")` calls updated across 7 action files.

- **Role-aware post-login redirect.** Sign-in page looks up the user's role after authentication. Partners → `/portal`, analysts → `/dashboard`. Partners following a `?next=` link to `/portal/*` are honored; workspace `?next=` targets are overridden to `/portal`.

- **Partner portal header.** Portal layout now has a proper header with DataWise branding, "My Deals" and "Profile" nav links, public page links (Offerings, Methodology, Contact), and a Sign Out button.

- **Profile page at `/portal/profile`.** Shows email, role, member-since date (read-only) and an editable full name field with save button. Accessible to both partners and analysts.

- **Public page links in both layouts.** Offerings, Methodology, and Contact are now navigable from the analyst workspace header and the partner portal header.

---

## 2026-04-12 — MILESTONE: Production Launch at www.DataWiseRE.com

**DataWiseRE is live on a real domain.** The platform moved from a Vercel preview URL to production at `www.datawisere.com` with full SSL, custom domain routing, authenticated email delivery, and a polished screening workflow.

This marks the transition from development prototype to live production application.

### What shipped

- **Custom domain deployment.** `www.datawisere.com` is the primary production URL. Root domain `datawisere.com` redirects to `www`. Vercel handles SSL certificates automatically. DNS configured at GoDaddy with Vercel CNAME/A records alongside existing Resend SPF/DKIM records.

- **Resend email integration.** Partner share notifications now send real emails via Resend from `DataWise <analysis@datawisere.com>`. Clean HTML email template with property address in the subject line, optional analyst message, and a "View Analysis" CTA button. Email failures are non-blocking — the share link still works via manual copy from the Partner Sharing modal. Domain verified: `datawisere.com`.

- **Screening modal: Quick Analysis 2x2 + Quick Status.** The screening modal's Quick Analysis pane now matches the Workstation layout — 4 inputs (Manual ARV, Rehab Override, Target Profit, Days Held) in a 2x2 grid. Quick Status tile (Interest, Condition, Location, Next Step) renders alongside Quick Analysis for promoted items and auto-persists to the analysis. SubjectTileRow gained a `children` slot for composable tile additions.

- **Screening page performance: 12.6s → 3.7s (70% faster).** Parallelized all 4 Supabase queries (3 filter options + 1 main queue) into a single `Promise.all`. Removed `count: "exact"` which forced Postgres to scan the entire `analysis_queue_v` view.

- **Supabase auth configured for production.** Site URL and redirect URLs updated to `https://www.datawisere.com/**` with localhost retained for local dev.

### Infrastructure established

| Layer | Detail |
|---|---|
| **Domain** | `www.datawisere.com` (primary) + `datawisere.com` (redirect) |
| **Hosting** | Vercel with auto-deploy from GitHub `main` branch |
| **Email** | Resend with verified `datawisere.com` domain, SPF/DKIM via GoDaddy |
| **Auth** | Supabase Auth with production redirect URLs configured |
| **SSL** | Auto-provisioned by Vercel |
| **Fallback** | `datawise-brown.vercel.app` remains as backup domain |

---

## 2026-04-12 — Phase 1 Step 4 — Partner Portal MVP

Phase 1's #1 priority feature. The complete analyst-shares-with-partner → partner-views-and-adjusts → analyst-sees-feedback-in-real-time loop.

### The loop that shipped

1. **Analyst shares** an analysis from the Workstation (Partner Sharing card or header Share button)
2. **Partner opens the link** without login — sees the full analysis: property physical, comp map + table, deal stats, ARV/Rehab/Price Trend cards
3. **Partner submits feedback** (Interested / Schedule Showing / Request Discussion / Pass) — requires sign-in
4. **Analyst sees it LIVE** via Supabase Realtime — the Partner Sharing card's headline + expanded modal update instantly
5. **Partner visits `/portal`** — their Workspace dashboard shows all shared deals organized by status lanes (New / Watching / Interested / Passed / All)

### What shipped (6 sub-steps)

| Sub-step | What |
|---|---|
| **4A** | 3 new tables (`analysis_shares`, `partner_analysis_versions`, `partner_feedback`) + 16 RLS policies + Realtime publication |
| **4B** | Share server actions (`createAnalysisShareAction`, `revokeAnalysisShareAction`, `markFeedbackReadAction`) + email placeholder (Resend deferred) |
| **4C** | Partner Sharing card full implementation — add-share form, active shares list with feedback badges, Copy Link button, header Share button, revoke with confirm |
| **4D** | Partner-facing route at `/portal/deals/[shareToken]` — service-role data loader for view-without-login, property physical tile, deal stat strip, full comp workspace (server-loaded to bypass RLS), 3 read-only detail cards, action buttons with feedback persistence |
| **4E** | Realtime subscriptions — `useShareRealtime` hook subscribes to `analysis_shares` + `partner_feedback` changes, auto-refreshes the Partner Sharing card headline + modal |
| **4F** | Auto-link trigger (extends `handle_new_auth_user` to set `shared_with_user_id` on matching shares) + Partner Workspace dashboard at `/portal/` with status lane tabs + per-deal summary cards |

### Key architecture decisions

- **Service-role client for partner view** (`lib/supabase/service.ts`). Partners view WITHOUT login (Decision 4.3), so the authenticated client can't load data. The share_token is the authorization boundary — same security model as Google Docs share links. The service-role key never appears in client code.
- **Server-loaded comp data for partner view.** The initial attempt loaded comp data client-side via `loadCompDataByRunAction`, but the RLS blocked unauthenticated access. Fixed by loading comp data in `loadPartnerViewData` (server-side, service-role) and passing it as a prop.
- **Real `portal/` directory, not `(portal)` route group.** Route groups don't create URL segments — `app/(portal)/deals/[token]` served at `/deals/[token]`, not `/portal/deals/[token]`. Fixed by using a real directory.
- **Auto-link via trigger, not application code.** The `handle_new_auth_user` trigger auto-links pending shares by email on registration. This works regardless of which UI path the user signs up through.

### Bug fix included

- **`addAnalysisNoteAction` still referenced dropped `is_public` column.** The 3F migration dropped the column but the insert statement in `deals/actions.ts` still included it. Fixed by removing the `is_public` field from the insert — only `visibility` is written now.

### Deferred items

- ~~Email delivery via Resend~~ — **Shipped 2026-04-12** (see Production Launch milestone above)
- Partner Quick Analysis sandbox (private overrides → `partner_analysis_versions`)
- Partner comp picking (private selection set → `partner_analysis_versions.selected_comp_ids`)
- Visibility-filtered notes in the partner view
- Partner profile page at `/portal/profile`
- Second-degree sharing (`share_forwards` table — Phase 2)

---

## 2026-04-11 — Phase 1 Step 3F — Cleanup (Step 3 Complete)

Final sub-step of Step 3. Mechanical cleanup: convert legacy URL wrappers to hard redirects, drop the deprecated `analysis_notes.is_public` column, remove the `dispositionCommissions` backwards-compat shim, delete dead files, and retire the layout-level auth check.

### What shipped

- **Legacy `/deals/*` URLs now redirect permanently.** `/deals/watchlist` → `/analysis`, `/deals/watchlist/[id]` → `/analysis/[id]`, `/deals/pipeline` → `/action`, `/deals/closed` → `/action?status=closed`. Bookmarks still work; they just redirect now instead of serving content.

- **`analysis_notes.is_public` column dropped.** Type, loader, and all consumers updated to use `visibility` (the enum column added in 3A) directly. Migration `20260411100100` drops the column.

- **`dispositionCommissions` backwards-compat shim removed.** The deprecated field was removed from `TransactionResult`, `TransactionDetail`, and the transaction engine. The report document now renders buyer + seller commissions separately. 4 code files cleaned.

- **Dead files deleted (780 lines removed).** The 3D auto-persist test harness (`dev/auto-persist-test/`), the dead `ManualAnalysisPanel` component (zero imports), and their directories.

- **Layout-level auth check retired.** `app/(workspace)/layout.tsx` no longer calls `supabase.auth.getUser()`. Proxy.ts middleware remains the primary auth enforcer. Saves one getUser() round-trip per workspace page load. Confirmed by Dan.

### What stays (deferred)

- `saveManualAnalysisAction` bulk form action — RehabCard still uses it for the Save Rehab button. Deferred until RehabCard is migrated to per-payload auto-persist.
- The `deals/` directory itself — still has load-bearing actions and table components used by the Watch List and Action pages.

### Step 3 Summary

Step 3 of Phase 1 is **complete** across 6 sub-steps (3A through 3F):

| Sub-step | What it did |
|---|---|
| **3A** | Schema preparation — notes visibility, next_step column, transaction 6-line restructure, cash required extension, bed/bath level fields, SECURITY DEFINER audit |
| **3B** | Route restructure — canonical `/analysis` + `/analysis/[id]` + `/action` routes, nav update, internal link sweep, sign-out button |
| **3C** | Component extraction — 11 shared components in `components/workstation/`, 905 lines of inline JSX deduplicated |
| **3D** | Auto-persist infrastructure — discriminated-union server action, race-safe useDebouncedSave hook, SaveStatusDot indicator |
| **3E** | New Workstation card layout — header, 4-tile row with auto-persist, deal stat strip with override indicators, hero comp workspace, 9 collapsible detail cards with per-card modals |
| **3F** | Cleanup — legacy redirects, drop is_public, remove deprecated shim, delete dead files, retire layout auth |

**By the numbers:**
- ~60+ commits across 3A-3F
- ~5,000+ lines of new code in the new Workstation + shared components
- ~3,800+ lines of dead/deprecated code removed
- 2 SQL migrations (notes visibility DEFAULT + is_public drop)
- 7 design followups queued for the polish pass
- The `components/workstation/` directory contains 13 shared components
- The new Workstation orchestrator + 8 modal files replace the monolithic legacy client

**Next:** Step 4 (Partner Portal MVP) builds the partner-facing experience on top of the Workstation infrastructure. The Partner Sharing card stub is ready to be filled in. The design followups (WORKSTATION_DESIGN_FOLLOWUPS.md) can be addressed in a focused polish pass before or alongside Step 4.

---

## 2026-04-11 — Phase 1 Step 3E — New Workstation Card Layout

Fifth and largest sub-step of the Step 3 milestone. Build the new Analysis Workstation per `WORKSTATION_CARD_SPEC.md`. The new Workstation replaces the legacy 2046-line monolithic `analysis-workstation.tsx` with a modular orchestrator (~720 lines) + 8 per-card modal files + shared components from 3C + auto-persist infrastructure from 3D.

Per Decision 5.1 (3E plan), the side-by-side rollout from master plan Decision 6.6 was dropped. The legacy Workstation file was deleted in 3E.1 and only the new Workstation exists from that point onward. The screening modal at `/screening` served as the daily-work fallback for property review during the build.

### What shipped

**3E.1 — Skeleton + delete legacy.** Created the new client skeleton at `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx` with dashed-box placeholders for each layout region. Deleted the 1,526-line legacy Workstation file. Updated the canonical `page.tsx` to import from the relative path. The 3B re-export wrapper at `/deals/watchlist/[analysisId]/page.tsx` was preserved — both URLs serve the new client.

**3E.2 — Header bar.** Address + city/state/zip (truncated), status badges (MLS#, MLS status, strategy type, completed timestamp), action buttons (Mark Complete with optimistic local state, Share placeholder for Step 4, Generate Report with inline title dialog).

**3E.3 — Four-tile top row.** MLS Info + Property Physical (with new bed/bath level mini-grid using 3A's per-level fields) via `<SubjectTileRow>`. New `<QuickAnalysisTile>` with auto-persist on 4 numeric overrides (Manual ARV, Rehab Override, Target Profit, Days Held) — controlled component pattern so the parent can compute `liveDeal` from the live inputs. New `<QuickStatusTile>` with auto-persist on 4 dropdowns (Interest, Condition, Location, Next Step) — instant persist via `delayMs=0`.

**3E.4 — Deal Stat Strip with override indicators.** `<DealStatStrip>` wired with `manualOverrides` prop + `liveDeal` memo for live recompute. Extended `<DealStat>` with `override?: "none" | "manual" | "cascading"` prop per Decision 6.1 (indigo-700 + ᴹ superscript for direct overrides; indigo-500 for cascading). Cascade rules: ARV override → ARV manual + Max Offer/Offer%/Gap cascading; Rehab override → Rehab manual + Max Offer/Offer% cascading; Target Profit override → same cascade. `liveDeal` useMemo hoisted to parent level — the proactive fix for the legacy "Deal Math card doesn't reflect Quick Analysis" bug Dan surfaced during 3D testing.

**3E.5 — Hero comp workspace.** Extracted `<CompWorkspace>` from the screening modal into `components/workstation/comp-workspace.tsx` (~626 lines, the deferred extraction from 3C). Wired into the new Workstation with client-side data loading via `loadCompDataByRunAction`, optimistic selection toggle, map pins, comp stats. Map + 19-column table + sort + filter + AddCompByMls + ExpandSearchPanel all functional.

**3E.6 — Right column collapsed cards.** 9 `<DetailCard>` instances stacked vertically. Cascade-affected cards (ARV, Rehab, Hold & Trans, Cash Required) read headlines from the parent's `liveDeal` memo; non-cascade cards (Price Trend, Pipeline, Notes, Partner Sharing) read from server data. Override badges appear when manual values are set.

**3E.7 — Per-card detail modals (9 total, one per commit).**
- **ARV** (read-only) — 3-tier display, per-comp ARV table, PSF comparisons with red ⚠ warnings, comp summary stats.
- **Cash Required** (read-only) — acquisition section with Decision 5 6-line transaction breakdown, project carry section, total. Uses `<CostLine>`.
- **Price Trend** (read-only) — confidence/direction badges, local/metro tier columns using `<TrendTierColumn>`, summary text.
- **Rehab** (editing) — wraps 3C's `<RehabCard>` inside `<DetailModal>`. Adds "Rehab Override active" banner when Quick Analysis has a manual rehab value.
- **Holding & Transaction** (read-only display) — holding daily-rate waterfall + 6-line transaction breakdown per Decision 5.
- **Financing** (editing with auto-persist) — 3 percentage inputs (Rate%/LTV%/Points%) wired to 3D's infrastructure. Each has SaveStatusDot + × clear affordance.
- **Pipeline Status** (editing with auto-persist) — Showing/Offer status dropdowns + Watch List Note textarea. Footer: "Open in Action →" per Decision 7.
- **Notes** (editing with 3-tier visibility) — Add Note form with category + visibility selector (Internal/All Partners; Specific Partners deferred to Step 4), existing note rows with visibility badges, category filter chips, delete button.
- **Partner Sharing** (stub) — "Full Partner Sharing arrives in Step 4" placeholder per Decision 5.4.

**3E.7.h also shipped migration** `20260411100000_notes_visibility_default_internal.sql` per Decision 5.5 — changes `analysis_notes.visibility` DEFAULT from `'all_partners'` to `'internal'`.

**3E.8 — Cross-card cascades + polish.** Comment cleanup, stale reference removal. Cascade verification confirmed: client-side cascades (ARV/Rehab/TargetProfit/DaysHeld → Strip + card headlines) work synchronously; server-only cascades (Condition → Rehab, Financing overrides → Financing headline, Cash Required total) update after revalidatePath round-trip (~1-2s).

### Design followups logged (7 entries in WORKSTATION_DESIGN_FOLLOWUPS.md)

1. Property Physical tile — bed/bath mini-grid duplicates inline Beds/Baths rows
2. Missing tile titles on MLS Info and Property Physical tiles (MLS DATA / PROPERTY DATA)
3. DetailModal card width too wide — label-to-value gap hard to scan
4. Right tile column should move to the LEFT side of the layout
5. CostLine subscript notes displace numbers from the value column
6. Notes modal UX — delete confirmation, inline editing, always-visible note list
7. Deal Stat Strip pills shift horizontally as digits change during typing

### Files touched in 3E

**New (9 modal files + 3 tile/workspace components):**
- `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx` — the new Workstation orchestrator (~720 lines)
- `app/(workspace)/analysis/[analysisId]/arv-card-modal.tsx`
- `app/(workspace)/analysis/[analysisId]/cash-required-card-modal.tsx`
- `app/(workspace)/analysis/[analysisId]/price-trend-card-modal.tsx`
- `app/(workspace)/analysis/[analysisId]/rehab-card-modal.tsx`
- `app/(workspace)/analysis/[analysisId]/hold-trans-card-modal.tsx`
- `app/(workspace)/analysis/[analysisId]/financing-card-modal.tsx`
- `app/(workspace)/analysis/[analysisId]/pipeline-card-modal.tsx`
- `app/(workspace)/analysis/[analysisId]/notes-card-modal.tsx`
- `components/workstation/quick-analysis-tile.tsx`
- `components/workstation/quick-status-tile.tsx`
- `components/workstation/comp-workspace.tsx`

**Modified:**
- `app/(workspace)/analysis/[analysisId]/page.tsx` — import path update
- `components/workstation/deal-stat.tsx` — added `override` prop
- `components/workstation/deal-stat-strip.tsx` — added `manualOverrides` prop
- `components/workstation/subject-tile-row.tsx` — added `bedBathLevels` + `showQuickAnalysis` props
- `components/screening/screening-comp-modal.tsx` — CompWorkspace extraction
- `app/(workspace)/deals/actions.ts` — addAnalysisNoteAction extended with visibility
- `CHANGELOG.md`, `WORKSTATION_DESIGN_FOLLOWUPS.md`, `PERFORMANCE_FOLLOWUPS.md`

**Deleted:**
- `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` — the 1,526-line legacy Workstation

**Migration (1):**
- `supabase/migrations/20260411100000_notes_visibility_default_internal.sql`

### What 3F builds on top

3F's job is now smaller since the legacy Workstation file was already deleted in 3E.1:
- Convert `/deals/watchlist/[analysisId]/page.tsx` wrapper → hard `redirect()`
- Delete the legacy `saveManualAnalysisAction` bulk form action
- Drop `analysis_notes.is_public` deprecated column
- Delete the 3D dev test harness at `/dev/auto-persist-test`
- Remove the layout-level auth check
- Final Step 3 CHANGELOG + tag `phase1-step3-complete`

---

## 2026-04-11 — Phase 1 Step 3D — Auto-Persist Infrastructure

Fourth sub-step of the Step 3 milestone. Build the "no Save buttons, every edit persists immediately" pattern that the new Workstation in 3E depends on (Decision 2 in `WORKSTATION_CARD_SPEC.md`). Three deliverables: a TypeScript discriminated-union server action, a custom React hook with a race-safe state machine, and a small visual indicator.

**Pure additive infrastructure — no existing analyst workflow touches it.** Zero database migrations. Zero changes to the current Workstation, the screening modal, or any existing UI. The new code sits alongside the existing `saveManualAnalysisAction` (the bulk form action) and will be consumed by the new Quick Analysis tile + Quick Status tile + Financing card in 3E.3 onward.

### Goals accomplished

1. **Discriminated union types module (Task 1, file: `lib/auto-persist/field-types.ts`)** — A TypeScript discriminated union covering every field the new Workstation will persist via auto-save. Each variant pairs a field name with the exact value type that field accepts, so passing the wrong shape for a given field is a compile-time error. Tight 11-field allow-list per Decision 5.3: 4 Quick Analysis numeric overrides + 3 Quick Status manual fields + 3 Financing percentage overrides + 1 Interest Level (the only field on `analysis_pipeline`). The union is split into named sub-types (`QuickAnalysisFieldUpdate`, `QuickStatusManualFieldUpdate`, `FinancingFieldUpdate`, `PipelineFieldUpdate`) so each tile's owned fields are easy to grep for.

2. **Generic per-field server action (Task 1, file: `lib/auto-persist/save-manual-analysis-field-action.ts`)** — A single `saveManualAnalysisFieldAction({ analysisId, field, value })` that takes the discriminated union input and writes one column on one row. Per Decision 5.2, the caller never thinks about which table — internal routing via a `FIELD_TABLE` map dispatches to either `manual_analysis` or `analysis_pipeline`. The map is typed as `Record<AnalysisFieldName, ...>` which **forces exhaustive coverage of the union at compile time** — adding a field to the union without adding it to the map (or vice versa) is a typecheck error. The action does auth check → defensive allow-list check → ownership check → upsert → revalidatePath. Errors are thrown (not returned) so the hook can catch them in try/catch and transition to the "error" state.

3. **`useDebouncedSave` hook (Task 2, file: `lib/auto-persist/use-debounced-save.ts`)** — The single auto-persist primitive every input in 3E will build on top of. Watches a value, debounces save calls (default 500ms), returns a state machine `idle | saving | saved | error`. The hook does NOT manage the value itself — the input is the source of truth via normal `useState`. The hook only watches the value and triggers debounced saves. Five correctness invariants explicitly addressed in the implementation (these are the easy-to-miss bugs that would otherwise surface as confusing UX in 3E):

   - **First-render skip** via `isFirstRender` ref — initial value comes from loaded data, not a user edit; firing a save on mount would be redundant.
   - **Request counter** via `requestIdRef` — every save captures `myRequestId = ++ref` and only updates state if `ref.current === myRequestId` on resolve. Stale resolves from superseded saves become no-ops, even if they land out of order.
   - **Debounce cancellation** at the start of every effect body — newer keystroke supersedes the older debounce timer. Coalesces fast typing into a single save.
   - **Fade timer cancellation** at the start of every effect body — if the user types again during the "saved" green fade, the fade is cancelled and the new edit cycle takes over.
   - **Unmount cleanup** via a second `useEffect` with empty deps — bumps the request counter to a `UNMOUNTED_REQUEST_ID` sentinel (-1) so any in-flight save's resolve callback compares unequal to the live counter and gets ignored. Also clears both timers.

4. **`SaveStatusDot` indicator (Task 3, file: `components/workstation/save-status-dot.tsx`)** — A small (8px) inline status circle that visualizes the current save state. Color mapping per spec §3.2: slate (idle) → amber (saving) → emerald (saved, fades after 1s) → slate (idle); red (error) with hover tooltip showing the actual server error message. Pure presentational with no state of its own. Accessible via `role="status"` + `aria-label` + `title` tooltip.

5. **Test harness page (Task 4, files: `app/(workspace)/dev/auto-persist-test/page.tsx` + `auto-persist-test-client.tsx`)** — A dev-only page that wires all three primitives to a real database row so we could verify the state machine visually before 3E lands. Server component picks the user's most recently updated analysis automatically; client component renders 3 test inputs covering both target tables and both value types (Target Profit number on `manual_analysis`, Next Step string on `manual_analysis`, Interest Level string on `analysis_pipeline`). **DELETE THIS PAGE in Step 3F as part of cleanup** — the `dev/` subdirectory marker makes it easy to find at deletion time.

### Smoke test results — all 11 transitions verified

Per §9 of the implementation plan, every state transition was verified manually in the test harness:

| # | Transition | Result |
|---|---|---|
| 1 | Initial mount → no save fires (first-render skip) | ✓ |
| 2 | Type a value → 500ms debounce → amber → emerald → slate fade | ✓ |
| 3 | Save success → fade emerald → idle exactly 1s later | ✓ |
| 4 | Fast typing → only one save fires (debounce coalesces) | ✓ |
| 5 | Mid-fade edit → fade cancels, new edit cycle takes over | ✓ |
| 6 | Empty input → persists value: null (column becomes NULL) | ✓ |
| 7 | String dropdown change → same cycle for discrete values | ✓ |
| 8 | Cross-table routing → interest_level lands on analysis_pipeline | ✓ |
| 9 | Network error → red dot + tooltip with error message | ✓ |
| 10 | Unmount during save → no React setState warnings | ✓ |
| 11 | Reload persistence → new values loaded from database | ✓ |

The hook's race-safety invariants all hold under real browser conditions.

### Notable design decisions

- **The discriminated union + `Record<AnalysisFieldName, ...>` compile-time check.** This is the strongest typecheck-time guarantee available without runtime tests. The union forces every variant to declare a value type; the `FIELD_TABLE` map forces every variant in the union to have a routing entry. Adding a new field requires editing both files, and the compiler catches drift in either direction. No need for unit tests on the type-level invariants — TypeScript proves them.

- **Throw vs return for action errors.** The action `throw`s on failure (auth, allow-list, ownership, upsert) instead of returning an error union. This works cleanly with the hook's `try/catch` pattern: `catch (err) { setStatus("error"); setErrorMessage(err.message); }`. Returning a union would force every consumer to check `result.ok` and the hook wouldn't be able to use try/catch. Server actions in Next.js support both patterns; throw was simpler for this use case.

- **Internal field→table routing instead of an explicit `table` parameter** (Decision 5.2). The caller passes `{ field: "interest_level", value: "Hot" }` and the action knows to write to `analysis_pipeline.interest_level`. The discriminated union ensures type safety on the value type. The internal routing keeps the API minimal and matches the spec's mental model: "set this field on this analysis, the system handles the storage detail". 3E call sites become: `saveManualAnalysisFieldAction({ analysisId, field: "arv_manual", value: 1125000 })`. No table parameter to remember.

- **Tight 11-field allow-list** (Decision 5.3). Adding a field is one entry to the discriminated union + one entry to the `FIELD_TABLE` map — both are required by the compiler. Forces a deliberate decision each time. Catches typos at compile time via the union (a typo in the field name doesn't typecheck). The cost of adding a new field in 3E if we discover one we missed is negligible.

- **The hook does NOT manage the value itself.** The input is the source of truth via normal `useState` in the parent. The hook just watches the value and triggers debounced saves. This means every consumer in 3E uses a familiar React pattern — controlled input with `useState`, plus one extra hook call. No custom state management semantics.

- **Save callback captured in a ref** so the effect doesn't re-fire when the parent passes a new function reference each render. The dependency list is just `value` plus the timing options. Critical for stability — without this, every parent re-render would create a new save callback object, which would change the effect's deps, which would trigger a new effect run, which could fire spurious saves.

- **Test harness page lives in `app/(workspace)/dev/`** instead of `app/dev/` or another location. Two reasons: (1) it inherits the workspace layout's auth check so unsigned users can't accidentally access it, and (2) the `dev/` subdirectory inside the workspace is a clear "delete in 3F" marker — when 3F runs, anyone (or future-Claude) can grep for `app/(workspace)/dev/` and remove the entire directory in one operation.

### Files touched in 3D

**New (5):**
- `lib/auto-persist/field-types.ts` — discriminated union + sub-types + `AnalysisFieldName` + `SaveAnalysisFieldInput`
- `lib/auto-persist/save-manual-analysis-field-action.ts` — generic server action with internal field→table routing
- `lib/auto-persist/use-debounced-save.ts` — custom React hook with the 5-invariant state machine
- `components/workstation/save-status-dot.tsx` — visual indicator
- `app/(workspace)/dev/auto-persist-test/page.tsx` — test harness server component (deleted in 3F)
- `app/(workspace)/dev/auto-persist-test/auto-persist-test-client.tsx` — test harness client component (deleted in 3F)

**Modified (1):**
- `CHANGELOG.md` — this entry

**Reference docs:**
- `PHASE1_STEP3D_IMPLEMENTATION.md` — implementation plan (drafted before execution, all 5 decisions locked in the planning commit)

**Not modified — by design:**
- Any existing server action — `saveManualAnalysisAction` (the bulk form action) stays untouched and continues to power the current Workstation's Overrides form, the RehabCard's Save button, and the screening modal's Quick Analysis tile through 3E. Retired in 3F.
- Any existing UI component — no consumer until 3E
- Any database migration — `manual_analysis.next_step` was already added in 3A; everything else uses existing columns
- Any route file or `page.tsx` other than the dev test harness
- Navigation, the home page, the screening modal, or the current Workstation
- The `/home` performance fix (untouched)
- `lib/analysis/load-workstation-data.ts` (read-side; 3D is write-side)

### What's deferred to later sub-steps

| Out of scope | Belongs to |
|---|---|
| Wiring auto-persist into the new Quick Analysis tile (4 numeric inputs) | 3E.3 |
| Wiring auto-persist into the new Quick Status tile (4 dropdowns) | 3E.3 |
| Wiring auto-persist into the Financing card modal (3 percentage inputs) | 3E.7 |
| Building override indicators on the Deal Stat Strip (manual ᴹ superscript) | 3E.4 |
| Migrating existing form-based saves in the current Workstation | Never — current Workstation gets retired in 3F |
| Removing the existing `saveManualAnalysisAction` bulk form action | 3F (when the current Workstation is deleted) |
| Deleting the test harness page | 3F |
| Realtime sync between two browser tabs editing the same field | Out of scope for Phase 1 |
| Optimistic concurrency / version stamps | Out of scope; LWW is acceptable for single-user workloads |

### What 3E builds on top

3E.3 (the new top tile row, specifically the Quick Analysis and Quick Status tiles) is the first 3E sub-task that consumes 3D. Each of the 4 numeric fields in the Quick Analysis tile becomes:

```typescript
const [arvInput, setArvInput] = useState<string>(initialFromData);
const arvNumber = parseDollarInput(arvInput);
const { status, errorMessage } = useDebouncedSave(arvNumber, async (v) =>
  saveManualAnalysisFieldAction({ analysisId, field: "arv_manual", value: v }),
);

return (
  <div className="flex items-center gap-1">
    <input value={arvInput} onChange={(e) => setArvInput(e.target.value)} />
    <SaveStatusDot status={status} errorMessage={errorMessage} />
  </div>
);
```

Same shape for Rehab Override / Target Profit / Days Held / and the 4 Quick Status dropdowns. 3E.7 (per-card modals) uses the same pattern for the Financing card's Rate% / LTV% / Points% fields.

The infrastructure is now stable, race-safe, and verified. 3E is unblocked.

---

## 2026-04-11 — Phase 1 Step 3C — Component Extraction

Third sub-step of the Step 3 milestone. Extract the components the new Workstation in 3E will reuse, without changing any existing user-visible behavior. After 3C, both `ScreeningCompModal` and the current `AnalysisWorkstation` continue to work exactly as before, but they now share underlying components from a new `components/workstation/` directory that 3E will plug into.

**Pure UI refactoring — zero database changes, zero business logic changes, zero route changes.** The verification standard was binary: open the screening modal and walk through the comp workspace, then open a current Workstation and walk through every panel. Anything that looks or behaves differently from before is a bug.

Two intentional behavior changes shipped in this entry:
- Tasks 9 and 10 unified deliberately-divergent strip JSX between the two consumers per Dan's call ("the differences are purely accidental, no intent for these to be unique"). The screening modal's deal stat strip now uses the workstation's rounded card layout, stacked tiles, and the new value-driven semantic coloring (Offer% / Gap-sqft / Trend green-or-red based on value thresholds).
- A pre-existing modal Rehab pill bug — the pill read from `data.rehabTotal` (server-static) instead of `liveDeal.rehabTotal` (live recalc), so typing in the Rehab Override input updated ARV/MaxOffer/Offer%/Gap but the Rehab pill itself stayed frozen. Fixed as a side effect of the unification.

### Goals accomplished

1. **Deleted dead code (Task 1)** — `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` was unreachable after Step 3B Task 4 turned its sibling `page.tsx` into a redirect to `/analysis/[analysisId]`. The file carried duplicated copies of `TrendDirectionBadge`, `TrendTierColumn`, and `CostLine` that confused every grep. **1,548 lines deleted.**
2. **Lifted CostLine (Task 2)** — moved the cost-waterfall line item primitive into `components/workstation/cost-line.tsx`. Used by 13 call sites in the current Workstation (Holding / Transaction / Financing / Cash Required waterfalls). Pure presentational; no closures.
3. **Lifted TrendDirectionBadge (Task 3)** — moved into `components/workstation/trend-badges.tsx`. The two existing implementations had diverged on size, weight, and color shade (compact vs prominent visual styles). Per Decision 5.5, surfaced the divergence and added a `variant?: "compact" | "prominent"` prop that preserves both existing looks exactly. Two consumers updated.
4. **Lifted TrendTierColumn (Task 4)** — moved into the same `trend-badges.tsx` file. Single-consumer lift after Task 1 deleted the dead duplicate. The local `fmtRate` helper moved along as a private file-internal helper.
5. **Lifted DealStat (Task 5)** — the two implementations had structurally different layouts (vertical tile vs horizontal inline row) AND different highlight semantics (bolder/darker vs green). Per Decision 5.5, added a `variant?: "stacked" | "inline"` prop that preserves both layouts exactly. Six modal call sites updated to pass `variant="inline"`.
6. **Moved RehabCard to its own file (Task 6)** — lifted the ~310-line component plus its 5 exclusive helpers (`CATEGORY_SCOPE_TIERS`, `REHAB_CATEGORIES`, `SCOPE_MULT_MAP`, `resolveLocalCost`, `MAX_CUSTOM_ITEMS`) into `components/workstation/rehab-card.tsx`. **Bonus extraction discovered during this task:** `CardTitle` was used by 11+ cards across the workstation; lifted it into `components/workstation/card-title.tsx` since RehabCard depends on it and inlining it would have created duplication. The `router` prop interface dropped its `ReturnType<typeof useRouter>` type in favor of a minimal structural type `RouterLike = { refresh: () => void }` since RehabCard only calls `router.refresh()`.
7. **Extracted ExpandSearchPanel (Task 7)** — lifted out of `screening-comp-modal.tsx` into `components/workstation/expand-search-panel.tsx` along with its private `MultiCheckDropdown` helper and the two option constants (`BUILDING_FORM_OPTIONS`, `LEVEL_CLASS_OPTIONS`) that were only used inside it. Removed the now-orphaned `expandComparableSearchAction` import from the modal.
8. **Extracted AddCompByMls (Task 8)** — lifted into `components/workstation/add-comp-by-mls.tsx`. Already had a clean prop interface and a single server action dependency. Mechanical lift.
9. **Built SubjectTileRow by extraction (Task 9)** — the 3-tile horizontal row (MLS Info / Property Physical / Quick Analysis) at the top of both consumers. JSX was structurally identical between the two; only data sources differed. Designed using **data normalization at the prop boundary** — each consumer pre-formats its data with its own helpers and passes display strings into the shared component. The shared component never sees `WorkstationData` or `ScreeningCompData`. The Workstation's special Tab handler (Target Profit input → focus the "Copy Selected MLS" button) is wired through an optional `onTargetProfitTab?` callback prop; the modal omits it.
10. **Built DealStatStrip with full unification (Task 10)** — the deal-summary stat strip below the SubjectTileRow. Per Dan's call ("the differences are purely accidental"), unified on the workstation's layout (rounded card, stacked tiles) for both surfaces, with new behaviors:
    - **Trend pill added to BOTH surfaces** (workstation didn't have it before). Hidden entirely when `trendAnnualRate` is null.
    - **Target Profit pill added to the modal** (modal didn't have it before).
    - **Modal's right-aligned content** (comp count + Copy MLS buttons) preserved via an optional `rightSlot` prop.
    - **Modal's Rehab pill bug fixed** — the modal's `liveDeal` now exposes `rehabTotal` and `targetProfit` (already computed inside its useMemo, just not in the return object). Both consumers pass `liveDeal.rehabTotal` so the pill responds to the Rehab Override input correctly.
    - **Value-driven semantic coloring** via a new `tone?: "default" | "good" | "bad"` prop on `DealStat`. Tone overrides text color but not the highlight bold treatment. The strip applies the tone rules below internally; consumers pass raw numbers and the strip handles formatting + coloring.
11. **Built DetailCard greenfield wrapper (Task 11)** — generic collapsed card for the new Workstation's right tile column in 3E. Props: `title`, `headline`, `context`, `badge?`, `onExpand`. Pure presentational, two-row layout per spec §5.0 mockup, click-anywhere-to-expand via a wrapping button element for free keyboard accessibility.
12. **Built DetailModal greenfield wrapper (Task 12)** — partial-screen modal overlay (max 720px × 80vh) for card expansion in 3E. Props: `title`, `onClose`, `children`. Handles ESC, click-outside, page scroll lock, auto-focus on the close button, and a basic Tab focus trap that cycles within the panel. Backdrop dim via `bg-black/40` matching the existing `ScreeningCompModal` pattern.

### Color rules introduced in Task 10

The unified `DealStatStrip` introduces value-driven semantic coloring on the variable stats:

| Stat | Green (`tone="good"`) | Red (`tone="bad"`) | Default |
|---|---|---|---|
| **Offer%** | `>= 0.90` | `<= 0.80` | otherwise |
| **Gap/sqft** | `> 100` | `<= 70` | otherwise |
| **Trend** | `>= 0.05` (5%/yr) | `<= -0.05` (-5%/yr) | otherwise |
| **ARV / Max Offer** | — | — | bold + slate-900 (highlighted, no semantic color) |
| **Rehab / Target Profit** | — | — | default styling |

Tone helpers (`offerPctTone`, `gapPerSqftTone`, `trendTone`) are private to `deal-stat-strip.tsx`. Both consumers pass raw numbers and the strip applies the tone rules internally.

### Notable design decisions

- **The `variant` prop pattern.** Three components in 3C surface a `variant` prop that preserves divergent visual styles between consumers (`TrendDirectionBadge` compact/prominent, `DealStat` stacked/inline, `DetailModal` is greenfield so no variant). The pattern is: when the divergence is intentional and serves the respective layout, preserve both behind a prop rather than forcing one consumer to visually shift. This worked twice (Tasks 3 and 5) and was rejected once (Task 9 — SubjectTileRow JSX was structurally identical so no variant was needed; Task 10 — Dan called the divergence accidental and chose full unification instead).

- **Data normalization at the prop boundary** (Task 9 SubjectTileRow). Two consumers read from completely different type shapes (`WorkstationData` nested vs `ScreeningCompData` flat) but render the same JSX. The shared component takes pre-formatted display strings; each consumer pre-formats its data with its own helpers (workstation `fmt`/`fmtNum`/`fmtIsoDate`; modal local `$f`/`fmtNum`). The shared component never sees the consumer-specific types. Zero behavioral change in either consumer.

- **Raw numbers at the prop boundary** (Task 10 DealStatStrip). Different design choice for DealStatStrip — the strip needs raw numeric values to compute the tone rules (green/red thresholds), so consumer-side pre-formatting wouldn't work. Instead the strip imports `fmt`/`fmtNum`/`fmtPct` from `@/lib/reports/format` directly and handles all formatting + coloring internally. Each consumer's call site collapses to ~10 lines of structured props with raw numbers from `liveDeal`.

- **Bonus extractions when the spec didn't list them.** `CardTitle` (Task 6) is not in spec §6's explicit component list, but it's used by 11+ cards in the current Workstation and RehabCard depends on it. Lifting it was necessary to cleanly extract RehabCard without duplication. Same intent as the rest of 3C — extracted as part of Task 6 with a clear callout in the commit message.

- **Tile sizing iteration during SubjectTileRow verification** (Task 9). The original `maxWidth: 320` cap on the MLS Info tile combined with `auto` grid columns caused the value column to wrap on properties with `mlsMajorChangeType = "Price Decrease"`. Two-step fix: (1) added `whitespace-nowrap` to the MLS tile container so all child text refuses to wrap, (2) replaced `maxWidth: 320` with `width: max-content` so the tile sizes to its natural content width. The original cap was insufficient once the value column expanded to fit the longer mlsMajorChangeType strings; letting the tile grow to fit content is the cleanest fix.

- **The dead-file deletion bonus** (Task 1). Deleting the legacy `analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` removed one copy of `TrendDirectionBadge`, `TrendTierColumn`, and `CostLine` for free, simplifying the dedupe tasks that followed. 1,548 lines deleted in a single commit.

- **The dropped `useRouter` type dependency** (Task 6 RehabCard). The original RehabCard accepted `router: ReturnType<typeof useRouter>` which forced importing `useRouter` just for the type. The lifted version uses a minimal structural type `RouterLike = { refresh: () => void }` since RehabCard only calls `router.refresh()`. Same runtime behavior, no useless import. Documents the exact contract the component actually depends on.

### Verification

Per §9 of the implementation plan, all checks passed:

**Build verification:**
- `npx tsc --noEmit` passes after every commit

**Existing analyst workflows (the critical part):**
- All cards in the current Workstation render with their CardTitle headers
- Holding / Transaction / Financing / Cash Required cost waterfalls render correctly (CostLine)
- Price Trend card renders correctly (TrendDirectionBadge + TrendTierColumns)
- Rehab section works end-to-end: scope selectors, custom items toggle/add/remove, Save Rehab persists
- SubjectTileRow renders both consumers identically (year built red highlighting, Quick Analysis inputs, Tab handler in workstation only)
- DealStatStrip color thresholds work in both consumers (Offer% / Gap/sqft / Trend green-or-red)
- Modal Rehab pill now responds to Rehab Override input (the bug fix)
- Manual override save still persists
- Notes save and display still works
- Pipeline status save still works
- Generate Report still works
- Mark Complete still works
- ScreeningCompModal opens, comp map and table load, Expand Search and Add Comp by MLS# work end-to-end, Promote/Pass/Reactivate workflows still work, ESC and click-outside still close
- Screening result detail page TrendDirectionBadge renders with prominent variant
- The legacy `/analysis/properties/[id]/analyses/[analysisId]` redirect still works
- No console errors

### File size deltas

| File | Before | After | Change |
|---|---|---|---|
| `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` | 2046 | 1512 | **−534 lines (−26%)** |
| `components/screening/screening-comp-modal.tsx` | 1431 | 1060 | **−371 lines (−26%)** |
| Combined load-bearing UI files | 3477 | 2572 | **−905 lines** |

The 905 lines of inline JSX from the two large files now live as 1688 lines across 11 small focused files in `components/workstation/`. Net repository line count is up because the new files have more whitespace, comments, JSDoc, and prop type declarations than the original inline JSX, but each shared component is independently understandable and reusable.

### Files touched in 3C

**Deleted (1):**
- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` — 1,548 lines of dead code removed (Task 1)

**New shared components (11 in `components/workstation/`):**
- `card-title.tsx` (29 lines) — bonus extraction in Task 6
- `cost-line.tsx` (36 lines) — Task 2
- `trend-badges.tsx` (190 lines) — Tasks 3 + 4 (`TrendDirectionBadge` + `TrendTierColumn` with private `fmtRate` helper)
- `deal-stat.tsx` (93 lines) — Task 5 + extended in Task 10 with `tone` prop
- `rehab-card.tsx` (394 lines) — Task 6
- `expand-search-panel.tsx` (245 lines) — Task 7 (with private `MultiCheckDropdown` helper and option constants)
- `add-comp-by-mls.tsx` (74 lines) — Task 8
- `subject-tile-row.tsx` (255 lines) — Task 9
- `deal-stat-strip.tsx` (126 lines) — Task 10
- `detail-card.tsx` (85 lines) — Task 11 (greenfield, no consumer until 3E)
- `detail-modal.tsx` (161 lines) — Task 12 (greenfield, no consumer until 3E)

**Modified (2 application files + 1 unrelated page + 1 changelog):**
- `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` — strip 13 inline component definitions/helpers, replace with imports from `components/workstation/`
- `components/screening/screening-comp-modal.tsx` — same
- `app/(workspace)/screening/[batchId]/[resultId]/page.tsx` — `TrendDirectionBadge` import update (passes `variant="prominent"`)
- `CHANGELOG.md` — this entry

**Reference docs:**
- `PHASE1_STEP3C_IMPLEMENTATION.md` — implementation plan (drafted before execution, all 6 decisions locked in the planning commit)

**Not modified — by design:**
- Any database migration
- Any business logic, calculation engine, comp loader, server action
- `lib/analysis/load-workstation-data.ts` and the `WorkstationData` type
- `lib/screening/*` engines
- Any route file or `page.tsx`
- Navigation (`components/layout/app-chrome.tsx`)
- The `/home` performance fix (untouched)

### What's deferred to later sub-steps

| Out of scope | Belongs to |
|---|---|
| Wiring `<DetailCard>` and `<DetailModal>` into actual cards | 3E |
| Building the new Workstation card layout per `WORKSTATION_CARD_SPEC.md` | 3E |
| Per-card modal components (`<ArvCardModal>`, `<RehabCardModal>`, etc.) | 3E |
| Auto-persist infrastructure (`useDebouncedSave`, `<SaveStatusDot>`) | 3D |
| Building `<CompWorkspace>` (the modal hero — map + table + tab bar + filter chips) | 3E.5 (deferred from 3C per Decision 5.4 hybrid) |
| Removing the current `AnalysisWorkstation` file at `deals/watchlist/[analysisId]/analysis-workstation.tsx` | 3F |
| Cleanup of dead `/comparables` sub-route link in `admin/properties/[id]/page.tsx` and dead sub-tab links in `AnalysisWorkspaceNav` | 3E or 3F |

### What 3D and 3E build on top

**3D (Auto-persist infrastructure)** is independent of 3C and could land in parallel. It builds `useDebouncedSave`, `<SaveStatusDot>`, and the per-field server action wrapper. 3D's components do NOT depend on 3C's components; they touch different parts of the stack.

**3E (New Workstation card layout)** is the consumer of everything 3C built. 3E.1 builds the Workstation header and the orchestrating page, importing components from `components/workstation/`. 3E.2-3E.4 build the top tile row using `<SubjectTileRow>` and `<DealStatStrip>`. 3E.5 builds the hero by extracting `<CompWorkspace>` from the modal (the deferred extraction per Decision 5.4 hybrid). 3E.6 builds the right column using `<DetailCard>`. 3E.7 builds the per-card modals using `<DetailModal>`. Without 3C, 3E would have to do all of this work itself; with 3C, 3E becomes a "compose existing pieces" task with clean prop interfaces already designed.

---

## 2026-04-11 — Phase 1 Step 3B — Route Restructure

Second sub-step of the Step 3 milestone. Mechanical-only: moves the canonical Watch List route to `/analysis`, the canonical Workstation route to `/analysis/[analysisId]`, and combines the legacy Pipeline + Closed Deals pages into a single `/action` route that dispatches on `?status=active|closed`. Mirrors the canonical `Intake → Screening → Analysis → Action` deal flow that drives the rest of Phase 1.

**Side-by-side rollout per Decision 6.6.** Both old and new URLs render the same UI throughout 3B-3E via thin re-export wrappers — `/deals/watchlist`, `/deals/watchlist/[id]`, `/deals/pipeline`, and `/deals/closed` continue to work as bookmark targets but are no longer surfaced in nav. In 3F the wrappers become hard `redirect()` calls.

**Zero new schema, zero database changes, zero business-logic changes.** The Workstation client component itself was not touched — both new and old routes import the same `analysis-workstation.tsx` file. The 3E sub-step will diverge them by swapping the new route's import to a fresh component file, leaving the legacy wrapper untouched.

### Goals accomplished

1. **Canonical `/analysis` Watch List route** — replaces the previous stub redirect that sent `/analysis` to `/home`. New route imports the same `WatchListTable` the legacy `/deals/watchlist` page uses; the legacy file becomes a one-line `export { default } from "@/app/(workspace)/analysis/page"` re-export. Single source of truth, both URLs work.
2. **Canonical `/analysis/[analysisId]` Workstation route** — new directory + page that loads `WorkstationData` and renders `AnalysisWorkstation` from the legacy path via absolute import. Legacy `/deals/watchlist/[analysisId]/page.tsx` becomes a thin re-export wrapper. Both URLs render identical Workstation UI.
3. **Canonical `/action` route with `?status=` dispatch** — combines the legacy `PipelineSection` (active deals) and `ClosedDealsSection` into a single page that switches between two server-component branches based on `searchParams.status`. Default is `active` (Pipeline view); `?status=closed` shows the Closed Deals view. Both branches preserve the existing data shape, queries, and tables.
4. **Legacy Pipeline and Closed wrappers** — `/deals/pipeline/page.tsx` is now `export { default } from "@/app/(workspace)/action/page"` (no query → defaults to active). `/deals/closed/page.tsx` is a tiny wrapper that hard-codes `?status=closed` via `Promise.resolve({ status: "closed" })` and delegates to the canonical page.
5. **Two legacy `/analysis/*` redirect targets updated** — `analysis/analyses/page.tsx` and `analysis/properties/[id]/analyses/[analysisId]/page.tsx` previously chained through `/deals/watchlist` to reach the canonical Workstation. Now they redirect directly to `/analysis` and `/analysis/[id]` respectively, collapsing the redirect chain.
6. **Navigation rebuild in `app-chrome.tsx`** — primary nav now reads `Home | Intake | Screening | Analysis | Action | Reports | Admin`. The `Deals` entry is **removed** per Decision 5.3. Two new section configs (Analysis with Watch List tab, Action with Pipeline + Closed tabs). Page label entries updated. The Action section's Pipeline / Closed tabs disambiguate by query string via a per-tab `isActive(pathname, searchParams)` callback wired through `useSearchParams()`.
7. **Internal link sweep** — every `Link href="/deals/watchlist/..."`, `redirect("/deals/...")`, and per-id `revalidatePath` call across the codebase updated to point at the new canonical paths. 14 application files touched. Bare-path `revalidatePath("/deals/watchlist")` calls keep the legacy path AND add the new `/analysis` path so both routes get refreshed during the side-by-side period (per spec §5.7); the same pattern applies to `/deals/pipeline` ↔ `/action`.
8. **Sign-out button** — small UX gap discovered during Task 7 verification. Added a `signOutAction` server action in `app/auth/actions.ts` that calls `supabase.auth.signOut()` and redirects to `/auth/sign-in`, plus a Sign Out button in the header next to the Denver MVP badge. Slipped into Task 8 alongside the CHANGELOG.

### Side-by-side rollout pattern (the design that makes 3B safe)

The pattern that lets 3B ship cleanly without any UI duplication or risk of divergence:

| File | 3B treatment |
|---|---|
| `app/(workspace)/analysis/page.tsx` | NEW canonical implementation |
| `app/(workspace)/deals/watchlist/page.tsx` | `export { default } from "@/app/(workspace)/analysis/page"` |
| `app/(workspace)/analysis/[analysisId]/page.tsx` | NEW canonical implementation (imports `AnalysisWorkstation` from old path) |
| `app/(workspace)/deals/watchlist/[analysisId]/page.tsx` | `export { default } from "@/app/(workspace)/analysis/[analysisId]/page"` |
| `app/(workspace)/action/page.tsx` | NEW canonical with `?status=` dispatch |
| `app/(workspace)/deals/pipeline/page.tsx` | `export { default } from "@/app/(workspace)/action/page"` |
| `app/(workspace)/deals/closed/page.tsx` | Async wrapper that calls `ActionPage({ searchParams: Promise.resolve({ status: "closed" }) })` |

Both URLs in each pair render the SAME default export. Zero code duplication, single source of truth, both routes work as bookmarks. In 3E when the new Workstation card layout ships, only the canonical `/analysis/[analysisId]/page.tsx` swaps its component import — the legacy wrapper continues importing the old component file untouched. The two routes diverge naturally without a single line of duplicated maintenance.

In 3F the wrappers all become `redirect()` calls and the legacy directory is deleted.

### Bonus interlude fix — `import_batch_rows` status index

Committed between 3A and 3B (`fa1ee21`) to unblock a separate `/intake/imports` page failure: under resource contention the `import_batch_progress_v` view was hitting `statement_timeout` (`canceling statement due to statement timeout`) because the existing single-column index `ix_import_batch_rows_import_batch_id` only covered the JOIN key, forcing 73,267 heap fetches per page load to evaluate the `FILTER (WHERE processing_status = ...)` predicates.

Fix: composite btree index `ix_import_batch_rows_batch_id_status` on `(import_batch_id, processing_status)` enables an index-only scan because both the JOIN key AND the FILTER column are present in the index. Result: ~178x speedup, view runtime drops from "timeout" to ~45ms with `Heap Fetches: 134/73,401`. Zero query plan disruption (the old index is still useful for queries that look up rows by `batch_id` without status filtering). ~5-10 MB additional disk footprint.

This was the same flavor of issue as the screening queue ghost-entries fix between Step 2 and Step 3 — both surfaced as latent slow queries crossing a threshold under load. Pattern documented in the migration file's header comment block.

### Application code changes

**Phase A — three new canonical routes (Tasks 1-3):**
- `app/(workspace)/analysis/page.tsx` — canonical Watch List (replaces stub redirect to `/home`)
- `app/(workspace)/analysis/[analysisId]/page.tsx` — canonical Workstation (NEW directory)
- `app/(workspace)/action/page.tsx` — canonical Action with `PipelineSection` + `ClosedDealsSection` server-component branches dispatched on `?status=` (NEW directory)
- `app/(workspace)/deals/watchlist/page.tsx`, `app/(workspace)/deals/watchlist/[analysisId]/page.tsx`, `app/(workspace)/deals/pipeline/page.tsx`, `app/(workspace)/deals/closed/page.tsx` — all converted to thin re-export or async-wrapper form

**Phase B — legacy redirect targets + nav (Tasks 4-5):**
- `app/(workspace)/analysis/analyses/page.tsx` — `redirect("/deals/watchlist")` → `redirect("/analysis")`
- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/page.tsx` — `redirect(\`/deals/watchlist/${id}\`)` → `redirect(\`/analysis/${id}\`)`
- `components/layout/app-chrome.tsx` — `primaryNav` reorder (Deals removed, Analysis + Action added between Screening and Reports), new section configs for `/analysis` and `/action`, new page label resolution including `?status=` awareness for Action, new `isActive` callback on `SectionTab` for query-param-driven tab matching, `useSearchParams()` wired into the AppChrome render

**Phase C — internal link sweep (Task 6, 14 files):**
- 4 component files (`screening/screening-comp-modal.tsx`, `screening/queue-results-table.tsx`, `screening/batch-results-table.tsx`, `properties/analysis-workspace-nav.tsx`)
- 4 page/table files (`deals/watchlist/watch-list-table.tsx`, `deals/pipeline/pipeline-table.tsx`, `screening/[batchId]/[resultId]/page.tsx`, `admin/properties/[id]/page.tsx`, `home/page.tsx`)
- 4 server-action files (`screening/actions.ts`, `analysis/properties/actions.ts`, `deals/watchlist/actions.ts`, `deals/pipeline/actions.ts`)
- 1 substring sweep (`deals/actions.ts`) — 12+ redirect and revalidatePath calls migrated via `/deals/watchlist/` → `/analysis/`
- 1 parent redirect (`deals/page.tsx`) — `redirect("/deals/watchlist")` → `redirect("/analysis")`

**Phase D — verification + sign-out polish (Tasks 7-8):**
- `app/auth/actions.ts` — NEW `signOutAction` server action
- `components/layout/app-chrome.tsx` — Sign Out button in header

### Notable design decisions

- **`useSearchParams` for query-param tab matching.** The Action section's Pipeline / Closed tabs share the `/action` pathname and disambiguate via `?status=`. Default `isTabActive(pathname, href, exact?)` couldn't handle this because pathname-only matching can't tell the two tabs apart. Added an optional `isActive(pathname, searchParams)` callback to the `SectionTab` type and wired `useSearchParams()` into `AppChrome`. Safe to use here because `app/(workspace)/layout.tsx` is already async/dynamic (auth check), so `useSearchParams` doesn't dynamicize any otherwise-static routes.

- **Async wrapper pattern for `/deals/closed`.** Unlike the watchlist and pipeline wrappers which are straight `export { default } from ...` re-exports, the closed-deals wrapper has to inject `?status=closed` because the canonical page defaults to active. Solved with a 4-line async wrapper that calls `ActionPage({ searchParams: Promise.resolve({ status: "closed" }) })`. Functionally identical to the re-export pattern but accommodates the parameter difference.

- **Per-id `revalidatePath` calls in `deals/actions.ts` use substring replacement instead of keep-both.** The spec §5.7 "keep old + add new" pattern was followed for bare-path `revalidatePath("/deals/watchlist")` calls (small number, easy to add sibling lines), but `deals/actions.ts` had 12+ per-id calls in mixed indentation styles plus pre-existing duplicate calls (lines 503-506, 557-560 already revalidate the same URL twice from a previous edit). A literal substring replacement (`/deals/watchlist/` → `/analysis/`) achieved the goal cleanly without amplifying the existing duplication. Functionally equivalent because both pages are `force-dynamic` and never cache server-side.

- **`Deals` removed from nav immediately, not deferred to 3F.** Decision 5.3. Stronger commitment to the new structure. Old routes still work as bookmarks via the wrapper pattern but disappear from primary nav and section configs. Analysts adjust to the new layout immediately.

- **Workstation client component stays at the legacy path during 3B.** Both new and old routes import `AnalysisWorkstation` from `@/app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation`. 3E creates a NEW Workstation component file at the new path; the new page swaps its import to it; the legacy wrapper continues importing the old file. Clean divergence with zero risk during 3B.

- **`AnalysisWorkspaceNav` base URL updated despite generating dead links.** This component constructs tab links to `/comparables`, `/rehab-budget`, etc. sub-routes that don't exist under either `/deals/watchlist/[id]` OR `/analysis/[id]`. The nav is essentially broken sub-tab navigation from an earlier reorganization. For Task 6 the safe minimal change was to swap the base URL to match the new convention; cleanup of the dead links is deferred to 3E or 3F.

### Verification

Per §8 of the implementation plan, all checks passed:

**Build verification:**
- `npx tsc --noEmit` passes after every task's edits

**Side-by-side route parity (both URLs render identical UI):**
- `/analysis` and `/deals/watchlist` both load the Watch List
- `/analysis/[id]` and `/deals/watchlist/[id]` both load the Workstation
- `/action` and `/deals/pipeline` both load the active Pipeline
- `/action?status=closed` and `/deals/closed` both load Closed Deals

**Navigation:**
- Primary nav reads `Home | Intake | Screening | Analysis | Action | Reports | Admin` — Deals removed
- Section subheader for `/analysis` shows "Analysis / Watch List"; for `/action` flips between "Action / Pipeline" and "Action / Closed" based on `?status=`
- Pipeline tab highlights when on `/action` (no query); Closed tab highlights when on `/action?status=closed` (per-tab `isActive` callback working as designed)

**Internal links:**
- Watch List row click → `/analysis/[id]`
- Pipeline row click → `/analysis/[id]`
- Promoting from screening modal → lands on `/analysis/[id]`
- Closed Deals empty-state Pipeline link → navigates to `/action`
- Pipeline empty-state Watch List link → navigates to `/analysis`
- Home dashboard glance cards and section links all updated
- `/deals` parent redirect → `/analysis`

**Mutating workflows (regression check on the actions.ts files):**
- Sign in / sign out works (Sign Out button verified)
- Manual override save persists correctly
- Notes add / display works
- Pipeline status save works
- Move to Pipeline transitions deal correctly
- Promote from screening lands on the new Workstation
- Generate Report works
- No console errors

**Existing analyst workflows unchanged:**
- All read paths load (`/home`, `/screening`, `/intake/imports`, Workstation, comp map, `/admin/properties`, `/reports`)
- No console errors
- No 401/403, no obvious performance regression from 3B changes

### Known issues surfaced (NOT 3B regressions, deferred to follow-up items)

- **`/home` page is slow (~17 seconds on cold load).** Server-side timing shows `application-code: 16.8s`. Pre-existing performance issue — Task 6 only changed Link href values in `home/page.tsx`, not data fetching. Same flavor as the `import_batch_progress_v` timeout fix from earlier this session. Will eventually cross the 8s API timeout under load and start 500ing. **Investigation queued as the next item after this entry ships** — likely a missing index on one of the dashboard aggregations (`pipeline_v`, `watch_list_v`, unreviewed primes count, daily activity).
- **Image aspect-ratio warning** on the DataWise logo. Cosmetic Next.js Image complaint. Lowest priority — easy one-line fix.
- **No search-by-address or sort-by-completed-analysis on `/admin/properties`.** Surfaced during Task 7 verification; without these affordances it's hard to find a property that has analyses. Skipped Workstation parity test #6 because of this. To be addressed in 3E or 3F as a properties-list UX item.
- **Pre-existing duplicate `revalidatePath` calls in `deals/actions.ts`** (lines 503-506, 557-560 revalidate the same URL twice). Out of scope for Task 6's link-update pass; safe to leave; can be cleaned up opportunistically when a future task touches those functions.

### What's deferred to later sub-steps

| Out of scope | Belongs to |
|---|---|
| Component extraction (`<CompWorkspace>`, `<DetailCard>`, etc.) | 3C |
| Auto-persist infrastructure (`useDebouncedSave`, `<SaveStatusDot>`, generic field action) | 3D |
| Building the new Workstation card layout per `WORKSTATION_CARD_SPEC.md` | 3E |
| Deleting `app/(workspace)/deals/*` and converting wrappers to hard `redirect()` calls | 3F |
| Cleanup of dead `/comparables` sub-route link in `admin/properties/[id]/page.tsx` and dead sub-tab links in `AnalysisWorkspaceNav` | 3E or 3F |
| `/home` performance investigation | Next item after 3B |
| `/admin/properties` search/filter/sort UX | 3E or later |

### Files touched in 3B

**New (4):**
- `app/(workspace)/analysis/[analysisId]/page.tsx`
- `app/(workspace)/action/page.tsx`
- `app/auth/actions.ts`
- `supabase/migrations/20260411090200_import_batch_rows_status_index.sql` (bonus interlude, committed before Task 1)

**Modified — canonical implementations (1):**
- `app/(workspace)/analysis/page.tsx` — replaced stub redirect with full Watch List page

**Modified — legacy wrappers (4):**
- `app/(workspace)/deals/watchlist/page.tsx`
- `app/(workspace)/deals/watchlist/[analysisId]/page.tsx`
- `app/(workspace)/deals/pipeline/page.tsx`
- `app/(workspace)/deals/closed/page.tsx`

**Modified — legacy redirect targets (3):**
- `app/(workspace)/deals/page.tsx`
- `app/(workspace)/analysis/analyses/page.tsx`
- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/page.tsx`

**Modified — navigation (1):**
- `components/layout/app-chrome.tsx`

**Modified — internal link sweep (14):**
- `components/screening/screening-comp-modal.tsx`
- `components/screening/queue-results-table.tsx`
- `components/screening/batch-results-table.tsx`
- `components/properties/analysis-workspace-nav.tsx`
- `app/(workspace)/deals/watchlist/watch-list-table.tsx`
- `app/(workspace)/deals/pipeline/pipeline-table.tsx`
- `app/(workspace)/screening/[batchId]/[resultId]/page.tsx`
- `app/(workspace)/admin/properties/[id]/page.tsx`
- `app/(workspace)/home/page.tsx`
- `app/(workspace)/screening/actions.ts`
- `app/(workspace)/analysis/properties/actions.ts`
- `app/(workspace)/deals/watchlist/actions.ts`
- `app/(workspace)/deals/pipeline/actions.ts`
- `app/(workspace)/deals/actions.ts`

**Reference docs:**
- `PHASE1_STEP3B_IMPLEMENTATION.md` — implementation plan (drafted before execution)
- `CHANGELOG.md` — this entry

### What 3C builds on top

3C (Component Extraction) is the next sub-step. Pulls shared components out of `ScreeningCompModal` and the current Workstation so the new Workstation in 3E can reuse them. 3C doesn't depend on 3B in any blocking way, but doing 3B first means the new `/analysis/[analysisId]` route is already live and 3E can build the new Workstation directly into it.

---

## 2026-04-11 — Phase 1 Step 3A — Schema Preparation

First sub-step of the Step 3 route restructure + Workstation rebuild milestone. Applies all schema and data-model changes the new Workstation card layout will need, in isolation, before any UI work begins. Includes the SECURITY DEFINER function audit deferred from Step 2.

**This is purely additive — no UI changes, no route changes, no application behavior changes for the existing analyst.** The new fields and types are added but not yet consumed; they become load-bearing in 3E when the new Workstation cards are built.

### Goals accomplished

1. **Notes visibility model** — replaced the binary `is_public` boolean with a three-tier `visibility` enum (`internal` / `specific_partners` / `all_partners`) per `WORKSTATION_CARD_SPEC.md` Decision 8. Added the `visible_to_partner_ids` array column for the curated partner subset. Renamed the `'internal'` note category to `'workflow'` per Decision 8a. The old `is_public` column stays in place as a safety net through Step 3 — gets dropped in 3F.
2. **`manual_analysis.next_step` column** — new free-form text column for the Quick Status tile (Tile 4) that ships in 3E. Starter option set lives in application code, not as a CHECK constraint, so the list can evolve without migrations.
3. **Transaction engine 6-line restructure** — rewrote `transaction-engine.ts` to compute the 6-line breakdown from Decision 5 (Acquisition Title / Commission / Fee + Disposition Title / Commission Buyer / Commission Seller). New defaults preserve the prior 4.77% combined rate exactly (`0.003 + 0 + 0 + 0.0047 + 0.02 + 0.02 = 0.0477`), so existing `screening_results.transaction_total` values remain valid — no recompute or backfill needed. The deprecated `dispositionCommissions` field stays as a backwards-compat shim (computed as `buyer + seller`) so existing consumers don't break.
4. **Cash Required schema extension** — cascaded the Decision 5 transaction restructure into the `cashRequired` calculation. Added `acquisitionCommission` (signed) and `acquisitionFee` (flat) line items. Emitted two new derived subtotals (`acquisitionSubtotal`, `carrySubtotal`) per `WORKSTATION_CARD_SPEC.md` §5.5. Existing `totalCashRequired` values are preserved unchanged because the new line items default to 0.
5. **Bed/bath level fields in `WorkstationData.physical`** — exposed `property_physical`'s level-specific bed/bath columns (`main_level_*`, `upper_level_*`, `lower_level_*`, `basement_level_*`) through the workstation type. The new Property Physical tile mini-grid in 3E will read these to render the spec's 4-column grid (`Tot | Main | Up | Lo`). Used a NULL-safe sum helper to collapse `lower_level_*` and `basement_level_*` into a single `Lo` value.
6. **SECURITY DEFINER function audit** (deferred from Step 2 per Decision 12.2) — ran the audit query, found exactly one non-whitelisted function (`rls_auto_enable`), investigated it via two follow-up queries (function body + event trigger wiring), and verified it as a defense-in-depth event trigger that auto-enables RLS on newly-created tables in the `public` schema. **No fix needed** — added to the audit whitelist for future runs.

### Schema migrations (2 total — third was conditional on audit findings, not needed)

**1. `20260411090000_step3a_notes_visibility_model.sql`** — adds `visibility` enum column with `CHECK (visibility IN ('internal', 'specific_partners', 'all_partners'))`, adds `visible_to_partner_ids uuid[]`, backfills `visibility` from `is_public` (`true → 'all_partners'`, `false → 'internal'`), marks `is_public` as deprecated via `COMMENT`, and renames `note_type = 'internal'` rows to `'workflow'`.

   **DEFAULT 'all_partners' (not 'internal')** — intentional. The eventual target per the spec is for new notes to default to `'internal'`, but during the transition window (3A → 3E) the existing `addAnalysisNoteAction` only writes the OLD `is_public` column (which has `DEFAULT true = public`). Setting the new column's default to `'internal'` would create inconsistent rows for any note created via the existing code path during the transition. Setting it to `'all_partners'` keeps the two columns in sync. 3E will:
   - Re-sync `visibility` from `is_public` for any drifted rows
   - `ALTER COLUMN visibility SET DEFAULT 'internal'` to match the spec
   - Ship the new Notes card that writes `visibility` directly

**2. `20260411090100_step3a_next_step_column.sql`** — single `ALTER TABLE manual_analysis ADD COLUMN next_step text` (nullable, no DEFAULT, no CHECK). Storage target for the Quick Status tile.

### Application code (3 workstreams, all TypeScript-only)

**Transaction engine restructure** (`lib/screening/types.ts`, `lib/screening/strategy-profiles.ts`, `lib/screening/transaction-engine.ts`, `lib/reports/types.ts`):

- `TransactionResult` and `TransactionDetail` types expanded with 6 new fields + 2 derived subtotals (`acquisitionTitle`, `acquisitionCommission`, `acquisitionFee`, `acquisitionSubtotal`, `dispositionTitle`, `dispositionCommissionBuyer`, `dispositionCommissionSeller`, `dispositionSubtotal`)
- Old `dispositionCommissions` field kept as deprecated backwards-compat shim, computed as `buyer + seller`. Removed in 3F.
- `TransactionConfig` expanded with 6 new rates; `DENVER_FLIP_V1.transaction` defaults updated. Old `dispositionCommissionRate` kept as optional deprecated field.
- `transaction-engine.ts` `calculateTransaction()` rewritten to compute the 6-line breakdown. Returns the deprecated shim alongside the new fields.
- **Math preservation property:** new defaults (`0.003 + 0 + 0 + 0.0047 + 0.02 + 0.02 = 0.0477`) produce the same total as old (`0.003 + 0.0047 + 0.04 = 0.0477`). Verified by running the existing Workstation against existing data — Trans waterfall line shows unchanged values.

**Cash Required schema extension** (`lib/reports/types.ts`, `lib/analysis/load-workstation-data.ts`):

- `WorkstationData.cashRequired` type extended with 4 new fields: `acquisitionCommission` (signed), `acquisitionFee`, `acquisitionSubtotal` (derived), `carrySubtotal` (derived)
- Computation in `load-workstation-data.ts` reads `acquisitionCommission` and `acquisitionFee` from the transaction result, computes the two subtotals explicitly
- Math preservation: when `acquisitionCommission = 0` and `acquisitionFee = 0` (DENVER_FLIP_V1 defaults), the new `totalCashRequired` is mathematically identical to the old per-line sum
- Signed acquisition commission handled via plain `+` (negative reduces total naturally)

**Bed/bath level fields** (`lib/reports/types.ts`, `lib/analysis/load-workstation-data.ts`):

- `WorkstationData.physical` extended with 6 new nullable fields: `bedroomsMain`, `bedroomsUpper`, `bedroomsLower`, `bathroomsMain`, `bathroomsUpper`, `bathroomsLower`
- New helper `sumNullSafe(a, b)` for NULL-safe addition (both null → null; one null → the other; both set → sum)
- `property_physical` SELECT extended with 8 new column references (main / upper / lower / basement bed/bath columns)
- `bedroomsLower` and `bathroomsLower` collapse `lower_level_*` and `basement_level_*` into a single value via `sumNullSafe` so the spec's 4-column grid (`Tot | Main | Up | Lo`) renders correctly

### SECURITY DEFINER audit results

The audit query found exactly one non-whitelisted SECURITY DEFINER function in the `public` schema:

**`rls_auto_enable`** — a Postgres event trigger function (`RETURNS event_trigger`) wired up as event trigger `ensure_rls` on `ddl_command_end`, filtered to `CREATE TABLE / CREATE TABLE AS / SELECT INTO`. Iterates `pg_event_trigger_ddl_commands()` and runs `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on every newly-created table in the `public` schema (system schemas explicitly excluded). Has proper error handling, sets `search_path = pg_catalog` for hardening, and does not read or write any user data.

**Verdict: SAFE — defense-in-depth feature, not a security risk.** This function actually helped us during Steps 1 and 2: every time we created a new table (`organizations`, `profiles`), this event trigger auto-enabled RLS on it. Our migrations' explicit `ENABLE ROW LEVEL SECURITY` calls were redundant no-ops.

**Treatment:** Added to the audit whitelist (`PHASE1_STEP3A_IMPLEMENTATION.md` §6 — joining `handle_new_auth_user`, `current_user_organization_id`, `set_updated_at`). No fix migration required.

**Note for future reproducibility:** `rls_auto_enable` is installed in the production database but **not in our migration history**. It was installed either by Supabase automatically or via direct SQL at some point in the past. If we ever rebuild from migrations from scratch, this function wouldn't be recreated. Capturing it in a migration is a separate concern (out of scope for 3A) — flagging here for awareness.

### Notable design decisions

- **Backwards-compat shim pattern.** Both `TransactionResult` and `TransactionDetail` keep the old `dispositionCommissions` field as a deprecated backwards-compat field (computed as `buyer + seller`). This means **zero consumer changes** in 3A — every existing read of `transaction.dispositionCommissions` continues to work. New consumers in 3E read the buyer/seller fields directly. The shim is removed in 3F when the existing Workstation is fully retired.

- **DEFAULT 'all_partners' vs 'internal'.** Setting the new `visibility` column's DEFAULT to `'all_partners'` instead of the spec's eventual `'internal'` was a deliberate transition-period choice to keep `is_public` and `visibility` in sync for any notes created via the existing form before 3E ships. Documented in §5 of the changelog entry above and in the migration file's header comment.

- **Math preservation property.** Both Task 5 (transaction engine) and Task 6 (cashRequired) were designed so that under DENVER_FLIP_V1 defaults, the new computations produce **the exact same totals** as the old computations. This means existing `screening_results.transaction_total` values stay valid (no recompute needed) and the existing Workstation continues to render the same numbers in the Deal Math waterfall and Cash Required panel.

- **NULL-safe collapse for the bed/bath grid.** The spec's 4-column grid collapses `property_physical.lower_level_*` and `basement_level_*` into a single "Lo" value. The new `sumNullSafe` helper handles all four NULL combinations cleanly, which is important because real-world properties have varied configurations (a finished basement with no separate "lower" level vs a property with both vs one with neither).

- **Defense-in-depth pattern recovered: stale `.next` cache.** Mid-task during the Task 5 verification, I deleted the `.next` directory while Dan's dev server was running. This corrupted Turbopack's persistent cache and caused 500 errors on every workspace route. Recovered in 30 seconds by stopping the dev server, deleting `.next` cleanly, and restarting. Standing rule added: never delete `.next` while the dev server is running. (This was the same failure mode documented in `CLAUDE.md` Phase 3 §21.2 — should have been anticipated.)

### Verification

Per §9 of the implementation plan:

**Schema verification (database):**
- `analysis_notes.visibility` and `visible_to_partner_ids` columns exist with correct types and constraints
- Backfill cross-check: all 15 existing notes had `is_public = true`, all 15 now have `visibility = 'all_partners'` (consistent)
- `manual_analysis.next_step` column exists, nullable, no constraints
- All Step 3A migrations recorded in `supabase_migrations.schema_migrations`

**Type verification:** `npx tsc --noEmit` passes with zero errors after every code change

**Existing analyst workflow regression check (the critical part):**
- Sign in works
- `/home`, `/screening`, `/intake/imports`, `/deals/watchlist` all load
- Workstation renders fully with no missing sections
- Deal Math waterfall shows unchanged values (Trans line in particular)
- Cash Required panel shows unchanged total
- Notes section displays correctly
- Pipeline status save works
- Manual override save via Overrides form works
- Comp map renders, comp table shows selected comps
- No console errors

### What's deferred to later sub-steps

| Out of scope | Belongs to |
|---|---|
| Any UI changes (the new fields are added but not yet consumed) | 3E |
| Route restructure (`/deals/watchlist` → `/analysis`) | 3B |
| Component extraction from ScreeningCompModal and current Workstation | 3C |
| Auto-persist infrastructure (`useDebouncedSave`, `<SaveStatusDot>`, generic field action) | 3D |
| Building the actual new Workstation cards | 3E |
| Removing `analysis_notes.is_public` column | 3F |
| Removing the `dispositionCommissions` deprecated shim from `TransactionResult`/`TransactionDetail` | 3F |
| Re-syncing `visibility` from `is_public` for any drifted rows + changing DEFAULT to `'internal'` | 3E (when the new Notes card ships) |

### Files touched in 3A

**New (2):**
- `supabase/migrations/20260411090000_step3a_notes_visibility_model.sql`
- `supabase/migrations/20260411090100_step3a_next_step_column.sql`

**Modified (4):**
- `lib/screening/types.ts` — `TransactionResult` type expansion
- `lib/screening/strategy-profiles.ts` — `TransactionConfig` type + `DENVER_FLIP_V1` defaults
- `lib/screening/transaction-engine.ts` — `calculateTransaction` rewrite
- `lib/reports/types.ts` — `TransactionDetail` + `cashRequired` + `physical` type extensions
- `lib/analysis/load-workstation-data.ts` — `cashRequired` calc, `physical` shaping, `sumNullSafe` helper, extended `property_physical` SELECT

**Reference docs updated:**
- `PHASE1_STEP3A_IMPLEMENTATION.md` — audit findings recorded in §6.5; migration §4.1 updated with corrected DEFAULT rationale; Task 1 marked complete

**Not modified — by design:**
- Any UI component
- Any route or page file
- Existing analyst workflows (current Workstation, ScreeningCompModal, etc.)
- `app/(workspace)/layout.tsx` (auth check stays until 3F)

### What 3B builds on top

3B (Route Restructure) is the next sub-step. Mechanical file moves with legacy redirects. No direct dependencies on 3A — but 3B will benefit from 3A being done first because the schema and data layer are now ready for the new Workstation. When 3E starts building the new card layout, all the needed fields are present in `WorkstationData`.

---

## 2026-04-10 — Phase 1 Step 2 — RLS Scaffolding

Second milestone of the Phase 5 restructure. Converts all 22 core tables from the temporary "dev authenticated full access" RLS policies to proper organization-scoped policies built on top of the Step 1 auth/profiles foundation. **Zero application code changes.**

### Goals accomplished

1. **Helper function** `public.current_user_organization_id()` — returns the authenticated user's org id from their profile row. `STABLE` + `SECURITY DEFINER` + `SET search_path = public` for performance and hardening. Used by every RLS policy and by every `organization_id` column DEFAULT.
2. **`organization_id` column on all 22 core tables** — added nullable, backfilled to DataWiseRE, then constrained to `NOT NULL` + `FK to organizations ON DELETE RESTRICT` + `DEFAULT public.current_user_organization_id()` + dedicated btree index.
3. **88 new org-scoped RLS policies** — four per table (SELECT / INSERT / UPDATE / DELETE), each filtering by `organization_id = current_user_organization_id()`. All 22 "dev authenticated full access" policies dropped (including the 3 legacy valuation-named policies still attached to the renamed comparable tables).
4. **All 13 views recreated with `security_invoker = true`** — views now respect the calling user's RLS policies instead of bypassing them via the view owner's privileges. Metadata-only change via `ALTER VIEW ... SET`, no view definition rewrites.
5. **Zero application code changes.** The `DEFAULT current_user_organization_id()` clause on every table means existing `INSERT` statements auto-populate `organization_id` from the calling user's profile. No screening engine, comp loader, analysis action, or server action needed to be touched.

### Schema (Phase A) — five migrations

**1. `20260410130000_step2_helper_and_columns.sql`** — Creates `current_user_organization_id()` and adds a nullable `organization_id uuid` column to all 22 core tables. Pure additive. Dev policies still in effect, no behavioral change.

**2. `20260410130100_step2_backfill_organization_id.sql`** — Populates `organization_id` = DataWiseRE's id on every existing row across all 22 tables. Original version wrapped all 22 UPDATEs in a single `DO $$` block and **timed out** (`SQLSTATE 57014`) because Postgres treats a DO block as one statement and the cumulative wall time on ~1.27M rows exceeded `statement_timeout`. Rewritten to use individual top-level `UPDATE` statements, each getting its own statement timeout window. Post-apply verification: `null_count = 0` on all 22 tables.

**3. `20260410130200_step2_constrain_organization_id.sql`** — `ALTER COLUMN ... SET NOT NULL` + `SET DEFAULT public.current_user_organization_id()` + `ADD FOREIGN KEY ... REFERENCES organizations ON DELETE RESTRICT` + `CREATE INDEX IF NOT EXISTS ..._organization_id_idx` on all 22 tables. Ran in well under the expected 1-3 minute window. Total new index footprint: ~50-100 MB.

**4. `20260410130300_step2_switch_policies_to_org_scoped.sql`** — **The policy switch.** Wrapped in explicit `BEGIN` / `COMMIT` for atomicity (supabase CLI doesn't wrap migrations in transactions by default). Drops 22 dev policies + 3 legacy valuation-named drops. Creates 88 new org-scoped policies. Three expected `NOTICE` messages confirmed the legacy policy naming: the comparable tables' dev policies were named after the pre-rename `valuation_*` names, so the `comparable_*` DROP POLICY IF EXISTS calls were harmless no-ops.

**5. `20260410130400_step2_views_security_invoker.sql`** — `ALTER VIEW ... SET (security_invoker = true)` on all 13 views. Metadata-only, sub-second runtime.

### Notable incidents

**Statement timeout on the backfill.** First version of Migration 2 wrapped all 22 UPDATEs in a `DO $$ ... $$;` block, which Postgres executed as a single statement under one `statement_timeout`. The real data scale was much larger than I'd estimated (737k rows in `comparable_search_candidates`, ~1.27M rows total), so the migration exceeded the timeout and rolled back. Fix: split into individual top-level UPDATE statements. **Lesson captured in the commit message and in the migration file comment block** so future-us doesn't repeat this pattern on bulk-update migrations.

**Supabase disk exhaustion cooldown.** The backfill migration's MVCC dead-row overhead pushed the project's disk usage to 97.6% of the 8 GB Pro plan quota and triggered a 4-hour auto-scale cooldown. During the cooldown the project went into a partially read-only state and the Supabase CLI started failing with `25006 cannot execute GRANT ROLE in a read-only transaction`. Resolved by waiting out the cooldown, after which Supabase auto-scaled the disk to 12 GB. **Post-incident: spend cap removed to prevent future throttling during bulk operations**, and a comprehensive reference document (`SUPABASE_USAGE_CONSIDERATIONS.md`) was created capturing the data scale baseline, over-usage pricing math, compute tier comparison, early warning signs, and incident recovery playbook.

**User-error gotcha during verification.** While walking through the §8.2 verification checklist, Dan initially reported that the "manual override" save was silently failing. Investigation revealed the test was using the current Workstation's **Quick Analysis tile** (which is a local-only what-if scratchpad in the pre-Decision-2 design) instead of the **Overrides form** (which has a Save button and actually persists to `manual_analysis`). Save via the Overrides form worked correctly under the new RLS. The Quick Analysis / Overrides ambiguity is exactly the UX trap that Decision 2 in `WORKSTATION_CARD_SPEC.md` resolves by consolidating all persistent overrides into a single auto-persist tile in the new design. Step 3 will ship that consolidation.

### Notable design decisions

- **The `DEFAULT current_user_organization_id()` clause is the magic** that lets Step 2 ship with zero application code changes. Every existing `INSERT` statement across the codebase continues to work unchanged — `organization_id` is auto-populated from the calling user's profile row. Without this pattern we'd have needed to touch every server action that writes to any core table.
- **Individual top-level UPDATEs instead of a DO block** for the backfill. Each statement gets its own `statement_timeout`, avoiding the cumulative-time issue. Pattern documented in the migration file comments as a reference for future bulk operations.
- **Explicit `BEGIN` / `COMMIT` on the policy switch.** Supabase CLI doesn't wrap migrations in transactions by default (verified via the `SET LOCAL` warnings in Migrations 2 and 3). Without an explicit transaction, a partial policy switch would have been possible if any `CREATE POLICY` had failed mid-migration. The explicit block makes the whole switch atomic.
- **Four policies per table instead of one `FOR ALL`.** Granular SELECT/INSERT/UPDATE/DELETE policies are easier to audit and easier to relax selectively in Step 4 (partners will get SELECT on some tables but not UPDATE/DELETE). Slightly more boilerplate now; much more flexibility later.
- **`ALTER VIEW SET (security_invoker = true)` instead of DROP + RECREATE** for the view migration. Metadata-only change that preserves view definitions and referenced oids, avoiding the need to copy view definitions that have evolved across several migrations.
- **Rollback script saved before Migration 4 runs.** `supabase/rollback/step2_migration4_rollback.sql` is an operational artifact (gitignored via `supabase/rollback/`) that would restore the dev policies instantly if anything had broken after the policy switch. Not needed — Migration 4 applied cleanly — but was ready as a one-command recovery path.

### Verification

Per §8 of the implementation plan:

- **22 tables have `organization_id` NOT NULL + FK + index + DEFAULT** (queries in §4.1, §4.3)
- **88 new org-scoped policies present** (4 per table × 22 tables) and **0 dev policies remaining** (query in §4.4)
- **13 views have `security_invoker = true`** (query in §4.5)
- **Helper function returns DataWiseRE org id** for Dan's authenticated session (simulated-JWT test)
- **Every read path works** — `/home`, `/screening`, `/deals/watchlist`, Workstation, comp map, `/admin/properties`, `/reports`
- **Every write path works** — notes INSERT, pipeline upsert, manual_analysis upsert (via Overrides form), screening comp selection toggle
- **Counts unchanged** — `real_properties`, `screening_results`, `analyses`, `mls_listings` row counts match pre-Step-2 numbers
- **No console errors, no 401/403, no performance regression** — app feels identical to pre-Step-2

### SECURITY DEFINER function audit — deferred to Step 3

Per Decision 12.2 in the implementation plan, SECURITY DEFINER functions in the `public` schema were flagged for audit but the actual fix is deferred to Step 3. The audit query in §8.1 surfaces any `prosecdef = true` functions other than the whitelist (`handle_new_auth_user`, `current_user_organization_id`, `set_updated_at`). Any findings should be converted to `SECURITY INVOKER` or given explicit org filtering in their function body, during Step 3.

### What's NOT done in Step 2 (deferred to later steps)

| Out of scope | Belongs to |
|---|---|
| Route restructure (`/deals/watchlist` → `/analysis`, etc.) | Step 3 — Route Restructure |
| Building the new Workstation card layout per `WORKSTATION_CARD_SPEC.md` | Step 3 — Route Restructure |
| Quick Analysis / Overrides consolidation (fixes the user-error gotcha) | Step 3 — Route Restructure |
| `analysis_shares`, `partner_analysis_versions`, `partner_feedback` tables | Step 4 — Partner Portal MVP |
| Partner-role RLS policies (sharing scoped reads) | Step 4 — Partner Portal MVP |
| SECURITY DEFINER function audit/fix | Step 3 — Route Restructure |
| Removing the layout-level auth check at `app/(workspace)/layout.tsx:16` | After Step 3 proves proxy enforcement in production use |

### Tag

`phase1-step2-complete` — created on the commit that ships this changelog entry. Use this tag to return to this exact state if Step 3 or Step 4 work needs to be rolled back without losing the multi-tenancy / RLS foundation.

### Files touched in this milestone

**New (7):**
- `supabase/migrations/20260410130000_step2_helper_and_columns.sql`
- `supabase/migrations/20260410130100_step2_backfill_organization_id.sql`
- `supabase/migrations/20260410130200_step2_constrain_organization_id.sql`
- `supabase/migrations/20260410130300_step2_switch_policies_to_org_scoped.sql`
- `supabase/migrations/20260410130400_step2_views_security_invoker.sql`
- `PHASE1_STEP2_IMPLEMENTATION.md`
- `SUPABASE_USAGE_CONSIDERATIONS.md`

**Modified (1):**
- `.gitignore` — added `supabase/rollback/` to exclude operational artifacts

**Not modified — this is the design goal of Step 2:**
- Any application code (server actions, route handlers, components, libs)
- Any existing migration
- Any UI component
- Any business logic (screening engines, comp loaders, analysis math)

---

## 2026-04-10 — Phase 1 Step 1 — Auth & Profiles Foundation

First concrete milestone of the Phase 5 restructure. Establishes the multi-tenancy and user-profile foundation that all subsequent Phase 1 work (RLS scaffolding, route restructure, partner portal) will build on top of. Zero changes to existing business logic, route handling, or UI components — Step 1 is purely additive.

### Goals accomplished

1. **Multi-tenancy primitive** — `organizations` table with the DataWiseRE org as the seed row. Future tables will scope to this via `organization_id` (Step 2).
2. **User profiles** — `profiles` table linked 1:1 with `auth.users` carrying role assignment (`analyst` / `partner` / `admin`), org membership, and analyst-friendly metadata. Auto-create trigger ensures every new signup gets a profile row automatically.
3. **Proxy-based auth enforcement** — extended the existing Next.js 16 `proxy.ts` (renamed-from-middleware) to enforce authentication on protected routes with public-route allowlisting and `?next=` redirect support. Defense in depth: the existing layout-level auth check is intentionally KEPT as a backstop until proxy enforcement is proven in production.
4. **Sign-in `?next=` redirect** — sign-in/sign-up now honor the `?next=` query param the proxy sets, with open-redirect attack protection. After signing in to access a protected route, users land back on the page they originally requested instead of always landing on `/home`.

### Schema (Phase A)

Four migrations applied in sequence (each independently committable):

1. **`20260410120000_create_organizations.sql`** — `public.organizations` table with `id`, `name`, `slug` (unique), `market`, `logo_url`, `strategy_profile_slug`, `mls_agreement_confirmed`, timestamps. RLS enabled with permissive Step 1 read policy. Seed row: `DataWiseRE` / `datawisere` / `denver` / `denver_flip_v1`.

2. **`20260410120100_create_profiles.sql`** — `public.profiles` table with FK to `auth.users` (cascade delete) and `organizations` (restrict). Role CHECK constraint (`analyst | partner | admin`). Three indexes (org, email, role). RLS enabled with `profiles_read_own` and `profiles_update_own` policies. (Step 2 will tighten the update policy to only allow `full_name` and `avatar_url` changes.)

3. **`20260410120200_backfill_existing_profiles.sql`** — One-time idempotent INSERT that creates a profile row for every existing `auth.users` entry. In practice this was a single-row insert for Dan, with `role='analyst'`, `organization_id` linked to DataWiseRE, and `full_name` derived from `raw_user_meta_data` or the email local-part.

4. **`20260410120300_profiles_auto_create_trigger.sql`** — `SECURITY DEFINER` trigger on `auth.users` INSERT that auto-creates a profile row for every new signup. Reads `raw_user_meta_data->>'role'` and `raw_user_meta_data->>'organization_slug'` if provided (defaulting to `analyst` + `datawisere`), so Phase 1 Step 4 (Partner Portal) can route partner signups into the partner role with no extra application code. Validates role against the same CHECK constraint. `ON CONFLICT (id) DO NOTHING` makes the trigger idempotent.

### Application code (Phase B)

Six new files, two existing files modified:

**New files:**
- `lib/types/organizations.ts` — `OrganizationRow` type
- `lib/types/profiles.ts` — `UserRole`, `ProfileRow`, `ProfileInsert`, `ProfileUpdate` types
- `lib/auth/get-current-user.ts` — `getCurrentUser()` (cached per React request via `cache()`) and `requireCurrentUser()` (throws if missing). Returns `{ user, profile }` for server-side consumption.
- `lib/auth/has-role.ts` — `hasRole(current, ...allowedRoles)` plus `isAnalyst` (analyst OR admin), `isPartner`, `isAdmin` convenience wrappers.

**Modified files:**
- `lib/supabase/proxy.ts` — `updateSession()` now returns `{ response, user }` instead of just `response`. The closure trick that lets `setAll` mutate the outer `response` variable is preserved exactly.
- `proxy.ts` (root) — now orchestrates session refresh + auth gate. Always refreshes the session first (even on public paths so signed-in users browsing marketing don't have sessions expire). Then checks `PUBLIC_PATHS` / `PUBLIC_PREFIXES`; protected paths require an authenticated user and redirect to `/auth/sign-in?next=<original-path>` if not.
- `app/auth/sign-in/page.tsx` — wrapped in Suspense boundary (required for `useSearchParams()` in client component pages). Reads `?next=` param via `useSearchParams()`, validates it via `safeNextPath()` (rejects null, non-`/`-prefixed values, protocol-relative `//`, and backslash injection), and redirects to it on success. Both sign-in and sign-up handlers honor it. Default fallback changed from `/analysis/properties/new` to `/home`.

### Discovery: Next.js 16 renamed `middleware.ts` to `proxy.ts`

The implementation plan called for creating `middleware.ts` at the project root. When I created it and ran `npm run build`, Next.js 16.2.1 errored out: *"Both middleware file './middleware.ts' and proxy file './proxy.ts' are detected. Please use './proxy.ts' only."*

The project already had `proxy.ts` at the root doing session refresh via the existing `lib/supabase/proxy.ts` `updateSession()` function. The right move was to **delete the `middleware.ts` I created and instead extend the existing `proxy.ts`** to add public-path checking and auth enforcement on top of the session refresh that was already there. The orchestration order (session refresh first, then auth gate) was deliberately chosen so signed-in users browsing public marketing pages still get their session kept alive.

### Notable design decisions

- **Defense in depth on auth enforcement.** The existing layout-level auth check at `app/(workspace)/layout.tsx:16` is intentionally KEPT alongside the proxy-level enforcement. The proxy is the new primary protection but the layout check stays as a backstop until proxy enforcement is proven in production. Removing it later is a one-line change.
- **Proxy session refresh runs on ALL matching requests, including public paths.** A signed-in user browsing `/offerings` should still have their session cookie refreshed. Only the auth-gate decision is path-dependent.
- **`getUser()` not `getSession()`.** The proxy uses `supabase.auth.getUser()` which verifies the JWT against the Supabase server. `getSession()` only reads the cookie locally and could be spoofed by a client with a stale or forged cookie.
- **Open-redirect protection is non-trivial.** The `safeNextPath()` validator on the sign-in page rejects non-`/`-prefixed values, protocol-relative URLs (`//evil.com`), and backslash-injection attempts. This is a real attack vector — phishing campaigns use open redirects constantly.
- **Auto-create trigger uses `SECURITY DEFINER` with `SET search_path = public`.** Required because a fresh signup has no privileges to insert into `public.profiles` themselves. The `search_path` setting prevents search-path injection attacks against the privileged function.
- **Step 1 RLS policies are deliberately permissive.** Update-own currently allows a user to change their own `role` and `organization_id` columns. Step 2 will tighten this. For Step 1 the only user is Dan and the risk is non-existent.

### Verification

All 33 boxes in the implementation plan §8 verification checklist confirmed by Dan:
- Schema verification — both new tables exist, Dan's profile row populated, trigger and function visible in `pg_proc` / `information_schema.triggers`, RLS enabled
- Proxy verification — public routes load without auth, protected routes redirect to `/auth/sign-in?next=...`, sign-in succeeds and lands on the original destination
- Open-redirect protection — `?next=https://google.com` and `?next=//google.com` both rejected and fall back to `/home`
- **Existing analyst workflow — fully verified, zero regressions.** Workstation, comp map, screening queue, watch list, intake imports, admin properties, reports — all working unchanged

### What's NOT done in Step 1 (deferred to later steps)

| Out of scope | Belongs to |
|---|---|
| Adding `organization_id` columns to existing tables (`real_properties`, `analyses`, etc.) | Step 2 — RLS Scaffolding |
| Replacing the "dev authenticated full access" RLS policies on existing tables | Step 2 — RLS Scaffolding |
| Route restructure (`/deals/watchlist` → `/analysis`, etc.) | Step 3 — Route Restructure |
| Building the new Workstation card layout per `WORKSTATION_CARD_SPEC.md` | Step 3 — Route Restructure |
| `analysis_shares`, `partner_analysis_versions`, `partner_feedback` tables | Step 4 — Partner Portal MVP |
| Resend email integration for share invites | Step 4 — Partner Portal MVP |
| Removing the layout-level auth check at `app/(workspace)/layout.tsx:16` | After Step 3 proves proxy enforcement in production use |

### Tag

`phase1-step1-complete` — created on the commit that ships this changelog entry. Use this tag to return to this exact state if Step 2 or 3 work needs to be rolled back without losing the auth/profiles foundation.

### Files touched in this milestone

**New (10):**
- `supabase/migrations/20260410120000_create_organizations.sql`
- `supabase/migrations/20260410120100_create_profiles.sql`
- `supabase/migrations/20260410120200_backfill_existing_profiles.sql`
- `supabase/migrations/20260410120300_profiles_auto_create_trigger.sql`
- `lib/types/organizations.ts`
- `lib/types/profiles.ts`
- `lib/auth/get-current-user.ts`
- `lib/auth/has-role.ts`
- `DataWiseRE_Restructure_Plan.md` (Sonnet's restructure plan, committed alongside)
- `WORKSTATION_CARD_SPEC.md` (locked card layout spec from the discovery session)
- `PHASE1_STEP1_IMPLEMENTATION.md` (this milestone's implementation plan)

**Modified (3):**
- `proxy.ts` (root)
- `lib/supabase/proxy.ts`
- `app/auth/sign-in/page.tsx`

**Not modified:**
- Any business logic (screening engines, comp loaders, analysis math)
- Any UI component
- Any existing route page
- The existing layout-level auth check (kept as defense in depth)
- Strategy profiles or any other lib/screening file

---

# ============================================================
# CHECKPOINT — 2026-04-10 — END OF PHASE 4 / START OF PHASE 5
# ============================================================
#
# This commit marks a stable, fully working version of the
# application immediately before a major workflow restructure.
#
# **If anything goes wrong during the Phase 5 restructure, this
# is the commit to return to.**
#
# Tag (recommended): `checkpoint-pre-phase5`
# Commit message:    "CHECKPOINT: stable pre-Phase 5 restructure baseline"
# ============================================================

## 2026-04-10 — CHECKPOINT: Stable Baseline Before Phase 5 Workflow Restructure

### Why this checkpoint exists

This is the **last known-good state** of the application before a fundamental restructure of site architecture, navigation, route layout, schema additions for users/profiles/clients, and the introduction of an external client-facing area separated from the analyst workspace by a password / role boundary.

The next phase (Phase 5) will reorganize the entire application around the canonical deal flow:

```
INTAKE  →  SCREENING  →  ANALYSIS  →  ACTION
```

…and add a second audience layer (analyst vs. external user / client / owner) with distinct profiles and permission scoping. Because that work touches navigation, routes, layouts, schema, and RLS policies simultaneously, there must be an obvious recovery point. **This is it.**

### How to return to this version

```bash
# Option 1 — view this exact state
git checkout checkpoint-pre-phase5

# Option 2 — reset main to this checkpoint (destructive — only if Phase 5 is abandoned)
git reset --hard checkpoint-pre-phase5
```

A `checkpoint-pre-phase5` git tag should be created on the commit that ships this changelog entry.

### What is working at this checkpoint

Every feature listed below is verified working in production-style local dev:

**Intake**
- CSV import upload, preview, staging, batch processing (`/intake/imports`)
- Manual property entry (`/intake/manual`)
- Rolling 30-day import limits and batch progress tracking

**Screening** (now a top-level nav item — see "What changed in this commit" below)
- Screening Queue (`/screening`) — latest screening result per property, filters, sorting
- Screening Batch results (`/screening/[batchId]`)
- Screening Result Detail (`/screening/[batchId]/[resultId]`)
- Auto-filter buttons, price range filter, clear-all, prime candidate filtering
- DENVER_FLIP_V1 strategy profile with full ARV / rehab / holding / financing / transaction / qualification engines
- Live ARV recomputation, exponential decay weighted ARV from `comparable_search_candidates`

**Deals**
- Watch List (`/deals/watchlist`) — rebuilt table with sticky columns, live offer% / gap recompute, comp counts, manual target profit override
- Analysis Workstation (`/deals/watchlist/[analysisId]`) — three-card panel (MLS Info / Property Physical / Quick Analysis), live deal-math summary strip, scratchpad recalc
- Pipeline (`/deals/pipeline`) — showing / offer / under-contract lifecycle
- Closed Deals (`/deals/closed`)

**Reports**
- Report library grouped by property
- Report detail with public access via `analysis_reports.access_token`

**Admin**
- Properties browser (`/admin/properties`)
- Manual property entry under admin
- Property edit

**Home**
- Daily dashboard with unreviewed primes, watch list alerts, pipeline actions, daily activity

**Schema**
- All tables in stable state (see RESTRUCTURE_PLANNING.md for full inventory)
- All RLS policies are still permissive "dev authenticated full access" — this WILL change in Phase 5

### What changed in this commit

**Navigation restructure (first step of Phase 5):**

`Screening` was elevated from a tab under `Intake` to a top-level navigation item between `Intake` and `Deals`, reflecting the canonical `Intake → Screening → Analysis → Action` deal flow.

**Routes moved:**

| Old | New |
|---|---|
| `/intake/screening` | `/screening` |
| `/intake/screening/[batchId]` | `/screening/[batchId]` |
| `/intake/screening/[batchId]/[resultId]` | `/screening/[batchId]/[resultId]` |

**Files moved:** `app/(workspace)/intake/screening/` → `app/(workspace)/screening/` (including `actions.ts`, `page.tsx`, `[batchId]/page.tsx`, `[batchId]/[resultId]/page.tsx`)

**Files updated to point at the new path:**
- `components/layout/app-chrome.tsx` — added `/screening` to `primaryNav`, removed Screening tab from Intake, added new Screening section config and page label entries
- `components/screening/screening-comp-modal.tsx` — import path updated
- `components/screening/auto-filter-buttons.tsx`, `batch-results-table.tsx`, `queue-results-table.tsx` — all `/intake/screening` hrefs → `/screening`
- `app/(workspace)/home/page.tsx`, `home/unreviewed-primes.tsx` — link hrefs
- `app/(workspace)/deals/watchlist/watch-list-table.tsx` — link href
- `app/(workspace)/intake/imports/page.tsx`, `imports/actions.ts` — link hrefs and revalidatePath calls
- `app/(workspace)/screening/actions.ts` — internal redirects and revalidatePath calls
- `app/(workspace)/screening/page.tsx`, `[batchId]/page.tsx`, `[batchId]/[resultId]/page.tsx` — internal `buildHref` and back-link references
- `app/(workspace)/analysis/queue/page.tsx` — legacy redirect now points to `/screening`
- `app/(workspace)/analysis/screening/[batchId]/page.tsx` — legacy redirect now points to `/screening/[batchId]`
- `app/(workspace)/analysis/screening/[batchId]/[resultId]/page.tsx` — legacy redirect now points to `/screening/[batchId]/[resultId]`

**Intake** now contains only `Imports` and `Manual Entry` tabs. Its subtitle was updated to "Import data and add properties." (previously "Import data and screen for opportunities.")

**Planning artifact added:**

- `RESTRUCTURE_PLANNING.md` — comprehensive prompt prepared for a Claude Sonnet planning session. Contains: full current site structure inventory, full schema inventory, identified gaps, and an eight-area question framework (stage definitions, route mapping, user/profile layer, Analysis stage, Action stage, Reports, constraints, vision check). The Sonnet output will feed back into a Claude Opus implementation planning session.

### What is NOT yet started (the Phase 5 scope)

- No top-level `Analysis` route — Analysis Workstation still lives at `/deals/watchlist/[analysisId]`
- No top-level `Action` section — pipeline/closed still under `Deals`
- No `profiles` table, no `clients` table, no role/permission system
- All RLS policies are still permissive
- No client-facing / external user area at all
- Watch list location and ownership is still ambiguous (Screening output? Analysis input? Standalone?)
- Reports section is internal-only — not yet a client deliverable layer

These will all be addressed in Phase 5 once the planning session is complete and an implementation plan is approved.

### Recovery / safety notes

- The dev server should be restarted after pulling this commit because `next.config` and route structure changed under `app/(workspace)/`.
- No database migrations were added in this commit. Schema is unchanged from the previous commit (`c22cfba`).
- Legacy redirect routes under `/analysis/queue`, `/analysis/screening/...` are intentionally kept and now point at the new `/screening/...` paths, so any external bookmarks continue working.
- RESTRUCTURE_PLANNING.md is a planning document only — it does not affect runtime behavior and can be safely ignored or deleted without breaking anything.

---

## 2026-04-09c — Watch List Rebuild + Workstation Quick Analysis Panel

### What changed

#### Watch List table — full column rebuild

The `/deals/watchlist` table was rebuilt against an expanded view to expose every field needed for at-a-glance deal triage. New column order:

`Actions | Interest | Address | City | Subdivision | Change Type | DOM | List Date | Comps | ARV | List Price | Max Offer | Offer % | Gap | Profit | Lvl | Year | Bd | Ba | Gar | Bldg SF | Abv SF | Bsmt | BsFin | Lot | Status | Note`

- **Actions** moved to the leftmost column.
- **Actions / Interest / Address** are sticky-frozen on the left so they stay visible while scrolling horizontally (`position: sticky` with explicit `left` offsets and z-index hierarchy for header/body intersections).
- **Comps** = `selected/total` from `comparable_search_candidates.selected_yn`.
- **DOM** centered. Pending/closed = `purchase_contract_date − listing_contract_date`. Active/coming soon = `greatest(0, today − listing_contract_date + 1)` (inclusive of list date so a same-day listing shows 1 and a future-dated coming soon shows 0).
- **List Price** prefers live `mls_listings.list_price` (falls back to subject snapshot only if no MLS row exists).
- **Offer %** and **Gap** are recomputed against the *live* list price every page load — the table never shows stale snapshot math.
- **Gap** = `(arv − list_price) / building_area_total_sqft`.
- **Profit** = `coalesce(manual_analysis.target_profit_manual, screening_results.target_profit)`.
- **List Date** displays `mm/dd/yy` parsed directly from the `YYYY-MM-DD` string to avoid timezone shifts.

**Filter bar:** City, Level Class, Change Type, Status, Interest, Min Offer %, Min Gap, Clear button, `n of N` count.

**Sorting:** every numeric column is click-to-sort with ▲/▼ indicators. Default is Offer % desc.

**Density:** `text-[11px]` body / `text-[9px]` uppercase headers, `px-1 py-0.5` cells, 22px sticky header — matches `ScreeningCompModal`. Body cells use `text-slate-700`, emphasized values use `font-semibold text-slate-900`. Bd/Ba/Gar/Year columns use explicit tight widths (24/24/28/40px). Subdivision and Lvl truncate at 110/56px with tooltips.

#### `watch_list_v` view — expanded columns

Recreated the view with all the fields the new table needs. **Note:** the migration requires a `drop view if exists` first because Postgres `create or replace view` cannot remove or reorder columns from an existing view.

New columns exposed: `subdivision_name`, `mls_major_change_type`, `listing_contract_date`, `mls_status`, `list_price` (live), `dom`, `level_class_standardized`, `year_built`, `bedrooms_total`, `bathrooms_total`, `garage_spaces`, `building_area_total_sqft`, `above_grade_finished_area_sqft`, `below_grade_total_sqft`, `below_grade_finished_area_sqft`, `lot_size_sqft`, `arv_aggregate`, `max_offer`, `comps_selected`, `comps_total`, `offer_pct` (recomputed), `gap_per_sqft` (recomputed), `target_profit` (manual override applied).

`comps_selected` / `comps_total` come from a lateral aggregate over `comparable_search_candidates` keyed on `screening_results.comp_search_run_id`.

**Migration:** `20260409120000_watch_list_view_expand_columns.sql`

#### Analysis Workstation — three-card panel + Quick Analysis

Imported the top section from `ScreeningCompModal` into the Analysis Workstation as a three-card row sitting just below the existing header bar:

1. **MLS Info** card (max 320px) — MLS Status, MLS#, MLS Change, List Date, Orig List Price, U/C Date, List Price, Close Date.
2. **Property Physical** card (max 400px) — 4 rows × 3 column-pairs: Total SF/Beds/Type, Above SF/Baths/Levels, Below SF/Garage/Year, Bsmt Fin/Lot SF/Tax|HOA. Year < 1950 renders red bold.
3. **Quick Analysis** card (max 360px) — three live-recalc inputs: **Manual ARV**, **Rehab Override**, **Target Profit**. Each shows the current effective value as the placeholder.

Below the cards: a **Deal Math summary strip** (`ARV · Max Offer · Offer% · Gap/sqft · Rehab · Target Profit`) that recalculates instantly via a `useMemo` as the user types in the Quick Analysis inputs. The recalc mirrors the modal's logic:

```
arv         = manual override OR data.arv.effective
rehabTotal  = manual override OR data.rehab.effective
targetProfit = manual override OR data.dealMath.targetProfit OR 40,000
costs       = rehab + holding + transaction + financing + targetProfit
maxOffer    = arv − costs
offerPct    = maxOffer / listPrice
gap/sqft    = (arv − listPrice) / buildingSqft
```

**Quick Analysis is a what-if scratchpad — nothing persists.** Existing analysis fields stay untouched. The user still uses the existing manual analysis form below to save.

**Tab flow fix:** Tabbing out of the Target Profit input now jumps directly to "Copy Selected MLS#" instead of the "Hold & Trans Detail" toggle. Implemented via a `useRef` on the button + an `onKeyDown` Tab interceptor on the Target Profit input.

#### Card sizing — both Workstation and ScreeningCompModal

The middle Property Physical card was previously `flex-1`, stretching to fill available width. Both files now:

- All three cards use `shrink-0` with explicit `maxWidth` (320 / 400 / 360).
- Inner grid `1fr` spacer columns replaced with explicit `16px` so the visual grouping survives when the card is content-sized.
- Empty space sits to the right of the Quick Analysis card, reserved for future widgets.

#### Backend additions

`load-workstation-data.ts` now also pulls `mls_major_change_type`, `purchase_contract_date`, and `close_date` from `mls_listings` and exposes them as `data.listing.mlsMajorChangeType / purchaseContractDate / closeDate`. The `WorkstationData` type in `lib/reports/types.ts` was updated to match. No SQL migration needed — those fields already exist on `mls_listings`.

### Migrations

- `20260409120000_watch_list_view_expand_columns.sql`

---

## 2026-04-09b — Screening Queue Auto Filters, Performance Indexes

### What changed

#### Auto Filter Buttons (client-side)

New interactive filter bar on the Screening Queue page, organized by purpose in a grid layout:

- **MLS Status** — one-click buttons for Coming Soon, Active, Pending, Withdrawn, Expired, Closed. Click to toggle on/off.
- **Date Filters** — "New Listings" (by listing contract date) and "Screened Date" (by screening_updated_at). Each prompts for number of past days to include. Click again to toggle off.
- **Price Range** — low/high text inputs with Apply button. Shows active range as a blue badge (e.g. `$200k – $500k`). Enter to apply, ✕ to clear.
- **Clear All** — appears when any auto filter is active; clears all auto-filter params while preserving dropdown filters and sort.

All auto filters compose with the existing dropdown filters and use URL search params for server-side filtering.

**New component:** `components/screening/auto-filter-buttons.tsx`

#### Queue View Performance Indexes

Added composite indexes to resolve statement timeout on `analysis_queue_v`:

- `ix_screening_results_property_created` — `(real_property_id, created_at desc)` for the `DISTINCT ON` sort
- `ix_mls_listings_property_contract_created` — `(real_property_id, listing_contract_date desc nulls first, created_at desc)` for the lateral join

#### Queue View: screening_updated_at column

Added `screening_updated_at` to the `analysis_queue_v` view to support date-based filtering.

### Migrations

- `20260409100000_queue_view_performance_indexes.sql`
- `20260409110000_queue_view_add_screened_date.sql`

---

## 2026-04-09a — ARV Transparency, Map Tooltips, Naming Fixes & Spread Correction

### What changed

#### `closePrice` → `netSalePrice` rename (consistency)

Renamed the `closePrice` field to `netSalePrice` across all ARV/valuation types and engines to make it explicit that the ARV engine operates on net sale price (close price minus concessions). No logic change — the values were already correct; this is a naming fix for clarity.

**Types renamed:** `CompArvInput`, `CompArvDetail`, `TrendSaleInput`, `ArvPerCompDetail`, `ReportSelectedComp`
**Engines updated:** arv-engine, bulk-runner, trend-engine, load-workstation-data, screening actions, both workstations, report viewer, report document

#### ARV Breakdown Tooltip

Hover over any Imp ARV value to see the full calculation breakdown in a floating card:
- Net Sale Price → PSF Bldg / PSF AG → ARV Bldg (size adj) / ARV AG (size adj) → ARV Blended → Time Adjustment → **Implied ARV** → Confidence / Decay Weight

Uses `createPortal` to render on `document.body` at `z-index: 9999`, positioned toward the center of the screen so it never clips. Shared `ArvCompBreakdown` type carries the full per-comp detail from the ARV engine through to the UI.

**New component:** `components/screening/arv-breakdown-tooltip.tsx`
**New type:** `ArvCompBreakdown` in `lib/reports/types.ts`

#### Map tooltip: Implied ARV

Map pin hover tooltips now show **Imp ARV** (blue, bold) directly below Net Sale price. Added `impliedArv` to `MapPinTooltipData` and wired it through all map pin builders (ScreeningCompModal + both workstation ARV/As-Is maps).

#### Map tooltip portal rendering

Replaced Leaflet's built-in tooltip (clipped by `overflow: auto`) with a React portal tooltip rendered on `document.body`. Positioned toward the center of the screen relative to the pin. Map container uses `isolation: isolate` + `zIndex: 0` to keep Leaflet internals from overlapping modals.

#### Map stacking context fix

Maps in ARV/As-Is Comparables tiles no longer render on top of modals. The map container now creates its own stacking context via `isolation: isolate` + `zIndex: 0`.

#### Abv SF column

Added `above_grade_finished_area_sqft` with header "Abv SF" to the left of Bsmt in all comp tables: ScreeningCompModal, ComparableCandidateTable, and both workstation ARV/As-Is inline tables.

#### `last_screened_at` → `screening_updated_at`

Renamed to track the timing of the most recent screening decision (not just batch run). Now stamped on every screening action: initial screen, promote, pass, reactivate, pass from watch list. Backfilled from `reviewed_at` where more recent.

**Migration:** `20260408210000_screening_updated_at.sql`

Daily activity view updated to include `screening_decision` column (promoted/passed/null). Dashboard badges now color-coded: green "Promoted", red "Passed", violet "Screened".

#### Spread formula fix

`deal-math.ts` spread was computed as `ARV - List Price` but the report label said "Spread (List - Max Offer)". Fixed to `List Price - Max Offer` to match the label. Existing screening results retain stale values; new screenings and live deal math use the corrected formula.

### Files changed

- `lib/screening/types.ts` — `closePrice` → `netSalePrice` on 3 types
- `lib/screening/arv-engine.ts` — `comp.closePrice` → `comp.netSalePrice`
- `lib/screening/bulk-runner.ts` — renamed local var + field assignments
- `lib/screening/trend-engine.ts` — renamed all `closePrice` refs
- `lib/screening/deal-math.ts` — spread formula fix
- `lib/reports/types.ts` — `ArvCompBreakdown` type, `netSalePrice` renames, `subdivisionName`
- `lib/reports/snapshot.ts` — `netSalePrice` rename
- `lib/analysis/load-workstation-data.ts` — per-candidate ARV breakdown, `netSalePrice`, `screening_updated_at`
- `app/(workspace)/intake/screening/actions.ts` — `ArvCompBreakdown`, `screening_updated_at` on all review actions
- `app/(workspace)/deals/watchlist/actions.ts` — `screening_updated_at` on pass
- `app/(workspace)/home/page.tsx` — `screening_decision` column, color-coded badges
- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` — Abv SF column, ARV breakdown tooltip, map impliedArv, `netSalePrice`
- `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` — same as above
- `app/(workspace)/reports/[reportId]/report-viewer.tsx` — `netSalePrice`
- `components/screening/screening-comp-modal.tsx` — Abv SF column, ARV breakdown tooltip, map impliedArv
- `components/screening/arv-breakdown-tooltip.tsx` — new shared component
- `components/properties/comp-map.tsx` — portal tooltip, `impliedArv` in tooltip, stacking context fix
- `components/properties/comparable-candidate-table.tsx` — Abv SF column
- `components/reports/report-document.tsx` — `netSalePrice`
- `supabase/migrations/20260408210000_screening_updated_at.sql` — column rename + view update

---

## 2026-04-08k — Unified Comp Tables Across Workstations

### What changed

Aligned all comparable sales tables in the Analysis Workstation (properties + deals/watchlist) to match the ScreeningCompModal's column set, formatting, conditional coloring, and sort behavior.

#### Columns (matching ScreeningCompModal exactly)

Dist | Address | Subdiv | Net Price | Imp ARV | Gap | Days | Lvl | Year | Bd | Ba | Gar | Bldg SF | Bsmt | BsFin | Lot | Score

- **Imp ARV** — per-comp implied ARV computed live by the ARV engine for ALL candidates on every load (not just selected comps)
- **Gap** — per-comp gap/sqft with conditional color (green ≥$60, red <$30)
- **Dist** — conditional color (green ≤0.2mi, red ≥0.6mi)
- **Days** — conditional color (green <60, red >180)
- **Gar** — garage spaces column added after Ba
- **Subdiv** — subdivision name, backfilled from mls_listings for existing data

#### Subject property row

Sticky red-highlighted subject row at the top of each table (ARV Comparables + As-Is Comparables) with full property data, matching the ScreeningCompModal layout.

#### Sorting & filtering (ComparableCandidateTable)

- Sortable columns: Imp ARV, Gap, Days, Bldg SF (default Gap descending)
- Show Selected Only toggle
- "Why" score breakdown expansion preserved

#### Data pipeline changes

- **`lib/comparables/engine.ts`** — now stores `subdivision_name` in metrics_json for new comp searches
- **`lib/analysis/load-workstation-data.ts`** — backfills `subdivision_name`, `net_price`, and `concessions_amount` from mls_listings for existing candidates; loads `subdivision_name` for the subject listing; computes per-candidate implied ARV via `calculateArv` for all candidates and exposes `arvByCompListingId` on workstation data
- **`lib/reports/types.ts`** — added `subdivisionName` to listing type, `arvByCompListingId` to compModalData type
- **MLS copy buttons** (ScreeningCompModal) — Copy Selected and Copy All now output subject MLS# first, then comps sorted by Imp ARV descending

### Files changed

- `components/screening/screening-comp-modal.tsx` — MLS copy ordering
- `components/properties/comparable-candidate-table.tsx` — complete rewrite matching modal columns, sort, conditional formatting
- `components/properties/comparable-workspace-panel.tsx` — selected comp summary table updated, `lotSizeSqft` added to subject summary
- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` — inline ARV + As-Is comp tables rewritten with full column set, subject row, Imp ARV, Gar
- `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` — same changes as above
- `lib/analysis/load-workstation-data.ts` — subdivision backfill, per-candidate ARV computation, subject subdivision
- `lib/comparables/engine.ts` — subdivision_name in query + metrics_json
- `lib/reports/types.ts` — type additions

---

## 2026-04-08j — Analysis Completion Timestamps & Daily Activity Log

### What changed

- **`analysis_completed_at`** column on `analyses` — stamped when analyst clicks "Mark Complete" on the workstation, updated on subsequent clicks
- **`last_screened_at`** column on `screening_results` — stamped when the screening pipeline processes a property (backfilled from `created_at` for existing rows)
- **"Mark Complete" / "Update Complete" button** on both Analysis Workstation pages (properties + deals/watchlist), positioned next to "Generate Report"
  - First click: sets `status = 'complete'`, stamps `analysis_completed_at`
  - Subsequent clicks: re-stamps the timestamp
  - Shows last-completed date/time inline
  - Button style changes from amber (not yet complete) to blue (previously completed)
- **`daily_activity_v` view** — unions screening results and analysis completions for activity tracking
- **"Today's Activity" dashboard section** on the home page — table showing all screening and analysis activity for the current day with timestamps, type badges, addresses, and links

### Database migration

`20260408200000_analysis_timestamps.sql`:
- `analyses.analysis_completed_at` (timestamptz, indexed)
- `screening_results.last_screened_at` (timestamptz, default now(), indexed, backfilled)
- `daily_activity_v` view

### Files changed

- `supabase/migrations/20260408200000_analysis_timestamps.sql` — new migration
- `lib/reports/types.ts` — added `analysisCompletedAt` to WorkstationData analysis type
- `lib/analysis/load-workstation-data.ts` — select and return `analysis_completed_at`
- `lib/screening/bulk-runner.ts` — stamp `last_screened_at` on screening_results insert
- `app/(workspace)/analysis/properties/actions.ts` — new `markAnalysisCompleteAction`
- `app/(workspace)/deals/actions.ts` — new `markAnalysisCompleteAction`
- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` — Mark Complete button + state
- `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` — Mark Complete button + state
- `app/(workspace)/home/page.tsx` — daily activity query + "Today's Activity" table section

---

## 2026-04-08i — Comp Table Column Reorder, Sorting, Filtering & Conditional Formatting

### What changed

- **Column reorder**: DIST moved to the left of Address; LVL moved to the left of Year for a more logical scanning order
- **Sortable columns**: Imp ARV, Gap, Days, and Bldg SF headers are now clickable to sort ascending/descending with ▼/▲ indicators; default sort is Gap descending (best deals first)
- **Show Selected Only toggle**: Button above the comp table filters to only picked comps for final review (map is unaffected)
- **DIST conditional formatting**: ≤ 0.2 mi = green (very close comp), ≥ 0.6 mi = red (distant comp), between = default slate

### Files changed

- `components/screening/screening-comp-modal.tsx` — sort state + toggleSort handler, IIFE-wrapped sorted/filtered candidate rendering, clickable sort headers, showSelectedOnly toggle button, distance color coding

---

## 2026-04-08h — Live ARV Computation for All Comp Candidates

### What changed

Implied ARV per comp is now computed live every time the modal loads, rather than only reading from the stored `arv_detail_json` snapshot. This means manually added comps and expanded search results immediately show Implied ARV, Gap/sqft, and contribute to the live deal math recalculation — no rescreen needed.

### How it works

New `computeArvForCandidates` helper in the screening actions file:
- Takes all processed candidates (after net price and subdivision backfill)
- Builds `CompArvInput[]` from each candidate's `metrics_json`
- Runs `calculateArv` from the ARV engine with the `DENVER_FLIP_V1` strategy profile
- Returns per-comp `{ arv, weight }` map keyed by `comp_listing_row_id`

Called in both data loaders:
- `loadScreeningCompDataAction` (screening mode)
- `loadCompDataByRunAction` (workstation mode)

### Why this matters

Previously, `arvByCompListingId` was built solely from `arv_detail_json` stored on the screening result at screening time. Comps added later (via manual MLS# entry or expanded search) had no entry in that JSON, so their Implied ARV column showed "—" and they couldn't contribute to the live ARV recalculation. Now the ARV engine processes every candidate on every load.

### Files changed

- `app/(workspace)/intake/screening/actions.ts` — added `computeArvForCandidates` helper, imports for `calculateArv`/`resolvePropertyTypeFamily`/`CompArvInput`/`PropertyTypeKey`; both data loaders now compute ARV live instead of reading stored JSON

---

## 2026-04-08g — ScreeningCompModal Overhaul: Property Header, Net Price, Expanded Search, Unified Comp Workspace

### Summary

Major overhaul of the `ScreeningCompModal` — the popup that opens from the screening queue "Map" button. This was a large, multi-feature session that transformed the modal from a basic comp picker into a full-featured comparable analysis workspace. The modal now also replaces the old "Edit Comps" popup in both Analysis Workstation pages, unifying the comp selection experience across the entire application.

### Property Header & MLS Info (Access-style layout)

The modal header was redesigned to match the legacy MS Access workspace layout:

- **Address line**: bold `Address; City ZIP` with `Subdivision | County` right-aligned, plus Prime/Passed pills and Close button
- **Two info tiles side-by-side** below a thin divider:
  - **MLS Info tile** (left): MLS Status, MLS#, MLS Change, List Date, Orig List Price, U/C Date, List Price, Close Date — 4 rows × 2 columns
  - **Property Physical tile** (right): Total SF, Above Grade SF, Below Grade SF, Below Finished, Beds, Baths, Garage, Type, Levels, Year (red if pre-1950), Lot SF, Ownership, Occupant, Taxes/HOA
- Data loaded via parallel joins to `real_properties`, `property_physical`, `property_financials`, and `mls_listings`

### Net Price Refactor (project-wide)

Introduced `net_price = close_price - concessions_amount` throughout the entire codebase. Concessions were already imported and stored in `mls_listings` but were never subtracted from sale prices.

**14 files updated across 3 layers:**

- **Engines** (`bulk-runner.ts`, `valuation/engine.ts`, `comparables/engine.ts`): All PPSF calculations, ARV inputs, and trend sales now use net price. `concessions_amount` added to all listing queries. `net_price` stored alongside `close_price` in `metrics_json`.
- **Data loaders** (`load-workstation-data.ts`): ARV averaging uses net price with fallback
- **UI displays**: All analysis workstations, screening modal, screening detail page, comparable workspace panel, deals actions, report snapshots, and map tooltips (label changed from "Sale" to "Net Sale")
- **Backfill for existing data**: `loadScreeningCompDataAction` batch-loads concessions from `mls_listings` and computes `net_price` on the fly for candidates that pre-date the code change

### Redesigned Comp Candidate Table

Replaced the old 8-column table with a dense 18-column layout:

**Columns (in order):** Pick, Address, Dist, Subdiv, Lvl, Net Price, Imp ARV, Gap, Days, Year, Bd, Ba, Gar, Bldg SF, Bsmt, BsFin, Lot, Score

- **Imp ARV**: Per-comp implied ARV loaded from `arv_detail_json`, keyed by `comp_listing_row_id`
- **Gap**: Per-comp gap/sqft with color coding (green ≥$60, red <$30)
- **Days**: Color coded (red >180, green <60)
- **Year**: Displayed without comma formatting (e.g., "1908" not "1,908")
- **Subdivision**: Loaded from `mls_listings.subdivision_name`, backfilled for existing data, added to bulk-runner `metrics_json` for future runs
- **Bd/Ba/Gar**: Fixed 24px width for visual balance
- Modal widened to 1440px; map reduced to 380×320px

### Subject Property Row

Added a fixed subject row at the top of the comp table:

- Red "Subject" pill in the pick column
- Shows List Price (not net), live ARV, live Gap/sqft, average comp score
- Sticky below the header row (z-20, precise pixel offset) so it stays visible when scrolling
- Red-50 background with red bottom border

### Live-Recalculated Deal Math

The deal math strip (ARV, Max Offer, Offer%, Gap/sqft) now recalculates instantly as the user picks/unpicks comps:

- Uses decay-weighted average of per-comp ARVs: `Sum(arv × decayWeight) / Sum(decayWeight)`
- Max Offer recomputed from `ARV - rehab - holding - transaction - financing - targetProfit`
- Cost components loaded from screening result; falls back to original values when no comps are picked

### Map Legend Improvement

Replaced the simple colored-dot legend with a detailed pin guide that matches the actual map rendering:

- Subject: red fill, white border with red outer ring
- Picked: green fill, white border
- Candidates: gray fill with gap/sqft-coded borders (green ≥$60, yellow ≥$30, red <$30)
- Right-aligned "gap/sqft" label

### Copy MLS# Buttons

Added "Copy Selected (N)" and "Copy All (N)" buttons in the deal math strip, to the right of the comp stats. Copies MLS numbers as comma-separated text.

### Reactivate Passed Properties

Added ability to undo a "Pass" decision:

- New `reactivateScreeningResultAction` clears `review_action`, `pass_reason`, `reviewed_at`, and `reviewed_by_user_id`
- "Reactivate" button (amber styling) appears in the footer when a property is in Passed state
- Modal immediately updates to show Promote/Pass buttons again without closing

### Add Comp by MLS#

Added manual comp entry to the screening modal (below the map, above Expand Search):

- Text input + "Add" button; supports Enter key
- New `addManualScreeningCompAction` server action that:
  - Looks up the listing, checks for duplicates
  - Loads full subject + comp property data in parallel
  - Calculates all deltas (distance, days, sqft, year, beds, baths)
  - Populates complete `metrics_json` (address, subdivision, level class, all sqft fields, net price, PPSF, etc.)
  - Auto-picks the comp (`selected_yn: true`)
- Inline success/error feedback

### Expand Comparable Search

Added ability to run a wider comp search from within the modal:

- "Expand Comparable Search" button opens a compact parameter form below the map
- **Adjustable parameters**: Radius (mi), SqFt Tolerance %, Max Days, Building Form, Level Class
- **Building Form and Level Class use multi-checkbox dropdowns** — user can select multiple specific values (e.g., Bi-Level + Tri-Level + Multi-Level) or leave as "Any"
- New `expandComparableSearch` function in `bulk-runner.ts`:
  - Loads original run parameters as the base
  - Applies user overrides
  - Uses the full scoring engine (`scoreCompsForSubject`)
  - Deduplicates against existing candidates
  - Post-filters by selected level classes and building forms
- Results merged into existing candidate pool; modal reloads to show new comps
- Shows "+N new comps (M total)" result message

### Unified Comp Workspace (replaces old Edit Comps modal)

`ScreeningCompModal` now supports two modes:

1. **Screening mode**: Pass `resultId` + `batchId` (opens from screening queue/batch tables)
2. **Workstation mode**: Pass `compSearchRunId` + `realPropertyId` (opens from Analysis Workstation "Edit Comps" buttons)

New `loadCompDataByRunAction` builds the same `ScreeningCompData` from property/MLS/comp tables without requiring a `screening_results` row. If a screening result exists for the same property + run, deal math fields are loaded from it.

Both Analysis Workstation files updated:
- `analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx`
- `deals/watchlist/[analysisId]/analysis-workstation.tsx`

Old inline modals (~120 lines each) with `ComparableWorkspacePanel` replaced by a single `<ScreeningCompModal>` call. Workstation mode hides promote/pass/reactivate footer (not applicable), shows simple comp count instead.

### Files Changed

**Core engines:**
- `lib/screening/bulk-runner.ts` — net price, concessions, subdivision in metrics_json, `expandComparableSearch` export
- `lib/screening/arv-engine.ts` — (unchanged, consumes net price via `closePrice` input)
- `lib/valuation/engine.ts` — net price, concessions in query/metrics
- `lib/comparables/engine.ts` — net price, concessions in query/metrics

**Actions:**
- `app/(workspace)/intake/screening/actions.ts` — expanded `ScreeningCompData` type, `loadCompDataByRunAction`, `reactivateScreeningResultAction`, `expandComparableSearchAction`, `addManualScreeningCompAction`, backfill logic for net_price/subdivision
- `app/(workspace)/deals/actions.ts` — net price in manual comp add

**Data loaders:**
- `lib/analysis/load-workstation-data.ts` — net price in ARV averaging
- `lib/reports/snapshot.ts` — net price fallback

**Components:**
- `components/screening/screening-comp-modal.tsx` — complete overhaul (property header, MLS tile, dense table, subject row, live deal math, legend, copy MLS, add comp, expand search, reactivate, workstation mode)
- `components/properties/comp-map.tsx` — tooltip label "Net Sale"
- `components/properties/comparable-workspace-panel.tsx` — net price fallback

**Workstation pages:**
- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` — replaced inline Edit Comps modals with ScreeningCompModal
- `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` — same replacement

**Other displays:**
- `app/(workspace)/intake/screening/[batchId]/[resultId]/page.tsx` — net price display
- `app/(workspace)/admin/properties/[id]/page.tsx` — (unchanged, shows raw listing history)

---

## 2026-04-08f — Property-Type-Specific Comp Search Radii

### What changed

Comp search distance, ARV confidence tiers, and Prime Candidate qualification distances are now configured per property type instead of using a single 0.75mi radius for all types.

| | Detached | Townhome | Condo |
|---|---|---|---|
| **Search radius** | 0.75 mi | 0.6 mi | 0.1 mi |
| **Full confidence** | ≤0.3 mi | ≤0.2 mi | ≤0.02 mi |
| **Qualification dist** | 0.4 mi | 0.4 mi | 0.08 mi |

The tight condo radius (0.1mi) produced a substantial improvement in condo screening results by eliminating irrelevant comps from distant complexes. Without building/complex name data, geographic proximity is the only way to approximate same-building matches.

### Still needed: Townhome logic

Townhome search radius is intentionally wider (0.6mi) because MLS agents use the "townhome" property type inconsistently — some attached products that behave more like detached homes get categorized as townhomes. Until we import `building_name` / complex data and can match on it, the wider radius prevents losing valid comps. This should be tightened once building name is captured in the import pipeline.

### Files changed

- `lib/screening/bulk-runner.ts` — per-type `SCREENING_RULES_BY_TYPE` replaces single `SCREENING_RULES`
- `lib/screening/strategy-profiles.ts` — `confidenceTiersByType` replaces `confidenceTiers`; `maxCompDistanceMilesByType` replaces `maxCompDistanceMiles` in qualification config
- `lib/screening/arv-engine.ts` — uses property-type-specific confidence tiers
- `lib/screening/qualification-engine.ts` — accepts `propertyType`, uses per-type qualification distance

---

## 2026-04-08e — Per-Category Rehab Scoping and Custom Items

### Per-Category Scope Multipliers

Replaced the single global rehab scope selector (Cosmetic/Moderate/Heavy/Gut) with per-category scope controls. Each of the 6 automated rehab categories (Above Grade, Below Grade Finished, Below Grade Unfinished, Exterior, Landscaping, Systems) now has its own 5-tier multiplier:

| Tier | Multiplier | Meaning |
|------|-----------|---------|
| None | 0.0 | No work needed |
| Light | 0.5 | Minor touch-ups |
| Moderate | 1.0 | Standard rehab (default) |
| Heavy | 1.5 | Significant work |
| Gut | 2.0 | Full tear-out and rebuild |

Each category also accepts a **Custom $** direct cost override — enter a dollar amount to replace the computed value entirely.

### Custom Rehab Line Items

Users can now add up to 7 custom rehab line items (e.g. Roof, Sewer, Structural, Garage) with a label and dollar amount. These appear in a collapsible section below the automated categories.

- Custom items are stored separately from automated categories
- Custom item costs are added on top of the base rehab total
- Custom items flow through to Deal Math, Cash Required, and all downstream calculations
- Custom items are included in report snapshots for partner-facing reports

### Instant Client-Side Recalculation

All rehab numbers update instantly when the user clicks a tier button, enters a custom cost, or adds/modifies a custom item — no save or page refresh needed. The server pre-computes base (pre-scope) costs per category and sends them to the client, which applies multipliers locally.

The Save button shows dirty state and only activates when changes are pending.

### Architecture

- **Strategy profile**: Added `categoryScopeMultipliers` to `RehabConfig` (configurable per-market)
- **Database**: Two new JSONB columns on `manual_analysis`: `rehab_category_scopes` (per-category tier/cost overrides) and `rehab_custom_items` (custom line item array)
- **Types**: `CategoryScopeTier`, `RehabCategoryKey`, `CategoryScopeValue` (tier string or `{ cost: number }`), `RehabCustomItem`
- **Data loader**: Resolves per-category multipliers independently, handles cost overrides, sums custom items into `effectiveRehab`
- **UI**: Extracted `RehabCard` component with `useMemo`-based instant recalc; right column widened from 330px to 420px

### Files Changed

- `supabase/migrations/20260407160000_add_rehab_category_scopes.sql`
- `supabase/migrations/20260407170000_add_rehab_custom_items.sql`
- `lib/screening/types.ts` — new per-category scope types
- `lib/screening/strategy-profiles.ts` — `categoryScopeMultipliers` added to config and profile
- `lib/reports/types.ts` — `RehabCustomItem`, `RehabCategoryScopeDetail`, updated `WorkstationData` and `ReportContentJson`
- `lib/analysis/load-workstation-data.ts` — per-category multiplier resolution, custom items in `effectiveRehab`
- `lib/reports/snapshot.ts` — passes `categoryScopes` and `customItems` to reports
- `app/(workspace)/deals/actions.ts` — saves both JSONB fields
- `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` — new `RehabCard` component with per-category UI and custom items

---

## 2026-04-08d — Complete Screening Pagination Fix

- Fixed three additional unpaginated `get_import_batch_property_ids` RPC calls that were still capping at 1,000 rows: auto-screen in `previewImportAction`, `processImportBatchAction`, and legacy `analysis/screening` action
- Extracted shared `fetchImportBatchPropertyIds()` helper in imports actions with `.range()` pagination loop
- All code paths that trigger screening from an import batch are now paginated

---

## 2026-04-08c — Dashboard: Unreviewed Primes Breakdown and Import Count Fix

### Unreviewed Primes Tile Redesign

- Tile now excludes Closed sales from the unreviewed prime count
- Displays breakdown by MLS status (Active, Coming Soon, Expired, Withdrawn) inside the tile
- Each status line is a clickable link to the screening queue filtered by that status (`/intake/screening?prime=true&mls_status=...`)
- Query changed from `count` to full row fetch with `mls_status` for grouping

### Imported Today Fix

- Fixed "Imported Today" showing 0: was using UTC midnight (`setUTCHours(0,0,0,0)`) which mapped to 6pm Denver time the previous day, excluding all imports made during Denver business hours
- Now calculates local midnight using server timezone offset

---

## 2026-04-08b — Reference Date Fix for Comparable Sales

### Per-Subject Reference Date

Fixed a critical issue where the screening engine used today's date as the reference point for all subjects, causing comps that closed *after* a subject's contract date to appear in results. Example: 2850 Kearney (closed 3/05/26) was returning comps from 3/17/26 and 3/26/26.

- **`bulk-runner.ts`**: Added `resolveSubjectReferenceDate()` — derives a per-subject reference date instead of using a single `new Date()` for the entire batch
- **Date priority**: `purchase_contract_date` → `listing_contract_date` → `close_date` → today
- **Status rules**: Closed and Pending subjects use their contract/close date; Active, Coming Soon, Expired, Withdrawn, and manual entries (no listing) use today
- **`PoolListing` type**: Added `listing_contract_date` and `purchase_contract_date` fields; both listing queries (comp pool and subject listings) now select them
- The existing `if (daysSinceClose < 0) continue` filter in `scoreCompsForSubject` naturally excludes comps that closed after the resolved reference date

---

## 2026-04-08 — Manual Intake, Off-Market Analysis, and Screening Fixes

### Manual Property Entry Redesign

- Restructured manual entry form (`components/intake/manual-entry-form.tsx`) into two-column layout: left column (500px) with Location, Property Details, and Notes panels; right column (460px) with self-contained Pin Location map panel
- Added three new fields required for comparable search: **Level Class** dropdown (One Story, Two Story, Three+ Story, Bi-Level, Multi-Level), **Building Form** dropdown (House, High Rise, Mid Rise, etc.), and **Attached** (Yes/No)
- All three fields persist to `property_physical` via server action

### Manual Properties Enter the Deal Flow

- Removed `source_system = "recolorado"` filter from Recent Import Batches queries — all sources (MLS, manual) now appear in the batches table
- **Migration** `20260407140000`: Added `last_import_batch_id` column to `real_properties`; updated `get_import_batch_property_ids` RPC to union results from both `mls_listings` and `real_properties`, so manual entries are discoverable for screening
- Manual entry action now sets `last_import_batch_id` on the property record
- **Migration** `20260407150000`: Added `data_source` column to `real_properties`, backfilled all existing records with `'mls'`; new manual entries get `data_source: 'manual'`

### Duplicate Property Handling

- Manual entry now checks for existing property by `normalized_address_key` before inserting
- If property exists (e.g., from prior MLS import): updates `last_import_batch_id` only, preserves all existing data
- If new: inserts with `data_source: 'manual'`

### Off-Market / No List Price Analysis

Removed the hard requirement for list price throughout the screening pipeline, enabling analysis of off-market and manually entered properties:

- **`bulk-runner.ts`**: Removed `if (listPrice <= 0) return skipResult(...)` gate; added `costAnchor` fallback (uses ARV when no list price) for downstream cost engines
- **`deal-math.ts`**: `listPrice` now nullable; `maxOffer` always computes (`ARV - costs - profit`); `spread`, `offerPct`, `estGapPerSqft` return `null` when no list price
- **`rehab-engine.ts`** / **`holding-engine.ts`**: Renamed `listPrice` param to `priceAnchor` — accepts list price or ARV fallback for price tier and insurance calculations
- **`qualification-engine.ts`**: Uses `maxOffer` as price anchor when no list price; qualification messages reference "list price" or "max offer" accordingly
- **`types.ts`** / **`lib/reports/types.ts`**: Updated `DealMathResult` and `WorkstationData` types for nullable fields
- **`load-workstation-data.ts`**: Analysis workstation uses same `costAnchor` fallback pattern
- UI formatters (`formatCurrency`, `formatPercent`, `fmtNum`) already handle null → displays "—"

### Comp Search Without MLS Listing

Removed the requirement for a linked MLS listing to run comparable search, enabling comp search on manually entered properties:

- **`lib/comparables/engine.ts`**: `subjectListingRowId` now nullable; listing query skipped when null; defaults to `sourceSystem: "recolorado"` (primary comp pool), reference date falls through to current mode, condition scores at default
- **Server actions** (both `deals/actions.ts` and `analysis/properties/actions.ts`): Removed listing ID validation gate; passes `null` to engine when no listing linked
- **UI**: Removed `disabled={!subjectListingRowId}` from "Run Comp Search" button
- Fixed redirect from non-existent `/deals/watchlist/${analysisId}/comparables` to `/deals/watchlist/${analysisId}`

### Add Comp by MLS Number

- New server action `addManualCompAction`: looks up listing by MLS number, validates it exists and isn't a duplicate, calculates delta metrics (distance, sqft, days, beds, baths, year) relative to subject, inserts as `selected_yn: true` with `source: "manual"` tag
- Input box added to comparable workspace panel above the candidate table (visible when a comp search run exists)

### Closed Listings Retain List Price in Screening

- Bulk runner subject listing query expanded from `Active/Coming Soon/Pending` only to **all statuses**
- Status priority ensures active/pending listings are preferred over closed when both exist
- Closed sales now have their list price available for spread/gap calculations, enabling historical accuracy analysis

### Screening Pagination Fix

- `runImportScreeningAction` RPC call now paginated with `.range()` loop (was hitting PostgREST 1,000-row default cap)
- All properties in large import batches (e.g., 2,346) now screened completely

### Re-Screen Button

- Import batches with existing screening results now show a "Re-screen" button alongside the results link, allowing re-screening after fixes or new data

### Success Banner Link

- Manual entry success message now includes "View Import Batches →" link to `/intake/imports`

---

## 2026-04-07 — Funnel Redesign: Navigation, Promote/Pass, Watch List, Pipeline, Dashboard

### Summary

Complete navigation and workflow redesign implementing the approved Funnel Redesign plan (REDESIGN.md). Separates the application into a Screener side (automated, pre-human) and an Analyst side (curated, human-promoted). Adds a deliberate Promote/Pass gate at the screening stage, a working Watch List for deal management, a Pipeline for active deal-making, and a morning-briefing dashboard.

### Phase 1: Route Restructure

Reorganized the entire URL structure from a single "Analysis" mega-section into five top-level sections.

**New navigation:** Home | Intake | Deals | Reports | Admin

| Old route | New route |
|---|---|
| `/analysis/dashboard` | `/home` |
| `/analysis/imports` | `/intake/imports` |
| `/analysis/queue` | `/intake/screening` |
| `/analysis/screening/[batchId]` | `/intake/screening/[batchId]` |
| `/analysis/screening` (batch mgmt) | Folded into `/intake/imports` |
| `/analysis/analyses` | `/deals/watchlist` |
| `/analysis/properties/[id]/analyses/[analysisId]` | `/deals/watchlist/[analysisId]` |
| `/analysis/properties` | `/admin/properties` |

- Workstation URL simplified from two dynamic segments (`[id]/analyses/[analysisId]`) to one (`[analysisId]`) — propertyId derived from analysis record
- Screening batch management (dataset overview, screen buttons, batch table) merged into imports page
- All old `/analysis/...` URLs redirect to new locations
- All component imports and hardcoded hrefs updated across ~40 files
- Public home page at `/` updated with DataWise logo placeholder

### Phase 2: Promote/Pass Flow

**Database migration** `20260407100000_screening_review_and_promotion.sql`:
- `screening_results`: added `reviewed_at`, `reviewed_by_user_id`, `review_action` (constrained to `promoted`/`passed`), `pass_reason`
- `analysis_pipeline`: added `promoted_at`, `promoted_from_screening_result_id`, `watch_list_note`
- Backfilled existing promoted results; updated `analysis_queue_v` with review columns

**Redesigned screening comp modal** replaces "Begin Analysis" with a two-choice gate:
- **Add to Watch List**: interest level selector (Hot/Warm/Watch), optional note, two confirm buttons ("Save to Watch List" returns to queue, "Save + Open Analysis" opens workstation)
- **Pass on This Property**: required reason from 6 options (Comps too weak, Rehab too heavy, Price too high, Location concern, Already analyzed, Other with free text)
- Deal math summary strip added (ARV, Max Offer, Gap/sqft, Offer%, Rehab, Trend, comp quality stats)
- Already-reviewed results show status instead of action buttons

**Screening queue** defaults to hiding reviewed results with "Unreviewed Only" / "Show All" toggle. Status badges (Watch List/Passed/Ready) on each row.

### Phase 3: Watch List

**Database migration** `20260407110000_watch_list_view.sql`: `watch_list_v` view joining analyses, pipeline, properties, physicals, screening results, and MLS listings with computed `days_on_watch_list`.

**Watch List page** (`/deals/watchlist`) — full working management table:
- Interest level indicator (clickable inline change)
- Address, City, Type, List Price, ARV, Max Offer, Gap/sqft, Comps
- Days on Watch List, Status dropdown (inline), Note (click-to-edit inline)
- Actions: Open workstation, Move to Pipeline, Pass (with reason)
- Default sort: interest level (Hot first), then Gap/sqft descending

**Server actions**: `updateInterestLevelAction`, `updateShowingStatusAction`, `updateWatchListNoteAction`, `passFromWatchListAction`, `moveToPipelineAction`

### Phase 4: Home Dashboard

Rewrote `/home` from old metrics dashboard into four-section morning briefing:

1. **Today at a Glance** — four clickable stat cards: Imported Today, Unreviewed Primes, Watch List count, Pipeline count (red accent when items need action)
2. **Unreviewed Prime Candidates** — top 10 by gap/sqft with inline Review button opening the Promote/Pass modal (client component, no page navigation)
3. **Watch List — Needs Attention** — deals with no activity in 3+ days, Hot interest level, or showings scheduled
4. **Pipeline — Action Required** — offers submitted 3+ days without response, deadlines within 24 hours

### Phase 5: Pipeline + Closed

**Database migration** `20260407120000_pipeline_and_closed_views.sql`:
- `pipeline_v`: active deals in showing/offer/under_contract stages with offer dates and `days_since_update`
- `closed_deals_v`: deals with passed/closed disposition for won/lost tracking

**Pipeline page** (`/deals/pipeline`):
- Stage badges (Showing/Offer/Under Contract), interest level, deal math
- Offer status dropdown (inline: Drafting → Submitted → Accepted → Rejected/Expired)
- Date tracking (submitted, deadline), days idle (amber at 3+)
- Actions: advance stage (→ Offer, → Contract), Close (won/lost with reason), ← Watch List

**Closed page** (`/deals/closed`):
- Won/Lost outcome badges, deal math columns, close date, reason for lost deals
- Won/lost count summary

**Server actions**: `advancePipelineStageAction`, `updateOfferStatusAction`, `closeDealAction`, `moveToWatchListAction`

### Phase 6: Auto-Screening on Import

`previewImportAction` now runs the full pipeline in one step: upload → validate → stage → process into canonical tables → auto-screen. Button changed from "Upload and preview" to "Import" with pending text "Importing, processing, and screening..."

Screening failure is non-fatal — import still succeeds with a note. Success banner shows "Import complete. Processed into core tables. Auto-screened." with "View Prime Candidates →" link. Manual screening buttons retained for ad-hoc re-screening.

### Table Unification and Column Alignment

- Batch results page (`/intake/screening/[batchId]`) and Screening Queue (`/intake/screening`) now use the same `QueueResultsTable` component and identical filter/sort layout
- Columns matched: Map, Status, Prime, Address, City, Type, Change Type, List Date, List Price, ARV, Trend, Spread, Gap/sqft, Comps, Rehab, Hold, Max Offer, Offer%, Detail
- `mls_status` column replaced with `mls_major_change_type` (more detail); MLS Status filter added (broader category)
- "Contract" renamed to "List Date"
- Fixed column alignment: `table-layout: fixed` with explicit `<colgroup>` widths; removed CSS `text-align: left` override on `.dw-table-compact thead th`
- MLS status filter fixed (was querying wrong view)
- 60-day import chart fixed (percentage height not resolving against flex parent)

### Database migrations

- `20260407100000_screening_review_and_promotion.sql`
- `20260407110000_watch_list_view.sql`
- `20260407120000_pipeline_and_closed_views.sql`
- `20260407130000_add_mls_change_type_to_views.sql`

### Full deal lifecycle now operational

```
Import (auto-screen) → Screening Queue (Promote/Pass) → Watch List → Pipeline (Showing → Offer → Contract) → Closed (Won/Lost)
```

---

## 2026-04-06 — Dual Comp Selection: ARV Comparables + As-Is Comparables

### Summary

Split the single "Comparable Sales" tile into two independent selection buckets — **ARV Comparables** and **As-Is Comparables** — on the analysis workstation. Both tiles draw from the same candidate pool (same comp search run), but each maintains its own selection state. ARV comps support after-repair valuation; As-Is comps support current-condition valuation. Click-to-select on map pins works identically in both tiles.

### Architecture

- **Single candidate pool, dual selection flags.** Rather than running separate comp searches, both tiles share the same `comparable_search_candidates` rows from the latest search run. ARV selection uses `selected_yn` (existing); As-Is selection uses the new `selected_as_is_yn` column. This keeps the data model simple — comps are just "buckets" the analyst sorts candidates into.
- **Independent map pin state.** Each tile builds its own map pin array where selected/candidate coloring reflects that tile's selection flag. Clicking a pin in the ARV tile toggles `selected_yn`; clicking in the As-Is tile toggles `selected_as_is_yn`.
- **Separate server actions.** `toggleComparableCandidateSelectionAction` (existing) handles ARV; new `toggleAsIsComparableCandidateSelectionAction` handles As-Is.

### Features

- **Renamed tile:** "Comparable Sales" → "ARV Comparables" with count display
- **New tile:** "As-Is Comparables" placed directly below ARV Comparables with identical layout — map + selected comps table + Copy Selected MLS# button
- **Click-to-select on both maps:** pin click adds/removes comps from the respective bucket
- **As-Is Edit Comps modal:** shows the full candidate list with As-Is checkboxes and ARV selection indicator dots, plus the map with click-to-select. No separate search controls — candidates come from the ARV comp search.
- **`as_is` purpose type** added to `ComparablePurpose` and UI purpose selector for future use

### Database

- Migration `20260406160000_add_selected_as_is_yn.sql` — adds `selected_as_is_yn boolean not null default false` + index to `comparable_search_candidates`

### Modified files

- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` — renamed tile, added As-Is tile + modal, dual map pin arrays, As-Is copy/toggle handlers
- `app/(workspace)/analysis/properties/actions.ts` — new `toggleAsIsComparableCandidateSelectionAction`
- `lib/analysis/load-workstation-data.ts` — fetches `selected_as_is_yn`, computes `asIsCompSummary`
- `lib/reports/types.ts` — added `asIsCompSummary` to `WorkstationData`
- `lib/comparables/scoring.ts` — added `"as_is"` to `ComparablePurpose` type
- `lib/comparables/engine.ts` — `parseComparablePurpose` handles `"as_is"`
- `components/properties/comparable-workspace-panel.tsx` — added `"as_is"` to `UiPurpose`, purpose labels, presets

---

## 2026-04-06 — Reports Feature: PDF-Ready Analysis Reports with Comp Map

### Summary

Full reports workflow enabling analysts to generate professional, PDF-ready analysis reports from completed analyses. Reports are frozen snapshots stored in `analysis_reports.content_json`, rendering subject property details, deal math waterfall, rehab budget, comparable sales table with numbered pins on an interactive map, and public analysis notes — all branded with the DataWise logo.

### Architecture

- **Reports are snapshots** — `content_json` freezes analysis state at generation time. Reports never re-query live data, making them stable and shareable.
- **Shared data loading** — Extracted ~570 lines of data loading + computation from the analysis page into `lib/analysis/load-workstation-data.ts`. Both the analysis workstation and report generation call the same function, ensuring the snapshot matches what the analyst sees.
- **Shared formatters** — `fmt`, `fmtNum`, `fmtPct` extracted from the workstation to `lib/reports/format.ts` for reuse across workstation and report components.
- **Shared types** — `WorkstationData`, `ReportContentJson`, and all sub-types (`RehabDetail`, `HoldingDetail`, etc.) centralized in `lib/reports/types.ts`.

### Features

- **Generate Report button** on the analysis workstation header bar. Opens a dialog to confirm the report title, then snapshots current analysis data and redirects to the report view.
- **Report viewer** at `/reports/[reportId]` renders a clean, professional document with DataWise branding, print-optimized layout.
- **Print / Save PDF** button triggers browser print with custom `@media print` CSS that hides app chrome, preserves map/marker colors, and formats for letter-size pages.
- **Report Library** at `/reports` lists all reports grouped by property with title, type, date, and view links.
- **Comp map in reports** — same `CompMap` component used elsewhere, rendered with selected comps only (no interactivity). Subject = red pin, comps = numbered green pins.
- **Numbered comp cross-reference** — each comparable sale is numbered (#1, #2, ...) in the table with a green badge, and the corresponding map pin displays the same number inside the marker.
- **Print color preservation** — `print-color-adjust: exact` applied to map tiles, markers, and report badges so colors render correctly in PDF output.

### Report document sections

1. Header with DataWise logo, strategy type, generation date
2. Subject property details (type, sqft, beds/baths, year built, lot, list price)
3. Deal math summary cards (ARV, Max Offer, Spread, Gap/SqFt) + full waterfall + cash required
4. Rehab budget (scope, multiplier, line items)
5. Holding & transaction cost breakdown
6. Comparable sales table (numbered) with summary stats + interactive map with numbered pins
7. Public analysis notes
8. Footer with DataWise branding

### Future-ready

- `analysis_reports.access_token` column + anon RLS policy already support password-protected public report sharing (not yet wired up).
- `ReportContentJson.staticMapUrl` field reserved for future static map image API integration.
- `MapPin.pinLabel` is generic — can be used for any labeling need beyond reports.

### New files

- `lib/reports/types.ts` — `ReportContentJson`, `WorkstationData`, shared sub-types
- `lib/reports/format.ts` — shared formatting utilities
- `lib/reports/snapshot.ts` — `buildReportSnapshot()` converts workstation data to report JSON
- `lib/analysis/load-workstation-data.ts` — extracted data loading + computation
- `app/(workspace)/reports/actions.ts` — `generateReportAction`, `deleteReportAction`
- `app/(workspace)/reports/[reportId]/page.tsx` — report viewer route
- `app/(workspace)/reports/[reportId]/report-viewer.tsx` — client component with print/delete
- `components/reports/report-document.tsx` — full report layout
- `public/logos/datawise-logo.png` — DataWise logo for report headers

### Modified files

- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/page.tsx` — simplified from ~620 to ~30 lines using `loadWorkstationData()`
- `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/analysis-workstation.tsx` — types/formatters extracted to shared modules, Generate Report button + dialog added
- `app/(workspace)/reports/page.tsx` — replaced placeholder with full Report Library
- `app/globals.css` — `@media print` block with color preservation
- `components/layout/app-chrome.tsx` — `data-print-hide` on header bars
- `components/properties/comp-map.tsx` — `pinLabel` field on `MapPin`, `numberedIcon()` for labeled markers

---

## 2026-04-06 — Screen Unscreened, Import-Linked Screening, Dashboard & Lifecycle

### Summary

Three-phase feature set that tightens the import → screen → act workflow. Users can now screen only new/unscreened properties instead of re-screening all ~6,500 listings, link screening batches directly to imports for 1-click post-import screening, and track the full opportunity lifecycle from a new Dashboard page.

### Phase 1: Screen Unscreened + Dataset Metrics

- **Dataset Overview** section added to the Screening page showing property counts by MLS status (Active, Coming Soon, Pending, Closed, etc.) plus an "Unscreened" count.
- **"Screen Unscreened (N)"** primary action button screens only Active/Coming Soon properties with no existing screening results. Existing "Screen All" buttons demoted to secondary.
- New `mls_status_counts_v` database view for status breakdown.
- New `count_unscreened_properties()` and `get_unscreened_property_ids()` Postgres RPC functions using `NOT EXISTS` anti-join against `screening_results` — avoids the Supabase `.in()` limit on large ID sets.
- `runScreeningAction` now accepts a `filter_mode` hidden field (`"all"` or `"unscreened"`).

### Phase 2: Import-Linked Screening

- **"Screen Imported Listings"** button on the imports page success banner after processing a batch.
- **"Screening" column** added to the imports Recent Batches table — shows a "Screen" button for unscreened imports, or a link to screening results with screened/prime counts for already-screened imports.
- New `runImportScreeningAction` server action that screens only properties from a specific import batch, sets `source_import_batch_id` and `trigger_type: "import"` on the screening batch.
- **Import context banner** on screening batch results page when the batch was triggered from an import.
- **"Import" badge** in the Trigger column of the screening batches table with link back to imports.
- New `get_import_batch_property_ids()` Postgres RPC function.

### Phase 3: Dashboard & Lifecycle Tracking

- **New `/analysis/dashboard` page** with four sections:
  - **Top-level stats:** Active, Coming Soon, Unscreened, Total Screened, Prime Candidates.
  - **Deal Pipeline funnel:** Analysis → Showing → Offer → Under Contract → Closed → Project → Completed.
  - **Daily Scorecard (7 days):** Per-day counts of imports, listings, screened, prime, promoted. Today's row highlighted.
  - **Recent Import Outcomes:** For each import — listings imported, screened count, prime found, promoted count, link to results.
- **Dashboard tab** added as first tab in Analysis navigation.
- **Lifecycle stage tracking:** `lifecycle_stage` and `disposition` columns added to `analysis_pipeline`. Promotion now initializes pipeline with `lifecycle_stage: "analysis"`, `disposition: "active"`.
- New `dashboard_pipeline_summary_v` view, `import_outcomes_v` view, and `get_daily_scorecard()` RPC function.

### Database migrations

- `20260406100000_unscreened_and_status_metrics.sql`
- `20260406120000_import_screening_linkage.sql`
- `20260406140000_dashboard_lifecycle.sql`

### Files changed

- `app/(workspace)/analysis/screening/actions.ts` — filter_mode support, import screening action, lifecycle on promotion
- `app/(workspace)/analysis/screening/page.tsx` — dataset overview, unscreened button, import badge in batch table
- `app/(workspace)/analysis/screening/[batchId]/page.tsx` — import context banner
- `app/(workspace)/analysis/imports/page.tsx` — screen button on success banner, screening column in batches table
- `app/(workspace)/analysis/dashboard/page.tsx` — new dashboard page
- `components/layout/app-chrome.tsx` — Dashboard tab in nav

---

## 2026-04-06 — Analysis Workstation Layout Redesign + MLS Copy Buttons

### Summary

Redesigned the analysis workstation from a 5-column horizontal layout into a 3-column layout (`260px | 1fr | 330px`) that fits entirely on a single desktop screen. Grouped related tiles logically, elevated high-priority controls (Notes, Pipeline, Overrides) to always-visible positions, and demoted low-priority tiles (Holding, Transaction) into a collapsible detail section. Added MLS# quick-copy buttons to the Comparable Sales tile.

### Layout changes

- **Left column (260px):** Deal Math waterfall → Financing → Cash Required → Hold & Trans Detail (collapsed by default). Groups all financial summary tiles in one vertical spine.
- **Center column (flexible):** ARV + Price Trend side-by-side → Comparable Sales (map + table, reduced to 250px height) → Notes. Keeps valuation and comp data front-and-center.
- **Right column (330px):** Rehab (single-column line items, ready for future tall/thin detail expansion) → Overrides → Pipeline. Puts analyst input controls always on-screen.
- **Holding & Transaction** collapsed behind a toggle button — totals already visible in the Deal Math waterfall, breakdowns available on demand.

### MLS# quick-copy buttons

- Added **Copy All MLS#** and **Copy Selected MLS#** buttons to the Comparable Sales tile header, alongside the existing Edit Comps button.
- Uses `font-mono text-[11px]` matching the style from the Comparable Selection modal.
- Brief "Copied!" confirmation on click, same pattern as the modal's quick-copy fields.

### Design decisions

- **Single-screen priority.** Notes, Pipeline, and Overrides were previously below the fold — now always visible without scrolling.
- **Rehab right column.** Positioned for planned future expansion into a taller, more detailed breakdown.
- **Hold/Trans collapsible.** Least-used tiles; totals are redundant with the Deal Math waterfall, so full breakdowns are one click away but don't consume space by default.

---

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

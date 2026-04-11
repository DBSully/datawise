# Phase 1 — Step 3B — Route Restructure

> **Goal:** Move the canonical Watch List route to `/analysis` and the canonical Pipeline route to `/action`, mirroring the `Intake → Screening → Analysis → Action` deal flow. The current Workstation logic stays exactly as-is during 3B — only its URL home moves. Side-by-side rollout per Decision 6.6: both old and new paths work throughout 3B-3E; legacy redirects activate in 3F.
> **Status:** DRAFT — awaiting Dan's review before execution
> **Authority:** Implementation against `WORKSTATION_CARD_SPEC.md` (locked) + `PHASE1_STEP3_MASTER_PLAN.md` §3 (3B scope) + completion of Phase 1 Step 3A
> **Date:** 2026-04-11
> **Risk level:** Medium — mechanical file moves and link updates; main risk is missing a reference and creating a redirect loop or broken navigation
> **Estimated scope:** 0 SQL migrations, ~3 new route files, ~2-4 modified legacy redirect files, ~17 files with internal link updates, 1 navigation update

---

## 1. What 3B Accomplishes

3B is the mechanical sub-step of Step 3. Five things:

1. **Create the canonical Analysis route at `/analysis`** — replaces the existing stub redirect. This becomes the Watch List index page (the list of properties promoted from screening that the analyst is actively underwriting).

2. **Create the canonical Workstation route at `/analysis/[analysisId]`** — new route file. Imports and renders **the same Workstation component** the current `/deals/watchlist/[analysisId]` route uses. Both routes work side-by-side and show identical UI throughout 3B-3E.

3. **Create the canonical Action route at `/action`** — replaces the current `/deals/pipeline` and `/deals/closed` pages. Single page with a status filter (`?status=active` default, `?status=closed` for closed deals).

4. **Update navigation** in `components/layout/app-chrome.tsx` — add `Analysis` and `Action` to the primary nav between `Screening` and `Reports`. Keep `Deals` in nav alongside them during the side-by-side period (removed in 3F).

5. **Update internal links** across the codebase — every `Link href="/deals/watchlist/..."`, `redirect("/deals/...")`, `revalidatePath("/deals/...")`, etc., updated to point at the new `/analysis` or `/action` paths. About 17 files touched.

**3B explicitly does NOT do these things — they belong to later sub-steps:**

| Out of scope | Belongs to |
|---|---|
| Building the new Workstation card layout | 3E |
| Component extraction (`<CompWorkspace>`, `<DetailCard>`, etc.) | 3C |
| Auto-persist infrastructure (`useDebouncedSave`, etc.) | 3D |
| Deleting `/deals/watchlist/*` and `/deals/pipeline` | 3F (they become real redirects then, not before) |
| Removing `Deals` from nav | 3F |
| Any database changes | None — 3B is pure routing |
| Deleting the legacy `/admin/properties/new` redirect | Already done — file is already a redirect to `/intake/manual` |
| Changes to `/screening`, `/intake/imports`, `/admin/properties`, `/reports`, `/home` | None — these routes don't move |

---

## 2. The #1 Constraint

**Every existing analyst workflow must keep working unchanged, AND the new routes must work side-by-side with the old ones.** The side-by-side requirement is a stronger constraint than just "don't break anything" because it means Dan can use either path during 3B-3E and they should be functionally identical.

The two areas with the highest risk:

- **The new `/analysis/[analysisId]` route must serve exactly the same UI** as the current `/deals/watchlist/[analysisId]`. The simplest way to guarantee this is to make both routes import the same Workstation component module — there's literally no UI duplication. Any divergence between the two routes during 3B is a bug.
- **Link updates across the codebase must be complete.** A missed link means the app navigates back to old routes from the new ones, which is confusing. The grep-and-replace must be exhaustive.

---

## 3. Risk & Rollback

| Workstream | Risk | Why | Mitigation |
|---|---|---|---|
| New `/analysis` route shells (page.tsx files) | Low | Pure new files; both routes work in parallel; no destructive change | Build verification + manual smoke test |
| New `/action` route | Low-Medium | Combines two pages (`/deals/pipeline` and `/deals/closed`) into one with a status filter; risk of subtly different behavior | Side-by-side allows comparison; manual workflow test |
| Legacy `/analysis/*` redirect updates | Very Low | Two existing redirect files chain through `/deals/watchlist`; updating their target removes a hop | Verify the updated redirect chain end-to-end in the browser |
| Navigation update | Low | Adding nav items doesn't break existing links | Visual inspection in browser |
| Internal link updates (~17 files) | Medium | Many files, easy to miss one; risk of stale `/deals/*` links inside the new `/analysis` UI | Exhaustive grep + per-file review + smoke test that no `/deals/*` link appears outside the legacy `/deals` directory |

**Rollback procedure:**

3B is purely additive at the route level (the old routes still work) plus link updates (which can be reverted via Git). To roll back 3B:

1. `git revert` the 3B commits in reverse order
2. The `/analysis` and `/action` paths return to their pre-3B state (mostly stub redirects)
3. The `Deals` nav stays (or gets put back) — old paths continue working

**Catastrophic rollback:** if everything goes badly, `phase1-step2-complete` is the recovery point. But 3B's risk profile is low enough that I don't expect needing a full rollback — individual commit reverts should be sufficient.

---

## 4. Existing `/analysis` Namespace — Important Context

Before drafting the work, I want to capture what's already in the `app/(workspace)/analysis/` directory because it shapes the implementation. Several routes exist here as **legacy redirect shells from a previous reorganization** earlier in the session:

| File | Current target | 3B treatment |
|---|---|---|
| `analysis/page.tsx` | `redirect("/home")` | **REPLACE** — becomes the new Watch List index page (the canonical Analysis stage entry) |
| `analysis/dashboard/page.tsx` | `redirect("/home")` | **KEEP** — already correct |
| `analysis/imports/page.tsx` | `redirect("/intake/imports")` | **KEEP** — already correct |
| `analysis/queue/page.tsx` | `redirect("/screening")` | **KEEP** — already correct (we updated this earlier in the session) |
| `analysis/screening/page.tsx` | `redirect("/intake/imports")` | **KEEP** (or revisit — was updated earlier) |
| `analysis/screening/[batchId]/page.tsx` | `redirect("/screening/[batchId]")` | **KEEP** — already correct |
| `analysis/screening/[batchId]/[resultId]/page.tsx` | `redirect("/screening/[batchId]/[resultId]")` | **KEEP** — already correct |
| `analysis/analyses/page.tsx` | `redirect("/deals/watchlist")` | **UPDATE** target → `/analysis` |
| `analysis/properties/[id]/analyses/[analysisId]/page.tsx` | `redirect("/deals/watchlist/[analysisId]")` | **UPDATE** target → `/analysis/[analysisId]` |
| `analysis/properties/page.tsx`, `analysis/properties/[id]/page.tsx`, etc. | (probably redirects) | **KEEP or UPDATE** — verify each |

The two `UPDATE` rows are interesting: they're legacy redirects that currently chain through `/deals/watchlist` to get to the canonical Workstation. In 3B, the canonical Workstation IS at `/analysis/[analysisId]`, so the chain becomes a single hop.

**New files to create that don't already exist:**
- `app/(workspace)/analysis/[analysisId]/page.tsx` — the new Workstation route. The directory `analysis/[analysisId]/` doesn't exist yet.
- `app/(workspace)/action/page.tsx` — the new Action page. The directory `action/` doesn't exist yet.

---

## 5. Application Code Changes

Six workstreams, all TypeScript/React (no schema migrations).

### 5.1 New `/analysis/page.tsx` (REPLACE existing stub)

Currently this file is a 5-line redirect to `/home`. 3B replaces it with the actual Watch List page.

**The simplest implementation:** import the same component the current `/deals/watchlist/page.tsx` uses, render it. Both pages render identical UI from a shared component.

**Approach:**

1. Read `app/(workspace)/deals/watchlist/page.tsx` to see what it does
2. Identify the components, queries, and props it uses
3. Either:
   - **(a) Copy the file contents to `app/(workspace)/analysis/page.tsx`** — both pages exist with identical code; small duplication
   - **(b) Refactor: extract the page logic into a shared module** that both files import — zero duplication but more refactoring
   - **(c) Make `/deals/watchlist/page.tsx` a thin wrapper that re-exports the new `/analysis/page.tsx`** — keeps duplication zero and signals which is the canonical version

My recommendation: **(c)** — `/analysis/page.tsx` becomes the canonical implementation; `/deals/watchlist/page.tsx` becomes a thin re-export. This gives us one source of truth with both URLs working. In 3F when the legacy redirect activates, the old re-export file becomes a `redirect()` call.

**File contents (sketch):**

```typescript
// app/(workspace)/analysis/page.tsx — NEW canonical Watch List route
// Replaces the previous stub redirect to /home.

// (full Watch List page implementation — copied from deals/watchlist/page.tsx
//  with all imports updated to use the new file's location)
```

```typescript
// app/(workspace)/deals/watchlist/page.tsx — thin wrapper during 3B-3E
// In 3F this becomes `export default function() { redirect('/analysis'); }`

export { default } from "@/app/(workspace)/analysis/page";
```

🟢 **DECIDED 5.1 — (c) Thin re-export.** New canonical files at the `/analysis` path own the implementation. Old files at `/deals/watchlist/*` become one-line wrappers: `export { default } from "@/app/(workspace)/analysis/page"`. Zero code duplication, single source of truth. In 3F the wrapper becomes a `redirect()` call.

### 5.2 New `/analysis/[analysisId]/page.tsx`

This is the new Workstation route. **Same approach as 5.1** — identical UI, side-by-side rollout.

`/deals/watchlist/[analysisId]/page.tsx` currently loads `WorkstationData`, renders the workstation client component, and handles ParamPromise. 3B copies this file structure to `/analysis/[analysisId]/page.tsx` (the new canonical home) and turns the old path into a thin re-export.

```typescript
// app/(workspace)/analysis/[analysisId]/page.tsx — NEW canonical Workstation route
// Side-by-side with /deals/watchlist/[analysisId] until 3F.

// (full Workstation page implementation — server component that loads
//  WorkstationData and renders the Workstation client component)
```

```typescript
// app/(workspace)/deals/watchlist/[analysisId]/page.tsx — thin wrapper during 3B-3E
// In 3F this becomes a redirect to /analysis/[analysisId].

export { default } from "@/app/(workspace)/analysis/[analysisId]/page";
```

**Important:** the Workstation **client component itself** (`analysis-workstation.tsx`) is NOT moved in 3B. It stays at `app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx` for now. Both new and old routes import it from there. **3E will create a NEW Workstation component file** at `app/(workspace)/analysis/[analysisId]/analysis-workstation.tsx` (or similar) and the new page.tsx will import from there. The old page.tsx (still a wrapper at this point) will keep importing from the old path. They diverge naturally.

This is the cleanest implementation of side-by-side: both pages use the same component during 3B-3E, then 3E.1 swaps the new page's component import while the old page is unaffected.

### 5.3 New `/action/page.tsx`

The new Action route. Combines the current `/deals/pipeline` and `/deals/closed` pages into a single page with a status filter.

**Current state:**
- `/deals/pipeline/page.tsx` — shows active deals in showing/offer/under-contract stages
- `/deals/closed/page.tsx` — shows closed deals
- They use different table components (`pipeline-table.tsx` and presumably a closed-deals table)

**3B implementation:**

```typescript
// app/(workspace)/action/page.tsx
type ActionPageProps = {
  searchParams?: Promise<{ status?: string }>;
};

export default async function ActionPage({ searchParams }: ActionPageProps) {
  const resolved = searchParams ? await searchParams : undefined;
  const status = resolved?.status === "closed" ? "closed" : "active";

  if (status === "closed") {
    // Render closed deals — same as /deals/closed/page.tsx today
    return <ClosedDealsContent />;
  }

  // Render active pipeline — same as /deals/pipeline/page.tsx today
  return <PipelineContent />;
}
```

The two old pages become thin wrappers (or stay as-is and use the same content components). The Action page's nav state shows two tab toggles (Active | Closed) that switch the `?status=` query param.

🟢 **DECIDED 5.2 — (a) Single page with `?status=active|closed` query param.** Default status is `active` (the pipeline view). `?status=closed` switches to closed deals. URLs are shareable. The Action section nav has tab toggles for Active and Closed that switch the query param.

### 5.4 Update legacy `/analysis/*` redirect targets

Two existing redirect files chain through `/deals/watchlist`. 3B updates them to point at `/analysis` directly:

```typescript
// app/(workspace)/analysis/analyses/page.tsx — UPDATE target
// Was: redirect("/deals/watchlist")
// Now: redirect("/analysis")

import { redirect } from "next/navigation";
export default function LegacyAnalysesRedirect() {
  redirect("/analysis");
}
```

```typescript
// app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/page.tsx — UPDATE target
// Was: redirect(`/deals/watchlist/${analysisId}`)
// Now: redirect(`/analysis/${analysisId}`)

import { redirect } from "next/navigation";
type Props = { params: Promise<{ id: string; analysisId: string }> };
export default async function LegacyAnalysisRedirect({ params }: Props) {
  const { analysisId } = await params;
  redirect(`/analysis/${analysisId}`);
}
```

**Verification check during 3B:** other files in `app/(workspace)/analysis/properties/` may also redirect to `/deals/*` paths. I'll grep them all and update each.

### 5.5 Update navigation in `app-chrome.tsx`

Current primary nav: `Home | Intake | Screening | Deals | Reports | Admin`

New primary nav: `Home | Intake | Screening | Analysis | Action | Reports | Admin`

The `Deals` nav item is **REMOVED** in 3B per Decision 5.3. The old `/deals/*` routes still work (they become thin re-export wrappers via Decision 5.1) but they're not surfaced in nav. Analysts use Analysis and Action; if they need to hit a legacy URL they can still type it directly or use a bookmark.

🟢 **DECIDED 5.3 — (b) Remove `Deals` from nav now.** Stronger commitment to the new structure. The old routes still work via thin re-export wrappers (Decision 5.1) and remain bookmarkable, but the nav surface only shows the canonical paths. Section configs and page label entries for `/deals/*` are also removed in 3B. Analysts adjust to the new nav layout immediately.

**New section configs for `getSectionConfig()`:**

```typescript
if (pathname.startsWith("/analysis")) {
  return {
    title: "Analysis",
    subtitle: "Deep underwriting of promoted properties — comps, ARV, rehab, deal math.",
    tabs: [{ href: "/analysis", label: "Watch List" }],
  };
}

if (pathname.startsWith("/action")) {
  return {
    title: "Action",
    subtitle: "Deals being moved to closing — showings, offers, contract, close.",
    tabs: [
      { href: "/action", label: "Pipeline" },
      { href: "/action?status=closed", label: "Closed" },
    ],
  };
}
```

**`getPageLabel()` additions:**

```typescript
if (pathname === "/analysis") return "Watch List";
if (pathname.startsWith("/analysis/")) return "Workstation";
if (pathname === "/action") return "Pipeline";
// (for /action?status=closed, page label resolution doesn't see query
//  params — handled separately in the page header)
```

### 5.6 Update internal links across the codebase

Grep showed ~17 source files (excluding planning docs) that reference `/deals/watchlist`, `/deals/pipeline`, or `/deals/closed`. Each needs to be updated to use the new path.

**Files to update:**

| File | What's referenced | New target |
|---|---|---|
| `components/screening/queue-results-table.tsx` | `/deals/watchlist/${id}` link in Watch List badge | `/analysis/${id}` |
| `components/screening/screening-comp-modal.tsx` | `/deals/watchlist/${id}` link from "Open Analysis" button | `/analysis/${id}` |
| `components/screening/batch-results-table.tsx` | `/deals/watchlist/${id}` links | `/analysis/${id}` |
| `components/properties/analysis-workspace-nav.tsx` | (unknown — needs inspection) | (depends) |
| `app/(workspace)/deals/watchlist/watch-list-table.tsx` | `/deals/watchlist/${id}` row links | `/analysis/${id}` |
| `app/(workspace)/deals/watchlist/actions.ts` | `revalidatePath("/deals/watchlist")` calls | `revalidatePath("/analysis")` |
| `app/(workspace)/deals/actions.ts` | Various `/deals/*` references | `/analysis/*` |
| `app/(workspace)/deals/closed/page.tsx` | (will become a thin wrapper or unchanged for now) | (unchanged in 3B per side-by-side) |
| `app/(workspace)/deals/pipeline/pipeline-table.tsx` | Row links | `/action/[id]` (TBD if there's a per-deal route in Action) |
| `app/(workspace)/deals/pipeline/actions.ts` | `revalidatePath` calls | `revalidatePath("/action")` |
| `app/(workspace)/home/page.tsx` | Dashboard links to watch list / pipeline | `/analysis` and `/action` |
| `app/(workspace)/screening/[batchId]/[resultId]/page.tsx` | "Open Analysis" link after promotion | `/analysis/${id}` |
| `app/(workspace)/screening/actions.ts` | Possibly redirects after promotion | `/analysis/${id}` |
| `app/(workspace)/admin/properties/[id]/page.tsx` | Possibly links to per-property analyses | `/analysis/${id}` |
| `app/(workspace)/analysis/properties/actions.ts` | (legacy actions — investigate) | (investigate) |

I'll do a clean grep at the start of the link-update task to make sure I have a complete list before I start editing.

**Update philosophy:** every link that the application USES internally is updated to the new path. The OLD `/deals/*` files themselves are NOT touched (they keep working). After 3B, when the analyst clicks "Watch List" in the nav or "Open Analysis" from a screening result, they go to `/analysis/*`. They can still type `/deals/watchlist` directly into the URL bar and it'll work.

### 5.7 Server action `revalidatePath` updates

Server actions that revalidate `/deals/watchlist` or similar paths need to ALSO revalidate the new `/analysis` paths so the new routes pick up fresh data after writes.

**The simplest approach:** keep the old `revalidatePath` calls AND add new ones. Both routes get refreshed.

```typescript
// Before:
revalidatePath("/deals/watchlist");

// After:
revalidatePath("/deals/watchlist");
revalidatePath("/analysis");
```

In 3F (when the old routes are pure redirects), the `/deals/watchlist` revalidatePath becomes redundant and can be removed.

**Files affected:** the actions.ts files identified in §5.6.

---

## 6. Ordered Task List

Each task is independently committable.

### Phase A — New canonical routes (3 commits)

**Task 1:** Create `app/(workspace)/analysis/page.tsx` — replace the existing stub redirect with the new canonical Watch List page. Convert `app/(workspace)/deals/watchlist/page.tsx` into a thin re-export.
- Verification: `npm run build` passes; `/analysis` loads with the Watch List; `/deals/watchlist` also loads with the same UI

**Task 2:** Create `app/(workspace)/analysis/[analysisId]/page.tsx` — new canonical Workstation route. Convert `app/(workspace)/deals/watchlist/[analysisId]/page.tsx` into a thin re-export. Both paths render the same Workstation client component (which still lives at the old path).
- Verification: `/analysis/[id]` loads a Workstation; `/deals/watchlist/[id]` loads the same Workstation

**Task 3:** Create `app/(workspace)/action/page.tsx` — new Action route with `?status=active|closed` query handling. Both old `/deals/pipeline` and `/deals/closed` pages can be left as-is OR converted to thin wrappers.
- Verification: `/action` loads the active pipeline; `/action?status=closed` loads closed deals; old paths still work

### Phase B — Legacy redirect updates + nav (2 commits)

**Task 4:** Update legacy `/analysis/*` redirect targets. Two files (`analysis/analyses/page.tsx` and `analysis/properties/[id]/analyses/[analysisId]/page.tsx`) currently point at `/deals/watchlist`. Update them to point at `/analysis` directly.
- Verification: each updated file's redirect lands on the new path

**Task 5:** Update navigation in `components/layout/app-chrome.tsx`. Add `Analysis` and `Action` to primaryNav. Add section configs for `/analysis` and `/action`. Add page label entries. Keep `Deals` in nav during the side-by-side period.
- Verification: nav shows the new items; clicking each goes to the right route; existing `Deals` nav still works

### Phase C — Internal link updates (1 large commit or 2 smaller)

**Task 6:** Grep + update every internal reference to `/deals/watchlist`, `/deals/pipeline`, `/deals/closed` across the codebase. Update `revalidatePath` calls in actions.ts files to revalidate BOTH old and new paths.
- Verification: smoke test of every workflow that links to a workstation or pipeline page; no `/deals/*` href appears in the new `/analysis` UI; both old and new links work

### Phase D — Verification + commit (2 commits)

**Task 7:** Manual smoke test of all routes and workflows. Walk through the verification checklist in §8.

**Task 8:** CHANGELOG entry for 3B + push to origin.

---

## 7. Files Touched

| File | Type | Why |
|---|---|---|
| `app/(workspace)/analysis/page.tsx` | EDIT (replaces stub) | New canonical Watch List route |
| `app/(workspace)/analysis/[analysisId]/page.tsx` | NEW | New canonical Workstation route |
| `app/(workspace)/action/page.tsx` | NEW | New canonical Action route |
| `app/(workspace)/deals/watchlist/page.tsx` | EDIT (becomes wrapper) | Thin re-export of /analysis/page.tsx during side-by-side |
| `app/(workspace)/deals/watchlist/[analysisId]/page.tsx` | EDIT (becomes wrapper) | Thin re-export of /analysis/[analysisId]/page.tsx during side-by-side |
| `app/(workspace)/deals/pipeline/page.tsx` | (decision) | Wrapper or unchanged |
| `app/(workspace)/deals/closed/page.tsx` | (decision) | Wrapper or unchanged |
| `app/(workspace)/analysis/analyses/page.tsx` | EDIT | Update redirect target → /analysis |
| `app/(workspace)/analysis/properties/[id]/analyses/[analysisId]/page.tsx` | EDIT | Update redirect target → /analysis/[analysisId] |
| `components/layout/app-chrome.tsx` | EDIT | Add Analysis and Action nav + section configs |
| `components/screening/queue-results-table.tsx` | EDIT | Link update |
| `components/screening/screening-comp-modal.tsx` | EDIT | Link update |
| `components/screening/batch-results-table.tsx` | EDIT | Link update |
| `components/properties/analysis-workspace-nav.tsx` | EDIT (verify) | Possible link update |
| `app/(workspace)/deals/watchlist/watch-list-table.tsx` | EDIT | Row link update |
| `app/(workspace)/deals/watchlist/actions.ts` | EDIT | revalidatePath updates |
| `app/(workspace)/deals/actions.ts` | EDIT | Various link updates |
| `app/(workspace)/deals/pipeline/pipeline-table.tsx` | EDIT | Row link updates |
| `app/(workspace)/deals/pipeline/actions.ts` | EDIT | revalidatePath updates |
| `app/(workspace)/home/page.tsx` | EDIT | Dashboard link updates |
| `app/(workspace)/screening/[batchId]/[resultId]/page.tsx` | EDIT | Open Analysis link |
| `app/(workspace)/screening/actions.ts` | EDIT | Possibly redirect target |
| `app/(workspace)/admin/properties/[id]/page.tsx` | EDIT (verify) | Possible link update |
| `app/(workspace)/analysis/properties/actions.ts` | EDIT (verify) | Investigate |
| `CHANGELOG.md` | EDIT | Phase 1 Step 3B entry |

**Approximate count:** 3 new files + ~20 modified files + 1 changelog = ~24 files touched.

**NOT modified in 3B:**
- The Workstation client component itself (`app/(workspace)/deals/watchlist/[analysisId]/analysis-workstation.tsx`) — stays at the old path during 3B-3E; 3E creates a new component file at the new path
- Any business logic, calculation engines, comp loaders
- Any component under `components/properties/` (other than possible link updates)
- Any route under `/screening`, `/intake`, `/admin`, `/reports`, `/home` (other than internal link updates)
- The proxy.ts middleware (no path changes — `/analysis` and `/action` are correctly auth-gated by default since they're not in `PUBLIC_PATHS`)

---

## 8. Verification Checklist

After every Phase A and Phase B task, run through this. After Phase C (link updates), run through it again as a regression check.

### Build verification

- [ ] `npm run build` passes
- [ ] No TypeScript errors

### Route verification — both side-by-side paths work

For each pair, confirm both URLs render the same UI:

- [ ] `/analysis` and `/deals/watchlist` both show the Watch List with all promoted properties
- [ ] `/analysis/[some-id]` and `/deals/watchlist/[some-id]` both open the Workstation with comp map, deal math, etc.
- [ ] `/action` and `/deals/pipeline` both show the active pipeline
- [ ] `/action?status=closed` and `/deals/closed` both show closed deals

### Navigation verification

- [ ] Primary nav now shows: `Home | Intake | Screening | Analysis | Action | Reports | Admin` — **`Deals` is removed**
- [ ] Clicking `Analysis` goes to `/analysis`
- [ ] Clicking `Action` goes to `/action`
- [ ] Section subheader for `/analysis` shows "Analysis" + the Watch List tab
- [ ] Section subheader for `/action` shows "Action" + Pipeline / Closed tabs
- [ ] Old `/deals/*` URLs still work when typed directly (verified in the bookmark test below)

### Internal link regression check

Open the browser dev tools network tab and click around. Then check:

- [ ] Promoting a property from the screening modal goes to `/analysis/[id]` (NOT `/deals/watchlist/[id]`)
- [ ] Watch List row clicks go to `/analysis/[id]`
- [ ] Dashboard links to "Watch List" go to `/analysis`
- [ ] Dashboard links to "Pipeline" go to `/action`
- [ ] After saving a manual analysis override, the page revalidates correctly
- [ ] After updating pipeline status, the page revalidates correctly
- [ ] After adding a note, the note appears on reload

### Existing analyst workflow regression check (the critical part)

- [ ] Sign in works
- [ ] `/home` dashboard loads with daily metrics
- [ ] `/screening` queue loads correctly (the interim queue fix is still in effect)
- [ ] Open one Workstation via the new `/analysis/[id]` path → renders identically to the old path
- [ ] Manual override save still works
- [ ] Notes still display correctly
- [ ] Pipeline status save still works
- [ ] Generate Report still works
- [ ] No console errors

### Optional but nice — direct URL bookmark test

- [ ] Type `/analysis/[some-id]` directly in the URL bar → loads the Workstation
- [ ] Type `/deals/watchlist/[some-id]` directly → also loads the Workstation
- [ ] Type `/action?status=closed` → loads closed deals view
- [ ] Sign out, type `/analysis` directly → redirects to `/auth/sign-in?next=/analysis` (proxy auth still works)

---

## 9. Definition of Done

3B is complete when:

1. All new routes (`/analysis`, `/analysis/[analysisId]`, `/action`) are functional and serve the same UI as their legacy counterparts
2. Navigation has been updated with the new items
3. All internal links across the codebase point at the new paths
4. Both old and new URLs work side-by-side (no redirect loops, no broken links)
5. Every box in §8 is checked
6. CHANGELOG has a Phase 1 Step 3B entry
7. All commits pushed to origin
8. No regression in any existing analyst workflow

---

## 10. What 3C Builds On Top

3C (Component Extraction) is the next sub-step. It pulls shared components out of `ScreeningCompModal` and the current Workstation so the new Workstation in 3E can reuse them. 3C doesn't depend on 3B in any blocking way — they're independent — but doing 3B first means the new `/analysis/[analysisId]` route is already live and 3E can build the new Workstation directly into it.

---

## 11. Open Questions — RESOLVED

🟢 **5.1 — DECIDED:** (c) Thin re-export. Old `/deals/*` files become `export { default } from "@/app/(workspace)/analysis/page"` style wrappers. Zero duplication.

🟢 **5.2 — DECIDED:** (a) Single `/action` page with `?status=active|closed` query param.

🟢 **5.3 — DECIDED:** (b) Remove `Deals` from nav now. Old routes still work via the wrapper pattern but are not surfaced in nav. Analysts adjust to the new layout immediately.

All decisions locked 2026-04-11. Ready to execute.

---

*Drafted by Claude Opus | 2026-04-11 | Awaiting Dan's review before execution*

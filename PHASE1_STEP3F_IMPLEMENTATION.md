# Phase 1 — Step 3F — Cleanup

> **Goal:** Retire defense-in-depth code, drop deprecated columns, delete dead files, convert legacy URL wrappers to hard redirects, and ship the final Step 3 CHANGELOG + git tag. The home stretch.
> **Status:** READY TO EXECUTE — no decisions needed (all cleanup items are mechanical)
> **Authority:** `PHASE1_STEP3_MASTER_PLAN.md` §3F + deferred cleanup items from 3A, 3C, 3D, 3E
> **Date:** 2026-04-11
> **Risk level:** Low — everything being removed or changed is either dead code, a deprecated column, or a redundant defense layer. Verification: typecheck + manual smoke test.
> **Estimated scope:** 1-2 SQL migrations, ~5-8 files deleted, ~4 files modified, 3-4 commits

---

## 1. Ordered Task List

### Task 1: Convert all legacy `/deals/*` URL wrappers to hard redirects

Currently these files are thin re-export wrappers (from 3B) that delegate to the canonical routes. Convert each to a server-side `redirect()` call so the legacy URLs stop serving content directly and start permanently redirecting:

| File | Current | New |
|---|---|---|
| `app/(workspace)/deals/watchlist/page.tsx` | `export { default } from "@/app/(workspace)/analysis/page"` | `redirect("/analysis")` |
| `app/(workspace)/deals/watchlist/[analysisId]/page.tsx` | `export { default } from "@/app/(workspace)/analysis/[analysisId]/page"` | `redirect(\`/analysis/${analysisId}\`)` |
| `app/(workspace)/deals/pipeline/page.tsx` | `export { default } from "@/app/(workspace)/action/page"` | `redirect("/action")` |
| `app/(workspace)/deals/closed/page.tsx` | Async wrapper delegating to ActionPage | `redirect("/action?status=closed")` |
| `app/(workspace)/deals/page.tsx` | `redirect("/analysis")` | Already correct — no change |

**Verification:** type each legacy URL in the browser → observe redirect to the new canonical URL. The content at the new URL renders correctly.

### Task 2: Drop deprecated `analysis_notes.is_public` column

The `is_public` boolean was replaced by the `visibility` enum in 3A. The new NotesCardModal (3E.7.h) writes `visibility` directly. The column has been deprecated since 3A with a `COMMENT` marking it for removal.

**Three steps:**

1. **Update the type + loader:** Replace `is_public: boolean` with `visibility: string` in the `WorkstationData.notes` type definition (`lib/reports/types.ts`) and in the loader's SELECT clause + type assertion (`lib/analysis/load-workstation-data.ts`).

2. **Update consumers:** The NotesCardModal currently derives visibility from `is_public` (`note.is_public ? "all_partners" : "internal"`). After the type change, it reads from `note.visibility` directly. Also update `lib/reports/snapshot.ts` which filters notes by `is_public` — change to filter by `visibility !== 'internal'`.

3. **Migration:** `ALTER TABLE analysis_notes DROP COLUMN is_public`. One-line migration.

**Verification:** create a new note via the Notes modal, verify `visibility` populates correctly. Verify existing notes display their visibility badges correctly. Generate a report → verify the snapshot includes public notes (filtered by visibility).

### Task 3: Remove deprecated `dispositionCommissions` backwards-compat shim

The `dispositionCommissions` field on `TransactionResult` (screening types) and `TransactionDetail` (report types) was deprecated in 3A when the transaction engine was restructured to compute the 6-line breakdown. It's a computed shim: `buyer + seller`. Consumers should use `dispositionCommissionBuyer` + `dispositionCommissionSeller` directly.

**Audit of remaining references:**
- `lib/reports/types.ts` — type definition (remove the field)
- `lib/screening/types.ts` — type definition (remove the field)
- `lib/screening/transaction-engine.ts` — computes the shim (remove the computation)
- `components/reports/report-document.tsx` — reads the field for the report snapshot (update to use buyer + seller)

**Verification:** typecheck passes (any missed reference fails compilation). Existing reports still render correctly.

### Task 4: Delete dead files

| File | Why dead |
|---|---|
| `app/(workspace)/dev/auto-persist-test/page.tsx` | 3D test harness, no longer needed |
| `app/(workspace)/dev/auto-persist-test/auto-persist-test-client.tsx` | Same |
| `components/properties/manual-analysis-panel.tsx` | Legacy component, zero imports (only CLAUDE.md mentions it) |

Also check: is there anything else in `app/(workspace)/dev/` that should be cleaned? If the directory is empty after deletion, remove it too.

**Verification:** typecheck passes. No 404s on any route.

### Task 5: Remove layout-level auth check (defense-in-depth retired)

`app/(workspace)/layout.tsx:16` has `if (!user) redirect("/auth/sign-in")`. This was defense-in-depth alongside the `proxy.ts` middleware auth enforcement. Per the master plan §3F, proxy enforcement has been the primary protection through Steps 2 and 3 — the layout check is redundant. Removing it simplifies the layout and removes a server-side `getUser()` call from every workspace page load.

**⚠ Flag for Dan:** this is a security-posture change. The proxy still enforces auth, so unauthenticated users can't reach any workspace route. But the layout check was a belt-and-suspenders layer. Removing it means if the proxy ever has a bug, the layout wouldn't catch it. **Recommend Dan confirms this is acceptable before executing.**

**Verification:** sign out → navigate to any workspace URL → proxy redirects to `/auth/sign-in` (layout check no longer does this, but proxy still does).

### Task 6: Final CHANGELOG + push + tag

- CHANGELOG entry for 3F
- Push all 3F commits
- Git tag `phase1-step3-complete`

---

## 2. What CANNOT be deleted in 3F (deferred)

| Item | Why it stays | When it can be removed |
|---|---|---|
| `saveManualAnalysisAction` (bulk form action in `deals/actions.ts`) | Still used by `components/workstation/rehab-card.tsx` for the Save Rehab button | When RehabCard is migrated to per-payload auto-persist (future polish task) |
| `saveManualAnalysisAction` (duplicate in `analysis/properties/actions.ts`) | May be used by legacy property workspace pages under `analysis/properties/` | When the legacy property workspace stub pages are cleaned up |
| The `deals/` directory itself | Still has `actions.ts` (used by many server actions), `pipeline/pipeline-table.tsx` + `pipeline/actions.ts` (used by the Action page), `watchlist/watch-list-table.tsx` + `watchlist/actions.ts` (used by the Watch List page) | These files are still load-bearing for existing routes. They stay until a future reorganization moves actions into a shared location |

---

## 3. Decisions — None Needed

All 3F items are mechanical cleanup with no design choices. The only item that warrants a confirmation is Task 5 (removing the layout auth check) — flagged inline above.

---

*Drafted by Claude Opus | 2026-04-11 | Ready to execute*

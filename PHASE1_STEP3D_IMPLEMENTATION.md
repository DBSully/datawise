# Phase 1 — Step 3D — Auto-Persist Infrastructure

> **Goal:** Build the "no Save buttons, every edit persists immediately" pattern that the new Workstation in 3E depends on. Three deliverables: a `useDebouncedSave` hook, a `<SaveStatusDot>` indicator, and a generic `saveManualAnalysisFieldAction` server action with TypeScript discriminated union dispatch. All three are forward-looking infrastructure for 3E — no existing analyst workflow touches them, so 3D is purely additive.
> **Status:** DRAFT — awaiting Dan's review before execution
> **Authority:** `WORKSTATION_CARD_SPEC.md` Decision 2 (consolidated Quick Analysis tile, no Save buttons), §3.2 (Quick Analysis + Quick Status tile field lists), §5 (per-card auto-persist requirements) + `PHASE1_STEP3_MASTER_PLAN.md` §3D (sub-step scope) + Decisions 6.3 (one generic action with discriminated union) and 6.4 (keep value + red dot on error, no toast) — both locked at master plan level
> **Date:** 2026-04-11
> **Risk level:** Medium — new infrastructure with new failure modes (race conditions on concurrent edits, debounce-vs-unmount, network errors after optimistic UI). Isolated from existing UI so blast radius during build is small.
> **Estimated scope:** 0 SQL migrations, 4 new files (hook + indicator + types module + server action), 1 modified file (CHANGELOG), 5-7 commits

---

## 1. What 3D Accomplishes

3D is the **infrastructure sub-step** of Step 3. Three deliverables:

1. **Server action `saveManualAnalysisFieldAction`** — a single generic server action that takes a `{ analysisId, field, value }` input shape and writes one field to the appropriate underlying table (`manual_analysis` or `analysis_pipeline`). Per master plan Decision 6.3, the field/value pair is type-safe via a TypeScript **discriminated union** so each field's value type is enforced at the call site. Includes an allow-list of editable columns and an internal field→table routing map.

2. **Custom hook `useDebouncedSave`** — takes a value + a save function + a debounce delay, debounces save calls so newer keystrokes cancel older pending saves, and returns a save state machine (`idle | saving | saved | error`). The hook does NOT manage the value itself — the consumer (an input) is the source of truth for the value via normal `useState`. The hook only watches the value and triggers debounced saves.

3. **Component `<SaveStatusDot>`** — a small visual indicator that renders a colored dot based on save state. Cycles `slate (idle) → amber (saving) → emerald (saved, fades after 1s) → slate (idle)`. On error: `red` with a hover tooltip showing the error message. Sized to fit inline next to an input field. Accessible (proper aria attributes).

**The three pieces compose like this** (illustrative — actual integration is in 3E):

```typescript
// Inside a Quick Analysis tile input (3E.3 will wire this up)
const [arvInput, setArvInput] = useState<string>(initial);
const arvNumber = parseDollarInput(arvInput);
const { status, errorMessage } = useDebouncedSave(
  arvNumber,
  async (value) => {
    await saveManualAnalysisFieldAction({
      analysisId,
      field: "arv_manual",
      value,
    });
  },
);

return (
  <div className="flex items-center gap-1">
    <input value={arvInput} onChange={(e) => setArvInput(e.target.value)} />
    <SaveStatusDot status={status} errorMessage={errorMessage} />
  </div>
);
```

**3D explicitly does NOT do these things — they belong to later sub-steps:**

| Out of scope | Belongs to |
|---|---|
| Wiring auto-persist into any actual input | 3E |
| Building the new Quick Analysis or Quick Status tiles | 3E.3 |
| Building the override indicators on the Deal Stat Strip (manual ᴹ superscript) | 3E.4 |
| Migrating existing form-based saves in the current Workstation | Never — current Workstation gets retired in 3F |
| Removing the existing `saveManualAnalysisAction` (the bulk form action) | 3F (when the current Workstation is deleted) |
| Realtime sync between two browser tabs editing the same field | Out of scope for Phase 1; could be added in Phase 2 via Supabase Realtime |
| Optimistic concurrency / version stamps | Out of scope; LWW (last-write-wins) is acceptable for single-user workloads |
| Any database migration | None — `manual_analysis.next_step` was already added in 3A; everything else uses existing columns |
| Any UI change in the current Workstation or screening modal | None — 3D ships pure infrastructure, no consumer until 3E |

---

## 2. The #1 Constraint

**Auto-persist correctness is binary.** Either every keystroke reliably persists, or the user loses work. The hardest failure modes are subtle:

- **Race condition: keystroke 2 races keystroke 1.** If the user types "120" fast, the debounce timer may fire for "12" at the same instant they type "0". Without request ID tracking, the response from the "12" save could land AFTER the "120" save and overwrite the success indicator with the older state. The hook must use a request counter so only the latest in-flight save can transition the UI state.

- **Race condition: unmount mid-save.** If the user navigates away while a save is in flight, the hook's `setState` calls fire on an unmounted component. The hook must guard against this (cleanup function clears the timer, request ID guards against stale resolve callbacks).

- **Debounce coalescing vs intent loss.** If the user types fast for 2 seconds straight, NO save fires until they stop. That's correct (debounce) but means a network failure right after they stop typing leaves the database 2 seconds behind the UI. The hook's `error` state must communicate this clearly so the user knows to retry.

- **Empty input semantics.** Per spec §3.2, "Empty input = use auto value. Clearing a field reverts to the auto-computed value." This means typing then deleting must persist `null`, NOT skip the save. The discriminated union must allow `null` as a value for nullable columns.

These are not new ideas — they're standard auto-save concerns — but the 3D code must address them explicitly because 3E will lean hard on this infrastructure.

---

## 3. Risk & Rollback

| Workstream | Risk | Why | Mitigation |
|---|---|---|---|
| `saveManualAnalysisFieldAction` server action | Low | Single-row UPSERT on a known table; RLS already enforced via the `current_user_organization_id()` DEFAULT from Step 2 | Allow-list of fields + table routing map; auth check; analysisId ownership check |
| `useDebouncedSave` hook | Medium | Race conditions and unmount-during-save are subtle; bugs here affect every consumer in 3E | Request counter pattern, cleanup in useEffect return, explicit test harness in Task 5 |
| `<SaveStatusDot>` component | Very Low | Pure presentational; no state of its own beyond what the parent passes in | Visual inspection in the test harness |
| Test harness page | Low | Temporary dev page, deleted in 3F | Manual smoke test of every state transition |

**Rollback procedure:**

3D is purely additive — new files in `lib/auto-persist/`, `components/workstation/`, and `app/(workspace)/dev/` (test harness). To roll back:

1. `git revert` the 3D commits in reverse order
2. The new directories are deleted by the revert
3. No existing analyst workflow is affected (3D ships nothing that current code consumes)

**Catastrophic rollback:** if everything goes badly, `phase1-step3c-complete` (the equivalent commit hash `a0356c3`) is the recovery point. 3D's risk profile is low enough that I don't expect needing a full rollback.

---

## 4. Existing Infrastructure Audit

What 3D has to interoperate with:

### Existing `saveManualAnalysisAction` (`app/(workspace)/deals/actions.ts:241`)

A bulk form action that takes a `FormData` and updates ~20 columns on `manual_analysis` plus 3 columns on `analysis_pipeline` in two UPSERTs. Used by the current Workstation's Overrides form, the RehabCard's Save button, and the Quick Analysis tile in the screening modal.

**3D treatment:** **leave it alone.** The current Workstation (`/analysis/[analysisId]`) and the screening modal both still use it through 3E. It gets retired in 3F when the current Workstation is deleted. 3D's new field action sits alongside it as a separate function — both can coexist.

### `manual_analysis` table — fields the Quick Analysis + Quick Status tiles need to write

Per spec §3.2 + 3A migrations:

| Field | Type | Source | Used by tile |
|---|---|---|---|
| `arv_manual` | numeric | existing | Quick Analysis |
| `rehab_manual` | numeric | existing | Quick Analysis |
| `target_profit_manual` | numeric | existing | Quick Analysis |
| `days_held_manual` | integer | existing | Quick Analysis |
| `analyst_condition` | text | existing | Quick Status |
| `location_rating` | text | existing | Quick Status |
| `next_step` | text | NEW (3A migration) | Quick Status |

Plus financing override fields per Decision 2 (Rate%, LTV%, Points% live in the Financing card modal):

| `financing_rate_manual` | numeric (decimal: 0.11 = 11%) | existing | Financing card |
| `financing_points_manual` | numeric (decimal) | existing | Financing card |
| `financing_ltv_manual` | numeric (decimal) | existing | Financing card |

### `analysis_pipeline` table — Interest Level only

| `interest_level` | text | existing | Quick Status (moved from Pipeline card per spec §3.2) |

That's **11 total fields** the new Workstation will auto-persist via this action. Other fields on `manual_analysis` (`update_year_est`, `rehab_scope`, `rehab_category_scopes`, etc.) stay routed through the existing bulk action used by RehabCard and the Overrides form (both retired in 3F).

### Existing `WorkstationData` type and loader

`lib/analysis/load-workstation-data.ts` already returns the `manualAnalysis` and `pipeline` fields the new tiles will read on initial load. 3D doesn't touch this — the loader is read-side, not write-side.

---

## 5. Decisions to Lock Before Execution

🟡 **5.1 — Where do the new files live?**

Three reasonable layouts:

**(a) `lib/auto-persist/` directory.** New dedicated namespace for the auto-persist pattern. Hook + types module + server action all live in `lib/auto-persist/`. The visual indicator goes in `components/workstation/save-status-dot.tsx` since it's a UI component used inside cards.

```
lib/auto-persist/
  use-debounced-save.ts            ← hook
  field-types.ts                   ← discriminated union types
  save-manual-analysis-field-action.ts  ← server action
components/workstation/
  save-status-dot.tsx              ← visual indicator
```

**(b) Spread across existing directories.** Hook in `lib/hooks/` (new directory), types in `lib/analysis/`, action in `app/(workspace)/deals/actions.ts` (alongside existing actions), indicator in `components/workstation/`. More distributed; no new top-level directory.

**(c) Everything in `components/workstation/`.** Single-directory simplicity. Hook lives there as `use-debounced-save.ts`, types as `auto-persist-types.ts`, action would have to live elsewhere (server actions need `"use server"` and stay out of `components/`). Mixed.

**My recommendation: (a) `lib/auto-persist/` single new directory.** It's the same mental model we used for `components/workstation/` in 3C — one new directory holds the whole feature, easy to find and easy to delete in the unlikely event of rollback. The visual indicator goes in `components/workstation/` because that's where every other workstation UI primitive lives, and 3E imports it from there alongside `<DealStat>` etc.

🟡 **5.2 — Single action with internal field→table routing, or split actions per table?**

The 11 auto-persist fields span two tables: `manual_analysis` (10 fields) and `analysis_pipeline` (1 field). Three options:

**(a) Single action with internal routing.** `saveManualAnalysisFieldAction({ analysisId, field, value })` looks up the field in an internal `FIELD_TABLE` map and dispatches to the right table's UPSERT. The caller never thinks about which table is being written.

**(b) Two actions, one per table.** `saveManualAnalysisFieldAction` writes to `manual_analysis`, `savePipelineFieldAction` writes to `analysis_pipeline`. Caller picks the right one. More explicit.

**(c) Single action with an explicit `table` parameter.** `saveAnalysisFieldAction({ analysisId, table, field, value })`. Caller declares which table. Requires more thinking at the call site.

**My recommendation: (a) single action with internal routing.** The caller passes `{ field: "interest_level", value: "Hot" }` and the action knows to write to `analysis_pipeline.interest_level`. The discriminated union (Decision 6.3) ensures type safety on the value type. The internal routing keeps the API minimal and matches the spec's mental model: "set this field on this analysis, the system handles the storage detail".

🟡 **5.3 — Allow-list strictness.**

The action's allow-list defines which fields are permitted to be auto-persisted. Two scopes:

**(a) Tight: only the 11 fields the new Workstation tiles need.** Anything else returns an error. Smaller surface, harder to misuse, easier to audit.

**(b) Generous: every editable column on `manual_analysis` + the 3 editable columns on `analysis_pipeline`.** Future flexibility — if a new card wants to wire a field, no allow-list update needed.

**My recommendation: (a) tight 11-field allow-list.** Adding a field is one entry to the discriminated union + one entry to the `FIELD_TABLE` map. Forces a deliberate decision each time. Catches typos at compile time via the union (a typo in the field name doesn't typecheck). The cost of adding a new field in 3E if we discover one we missed is negligible.

🟡 **5.4 — Verification approach.**

Auto-persist infrastructure is hard to verify without a runtime consumer. Three options:

**(a) Build a tiny dev test page** at `app/(workspace)/dev/auto-persist-test/page.tsx`. The page wires up one input (e.g. `target_profit_manual`) for a hardcoded analysis ID, lets me type into it, and shows the SaveStatusDot transitions in real time. Lets me verify the full pipeline (debounce → save → success → fade → idle, plus error path) before 3E starts. The page is deleted in 3F as part of cleanup.

**(b) Verify by code review + typecheck only.** No runtime test until 3E.3 wires the Quick Analysis tile. Faster but riskier — bugs surface during 3E build instead of in 3D.

**(c) Wire one field in the existing legacy Workstation as a proof of concept.** The current Workstation has the Overrides form; we'd add a single input that uses auto-persist. Would test the full pipeline against real data. Risk: creates two save paths for the same field (the existing form + the new auto-persist), and the wire would have to be reverted for 3E.

**My recommendation: (a) tiny dev test page.** It's the cleanest way to verify the full state machine + race conditions (you can type fast and watch the dots) before 3E lands. The page is ~50 lines, requires a hardcoded analysis ID I control, and is easy to delete in 3F. Risk: I have to remember to delete it (the test page is added to a `dev/` subdirectory that's a clear "delete in 3F" marker).

🟡 **5.5 — Idle fade timeout.**

Master plan/spec say "fades after 1s". I'll use 1000ms. No decision needed unless you want a different timeout. Calling it out so you can override.

---

## 6. Application Code Changes

Five workstreams, all TypeScript/React. No schema migrations.

### 6.1 Discriminated union types module (`lib/auto-persist/field-types.ts`)

```typescript
// Sketch — actual types finalized at implementation time

export type ManualAnalysisFieldUpdate =
  | { field: "arv_manual"; value: number | null }
  | { field: "rehab_manual"; value: number | null }
  | { field: "target_profit_manual"; value: number | null }
  | { field: "days_held_manual"; value: number | null }
  | { field: "analyst_condition"; value: string | null }
  | { field: "location_rating"; value: string | null }
  | { field: "next_step"; value: string | null }
  | { field: "financing_rate_manual"; value: number | null }
  | { field: "financing_points_manual"; value: number | null }
  | { field: "financing_ltv_manual"; value: number | null };

export type PipelineFieldUpdate =
  | { field: "interest_level"; value: string | null };

export type AnalysisFieldUpdate =
  | ManualAnalysisFieldUpdate
  | PipelineFieldUpdate;

export type SaveAnalysisFieldInput = {
  analysisId: string;
} & AnalysisFieldUpdate;
```

The discriminated union pattern means TypeScript narrows `value` based on `field` at every call site:

```typescript
saveManualAnalysisFieldAction({ analysisId, field: "arv_manual", value: 1125000 });   // OK
saveManualAnalysisFieldAction({ analysisId, field: "arv_manual", value: "hello" });   // TS error
saveManualAnalysisFieldAction({ analysisId, field: "interest_level", value: "Hot" }); // OK
saveManualAnalysisFieldAction({ analysisId, field: "wrong_field", value: null });     // TS error
```

### 6.2 Server action (`lib/auto-persist/save-manual-analysis-field-action.ts`)

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SaveAnalysisFieldInput } from "./field-types";

const FIELD_TABLE: Record<string, "manual_analysis" | "analysis_pipeline"> = {
  arv_manual: "manual_analysis",
  rehab_manual: "manual_analysis",
  target_profit_manual: "manual_analysis",
  days_held_manual: "manual_analysis",
  analyst_condition: "manual_analysis",
  location_rating: "manual_analysis",
  next_step: "manual_analysis",
  financing_rate_manual: "manual_analysis",
  financing_points_manual: "manual_analysis",
  financing_ltv_manual: "manual_analysis",
  interest_level: "analysis_pipeline",
};

export async function saveManualAnalysisFieldAction(
  input: SaveAnalysisFieldInput,
): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { analysisId, field, value } = input;
  const table = FIELD_TABLE[field];
  if (!table) {
    throw new Error(`Field "${field}" is not in the auto-persist allow-list.`);
  }

  // Verify the analysis is owned by the calling user (RLS will also enforce
  // this, but a defensive check produces a cleaner error message than the
  // PostgREST RLS violation message).
  const { data: analysis, error: lookupError } = await supabase
    .from("analyses")
    .select("id")
    .eq("id", analysisId)
    .eq("created_by_user_id", user.id)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!analysis) throw new Error("Analysis not found or not owned by you.");

  const { error: upsertError } = await supabase
    .from(table)
    .upsert({ analysis_id: analysisId, [field]: value });
  if (upsertError) throw new Error(upsertError.message);

  revalidatePath(`/analysis/${analysisId}`);
  // No /deals/watchlist revalidate — that path is a wrapper now (3B Task 1)
  // and shares the same Workstation cache key as /analysis/[id].
}
```

The action **throws** on error (rather than returning an error union) so the `useDebouncedSave` hook can catch via try/catch. Server actions support this.

### 6.3 Custom hook (`lib/auto-persist/use-debounced-save.ts`)

```typescript
"use client";

import { useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

export type UseDebouncedSaveResult = {
  status: SaveState;
  errorMessage: string | null;
};

export type UseDebouncedSaveOptions = {
  /** Delay in ms after the value last changed before the save fires.
   *  Default 500ms per the spec. */
  delayMs?: number;
};

export function useDebouncedSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  options?: UseDebouncedSaveOptions,
): UseDebouncedSaveResult {
  const [status, setStatus] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isFirstRender = useRef(true);
  const saveRef = useRef(save);
  const requestIdRef = useRef(0);
  const fadeTimerRef = useRef<number | null>(null);
  const debounceTimerRef = useRef<number | null>(null);

  // Keep the latest save callback in a ref so the effect doesn't re-fire
  // when the parent passes a new function reference each render.
  saveRef.current = save;

  const delayMs = options?.delayMs ?? 500;

  useEffect(() => {
    // Skip the first render — initial value came from the loaded data,
    // not a user edit, so we don't fire a redundant save.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Cancel any pending debounce — newer keystroke supersedes the older.
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
    }

    // Cancel any in-flight "saved" fade — we're starting a new edit cycle.
    if (fadeTimerRef.current != null) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    const myRequestId = ++requestIdRef.current;

    debounceTimerRef.current = window.setTimeout(async () => {
      setStatus("saving");
      setErrorMessage(null);
      try {
        await saveRef.current(value);
        // Only the latest in-flight request can transition the UI.
        // Older requests that resolved late get ignored.
        if (requestIdRef.current === myRequestId) {
          setStatus("saved");
          fadeTimerRef.current = window.setTimeout(() => {
            if (requestIdRef.current === myRequestId) {
              setStatus("idle");
            }
            fadeTimerRef.current = null;
          }, 1000);
        }
      } catch (err) {
        if (requestIdRef.current === myRequestId) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : String(err));
        }
      }
    }, delayMs);

    return () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [value, delayMs]);

  // Cleanup on unmount: cancel everything and bump the request counter
  // so any in-flight save's resolve callback is ignored.
  useEffect(() => {
    return () => {
      requestIdRef.current = -1;
      if (debounceTimerRef.current != null) clearTimeout(debounceTimerRef.current);
      if (fadeTimerRef.current != null) clearTimeout(fadeTimerRef.current);
    };
  }, []);

  return { status, errorMessage };
}
```

Critical correctness invariants:

1. **First render skipped** — the initial value loaded from the database doesn't trigger a save.
2. **Request counter** — only the latest in-flight request can transition the UI state. Stale resolves are silently dropped.
3. **Debounce cancellation on new value** — if the user types again before the previous timer fires, the previous timer is cancelled.
4. **Fade timer cancellation on new edit** — if the user types again during the "saved" fade, the fade is cancelled and the new edit cycle takes over.
5. **Unmount cleanup** — request counter is set to a sentinel (-1) on unmount so any in-flight resolve is ignored even if it lands after the component is gone.

### 6.4 Status indicator (`components/workstation/save-status-dot.tsx`)

```typescript
"use client";

import type { SaveState } from "@/lib/auto-persist/use-debounced-save";

const STATE_STYLE: Record<SaveState, { color: string; aria: string }> = {
  idle:   { color: "bg-slate-300",   aria: "All changes saved" },
  saving: { color: "bg-amber-400",   aria: "Saving..." },
  saved:  { color: "bg-emerald-500", aria: "Saved" },
  error:  { color: "bg-red-500",     aria: "Save failed" },
};

type SaveStatusDotProps = {
  status: SaveState;
  errorMessage?: string | null;
};

export function SaveStatusDot({ status, errorMessage }: SaveStatusDotProps) {
  const { color, aria } = STATE_STYLE[status];
  const tooltip = status === "error" && errorMessage ? errorMessage : aria;
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full transition-colors ${color}`}
      role="status"
      aria-label={aria}
      title={tooltip}
    />
  );
}
```

Tiny — 8px circle with the right color and a `title` tooltip on hover. The error path's tooltip shows the actual error message. Accessible via `role="status"` + `aria-label`.

### 6.5 Test harness page (`app/(workspace)/dev/auto-persist-test/page.tsx`)

A small dev-only page that wires one input to the full pipeline so I can verify state transitions visually before 3E starts.

```typescript
// Sketch — final shape determined at implementation
"use client";

import { useState } from "react";
import { useDebouncedSave } from "@/lib/auto-persist/use-debounced-save";
import { saveManualAnalysisFieldAction } from "@/lib/auto-persist/save-manual-analysis-field-action";
import { SaveStatusDot } from "@/components/workstation/save-status-dot";

const HARDCODED_ANALYSIS_ID = "<paste a real analysis id here at test time>";

export default function AutoPersistTestPage() {
  const [targetProfitInput, setTargetProfitInput] = useState("");
  const targetProfit = targetProfitInput === "" ? null : Number(targetProfitInput);

  const { status, errorMessage } = useDebouncedSave(
    targetProfit,
    async (value) => {
      await saveManualAnalysisFieldAction({
        analysisId: HARDCODED_ANALYSIS_ID,
        field: "target_profit_manual",
        value,
      });
    },
  );

  return (
    <div className="p-8">
      <h1>Auto-persist test harness</h1>
      <p>Type into the field below. Watch the dot cycle through states.</p>
      <div className="mt-4 flex items-center gap-2">
        <label>Target Profit:</label>
        <input
          type="text"
          value={targetProfitInput}
          onChange={(e) => setTargetProfitInput(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1"
        />
        <SaveStatusDot status={status} errorMessage={errorMessage} />
      </div>
      <div className="mt-2 text-xs text-slate-500">Status: {status}</div>
      {errorMessage && (
        <div className="mt-1 text-xs text-red-600">{errorMessage}</div>
      )}
    </div>
  );
}
```

I'll smoke-test:
- Type "40000" → see amber dot → see emerald dot → fade to idle (slate)
- Type "50000" fast over 2 seconds — debounce coalesces, only one save fires
- Type something invalid (non-numeric) — see how it handles
- Sign out in another tab and try to save — see the redirect/error path
- Network throttle to 0 (DevTools) and watch the saving state hang
- Reload the page after a save and confirm the value persisted

The hardcoded analysis ID is replaced before each test session. No need to commit a real ID.

Deleted in 3F as part of cleanup.

---

## 7. Ordered Task List

Each task is independently committable.

### Phase A — Types + server action (1 commit)

**Task 1:** Create `lib/auto-persist/field-types.ts` with the discriminated union AND `lib/auto-persist/save-manual-analysis-field-action.ts` with the generic action. Bundle into one commit since the action depends on the types.
- Verification: typecheck; verify the action's allow-list matches the union's `field` values exactly (compile-time check via `Record<...>`)

### Phase B — Hook (1 commit)

**Task 2:** Create `lib/auto-persist/use-debounced-save.ts` with the full state machine, request counter, and unmount cleanup.
- Verification: typecheck; review the race-condition invariants in §6.3

### Phase C — Visual indicator (1 commit)

**Task 3:** Create `components/workstation/save-status-dot.tsx`.
- Verification: typecheck; visual rendering verified in Task 4's test harness

### Phase D — Test harness + smoke test (1-2 commits)

**Task 4:** Create the dev test harness page at `app/(workspace)/dev/auto-persist-test/page.tsx`. Smoke-test every state transition listed in §6.5 against a real analysis ID. Document any bugs found and fix them in subsequent commits.
- Verification: walk through the §6.5 checklist; each transition behaves as expected

### Phase E — CHANGELOG + push (1 commit)

**Task 5:** CHANGELOG entry for 3D + push to origin.

---

## 8. Files Touched

| File | Type | Why |
|---|---|---|
| `lib/auto-persist/field-types.ts` | NEW | Discriminated union types |
| `lib/auto-persist/save-manual-analysis-field-action.ts` | NEW | Generic per-field server action |
| `lib/auto-persist/use-debounced-save.ts` | NEW | Custom hook with state machine |
| `components/workstation/save-status-dot.tsx` | NEW | Visual indicator |
| `app/(workspace)/dev/auto-persist-test/page.tsx` | NEW | Test harness (deleted in 3F) |
| `CHANGELOG.md` | EDIT | Phase 1 Step 3D entry |

**Approximate count:** 5 new files + 1 changelog = 6 files touched.

**NOT modified — by design:**
- Any existing server action (the existing `saveManualAnalysisAction` stays untouched)
- Any existing UI component (no consumer until 3E)
- Any database migration (`next_step` was added in 3A; everything else already exists)
- Any route file or `page.tsx` (other than the dev test harness)
- Navigation, the home page, the screening modal, or the current Workstation
- The `/home` performance fix (untouched)
- `lib/analysis/load-workstation-data.ts` (read-side, 3D is write-side)

---

## 9. Verification Checklist

After Tasks 1-3, run typecheck. After Task 4, walk through the test harness checklist below.

### Build verification

- [ ] `npx tsc --noEmit` passes after every commit
- [ ] No TypeScript errors at any consumer call site (verified in Task 4 test harness)

### Discriminated union type safety

- [ ] In Task 4, attempt to call `saveManualAnalysisFieldAction({ analysisId, field: "arv_manual", value: "string" })` — TypeScript should reject this
- [ ] Attempt to call with `field: "wrong_field"` — TypeScript should reject this
- [ ] Verify the `FIELD_TABLE` map covers every variant of the union (compile-time check via test that iterates the union vs the map)

### Test harness state transitions

Type into the test harness input and verify each transition fires:

- [ ] **Initial mount:** dot renders slate (idle), no save fires (first-render skip works)
- [ ] **Type "40000":** dot stays idle for 500ms, then turns amber (saving)
- [ ] **Save success:** dot transitions amber → emerald (saved) within ~100ms of network return
- [ ] **Saved fade:** dot transitions emerald → slate after exactly 1 second
- [ ] **Fast typing (race condition test):** type "1234567" rapidly — only ONE save fires after the user stops, debounce coalesces correctly
- [ ] **Mid-fade edit:** type a value, wait for emerald, then type again before fade completes — fade cancels and the new edit cycle takes over (slate → amber)
- [ ] **Empty input semantics:** type a value, wait for emerald, then clear the input → triggers a save with `value: null` (verify in Supabase that the column is now NULL)
- [ ] **Network error path:** disable network in DevTools, type a value → dot transitions slate → amber → red. Hover the red dot to see the error message tooltip.
- [ ] **Recovery from error:** with network re-enabled, type a new value → red → amber → emerald. The error state clears.
- [ ] **Unmount during save:** type a value, immediately navigate away → no console errors about setState on unmounted component
- [ ] **Reload persistence:** type a value, wait for emerald, reload the page → the new value is loaded from the database

### RLS / auth verification

- [ ] **Unauthenticated:** sign out, visit the test harness — should redirect to /auth/sign-in (the action's auth check)
- [ ] **Wrong analysis ID:** point the test harness at an analysis ID owned by a different user — save returns the "Analysis not found or not owned by you" error
- [ ] **Allow-list rejection:** manually call the action with `field: "rehab_category_scopes"` (not in the allow-list) → returns the "not in the auto-persist allow-list" error

### No regression to existing UI

- [ ] Open `/analysis/<id>` (current Workstation) — every existing field (Overrides form, RehabCard scope buttons, Pipeline panel) still saves correctly via the existing `saveManualAnalysisAction`
- [ ] Open the screening modal — Quick Analysis tile still works
- [ ] No console errors anywhere

---

## 10. Definition of Done

3D is complete when:

1. The 4 production files are written, typechecked, and code-reviewed (`lib/auto-persist/field-types.ts`, `lib/auto-persist/save-manual-analysis-field-action.ts`, `lib/auto-persist/use-debounced-save.ts`, `components/workstation/save-status-dot.tsx`)
2. The test harness page exists and every transition in §9 has been verified manually
3. Every box in §9 is checked
4. CHANGELOG has a Phase 1 Step 3D entry
5. All commits pushed to origin
6. The infrastructure is ready for 3E.3 (Quick Analysis tile) to consume — the API surface is `useDebouncedSave(value, save, options?)` + `saveManualAnalysisFieldAction({analysisId, field, value})` + `<SaveStatusDot status={...} />`

---

## 11. What 3E builds on top

3E.3 (Quick Analysis tile) is the first 3E sub-task that actually consumes 3D. Each of the 4 fields in the tile (Manual ARV, Rehab Override, Target Profit, Days Held) becomes:

```typescript
const [arvInput, setArvInput] = useState<string>(initialFromData);
const arvNumber = parseDollarInput(arvInput);
const { status, errorMessage } = useDebouncedSave(arvNumber, async (v) =>
  saveManualAnalysisFieldAction({ analysisId, field: "arv_manual", value: v }),
);

return (
  <div className="flex items-center gap-1">
    <input value={arvInput} onChange={(e) => setArvInput(e.target.value)} ... />
    <SaveStatusDot status={status} errorMessage={errorMessage} />
  </div>
);
```

Same pattern in 3E.3 for the other 3 numeric fields.

3E.3 also wires the Quick Status tile (4 dropdowns: Interest, Condition, Location, Next Step). Dropdowns persist on `onChange` instantly (no debounce needed for discrete selections, but the same hook works fine with delay 0 — or we just call the action directly without the hook for dropdowns and only show a brief saved-dot flash).

3E.6 (right column collapsed cards) doesn't directly use 3D — the cards are read-only collapsed views. The per-card modals in 3E.7 use 3D for any inputs they expose (e.g., the Financing card modal's Rate%/LTV%/Points% fields).

---

## 12. Open Questions — RESOLVED

🟢 **5.1 — DECIDED: (a) `lib/auto-persist/` single new directory + `components/workstation/save-status-dot.tsx`.** Same single-directory mental model we used for `components/workstation/` in 3C — easy to find, easy to delete in the unlikely event of rollback. The visual indicator goes in `components/workstation/` because that's where every other workstation UI primitive lives.

🟢 **5.2 — DECIDED: (a) single action with internal field→table routing.** The caller passes `{ field, value }` and the action looks up the target table internally. Discriminated union ensures type safety on the value type at the call site. Quick Status's split between `manual_analysis` and `analysis_pipeline` is invisible to the caller.

🟢 **5.3 — DECIDED: (a) tight 11-field allow-list.** Adding a field is one entry to the discriminated union + one entry to the `FIELD_TABLE` map. Forces a deliberate decision each time. Catches typos at compile time via the union (a typo in the field name doesn't typecheck).

🟢 **5.4 — DECIDED: (a) tiny dev test page** at `app/(workspace)/dev/auto-persist-test/page.tsx`. Lets us verify the full state machine + race conditions visually before 3E lands. Deleted in 3F as part of cleanup.

🟢 **5.5 — DECIDED: 1000ms idle fade timeout** (the spec/master plan default).

**Pre-locked at master plan level:**
- 🟢 **Decision 6.3** — One generic action with TypeScript discriminated union (locked in `PHASE1_STEP3_MASTER_PLAN.md`)
- 🟢 **Decision 6.4** — On error: keep value in input, show red dot with hover tooltip, no toast (locked in `PHASE1_STEP3_MASTER_PLAN.md`)

All decisions locked 2026-04-11. Ready to execute.

---

*Drafted by Claude Opus | 2026-04-11 | Awaiting Dan's review before execution*

// Phase 1 Step 3D Task 1 — generic per-field auto-persist server action.
//
// A single server action that takes a discriminated union input
// (analysisId + field + value) and writes one column on one row to
// the appropriate underlying table. Per Decision 5.2 (3D plan) the
// caller never thinks about which table — internal routing handles
// dispatch via the FIELD_TABLE map below.
//
// Behavior contract:
//
// 1. Auth: must have a signed-in user. Unauthenticated calls redirect
//    to /auth/sign-in.
//
// 2. Allow-list: only fields listed in the AnalysisFieldUpdate
//    discriminated union (and equivalently in FIELD_TABLE) are
//    accepted. Anything else throws "Field X is not in the
//    auto-persist allow-list" — defensive against runtime input that
//    bypasses the TS types (e.g. an arbitrary client-side fetch).
//
// 3. Ownership check: the analysis row must be owned by the calling
//    user. RLS would also enforce this at the upsert layer, but the
//    explicit pre-check produces a cleaner error message than the
//    PostgREST RLS violation message.
//
// 4. UPSERT: writes one column on the appropriate table for this
//    analysis. Both manual_analysis and analysis_pipeline use
//    analysis_id as the primary key, so the upsert pattern is
//    identical for both tables.
//
// 5. Revalidation: revalidates /analysis/[analysisId] so the next
//    server render of the Workstation picks up the new value. Only
//    one path is revalidated — both /analysis/[id] and the legacy
//    /deals/watchlist/[id] resolve to the same RSC cache key after
//    Step 3B's wrapper pattern.
//
// 6. Errors: thrown (not returned) so the useDebouncedSave hook can
//    catch them in try/catch and transition to the "error" state.
//    The hook surfaces err.message to the user via the SaveStatusDot
//    tooltip.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  AnalysisFieldName,
  SaveAnalysisFieldInput,
} from "./field-types";

// ─────────────────────────────────────────────────────────────────────────────
// Field → table routing map
// ─────────────────────────────────────────────────────────────────────────────

/** Maps each allow-listed field name to its underlying table. The
 *  `Record<AnalysisFieldName, ...>` type forces this map to cover
 *  every variant of the AnalysisFieldUpdate union — adding a new
 *  field to the union without adding it here is a compile-time error.
 *  Same in reverse: an entry here that isn't in the union is a
 *  compile-time error too. */
const FIELD_TABLE: Record<
  AnalysisFieldName,
  "manual_analysis" | "analysis_pipeline"
> = {
  // Quick Analysis tile (4 fields)
  arv_manual: "manual_analysis",
  rehab_manual: "manual_analysis",
  target_profit_manual: "manual_analysis",
  days_held_manual: "manual_analysis",
  // Quick Status tile — manual_analysis side (3 fields)
  analyst_condition: "manual_analysis",
  location_rating: "manual_analysis",
  next_step: "manual_analysis",
  // Financing card modal (3 fields)
  financing_rate_manual: "manual_analysis",
  financing_points_manual: "manual_analysis",
  financing_ltv_manual: "manual_analysis",
  // Transaction Costs modal (2 commission-rate overrides)
  disposition_commission_buyer_manual: "manual_analysis",
  disposition_commission_seller_manual: "manual_analysis",
  // Quick Status tile — analysis_pipeline side (1 field)
  analyst_interest: "analysis_pipeline",
};

// ─────────────────────────────────────────────────────────────────────────────
// Action
// ─────────────────────────────────────────────────────────────────────────────

export async function saveManualAnalysisFieldAction(
  input: SaveAnalysisFieldInput,
): Promise<void> {
  const supabase = await createClient();

  // 1. Auth
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { analysisId, field, value } = input;

  // 2. Allow-list — defensive runtime check (the TS union catches
  // typos at compile time, but a fetch from a non-typed client could
  // still pass an invalid field name).
  const table = FIELD_TABLE[field];
  if (!table) {
    throw new Error(
      `Field "${field}" is not in the auto-persist allow-list.`,
    );
  }

  // 3. Ownership check — the analysis must exist and be owned by the
  // calling user. RLS will also enforce this at the upsert layer, but
  // the explicit check gives a cleaner error message.
  const { data: analysis, error: lookupError } = await supabase
    .from("analyses")
    .select("id")
    .eq("id", analysisId)
    .eq("created_by_user_id", user.id)
    .eq("is_archived", false)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);
  if (!analysis) {
    throw new Error("Analysis not found or not owned by you.");
  }

  // 4. UPSERT one column on the routed table. Both manual_analysis and
  // analysis_pipeline use analysis_id as the primary key, so a single
  // upsert pattern works for either table.
  //
  // Special case: analyst_interest also stamps analyst_decided_at and
  // analyst_decided_by so audit/calibration queries can attribute the
  // decision. Other fields are simple single-column writes.
  const upsertPayload: Record<string, unknown> = {
    analysis_id: analysisId,
    [field]: value,
  };
  if (field === "analyst_interest") {
    upsertPayload.analyst_decided_at = new Date().toISOString();
    upsertPayload.analyst_decided_by = user.id;
  }

  const { error: upsertError } = await supabase
    .from(table)
    .upsert(upsertPayload, { onConflict: "analysis_id" });
  if (upsertError) throw new Error(upsertError.message);

  // 5. Revalidate the canonical Workstation route. Both /analysis/[id]
  // and the legacy /deals/watchlist/[id] share the same RSC cache key
  // after Step 3B's wrapper pattern.
  revalidatePath(`/analysis/${analysisId}`);
}

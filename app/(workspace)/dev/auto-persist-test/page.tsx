// Phase 1 Step 3D Task 4 — auto-persist test harness page.
//
// A dev-only page that wires the auto-persist primitives (Tasks 1-3)
// to the full database pipeline so we can verify the state machine
// transitions visually before 3E lands.
//
// The page is a server component that:
//   1. Fetches the signed-in user (redirects to sign-in if missing)
//   2. Picks any one of the user's analyses (the most recent one)
//   3. Reads the current values for the test fields from
//      manual_analysis + analysis_pipeline
//   4. Hands everything off to the client component for the inputs
//
// The client component renders 3 test inputs covering both target
// tables and both value types:
//
//   - Target Profit (number → manual_analysis.target_profit_manual)
//   - Next Step      (string → manual_analysis.next_step)
//   - Interest Level (string → analysis_pipeline.interest_level)
//
// Three inputs is enough to exercise: numeric values, string values,
// the field→table routing on both tables, and the discriminated
// union's type narrowing at the call site.
//
// DELETE THIS PAGE IN STEP 3F as part of cleanup. The dev/ subdirectory
// marker makes it easy to find at deletion time.

import { redirect, notFound } from "next/navigation";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { AutoPersistTestClient } from "./auto-persist-test-client";

export const dynamic = "force-dynamic";

export default async function AutoPersistTestPage() {
  noStore();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  // Pick any one analysis the user owns. The test harness writes to
  // its manual_analysis + analysis_pipeline rows, so any active
  // analysis works.
  const { data: analysis, error: analysisError } = await supabase
    .from("analyses")
    .select("id, scenario_name")
    .eq("created_by_user_id", user.id)
    .eq("is_archived", false)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (analysisError) throw new Error(analysisError.message);
  if (!analysis) notFound();

  // Read the current values so the inputs initialize with the actual
  // database state. Both queries are scoped to this analysis_id.
  const [{ data: manualRow }, { data: pipelineRow }] = await Promise.all([
    supabase
      .from("manual_analysis")
      .select("target_profit_manual, next_step")
      .eq("analysis_id", analysis.id)
      .maybeSingle(),
    supabase
      .from("analysis_pipeline")
      .select("interest_level")
      .eq("analysis_id", analysis.id)
      .maybeSingle(),
  ]);

  return (
    <section className="dw-section-stack-compact">
      <div>
        <h1 className="dw-page-title">Auto-Persist Test Harness</h1>
        <p className="dw-page-copy">
          Phase 1 Step 3D verification page. Wires the auto-persist
          primitives (useDebouncedSave + SaveStatusDot +
          saveManualAnalysisFieldAction) to a real analysis row so
          we can verify the state machine visually before 3E lands.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Active analysis:{" "}
          <span className="font-mono text-slate-700">
            {analysis.scenario_name ?? "Untitled"}
          </span>{" "}
          <span className="text-slate-400">({analysis.id})</span>
        </p>
        <p className="mt-1 text-[11px] text-amber-700">
          ⚠ This page mutates real database rows. Test against a
          throwaway analysis if needed. Delete this page in Step 3F.
        </p>
      </div>

      <AutoPersistTestClient
        analysisId={analysis.id}
        initialTargetProfit={manualRow?.target_profit_manual ?? null}
        initialNextStep={manualRow?.next_step ?? null}
        initialInterestLevel={pipelineRow?.interest_level ?? null}
      />
    </section>
  );
}

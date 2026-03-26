import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnalysisWorkspaceNav } from "@/components/properties/analysis-workspace-nav";

type RehabBudgetPageProps = {
  params: Promise<{ id: string; analysisId: string }>;
};

export default async function RehabBudgetPage({
  params,
}: RehabBudgetPageProps) {
  const { id, analysisId } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: property, error: propertyError },
    { data: analysis, error: analysisError },
  ] = await Promise.all([
    supabase
      .from("real_properties")
      .select("id, unparsed_address")
      .eq("id", id)
      .maybeSingle(),

    supabase
      .from("analyses")
      .select("id, scenario_name, strategy_type")
      .eq("id", analysisId)
      .eq("real_property_id", id)
      .eq("created_by_user_id", user?.id ?? "")
      .eq("is_archived", false)
      .maybeSingle(),
  ]);

  if (propertyError) throw new Error(propertyError.message);
  if (analysisError) throw new Error(analysisError.message);
  if (!property || !analysis) notFound();

  return (
    <section className="dw-section-stack-compact">
      <div>
        <div className="mb-1">
          <Link
            href={`/analysis/properties/${property.id}/analyses/${analysis.id}`}
            className="text-[11px] uppercase tracking-[0.16em] text-slate-500 hover:text-slate-900"
          >
            ← Back to Analysis Overview
          </Link>
        </div>

        <h1 className="dw-page-title">Rehab Budget</h1>
        <p className="dw-page-copy">
          Dedicated rehab budgeting workspace for{" "}
          {analysis.scenario_name ?? "this analysis"} on{" "}
          {property.unparsed_address}.
        </p>
      </div>

      <AnalysisWorkspaceNav
        propertyId={property.id}
        analysisId={analysis.id}
        current="rehab-budget"
      />

      <div className="dw-card">
        <h2 className="text-lg font-semibold text-slate-900">Planned scope</h2>
        <div className="mt-2 text-sm text-slate-600">
          This page will become the detailed rehab budgeting workspace,
          including scope categories, line items, scenario totals, and selected
          rehab assumptions that feed the analysis overview.
        </div>
      </div>
    </section>
  );
}

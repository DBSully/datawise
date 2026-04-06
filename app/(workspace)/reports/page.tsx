import Link from "next/link";
import { unstable_noStore as noStore } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ReportRow = {
  id: string;
  title: string;
  report_type: string;
  created_at: string;
  property_address: string;
  property_city: string;
  property_state: string;
  real_property_id: string;
};

export default async function ReportsPage() {
  noStore();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Load all reports for this user, joined with analysis → property
  const { data: rawReports } = await supabase
    .from("analysis_reports")
    .select(`
      id,
      title,
      report_type,
      created_at,
      analyses!inner (
        real_property_id,
        real_properties!inner (
          unparsed_address,
          city,
          state
        )
      )
    `)
    .eq("created_by_user_id", user?.id ?? "")
    .order("created_at", { ascending: false });

  // Flatten the joined data
  const reports: ReportRow[] = (rawReports ?? []).map((r: any) => {
    const analysis = r.analyses;
    const property = analysis?.real_properties;
    return {
      id: r.id,
      title: r.title,
      report_type: r.report_type,
      created_at: r.created_at,
      property_address: property?.unparsed_address ?? "Unknown",
      property_city: property?.city ?? "",
      property_state: property?.state ?? "",
      real_property_id: analysis?.real_property_id ?? "",
    };
  });

  // Group by property
  const grouped = new Map<string, { address: string; location: string; reports: ReportRow[] }>();
  for (const r of reports) {
    const key = r.real_property_id;
    if (!grouped.has(key)) {
      grouped.set(key, {
        address: r.property_address,
        location: `${r.property_city}, ${r.property_state}`,
        reports: [],
      });
    }
    grouped.get(key)!.reports.push(r);
  }

  const propertyGroups = Array.from(grouped.values());

  return (
    <section className="dw-section-stack">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="dw-page-title">Report Library</h1>
          <p className="dw-page-copy">
            Generated analysis reports grouped by property.
          </p>
        </div>
        <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">
          {reports.length} report{reports.length !== 1 ? "s" : ""}
        </span>
      </div>

      {propertyGroups.length === 0 ? (
        <div className="dw-card text-center">
          <p className="text-sm text-slate-500">
            No reports generated yet. Open an analysis and click{" "}
            <span className="font-semibold text-emerald-700">Generate Report</span> to create one.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {propertyGroups.map((group, gi) => (
            <div key={gi} className="dw-card">
              <div className="mb-2">
                <h2 className="text-sm font-semibold text-slate-800">
                  {group.address}
                </h2>
                <p className="text-xs text-slate-500">{group.location}</p>
              </div>
              <div className="dw-table-wrap">
                <table className="dw-table-compact w-full">
                  <thead>
                    <tr>
                      <th className="text-left">Title</th>
                      <th className="text-left">Type</th>
                      <th className="text-left">Generated</th>
                      <th className="text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.reports.map((r) => (
                      <tr key={r.id}>
                        <td className="font-medium text-slate-800">{r.title}</td>
                        <td>
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-slate-500">
                            {r.report_type}
                          </span>
                        </td>
                        <td className="text-slate-500">
                          {new Date(r.created_at).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>
                        <td className="text-right">
                          <Link
                            href={`/reports/${r.id}`}
                            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-50"
                          >
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

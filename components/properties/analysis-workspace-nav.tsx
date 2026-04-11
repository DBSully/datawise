import Link from "next/link";

type AnalysisWorkspaceNavProps = {
  propertyId: string;
  analysisId: string;
  current:
    | "overview"
    | "comparables"
    | "rehab-budget"
    | "rental"
    | "wholesale"
    | "listing"
    | "new-build";
};

const tabs = [
  { key: "overview", label: "Overview", suffix: "" },
  { key: "comparables", label: "Comparables", suffix: "/comparables" },
  { key: "rehab-budget", label: "Rehab Budget", suffix: "/rehab-budget" },
  { key: "rental", label: "Rental", suffix: "/rental" },
  { key: "wholesale", label: "Wholesale", suffix: "/wholesale" },
  { key: "listing", label: "Listing", suffix: "/listing" },
  { key: "new-build", label: "New Build", suffix: "/new-build" },
] as const;

export function AnalysisWorkspaceNav({
  propertyId,
  analysisId,
  current,
}: AnalysisWorkspaceNavProps) {
  const base = `/analysis/${analysisId}`;

  return (
    <div className="dw-card-tight">
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const isActive = tab.key === current;

          return (
            <Link
              key={tab.key}
              href={`${base}${tab.suffix}`}
              className={
                isActive
                  ? "rounded-md bg-slate-900 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white"
                  : "rounded-md border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-700 hover:bg-slate-50"
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

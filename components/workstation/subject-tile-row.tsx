// Phase 1 Step 3C Task 9 — SubjectTileRow built by extraction.
//
// The 3-tile horizontal row (MLS Info / Property Physical / Quick Analysis)
// that appears at the top of both the screening comp modal and the current
// Workstation. The JSX in both consumers was structurally identical — same
// tile layout, same grid columns, same colors, same labels. Only the data
// sources differed (WorkstationData vs ScreeningCompData) and a couple of
// minor formatting/behavior details.
//
// Design — data normalization at the prop boundary:
//
// The shared component accepts pre-formatted display strings for the MLS
// and Physical tiles, plus the Quick Analysis form state, setters, and
// placeholder strings. Each consumer pre-formats its data using its own
// helpers (fmt vs $f, fmtNum decimal preferences, fmtIsoDate vs already-
// formatted date strings, the Levels fallback chain) BEFORE passing the
// props in. The shared component never sees WorkstationData or
// ScreeningCompData — it only renders strings.
//
// This means zero behavioral change in either consumer: each keeps its
// own date/currency/decimal formatting choices because formatting happens
// at the prop boundary. The only "raw" field is `physical.yearBuilt`
// (number | null) because the shared component needs the value to render
// the <1950 red highlighting.
//
// The Workstation's Quick Analysis tile has a special Tab handler on the
// Target Profit input that focuses a "Copy Selected MLS" button. The
// modal does not. Surfaced as an optional `onTargetProfitTab?` callback
// prop — Workstation passes one, modal omits it.
//
// In 3E this same component becomes the top tile row of the new
// Workstation per WORKSTATION_CARD_SPEC.md.

"use client";

import type { KeyboardEvent } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Prop shapes
// ─────────────────────────────────────────────────────────────────────────────

export type SubjectTileRowMlsInfo = {
  mlsStatus: string;
  mlsNumber: string;
  mlsChangeType: string;
  listDate: string;
  origListPrice: string;
  ucDate: string;
  listPrice: string;
  closeDate: string;
};

/** Per-level bed/bath counts for the embedded mini-grid in the
 *  Property Physical tile. Optional — when omitted, the mini-grid
 *  doesn't render. The screening modal omits this (its
 *  ScreeningCompData type doesn't expose per-level fields); the
 *  new Workstation provides it from WorkstationData.physical
 *  (per Phase 1 Step 3A's schema work). */
export type SubjectTileRowBedBathLevels = {
  bedsTotal: number | null;
  bedsMain: number | null;
  bedsUpper: number | null;
  bedsLower: number | null;
  bathsTotal: number | null;
  bathsMain: number | null;
  bathsUpper: number | null;
  bathsLower: number | null;
};

export type SubjectTileRowPhysical = {
  totalSf: string;
  aboveSf: string;
  belowSf: string;
  basementFinSf: string;
  beds: string;
  baths: string;
  garage: string;
  yearBuilt: number | null;
  levels: string;
  propertyType: string;
  lotSf: string;
  taxHoa: string;
  /** Optional bed/bath level breakdown — when present, the Property
   *  Physical tile renders the embedded mini-grid below the main
   *  fields per spec §3.2. */
  bedBathLevels?: SubjectTileRowBedBathLevels;
};

export type SubjectTileRowQuickAnalysis = {
  manualArvInput: string;
  setManualArvInput: (v: string) => void;
  arvPlaceholder: string;
  manualRehabInput: string;
  setManualRehabInput: (v: string) => void;
  rehabPlaceholder: string;
  manualTargetProfitInput: string;
  setManualTargetProfitInput: (v: string) => void;
  targetProfitPlaceholder: string;
  manualDaysHeldInput: string;
  setManualDaysHeldInput: (v: string) => void;
  daysHeldPlaceholder: string;
  /** Optional Tab key handler for the Target Profit input — used by the
   *  Workstation to redirect Tab focus to a downstream button. The modal
   *  does not pass this. */
  onTargetProfitTab?: () => void;
};

type SubjectTileRowProps = {
  mlsInfo: SubjectTileRowMlsInfo;
  physical: SubjectTileRowPhysical;
  quickAnalysis: SubjectTileRowQuickAnalysis;
  /** When false, the Quick Analysis tile is omitted from the row.
   *  Used by the new Workstation in 3E.3.b which renders its own
   *  auto-persisting <QuickAnalysisTile> separately. The screening
   *  modal omits this prop (defaulting to true) so its built-in
   *  local-only Quick Analysis tile keeps rendering unchanged. */
  showQuickAnalysis?: boolean;
  /** Additional tiles rendered after Quick Analysis in the flex row.
   *  Used by the screening modal to slot in Quick Status. */
  children?: React.ReactNode;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function SubjectTileRow({
  mlsInfo,
  physical,
  quickAnalysis,
  showQuickAnalysis = true,
  children,
}: SubjectTileRowProps) {
  const handleTargetProfitKeyDown = quickAnalysis.onTargetProfitTab
    ? (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Tab" && !e.shiftKey) {
          e.preventDefault();
          quickAnalysis.onTargetProfitTab?.();
        }
      }
    : undefined;

  return (
    <div className="flex gap-3">
      {/* MLS Info tile.
       *
       * `whitespace-nowrap` cascades to all child text so values like
       * "Price Decrease" don't wrap when they end up in the value column.
       * `width: max-content` lets the tile size to its natural content
       * width — the original `maxWidth: 320` cap caused the right column
       * to overflow once the value column expanded to fit the longer
       * mlsMajorChangeType strings. Letting the tile grow to fit content
       * is the cleanest fix; the parent flex container handles the row
       * layout naturally.
       */}
      <div
        className="shrink-0 whitespace-nowrap rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-snug"
        style={{ width: "max-content" }}
      >
        <div className="grid grid-cols-[auto_auto_16px_auto_auto] gap-x-2 gap-y-0.5">
          <span className="font-bold text-slate-500">MLS Status</span>
          <span className="text-slate-900">{mlsInfo.mlsStatus}</span>
          <span />
          <span className="font-bold text-slate-500">MLS#</span>
          <span className="text-slate-900">{mlsInfo.mlsNumber}</span>

          <span className="font-bold text-slate-500">MLS Change</span>
          <span className="text-slate-900">{mlsInfo.mlsChangeType}</span>
          <span />
          <span className="font-bold text-slate-500">List Date</span>
          <span className="text-slate-900">{mlsInfo.listDate}</span>

          <span className="font-bold text-slate-500">Orig List Price</span>
          <span className="text-slate-900">{mlsInfo.origListPrice}</span>
          <span />
          <span className="font-bold text-slate-500">U/C Date</span>
          <span className="text-slate-900">{mlsInfo.ucDate}</span>

          <span className="font-bold text-slate-500">List Price</span>
          <span className="text-slate-900">{mlsInfo.listPrice}</span>
          <span />
          <span className="font-bold text-slate-500">Close Date</span>
          <span className="text-slate-900">{mlsInfo.closeDate}</span>
        </div>
      </div>

      {/* Property Physical tile */}
      <div
        className="shrink-0 rounded border border-slate-200 bg-slate-50 px-3 py-2"
        style={{ maxWidth: 400 }}
      >
        <div className="grid grid-cols-[auto_auto_16px_auto_auto_16px_auto_auto] gap-x-2 gap-y-0.5 text-[11px] leading-snug">
          {/* Row 1 */}
          <span className="font-bold text-slate-500">Total SF</span>
          <span className="text-slate-900">{physical.totalSf}</span>
          <span />
          <span className="font-bold text-slate-500">Beds</span>
          <span className="text-slate-900">{physical.beds}</span>
          <span />
          <span className="font-bold text-slate-500">Type</span>
          <span className="text-slate-900">{physical.propertyType}</span>
          {/* Row 2 */}
          <span className="font-bold text-slate-500">Above SF</span>
          <span className="text-slate-900">{physical.aboveSf}</span>
          <span />
          <span className="font-bold text-slate-500">Baths</span>
          <span className="text-slate-900">{physical.baths}</span>
          <span />
          <span className="font-bold text-slate-500">Levels</span>
          <span className="text-slate-900">{physical.levels}</span>
          {/* Row 3 */}
          <span className="font-bold text-slate-500">Below SF</span>
          <span className="text-slate-900">{physical.belowSf}</span>
          <span />
          <span className="font-bold text-slate-500">Garage</span>
          <span className="text-slate-900">{physical.garage}</span>
          <span />
          <span className="font-bold text-slate-500">Year</span>
          <span
            className={
              physical.yearBuilt && physical.yearBuilt < 1950
                ? "font-bold text-red-600"
                : "text-slate-900"
            }
          >
            {physical.yearBuilt ?? "\u2014"}
          </span>
          {/* Row 4 */}
          <span className="font-bold text-slate-500">Bsmt Fin</span>
          <span className="text-slate-900">{physical.basementFinSf}</span>
          <span />
          <span className="font-bold text-slate-500">Lot SF</span>
          <span className="text-slate-900">{physical.lotSf}</span>
          <span />
          <span className="font-bold text-slate-500">Tax/HOA</span>
          <span className="text-slate-900">{physical.taxHoa}</span>
        </div>

        {/* Bed/bath level mini-grid (per spec §3.2). Only renders when
         *  the consumer provides per-level data. The screening modal
         *  omits this; the new Workstation in 3E populates it from
         *  WorkstationData.physical (per Phase 1 Step 3A's schema work). */}
        {physical.bedBathLevels && (
          <BedBathLevelGrid levels={physical.bedBathLevels} />
        )}
      </div>

      {/* Quick Analysis tile (conditionally rendered — omitted by the
       *  new Workstation which renders its own auto-persisting
       *  <QuickAnalysisTile> separately per 3E.3.b). */}
      {showQuickAnalysis && (
      <div
        className="shrink-0 rounded border border-blue-200 bg-blue-50/50 px-3 py-2"
        style={{ maxWidth: 320 }}
      >
        <div className="mb-1.5 text-[9px] font-bold uppercase tracking-wider text-blue-600">
          Quick Analysis
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Manual ARV
            </label>
            <input
              type="text"
              value={quickAnalysis.manualArvInput}
              onChange={(e) => quickAnalysis.setManualArvInput(e.target.value)}
              placeholder={quickAnalysis.arvPlaceholder}
              className="mt-0.5 w-[100px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Rehab Override
            </label>
            <input
              type="text"
              value={quickAnalysis.manualRehabInput}
              onChange={(e) => quickAnalysis.setManualRehabInput(e.target.value)}
              placeholder={quickAnalysis.rehabPlaceholder}
              className="mt-0.5 w-[100px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Target Profit
            </label>
            <input
              type="text"
              value={quickAnalysis.manualTargetProfitInput}
              onChange={(e) => quickAnalysis.setManualTargetProfitInput(e.target.value)}
              onKeyDown={handleTargetProfitKeyDown}
              placeholder={quickAnalysis.targetProfitPlaceholder}
              className="mt-0.5 w-[100px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </div>
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Days Held
            </label>
            <input
              type="text"
              value={quickAnalysis.manualDaysHeldInput}
              onChange={(e) => quickAnalysis.setManualDaysHeldInput(e.target.value)}
              placeholder={quickAnalysis.daysHeldPlaceholder}
              className="mt-0.5 w-[100px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
            />
          </div>
        </div>
      </div>
      )}
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BedBathLevelGrid — embedded mini-grid in the Property Physical tile
// ─────────────────────────────────────────────────────────────────────────────

/** Format a per-level bed/bath count for the mini-grid. Renders the
 *  number as-is, or an em-dash for null/zero. Counts are integers
 *  except baths which can have a `.5` (e.g. half bath). */
function fmtLevelCount(v: number | null): string {
  if (v == null) return "\u2014";
  if (v === 0) return "\u2014";
  // Render whole numbers without trailing zero, half-baths as "1.5"
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function BedBathLevelGrid({
  levels,
}: {
  levels: SubjectTileRowBedBathLevels;
}) {
  return (
    <div className="mt-2 inline-block rounded border border-slate-200 bg-white px-2 py-1">
      <table className="border-collapse text-[10px]">
        <thead>
          <tr className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            <th className="px-1 py-0 text-left"></th>
            <th className="px-1.5 py-0 text-right">Tot</th>
            <th className="px-1.5 py-0 text-right">Main</th>
            <th className="px-1.5 py-0 text-right">Up</th>
            <th className="px-1.5 py-0 text-right">Lo</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="px-1 py-0 font-bold text-slate-500">Bd</td>
            <td className="px-1.5 py-0 text-right font-mono text-slate-900">
              {fmtLevelCount(levels.bedsTotal)}
            </td>
            <td className="px-1.5 py-0 text-right font-mono text-slate-700">
              {fmtLevelCount(levels.bedsMain)}
            </td>
            <td className="px-1.5 py-0 text-right font-mono text-slate-700">
              {fmtLevelCount(levels.bedsUpper)}
            </td>
            <td className="px-1.5 py-0 text-right font-mono text-slate-700">
              {fmtLevelCount(levels.bedsLower)}
            </td>
          </tr>
          <tr>
            <td className="px-1 py-0 font-bold text-slate-500">Ba</td>
            <td className="px-1.5 py-0 text-right font-mono text-slate-900">
              {fmtLevelCount(levels.bathsTotal)}
            </td>
            <td className="px-1.5 py-0 text-right font-mono text-slate-700">
              {fmtLevelCount(levels.bathsMain)}
            </td>
            <td className="px-1.5 py-0 text-right font-mono text-slate-700">
              {fmtLevelCount(levels.bathsUpper)}
            </td>
            <td className="px-1.5 py-0 text-right font-mono text-slate-700">
              {fmtLevelCount(levels.bathsLower)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

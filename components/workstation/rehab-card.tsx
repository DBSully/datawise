// Phase 1 Step 3C Task 6 — RehabCard lifted to its own module.
//
// The Rehab card body — the per-category scope selectors with instant
// client-side recalc, the custom items list, and the Save button. Pure
// move from the current Workstation file with no behavior change. The
// rehab-exclusive helpers (CATEGORY_SCOPE_TIERS, REHAB_CATEGORIES,
// SCOPE_MULT_MAP, resolveLocalCost, MAX_CUSTOM_ITEMS) move along with
// the component since they have no other consumer.
//
// In 3E this same module becomes the body of the new Workstation's
// Rehab card modal per WORKSTATION_CARD_SPEC.md §6.

"use client";

import { useState, useMemo } from "react";
import { CardTitle } from "@/components/workstation/card-title";
import { fmt, fmtNum } from "@/lib/reports/format";
import { saveManualAnalysisAction } from "@/app/(workspace)/deals/actions";
import { initialManualAnalysisFormState } from "@/lib/analysis/manual-analysis-state";
import type {
  CategoryScopeTier,
  CategoryScopeValue,
  RehabCategoryKey,
  RehabCategoryScopes,
  RehabDetail,
  WorkstationData,
} from "@/lib/reports/types";

// ─────────────────────────────────────────────────────────────────────────────
// Rehab-exclusive helpers (moved along with the component)
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORY_SCOPE_TIERS: { key: CategoryScopeTier; label: string; mult: number }[] = [
  { key: "none", label: "None", mult: 0 },
  { key: "light", label: "Light", mult: 0.5 },
  { key: "moderate", label: "Mod", mult: 1.0 },
  { key: "heavy", label: "Heavy", mult: 1.5 },
  { key: "gut", label: "Gut", mult: 2.0 },
];

const REHAB_CATEGORIES: { key: RehabCategoryKey; label: string; shortLabel: string }[] = [
  { key: "aboveGrade", label: "Above Grade", shortLabel: "Above Grd" },
  { key: "belowGradeFinished", label: "Below Grade (fin)", shortLabel: "Below (fin)" },
  { key: "belowGradeUnfinished", label: "Below Grade (unfin)", shortLabel: "Below (unfin)" },
  { key: "exterior", label: "Exterior", shortLabel: "Exterior" },
  { key: "landscaping", label: "Landscaping", shortLabel: "Landscape" },
  { key: "systems", label: "Systems", shortLabel: "Systems" },
];

const SCOPE_MULT_MAP: Record<CategoryScopeTier, number> = {
  none: 0,
  light: 0.5,
  moderate: 1.0,
  heavy: 1.5,
  gut: 2.0,
};

function resolveLocalCost(
  key: RehabCategoryKey,
  scopeValue: CategoryScopeValue | undefined,
  baseDetail: Pick<RehabDetail, RehabCategoryKey> | null,
): number {
  const base = baseDetail?.[key] ?? 0;
  if (scopeValue === undefined) return Math.round(base * 1.0); // default moderate
  if (typeof scopeValue === "string") return Math.round(base * (SCOPE_MULT_MAP[scopeValue] ?? 1.0));
  if (typeof scopeValue === "object" && "cost" in scopeValue) return Math.round(scopeValue.cost);
  return Math.round(base);
}

const MAX_CUSTOM_ITEMS = 7;

// ─────────────────────────────────────────────────────────────────────────────
// RehabCard
// ─────────────────────────────────────────────────────────────────────────────

// Minimal router contract — RehabCard only calls router.refresh() after
// the save action completes. We accept a structural type instead of
// importing useRouter just for the typeof reference.
type RouterLike = { refresh: () => void };

type RehabCardProps = {
  d: WorkstationData;
  categoryScopes: RehabCategoryScopes;
  setCategoryScopes: React.Dispatch<React.SetStateAction<RehabCategoryScopes>>;
  customItems: Array<{ label: string; cost: number }>;
  setCustomItems: React.Dispatch<React.SetStateAction<Array<{ label: string; cost: number }>>>;
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;
  router: RouterLike;
};

export function RehabCard({
  d,
  categoryScopes,
  setCategoryScopes,
  customItems,
  setCustomItems,
  isSaving,
  setIsSaving,
  router,
}: RehabCardProps) {
  const [showCustomItems, setShowCustomItems] = useState(customItems.length > 0);

  // Client-side instant recalculation from base costs + custom items
  const liveCalc = useMemo(() => {
    const base = d.rehab.baseDetail;
    const costs: Record<RehabCategoryKey, number> = {
      aboveGrade: resolveLocalCost("aboveGrade", categoryScopes.aboveGrade, base),
      belowGradeFinished: resolveLocalCost("belowGradeFinished", categoryScopes.belowGradeFinished, base),
      belowGradeUnfinished: resolveLocalCost("belowGradeUnfinished", categoryScopes.belowGradeUnfinished, base),
      exterior: resolveLocalCost("exterior", categoryScopes.exterior, base),
      landscaping: resolveLocalCost("landscaping", categoryScopes.landscaping, base),
      systems: resolveLocalCost("systems", categoryScopes.systems, base),
    };
    const categoryTotal = costs.aboveGrade + costs.belowGradeFinished + costs.belowGradeUnfinished
      + costs.exterior + costs.landscaping + costs.systems;
    const customTotal = customItems.reduce((sum, item) => sum + (item.cost || 0), 0);
    const total = categoryTotal + customTotal;
    const buildingSqft = d.physical?.buildingSqft ?? 0;
    const aboveGradeSqft = d.physical?.aboveGradeSqft ?? 0;
    return {
      costs,
      categoryTotal,
      customTotal,
      total,
      perSqftBuilding: buildingSqft > 0 ? Math.round(total / buildingSqft * 100) / 100 : 0,
      perSqftAboveGrade: aboveGradeSqft > 0 ? Math.round(total / aboveGradeSqft * 100) / 100 : 0,
    };
  }, [categoryScopes, customItems, d.rehab.baseDetail, d.physical?.buildingSqft, d.physical?.aboveGradeSqft]);

  // Track whether local state differs from saved server state
  const scopesDirty = JSON.stringify(categoryScopes) !== JSON.stringify(d.rehab.categoryScopes ?? {});
  const customDirty = JSON.stringify(customItems) !== JSON.stringify(d.rehab.customItems ?? []);
  const isDirty = scopesDirty || customDirty;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2.5 shadow-sm">
      <CardTitle
        action={
          d.rehab.manual !== null ? (
            <span className="text-[9px] font-semibold text-emerald-600 uppercase">Override</span>
          ) : undefined
        }
      >
        Rehab
      </CardTitle>

      {d.rehab.detail && (
        <>
          {/* Base multiplier summary */}
          <div className="flex gap-x-2 text-[10px] text-slate-400 mb-2">
            <span>Type: {d.rehab.detail.typeMultiplier}</span>
            <span>Cond: {d.rehab.detail.conditionMultiplier}</span>
            <span>Price: {d.rehab.detail.priceMultiplier}</span>
            <span>Age: {d.rehab.detail.ageMultiplier}</span>
            <span className="font-semibold text-slate-600">Base: {d.rehab.detail.compositeMultiplier.toFixed(3)}</span>
          </div>

          {/* Per-category scope selectors with costs */}
          <form
            action={async (formData: FormData) => {
              setIsSaving(true);
              await saveManualAnalysisAction(initialManualAnalysisFormState, formData);
              setIsSaving(false);
              router.refresh();
            }}
          >
            <input type="hidden" name="analysis_id" value={d.analysisId} />
            <input type="hidden" name="property_id" value={d.propertyId} />
            {/* Preserve existing overrides */}
            <input type="hidden" name="arv_manual" value={d.manualAnalysis?.arv_manual as string ?? ""} />
            <input type="hidden" name="rehab_manual" value={d.manualAnalysis?.rehab_manual as string ?? ""} />
            <input type="hidden" name="days_held_manual" value={d.manualAnalysis?.days_held_manual as string ?? ""} />
            <input type="hidden" name="target_profit_manual" value={d.manualAnalysis?.target_profit_manual as string ?? ""} />
            <input type="hidden" name="analyst_condition" value={d.manualAnalysis?.analyst_condition as string ?? ""} />
            <input type="hidden" name="location_rating" value={d.manualAnalysis?.location_rating as string ?? ""} />
            <input type="hidden" name="rent_estimate_monthly" value={d.manualAnalysis?.rent_estimate_monthly as string ?? ""} />
            <input type="hidden" name="financing_rate_manual" value={d.manualAnalysis?.financing_rate_manual ? String(Number(d.manualAnalysis.financing_rate_manual) * 100) : ""} />
            <input type="hidden" name="financing_points_manual" value={d.manualAnalysis?.financing_points_manual ? String(Number(d.manualAnalysis.financing_points_manual) * 100) : ""} />
            <input type="hidden" name="financing_ltv_manual" value={d.manualAnalysis?.financing_ltv_manual ? String(Number(d.manualAnalysis.financing_ltv_manual) * 100) : ""} />
            <input type="hidden" name="rehab_scope" value={d.rehab.scope ?? ""} />

            {/* Column headers */}
            <div className="grid gap-x-1 mb-0.5" style={{ gridTemplateColumns: "82px repeat(5, 1fr) 72px 68px" }}>
              <div className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">Category</div>
              {CATEGORY_SCOPE_TIERS.map((t) => (
                <div key={t.key} className="text-center text-[8px] font-semibold uppercase tracking-wider text-slate-400">{t.label}</div>
              ))}
              <div className="text-center text-[8px] font-semibold uppercase tracking-wider text-slate-400">Custom $</div>
              <div className="text-right text-[8px] font-semibold uppercase tracking-wider text-slate-400">Cost</div>
            </div>

            {/* Category rows */}
            <div className="space-y-0.5">
              {REHAB_CATEGORIES.map((cat) => {
                const scopeValue = categoryScopes[cat.key];
                const isCustomCost = typeof scopeValue === "object" && scopeValue !== null && "cost" in scopeValue;
                const activeTier: CategoryScopeTier | "custom" = isCustomCost
                  ? "custom"
                  : typeof scopeValue === "string"
                    ? scopeValue
                    : "moderate";
                const customCostValue = isCustomCost ? (scopeValue as { cost: number }).cost : "";
                const lineCost = liveCalc.costs[cat.key];

                return (
                  <div key={cat.key} className="grid gap-x-1 items-center" style={{ gridTemplateColumns: "82px repeat(5, 1fr) 72px 68px" }}>
                    <span className="text-[10px] text-slate-600 truncate" title={cat.label}>{cat.shortLabel}</span>
                    {CATEGORY_SCOPE_TIERS.map((tier) => (
                      <button
                        key={tier.key}
                        type="button"
                        disabled={isSaving}
                        onClick={() => {
                          setCategoryScopes((prev) => ({ ...prev, [cat.key]: tier.key }));
                        }}
                        className={`rounded border px-0.5 py-0.5 text-[9px] font-medium text-center transition-colors ${
                          activeTier === tier.key
                            ? "border-blue-300 bg-blue-50 text-blue-700 shadow-sm"
                            : "border-slate-200 bg-white text-slate-400 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                        title={`${tier.label} (${tier.mult}x)`}
                      >
                        {tier.mult}
                      </button>
                    ))}
                    <input
                      type="number"
                      step="100"
                      min="0"
                      className={`w-full rounded border px-1 py-0.5 text-[9px] text-right font-mono ${
                        isCustomCost
                          ? "border-blue-300 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-400"
                      }`}
                      placeholder="—"
                      value={isCustomCost ? String(customCostValue) : ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "") {
                          setCategoryScopes((prev) => {
                            const next = { ...prev };
                            delete next[cat.key];
                            return next;
                          });
                        } else {
                          const n = parseFloat(val);
                          if (Number.isFinite(n)) {
                            setCategoryScopes((prev) => ({ ...prev, [cat.key]: { cost: n } }));
                          }
                        }
                      }}
                      title="Custom cost override ($)"
                    />
                    <span className="text-right text-[10px] font-mono text-slate-700">{fmt(lineCost)}</span>
                  </div>
                );
              })}
            </div>

            {/* ── Custom Items ── */}
            <div className="mt-1.5">
              {!showCustomItems ? (
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomItems(true);
                    if (customItems.length === 0) {
                      setCustomItems([{ label: "", cost: 0 }]);
                    }
                  }}
                  className="text-[10px] text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Custom Items
                </button>
              ) : (
                <div className="border-t border-slate-100 pt-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[8px] font-semibold uppercase tracking-wider text-slate-400">Custom Items</span>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCustomItems(false);
                        setCustomItems([]);
                      }}
                      className="text-[9px] text-slate-400 hover:text-red-500"
                      title="Remove all custom items"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {customItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <input
                          type="text"
                          className="flex-1 rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 placeholder:text-slate-300"
                          placeholder="e.g. Roof"
                          value={item.label}
                          onChange={(e) => {
                            setCustomItems((prev) => prev.map((it, i) =>
                              i === idx ? { ...it, label: e.target.value } : it,
                            ));
                          }}
                        />
                        <input
                          type="number"
                          step="100"
                          min="0"
                          className="w-[80px] rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-right font-mono text-slate-700 placeholder:text-slate-300"
                          placeholder="$0"
                          value={item.cost || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            const n = val === "" ? 0 : parseFloat(val);
                            setCustomItems((prev) => prev.map((it, i) =>
                              i === idx ? { ...it, cost: Number.isFinite(n) ? n : 0 } : it,
                            ));
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setCustomItems((prev) => {
                              const next = prev.filter((_, i) => i !== idx);
                              if (next.length === 0) setShowCustomItems(false);
                              return next;
                            });
                          }}
                          className="text-[10px] text-slate-300 hover:text-red-500 px-0.5"
                          title="Remove item"
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                  {customItems.length < MAX_CUSTOM_ITEMS && (
                    <button
                      type="button"
                      onClick={() => setCustomItems((prev) => [...prev, { label: "", cost: 0 }])}
                      className="mt-1 text-[10px] text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Add
                    </button>
                  )}
                  {liveCalc.customTotal > 0 && (
                    <div className="flex justify-between mt-1 text-[10px]">
                      <span className="text-slate-500">Custom subtotal</span>
                      <span className="font-mono text-slate-600">{fmt(liveCalc.customTotal)}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Hidden fields carry the JSON payloads */}
            <input
              type="hidden"
              name="rehab_category_scopes"
              value={JSON.stringify(categoryScopes)}
            />
            <input
              type="hidden"
              name="rehab_custom_items"
              value={JSON.stringify(customItems.filter((it) => it.label.trim() !== "" || it.cost > 0))}
            />

            <button
              type="submit"
              disabled={isSaving || !isDirty}
              className={`w-full mt-2 rounded-md border px-2 py-1 text-[10px] font-semibold transition-colors ${
                isDirty
                  ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
                  : "border-slate-200 bg-slate-50 text-slate-400 cursor-default"
              }`}
            >
              {isSaving ? "Saving..." : isDirty ? "Save Rehab" : "Saved"}
            </button>
          </form>

          <div className="border-t border-slate-200 mt-2 pt-1.5 flex items-center justify-between text-[11px]">
            <span className="font-bold text-slate-700">Total Rehab</span>
            <span className="font-mono font-bold text-slate-800">{fmt(liveCalc.total)}</span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>${fmtNum(liveCalc.perSqftBuilding, 2)}/sqft bldg</span>
            <span>${fmtNum(liveCalc.perSqftAboveGrade, 2)}/sqft ag</span>
          </div>
        </>
      )}
    </div>
  );
}

"use client";

import { useActionState } from "react";
import { saveManualAnalysisAction } from "@/app/(workspace)/analysis/properties/actions";
import { initialManualAnalysisFormState } from "@/lib/analysis/manual-analysis-state";

type ManualAnalysisPanelProps = {
  propertyId: string;
  listingId: string | null;
  analysisId: string | null;
  analysisUpdatedAt: string | null;
  manualAnalysis: {
    analyst_condition: string | null;
    update_year_est: number | null;
    update_quality: string | null;
    uad_condition_manual: string | null;
    uad_updates_manual: string | null;
    arv_manual: number | null;
    margin_manual: number | null;
    rehab_manual: number | null;
    days_held_manual: number | null;
    rent_estimate_monthly: number | null;
    design_rating: string | null;
    location_rating: string | null;
  } | null;
  pipeline: {
    interest_level: string | null;
    showing_status: string | null;
    offer_status: string | null;
  } | null;
};

function Field({
  label,
  name,
  defaultValue,
  type = "text",
  step,
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="dw-label">{label}</label>
      <input
        name={name}
        type={type}
        step={step}
        defaultValue={defaultValue ?? ""}
        className="dw-input"
      />
    </div>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  options: string[];
}) {
  return (
    <div>
      <label className="dw-label">{label}</label>
      <select
        name={name}
        defaultValue={defaultValue ?? ""}
        className="dw-select"
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

const analystConditionOptions = [
  "Fixer",
  "Poor",
  "Fair",
  "Average",
  "Good",
  "Excellent",
];

const uadConditionOptions = ["C1", "C2", "C3", "C4", "C5", "C6"];
const uadUpdateOptions = ["U1", "U2", "U3", "U4", "U5", "U6"];
const updateQualityOptions = ["None", "Light", "Moderate", "Heavy", "Full"];
const ratingOptions = ["Poor", "Fair", "Average", "Good", "Excellent"];
const interestOptions = ["Low", "Medium", "High", "Hot"];
const showingOptions = [
  "Not Scheduled",
  "Scheduled",
  "Complete",
  "Virtual Complete",
];
const offerOptions = [
  "No Offer",
  "Drafting",
  "Submitted",
  "Accepted",
  "Expired",
  "Rejected",
];

export function ManualAnalysisPanel({
  propertyId,
  listingId,
  analysisId,
  analysisUpdatedAt,
  manualAnalysis,
  pipeline,
}: ManualAnalysisPanelProps) {
  const [state, formAction, isPending] = useActionState(
    saveManualAnalysisAction,
    initialManualAnalysisFormState,
  );

  const safeState = state ?? initialManualAnalysisFormState;

  return (
    <div className="dw-card-compact space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="dw-card-title-compact">Manual Analysis</h2>
          <p className="dw-card-copy-compact">
            Analyst overrides, ratings, and workflow inputs.
          </p>
        </div>

        <button
          type="submit"
          form="manual-analysis-form"
          className="dw-button-primary"
        >
          {isPending ? "Saving..." : "Save Analysis"}
        </button>
      </div>

      {safeState.message ? (
        <div
          className={`dw-card-tight text-sm ${
            safeState.status === "error"
              ? "border-red-200 bg-red-50 text-red-800"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {safeState.message}
        </div>
      ) : null}

      <form id="manual-analysis-form" action={formAction} className="space-y-3">
        <input type="hidden" name="property_id" value={propertyId} />
        <input type="hidden" name="listing_id" value={listingId ?? ""} />
        <input
          type="hidden"
          name="analysis_id"
          value={analysisId ?? safeState.analysisId ?? ""}
        />

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Valuation Assumptions
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <Field
              label="Manual ARV"
              name="arv_manual"
              type="number"
              step="0.01"
              defaultValue={manualAnalysis?.arv_manual}
            />
            <Field
              label="Target Margin $"
              name="margin_manual"
              type="number"
              step="0.01"
              defaultValue={manualAnalysis?.margin_manual}
            />
            <Field
              label="Manual Rehab"
              name="rehab_manual"
              type="number"
              step="0.01"
              defaultValue={manualAnalysis?.rehab_manual}
            />
            <Field
              label="Rent Estimate / Mo"
              name="rent_estimate_monthly"
              type="number"
              step="0.01"
              defaultValue={manualAnalysis?.rent_estimate_monthly}
            />
            <Field
              label="Days Held"
              name="days_held_manual"
              type="number"
              defaultValue={manualAnalysis?.days_held_manual}
            />
            <Field
              label="Update Year Est"
              name="update_year_est"
              type="number"
              defaultValue={manualAnalysis?.update_year_est}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Condition + Ratings
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <SelectField
              label="Analyst Condition"
              name="analyst_condition"
              defaultValue={manualAnalysis?.analyst_condition}
              options={analystConditionOptions}
            />
            <SelectField
              label="Update Quality"
              name="update_quality"
              defaultValue={manualAnalysis?.update_quality}
              options={updateQualityOptions}
            />
            <SelectField
              label="UAD Condition"
              name="uad_condition_manual"
              defaultValue={manualAnalysis?.uad_condition_manual}
              options={uadConditionOptions}
            />
            <SelectField
              label="UAD Updates"
              name="uad_updates_manual"
              defaultValue={manualAnalysis?.uad_updates_manual}
              options={uadUpdateOptions}
            />
            <SelectField
              label="Design Rating"
              name="design_rating"
              defaultValue={manualAnalysis?.design_rating}
              options={ratingOptions}
            />
            <SelectField
              label="Location Rating"
              name="location_rating"
              defaultValue={manualAnalysis?.location_rating}
              options={ratingOptions}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            Workflow
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <SelectField
              label="Interest Level"
              name="interest_level"
              defaultValue={pipeline?.interest_level}
              options={interestOptions}
            />
            <SelectField
              label="Showing Status"
              name="showing_status"
              defaultValue={pipeline?.showing_status}
              options={showingOptions}
            />
            <SelectField
              label="Offer Status"
              name="offer_status"
              defaultValue={pipeline?.offer_status}
              options={offerOptions}
            />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2">
          <div className="text-[11px] text-slate-500">
            {analysisId || safeState.analysisId ? (
              <>
                Analysis ID:{" "}
                <span className="font-mono text-slate-700">
                  {analysisId ?? safeState.analysisId}
                </span>
                {analysisUpdatedAt ? (
                  <span className="ml-2">
                    Last updated: {new Date(analysisUpdatedAt).toLocaleString()}
                  </span>
                ) : null}
              </>
            ) : (
              "A new analysis record will be created on first save."
            )}
          </div>

          <button type="submit" className="dw-button-primary">
            {isPending ? "Saving..." : "Save Analysis"}
          </button>
        </div>
      </form>
    </div>
  );
}

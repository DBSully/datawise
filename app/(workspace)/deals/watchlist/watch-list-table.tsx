"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateInterestLevelAction,
  updateShowingStatusAction,
  updateWatchListNoteAction,
  passFromWatchListAction,
  moveToPipelineAction,
} from "./actions";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WatchListRow = {
  analysis_id: string;
  real_property_id: string;
  unparsed_address: string;
  city: string;
  property_type: string | null;
  building_area_total_sqft: number | null;
  bedrooms_total: number | null;
  bathrooms_total: number | null;
  interest_level: string | null;
  showing_status: string | null;
  watch_list_note: string | null;
  days_on_watch_list: number | null;
  pipeline_updated_at: string | null;
  subject_list_price: number | null;
  current_list_price: number | null;
  arv_aggregate: number | null;
  max_offer: number | null;
  est_gap_per_sqft: number | null;
  offer_pct: number | null;
  arv_comp_count: number | null;
  rehab_total: number | null;
  trend_annual_rate: number | null;
  is_prime_candidate: boolean | null;
  mls_status: string | null;
  strategy_type: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function $f(v: number | null | undefined) {
  if (v == null) return "—";
  return "$" + v.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

function fmtNum(v: number | null | undefined, d = 0) {
  if (v == null) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtPct(v: number | null | undefined) {
  if (v == null) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

const INTEREST_CONFIG: Record<string, { icon: string; label: string; sortOrder: number }> = {
  hot:   { icon: "🔴", label: "Hot",   sortOrder: 0 },
  warm:  { icon: "🟡", label: "Warm",  sortOrder: 1 },
  watch: { icon: "🟢", label: "Watch", sortOrder: 2 },
  new:   { icon: "⚪", label: "New",   sortOrder: 3 },
};

const SHOWING_OPTIONS = [
  { value: "", label: "No contact" },
  { value: "agent_contacted", label: "Agent contacted" },
  { value: "showing_scheduled", label: "Showing scheduled" },
  { value: "showing_complete", label: "Showing complete" },
];

const PASS_REASONS = [
  "Comps too weak",
  "Rehab too heavy",
  "Price too high",
  "Location concern",
  "Lost to another buyer",
  "Other",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function WatchListTable({ rows }: { rows: WatchListRow[] }) {
  const router = useRouter();
  const [editingNote, setEditingNote] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [passingId, setPassingId] = useState<string | null>(null);
  const [passReason, setPassReason] = useState("");
  const [busy, setBusy] = useState(false);

  const handleInterestChange = useCallback(
    async (analysisId: string, level: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("interest_level", level);
      await updateInterestLevelAction(fd);
      router.refresh();
    },
    [router],
  );

  const handleStatusChange = useCallback(
    async (analysisId: string, status: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("showing_status", status);
      await updateShowingStatusAction(fd);
      router.refresh();
    },
    [router],
  );

  const handleNoteSave = useCallback(
    async (analysisId: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("watch_list_note", noteText);
      await updateWatchListNoteAction(fd);
      setEditingNote(null);
      router.refresh();
    },
    [noteText, router],
  );

  const handlePass = useCallback(
    async (analysisId: string) => {
      if (!passReason) return;
      setBusy(true);
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("pass_reason", passReason);
      await passFromWatchListAction(fd);
      setPassingId(null);
      setPassReason("");
      setBusy(false);
      router.refresh();
    },
    [passReason, router],
  );

  const handleMoveToPipeline = useCallback(
    async (analysisId: string) => {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      await moveToPipelineAction(fd);
      router.refresh();
    },
    [router],
  );

  if (rows.length === 0) {
    return (
      <div className="dw-card py-12 text-center">
        <p className="text-sm text-slate-500">
          No deals on the Watch List yet. Promote properties from the{" "}
          <Link href="/intake/screening" className="text-blue-600 hover:underline">
            Screening Queue
          </Link>{" "}
          to get started.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="dw-table-wrap">
        <table className="dw-table-compact min-w-[1400px]">
          <thead>
            <tr>
              <th style={{ width: 36 }}></th>
              <th>Address</th>
              <th>City</th>
              <th>Type</th>
              <th className="text-right">List</th>
              <th className="text-right">ARV</th>
              <th className="text-right">Max Offer</th>
              <th className="text-right">Gap/sqft</th>
              <th className="text-right">Comps</th>
              <th className="text-right">Days</th>
              <th>Status</th>
              <th>Note</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const ic = INTEREST_CONFIG[r.interest_level ?? "new"] ?? INTEREST_CONFIG.new;
              const listPrice = r.current_list_price ?? r.subject_list_price;
              const isEditingThisNote = editingNote === r.analysis_id;
              const isPassingThis = passingId === r.analysis_id;

              return (
                <tr key={r.analysis_id} className="group">
                  {/* Interest level */}
                  <td className="text-center">
                    <InterestDropdown
                      value={r.interest_level ?? "new"}
                      icon={ic.icon}
                      onChange={(level) => handleInterestChange(r.analysis_id, level)}
                    />
                  </td>

                  {/* Address */}
                  <td className="font-medium">
                    <Link
                      href={`/deals/watchlist/${r.analysis_id}`}
                      className="text-blue-700 hover:underline"
                    >
                      {r.unparsed_address}
                    </Link>
                  </td>

                  <td className="text-slate-500">{r.city}</td>
                  <td className="text-xs text-slate-500">{r.property_type ?? "—"}</td>
                  <td className="text-right">{$f(listPrice)}</td>
                  <td className="text-right font-medium text-emerald-700">{$f(r.arv_aggregate)}</td>
                  <td className="text-right font-medium">{$f(r.max_offer)}</td>
                  <td className={`text-right font-semibold ${(r.est_gap_per_sqft ?? 0) >= 60 ? "text-emerald-700" : ""}`}>
                    {r.est_gap_per_sqft != null ? `$${fmtNum(r.est_gap_per_sqft)}` : "—"}
                  </td>
                  <td className="text-right text-slate-500">{fmtNum(r.arv_comp_count)}</td>
                  <td className="text-right text-slate-500">{r.days_on_watch_list ?? "—"}</td>

                  {/* Status dropdown */}
                  <td>
                    <select
                      value={r.showing_status ?? ""}
                      onChange={(e) => handleStatusChange(r.analysis_id, e.target.value)}
                      className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] text-slate-700"
                    >
                      {SHOWING_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>

                  {/* Note */}
                  <td className="max-w-[180px]">
                    {isEditingThisNote ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleNoteSave(r.analysis_id);
                            if (e.key === "Escape") setEditingNote(null);
                          }}
                          className="w-full rounded border border-blue-300 px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleNoteSave(r.analysis_id)}
                          className="text-[10px] font-semibold text-blue-600"
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote(r.analysis_id);
                          setNoteText(r.watch_list_note ?? "");
                        }}
                        className="max-w-[180px] truncate text-left text-[11px] text-slate-500 hover:text-slate-800"
                        title={r.watch_list_note ?? "Click to add note"}
                      >
                        {r.watch_list_note || "—"}
                      </button>
                    )}
                  </td>

                  {/* Actions */}
                  <td>
                    {isPassingThis ? (
                      <div className="flex items-center gap-1">
                        <select
                          value={passReason}
                          onChange={(e) => setPassReason(e.target.value)}
                          className="rounded border border-red-200 px-1 py-0.5 text-[10px]"
                        >
                          <option value="">Reason...</option>
                          {PASS_REASONS.map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => handlePass(r.analysis_id)}
                          disabled={!passReason || busy}
                          className="text-[10px] font-semibold text-red-600 disabled:opacity-50"
                        >
                          OK
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPassingId(null); setPassReason(""); }}
                          className="text-[10px] text-slate-400"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/deals/watchlist/${r.analysis_id}`}
                          className="text-[10px] font-semibold text-blue-600 hover:underline"
                        >
                          Open
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleMoveToPipeline(r.analysis_id)}
                          className="text-[10px] font-semibold text-indigo-600 hover:underline"
                        >
                          Pipeline
                        </button>
                        <button
                          type="button"
                          onClick={() => setPassingId(r.analysis_id)}
                          className="text-[10px] font-semibold text-red-500 hover:underline"
                        >
                          Pass
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Interest level dropdown (inline)
// ---------------------------------------------------------------------------

function InterestDropdown({
  value,
  icon,
  onChange,
}: {
  value: string;
  icon: string;
  onChange: (level: string) => void;
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
        title="Change interest level"
      >
        <option value="hot">Hot</option>
        <option value="warm">Warm</option>
        <option value="watch">Watch</option>
      </select>
      <span className="cursor-pointer text-base" title={INTEREST_CONFIG[value]?.label ?? value}>
        {icon}
      </span>
    </div>
  );
}

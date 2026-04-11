// Phase 1 Step 3C Task 8 — AddCompByMls lifted to its own module.
//
// A small inline form that lets the analyst add a comparable to the
// current comp search run by typing an MLS#. Used in the screening
// modal today (alongside ExpandSearchPanel under the comp map) and in
// the new Workstation hero in 3E.
//
// Already had a clean prop interface (compSearchRunId, subjectPropertyId,
// onAdded) with no closures over modal-local state and no helper
// dependencies. Single server action call (addManualScreeningCompAction).
// The lift is mechanical — pure copy-paste with the addition of the
// "use client" directive and an explicit export.

"use client";

import { useState, useCallback } from "react";
import { addManualScreeningCompAction } from "@/app/(workspace)/screening/actions";

type AddCompByMlsProps = {
  compSearchRunId: string;
  subjectPropertyId: string;
  onAdded: () => void;
};

export function AddCompByMls({
  compSearchRunId,
  subjectPropertyId,
  onAdded,
}: AddCompByMlsProps) {
  const [mls, setMls] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleAdd = useCallback(async () => {
    if (!mls.trim()) return;
    setAdding(true);
    setMsg(null);
    const result = await addManualScreeningCompAction(compSearchRunId, subjectPropertyId, mls.trim());
    if (result.ok) {
      setMsg({ ok: true, text: `MLS# ${mls.trim()} added.` });
      setMls("");
      onAdded();
    } else {
      setMsg({ ok: false, text: result.error });
    }
    setAdding(false);
  }, [compSearchRunId, subjectPropertyId, mls, onAdded]);

  return (
    <div className="mt-2 flex items-center gap-1.5">
      <input
        type="text"
        value={mls}
        onChange={(e) => { setMls(e.target.value); setMsg(null); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAdd(); } }}
        placeholder="Add by MLS#"
        className="w-[120px] rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={handleAdd}
        disabled={adding || !mls.trim()}
        className="rounded bg-slate-700 px-2 py-1 text-[10px] font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
      >
        {adding ? "..." : "Add"}
      </button>
      {msg && (
        <span className={`text-[10px] ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </span>
      )}
    </div>
  );
}

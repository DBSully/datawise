// Phase 1 Step 3E.7.h — NotesCardModal (editing with 3-tier visibility).
//
// The Notes card's detail modal per WORKSTATION_CARD_SPEC.md §5.8 +
// Decision 8 (three-tier visibility). Features:
//
// - Add Note form: category select + 2-way visibility selector
//   (Internal / All Partners — "Specific Partners" deferred to Step 4
//   since the analysis_shares table doesn't exist yet) + body textarea
// - Existing note rows with visibility badges (🔒 INT / 🌐 ALL)
// - Category filter chips
// - Delete note button per row
//
// Uses existing addAnalysisNoteAction (modified in this commit to
// accept visibility) and deleteAnalysisNoteAction from deals/actions.ts.
//
// Deferred to polish / Step 4:
// - "Specific Partners" picker (requires analysis_shares table)
// - Visibility editing on existing notes (clickable badges)
// - Filter by visibility tier

"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DetailModal } from "@/components/workstation/detail-modal";
import {
  addAnalysisNoteAction,
  deleteAnalysisNoteAction,
} from "@/app/(workspace)/deals/actions";
import type { WorkstationData } from "@/lib/reports/types";

const NOTE_CATEGORIES = [
  { value: "location", label: "Location", icon: "L" },
  { value: "scope", label: "Scope", icon: "S" },
  { value: "valuation", label: "Valuation", icon: "V" },
  { value: "property", label: "Property", icon: "P" },
  { value: "workflow", label: "Workflow", icon: "W" },
  { value: "offer", label: "Offer", icon: "O" },
] as const;

type NoteRow = WorkstationData["notes"][number];

type NotesCardModalProps = {
  data: WorkstationData;
  onClose: () => void;
};

export function NotesCardModal({ data, onClose }: NotesCardModalProps) {
  const router = useRouter();
  const analysisId = data.analysisId;

  // ── Add Note form state ────────────────────────────────────────────
  const [noteCategory, setNoteCategory] = useState("location");
  const [noteVisibility, setNoteVisibility] = useState<
    "internal" | "all_partners"
  >("internal");
  const [noteBody, setNoteBody] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // ── Category filter ────────────────────────────────────────────────
  const [filterCategory, setFilterCategory] = useState<string | null>(null);

  const handleAddNote = useCallback(async () => {
    if (!noteBody.trim()) return;
    setIsAdding(true);
    try {
      const fd = new FormData();
      fd.set("analysis_id", analysisId);
      fd.set("note_type", noteCategory);
      fd.set("note_body", noteBody.trim());
      fd.set("visibility", noteVisibility);
      await addAnalysisNoteAction(fd);
      setNoteBody("");
      router.refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[addNote]", err);
    } finally {
      setIsAdding(false);
    }
  }, [analysisId, noteCategory, noteVisibility, noteBody, router]);

  const handleDeleteNote = useCallback(
    async (noteId: string) => {
      const fd = new FormData();
      fd.set("note_id", noteId);
      fd.set("analysis_id", analysisId);
      await deleteAnalysisNoteAction(fd);
      router.refresh();
    },
    [analysisId, router],
  );

  // Filter notes by category if a filter is active
  const filteredNotes = filterCategory
    ? data.notes.filter((n) => n.note_type === filterCategory)
    : data.notes;

  return (
    <DetailModal title="Notes" onClose={onClose}>
      {/* ── Add Note form ── */}
      <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
        <div className="flex items-center gap-3">
          {/* Category select */}
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Category
            </label>
            <select
              value={noteCategory}
              onChange={(e) => setNoteCategory(e.target.value)}
              className="mt-0.5 w-[120px] rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[11px] text-slate-900"
            >
              {NOTE_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>

          {/* Visibility selector */}
          <div>
            <label className="block text-[9px] font-semibold uppercase tracking-wider text-slate-500">
              Visibility
            </label>
            <div className="mt-0.5 flex items-center gap-2">
              <label className="flex items-center gap-1 text-[11px]">
                <input
                  type="radio"
                  name="visibility"
                  value="internal"
                  checked={noteVisibility === "internal"}
                  onChange={() => setNoteVisibility("internal")}
                  className="h-3 w-3"
                />
                <span className="text-slate-700">🔒 Internal</span>
              </label>
              <label className="flex items-center gap-1 text-[11px]">
                <input
                  type="radio"
                  name="visibility"
                  value="all_partners"
                  checked={noteVisibility === "all_partners"}
                  onChange={() => setNoteVisibility("all_partners")}
                  className="h-3 w-3"
                />
                <span className="text-slate-700">🌐 All Partners</span>
              </label>
              <span
                className="text-[10px] text-slate-400"
                title="Specific Partners picker arrives in Step 4 when the analysis_shares table is built"
              >
                👥 Specific: Step 4
              </span>
            </div>
          </div>
        </div>

        {/* Body textarea */}
        <textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          rows={2}
          placeholder="Add a note..."
          className="mt-2 w-full rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-200"
        />
        <div className="mt-1.5 flex justify-end">
          <button
            type="button"
            onClick={handleAddNote}
            disabled={isAdding || !noteBody.trim()}
            className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-[11px] font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
          >
            {isAdding ? "Adding..." : "Add Note"}
          </button>
        </div>
      </div>

      {/* ── Category filter chips ── */}
      <div className="mt-3 flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setFilterCategory(null)}
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            filterCategory === null
              ? "bg-slate-800 text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          All ({data.notes.length})
        </button>
        {NOTE_CATEGORIES.map((cat) => {
          const count = data.notes.filter(
            (n) => n.note_type === cat.value,
          ).length;
          if (count === 0) return null;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() =>
                setFilterCategory(
                  filterCategory === cat.value ? null : cat.value,
                )
              }
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                filterCategory === cat.value
                  ? "bg-slate-800 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {cat.label} ({count})
            </button>
          );
        })}
      </div>

      {/* ── Note list ── */}
      <div className="mt-3 space-y-1">
        {filteredNotes.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            {filterCategory
              ? "No notes in this category."
              : "No notes yet. Add one above."}
          </p>
        ) : (
          filteredNotes.map((note: NoteRow) => {
            const catInfo = NOTE_CATEGORIES.find(
              (c) => c.value === note.note_type,
            );
            const vis = note.visibility ?? "internal";
            return (
              <div
                key={note.id}
                className="flex items-start gap-2 rounded border border-slate-100 bg-white px-2 py-1.5 text-[11px]"
              >
                {/* Category badge */}
                <span
                  className="mt-0.5 shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] font-bold text-slate-600"
                  title={catInfo?.label ?? note.note_type}
                >
                  {catInfo?.icon ?? "?"}
                </span>

                {/* Note body */}
                <div className="min-w-0 flex-1">
                  <p className="text-slate-800">{note.note_body}</p>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                    <span>
                      {new Date(note.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Visibility badge */}
                <span
                  className={`mt-0.5 shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold ${
                    vis === "internal"
                      ? "bg-slate-100 text-slate-500"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {vis === "internal" ? "🔒 INT" : "🌐 ALL"}
                </span>

                {/* Delete button */}
                <button
                  type="button"
                  onClick={() => handleDeleteNote(note.id)}
                  className="mt-0.5 shrink-0 text-[10px] text-slate-300 hover:text-red-500"
                  title="Delete note"
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </DetailModal>
  );
}

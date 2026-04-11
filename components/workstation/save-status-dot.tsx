// Phase 1 Step 3D Task 3 — SaveStatusDot indicator.
//
// A small inline status circle that visualizes the current state of an
// auto-persist save cycle. Pairs with `useDebouncedSave` (Task 2) and
// the saveManualAnalysisFieldAction (Task 1) to give the user
// continuous feedback about whether their typed values have made it
// to the database.
//
// Color mapping per spec §3.2 + master plan §3D:
//
//   - idle    — slate-300  ("All changes saved", neutral)
//   - saving  — amber-400  (debounce expired, action in flight)
//   - saved   — emerald-500 (action returned success, fades to idle
//                            after 1s via the hook)
//   - error   — red-500    (action threw; tooltip surfaces the message)
//
// Sized to fit inline next to an input field — 8px diameter (h-2 w-2
// in Tailwind). The dot has a `transition-colors` class so the state
// transitions look like a smooth color cycle rather than a hard flip.
//
// Accessibility:
//   - role="status" tells screen readers this is a live status region
//   - aria-label gives the spoken state ("Saving", "Saved", "Save failed")
//   - title attribute provides a hover tooltip — in the error state
//     this surfaces the actual server error message so the user can
//     see WHY the save failed
//
// Consumer pattern:
//
//   const { status, errorMessage } = useDebouncedSave(value, save);
//   <SaveStatusDot status={status} errorMessage={errorMessage} />

import type { SaveState } from "@/lib/auto-persist/use-debounced-save";

const STATE_STYLE: Record<SaveState, { color: string; label: string }> = {
  idle:   { color: "bg-slate-300",   label: "All changes saved" },
  saving: { color: "bg-amber-400",   label: "Saving..." },
  saved:  { color: "bg-emerald-500", label: "Saved" },
  error:  { color: "bg-red-500",     label: "Save failed" },
};

type SaveStatusDotProps = {
  status: SaveState;
  errorMessage?: string | null;
};

export function SaveStatusDot({ status, errorMessage }: SaveStatusDotProps) {
  const { color, label } = STATE_STYLE[status];
  // In the error state, prefer the server's specific error message in
  // the tooltip so the user can see WHY the save failed. Fall back to
  // the generic "Save failed" label if no message is available.
  const tooltip =
    status === "error" && errorMessage ? errorMessage : label;
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full transition-colors ${color}`}
      role="status"
      aria-label={label}
      title={tooltip}
    />
  );
}

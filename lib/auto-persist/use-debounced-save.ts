// Phase 1 Step 3D Task 2 — useDebouncedSave hook.
//
// Watches a value and triggers a debounced save callback when the value
// changes. Returns a state machine the consumer can pass into
// <SaveStatusDot> to render the visual feedback. Designed to be the
// single auto-persist primitive that every input in the new Workstation
// (3E) builds on top of.
//
// State machine:
//
//   idle ──── value changes ────► (debounce timer running, status = idle)
//                                          │
//                                          │ timer fires (default 500ms)
//                                          ▼
//                                     saving ────► saved ────► idle
//                                          │       (1s fade)
//                                          │
//                                          └────► error (stays until next edit)
//
// Critical correctness invariants — these are the easy-to-miss bugs the
// hook explicitly addresses:
//
// 1. FIRST-RENDER SKIP. The initial value passed to the hook is the
//    value loaded from the database, not a user edit. Firing a save on
//    mount would be a redundant write AND would race with the loader.
//    `isFirstRender` ref guards the effect.
//
// 2. REQUEST COUNTER. If the user types fast and the network is slow,
//    multiple saves can be in flight. Their resolve callbacks may land
//    out of order — a stale "12" save could resolve AFTER a fresh "120"
//    save and overwrite the success indicator with stale state. The
//    request counter ensures only the LATEST in-flight request can
//    transition the UI; older requests' resolve callbacks become no-ops.
//
// 3. DEBOUNCE CANCELLATION. If the user types again before the previous
//    debounce timer fires, the previous timer is cancelled. Only the
//    most recent value gets saved. Coalesces fast typing into a single
//    save.
//
// 4. FADE TIMER CANCELLATION. After a successful save, the dot stays
//    emerald for 1s then fades to slate (idle). If the user types
//    again during this fade, the fade is cancelled and the new edit
//    cycle takes over (slate → debouncing → amber → ...).
//
// 5. UNMOUNT CLEANUP. If the component unmounts while a save is in
//    flight, the save's resolve callback would call setState on an
//    unmounted component (warning) and could even leak the request ID.
//    The cleanup effect bumps the request counter to a sentinel
//    (-1) so any in-flight resolve is treated as stale and ignored.
//    Both timers are also cleared.
//
// Consumer pattern (3E.3 will look like this):
//
//   const [arvInput, setArvInput] = useState<string>(initialValue);
//   const arvNumber = parseInputToNumber(arvInput);
//   const { status, errorMessage } = useDebouncedSave(
//     arvNumber,
//     async (value) => {
//       await saveManualAnalysisFieldAction({
//         analysisId,
//         field: "arv_manual",
//         value,
//       });
//     },
//   );
//
//   <input value={arvInput} onChange={(e) => setArvInput(e.target.value)} />
//   <SaveStatusDot status={status} errorMessage={errorMessage} />
//
// The hook does NOT manage the value itself — the input is the source
// of truth via normal useState. The hook only watches the value and
// triggers debounced saves.

"use client";

import { useEffect, useRef, useState } from "react";

export type SaveState = "idle" | "saving" | "saved" | "error";

export type UseDebouncedSaveResult = {
  status: SaveState;
  errorMessage: string | null;
};

export type UseDebouncedSaveOptions = {
  /** Delay in ms after the value last changed before the save fires.
   *  Default 500ms per the spec. */
  delayMs?: number;
  /** How long the "saved" green dot stays visible before fading back
   *  to idle. Default 1000ms per the spec. */
  savedFadeMs?: number;
};

/** Sentinel request ID used after unmount so any in-flight save's
 *  resolve callback compares unequal to the live counter and gets
 *  ignored as stale. */
const UNMOUNTED_REQUEST_ID = -1;

export function useDebouncedSave<T>(
  value: T,
  save: (value: T) => Promise<void>,
  options?: UseDebouncedSaveOptions,
): UseDebouncedSaveResult {
  const [status, setStatus] = useState<SaveState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs that don't trigger re-renders.
  const isFirstRender = useRef(true);
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the latest save callback in a ref so the effect doesn't
  // re-fire when the parent passes a new function reference each
  // render. The effect's dependency list is just `value` + the timing
  // options — it intentionally does NOT depend on `save`.
  const saveRef = useRef(save);
  saveRef.current = save;

  const delayMs = options?.delayMs ?? 500;
  const savedFadeMs = options?.savedFadeMs ?? 1000;

  // Main effect — watches `value` and triggers debounced saves.
  useEffect(() => {
    // Invariant 1: skip the first render. Initial value came from the
    // loaded data, not a user edit.
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Invariant 3: cancel any pending debounce timer — newer keystroke
    // supersedes the older.
    if (debounceTimerRef.current != null) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    // Invariant 4: cancel any in-flight "saved" fade — we're starting a
    // new edit cycle.
    if (fadeTimerRef.current != null) {
      clearTimeout(fadeTimerRef.current);
      fadeTimerRef.current = null;
    }

    // Invariant 2: capture this request's ID. Only this exact ID can
    // transition the UI when the save resolves; any earlier in-flight
    // saves' resolves will see a stale ID and be ignored.
    const myRequestId = ++requestIdRef.current;

    debounceTimerRef.current = setTimeout(async () => {
      debounceTimerRef.current = null;
      setStatus("saving");
      setErrorMessage(null);
      try {
        await saveRef.current(value);
        if (requestIdRef.current === myRequestId) {
          setStatus("saved");
          fadeTimerRef.current = setTimeout(() => {
            if (requestIdRef.current === myRequestId) {
              setStatus("idle");
            }
            fadeTimerRef.current = null;
          }, savedFadeMs);
        }
      } catch (err) {
        if (requestIdRef.current === myRequestId) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    }, delayMs);

    // Cleanup on dependency change OR unmount: cancel the pending
    // debounce timer. The fade timer is intentionally NOT cleared
    // here — if a save just succeeded and the fade is in progress,
    // we want it to complete naturally (the user-edit branch above
    // also clears the fade if a new edit comes in mid-fade).
    return () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [value, delayMs, savedFadeMs]);

  // Invariant 5: unmount cleanup. Bump the request counter to a
  // sentinel so any in-flight save's resolve callback is treated as
  // stale and ignored. Also clear both timers.
  useEffect(() => {
    return () => {
      requestIdRef.current = UNMOUNTED_REQUEST_ID;
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      if (fadeTimerRef.current != null) {
        clearTimeout(fadeTimerRef.current);
        fadeTimerRef.current = null;
      }
    };
  }, []);

  return { status, errorMessage };
}

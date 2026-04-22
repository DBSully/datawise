"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runScreeningTickAction } from "@/app/(workspace)/screening/actions";

type Props = {
  batchId: string;
  initialTotalSubjects: number;
  initialScreenedCount: number;
  initialPrimeCount: number;
  initialStatus: "pending" | "running" | "complete" | "error" | string;
};

type TrackerStatus = "pending" | "running" | "complete" | "error";

type TrackerState = {
  total: number;
  screened: number;
  prime: number;
  status: TrackerStatus;
  errorMessage: string | null;
};

function normalizeStatus(raw: string): TrackerStatus {
  switch (raw) {
    case "pending":
    case "running":
    case "complete":
    case "error":
      return raw;
    default:
      return "pending";
  }
}

export function BatchProgressTracker({
  batchId,
  initialTotalSubjects,
  initialScreenedCount,
  initialPrimeCount,
  initialStatus,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [state, setState] = useState<TrackerState>(() => ({
    total: initialTotalSubjects,
    screened: initialScreenedCount,
    prime: initialPrimeCount,
    status: normalizeStatus(initialStatus),
    errorMessage: null,
  }));

  // Refs used by the driver loop so it can read current state without
  // re-creating the effect on every state change.
  const statusRef = useRef<TrackerStatus>(state.status);
  const cancelRef = useRef(false);
  const tickingRef = useRef(false);

  useEffect(() => {
    statusRef.current = state.status;
  }, [state.status]);

  const tick = useCallback(async () => {
    if (tickingRef.current) return;
    tickingRef.current = true;
    try {
      const res = await runScreeningTickAction(batchId);
      if (cancelRef.current) return;
      setState({
        total: res.totalSubjects,
        screened: res.screenedSoFar,
        prime: res.primeSoFar,
        status: res.done ? "complete" : "running",
        errorMessage: null,
      });
      if (res.done) {
        startTransition(() => router.refresh());
      }
    } catch (err) {
      if (cancelRef.current) return;
      setState((prev) => ({
        ...prev,
        status: "error",
        errorMessage: err instanceof Error ? err.message : "Unknown error",
      }));
    } finally {
      tickingRef.current = false;
    }
  }, [batchId, router]);

  const shouldRun = state.status === "running" || state.status === "pending";

  useEffect(() => {
    if (!shouldRun) return;
    cancelRef.current = false;
    let active = true;

    (async () => {
      while (active && !cancelRef.current) {
        await tick();
        if (
          statusRef.current !== "running" &&
          statusRef.current !== "pending"
        ) {
          break;
        }
        // Guard against tight-spins: if tick() returned immediately because
        // another tick was already in flight (e.g. React strict-mode dev
        // remount), yielding here keeps the event loop responsive.
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    })();

    return () => {
      active = false;
      cancelRef.current = true;
    };
  }, [shouldRun, tick]);

  const pct =
    state.total > 0
      ? Math.min(100, Math.round((state.screened / state.total) * 100))
      : 0;

  const barColor =
    state.status === "error"
      ? "bg-red-600"
      : state.status === "complete"
        ? "bg-emerald-600"
        : "bg-blue-600";

  const headline =
    state.status === "complete"
      ? "Screening complete"
      : state.status === "error"
        ? "Screening paused"
        : "Screening in progress…";

  return (
    <div className="dw-card space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            Batch progress
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {headline}
          </p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold text-slate-900">{pct}%</p>
          <p className="text-xs text-slate-500">
            {state.screened.toLocaleString()} / {state.total.toLocaleString()}{" "}
            subjects
          </p>
        </div>
      </div>

      <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-xs text-slate-600">
        <span>
          Prime so far:{" "}
          <span className="font-semibold text-emerald-700">
            {state.prime.toLocaleString()}
          </span>
        </span>
        {state.status === "running" || state.status === "pending" ? (
          <span className="text-slate-500">
            Processing chunks — keep this tab open
          </span>
        ) : state.status === "complete" ? (
          <span className="text-emerald-700">Done</span>
        ) : (
          <span className="text-red-700">
            {state.errorMessage ?? "Error"}
          </span>
        )}
      </div>

      {state.status === "error" && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => {
              cancelRef.current = false;
              setState((prev) => ({
                ...prev,
                status: "running",
                errorMessage: null,
              }));
            }}
            className="dw-button-secondary text-xs"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}

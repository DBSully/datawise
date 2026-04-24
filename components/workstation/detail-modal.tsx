// Phase 1 Step 3C Task 12 — DetailModal greenfield wrapper.
//
// A partial-screen modal overlay that the new Workstation (3E) uses to
// expand a DetailCard's collapsed view into a full editing surface.
// Pure UI shell — does not know about any specific card content; the
// parent supplies the title, the children body, and the onClose
// callback.
//
// Behavior per WORKSTATION_CARD_SPEC.md §5.0 + Decision 4:
//
// - Partial-screen overlay (max ~720px wide, auto height capped at 80vh)
// - Backdrop is dimmed (bg-black/40); the comp map/table behind it is
//   still visible in silhouette so the analyst keeps spatial context
// - Header: title (left) + close button (right)
// - Body: children (the card-specific editing UI), scrollable if content
//   exceeds the height cap
// - Closes on:
//     - Escape key
//     - Click on the backdrop (outside the panel)
//     - Close button click
//     - Parent calling onClose after a Save success (the parent's job)
//
// Focus management (basic per 3C plan):
//
// - On mount the close button is auto-focused so the user has an obvious
//   first focus target and can ESC out immediately
// - Tab cycles within the modal panel — pressing Tab on the last
//   focusable element wraps to the first; Shift+Tab on the first wraps
//   to the last. This prevents accidental focus escape into the
//   workstation behind the modal.
// - Body scroll on the underlying page is locked while the modal is
//   open by setting `overflow: hidden` on documentElement (restored on
//   unmount).
//
// Not implemented (deferred to 3E or later if needed):
// - Full a11y dialog semantics (aria-modal, aria-labelledby, role=dialog
//   are added to the panel, but full screen-reader testing is out of
//   scope for the wrapper)
// - Animated open/close transitions
// - Focus restoration to the trigger element on close (would need a
//   ref passed in by the parent — the spec example pattern is "focus
//   the close button on open" which is what we do)
//
// No current consumer in 3C; 3E plugs it into each per-card modal.

"use client";

import { useEffect, useRef, type ReactNode } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type DetailModalProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Size preset:
   *  - "compact" — 400px (single-column, simple label/value pairs)
   *  - "medium"  — 520px (multi-row breakdown with several line items)
   *  - "default" — 720px (original width used by card methodology modals)
   *  - "wide"    — 95vw × 92vh (Comp Workspace expand view, etc.) */
  size?: "compact" | "medium" | "default" | "wide";
};

export function DetailModal({
  title,
  onClose,
  children,
  size = "default",
}: DetailModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  // Lock the underlying page scroll while the modal is open.
  useEffect(() => {
    const previous = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = previous;
    };
  }, []);

  // Auto-focus the close button on mount so the user has an immediate
  // tab anchor and can ESC out without moving the mouse.
  useEffect(() => {
    closeBtnRef.current?.focus();
  }, []);

  // ESC closes the modal.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Tab key handler — cycles focus within the panel so Tab/Shift+Tab
  // can't escape into the underlying workstation.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !panel.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !panel.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dw-detail-modal-title"
        className={`flex w-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl ${
          size === "wide" ? "max-h-[92vh]" : "max-h-[80vh]"
        } ${
          size === "compact"
            ? "max-w-[400px]"
            : size === "medium"
              ? "max-w-[520px]"
              : size === "wide"
                ? "max-w-[95vw]"
                : "max-w-[720px]"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
          <h2
            id="dw-detail-modal-title"
            className="text-sm font-bold uppercase tracking-[0.14em] text-slate-700"
          >
            {title}
          </h2>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

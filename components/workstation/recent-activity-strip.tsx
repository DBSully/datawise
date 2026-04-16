// Recent Activity Strip — compact horizontal timeline of property_events.
//
// Consumers:
//   - Analysis Workstation (top strip, shows events for this property)
//   - Watchlist row hover/inline (planned: single latest event per row)
//   - Dashboard "Changes on your watchlist" card (planned: cross-property)
//
// Rendering rules:
//   - Unread events (was_unread = true when page loaded): amber background
//   - Already-seen events: slate background
//   - Each event: icon + compact "before → after" text + relative time
//   - Horizontal scroll when overflow; no wrapping
//
// Event types and their labels come from property_events.event_type:
//   price_change, close_price, status_change, change_type, uc_date, close_date

"use client";

type PropertyEvent = {
  id: string;
  eventType: string;
  beforeValue: unknown;
  afterValue: unknown;
  detectedAt: string;
  wasUnread: boolean;
};

type Props = {
  events: PropertyEvent[];
  /** Optional heading override. Defaults to "Recent Activity". */
  heading?: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtMoney(value: unknown): string {
  if (value === null || value === undefined) return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return "$" + Math.round(n).toLocaleString();
}

function fmtDelta(before: unknown, after: unknown): string {
  if (before === null || before === undefined) {
    return `null → ${fmtMoney(after)}`;
  }
  if (after === null || after === undefined) {
    return `${fmtMoney(before)} → null`;
  }
  const b = Number(before);
  const a = Number(after);
  if (!Number.isFinite(b) || !Number.isFinite(a)) {
    return `${fmtMoney(before)} → ${fmtMoney(after)}`;
  }
  const delta = Math.round(a - b);
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${fmtMoney(delta)}`;
}

function fmtText(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function fmtDate(value: unknown): string {
  if (!value) return "—";
  const s = String(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!match) return s;
  return `${match[2]}/${match[3]}/${match[1].slice(2)}`;
}

function fmtRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.round((now - then) / 1000));
  if (diffSec < 60) return `${diffSec}s`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d`;
  const diffMo = Math.round(diffDay / 30);
  return `${diffMo}mo`;
}

function describeEvent(event: PropertyEvent): {
  icon: string;
  label: string;
  detail: string;
} {
  switch (event.eventType) {
    case "price_change":
      return {
        icon: "$",
        label: "Price",
        detail: `${fmtMoney(event.beforeValue)} → ${fmtMoney(event.afterValue)} (${fmtDelta(event.beforeValue, event.afterValue)})`,
      };
    case "close_price":
      return {
        icon: "●",
        label: "Closed",
        detail: `${fmtMoney(event.afterValue)}`,
      };
    case "status_change":
      return {
        icon: "◐",
        label: "Status",
        detail: `${fmtText(event.beforeValue)} → ${fmtText(event.afterValue)}`,
      };
    case "change_type":
      return {
        icon: "⚙",
        label: "Change",
        detail: `${fmtText(event.afterValue)}`,
      };
    case "uc_date":
      return {
        icon: "◆",
        label: "UC",
        detail: fmtDate(event.afterValue),
      };
    case "close_date":
      return {
        icon: "✓",
        label: "Closed",
        detail: fmtDate(event.afterValue),
      };
    default:
      return { icon: "·", label: event.eventType, detail: "" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function RecentActivityStrip({ events, heading = "Recent Activity" }: Props) {
  if (events.length === 0) return null;

  const unreadCount = events.filter((e) => e.wasUnread).length;

  return (
    <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          {heading}
        </span>
        {unreadCount > 0 && (
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-800">
            {unreadCount} new
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {events.map((event) => {
          const described = describeEvent(event);
          const toneClass = event.wasUnread
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-slate-200 bg-white text-slate-600";
          return (
            <div
              key={event.id}
              className={`flex shrink-0 items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${toneClass}`}
              title={`${described.label}: ${described.detail} · ${new Date(event.detectedAt).toLocaleString()}`}
            >
              <span className="font-mono text-[11px] opacity-60">{described.icon}</span>
              <span className="font-semibold">{described.label}</span>
              <span className="font-mono">{described.detail}</span>
              <span className="text-[10px] opacity-60">· {fmtRelative(event.detectedAt)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

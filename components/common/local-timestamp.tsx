// Renders a timestamp in the viewer's local timezone.
//
// Server-rendered pages format dates in the server's timezone (UTC on
// Supabase / Vercel), which surfaces wrong times throughout the UI for
// analysts not on UTC. This component takes an ISO string from the server
// and formats it in the browser's locale on the client, so the displayed
// time always matches the viewer's wall clock.
//
// Falls back to "—" on null/empty. Hydration-safe: initial SSR render
// shows the raw ISO slice, swapped to localized format on mount. The
// swap is imperceptible in practice but avoids hydration mismatch warnings.

"use client";

import { useEffect, useState } from "react";

type Format = "datetime" | "date" | "time";

function formatInitial(iso: string, format: Format): string {
  // Safe server-side slice — no timezone arithmetic, just a truncated
  // ISO substring. Replaced on client mount with the localized version.
  if (format === "date") return iso.slice(0, 10);
  if (format === "time") return iso.slice(11, 16);
  return iso.slice(0, 16).replace("T", " ");
}

function formatLocalized(iso: string, format: Format): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  if (format === "date") return d.toLocaleDateString();
  if (format === "time") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleString();
}

type Props = {
  value: string | null | undefined;
  /** datetime (default), date-only, or time-only. */
  format?: Format;
  /** Optional tooltip override. Defaults to full ISO for analyst copy-paste. */
  title?: string;
};

export function LocalTimestamp({ value, format = "datetime", title }: Props) {
  const [text, setText] = useState(() =>
    value ? formatInitial(value, format) : "\u2014",
  );

  useEffect(() => {
    if (!value) {
      setText("\u2014");
      return;
    }
    setText(formatLocalized(value, format));
  }, [value, format]);

  return (
    <time dateTime={value ?? undefined} title={title ?? value ?? undefined}>
      {text}
    </time>
  );
}

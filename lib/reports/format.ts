/**
 * Shared formatting utilities for currency, numbers, and percentages.
 * Used by both the Analysis Workstation and Report components.
 */

export function fmt(value: number | null | undefined): string {
  if (value === null || value === undefined) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export function fmtNum(value: number | null | undefined, d = 0): string {
  if (value === null || value === undefined) return "\u2014";
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(value);
}

export function fmtPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "\u2014";
  return `${(value * 100).toFixed(1)}%`;
}

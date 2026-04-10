"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const MLS_STATUSES = [
  "Coming Soon",
  "Active",
  "Pending",
  "Withdrawn",
  "Expired",
  "Closed",
] as const;

const AUTO_FILTER_KEYS = [
  "mlsStatus",
  "listingDays",
  "screenedDays",
  "priceLow",
  "priceHigh",
];

function formatPrice(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value % 1_000_000 === 0 ? 0 : 1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}k`;
  return `$${value}`;
}

export function AutoFilterButtons() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const activeMlsStatus = searchParams.get("mlsStatus") ?? "all";
  const activeListingDays = searchParams.get("listingDays");
  const activeScreenedDays = searchParams.get("screenedDays");
  const activePriceLow = searchParams.get("priceLow") ?? "";
  const activePriceHigh = searchParams.get("priceHigh") ?? "";

  const [priceLow, setPriceLow] = useState(activePriceLow);
  const [priceHigh, setPriceHigh] = useState(activePriceHigh);

  const hasAnyAutoFilter = AUTO_FILTER_KEYS.some((k) => searchParams.has(k));

  function navigate(overrides: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    const qs = params.toString();
    router.push(qs ? `/intake/screening?${qs}` : "/intake/screening");
  }

  function handleClearAll() {
    const params = new URLSearchParams(searchParams.toString());
    for (const key of AUTO_FILTER_KEYS) {
      params.delete(key);
    }
    params.delete("page");
    setPriceLow("");
    setPriceHigh("");
    const qs = params.toString();
    router.push(qs ? `/intake/screening?${qs}` : "/intake/screening");
  }

  function handleMlsStatus(status: string) {
    if (activeMlsStatus === status) {
      navigate({ mlsStatus: null });
    } else {
      navigate({ mlsStatus: status });
    }
  }

  function handleListingDays() {
    if (activeListingDays) {
      navigate({ listingDays: null });
      return;
    }
    const input = window.prompt("Enter # of past days to display (including today):");
    if (input === null) return;
    const days = parseInt(input, 10);
    if (isNaN(days) || days < 1) return;
    navigate({ listingDays: String(days) });
  }

  function handleScreenedDays() {
    if (activeScreenedDays) {
      navigate({ screenedDays: null });
      return;
    }
    const input = window.prompt("Enter # of past days to display (including today):");
    if (input === null) return;
    const days = parseInt(input, 10);
    if (isNaN(days) || days < 1) return;
    navigate({ screenedDays: String(days) });
  }

  function handlePriceApply() {
    const overrides: Record<string, string | null> = {};
    const lo = priceLow.replace(/[^0-9]/g, "");
    const hi = priceHigh.replace(/[^0-9]/g, "");
    overrides.priceLow = lo || null;
    overrides.priceHigh = hi || null;
    navigate(overrides);
  }

  function handlePriceClear() {
    setPriceLow("");
    setPriceHigh("");
    navigate({ priceLow: null, priceHigh: null });
  }

  function handlePriceKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handlePriceApply();
    }
  }

  const priceActive = activePriceLow || activePriceHigh;
  const priceSummary = priceActive
    ? [
        activePriceLow ? formatPrice(Number(activePriceLow)) : "any",
        activePriceHigh ? formatPrice(Number(activePriceHigh)) : "any",
      ].join(" – ")
    : null;

  return (
    <div className="dw-card-tight space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
          Auto Filters
        </div>
        {hasAnyAutoFilter && (
          <button
            type="button"
            onClick={handleClearAll}
            className="rounded px-2 py-0.5 text-[11px] font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>
      <div className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 items-center">
        {/* MLS Status */}
        <div className="text-xs text-slate-400">MLS Status</div>
        <div className="flex flex-wrap gap-1.5">
          {MLS_STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => handleMlsStatus(status)}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                activeMlsStatus === status
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {/* Date Filters */}
        <div className="text-xs text-slate-400">Date Filters</div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={handleListingDays}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              activeListingDays
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            New Listings{activeListingDays ? ` (${activeListingDays}d)` : ""}
          </button>
          <button
            type="button"
            onClick={handleScreenedDays}
            className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
              activeScreenedDays
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            Screened Date{activeScreenedDays ? ` (${activeScreenedDays}d)` : ""}
          </button>
        </div>

        {/* Price Filter */}
        <div className="text-xs text-slate-400">Price Range</div>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            inputMode="numeric"
            placeholder="Low"
            value={priceLow}
            onChange={(e) => setPriceLow(e.target.value)}
            onKeyDown={handlePriceKeyDown}
            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
          <span className="text-xs text-slate-400">–</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="High"
            value={priceHigh}
            onChange={(e) => setPriceHigh(e.target.value)}
            onKeyDown={handlePriceKeyDown}
            className="w-24 rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handlePriceApply}
            className="rounded bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 transition-colors"
          >
            Apply
          </button>
          {priceActive ? (
            <button
              type="button"
              onClick={handlePriceClear}
              className="rounded px-1.5 py-1 text-xs text-red-500 hover:bg-red-50 transition-colors"
            >
              ✕
            </button>
          ) : null}
          {priceSummary && (
            <span className="ml-1 rounded bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
              {priceSummary}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

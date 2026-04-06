-- Add market trend rate columns to screening_results for auditability.
-- These store the data-driven trend rate and its inputs so every screening
-- result is self-documenting about which market signal was applied.

begin;

alter table public.screening_results
  add column if not exists trend_annual_rate       numeric(8,5),
  add column if not exists trend_local_rate        numeric(8,5),
  add column if not exists trend_metro_rate        numeric(8,5),
  add column if not exists trend_local_comp_count  integer,
  add column if not exists trend_metro_comp_count  integer,
  add column if not exists trend_local_radius      numeric(6,2),
  add column if not exists trend_metro_radius      numeric(6,2),
  add column if not exists trend_is_fallback       boolean default false,
  add column if not exists trend_confidence        text,
  add column if not exists trend_low_end_rate      numeric(8,5),
  add column if not exists trend_high_end_rate     numeric(8,5),
  add column if not exists trend_summary           text,
  add column if not exists trend_detail_json       jsonb;

comment on column public.screening_results.trend_annual_rate is
  'Blended annualized market trend rate applied to ARV time adjustments (clamped).';

comment on column public.screening_results.trend_is_fallback is
  'True when insufficient comps forced use of the fixed fallback rate.';

comment on column public.screening_results.trend_confidence is
  'Confidence level: high, low, or fallback.';

comment on column public.screening_results.trend_detail_json is
  'Full TrendResult JSON for drill-in: per-tier stats, segment rates, price/PSF ranges.';

commit;

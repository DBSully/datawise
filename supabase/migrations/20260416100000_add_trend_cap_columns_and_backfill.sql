-- Asymmetric positive-rate cap on market trend, with preserved raw market
-- signal. See `lib/screening/trend-engine.ts` and methodology report §5.
--
-- Schema:
--   trend_raw_rate            — pre-cap market signal (audit trail)
--   trend_positive_cap_applied — flag when cap fired
--
-- Rate backfill:
--   1. Copy current trend_annual_rate → trend_raw_rate for every row
--      (historical rows computed without the cap, so the applied rate IS
--       the market signal).
--   2. If trend_annual_rate > 0.02, cap it and set the flag.
--
-- The trend_detail_json blob is NOT patched here — the flat columns are
-- the source of truth consumed by the loader, and an earlier attempt at
-- a three-way jsonb_set update exceeded Supabase's statement timeout.
-- A follow-up Node backfill handles downstream recomputation (ARV,
-- deal math, analysis_reports snapshots).

begin;

-- ---------------------------------------------------------------------------
-- Schema changes
-- ---------------------------------------------------------------------------

alter table public.screening_results
  add column if not exists trend_raw_rate             numeric(8,5),
  add column if not exists trend_positive_cap_applied boolean not null default false;

comment on column public.screening_results.trend_raw_rate is
  'Pre-cap blended annual rate. Equals trend_annual_rate when no cap applied.';

comment on column public.screening_results.trend_positive_cap_applied is
  'True when the defensibility positive-rate cap fired on this row.';

-- ---------------------------------------------------------------------------
-- Rate backfill
-- ---------------------------------------------------------------------------

-- Preserve the historical (uncapped) rate as the raw signal.
update public.screening_results
   set trend_raw_rate = trend_annual_rate
 where trend_annual_rate is not null
   and trend_raw_rate is null;

-- Apply the cap retroactively.
update public.screening_results
   set trend_annual_rate          = 0.02,
       trend_positive_cap_applied = true
 where trend_annual_rate is not null
   and trend_annual_rate > 0.02;

commit;

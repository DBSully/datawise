-- Track the original source of each property record.

alter table public.real_properties
  add column if not exists data_source text;

-- Backfill: all existing properties came from MLS imports.
update public.real_properties
  set data_source = 'mls'
  where data_source is null;

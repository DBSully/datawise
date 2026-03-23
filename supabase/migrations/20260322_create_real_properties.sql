create extension if not exists pgcrypto;

create table if not exists public.real_properties (
  id uuid primary key default gen_random_uuid(),
  public_code text unique,
  unparsed_address text not null,
  street_number text,
  street_pre_direction text,
  street_name text,
  street_suffix text,
  street_post_direction text,
  unit_number text,
  city text not null,
  county text,
  state text not null,
  postal_code text,
  postal_code4 text,
  parcel_id text,
  alternate_parcel_id text,
  tax_account_number text,
  census_tract text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  normalized_address_key text not null,
  address_slug text,
  geocode_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists real_properties_normalized_address_key_idx
  on public.real_properties (normalized_address_key);

create index if not exists real_properties_city_state_idx
  on public.real_properties (city, state);

create index if not exists real_properties_parcel_id_idx
  on public.real_properties (parcel_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.real_properties enable row level security;

DROP TRIGGER IF EXISTS trg_real_properties_updated_at ON public.real_properties;
create trigger trg_real_properties_updated_at
before update on public.real_properties
for each row
execute function public.set_updated_at();

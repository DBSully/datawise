-- 20260324_create_property_financials.sql

create table if not exists public.property_financials (
  real_property_id uuid primary key
    references public.real_properties(id)
    on delete cascade,

  annual_property_tax numeric(12,2),
  annual_hoa_dues numeric(12,2),

  source_system text,
  source_record_id text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_property_financials_annual_property_tax
    check (annual_property_tax is null or annual_property_tax >= 0),

  constraint chk_property_financials_annual_hoa_dues
    check (annual_hoa_dues is null or annual_hoa_dues >= 0)
);

create index if not exists ix_property_financials_source_system
  on public.property_financials (source_system);

alter table public.property_financials enable row level security;

drop trigger if exists trg_property_financials_updated_at
on public.property_financials;

create trigger trg_property_financials_updated_at
before update on public.property_financials
for each row
execute function public.set_row_updated_at();

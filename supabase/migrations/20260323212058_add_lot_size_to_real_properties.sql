alter table public.real_properties
  add column if not exists lot_size_sqft numeric(14,2),
  add column if not exists lot_size_acres numeric(14,6);

alter table public.real_properties
  add constraint chk_real_properties_lot_size_sqft
    check (lot_size_sqft is null or lot_size_sqft >= 0);

alter table public.real_properties
  add constraint chk_real_properties_lot_size_acres
    check (lot_size_acres is null or lot_size_acres >= 0);

create index if not exists ix_real_properties_lot_size_sqft
  on public.real_properties (lot_size_sqft);

create index if not exists ix_real_properties_lot_size_acres
  on public.real_properties (lot_size_acres);

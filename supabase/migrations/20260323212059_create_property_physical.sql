create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.property_physical (
  real_property_id uuid primary key
    references public.real_properties(id)
    on delete cascade,

  property_type text,
  property_sub_type text,
  structure_type text,
  architectural_style text,
  property_attached_yn boolean,

  living_area_sqft numeric(12,2),
  building_area_total_sqft numeric(12,2),
  above_grade_finished_area_sqft numeric(12,2),
  below_grade_finished_area_sqft numeric(12,2),
  below_grade_unfinished_area_sqft numeric(12,2),

  basement_yn boolean,

  bedrooms_total integer,
  bathrooms_total numeric(5,2),
  garage_spaces numeric(5,2),

  year_built integer,

  levels_raw text,
  level_class_standardized text,

  number_of_units_total integer,

  main_level_bedrooms integer,
  main_level_bathrooms numeric(5,2),

  basement_level_bedrooms integer,
  basement_level_bathrooms numeric(5,2),

  lower_level_bedrooms integer,
  lower_level_bathrooms numeric(5,2),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_property_physical_living_area_sqft
    check (living_area_sqft is null or living_area_sqft >= 0),

  constraint chk_property_physical_building_area_total_sqft
    check (building_area_total_sqft is null or building_area_total_sqft >= 0),

  constraint chk_property_physical_above_grade_finished_area_sqft
    check (above_grade_finished_area_sqft is null or above_grade_finished_area_sqft >= 0),

  constraint chk_property_physical_below_grade_finished_area_sqft
    check (below_grade_finished_area_sqft is null or below_grade_finished_area_sqft >= 0),

  constraint chk_property_physical_below_grade_unfinished_area_sqft
    check (below_grade_unfinished_area_sqft is null or below_grade_unfinished_area_sqft >= 0),

  constraint chk_property_physical_bedrooms_total
    check (bedrooms_total is null or bedrooms_total >= 0),

  constraint chk_property_physical_bathrooms_total
    check (bathrooms_total is null or bathrooms_total >= 0),

  constraint chk_property_physical_garage_spaces
    check (garage_spaces is null or garage_spaces >= 0),

  constraint chk_property_physical_year_built
    check (year_built is null or year_built between 1600 and 2100),

  constraint chk_property_physical_number_of_units_total
    check (number_of_units_total is null or number_of_units_total >= 0),

  constraint chk_property_physical_main_level_bedrooms
    check (main_level_bedrooms is null or main_level_bedrooms >= 0),

  constraint chk_property_physical_main_level_bathrooms
    check (main_level_bathrooms is null or main_level_bathrooms >= 0),

  constraint chk_property_physical_basement_level_bedrooms
    check (basement_level_bedrooms is null or basement_level_bedrooms >= 0),

  constraint chk_property_physical_basement_level_bathrooms
    check (basement_level_bathrooms is null or basement_level_bathrooms >= 0),

  constraint chk_property_physical_lower_level_bedrooms
    check (lower_level_bedrooms is null or lower_level_bedrooms >= 0),

  constraint chk_property_physical_lower_level_bathrooms
    check (lower_level_bathrooms is null or lower_level_bathrooms >= 0)
);

create index if not exists ix_property_physical_property_type
  on public.property_physical (property_type);

create index if not exists ix_property_physical_property_sub_type
  on public.property_physical (property_sub_type);

create index if not exists ix_property_physical_level_class_standardized
  on public.property_physical (level_class_standardized);

create index if not exists ix_property_physical_year_built
  on public.property_physical (year_built);

create index if not exists ix_property_physical_living_area_sqft
  on public.property_physical (living_area_sqft);

create index if not exists ix_property_physical_bedrooms_total
  on public.property_physical (bedrooms_total);

create index if not exists ix_property_physical_bathrooms_total
  on public.property_physical (bathrooms_total);

alter table public.property_physical enable row level security;

drop trigger if exists trg_property_physical_updated_at
on public.property_physical;

create trigger trg_property_physical_updated_at
before update on public.property_physical
for each row
execute function public.set_row_updated_at();

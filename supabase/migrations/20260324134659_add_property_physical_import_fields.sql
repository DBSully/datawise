-- 20260324_add_property_physical_import_fields.sql

alter table public.property_physical
  add column if not exists below_grade_total_sqft numeric(12,2),
  add column if not exists upper_level_bedrooms integer,
  add column if not exists upper_level_bathrooms numeric(5,2);

alter table public.property_physical
  drop constraint if exists chk_property_physical_below_grade_total_sqft,
  add constraint chk_property_physical_below_grade_total_sqft
    check (below_grade_total_sqft is null or below_grade_total_sqft >= 0);

alter table public.property_physical
  drop constraint if exists chk_property_physical_upper_level_bedrooms,
  add constraint chk_property_physical_upper_level_bedrooms
    check (upper_level_bedrooms is null or upper_level_bedrooms >= 0);

alter table public.property_physical
  drop constraint if exists chk_property_physical_upper_level_bathrooms,
  add constraint chk_property_physical_upper_level_bathrooms
    check (upper_level_bathrooms is null or upper_level_bathrooms >= 0);
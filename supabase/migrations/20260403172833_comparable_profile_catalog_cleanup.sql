-- Add new standard baseline profiles
insert into comparable_profiles (slug, name, purpose, rules_json)
select
  'denver_detached_standard_v1',
  'Denver Detached Standard',
  'standard',
  jsonb_build_object(
    'maxDistanceMiles', 0.5,
    'maxDaysSinceClose', 365,
    'sqftTolerancePct', 20,
    'lotSizeTolerancePct', 20,
    'yearToleranceYears', 25,
    'bedTolerance', 1,
    'bathTolerance', 1,
    'maxCandidates', 15,
    'requireSamePropertyType', true,
    'requireSameLevelClass', true,
    'requireSameBuildingForm', false,
    'sizeBasis', 'building_area_total'
  )
where not exists (
  select 1 from comparable_profiles where slug = 'denver_detached_standard_v1'
);

insert into comparable_profiles (slug, name, purpose, rules_json)
select
  'denver_condo_standard_v1',
  'Denver Condo Standard',
  'standard',
  jsonb_build_object(
    'maxDistanceMiles', 0.75,
    'maxDaysSinceClose', 365,
    'sqftTolerancePct', 20,
    'lotSizeTolerancePct', 20,
    'yearToleranceYears', 20,
    'bedTolerance', 1,
    'bathTolerance', 1,
    'maxCandidates', 15,
    'requireSamePropertyType', true,
    'requireSameLevelClass', false,
    'requireSameBuildingForm', true,
    'sizeBasis', 'building_area_total'
  )
where not exists (
  select 1 from comparable_profiles where slug = 'denver_condo_standard_v1'
);

insert into comparable_profiles (slug, name, purpose, rules_json)
select
  'denver_townhome_standard_v1',
  'Denver Townhome Standard',
  'standard',
  jsonb_build_object(
    'maxDistanceMiles', 0.75,
    'maxDaysSinceClose', 365,
    'sqftTolerancePct', 20,
    'lotSizeTolerancePct', 25,
    'yearToleranceYears', 25,
    'bedTolerance', 1,
    'bathTolerance', 1,
    'maxCandidates', 15,
    'requireSamePropertyType', true,
    'requireSameLevelClass', false,
    'requireSameBuildingForm', true,
    'sizeBasis', 'building_area_total'
  )
where not exists (
  select 1 from comparable_profiles where slug = 'denver_townhome_standard_v1'
);

-- Neutralize the old detached basic profile so legacy callers stop behaving like flip
update comparable_profiles
set
  name = 'Denver Detached Basic v1 (Deprecated)',
  purpose = 'standard'
where slug = 'denver_detached_basic_v1';
create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.analyses (
  id uuid primary key default gen_random_uuid(),
  real_property_id uuid not null
    references public.real_properties(id)
    on delete cascade,
  listing_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_analyses_real_property_id
  on public.analyses (real_property_id);

create index if not exists ix_analyses_listing_id
  on public.analyses (listing_id);

create index if not exists ix_analyses_created_at
  on public.analyses (created_at desc);

alter table public.analyses enable row level security;

drop trigger if exists trg_analyses_updated_at
on public.analyses;

create trigger trg_analyses_updated_at
before update on public.analyses
for each row
execute function public.set_row_updated_at();

create table if not exists public.manual_analysis (
  analysis_id uuid primary key
    references public.analyses(id)
    on delete cascade,

  analyst_condition text,
  update_year_est integer,
  update_quality text,
  uad_condition_manual text,
  uad_updates_manual text,
  arv_manual numeric(14,2),
  margin_manual numeric(14,2),
  rehab_manual numeric(14,2),
  days_held_manual integer,
  rent_estimate_monthly numeric(12,2),
  design_rating text,
  location_rating text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_manual_analysis_update_year_est
    check (update_year_est is null or update_year_est between 1600 and 2100),

  constraint chk_manual_analysis_arv_manual
    check (arv_manual is null or arv_manual >= 0),

  constraint chk_manual_analysis_margin_manual
    check (margin_manual is null or margin_manual >= 0),

  constraint chk_manual_analysis_rehab_manual
    check (rehab_manual is null or rehab_manual >= 0),

  constraint chk_manual_analysis_days_held_manual
    check (days_held_manual is null or days_held_manual >= 0),

  constraint chk_manual_analysis_rent_estimate_monthly
    check (rent_estimate_monthly is null or rent_estimate_monthly >= 0)
);

create index if not exists ix_manual_analysis_analyst_condition
  on public.manual_analysis (analyst_condition);

create index if not exists ix_manual_analysis_update_quality
  on public.manual_analysis (update_quality);

alter table public.manual_analysis enable row level security;

drop trigger if exists trg_manual_analysis_updated_at
on public.manual_analysis;

create trigger trg_manual_analysis_updated_at
before update on public.manual_analysis
for each row
execute function public.set_row_updated_at();

create table if not exists public.analysis_pipeline (
  analysis_id uuid primary key
    references public.analyses(id)
    on delete cascade,

  interest_level text,
  showing_status text,
  offer_status text,
  project_folder_created_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_analysis_pipeline_interest_level
  on public.analysis_pipeline (interest_level);

create index if not exists ix_analysis_pipeline_showing_status
  on public.analysis_pipeline (showing_status);

create index if not exists ix_analysis_pipeline_offer_status
  on public.analysis_pipeline (offer_status);

alter table public.analysis_pipeline enable row level security;

drop trigger if exists trg_analysis_pipeline_updated_at
on public.analysis_pipeline;

create trigger trg_analysis_pipeline_updated_at
before update on public.analysis_pipeline
for each row
execute function public.set_row_updated_at();

create table if not exists public.analysis_notes (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null
    references public.analyses(id)
    on delete cascade,
  note_type text not null,
  note_body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_analysis_notes_note_body_not_blank
    check (btrim(note_body) <> '')
);

create index if not exists ix_analysis_notes_analysis_id
  on public.analysis_notes (analysis_id);

create index if not exists ix_analysis_notes_note_type
  on public.analysis_notes (note_type);

alter table public.analysis_notes enable row level security;

drop trigger if exists trg_analysis_notes_updated_at
on public.analysis_notes;

create trigger trg_analysis_notes_updated_at
before update on public.analysis_notes
for each row
execute function public.set_row_updated_at();

create table if not exists public.analysis_showings (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null
    references public.analyses(id)
    on delete cascade,
  showing_type text not null,
  scheduled_at timestamptz,
  status text,
  access_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_analysis_showings_analysis_id
  on public.analysis_showings (analysis_id);

create index if not exists ix_analysis_showings_scheduled_at
  on public.analysis_showings (scheduled_at);

create index if not exists ix_analysis_showings_status
  on public.analysis_showings (status);

alter table public.analysis_showings enable row level security;

drop trigger if exists trg_analysis_showings_updated_at
on public.analysis_showings;

create trigger trg_analysis_showings_updated_at
before update on public.analysis_showings
for each row
execute function public.set_row_updated_at();

create table if not exists public.analysis_offers (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null
    references public.analyses(id)
    on delete cascade,
  offer_amount numeric(14,2),
  submitted_at timestamptz,
  deadline_at timestamptz,
  accepted_at timestamptz,
  expired_at timestamptz,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_analysis_offers_offer_amount
    check (offer_amount is null or offer_amount >= 0)
);

create index if not exists ix_analysis_offers_analysis_id
  on public.analysis_offers (analysis_id);

create index if not exists ix_analysis_offers_status
  on public.analysis_offers (status);

create index if not exists ix_analysis_offers_submitted_at
  on public.analysis_offers (submitted_at);

alter table public.analysis_offers enable row level security;

drop trigger if exists trg_analysis_offers_updated_at
on public.analysis_offers;

create trigger trg_analysis_offers_updated_at
before update on public.analysis_offers
for each row
execute function public.set_row_updated_at();

create table if not exists public.analysis_links (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null
    references public.analyses(id)
    on delete cascade,
  link_type text not null,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_analysis_links_url_not_blank
    check (btrim(url) <> '')
);

create index if not exists ix_analysis_links_analysis_id
  on public.analysis_links (analysis_id);

create index if not exists ix_analysis_links_link_type
  on public.analysis_links (link_type);

alter table public.analysis_links enable row level security;

drop trigger if exists trg_analysis_links_updated_at
on public.analysis_links;

create trigger trg_analysis_links_updated_at
before update on public.analysis_links
for each row
execute function public.set_row_updated_at();

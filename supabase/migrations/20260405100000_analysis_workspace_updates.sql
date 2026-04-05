-- Analysis workspace updates:
-- 1. Add is_public flag to analysis_notes for report visibility control
-- 2. Add pipeline date fields for showing/offer tracking
-- 3. Create analysis_reports table for report snapshots

begin;

-- 1. Notes: add public-facing toggle
alter table public.analysis_notes
  add column if not exists is_public boolean not null default true;

comment on column public.analysis_notes.is_public
  is 'Whether this note should appear on client-facing reports. Internal notes default to false.';

-- 2. Pipeline: add date tracking fields
alter table public.analysis_pipeline
  add column if not exists showing_date timestamptz,
  add column if not exists offer_submitted_date timestamptz,
  add column if not exists offer_deadline_date timestamptz,
  add column if not exists offer_accepted_date timestamptz;

-- 3. Reports table
create table if not exists public.analysis_reports (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null references public.analyses(id) on delete cascade,
  report_type text not null default 'detailed',
  title text not null,
  content_json jsonb not null default '{}'::jsonb,
  access_token text,
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.analysis_reports is
  'Snapshots of analysis state at report generation time. Supports PDF, email summary, and web link report types.';

create index if not exists ix_analysis_reports_analysis_id
  on public.analysis_reports (analysis_id);

create index if not exists ix_analysis_reports_access_token
  on public.analysis_reports (access_token)
  where access_token is not null;

alter table public.analysis_reports enable row level security;

drop policy if exists "dev authenticated full access analysis_reports"
on public.analysis_reports;

create policy "dev authenticated full access analysis_reports"
on public.analysis_reports
for all
to authenticated
using (true)
with check (true);

-- Allow public (unauthenticated) read access to reports via access_token
drop policy if exists "public read via access_token analysis_reports"
on public.analysis_reports;

create policy "public read via access_token analysis_reports"
on public.analysis_reports
for select
to anon
using (access_token is not null);

drop trigger if exists trg_analysis_reports_updated_at
on public.analysis_reports;

create trigger trg_analysis_reports_updated_at
before update on public.analysis_reports
for each row
execute function public.set_row_updated_at();

commit;

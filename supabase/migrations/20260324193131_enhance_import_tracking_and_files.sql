-- 20260324_enhance_import_tracking_and_files.sql

alter table public.import_batches
  add column if not exists import_notes text,
  add column if not exists total_row_count integer not null default 0,
  add column if not exists unique_listing_count integer not null default 0,
  add column if not exists unique_property_count integer not null default 0,
  add column if not exists file_count integer not null default 0;

create table if not exists public.import_batch_files (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid not null
    references public.import_batches(id)
    on delete cascade,
  source_system text not null,
  original_filename text not null,
  normalized_filename_base text,
  file_size_bytes bigint,
  row_count integer not null default 0,
  unique_listing_count integer not null default 0,
  content_hash text,
  created_at timestamptz not null default now()
);

create index if not exists ix_import_batch_files_import_batch_id
  on public.import_batch_files (import_batch_id);

create index if not exists ix_import_batch_files_source_system_created_at
  on public.import_batch_files (source_system, created_at desc);

alter table public.import_batch_files enable row level security;

alter table public.import_batch_rows
  add column if not exists import_batch_file_id uuid
    references public.import_batch_files(id)
    on delete cascade,
  add column if not exists validation_errors jsonb;

create index if not exists ix_import_batch_rows_import_batch_file_id
  on public.import_batch_rows (import_batch_file_id);

-- temporary development policy

drop policy if exists "dev authenticated full access import_batch_files"
  on public.import_batch_files;

create policy "dev authenticated full access import_batch_files"
on public.import_batch_files
for all
to authenticated
using (true)
with check (true);

-- Audit log for "Send Basic Email" deal summaries. Metadata only — the
-- rendered HTML body is intentionally not stored (rebuildable from the
-- live analysis if a forensic re-render is ever needed).

create table if not exists public.analysis_email_sends (
  id uuid primary key default gen_random_uuid(),
  analysis_id uuid not null
    references public.analyses(id)
    on delete cascade,
  sent_by_user_id uuid not null references auth.users(id),
  recipient_email text not null,
  cc_email text,
  subject text not null,
  analyst_comment text,
  resend_message_id text,
  sent_at timestamptz not null default now()
);

create index if not exists ix_analysis_email_sends_analysis_id
  on public.analysis_email_sends (analysis_id);

create index if not exists ix_analysis_email_sends_sent_by_user_id
  on public.analysis_email_sends (sent_by_user_id);

alter table public.analysis_email_sends enable row level security;

create policy "dev authenticated full access analysis_email_sends"
on public.analysis_email_sends
for all
to authenticated
using (true)
with check (true);

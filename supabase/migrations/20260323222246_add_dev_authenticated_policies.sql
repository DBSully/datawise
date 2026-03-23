-- TEMPORARY DEVELOPMENT POLICIES
-- These allow any signed-in user to read/write these tables.
-- Replace later with user/team-scoped policies.

create policy "dev authenticated full access real_properties"
on public.real_properties
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access property_physical"
on public.property_physical
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access analyses"
on public.analyses
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access manual_analysis"
on public.manual_analysis
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access analysis_pipeline"
on public.analysis_pipeline
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access analysis_notes"
on public.analysis_notes
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access analysis_showings"
on public.analysis_showings
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access analysis_offers"
on public.analysis_offers
for all
to authenticated
using (true)
with check (true);

create policy "dev authenticated full access analysis_links"
on public.analysis_links
for all
to authenticated
using (true)
with check (true);
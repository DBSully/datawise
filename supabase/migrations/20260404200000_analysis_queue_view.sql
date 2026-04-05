-- Analysis Queue view: latest screening result per property, deduplicated
-- This is the analyst's daily workspace for finding deals to analyze.

create or replace view public.analysis_queue_v as
select distinct on (sr.real_property_id)
  sr.*,
  sb.name as batch_name,
  sb.strategy_profile_slug
from public.screening_results sr
join public.screening_batches sb on sr.screening_batch_id = sb.id
where sr.screening_status in ('screened')
  and sb.status = 'complete'
order by sr.real_property_id, sr.created_at desc;

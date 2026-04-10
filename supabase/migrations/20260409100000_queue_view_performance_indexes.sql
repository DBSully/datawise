-- Indexes to speed up analysis_queue_v which uses
-- DISTINCT ON (real_property_id) ORDER BY real_property_id, created_at DESC
-- with a LEFT JOIN LATERAL to mls_listings

-- Composite index for the DISTINCT ON sort on screening_results
create index if not exists ix_screening_results_property_created
  on public.screening_results (real_property_id, created_at desc);

-- Composite index for the lateral join lookup on mls_listings
create index if not exists ix_mls_listings_property_contract_created
  on public.mls_listings (real_property_id, listing_contract_date desc nulls first, created_at desc);

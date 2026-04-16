-- Backfill analysis_reports.content_json dealMath block to match the new
-- phased Spread/Gap semantics shipped in 20260415120000. Existing reports
-- were snapshotted before the rework and carry the old formula values
-- (spread = listPrice - maxOffer) frozen inside the JSON blob. This
-- patches the JSON in place using jsonb_set on the sibling fields already
-- stored in the snapshot:
--
--   dealMath.spread          = arv          - maxOffer        (analysis phase)
--   dealMath.estGapPerSqft   = spread       / buildingSqft
--   dealMath.negotiationGap  = maxOffer     - listPrice       (null if no list)
--
-- Inputs come from:
--   content_json -> 'dealMath' -> 'arv' / 'maxOffer' / 'listPrice'
--   content_json -> 'physical' -> 'buildingSqft'
--
-- Rows missing dealMath, arv, or maxOffer are skipped (WHERE clause). Rows
-- with null listPrice get negotiationGap set to JSON null. Rows with null
-- or zero buildingSqft get estGapPerSqft set to JSON null.

update public.analysis_reports
   set content_json = jsonb_set(
     jsonb_set(
       jsonb_set(
         content_json,
         '{dealMath,spread}',
         to_jsonb(round(
           (content_json->'dealMath'->>'arv')::numeric
           - (content_json->'dealMath'->>'maxOffer')::numeric
         )),
         true
       ),
       '{dealMath,estGapPerSqft}',
       case
         when coalesce((content_json->'physical'->>'buildingSqft')::numeric, 0) > 0
         then to_jsonb(round(
                ((content_json->'dealMath'->>'arv')::numeric
                 - (content_json->'dealMath'->>'maxOffer')::numeric)
                / (content_json->'physical'->>'buildingSqft')::numeric
              ))
         else 'null'::jsonb
       end,
       true
     ),
     '{dealMath,negotiationGap}',
     case
       when (content_json->'dealMath'->>'listPrice') is null
       then 'null'::jsonb
       else to_jsonb(round(
              (content_json->'dealMath'->>'maxOffer')::numeric
              - (content_json->'dealMath'->>'listPrice')::numeric
            ))
     end,
     true
   )
 where content_json ? 'dealMath'
   and content_json->'dealMath' is not null
   and (content_json->'dealMath'->>'arv')      is not null
   and (content_json->'dealMath'->>'maxOffer') is not null;

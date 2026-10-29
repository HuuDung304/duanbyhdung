-- Optional atomic Excel import. No data deletion, RLS changes or SECURITY DEFINER.
BEGIN;
CREATE OR REPLACE FUNCTION public.dd460_import_excel(payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, public AS $$
DECLARE
  tbl text; item jsonb; cols text; updates text; conflict_key text; affected integer := 0;
BEGIN
  IF jsonb_typeof(payload) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid import payload'; END IF;
  -- Serialize imports through this RPC. Constraints still protect against other writers.
  PERFORM pg_advisory_xact_lock(46020261029);
  FOREACH tbl IN ARRAY ARRAY['students','subjects','grades'] LOOP
    IF jsonb_typeof(COALESCE(payload->tbl, '[]'::jsonb)) <> 'array' THEN RAISE EXCEPTION 'Invalid % rows', tbl; END IF;
    FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(payload->tbl, '[]'::jsonb)) LOOP
      IF jsonb_typeof(item) <> 'object' OR NOT (item ? 'id') THEN RAISE EXCEPTION 'Invalid % row', tbl; END IF;
      IF tbl = 'grades' AND (NOT (item ? 'score') OR jsonb_typeof(item->'score') <> 'number'
         OR (item->>'score')::numeric NOT BETWEEN 0 AND 10) THEN RAISE EXCEPTION 'Score must be between 0 and 10'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_object_keys(item) k WHERE NOT EXISTS (
        SELECT 1 FROM pg_attribute a WHERE a.attrelid = format('public.%I',tbl)::regclass AND a.attname = k AND a.attnum > 0 AND NOT a.attisdropped
      )) THEN RAISE EXCEPTION 'Unknown column in %; update schema before import', tbl; END IF;
      SELECT string_agg(format('%I', k), ', ' ORDER BY k),
             string_agg(format('%I = EXCLUDED.%I', k, k), ', ' ORDER BY k)
        INTO cols, updates FROM jsonb_object_keys(item) k;
      IF tbl = 'students' AND EXISTS (SELECT 1 FROM public.students WHERE code = item->>'code' AND id <> item->>'id') THEN
        RAISE EXCEPTION 'Student code already exists with another ID; refresh and retry';
      END IF;
      conflict_key := CASE WHEN tbl = 'students' THEN 'code' WHEN tbl = 'grades' THEN 'student_id, subject_id' ELSE 'id' END;
      EXECUTE format('INSERT INTO public.%1$I (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) ON CONFLICT (%3$s) %4$s',
        tbl, cols, conflict_key,
        CASE WHEN tbl = 'students' AND COALESCE((payload->>'create_only')::boolean,false)
          THEN 'DO NOTHING' ELSE 'DO UPDATE SET ' || updates END) USING item;
      affected := affected + 1;
    END LOOP;
  END LOOP;
  RETURN jsonb_build_object('processed', affected);
END;
$$;
REVOKE ALL ON FUNCTION public.dd460_import_excel(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dd460_import_excel(jsonb) TO anon, authenticated;
COMMIT;

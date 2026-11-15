-- REVIEW ONLY. Not applied automatically and not run by a deployment.
-- This wiki uses server-side postgres.js + custom JWT auth, not Supabase Auth.
-- After confirming no other client relies on direct public Data API access,
-- run as the table owner. Existing server-side owner connections keep working.
-- Take a schema/privilege backup first; test login, read, save and uploads in staging.
BEGIN;
DO $hardening$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'activity_logs','categories','chat_messages','document_contents',
    'document_stats_daily','document_stats_total','document_view_recent',
    'documents','faq_questions','head_finder','image_folders','images',
    'npc','price_items','users','village','visitor_logs','document_search_sections',
    'faq_stats_daily','faq_stats_total','faq_view_recent','search_keyword_commits',
    'search_keyword_stats_daily','search_keyword_stats_total'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM anon, authenticated',table_name);
  END LOOP;
END
$hardening$;
-- Both existing functions only call pg_catalog built-ins.
DO $functions$
BEGIN
  IF to_regprocedure('public.normalize_name_key(text)') IS NOT NULL THEN
    ALTER FUNCTION public.normalize_name_key(text) SET search_path = '';
  END IF;
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    ALTER FUNCTION public.set_updated_at() SET search_path = '';
  END IF;
END
$functions$;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
-- No allow-all policy: browsers use the application's authenticated APIs.
COMMIT;
-- Verify with SET ROLE anon / authenticated in a separate transaction: table access
-- should be denied. The application DB role must still pass read/write smoke tests.

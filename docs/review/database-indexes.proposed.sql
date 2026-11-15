-- REVIEW ONLY. Not applied automatically. Run outside an explicit transaction.
-- CONCURRENTLY avoids blocking normal writes on the hosted PostgreSQL database.
CREATE INDEX CONCURRENTLY IF NOT EXISTS chat_messages_user_id_idx ON public.chat_messages(user_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS faq_stats_daily_faq_id_idx ON public.faq_stats_daily(faq_id);
-- Advisor-confirmed duplicates as of 2026-11-15. Recheck pg_indexes before running.
DROP INDEX CONCURRENTLY IF EXISTS public.idx_categories_mode_tags_gin;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_faq_created_at_desc;
DROP INDEX CONCURRENTLY IF EXISTS public.idx_faq_tags_gin;
-- Keep the village unique indexes until constraint/foreign-key ownership is checked.
-- Never drop an index just because its usage counter is zero after a stats reset.

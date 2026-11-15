import { sql } from './db';

/** One statement atomically accepts a view and increments both counters. */
export async function recordView(kind: 'document' | 'faq', id: number, visitorId: string, source: string) {
  const faq = kind === 'faq';
  const entity = sql(faq ? 'faq_questions' : 'documents');
  const idColumn = sql(faq ? 'faq_id' : 'document_id');
  const recent = sql(faq ? 'faq_view_recent' : 'document_view_recent');
  const total = sql(faq ? 'faq_stats_total' : 'document_stats_total');
  const daily = sql(faq ? 'faq_stats_daily' : 'document_stats_daily');
  const sources = faq ? ['list', 'search', 'home', 'other'] : ['category', 'search', 'link', 'other'];
  const column = sql(`${sources.includes(source) ? source : 'other'}_views`);
  const rows = await sql<{ counted: boolean; exists: boolean }[]>`
    WITH accepted AS (
      INSERT INTO ${recent} (${idColumn}, visitor_id, last_viewed_at)
      SELECT id, ${visitorId}, NOW() FROM ${entity} WHERE id = ${id}
      ON CONFLICT (${idColumn}, visitor_id) DO UPDATE SET last_viewed_at = NOW()
      WHERE ${recent}.last_viewed_at <= NOW() - INTERVAL '10 minutes'
      RETURNING ${idColumn}
    ), total_bump AS (
      INSERT INTO ${total} (${idColumn}, views, ${column}, updated_at)
      SELECT ${idColumn}, 1, 1, NOW() FROM accepted
      ON CONFLICT (${idColumn}) DO UPDATE SET views = ${total}.views + 1,
        ${column} = ${total}.${column} + 1, updated_at = NOW()
      RETURNING ${idColumn}
    ), daily_bump AS (
      INSERT INTO ${daily} (day, ${idColumn}, views, ${column}, updated_at)
      SELECT CURRENT_DATE, ${idColumn}, 1, 1, NOW() FROM accepted
      ON CONFLICT (day, ${idColumn}) DO UPDATE SET views = ${daily}.views + 1,
        ${column} = ${daily}.${column} + 1, updated_at = NOW()
      RETURNING ${idColumn}
    )
    SELECT EXISTS(SELECT 1 FROM accepted) AS counted,
      EXISTS(SELECT 1 FROM ${entity} WHERE id = ${id}) AS exists
  `;
  return rows[0];
}

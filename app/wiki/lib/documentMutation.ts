import type { SQL } from './db';

/** Must run inside the caller's transaction, after the wiki mutation advisory lock. */
export async function deleteDocumentsUsing(tx: SQL, ids: number[]) {
  if (!ids.length) return;
  await tx`UPDATE categories SET document_id = NULL WHERE document_id = ANY(${ids})`;
  await tx`DELETE FROM document_search_sections WHERE document_id = ANY(${ids})`;
  await tx`DELETE FROM document_view_recent WHERE document_id = ANY(${ids})`;
  await tx`DELETE FROM document_stats_daily WHERE document_id = ANY(${ids})`;
  await tx`DELETE FROM document_stats_total WHERE document_id = ANY(${ids})`;
  await tx`DELETE FROM document_contents WHERE document_id = ANY(${ids})`;
  await tx`DELETE FROM documents WHERE id = ANY(${ids})`;
}

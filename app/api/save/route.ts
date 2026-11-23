import { after, NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/wiki/lib/requireRole';
import { isTransientDbError, type SQL } from '@/wiki/lib/db';
import { createHash, randomUUID } from 'node:crypto';
import { withSaveConnection } from '@/wiki/lib/saveConnection';
import { invalidate } from '@/wiki/lib/cache';
import { invalidateDocumentCache } from '@/wiki/lib/documentCache';
import { buildDocumentSearchSections, replaceDocumentSearchSectionsUsing } from '@/wiki/lib/documentSearchIndex';
import { logActivity, resolveCategoryName } from '@/wiki/lib/activity';
import { isPositiveId } from '@/wiki/lib/apiInput';
import { parseDocumentContent } from '@/wiki/lib/documentInput';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
// Includes authentication, cold connections and one confirmed-rollback retry.
export const maxDuration = 60;
export const preferredRegion = 'icn1';
const noStore = { 'Cache-Control': 'no-store' };

class SaveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

// Retry only errors for which PostgreSQL has definitely rolled the transaction back.
// Connection failures after COMMIT are ambiguous and must not create duplicate writes.
async function retryRolledBackSave<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(); }
    catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (attempt >= 1 || !code || !['55P03', '40P01', '40001'].includes(code)) throw error;
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }
}

export async function POST(req: NextRequest) {
  const traceId = randomUUID();
  const headers = { ...noStore, 'X-Save-Trace': traceId };
  const started = Date.now();
  let stage = 'connect';
  try {
    return await withSaveConnection(async (sql: SQL) => {
      stage = 'auth';
      const gate = await requireRole(['writer', 'admin'], sql);
      if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers });
      const body = await req.json().catch(() => null);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new SaveError(400, '올바른 문서 데이터를 보내주세요.');
      }
      const id = body.id == null ? null : Number(body.id);
      if (id !== null && !isPositiveId(id)) throw new SaveError(400, '잘못된 문서 ID입니다.');
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const path = typeof body.path === 'string' || typeof body.path === 'number' ? String(body.path).trim() : '';
      if (!title || title.length > 255 || !path || path.length > 255) {
        throw new SaveError(400, 'path와 255자 이내의 title은 필수입니다.');
      }
      const content = parseDocumentContent(body.content);
      if (content === null) throw new SaveError(400, '문서 본문 형식이 올바르지 않습니다. 기존 문서는 변경되지 않았습니다.');
      const contentJson = JSON.stringify(content);
      const searchSections = buildDocumentSearchSections(content);
      const tags = Array.from(new Set<string>((Array.isArray(body.tags) ? body.tags : typeof body.tags === 'string' ? body.tags.split(',') : [])
        .filter((tag: unknown): tag is string => typeof tag === 'string').map((tag: string) => tag.trim()).filter(Boolean)));
      const icon = typeof body.icon === 'string' ? body.icon : '';
      const expected = body.expectedUpdatedAt == null ? null : new Date(body.expectedUpdatedAt).getTime();
      if (expected !== null && !Number.isFinite(expected)) throw new SaveError(400, '잘못된 수정 시각입니다.');
      const uploader = gate.dbUser.minecraft_name || gate.dbUser.username;
      const requestId = body.saveRequestId == null ? null : String(body.saveRequestId).trim().toLowerCase();
      if (requestId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        throw new SaveError(400, '잘못된 저장 요청 ID입니다.');
      }
      const requestHash = createHash('sha256').update(JSON.stringify({ id, title, path, content, tags, icon, expected })).digest('hex');
      stage = 'schema';

      const types = await sql`
        SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND
          ((table_name = 'documents' AND column_name = 'tags') OR
           (table_name = 'document_contents' AND column_name = 'content'))
      `;
      const columns = {
        tagsArray: types.some(r => r.table_name === 'documents' && r.data_type === 'ARRAY'),
        contentType: types.find(r => r.table_name === 'document_contents')?.data_type ?? 'text',
      };
      stage = 'transaction';

      const saved = await retryRolledBackSave(() => sql.begin(async (transaction) => {
        const tx = transaction as unknown as SQL;
        // Saves may run in parallel across categories. Category mutations and document deletions retain
        // the exclusive global gate, so they cannot race a save. A category lock still
        // protects duplicate-title checks and new-document ordering in that category.
        await tx.unsafe("SET LOCAL lock_timeout = '3s'; SET LOCAL statement_timeout = '8s'; SET LOCAL idle_in_transaction_session_timeout = '15s'");
        if (requestId) {
          await tx`SELECT pg_advisory_xact_lock(191921, hashtext(${requestId}))`;
          const prior = await tx`SELECT actor_id, request_hash, result FROM document_save_requests WHERE request_id = ${requestId}::uuid`;
          if (prior[0]) {
            if (prior[0].actor_id !== gate.dbUser.id || prior[0].request_hash !== requestHash) {
              throw new SaveError(409, '이미 사용된 저장 요청 ID입니다. 편집 내용을 확인한 후 다시 저장해 주세요.');
            }
            return { ...prior[0].result, replayed: true } as { id: number; updatedAt: Date | string; oldPath?: string; created: boolean; replayed: boolean };
          }
        }
        await tx`SELECT pg_advisory_xact_lock_shared(191919, 1)`;
        await tx`SELECT pg_advisory_xact_lock(191920, hashtext(${path}))`;
        let previous: { path: string; updated_at: Date | string } | undefined;
        if (id !== null) {
          const rows = await tx`SELECT path, updated_at FROM documents WHERE id = ${id} FOR UPDATE`;
          previous = rows[0] as typeof previous;
          if (!previous) throw new SaveError(404, '문서를 찾을 수 없습니다.');
          if (expected !== null && new Date(previous.updated_at).getTime() !== expected) {
            throw new SaveError(409, '다른 사용자가 먼저 문서를 수정했습니다. 현재 내용을 임시 저장한 뒤 최신 문서를 다시 열어주세요.');
          }
        }
        const duplicate = await tx`
          SELECT id FROM documents WHERE path = ${path} AND title = ${title}
          AND (${id}::int IS NULL OR id <> ${id}) LIMIT 1
        `;
        if (duplicate.length) throw new SaveError(409, '같은 카테고리에 동일한 제목의 문서가 존재합니다.');
        const tagsValue = columns.tagsArray ? tx`${tags}::text[]` : tx`${tags.join(',')}`;
        const rows = id === null
          ? await tx`
              INSERT INTO documents (title, path, icon, tags, "order", uploader, updated_at)
              VALUES (${title}, ${path}, ${icon}, ${tagsValue},
                (SELECT COALESCE(MAX("order"), -1) + 1 FROM documents WHERE path = ${path}), ${uploader}, NOW())
              RETURNING id, updated_at
            `
          : await tx`
              UPDATE documents SET title = ${title}, path = ${path}, icon = ${icon}, tags = ${tagsValue}, updated_at = NOW()
              WHERE id = ${id} RETURNING id, updated_at
            `;
        const documentId = Number(rows[0].id);
        const contentValue = columns.contentType === 'jsonb' ? tx`${contentJson}::jsonb`
          : columns.contentType === 'json' ? tx`${contentJson}::json` : tx`${contentJson}`;
        await tx`
          INSERT INTO document_contents (document_id, content) VALUES (${documentId}, ${contentValue})
          ON CONFLICT (document_id) DO UPDATE SET content = EXCLUDED.content
        `;
        // Content, metadata and the search index either all commit or all roll back.
        await replaceDocumentSearchSectionsUsing(tx, documentId, content, searchSections);
        const result = { id: documentId, updatedAt: rows[0].updated_at, oldPath: previous?.path, created: id === null };
        if (requestId) await tx`
          INSERT INTO document_save_requests (request_id, actor_id, request_hash, result)
          VALUES (${requestId}::uuid, ${gate.dbUser.id}, ${requestHash}, ${tx.json(JSON.parse(JSON.stringify(result)))})
        `;
        return { ...result, replayed: false };
      }));

      stage = 'response';
      try { invalidateDocumentCache(saved.id); }
      catch (error) { console.error('[save] content cache invalidation failed after commit:', error); }
      invalidate('search:index', 'doc:list', `doclist:${path}`, ...(saved.oldPath ? [`doclist:${saved.oldPath}`] : []));
      // Send the committed result before auxiliary DB logging. A slow log must not
      // consume the response deadline and make a completed save appear to fail.
      if (!saved.replayed) after(async () => {
        try {
          const label = await resolveCategoryName(/^\d+$/.test(path) ? Number(path) : null);
          await logActivity({ action: saved.created ? 'document.create' : 'document.update', username: uploader,
            targetType: 'document', targetId: saved.id, targetName: title, targetPath: label,
            meta: { tags, icon, created: saved.created } });
        } catch (error) { console.error('[save] activity log failed:', error); }
      });
      console.info('[save] completed', { traceId, elapsedMs: Date.now() - started, documentId: saved.id, replayed: saved.replayed });
      return NextResponse.json({ success: true, id: saved.id, updatedAt: saved.updatedAt, searchIndexUpdated: true }, { headers });
    });
  } catch (error) {
    console.error('[save] failed', { traceId, stage, elapsedMs: Date.now() - started, code: (error as { code?: string })?.code });
    if (error instanceof SaveError) return NextResponse.json({ error: error.message, outcome: 'not-saved' }, { status: error.status, headers });
    // 55P03: lock_not_available (lock_timeout 초과). 저장은 반영되지 않았다.
    if (['55P03', '40P01', '40001', '57014'].includes((error as { code?: string } | null)?.code ?? '')) {
      return NextResponse.json(
        { error: '저장 작업이 지연되어 완료하지 못했습니다. 문서는 변경되지 않았습니다. 잠시 후 다시 저장해 주세요.', outcome: 'not-saved' },
        { status: 503, headers: { ...headers, 'Retry-After': '5' } },
      );
    }
    if (isTransientDbError(error)) {
      console.error('[save] database connection unavailable:', error);
      return NextResponse.json({ error: 'DB 연결이 일시적으로 불안정합니다. 편집 내용은 유지됩니다. 저장 결과를 확인한 뒤 다시 시도해주세요.' },
        { status: 503, headers: { ...headers, 'Retry-After': '3' } });
    }
    console.error('[save] unexpected error:', error);
    return NextResponse.json({ error: '문서 저장 중 오류가 발생했습니다.' }, { status: 500, headers });
  }
}

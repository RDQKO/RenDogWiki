import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/wiki/lib/requireRole';
import { sql, withTx } from '@/wiki/lib/db';
import { cached, invalidate } from '@/wiki/lib/cache';
import { invalidateDocumentCache } from '@/wiki/lib/documentCache';
import { replaceDocumentSearchSectionsUsing } from '@/wiki/lib/documentSearchIndex';
import { logActivity, resolveCategoryName } from '@/wiki/lib/activity';
import { isPositiveId } from '@/wiki/lib/apiInput';
import { parseDocumentContent } from '@/wiki/lib/documentInput';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
const headers = { 'Cache-Control': 'no-store' };

class SaveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function POST(req: NextRequest) {
  try {
    const gate = await requireRole(['writer', 'admin']);
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
    const tags = Array.from(new Set<string>((Array.isArray(body.tags) ? body.tags : typeof body.tags === 'string' ? body.tags.split(',') : [])
      .filter((tag: unknown): tag is string => typeof tag === 'string').map((tag: string) => tag.trim()).filter(Boolean)));
    const icon = typeof body.icon === 'string' ? body.icon : '';
    const expected = body.expectedUpdatedAt == null ? null : new Date(body.expectedUpdatedAt).getTime();
    if (expected !== null && !Number.isFinite(expected)) throw new SaveError(400, '잘못된 수정 시각입니다.');
    const uploader = gate.dbUser.minecraft_name || gate.dbUser.username;

    // Keep compatibility with existing text/json/array deployments without two metadata reads per save.
    const columns = await cached('save:column-types:v1', { ttlSec: 3600 }, async () => {
      const rows = await sql`
        SELECT table_name, column_name, data_type FROM information_schema.columns
        WHERE table_schema = 'public' AND
          ((table_name = 'documents' AND column_name = 'tags') OR
           (table_name = 'document_contents' AND column_name = 'content'))
      `;
      return {
        tagsArray: rows.some((r) => r.table_name === 'documents' && r.data_type === 'ARRAY'),
        contentType: rows.find((r) => r.table_name === 'document_contents')?.data_type ?? 'text',
      };
    });

    const saved = await withTx(async (tx) => {
      // Serialize wiki mutations, including duplicate-title checks, across serverless instances.
      await tx`SELECT pg_advisory_xact_lock(191919, 1)`;
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
      await replaceDocumentSearchSectionsUsing(tx, documentId, content);
      return { id: documentId, updatedAt: rows[0].updated_at, oldPath: previous?.path, created: id === null };
    });

    invalidateDocumentCache(saved.id);
    invalidate('search:index', 'doc:list', `doclist:${path}`, ...(saved.oldPath ? [`doclist:${saved.oldPath}`] : []));
    // Auxiliary logging must not turn an already committed save into a failure response.
    try {
      const label = await resolveCategoryName(/^\d+$/.test(path) ? Number(path) : null);
      await logActivity({ action: saved.created ? 'document.create' : 'document.update', username: uploader,
        targetType: 'document', targetId: saved.id, targetName: title, targetPath: label,
        meta: { tags, icon, created: saved.created } });
    } catch (error) { console.error('[save] activity log failed:', error); }
    return NextResponse.json({ success: true, id: saved.id, updatedAt: saved.updatedAt, searchIndexUpdated: true }, { headers });
  } catch (error) {
    if (error instanceof SaveError) return NextResponse.json({ error: error.message }, { status: error.status, headers });
    console.error('[save] unexpected error:', error);
    return NextResponse.json({ error: '문서 저장 중 오류가 발생했습니다.' }, { status: 500, headers });
  }
}

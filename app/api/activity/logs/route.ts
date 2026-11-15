import { requireRole } from '@/wiki/lib/requireRole';
import { boundedInteger } from '@/wiki/lib/apiInput';
// =============================================
// File: app/api/activity/logs/route.ts
// =============================================
/**
 * 활동 로그 조회 API
 * - 최신순 페이징 -> cursor(id 미만) + limit(기본 30, 1~100)
 * - 검색어 q -> username/target_name/action/target_type 에 ILIKE 적용
 * - target_path가 숫자라면 실제 이름으로 치환해서 반환
 * - 캐시는 항상 no-store (실시간 확인용)
 *
 * 구현 메모
 * - sql 태그에는 제네릭 타입 인수를 넣지 않는다(타입 오류 방지)
 * - 숫자 파라미터 파싱은 안전하게 처리(숫자 아님 -> 기본값/무시)
 */

import { NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { cached } from '@/wiki/lib/cache'; // ✅ 내부 마이크로 캐시(앱 메모리)

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type Row = {
  id: number;
  action: string;
  username: string | null;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  target_path: string | null; // 사람이 읽는 라벨
  meta: any | null;
  created_at: string; // ISO
};

const ROOT_LABEL: Record<string, string> = {
  folder: '루트 폴더',
  image: '루트 폴더',
  category: '루트 카테고리',
  document: '루트 카테고리',
  npc: '전체',
  head: '전체',
  village: '전체',
};

function isNumericLike(v: unknown): v is string {
  return typeof v === 'string' && /^\d+$/.test(v);
}

/** ✅ 숫자 id 집합 → 이름 맵을 60초 동안 앱 메모리에 캐시 */
async function getFolderNameMap(ids: number[]): Promise<Record<number, string>> {
  if (!ids.length) return {};
  const key = `activity:folderNames:${ids.slice().sort((a, b) => a - b).join(',')}`;
  return cached(key, { ttlSec: 60 }, async () => {
    const rs = (await sql`
      SELECT id, name FROM image_folders WHERE id = ANY(${ids})
    `) as unknown as { id: number; name: string }[];
    const obj: Record<number, string> = {};
    for (const r of rs) obj[Number(r.id)] = r.name;
    return obj;
  });
}

async function getCategoryNameMap(ids: number[]): Promise<Record<number, string>> {
  if (!ids.length) return {};
  const key = `activity:categoryNames:${ids.slice().sort((a, b) => a - b).join(',')}`;
  return cached(key, { ttlSec: 60 }, async () => {
    const rs = (await sql`
      SELECT id, name FROM categories WHERE id = ANY(${ids})
    `) as unknown as { id: number; name: string }[];
    const obj: Record<number, string> = {};
    for (const r of rs) obj[Number(r.id)] = r.name;
    return obj;
  });
}

async function getVillageNameMap(ids: number[]): Promise<Record<number, string>> {
  if (!ids.length) return {};
  const key = `activity:villageNames:${ids.slice().sort((a, b) => a - b).join(',')}`;
  return cached(key, { ttlSec: 60 }, async () => {
    const rs = (await sql`
      SELECT id, name FROM village WHERE id = ANY(${ids})
    `) as unknown as { id: number; name: string }[];
    const obj: Record<number, string> = {};
    for (const r of rs) obj[Number(r.id)] = r.name;
    return obj;
  });
}

export async function GET(req: Request) {
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: { 'Cache-Control': 'no-store' } });
  // 파라미터 파싱 -> 안전한 기본값 적용
  const { searchParams } = new URL(req.url);

  const DEFAULT_LIMIT = 30;
  const MAX_LIMIT = 100;

  const limit = boundedInteger(searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT);

  const cursorStr = searchParams.get('cursor');
  const parsedCursor = cursorStr != null ? Number(cursorStr) : NaN;
  const cursor = Number.isFinite(parsedCursor) ? Math.trunc(parsedCursor) : null;

  const q = (searchParams.get('q') ?? '').trim();

  let rows: Row[] = [];

  // 기본 SELECT 템플릿 -> 이후 조건을 붙여서 사용
  const base = sql`
    SELECT id, action, username, target_type, target_id, target_name, target_path, meta, created_at
    FROM activity_logs
  `;

  // 분기: 기존 로직을 유지해서 동작 동일
  if (q && cursor != null) {
    rows = (await sql`
      ${base}
      WHERE id < ${cursor}
        AND (
          username ILIKE ${'%' + q + '%'}
          OR target_name ILIKE ${'%' + q + '%'}
          OR action ILIKE ${'%' + q + '%'}
          OR target_type ILIKE ${'%' + q + '%'}
        )
      ORDER BY id DESC
      LIMIT ${limit}
    `) as unknown as Row[];
  } else if (q) {
    rows = (await sql`
      ${base}
      WHERE
        username ILIKE ${'%' + q + '%'}
        OR target_name ILIKE ${'%' + q + '%'}
        OR action ILIKE ${'%' + q + '%'}
        OR target_type ILIKE ${'%' + q + '%'}
      ORDER BY id DESC
      LIMIT ${limit}
    `) as unknown as Row[];
  } else if (cursor != null) {
    rows = (await sql`
      ${base}
      WHERE id < ${cursor}
      ORDER BY id DESC
      LIMIT ${limit}
    `) as unknown as Row[];
  } else {
    rows = (await sql`
      ${base}
      ORDER BY id DESC
      LIMIT ${limit}
    `) as unknown as Row[];
  }

  // 숫자 경로 -> 이름 치환 준비
  const needFolderIds = new Set<number>();
  const needCategoryIds = new Set<number>();
  const needVillageIds = new Set<number>();

  for (const r of rows) {
    const p = r.target_path;
    if (p == null) continue;
    if (!isNumericLike(p)) continue;

    const id = Number(p);
    switch (r.target_type) {
      case 'folder':
      case 'image':
        needFolderIds.add(id);
        break;
      case 'category':
      case 'document':
        needCategoryIds.add(id);
        break;
      case 'npc':
      case 'head':
      case 'village':
        // 현재 구현에서는 npc/head도 village 테이블을 본다고 가정(의도 확인 필요)
        needVillageIds.add(id);
        break;
      default:
        // 알 수 없는 type -> 치환 시도하지 않음
        break;
    }
  }

  // 필요한 라벨만 일괄 조회 (✅ 60초 마이크로 캐시)
  const [folderNameMap, categoryNameMap, villageNameMap] = await Promise.all([
    getFolderNameMap(Array.from(needFolderIds)),
    getCategoryNameMap(Array.from(needCategoryIds)),
    getVillageNameMap(Array.from(needVillageIds)),
  ]);

  // 숫자 경로라면 id -> 이름으로 바꿔서 반환
  const labeled: Row[] = rows.map((r) => {
    let path = r.target_path;

    if (path == null || path === '') {
      path = ROOT_LABEL[r.target_type] ?? null;
    } else if (isNumericLike(path)) {
      const id = Number(path);
      if (r.target_type === 'folder' || r.target_type === 'image') {
        path = folderNameMap[id] ?? path;
      } else if (r.target_type === 'category' || r.target_type === 'document') {
        path = categoryNameMap[id] ?? path;
      } else if (
        r.target_type === 'npc' ||
        r.target_type === 'head' ||
        r.target_type === 'village'
      ) {
        path = villageNameMap[id] ?? path;
      }
    }

    return { ...r, target_path: path };
  });

  const nextCursor = labeled.length === limit ? labeled[labeled.length - 1].id : null;

  return NextResponse.json(
    { items: labeled, nextCursor },
    { headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate', 'X-App-Cache': 'OFF' } }
  );
}

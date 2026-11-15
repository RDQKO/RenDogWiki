// =============================================
// File: app/api/npcs/route.ts  (전체 코드)
// =============================================
/**
 * NPC 목록 조회/추가
 * - GET  -> village_id(필수), npc_type(선택) 기준 목록 반환 (order, name 순)
 * - POST -> 신규 NPC 추가 (필수: name, icon, village_id)
 * - pictures/rewards는 항상 배열로 보정해서 저장/반환
 * - 응답은 실시간 갱신 성격 -> 캐시 금지
 */

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';
import { logActivity, resolveVillageName } from '@wiki/lib/activity';
import { cached, invalidate } from '@/wiki/lib/cache'; // ✅ 추가: 앱 메모리 캐시
import { requireRole } from '@/app/wiki/lib/requireRole';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALLOWED_TAGS = [
  '추천','필수','완정','보스','타임어택','기사단','극난퀘','혼의 시련','6차',
] as const;

type TagKey = typeof ALLOWED_TAGS[number] | null;

const ALLOWED: ReadonlyArray<NonNullable<TagKey>> = [...ALLOWED_TAGS];

function toTagOr(v: unknown, fallback: TagKey): TagKey {
  if (v === undefined) return fallback;
  if (v === null || v === '') return null;
  const s = String(v).trim();
  return (ALLOWED as readonly string[]).includes(s) ? (s as TagKey) : fallback;
}


function toArray(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'string') { try { const j = JSON.parse(v); return Array.isArray(j) ? j : []; } catch { return []; } }
  return [];
}
function numOr<T extends number>(v: unknown, fallback: T): T {
  const n = Number(v); return (Number.isFinite(n) ? Math.trunc(n) : fallback) as T;
}
function strOr<T extends string | null>(v: unknown, fallback: T): T {
  if (typeof v === 'string') return (v as string).trim() as T;
  return fallback;
}

function toTagKey(v: unknown): TagKey {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return (ALLOWED as readonly string[]).includes(s) ? (s as TagKey) : null;
}

/** GET */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const villageParam = searchParams.get('village_id');
    const npcTypeParam = (searchParams.get('npc_type') ?? 'normal').trim();

    const village_id = Number(villageParam);
    if (!Number.isFinite(village_id) || village_id <= 0) {
      return NextResponse.json([], { headers: { 'Cache-Control': 'no-store' } });
    }

    const noCache = searchParams.get('nocache') === '1';

    const fetchRows = async () => {
      const rows = (await sql/*sql*/`
        SELECT * FROM npc
        WHERE village_id = ${village_id}
          AND npc_type = ${npcTypeParam}
        ORDER BY "order", name
      `) as unknown as any[];

      return rows.map((row) => ({
        ...row,
        pictures: toArray(row.pictures),
        rewards:  toArray(row.rewards),
        tag: (row as any).tag ?? null,
      }));
    };

    // ✅ 관리 화면(=nocache=1)은 캐시 우회
    const normalized = noCache
      ? await fetchRows()
      : await cached(`npc:list:v=${village_id}:t=${npcTypeParam}`, { ttlSec: 60, tags: ['npc:list'] }, fetchRows);

    return NextResponse.json(normalized, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[npc GET] unexpected error:', err);
    return NextResponse.json({ error: 'server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** POST */
export async function POST(req: Request) {
  const gate = await requireRole(['writer', 'admin']);
  if (!gate.ok) {
    return new Response(JSON.stringify({ error: gate.error }), {
      status: gate.status,
      headers: { 'content-type': 'application/json' },
    });
  }

  const uploader = gate.dbUser.minecraft_name || gate.dbUser.username || 'unknown';

  try {
    const body = await req.json().catch(() => ({} as any));
    const name = strOr(body?.name, '');
    const icon = strOr(body?.icon, '');
    const village_id = Number(body?.village_id);
    if (!name || !icon || !Number.isFinite(village_id) || village_id <= 0) {
      return NextResponse.json({ error: '필수값 누락' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const order = numOr(body?.order, 0);
    const requirement = body?.requirement === undefined ? null : strOr(body?.requirement, null);
    const line = body?.line === undefined ? null : strOr(body?.line, null);
    const location_x = numOr(body?.location_x, 0);
    const location_y = numOr(body?.location_y, 0);
    const location_z = numOr(body?.location_z, 0);
    const quest = strOr(body?.quest, '');
    const npc_type = strOr(body?.npc_type ?? 'normal', 'normal');
    const pictures = toArray(body?.pictures);
    const rewards  = toArray(body?.rewards);
    const tag = body?.tag ?? null;
    
    const inserted = (await sql/*sql*/`
      INSERT INTO npc
        (name, icon, village_id, "order", requirement, line,
         location_x, location_y, location_z, quest, npc_type,
         pictures, rewards, tag, uploader)
      VALUES (
        ${name}, ${icon}, ${village_id}, ${order},
        ${requirement}, ${line},
        ${location_x}, ${location_y}, ${location_z},
        ${quest}, ${npc_type},
        ${JSON.stringify(pictures)}, ${JSON.stringify(rewards)}, ${tag}, ${uploader}
      )
      RETURNING *
    `) as unknown as any[];

    const row = inserted[0];
    row.pictures = toArray(row.pictures);
    row.rewards  = toArray(row.rewards);
    row.tag      = row.tag ?? null;

    const villageLabel = await resolveVillageName(row.village_id);
    invalidate('npc:list', 'village:list', 'search:index');
    await logActivity({
      action: 'npc.create',
      username: uploader,
      targetType: 'npc',
      targetId: row.id,
      targetName: row.name,
      targetPath: villageLabel,
      meta: { npc_type: row.npc_type, tag: row.tag },
    });

    return NextResponse.json(row, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[npc POST] unexpected error:', err);
    return NextResponse.json({ error: 'server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

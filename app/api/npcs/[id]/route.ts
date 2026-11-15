import { invalidate } from '@/wiki/lib/cache';
// =============================================
// File: app/api/npc/[id]/route.ts
// =============================================
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';
import { getAuthUser } from '@/wiki/lib/auth';
import { logActivity } from '@wiki/lib/activity';
import { requireRole, canDeleteUploaded } from '@/wiki/lib/requireRole';

export const runtime = 'nodejs';

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

type NpcRow = {
  id: number;
  name: string;
  icon: string;
  location_x: number;
  location_y: number;
  location_z: number;
  line: string | null;
  village_id: number;
  order: number;
  requirement: string | null;
  quest: string;
  npc_type: string;
  pictures: unknown;
  rewards: unknown;
  tag: string | null;
  uploader: string | null;
};

function parseArray(v: unknown): any[] {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  if (typeof v === 'string') {
    try {
      const j = JSON.parse(v);
      return Array.isArray(j) ? j : [];
    } catch { return []; }
  }
  return [];
}
function toNumOr<T extends number>(v: unknown, fallback: T): T {
  const n = Number(v);
  return (Number.isFinite(n) ? Math.trunc(n) : fallback) as T;
}
function toStrOr<T extends string | null>(v: unknown, fallback: T): T {
  if (typeof v === 'string') return (v as string).trim() as T;
  return fallback;
}
function toNpcTypeOr(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = v.trim().toLowerCase();
  return t === 'normal' || t === 'quest' ? t : fallback;
}

/** PATCH: 단건 수정 */
export async function PATCH(req: NextRequest, { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const gate = await requireRole(['writer', 'admin']);

  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      {
        status: gate.status,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const body = await req.json().catch(() => ({} as any));

    const rows = (await sql/*sql*/`SELECT * FROM npc WHERE id = ${id} LIMIT 1`) as unknown as NpcRow[];
    if (!rows.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }
    const cur = rows[0];

    const merged = {
      name: toStrOr(body?.name, cur.name),
      icon: toStrOr(body?.icon, cur.icon),
      location_x: toNumOr(body?.location_x, cur.location_x),
      location_y: toNumOr(body?.location_y, cur.location_y),
      location_z: toNumOr(body?.location_z, cur.location_z),
      line: body?.line === undefined ? cur.line : toStrOr(body?.line, cur.line),
      village_id: toNumOr(body?.village_id, cur.village_id),
      order: toNumOr(body?.order, cur.order),
      requirement: body?.requirement === undefined ? cur.requirement : toStrOr(body?.requirement, cur.requirement),
      quest: toStrOr(body?.quest, cur.quest),
      npc_type: toNpcTypeOr(body?.npc_type, cur.npc_type),
      pictures: body?.pictures === undefined ? parseArray(cur.pictures) : parseArray(body?.pictures),
      rewards:  body?.rewards  === undefined ? parseArray(cur.rewards)  : parseArray(body?.rewards),
      tag: toTagOr(body?.tag, (cur.tag ?? null) as TagKey),
    };

    await sql/*sql*/`
      UPDATE npc SET
        name        = ${merged.name},
        icon        = ${merged.icon},
        location_x  = ${merged.location_x},
        location_y  = ${merged.location_y},
        location_z  = ${merged.location_z},
        line        = ${merged.line},
        village_id  = ${merged.village_id},
        "order"     = ${merged.order},
        requirement = ${merged.requirement},
        quest       = ${merged.quest},
        npc_type    = ${merged.npc_type},
        pictures    = ${JSON.stringify(merged.pictures)},
        rewards     = ${JSON.stringify(merged.rewards)},
        tag         = ${merged.tag}
      WHERE id = ${id}
    `;

    const updatedRows = (await sql/*sql*/`SELECT * FROM npc WHERE id = ${id} LIMIT 1`) as unknown as NpcRow[];
    const updated = updatedRows[0];
    (updated as any).pictures = parseArray(updated.pictures);
    (updated as any).rewards  = parseArray(updated.rewards);

    const me = await getAuthUser();
    const username = me?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;
    invalidate('npc:list', 'village:list', 'search:index');
    await logActivity({
      action: 'npc.update',
      username,
      targetType: 'npc',
      targetId: id,
      targetName: updated.name,
      targetPath: String(updated.village_id),
      meta: { field: 'tag', value: updated.tag ?? null },
    });

    return NextResponse.json(updated, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[npc PATCH] unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** DELETE: 그대로 */
export async function DELETE(req: NextRequest, { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  const gate = await requireRole(['writer', 'admin']);

  if (!gate.ok) {
    return NextResponse.json(
      { error: gate.error },
      {
        status: gate.status,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }

  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const me = await getAuthUser();
    const username = me?.minecraft_name ?? req.headers.get('x-wiki-username') ?? null;

    const rows = (await sql/*sql*/`
      SELECT id, name, village_id, uploader FROM npc WHERE id = ${id} LIMIT 1
    `) as unknown as Array<Pick<NpcRow,'id'|'name'|'village_id'|'uploader'>>;
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });

    const row = rows[0];
    if (!canDeleteUploaded(gate.dbUser, row.uploader)) {
      return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
    }
    await sql/*sql*/`DELETE FROM npc WHERE id = ${id}`;
    invalidate('npc:list', 'village:list', 'search:index');
    await logActivity({ action: 'npc.delete', username, targetType:'npc', targetId:id, targetName:row.name, targetPath:String(row.village_id), meta:null });

    return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[npc DELETE] unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}

/** ✅ GET: 단건 조회 (public) */
export async function GET(_req: NextRequest, { params: pendingParams }: { params: Promise<{ id: string }> }
) {
  const params = await pendingParams;
  try {
    const id = Number(params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }

    const rows = (await sql/*sql*/`SELECT * FROM npc WHERE id = ${id} LIMIT 1`) as unknown as any[];
    if (!rows.length) {
      return NextResponse.json({ error: 'Not found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
    }

    const row = rows[0];
    row.pictures = parseArray(row.pictures);
    row.rewards = parseArray(row.rewards);
    row.tag = row.tag ?? null;

    return NextResponse.json(row, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('[npc GET:id] unexpected error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
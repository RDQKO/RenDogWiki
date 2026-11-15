import { boundedInteger } from '@/wiki/lib/apiInput';
// =============================================
// File: app/api/search/quest/route.ts
// (새 파일 전체 코드)
// - 퀘스트 NPC 전용 검색
// - 검색 조건: npc.name만
// - 표시 정보: id, name, icon, village_name
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/wiki/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

type QuestRow = {
  id: number;
  name: string;
  icon: string | null;
  village_name: string | null;
};

function compactSearchText(v: string) {
  return String(v ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim();
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const raw = (sp.get('query') ?? '').trim();
    const limit = boundedInteger(sp.get('limit'), 10, 1, 50);

    if (!raw) {
      return NextResponse.json([], {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const pattern = `%${raw}%`;
    const compactRaw = compactSearchText(raw);
    const compactPattern = `%${compactRaw}%`;

    const rows = await sql<QuestRow[]>/* sql */ `
      SELECT
        n.id,
        n.name,
        n.icon,
        v.name AS village_name
      FROM npc n
      LEFT JOIN village v
        ON v.id = n.village_id
      WHERE
        n.npc_type = 'quest'
        AND (
          LOWER(COALESCE(n.name, '')) LIKE LOWER(${pattern})
          OR regexp_replace(LOWER(COALESCE(n.name, '')), '\\s+', '', 'g') LIKE ${compactPattern}
        )
      ORDER BY
        CASE
          WHEN LOWER(COALESCE(n.name, '')) = LOWER(${raw}) THEN 0
          WHEN regexp_replace(LOWER(COALESCE(n.name, '')), '\\s+', '', 'g') = ${compactRaw} THEN 1
          WHEN LOWER(COALESCE(n.name, '')) LIKE LOWER(${pattern}) THEN 2
          ELSE 3
        END,
        n.name ASC,
        n.id DESC
      LIMIT ${limit}
    `;

    return NextResponse.json(rows ?? [], {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (err) {
    console.error('[search quest GET] unexpected error:', err);
    return NextResponse.json(
      { error: 'server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  }
}

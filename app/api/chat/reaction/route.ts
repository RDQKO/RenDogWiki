import { NextRequest, NextResponse } from 'next/server';
import { POST as toggleReaction } from '../toggle-reaction/route';
import { requireAuth } from '@/wiki/lib/requireRole';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const gate = await requireAuth();
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status, headers: { 'Cache-Control': 'no-store' } });
  const body = await req.json().catch(() => null);
  return toggleReaction(new NextRequest(req.url, {
    method: 'POST', headers: req.headers,
    body: JSON.stringify({ message_id: body?.id, type: body?.type }),
  }));
}

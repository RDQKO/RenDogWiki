import { NextResponse } from 'next/server';
import { readImageManifest } from '@/wiki/lib/imageReplacementStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // One small manifest per visit/focus, never one request per displayed image.
    return NextResponse.json(await readImageManifest(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[image/replacements]', error);
    return NextResponse.json({ error: '이미지 변경 정보를 불러오지 못했습니다.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

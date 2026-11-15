// =============================================
// File: app/api/proxy/avatar/route.ts — 전체 코드 (교체용/보강)
// =============================================
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const ALLOWED_HOSTS = new Set([
  'crafatar.com',
  'crafthead.net',
  'minotar.net',
  'mc-heads.net',
]);

function isAllowed(url: URL) {
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return false;
  const host = url.hostname.toLowerCase();
  if (ALLOWED_HOSTS.has(host)) return true;
  if (host.startsWith('www.') && ALLOWED_HOSTS.has(host.slice(4))) return true;
  return false;
}

export async function GET(req: NextRequest) {
  try {
    const raw = req.nextUrl.searchParams.get('u') || '';
    if (!raw) {
      return NextResponse.json({ error: 'missing-url' }, { status: 400 });
    }

    let target: URL;
    try {
      target = new URL(raw);
    } catch {
      return NextResponse.json({ error: 'invalid-url' }, { status: 400 });
    }

    if (!isAllowed(target)) {
      return NextResponse.json({ error: 'forbidden-host' }, { status: 403 });
    }

    const upstream = await fetch(target.toString(), { redirect: 'error', signal: AbortSignal.timeout(7000) });

    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: 'upstream-failed', status: upstream.status },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get('content-type') ?? '';
    if (!/^image\/(png|jpeg|webp|gif|avif)(;|$)/i.test(contentType)) {
      await upstream.body.cancel();
      return NextResponse.json({ error: 'invalid-image-type' }, { status: 502 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'public, s-maxage=600, max-age=60',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'proxy-error' },
      { status: 500 }
    );
  }
}

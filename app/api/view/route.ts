// =============================================
// File: app/api/view/route.ts
// (전체 코드)
// - 문서 조회수 기록
// - source(category/search/link/other) 함께 집계
// - 기존 10분 쿨다운 유지
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { recordView } from '@/wiki/lib/recordView';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;

const VIEW_COOLDOWN_MINUTES = 10;
const COOKIE_NAME = 'rd_vid';

const SOURCE_VALUES = ['category', 'search', 'link', 'other'] as const;
type DocViewSource = (typeof SOURCE_VALUES)[number];

function makeVisitorId() {
  return crypto.randomUUID();
}

function noStoreHeaders() {
  return {
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  };
}

function isConnectTimeoutError(err: unknown) {
  const e = err as any;
  return (
    e?.code === 'CONNECT_TIMEOUT' ||
    e?.errno === 'CONNECT_TIMEOUT' ||
    String(e?.message ?? '').includes('CONNECT_TIMEOUT')
  );
}

function normalizeSource(raw: unknown): DocViewSource {
  const value = String(raw ?? '').trim();
  return SOURCE_VALUES.includes(value as DocViewSource)
    ? (value as DocViewSource)
    : 'other';
}

export async function POST(req: NextRequest) {
  let body: any = null;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_json' },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  const documentId = Number(body?.documentId);
  const source = normalizeSource(body?.source);

  if (!Number.isSafeInteger(documentId) || documentId <= 0) {
    return NextResponse.json(
      { ok: false, error: 'invalid_documentId' },
      { status: 400, headers: noStoreHeaders() }
    );
  }

  let visitorId = req.cookies.get(COOKIE_NAME)?.value;
  let shouldSetCookie = false;

  if (!visitorId) {
    visitorId = makeVisitorId();
    shouldSetCookie = true;
  }

  if (process.env.DISABLE_VIEW_TRACKING === '1') {
    const res = NextResponse.json(
      {
        ok: true,
        counted: false,
        skipped: 'disabled',
        source,
        cooldownMinutes: VIEW_COOLDOWN_MINUTES,
      },
      { headers: noStoreHeaders() }
    );

    if (shouldSetCookie) {
      res.cookies.set(COOKIE_NAME, visitorId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return res;
  }

  try {
    const recorded = await recordView('document', documentId, visitorId, source);
    if (!recorded.exists) {
      return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404, headers: noStoreHeaders() });
    }
    const withinCooldown = !recorded.counted;

    const res = NextResponse.json(
      {
        ok: true,
        counted: !withinCooldown,
        source,
        cooldownMinutes: VIEW_COOLDOWN_MINUTES,
      },
      { headers: noStoreHeaders() }
    );

    if (shouldSetCookie) {
      res.cookies.set(COOKIE_NAME, visitorId, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }

    return res;
  } catch (err) {
    if (isConnectTimeoutError(err)) {
      console.warn('[view] DB timeout, skipping tracking');

      const res = NextResponse.json(
        {
          ok: true,
          counted: false,
          skipped: 'db_timeout',
          source,
          cooldownMinutes: VIEW_COOLDOWN_MINUTES,
        },
        { headers: noStoreHeaders() }
      );

      if (shouldSetCookie) {
        res.cookies.set(COOKIE_NAME, visitorId, {
          httpOnly: true,
          sameSite: 'lax',
          secure: process.env.NODE_ENV === 'production',
          path: '/',
          maxAge: 60 * 60 * 24 * 365,
        });
      }

      return res;
    }

    console.error('[view] unexpected error:', err);

    return NextResponse.json(
      { ok: false, error: 'server_error' },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
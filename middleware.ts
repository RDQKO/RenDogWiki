// =============================================
// File: middleware.ts
// 전체 코드 - 새 파일
//
// - NPC/퀘스트/머리찾기/마을 DELETE 요청의 비밀번호 검증
// - 기존 API 권한 검사는 그대로 유지하고 삭제 비밀번호만 추가 검증
// - MANAGE_DELETE_PASSWORD 환경변수가 없으면 1290 사용
// =============================================

import {
  NextResponse,
  type NextRequest,
} from 'next/server';

const DELETE_PASSWORD_HEADER =
  'x-rdwiki-delete-password';

export function middleware(
  request: NextRequest,
) {
  if (
    request.method !== 'DELETE'
  ) {
    return NextResponse.next();
  }

  const expectedPassword =
    process.env.MANAGE_DELETE_PASSWORD ??
    '1290';

  const submittedPassword =
    request.headers.get(
      DELETE_PASSWORD_HEADER,
    );

  if (
    submittedPassword !==
    expectedPassword
  ) {
    return NextResponse.json(
      {
        error:
          '삭제 비밀번호가 올바르지 않습니다.',
      },
      {
        status: 401,
        headers: {
          'Cache-Control':
            'no-store, max-age=0',
        },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/api/npcs/:path*',
    '/api/head/:path*',
    '/api/villages/:path*',
  ],
};

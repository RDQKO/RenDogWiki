// =============================================
// File: app/verify/[token]/page.tsx
// =============================================
/**
 * 이메일 인증 페이지 (동적 라우트)
 * - [token] URL 파라미터로 인증 API 호출
 * - 성공/실패/로딩 상태 관리 및 메시지
 * - 성공 시 3초 후 /login 자동 이동
 */

'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function VerifyPage() {
  const params = useParams<{ token: string }>();
  // 인증 상태: 로딩/성공/실패
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const router = useRouter();

  /**
   * mount 또는 토큰 변경 시 인증 시도
   * - /api/verify/[token] GET
   * - 성공: 3초 후 /login 이동
   * - 실패: 에러 메시지 노출
   */
  useEffect(() => {
    const verify = async () => {
      const res = await fetch(`/api/verify/${params.token}`);
      const data = await res.json();

      if (res.ok) {
        setStatus('success');
        setMessage(data.message || '인증 성공!');
        setTimeout(() => router.push('/login'), 3000);
      } else {
        setStatus('error');
        setMessage(data.error || '인증 실패');
      }
    };
    verify();
  }, [params.token, router]);

  // --- UI ---
  return (
    <div className="min-h-screen bg-zinc-900 text-white flex flex-col justify-center items-center">
      <h1 className="text-2xl font-bold mb-4">이메일 인증</h1>
      {status === 'loading' && <p>처리 중입니다...</p>}
      {status !== 'loading' && <p>{message}</p>}
      {status === 'success' && (
        <p className="mt-2 text-sm text-gray-400">
          (잠시 후 로그인 페이지로 이동합니다)
        </p>
      )}
    </div>
  );
}

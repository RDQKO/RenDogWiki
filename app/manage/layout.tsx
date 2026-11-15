'use client';

import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';
import { ModalCard } from '@/components/common/Modal';

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { loading, hydrated, canWrite, loggedIn, degraded, refreshAuth } = useAuth();
  if (loading || !hydrated) return null;
  if (canWrite) return <>{children}</>;
  const close = () => router.replace('/wiki');
  return <ModalCard open title="관리 페이지 접근 안내" onClose={close}
    actions={degraded
      ? <><button type="button" className="rd-btn secondary" onClick={close}>위키로 이동</button><button type="button" className="rd-btn primary" onClick={() => void refreshAuth({ force: true })}>다시 확인</button></>
      : <button type="button" className="rd-btn primary" onClick={close}>확인</button>}>
    <p>{degraded ? '서버 연결 문제로 권한을 확인하지 못했습니다. 다시 확인해주세요.' : loggedIn ? '권한이 없습니다. 관리자에게 문의해주세요.' : '로그인이 필요합니다.'}</p>
  </ModalCard>;
}

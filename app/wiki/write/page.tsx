'use client';
// =============================================
// File: app/wiki/write/page.tsx
// =============================================
/**
 * 위키 문서 작성/수정 페이지
 * - path, title 기준 문서 생성/수정 모드 구분
 * - 문서 데이터 로드 후 SlateEditor에 전달
 * - /wiki/write?path=카테고리경로&title=문서제목 형식으로 진입
 */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from 'next/navigation';
import SlateEditor from '@/components/editor/SlateEditor';
import type { Descendant } from 'slate';
import WikiHeader from "@/components/common/Header";

const EMPTY_DOC: Descendant[] = [{ type: 'paragraph', children: [{ text: '' }] }];

type DocType = {
  id?: number;
  updated_at?: string;
  title: string;
  path: string;
  icon: string;
  tags: string[];
  content: Descendant[];
};

function WritePageInner() {
  const searchParams = useSearchParams();
  const path = searchParams.get('path') || '';
  const title = searchParams.get('title') || '';
  const id = Number(searchParams.get('id')) || undefined;
  const main = searchParams.get('main') === '1';

  const [doc, setDoc] = useState<DocType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setDoc(null);
    if (!path) { setLoading(false); return () => controller.abort(); }
    if (id) {
      fetch(`/api/documents?id=${id}&fresh=1`, { cache: 'no-store', signal: controller.signal })
        .then(async (res) => {
          if (!res.ok || res.status === 204) throw new Error('문서를 불러오지 못했습니다. 다시 열어주세요.');
          const data = await res.json();
          if (!data || Number(data.id) !== id || !Array.isArray(data.content)) throw new Error('문서 데이터가 올바르지 않습니다.');
          if (controller.signal.aborted) return;
          setDoc({ id: data.id, updated_at: data.updated_at, title: data.title, path: String(data.path ?? path),
            icon: data.icon ?? '', tags: Array.isArray(data.tags) ? data.tags : [],
            content: data.content.length ? data.content : EMPTY_DOC });
        })
        .catch((err) => { if (!controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    } else {
      setDoc({ title: title || '', path, icon: '', tags: [], content: EMPTY_DOC });
      setLoading(false);
    }
    return () => controller.abort();
  }, [path, title, id]);

  if (loading) return <div>불러오는 중...</div>;
  if (error) return <div role="alert">{error}</div>;
  if (!path) return <div>잘못된 접근입니다.</div>;

  return (
    <main className="wiki-editor-page">
      <SlateEditor key={`${id ?? 'new'}:${path}`} initialDoc={doc} isMain={main} />
    </main>
  );
}

// SSR/클라이언트 모두 대응 (헤더에 user 정보 필요시)
export default function WritePage() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch('/api/auth/me')
      .then(res => res.ok ? res.json() : null)
      .then(data => setUser(data?.user ?? null));
  }, []);
  return (
    <Suspense>
      <WikiHeader user={user} />
      <WritePageInner />
    </Suspense>
  );
}

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

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }

    // 수정 모드: path, title, id가 모두 있는 경우
    if (path && title && id) {
      fetch(`/api/documents?path=${encodeURIComponent(path)}&title=${encodeURIComponent(title)}`)
        .then(res => res.status === 204 ? null : res.json())
        .then(data => {
          setDoc({
            id: data?.id ?? id,
            title: data?.title ?? title,
            path: data?.path ?? path,
            icon: data?.icon ?? '',
            tags: Array.isArray(data?.tags) ? data.tags : [],
            content: Array.isArray(data?.content) && data.content.length > 0 ? data.content : EMPTY_DOC,
          });
          setLoading(false);
        });
      return;
    }

    // 신규/대표문서 모드: title이 없는 경우
    setDoc({
      id,
      title: '',
      path,
      icon: '',
      tags: [],
      content: EMPTY_DOC,
    });
    setLoading(false);
  }, [path, title, id]);

  if (loading) return <div>불러오는 중...</div>;
  if (!path) return <div>잘못된 접근입니다.</div>;

  return (
    <main className="wiki-editor-page">
      <SlateEditor initialDoc={doc} isMain={main} />
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

// =============================================
// File: app/manage/template.tsx
// 전체 코드 - 새 파일
//
// - 관리 페이지 공통 보조 기능을 마운트
// - NPC/퀘스트/머리찾기 관리 페이지 전용 디자인 CSS 로드
// - 각 관리 페이지의 기존 컴포넌트와 상태/API 로직은 변경하지 않음
// =============================================

import type { ReactNode } from 'react';

import ManageEntityEnhancer from '@/components/manager/ManageEntityEnhancer';
import '@/wiki/css/manage-entity-refresh.css';

type Props = {
  children: ReactNode;
};

export default function ManageTemplate({
  children,
}: Props) {
  return (
    <>
      <ManageEntityEnhancer />
      {children}
    </>
  );
}

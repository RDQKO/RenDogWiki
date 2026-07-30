// =============================================
// File: app/components/editor/HeadingIconSelectModal.tsx
// =============================================
'use client';

/**
 * Heading(제목) 아이콘 선택 모달
 * - 이모지(텍스트) 또는 이미지(URL) 중 하나를 선택해 heading 아이콘으로 지정
 * - 이미지 선택은 하위 ImageSelectModal에서 처리
 * - 접근성: role="dialog", aria-modal, aria-labelledby, 포커스 트랩/ESC 닫기
 */

import React, { useEffect, useId, useRef, useState } from 'react';
import ImageSelectModal from '@/components/image/ImageSelectModal';

type Props = {
  open: boolean;
  onClose: () => void;
  onSubmit: (icon: string) => void; // 이모지나 이미지 URL을 아이콘으로 반환
};

export default function HeadingIconSelectModal({ open, onClose, onSubmit }: Props) {
  const [emoji, setEmoji] = useState('');
  const [imgModalOpen, setImgModalOpen] = useState(false);

  // 접근성 ID 및 포커스 대상 refs
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const imgBtnRef = useRef<HTMLButtonElement | null>(null);
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);
  const applyBtnRef = useRef<HTMLButtonElement | null>(null);

  // 모달 내 포커스 가능한 요소 순환(간단 트랩)
  const focusables = [inputRef, imgBtnRef, cancelBtnRef, applyBtnRef];

  // 이모지 입력 후 적용
  const handleSubmit = () => {
    const icon = emoji.trim();
    if (icon) {
      onSubmit(icon);
      onClose();
    }
  };

  // 오픈 시 입력창 포커스, ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 0);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  if (!open) return null; // 모달 비활성 시 렌더링 없음

  return (
    <div
      ref={overlayRef}
      style={{
        position: 'fixed',
        left: 0, top: 0, right: 0, bottom: 0, zIndex: 1200,
        background: 'var(--editor-overlay)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          color: 'var(--editor-text)',
          background: 'var(--editor-panel-elevated)',
          border: '1px solid var(--editor-border)',
          borderRadius: 12,
          padding: 30,
          minWidth: 320,
          minHeight: 120,
          boxShadow: 'var(--editor-shadow)',
          position: 'relative',
        }}
        // 배경 클릭 닫힘 방지
        onClick={e => e.stopPropagation()}
        // 키보드 탭 순환(간단 트랩)
        onKeyDown={(e) => {
          if (e.key !== 'Tab') return;

          // 1) null 제거 + 버튼/인풋만 유지 (타입 가드: HTMLButtonElement | HTMLInputElement)
          const candidates = focusables
            .map(r => r.current)
            .filter(
              (el): el is HTMLButtonElement | HTMLInputElement => !!el
            );

          // 2) disabled 제외
          const enabled = candidates.filter(el => !el.disabled);
          if (enabled.length === 0) return;

          const current = document.activeElement as
            | HTMLButtonElement
            | HTMLInputElement
            | null;

          const idx = enabled.indexOf(current as HTMLButtonElement | HTMLInputElement);

          e.preventDefault();
          if (e.shiftKey) {
            const prev =
              idx <= 0 ? enabled[enabled.length - 1] : enabled[idx - 1];
            prev?.focus();
          } else {
            const next =
              idx === -1 || idx === enabled.length - 1
                ? enabled[0]
                : enabled[idx + 1];
            next?.focus();
          }
        }}
      >
        <h3 id={titleId} style={{ marginBottom: 18 }}>제목 아이콘 선택</h3>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input
            ref={inputRef}
            style={{ fontSize: 28, width: 48, textAlign: 'center' }}
            placeholder="🟡"
            maxLength={2}
            value={emoji}
            onChange={e => setEmoji(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (emoji.trim()) handleSubmit();
              }
            }}
            aria-label="이모지 입력"
          />
          <span style={{ fontSize: 14, color: 'var(--editor-muted)' }}>또는</span>
          <button
            ref={imgBtnRef}
            type="button"
            aria-label="이미지로 아이콘 선택"
            style={{
              padding: '4px 18px',
              color: 'var(--editor-text)',
              border: '1px solid var(--editor-border)',
              borderRadius: 6,
              background: 'var(--editor-panel)',
              cursor: 'pointer',
              fontSize: 17,
            }}
            onClick={() => setImgModalOpen(true)}
          >
            이미지 선택
          </button>
        </div>

        <div style={{ marginTop: 22, textAlign: 'right' }}>
          <button
            ref={cancelBtnRef}
            type="button"
            style={{
              background: 'var(--editor-panel-soft)',
              color: 'var(--editor-text)',
              border: '1px solid var(--editor-border)',
              padding: '7px 22px',
              borderRadius: 8,
              fontSize: 15,
              marginRight: 10,
              cursor: 'pointer',
            }}
            onClick={onClose}
          >
            취소
          </button>
          <button
            ref={applyBtnRef}
            type="button"
            style={{
              background: 'var(--editor-accent)',
              color: '#fff',
              padding: '7px 22px',
              border: '1px solid var(--editor-accent)',
              borderRadius: 8,
              fontSize: 15,
              cursor: emoji.trim() ? 'pointer' : 'not-allowed',
              opacity: emoji.trim() ? 1 : 0.6,
            }}
            onClick={handleSubmit}
            disabled={!emoji.trim()}
            aria-disabled={!emoji.trim()}
          >
            적용
          </button>
        </div>

        {/* 이미지 선택 모달 */}
        <ImageSelectModal
          open={imgModalOpen}
          onClose={() => setImgModalOpen(false)}
          onSelectImage={url => {
            onSubmit(url); // 이미지 URL을 아이콘으로 사용
            setImgModalOpen(false);
            onClose();
          }}
        />
      </div>
    </div>
  );
}

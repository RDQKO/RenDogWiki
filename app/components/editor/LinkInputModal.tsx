// =============================================
// File: app/components/editor/LinkInputModal.tsx
// =============================================

'use client';

/**
 * 외부 링크 삽입 및 기존 링크 수정 모달
 * - 1개(large) 또는 2개(small, small) 입력
 * - 카드형 모달 + 드롭다운 자동 닫힘
 * - defaultValue는 모달이 열릴 때만 초기값으로 반영
 */

import React, { useEffect, useRef, useState } from 'react';
import { ModalCard } from '@/components/common/Modal';

type LinkItem = { url: string; size: 'large' | 'small' };

type LinkInputModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (items: LinkItem[]) => void;
  /** 모달이 열릴 때만 초기값으로 사용됩니다. (열린 뒤에는 변경 무시) */
  defaultValue?: string[];
  mode?: 'insert' | 'edit';
};

// http/https 만 허용하는 간단한 검사(브라우저의 type="url"과 병행)
const isHttpUrl = (s: string) => /^https?:\/\//i.test(s.trim());
const isEditableLinkUrl = (s: string) => {
  const value = s.trim();
  return isHttpUrl(value) || /^\/wiki(?:[/?#]|$)/i.test(value);
};

export default function LinkInputModal({
  open,
  onClose,
  onSubmit,
  defaultValue = [],
  mode = 'insert',
}: LinkInputModalProps) {
  const [dualMode, setDualMode] = useState<boolean>(false);
  const [urls, setUrls] = useState<string[]>(['', '']);
  const [errors, setErrors] = useState<{ first?: string; second?: string }>({});
  const firstRef = useRef<HTMLInputElement>(null);
  const secondRef = useRef<HTMLInputElement>(null);

  // 🔧 "open"이 true로 바뀌는 순간에만 초기화 (defaultValue 의 참조 변화에 휘둘리지 않음)
  useEffect(() => {
    if (!open) return;
    const [u1 = '', u2 = ''] = defaultValue;
    setDualMode(mode === 'insert' && !!u2);
    setUrls([u1, u2]);
    setErrors({});
    const t = setTimeout(() => firstRef.current?.focus(), 60);

    // 툴바 드롭다운 닫기
    window.dispatchEvent(new CustomEvent('editor:close-dropdowns'));
    return () => clearTimeout(t);
    // 모달을 새로 열거나 삽입/수정 모드가 바뀔 때 입력값을 초기화한다.
  }, [open, mode]);

  const isEditMode = mode === 'edit';

  // URL 유효성
  const valid1 = urls[0].trim()
    ? isEditMode
      ? isEditableLinkUrl(urls[0])
      : isHttpUrl(urls[0])
    : false;
  const valid2 = dualMode ? (urls[1].trim() ? isHttpUrl(urls[1]) : false) : true;

  const canSubmit =
    (dualMode && valid1 && valid2) ||
    (!dualMode && valid1);

  const handleSubmit = () => {
    if (!canSubmit) {
      setErrors({
        first: !valid1
          ? isEditMode
            ? 'http(s) 주소 또는 /wiki 내부 주소를 입력하세요.'
            : 'http(s)로 시작하는 올바른 URL을 입력하세요.'
          : undefined,
        second: dualMode && !valid2 ? 'http(s)로 시작하는 올바른 URL을 입력하세요.' : undefined,
      });
      return;
    }
    if (dualMode) {
      onSubmit([
        { url: urls[0].trim(), size: 'small' },
        { url: urls[1].trim(), size: 'small' },
      ]);
    } else {
      onSubmit([{ url: urls[0].trim(), size: 'large' }]);
    }
    onClose();
  };

  // Escape로 닫기(모달 내에서만)
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as any);
  }, [open, onClose]);

  return (
    <ModalCard
      open={open}
      onClose={onClose}
      title={isEditMode ? '링크 수정' : '외부 링크 삽입'}
      width={560}
      actions={
        <>
          <button className="rd-btn secondary" onClick={onClose}>취소</button>
          <button className="rd-btn primary" onClick={handleSubmit} disabled={!canSubmit}>
            {isEditMode ? '수정' : '삽입'}
          </button>
        </>
      }
    >
      {/* 1개 / 2개 토글 */}
      {isEditMode ? (
        <div
          style={{
            margin: '6px 0 12px',
            color: 'var(--editor-muted)',
            fontSize: 13,
          }}
        >
          선택한 링크의 주소를 변경합니다.
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '6px 0 12px' }}>
          <button
            type="button"
            onClick={() => setDualMode(false)}
            className="rd-btn"
            style={{
              height: 36, minWidth: 72, borderRadius: 999,
              background: !dualMode
                ? 'var(--editor-accent)'
                : 'var(--editor-panel-soft)',
              color: !dualMode ? '#fff' : 'var(--editor-muted)',
              border: !dualMode
                ? '1px solid var(--editor-accent)'
                : '1px solid var(--editor-border)',
              fontWeight: 800,
            }}
            aria-pressed={!dualMode}
            aria-label="링크 1개 모드"
          >1개</button>
          <button
            type="button"
            onClick={() => setDualMode(true)}
            className="rd-btn"
            style={{
              height: 36, minWidth: 72, borderRadius: 999,
              background: dualMode
                ? 'var(--editor-accent)'
                : 'var(--editor-panel-soft)',
              color: dualMode ? '#fff' : 'var(--editor-muted)',
              border: dualMode
                ? '1px solid var(--editor-accent)'
                : '1px solid var(--editor-border)',
              fontWeight: 800,
            }}
            aria-pressed={dualMode}
            aria-label="링크 2개 모드"
          >2개</button>
          <div style={{ marginLeft: 'auto', color: 'var(--editor-muted)', fontSize: 13 }}>
            1개는 큰 카드, 2개는 두 칸 카드로 삽입됩니다.
          </div>
        </div>
      )}

      {/* URL 입력 */}
      <div style={{ display: 'grid', gap: 10 }}>
        <input
          ref={firstRef}
          className="rd-input"
          type="url"
          placeholder="https://example.com"
          value={urls[0]}
          onChange={(e) => {
            const v = e.target.value;
            setUrls(prev => [v, prev[1]]);
            if (errors.first) setErrors(prev => ({ ...prev, first: undefined }));
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (dualMode) {
                e.preventDefault();
                secondRef.current?.focus();
              } else {
                e.preventDefault();
                handleSubmit();
              }
            }
          }}
          // ARIA: 값이 있고 유효하지 않으면 true, 아니면 undefined(속성 미지정)
          aria-invalid={urls[0] ? (!valid1 ? true : undefined) : undefined}
        />
        {errors.first && (
          <p className="rd-card-description" style={{ color: '#d32f2f', marginTop: -6 }}>
            {errors.first}
          </p>
        )}

        {dualMode && (
          <>
            <input
              ref={secondRef}
              className="rd-input"
              type="url"
              placeholder="두 번째 링크 (https://...)"
              value={urls[1]}
              onChange={(e) => {
                const v = e.target.value;
                setUrls(prev => [prev[0], v]);
                if (errors.second) setErrors(prev => ({ ...prev, second: undefined }));
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              aria-invalid={urls[1] ? (!valid2 ? true : undefined) : undefined}
            />
            {errors.second && (
              <p className="rd-card-description" style={{ color: '#d32f2f', marginTop: -6 }}>
                {errors.second}
              </p>
            )}
          </>
        )}
      </div>
    </ModalCard>
  );
}

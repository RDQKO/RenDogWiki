// =============================================
// File: app/components/editor/PriceTableInsertModal.tsx  (전체 코드)
// =============================================
'use client';

/**
 * 시세표 카드 삽입 모달 (간단 버전)
 * - 한 줄 카드 개수(1~5)만 선택
 * - 실제 아이템 선택은 카드의 이름 클릭 시 별도 모달(PriceItemSelectModal)에서 처리
 */

import React, { useEffect, useState } from 'react';
import { ModalCard } from '@/components/common/Modal';

type Props = {
  open: boolean;
  onClose: () => void;
  onInsert: (cardsPerRow: number) => void; // ✅ 예전처럼 유지
};

const MIN = 1;
const MAX = 5;

function clamp(n: number) {
  return Math.min(MAX, Math.max(MIN, n));
}

export default function PriceTableInsertModal({ open, onClose, onInsert }: Props) {
  const [count, setCount] = useState(3);

  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent('editor:close-dropdowns'));
  }, [open]);

  const handleInsert = () => {
    onInsert(clamp(count));
  };

  const onModalKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleInsert();
    }
  };

  return (
    <ModalCard
      open={open}
      onClose={onClose}
      title="시세표 카드 삽입"
      width={520}
      actions={
        <>
          <button className="rd-btn secondary" onClick={onClose}>
            취소
          </button>
          <button className="rd-btn primary" onClick={handleInsert}>
            삽입
          </button>
        </>
      }
    >
      <div onKeyDown={onModalKeyDown}>
        <div style={{ fontSize: 14, color: 'var(--editor-muted)', marginBottom: 12 }}>
          한 줄에 표시할 카드 개수만 정하세요. <br />
          아이템 선택은 <b>삽입 후 카드의 이름을 클릭</b>해서 진행합니다.
        </div>

        <div role="group" aria-label="카드 개수 선택" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {[1, 2, 3, 4, 5].map((v) => (
            <button
              key={v}
              type="button"
              className="rd-btn"
              onClick={() => setCount(v)}
              aria-pressed={count === v}
              style={{
                minWidth: 56,
                height: 36,
                borderRadius: 10,
                background: count === v
                  ? 'var(--editor-accent)'
                  : 'var(--editor-panel-soft)',
                color: count === v ? '#fff' : 'var(--editor-muted)',
                border: count === v
                  ? '1px solid var(--editor-accent)'
                  : '1px solid var(--editor-border)',
                fontWeight: 900,
              }}
            >
              {v}개
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--editor-muted-soft)' }}>
          • 삽입 후 각 카드의 이름을 눌러 아이템을 검색/선택하세요.
        </div>
      </div>
    </ModalCard>
  );
}

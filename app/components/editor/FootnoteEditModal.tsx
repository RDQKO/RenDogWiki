// =============================================
// File: app/components/editor/FootnoteEditModal.tsx
// (전체 코드)
// =============================================

'use client';

import React, { useEffect, useState } from 'react';
import { ModalCard } from '@/components/common/Modal';
import type { FootnoteElement } from '@/types/slate';

type Props = {
  open: boolean;
  item: Pick<FootnoteElement, 'label' | 'content'>;
  onClose: () => void;
  onSave: (next: { label: string; content: string }) => void;
  onDelete: () => void;
};

export default function FootnoteEditModal({
  open,
  item,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const [label, setLabel] = useState(item.label ?? '각주');
  const [content, setContent] = useState(item.content ?? '');

  useEffect(() => {
    if (!open) return;
    setLabel(item.label ?? '각주');
    setContent(item.content ?? '');
  }, [open, item]);

  const handleSave = () => {
    onSave({
      label: label.trim() || '각주',
      content,
    });
  };

  return (
    <ModalCard
      open={open}
      onClose={onClose}
      title="각주 설정"
      width={520}
      actions={
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            width: '100%',
          }}
        >
          <button
            type="button"
            onClick={onDelete}
            style={{
              border: '1px solid var(--editor-danger)',
              background: 'var(--editor-panel-elevated)',
              color: 'var(--editor-danger)',
              borderRadius: 10,
              padding: '10px 14px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            삭제
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                border: '1px solid var(--editor-border)',
                background: 'var(--editor-panel-soft)',
                color: 'var(--editor-text)',
                borderRadius: 10,
                padding: '10px 14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              취소
            </button>

            <button
              type="button"
              onClick={handleSave}
              style={{
                border: '1px solid var(--editor-accent)',
                background: 'var(--editor-accent)',
                color: '#fff',
                borderRadius: 10,
                padding: '10px 14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              저장
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 800, color: 'var(--editor-text)' }}>
            각주 이름
          </label>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder=""
            maxLength={30}
            style={{
              width: '100%',
              height: 42,
              borderRadius: 10,
              color: 'var(--editor-text)',
              background: 'var(--editor-panel)',
              border: '1px solid var(--editor-border)',
              padding: '0 12px',
              fontSize: 14,
              outline: 'none',
            }}
          />
        </div>

        <div style={{ display: 'grid', gap: 6 }}>
          <label style={{ fontSize: 14, fontWeight: 800, color: 'var(--editor-text)' }}>
            설명
          </label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder=""
            rows={6}
            style={{
              width: '100%',
              borderRadius: 10,
              color: 'var(--editor-text)',
              background: 'var(--editor-panel)',
              border: '1px solid var(--editor-border)',
              padding: '12px',
              fontSize: 14,
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </div>
      </div>
    </ModalCard>
  );
}

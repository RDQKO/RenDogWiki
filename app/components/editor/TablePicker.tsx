// C:\next\rdwiki\app\components\editor\TablePicker.tsx
// =============================================
// 10x10(기본) 테이블 그리드 선택 팝오버
// - maxRows / maxCols 로 조절 가능
// - body 포탈, 화면 가장자리 자동 뒤집기 + 클램프
// - 🔍 기존 대비 약 1.5배 크게 확대
// =============================================

'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

type Props = {
  anchor: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onPick: (rows: number, cols: number) => void;
  /** 선택 가능한 최대 행 수 (기본 10) */
  maxRows?: number;
  /** 선택 가능한 최대 열 수 (기본 10) */
  maxCols?: number;
};

export default function TablePicker({
  anchor,
  open,
  onClose,
  onPick,
  maxRows = 10,
  maxCols = 10,
}: Props) {
  const [hover, setHover] = useState<[number, number] | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  // 📏 셀/패딩 크기 (기존 24 / 14 기준 약 1.5배)
  const CELL = 36; // px (24 * 1.5)
  const PAD = 21; // px (14 * 1.5 정도)

  // 위치 계산 (오른쪽/아래 오버플로우 시 자동 뒤집기 & 클램프)
  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = PAD * 2 + CELL * maxCols;
    const height = PAD * 2 + CELL * maxRows + 26; // caption 약간 키움

    let left = rect.left;
    let top = rect.bottom + 6;

    // 우측 오버플로우면 왼쪽으로 붙임
    if (left + width > window.innerWidth - 8) {
      left = Math.max(8, rect.right - width);
    }
    // 하단 오버플로우면 위로 붙임
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - height - 6);
    }

    setPos({ top, left });

    // 렌더 후 실제 크기 기준 마지막 클램프 (폰트/스케일 영향 대비)
    requestAnimationFrame(() => {
      const box = popRef.current?.getBoundingClientRect();
      if (!box) return;
      let finalLeft = left;
      let finalTop = top;
      if (finalLeft + box.width > window.innerWidth - 8) {
        finalLeft = Math.max(8, window.innerWidth - 8 - box.width);
      }
      if (finalTop + box.height > window.innerHeight - 8) {
        finalTop = Math.max(8, window.innerHeight - 8 - box.height);
      }
      if (finalLeft !== left || finalTop !== top) {
        setPos({ top: finalTop, left: finalLeft });
      }
    });
  }, [open, anchor, maxRows, maxCols, CELL, PAD]);

  // 외부 클릭/ESC로 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!popRef.current) return;
      if (e.target instanceof Node && popRef.current.contains(e.target)) return;
      if (anchor && anchor.contains(e.target as Node)) return;
      onClose();
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    addEventListener('mousedown', onDown);
    addEventListener('keydown', onEsc);
    return () => {
      removeEventListener('mousedown', onDown);
      removeEventListener('keydown', onEsc);
    };
  }, [open, anchor, onClose]);

  const grid = useMemo(
    () =>
      Array.from({ length: maxRows }, (_, r) =>
        Array.from(
          { length: maxCols },
          (_, c) => [r + 1, c + 1] as [number, number],
        ),
      ),
    [maxRows, maxCols],
  );

  if (!open) return null;

  return createPortal(
    <div
      ref={popRef}
      className="table-picker-popover"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        // 전체 스케일이 커졌으니 살짝 여유 padding
        padding: PAD,
        background: 'var(--editor-panel-elevated)',
        borderRadius: 10,
        boxShadow: 'var(--editor-shadow)',
        border: '1px solid var(--editor-border)',
        zIndex: 99999,
      }}
      role="dialog"
      aria-label="표 크기 선택"
    >
      <div
        className="table-picker-grid"
        style={{
          display: 'inline-flex',
          flexDirection: 'column',
          gap: 4,
        }}
      >
        {grid.map((row, r) => (
          <div
            key={r}
            className="table-picker-row"
            style={{ display: 'flex', gap: 4 }}
          >
            {row.map(([rr, cc]) => {
              const sel = hover && rr <= hover[0] && cc <= hover[1];
              return (
                <button
                  key={cc}
                  type="button"
                  className={`table-picker-cell${sel ? ' selected' : ''}`}
                  onMouseEnter={() => setHover([rr, cc])}
                  onClick={() => {
                    onPick(rr, cc);
                    onClose();
                  }}
                  aria-label={`${rr} x ${cc}`}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 4,
                    border: sel
                      ? '2px solid var(--editor-accent)'
                      : '1px solid var(--editor-border)',
                    background: sel
                      ? 'var(--editor-accent-soft)'
                      : 'var(--editor-panel-soft)',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div
        className="table-picker-caption"
        style={{
          marginTop: 10,
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--editor-muted)',
          fontWeight: 500,
        }}
      >
        {hover ? `${hover[0]} × ${hover[1]}` : '1 × 1'}
      </div>
    </div>,
    document.body,
  );
}

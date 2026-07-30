// =============================================
// File: app/components/editor/ImageSizeModal.tsx
// (체인 토글 + 선행 0 제거 UX 개선)
// =============================================

'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ModalCard } from '@/components/common/Modal';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLink, faLinkSlash } from '@fortawesome/free-solid-svg-icons';

type Props = {
  open: boolean;
  width?: number;
  height?: number;
  onSave: (w: number, h: number) => void;
  onClose: () => void;
};

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));

/** 숫자만 허용 + 선행 0 제거(단, 빈 문자열은 허용) */
function sanitizeNumeric(raw: string) {
  let s = raw.replace(/[^\d]/g, '');
  // "0", "00"처럼 0만 있는 건 그대로 두고, 숫자가 더 있으면 선행 0 제거
  s = s.replace(/^0+(?=\d)/, '');
  return s;
}

export default function ImageSizeModal({ open, width, height, onSave, onClose }: Props) {
  // 표시용 문자열(빈 문자열 허용) + 숫자 상태(계산용, null 허용)
  const [wText, setWText] = useState<string>('256');
  const [hText, setHText] = useState<string>('256');
  const [wNum, setWNum] = useState<number | null>(256);
  const [hNum, setHNum] = useState<number | null>(256);

  // 비율 잠금
  const [keepRatio, setKeepRatio] = useState(false);
  const [ratio, setRatio] = useState(1); // w/h

  /** 모달 열릴 때 props로 초기화 */
  useEffect(() => {
    if (!open) return;

    const initW = typeof width === 'number' && width > 0 ? width : 256;
    const initH = typeof height === 'number' && height > 0 ? height : 256;

    setWText(String(initW));
    setHText(String(initH));
    setWNum(initW);
    setHNum(initH);
    setRatio(initH ? initW / initH : 1);

    window.dispatchEvent(new CustomEvent('editor:close-dropdowns'));
  }, [open, width, height]);

  /** 체인 토글 */
  const toggleKeepRatio = () => {
    // 토글 ON 시 현재 수치가 유효하면 그걸로 ratio 재설정
    if (!keepRatio) {
      if (wNum && wNum > 0 && hNum && hNum > 0) {
        setRatio(wNum / hNum);
      }
    }
    setKeepRatio(v => !v);
  };

  /** W 변경 핸들러 */
  const onChangeW = (raw: string) => {
    const s = sanitizeNumeric(raw);
    setWText(s);
    if (s === '') {
      setWNum(null);
      // 비율 잠금 중에도 상대값 자동 변경하지 않음(입력 중 빈 상태 허용)
      return;
    }
    const n = clamp(parseInt(s, 10) || 0, 1, 4096);
    setWNum(n);

    if (keepRatio) {
      const nextH = Math.max(1, Math.round(n / (ratio || 1)));
      setHNum(nextH);
      setHText(String(nextH));
    }
  };

  /** H 변경 핸들러 */
  const onChangeH = (raw: string) => {
    const s = sanitizeNumeric(raw);
    setHText(s);
    if (s === '') {
      setHNum(null);
      return;
    }
    const n = clamp(parseInt(s, 10) || 0, 1, 4096);
    setHNum(n);

    if (keepRatio) {
      const nextW = Math.max(1, Math.round(n * (ratio || 1)));
      setWNum(nextW);
      setWText(String(nextW));
    }
  };

  /** 저장 */
  const handleSave = useCallback(() => {
    // 비어 있는 경우의 합리적 보정:
    // - 잠금 상태면 한쪽 값과 비율로 다른 쪽을 유도 계산
    // - 둘 다 없으면 256 기본값
    const finalW =
      wNum && wNum > 0
        ? clamp(wNum, 1, 4096)
        : keepRatio && hNum && hNum > 0
        ? clamp(Math.round(hNum * (ratio || 1)), 1, 4096)
        : 256;

    const finalH =
      hNum && hNum > 0
        ? clamp(hNum, 1, 4096)
        : keepRatio && wNum && wNum > 0
        ? clamp(Math.round(wNum / (ratio || 1)), 1, 4096)
        : 256;

    onSave(finalW, finalH);
  }, [keepRatio, ratio, wNum, hNum, onSave]);

  const onKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <ModalCard
      open={open}
      onClose={onClose}
      title="이미지 크기 설정"
      width={420}
      actions={
        <>
          <button className="rd-btn secondary" onClick={onClose}>취소</button>
          <button className="rd-btn primary" onClick={handleSave}>저장</button>
        </>
      }
    >
      {/* W - [체인 토글] - H */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
        {/* W */}
        <div>
          <div style={{ fontSize: 13, marginBottom: 4, color: 'var(--editor-muted)' }}>
            W
          </div>
          <input
            className="rd-input"
            type="number"
            min={1}
            max={4096}
            step={1}
            value={wText}
            onChange={(e) => onChangeW(e.target.value)}
            onKeyDown={onKeyDownInput}
            placeholder="가로"
            aria-label="가로 크기"
            style={{ width: 120 }}
          />
        </div>

        {/* 체인 토글 */}
        <button
          type="button"
          aria-label={keepRatio ? '비율 고정 해제' : '비율 고정'}
          aria-pressed={keepRatio}
          onClick={toggleKeepRatio}
          title={keepRatio ? '비율 고정 해제' : '비율 고정'}
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            color: keepRatio
              ? 'var(--editor-accent-strong)'
              : 'var(--editor-muted)',
            border: keepRatio
              ? '1px solid var(--editor-accent)'
              : '1px solid var(--editor-border)',
            background: keepRatio
              ? 'var(--editor-accent-soft)'
              : 'var(--editor-panel-elevated)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            marginBottom: 2, // 입력 하단선과 정렬
          }}
        >
          <FontAwesomeIcon icon={keepRatio ? faLink : faLinkSlash} />
        </button>

        {/* H */}
        <div>
          <div style={{ fontSize: 13, marginBottom: 4, color: 'var(--editor-muted)' }}>
            H
          </div>
          <input
            className="rd-input"
            type="number"
            min={1}
            max={4096}
            step={1}
            value={hText}
            onChange={(e) => onChangeH(e.target.value)}
            onKeyDown={onKeyDownInput}
            placeholder="세로"
            aria-label="세로 크기"
            style={{ width: 120 }}
          />
        </div>
      </div>
    </ModalCard>
  );
}

// =============================================
// File: app/components/editor/CustomColorDropdown.tsx
// =============================================
'use client';

/**
 * 에디터 색상 선택 드롭다운
 * - 최근 색상/회색 스케일/고정 팔레트(12×7) + 확장 피커(react-colorful)
 * - 선택 시 onChange(hex) 호출, '지우기'는 빈 문자열 전달
 * - 접근성: 스와치 키보드(Enter/Space) 선택, aria-label 부여
 * - 입력 안전성: 수동 입력 HEX 검증/정규화(#abc → #aabbcc, 잘못된 값 무시)
 */

import React, { useMemo, useState } from 'react';
import { HexColorPicker } from 'react-colorful';

type Props = {
  value: string;
  onChange: (hex: string) => void;
  onClose: () => void;
  recentColors: string[];
  setRecentColors: React.Dispatch<React.SetStateAction<string[]>>;
  kind?: 'text' | 'background';
};

/** HSL -> HEX (#rrggbb) */
function hslToHex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (0 <= h && h < 60)       { r = c; g = x; b = 0; }
  else if (60 <= h && h < 120){ r = x; g = c; b = 0; }
  else if (120 <= h && h < 180){ r = 0; g = c; b = x; }
  else if (180 <= h && h < 240){ r = 0; g = x; b = c; }
  else if (240 <= h && h < 300){ r = x; g = 0; b = c; }
  else                         { r = c; g = 0; b = x; }
  const to255 = (n: number) => Math.round((n + m) * 255);
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(to255(r))}${toHex(to255(g))}${toHex(to255(b))}`;
}

/** 12열 × 7행 팔레트 */
function buildColorGrid(): string[][] {
  const hues = [0, 20, 35, 45, 60, 90, 120, 160, 190, 220, 260, 300];
  const lightness = [92, 84, 74, 64, 54, 44, 34];
  const s = 70;
  return lightness.map(L => hues.map(H => hslToHex(H, s, L)));
}

const GRAYS = ['#ffffff', '#f8fafc', '#f1f5f9', '#e5e7eb', '#d1d5db', '#9ca3af', '#6b7280', '#4b5563', '#374151', '#111827', '#000000'];

/** 최근 색상 최대 보관 개수 */
const MAX_RECENTS = 16;

/** HEX 정규화
 * - 허용: #rrggbb, rrggbb, #rgb, rgb
 * - 반환: #rrggbb (소문자), 실패 시 빈 문자열
 */
function toFullHex(input: string): string {
  if (!input) return '';
  let s = input.trim();
  if (!s) return '';
  if (s[0] !== '#') s = `#${s}`;
  // #rgb → #rrggbb
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s.slice(1).split('').map(ch => ch + ch).join('');
  }
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  return '';
}

/** 레이아웃 상수 */
const CELL = 14;   // 정사각 타일 한 변
const GAP  = 4;
const COLS = 12;
const PAD  = 10;
const GRID_W = COLS * CELL + (COLS - 1) * GAP; // 212
const CONTAINER_W = GRID_W + PAD * 2;          // 232

/** 모든 스와치 공통 스타일 (정사각형 유지) */
const baseSwatch: React.CSSProperties = {
  width: CELL,
  height: CELL,
  border: '1px solid var(--editor-border)',
  borderRadius: 3,
  padding: 0,
  margin: 0,
  boxSizing: 'border-box',
  display: 'inline-block',
  cursor: 'pointer',
  appearance: 'none' as any,
  WebkitAppearance: 'none' as any,
  MozAppearance: 'none' as any,
};

export default function CustomColorDropdown({
  value,
  onChange,
  onClose,
  recentColors,
  setRecentColors,
  kind = 'text'
}: Props) {
  const GRID = useMemo(buildColorGrid, []);
  const [showPicker, setShowPicker] = useState(false);
  const [hex, setHex] = useState<string>(toFullHex(value) || '#000000');

  const title = kind === 'background' ? '최근 사용한 배경색' : '최근 사용한 글자색';

  /** 스와치/입력 공통 선택 로직 */
  const select = (c: string) => {
    // 빈 문자열은 “지우기”
    if (!c) {
      onChange('');
      setHex('#000000');
      return;
    }

    const full = toFullHex(c);
    if (!full) return; // 잘못된 입력은 무시

    onChange(full);
    setRecentColors(prev => {
      const exists = new Set(prev.map(x => x.toLowerCase()));
      // 중복 제거(대소문자 무시) + 최신 우선
      const next = [full, ...prev.filter(x => !exists.has(full.toLowerCase()) )];
      return next.slice(0, MAX_RECENTS);
    });
    setHex(full);
  };

  /** 키보드 접근성: Enter/Space → 클릭과 동일 */
  const onSwatchKeyDown: React.KeyboardEventHandler<HTMLButtonElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      (e.currentTarget as HTMLButtonElement).click();
    }
  };

  return (
    <div
      className="custom-color-dropdown editor-dropdown-menu"
      style={{
        position: 'absolute',
        top: 36,
        left: 0,
        width: CONTAINER_W,
        boxSizing: 'border-box',
        background: 'var(--editor-panel-elevated)',
        border: '1px solid var(--editor-border)',
        borderRadius: 10,
        boxShadow: 'var(--editor-shadow)',
        padding: PAD,
        zIndex: 1000,
        overflow: 'hidden'
      }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div
        style={{
          marginBottom: 8,
          fontSize: 12.5,
          fontWeight: 700,
          color: 'var(--editor-muted)',
        }}
      >
        {title}
      </div>

      {/* 최근 색상 (12칸) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gap: GAP,
          marginBottom: 10,
          width: GRID_W
        }}
      >
        {recentColors.slice(0, COLS).map(c => {
          const full = toFullHex(c);
          if (!full) return null;
          return (
            <button
              key={full}
              onClick={() => select(full)}
              onKeyDown={onSwatchKeyDown}
              title={full}
              aria-label={`recent color ${full}`}
              tabIndex={0}
              style={{ ...baseSwatch, background: full }}
            />
          );
        })}
      </div>

      {/* 지우기 + Grays */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
          gap: GAP,
          width: GRID_W
        }}
      >
        <button
          onClick={() => select('')}
          onKeyDown={onSwatchKeyDown}
          title="지우기"
          aria-label="clear color"
          tabIndex={0}
          style={{
            ...baseSwatch,
            background:
              'linear-gradient(45deg, transparent 45%, #d33 45%, #d33 55%, transparent 55%), #fff'
          }}
        />
        {GRAYS.map(g => (
          <button
            key={g}
            onClick={() => select(g)}
            onKeyDown={onSwatchKeyDown}
            title={g}
            aria-label={`gray ${g}`}
            tabIndex={0}
            style={{ ...baseSwatch, background: g }}
          />
        ))}
      </div>

      {/* 12×7 컬러 그리드 */}
      <div style={{ marginTop: 8, display: 'grid', gap: GAP }}>
        {GRID.map((row, rIdx) => (
          <div
            key={rIdx}
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, ${CELL}px)`,
              gap: GAP,
              width: GRID_W
            }}
          >
            {row.map((c, i) => (
              <button
                key={`${rIdx}-${i}`}
                onClick={() => select(c)}
                onKeyDown={onSwatchKeyDown}
                title={c}
                aria-label={`palette ${c}`}
                tabIndex={0}
                style={{ ...baseSwatch, background: c }}
              />
            ))}
          </div>
        ))}
      </div>

      {/* 더보기 */}
      <button
        onClick={() => setShowPicker(v => !v)}
        aria-expanded={showPicker}
        style={{
          marginTop: 10,
          width: '100%',
          border: '1px solid var(--editor-border)',
          background: 'var(--editor-panel-soft)',
          color: 'var(--editor-muted)',
          fontWeight: 600,
          borderRadius: 8,
          padding: '6px 8px',
          cursor: 'pointer'
        }}
      >
        더보기 {showPicker ? '▲' : '▼'}
      </button>

      {showPicker && (
        <div style={{ marginTop: 10 }}>
          <HexColorPicker
            color={hex}
            onChange={(c) => { setHex(c); select(c); }}
            style={{ width: '100%', height: 180, boxSizing: 'border-box', borderRadius: 8 }}
          />
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={() => select(hex)}
              placeholder="#000000"
              spellCheck={false}
              style={{
                flex: 1,
                color: 'var(--editor-text)',
                background: 'var(--editor-panel)',
                border: '1px solid var(--editor-border)',
                borderRadius: 8,
                padding: '6px 8px',
                fontSize: 13,
                minWidth: 0
              }}
              aria-label="hex input"
            />
            <button
              onClick={() => { select(hex); onClose(); }}
              style={{
                border: '1px solid var(--editor-border)',
                background: 'var(--editor-panel-elevated)',
                borderRadius: 8,
                padding: '6px 10px',
                fontWeight: 700,
                color: 'var(--editor-accent-strong)',
                cursor: 'pointer',
                whiteSpace: 'nowrap'
              }}
            >
              적용
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

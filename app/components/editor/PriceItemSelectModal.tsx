// =============================================
// File: app/components/editor/PriceItemSelectModal.tsx  (전체 코드)
// =============================================
'use client';

/**
 * 시세 아이템 선택 모달 (단일 카드용)
 * - 이름 검색 → /api/prices/suggest
 * - 후보 선택 → /api/prices/get 로 상세 로드
 * - Enter: 후보 선택(열려있으면), Esc: 닫기, ↑↓: 이동
 * - debounce + AbortController
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ModalCard } from '@/components/common/Modal';
import type { PriceTableMode } from '@/types/slate'; // 경로가 다르면 맞춰줘

type SuggestItem = {
  id: number;
  name: string;
  name_key: string;
  mode: string;
  updated_at?: string;
  score?: number;
};

type PriceItem = {
  id: number;
  name: string;
  name_key: string;
  mode: string;
  prices: string[];
  updated_at?: string;
};

export type SelectedPriceItem = {
  id: number;
  name: string;
  name_key: string;
  mode: PriceTableMode;
  prices: string[];
};

type Props = {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  onSelect: (item: SelectedPriceItem) => void;
};

function normalizeQuery(q: string) {
  return (q ?? '').replace(/\u200B/g, '').trim();
}

export default function PriceItemSelectModal({ open, initialQuery, onClose, onSelect }: Props) {
  const [q, setQ] = useState(initialQuery ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const suggestCacheRef = useRef<Map<string, SuggestItem[]>>(new Map());
  const itemCacheRef = useRef<Map<number, SelectedPriceItem>>(new Map());
  const abortRef = useRef<AbortController | null>(null);

  // open 시 초기화
  useEffect(() => {
    if (!open) return;
    window.dispatchEvent(new CustomEvent('editor:close-dropdowns'));
    setQ(initialQuery ?? '');
    setError(null);
    setLoading(false);
    setSuggestions([]);
    setDropdownOpen(false);
    setActiveIndex(0);
  }, [open, initialQuery]);

  // suggest
  useEffect(() => {
    if (!open) return;

    const query = normalizeQuery(q);
    if (query.length < 1) {
      setSuggestions([]);
      setDropdownOpen(false);
      setActiveIndex(0);
      setError(null);
      return;
    }

    const t = window.setTimeout(async () => {
      const cacheKey = query.toLowerCase();
      if (suggestCacheRef.current.has(cacheKey)) {
        const cached = suggestCacheRef.current.get(cacheKey)!;
        setSuggestions(cached);
        setDropdownOpen(true);
        setActiveIndex(0);
        setError(null);
        return;
      }

      if (abortRef.current) abortRef.current.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const res = await fetch(`/api/prices/suggest?q=${encodeURIComponent(query)}&limit=10`, {
          method: 'GET',
          signal: ac.signal,
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`suggest failed: ${res.status}`);

        const data = await res.json();
        const items = Array.isArray(data?.items) ? (data.items as SuggestItem[]) : [];

        suggestCacheRef.current.set(cacheKey, items);
        setSuggestions(items);
        setDropdownOpen(true);
        setActiveIndex(0);
        setError(null);
      } catch (e: any) {
        if (e?.name === 'AbortError') return;
        setError('검색 실패');
        setSuggestions([]);
        setDropdownOpen(false);
        setActiveIndex(0);
      }
    }, 180);

    return () => window.clearTimeout(t);
  }, [open, q]);

  const selectSuggestion = useCallback(
    async (s: SuggestItem) => {
      // 캐시 히트
      if (itemCacheRef.current.has(s.id)) {
        onSelect(itemCacheRef.current.get(s.id)!);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/prices/get?id=${encodeURIComponent(String(s.id))}`, {
          method: 'GET',
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(`get failed: ${res.status}`);

        const data = await res.json();
        const item = data?.item as PriceItem | undefined;
        if (!item || !item.id) throw new Error('invalid payload');

        const picked: SelectedPriceItem = {
          id: item.id,
          name: item.name,
          name_key: item.name_key,
          mode: item.mode as PriceTableMode,
          prices: Array.isArray(item.prices) ? item.prices : [],
        };

        itemCacheRef.current.set(picked.id, picked);
        onSelect(picked);
      } catch {
        setError('불러오기 실패');
      } finally {
        setLoading(false);
      }
    },
    [onSelect],
  );

  const onModalKeyDown: React.KeyboardEventHandler<HTMLDivElement> = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (!dropdownOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((v) => (v + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((v) => (v - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = suggestions[Math.max(0, Math.min(activeIndex, suggestions.length - 1))];
      if (pick) selectSuggestion(pick);
    }
  };

  const helperText = useMemo(() => {
    if (loading) return '불러오는 중...';
    if (error) return error;
    return '↑↓ 이동 / Enter 선택 / Esc 닫기';
  }, [loading, error]);

  return (
    <ModalCard
      open={open}
      onClose={onClose}
      title="아이템 선택"
      width={560}
      actions={
        <>
          <button className="rd-btn secondary" onClick={onClose}>
            닫기
          </button>
        </>
      }
    >
      <div onKeyDown={onModalKeyDown}>
        <div style={{ fontSize: 13, color: 'var(--editor-muted)', marginBottom: 10 }}>
          {helperText}
        </div>

        <div style={{ position: 'relative' }}>
          <input
            className="rd-input"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setDropdownOpen(true);
              setActiveIndex(0);
              setError(null);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setDropdownOpen(true);
            }}
            placeholder="아이템 이름 입력 (자동완성)"
            autoFocus
            style={{
              width: '100%',
              height: 40,
              borderRadius: 10,
              color: 'var(--editor-text)',
              background: 'var(--editor-panel)',
              border: '1px solid var(--editor-border)',
              padding: '0 12px',
              outline: 'none',
              fontSize: 14,
              fontWeight: 700,
            }}
          />

          {dropdownOpen && suggestions.length > 0 && (
            <div
              role="listbox"
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 46,
                zIndex: 50,
                background: 'var(--editor-panel-elevated)',
                border: '1px solid var(--editor-border)',
                borderRadius: 12,
                boxShadow: '0 18px 40px rgba(15,23,42,0.10)',
                overflow: 'hidden',
              }}
            >
              {suggestions.slice(0, 10).map((s, j) => {
                const active = j === activeIndex;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onMouseEnter={() => setActiveIndex(j)}
                    onClick={() => selectSuggestion(s)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '10px 12px',
                      background: active
                        ? 'var(--editor-accent-soft)'
                        : 'var(--editor-panel-elevated)',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      gap: 12,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 900,
                          color: 'var(--editor-text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {s.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: 'var(--editor-muted)',
                          fontWeight: 700,
                        }}
                      >
                        {s.mode} · {s.name_key}
                      </div>
                    </div>

                    <div
                      style={{
                        flex: '0 0 auto',
                        fontSize: 12,
                        color: 'var(--editor-muted-soft)',
                        fontWeight: 800,
                      }}
                    >
                      #{s.id}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div style={{ height: 6 }} />
        <div style={{ fontSize: 12, color: 'var(--editor-muted-soft)' }}>
          • 선택하면 해당 카드의 형식/시세가 자동으로 채워집니다.
        </div>
      </div>
    </ModalCard>
  );
}

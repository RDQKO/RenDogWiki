// =============================================
// File: components/editor/WikiDbEmbedIdModal.tsx  (전체 코드)
// (이름 검색 → 리스트 선택 → id 반환 모달)
// - quest/npc/qna 공용
// - 검색어 입력 시 /api/wiki-embed/search 호출
// - ↑↓/Enter/Escape 지원
//
// 수정사항:
// 1) 선택 미리보기 영역 제거
// 2) NPC는 이름만 표시 (메타 제거)
// 3) 지우기 버튼 제거
// 4) ✅ 모달 최대 높이 고정 + 리스트 스크롤
// =============================================
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { WikiEmbedKind } from '../helpers/insertWikiDbEmbed';
import { toProxyUrl } from '@lib/cdn';

type Props = {
  open: boolean;
  kind: WikiEmbedKind;
  onClose: () => void;
  onSubmit: (id: number) => void;
};

type SearchItem = {
  id: number;
  title: string;
  subtitle?: string;
  icon?: string;
};

function labelOf(kind: WikiEmbedKind) {
  if (kind === 'quest') return '퀘스트';
  if (kind === 'npc') return 'NPC';
  return 'QNA';
}

export default function WikiDbEmbedIdModal({ open, kind, onClose, onSubmit }: Props) {
  const label = useMemo(() => labelOf(kind), [kind]);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const [q, setQ] = useState('');
  const [rows, setRows] = useState<SearchItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    document.body.classList.add('rd-modal-open');

    setQ('');
    setRows([]);
    setSelectedIdx(-1);
    setLoading(false);
    setError(null);

    requestAnimationFrame(() => {
      inputRef.current?.focus();
    });

    return () => {
      document.body.classList.remove('rd-modal-open');
    };
  }, [open, kind]);

  useEffect(() => {
    if (!open) return;

    const query = q.trim();
    if (!query) {
      setRows([]);
      setSelectedIdx(-1);
      return;
    }

    const controller = new AbortController();
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(
          `/api/wiki-embed/search?kind=${kind}&q=${encodeURIComponent(query)}&limit=30&ts=${Date.now()}`,
          { cache: 'no-store', signal: controller.signal }
        );

        if (!res.ok) throw new Error();

        const data = await res.json();
        const items: SearchItem[] = Array.isArray(data?.items) ? data.items : [];

        setRows(items);
        setSelectedIdx(items.length ? 0 : -1);
      } catch {
        if (!controller.signal.aborted) {
          setRows([]);
          setSelectedIdx(-1);
          setError('검색 실패');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [open, q, kind]);

  const selected = selectedIdx >= 0 ? rows[selectedIdx] : null;

  const commit = () => {
    if (!selected) return;
    onSubmit(selected.id);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(rows.length - 1, prev + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(0, prev - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      commit();
    }
  };

  // NPC는 메타 출력 금지
  const showSubtitle = kind !== 'npc';

  if (!open) return null;

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKey}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--editor-overlay)',
        zIndex: 20000,
        display: 'grid',
        placeItems: 'center',
        padding: 16,
      }}
    >
      <div
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          width: 680,
          maxWidth: '100%',
          // ✅ 화면 밖으로 커지지 않도록 상한 고정
          maxHeight: 'calc(100vh - 180px)',
          color: 'var(--editor-text)',
          background: 'var(--editor-panel-elevated)',
          borderRadius: 14,
          border: '1px solid var(--editor-border)',
          boxShadow: 'var(--editor-shadow)',
          overflow: 'hidden',
          display: 'grid',
          // ✅ 가운데(리스트)만 늘어나고, 모달은 maxHeight 안에서 멈춤
          gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
        }}
      >
        {/* header */}
        <div style={{ padding: 16, borderBottom: '1px solid var(--editor-border)' }}>
          <div style={{ fontSize: 15, fontWeight: 900 }}>{label} 검색</div>
          <div style={{ fontSize: 12.5, color: 'var(--editor-muted)', marginTop: 4 }}>
            이름으로 검색 후 선택하면 ID가 자동 입력됩니다.
          </div>
        </div>

        {/* search */}
        <div style={{ padding: 16, borderBottom: '1px solid var(--editor-border)' }}>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`${label} 이름 검색...`}
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

        {/* list (스크롤 영역) */}
        <div
          style={{
            padding: 10,
            overflowY: 'auto',
            // ✅ grid minmax(0,1fr) + overflowY 조합에서 필수
            minHeight: 0,
          }}
        >
          {!q.trim() ? (
            <div style={{ color: 'var(--editor-muted-soft)', padding: 12 }}>
              검색어를 입력하세요.
            </div>
          ) : loading ? (
            <div style={{ color: 'var(--editor-muted-soft)', padding: 12 }}>
              검색 중...
            </div>
          ) : rows.length === 0 ? (
            <div style={{ color: 'var(--editor-muted-soft)', padding: 12 }}>
              결과 없음
            </div>
          ) : (
            rows.map((r, idx) => {
              const active = idx === selectedIdx;
              return (
                <button
                  key={r.id}
                  onClick={() => setSelectedIdx(idx)}
                  onDoubleClick={commit}
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: active
                      ? '1px solid var(--editor-accent)'
                      : '1px solid var(--editor-border)',
                    background: active
                      ? 'var(--editor-accent-soft)'
                      : 'var(--editor-panel-elevated)',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 10,
                    alignItems: 'center',
                    marginBottom: 6,
                  }}
                >
                  {r.icon && (
                    <img
                      src={toProxyUrl(r.icon)}
                      width={32}
                      height={32}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      style={{ borderRadius: 8, objectFit: 'cover' }}
                    />
                  )}

                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 14,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {r.title}
                    </div>

                    {showSubtitle && r.subtitle && (
                      <div style={{ fontSize: 12, color: 'var(--editor-muted)' }}>
                        {r.subtitle}
                      </div>
                    )}
                  </div>

                  <div
                    style={{
                      marginLeft: 'auto',
                      fontSize: 12,
                      color: 'var(--editor-muted-soft)',
                    }}
                  >
                    #{r.id}
                  </div>
                </button>
              );
            })
          )}

          {error && (
            <div style={{ color: 'var(--editor-danger)', padding: 12 }}>
              {error}
            </div>
          )}
        </div>

        {/* footer */}
        <div
          style={{
            padding: 14,
            borderTop: '1px solid var(--editor-border)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 10,
              color: 'var(--editor-text)',
              border: '1px solid var(--editor-border)',
              background: 'var(--editor-panel-soft)',
              fontWeight: 700,
            }}
          >
            취소
          </button>
          <button
            onClick={commit}
            disabled={!selected}
            style={{
              height: 36,
              padding: '0 12px',
              borderRadius: 10,
              background: selected
                ? 'var(--editor-accent)'
                : 'var(--editor-panel-soft)',
              color: selected ? '#fff' : 'var(--editor-muted-soft)',
              border: selected
                ? '1px solid var(--editor-accent)'
                : '1px solid var(--editor-border)',
              fontWeight: 800,
            }}
          >
            삽입
          </button>
        </div>
      </div>
    </div>
  );
}

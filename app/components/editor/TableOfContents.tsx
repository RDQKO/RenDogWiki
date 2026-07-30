'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faAlignLeft } from '@fortawesome/free-solid-svg-icons';
import { toProxyUrl } from '@lib/cdn';

type Heading = {
  text: string;
  id: string;
  level: 1 | 2 | 3;
  icon?: string;
};

type Props = {
  headings: Heading[];
  headerOffset?: number;
  right?: number;
  top?: number;
  width?: number;
  title?: string;
  scrollRootSelector?: string;
};

export default function TableOfContents({
  headings,
  headerOffset = 72,
  top = 100,
  width = 240,
  title = '목차',
  scrollRootSelector,
}: Props) {
  const [activeId, setActiveId] = useState<string>('');
  const rootRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [rootKey, setRootKey] = useState(0); // 루트 변경 트리거 키

  // 동일 id에 발생 순번 부여
  const indexed = useMemo(() => {
    const seen: Record<string, number> = {};
    return headings.map(h => {
      const occ = seen[h.id] ?? 0;
      seen[h.id] = occ + 1;
      return { ...h, __occ: occ } as Heading & { __occ: number };
    });
  }, [headings]);

  // 스크롤 가능한 조상 자동 탐색
  const findScrollableAncestor = (el: HTMLElement | null): HTMLElement | null => {
    let cur: HTMLElement | null = el?.parentElement ?? null;
    while (cur) {
      const { overflowY } = getComputedStyle(cur);
      const canScroll = /(auto|scroll)/.test(overflowY) && cur.scrollHeight > cur.clientHeight + 1;
      if (canScroll) return cur;
      cur = cur.parentElement;
    }
    return null;
  };

  // root 결정(명시 selector > 자동 > window), 변경 시 rootKey 갱신
  useEffect(() => {
    if (scrollRootSelector) {
      rootRef.current = document.querySelector<HTMLElement>(scrollRootSelector);
      setRootKey(k => k + 1);
      return;
    }
    if (headings.length) {
      const first = document.querySelector<HTMLElement>(
        `[id="${(headings[0].id ?? '').replace(/"/g, '\\"')}"]`
      );
      rootRef.current = findScrollableAncestor(first) || null;
      setRootKey(k => k + 1);
    } else {
      rootRef.current = null;
      setRootKey(k => k + 1);
    }
  }, [scrollRootSelector, headings]);

  const getRootForObserver = () => rootRef.current ?? null;

  // 타겟 찾기(동일 id의 n번째)
  const getTarget = (id: string, occ: number) => {
    const esc = id.replace(/"/g, '\\"');
    const list = document.querySelectorAll<HTMLElement>(`[id="${esc}"]`);
    return list[occ] ?? list[0] ?? null;
  };

  // 컨테이너 기준 스무스 스크롤(별도 상태 저장 없음)
  const scrollToId = (id: string, occ: number) => {
    const target = getTarget(id, occ);
    if (!target) return;

    const root = rootRef.current;
    if (!root) {
      const y = target.getBoundingClientRect().top + window.scrollY - headerOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    } else {
      const y =
        target.getBoundingClientRect().top -
        root.getBoundingClientRect().top +
        root.scrollTop -
        headerOffset;
      root.scrollTo({ top: y, behavior: 'smooth' });
    }
    try { history.replaceState(null, '', `#${id}`); } catch {}
    try { window.dispatchEvent(new CustomEvent('editor:toc-jump', { detail: { id, occ } })); } catch {}
  };

  // 스크롤 스파이(컨테이너 기준)
  useEffect(() => {
    if (!indexed.length) return;

    observerRef.current?.disconnect();
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter(e => e.isIntersecting)
          .sort((a, b) => (a.boundingClientRect.top > b.boundingClientRect.top ? 1 : -1));
        if (visible[0]) setActiveId((visible[0].target as HTMLElement).id);
      },
      {
        root: getRootForObserver(),
        rootMargin: `-${headerOffset + 8}px 0px -70% 0px`,
        threshold: [0, 1],
      }
    );
    observerRef.current = obs;

    // 동일 id 전부 observe
    const observed: HTMLElement[] = [];
    const seenIds = new Set<string>();
    indexed.forEach(({ id }) => {
      if (seenIds.has(id)) return;
      seenIds.add(id);
      const esc = id.replace(/"/g, '\\"');
      document.querySelectorAll<HTMLElement>(`[id="${esc}"]`).forEach(el => {
        obs.observe(el);
        observed.push(el);
      });
    });

    return () => {
      observed.forEach(el => obs.unobserve(el));
      obs.disconnect();
    };
  }, [indexed, headerOffset, rootKey]);

  // 초기 진입 시 URL 해시가 있으면 해당 위치로 스크롤
  const didInitialHashScroll = useRef(false);
  useEffect(() => {
    if (didInitialHashScroll.current) return;
    const hash = decodeURIComponent(window.location.hash || '').replace(/^#/, '');
    if (!hash) return;
    // 타겟이 렌더된 뒤 한 프레임 후 이동
    const raf = requestAnimationFrame(() => {
      scrollToId(hash, 0);
      didInitialHashScroll.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // ----- UI -----
  const boxStyle: React.CSSProperties = {
    position: 'static',
    width: '100%',
    maxWidth: width,
    padding: '14px 12px',
    maxHeight: `calc(100vh - ${top + 20}px)`,
    overflowY: 'auto',
  };

  const listStyle: React.CSSProperties = {
    listStyle: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  };

  const iconBox: React.CSSProperties = {
    width: 24,
    height: 24,
    display: 'grid',
    placeItems: 'center',
    flex: '0 0 auto',
    marginRight: 8,
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 14,
    fontWeight: 800,
    color: 'var(--editor-text)',
    margin: '0 0 10px 8px',
  };

  const textStyle: React.CSSProperties = {
    fontSize: 13.5,
    fontWeight: 600,
    letterSpacing: '-0.15px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  };

  if (!indexed.length) {
    return (
      <aside
        role="navigation"
        aria-label="Table of contents"
        className="editor-toc-card editor-toc-empty"
        style={{
          ...boxStyle,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        목차 없음
      </aside>
    );
  }

  return (
      <aside
        role="navigation"
        aria-label="Table of contents"
        className="editor-toc-card"
        style={boxStyle}
      >
        <p style={titleStyle}>
          <FontAwesomeIcon icon={faAlignLeft} />
          &nbsp;&nbsp;
          {title}
        </p>

        <ul style={listStyle}>
          {indexed.map((h, i) => {
            const active = h.id === activeId;
            const padLeft = h.level === 1 ? 8 : h.level === 2 ? 26 : 44;

            return (
              <li key={`${h.id}-${h.__occ}-${i}`}>
                <button
                  type="button"
                  onClick={() => scrollToId(h.id, h.__occ)}
                  title={h.text}
                  aria-current={active ? 'true' : undefined}
                  className={[
                    'editor-toc-item',
                    active ? 'is-active' : '',
                  ].filter(Boolean).join(' ')}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    cursor: 'pointer',
                    border: 0,
                    background: active ? 'var(--editor-accent-soft)' : 'transparent',
                    borderLeft: `3px solid ${
                      active ? 'var(--editor-accent)' : 'transparent'
                    }`,
                    color: active
                      ? 'var(--editor-accent-strong)'
                      : 'var(--editor-muted)',
                    padding: '6px 8px',
                    paddingLeft: padLeft,
                    borderRadius: 8,
                    textAlign: 'left',
                    transition: 'background .12s, color .12s, border-color .12s',
                  }}
                >
                  <span style={iconBox} aria-hidden>
                    {h.icon?.startsWith('http') ? (
                      <img
                        src={toProxyUrl(h.icon)}
                        alt=""
                        width={24}
                        height={24}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        style={{
                          width: 24,
                          height: 24,
                          objectFit: 'contain',
                          display: 'block',
                        }}
                      />
                    ) : h.icon ? (
                      <span style={{ fontSize: 14, lineHeight: 1, display: 'block' }}>
                        {h.icon}
                      </span>
                    ) : null}
                  </span>

                  <span style={textStyle}>{h.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
  );
}

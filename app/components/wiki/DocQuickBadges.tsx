// =============================================
/* 전체 코드
 * - 바로가기/즐겨찾기 전환 직후 펼친 상태 유지
 * - 실제 마우스가 hover 영역을 벗어날 때만 닫힘
 * ============================================= */

'use client';

import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useRouter,
} from 'next/navigation';
import {
  toProxyUrl,
} from '@lib/cdn';

import {
  FontAwesomeIcon,
} from '@fortawesome/react-fontawesome';
import {
  faDollarSign,
  faScroll,
  faCube,
  faBoltLightning,
  faCalculator,
  faBookOpen,
  faStar,
} from '@fortawesome/free-solid-svg-icons';

import type {
  DocBadgeMode,
} from '@/wiki/lib/docFavorites';

export type DocQuickBadgeItem = {
  icon?:
    | 'price'
    | 'quest'
    | 'head'
    | 'collection'
    | 'calc';
  emoji?: string;
  docIcon?: string | null;
  id?: number;
  title: string;
  href: string;
  external?: boolean;
  disabled?: boolean;
  emptyState?: boolean;
};

type Props = {
  items: DocQuickBadgeItem[];
  favoriteItems?: DocQuickBadgeItem[];
  mode?: DocBadgeMode;
  onFavoriteRemove?: (
    item: DocQuickBadgeItem,
  ) => void;
  hidden?: boolean;
  expandWidth?: number;
  hoverBg?: string;
  hoverCooldownMs?: number;
  topOffset?: number;
};

const BADGE_HOVER_EVENT =
  'wiki-doc-quick-badges-hover';

/*
 * 기존 hover 영역은 메인 버튼 위 약 27px까지만 포함했다.
 * 전환 말풍선이 버튼 위에 붙으므로 위쪽 감지 범위를
 * 약 32px 더 확장한다.
 */
const HOVER_TOP_EXTENSION = 82;

function iconByKey(
  key: NonNullable<
    DocQuickBadgeItem['icon']
  >,
) {
  switch (key) {
    case 'price':
      return faDollarSign;
    case 'quest':
      return faScroll;
    case 'head':
      return faCube;
    case 'collection':
      return faBookOpen;
    case 'calc':
      return faCalculator;
  }
}

function isImageIconValue(
  value: string,
) {
  if (!value) {
    return false;
  }

  return (
    /^(https?:\/\/|\/|data:image\/)/i.test(
      value,
    ) ||
    /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(
      value,
    )
  );
}

function detectDarkMode() {
  if (
    typeof window === 'undefined'
  ) {
    return false;
  }

  const html =
    document.documentElement;
  const body =
    document.body;

  const hasExplicitDark =
    html.classList.contains('dark') ||
    body?.classList.contains('dark') ||
    html.getAttribute('data-theme') ===
      'dark' ||
    body?.getAttribute('data-theme') ===
      'dark' ||
    html.getAttribute(
      'data-color-mode',
    ) === 'dark' ||
    body?.getAttribute(
      'data-color-mode',
    ) === 'dark';

  if (hasExplicitDark) {
    return true;
  }

  const hasExplicitLight =
    html.classList.contains('light') ||
    body?.classList.contains('light') ||
    html.getAttribute('data-theme') ===
      'light' ||
    body?.getAttribute('data-theme') ===
      'light' ||
    html.getAttribute(
      'data-color-mode',
    ) === 'light' ||
    body?.getAttribute(
      'data-color-mode',
    ) === 'light';

  if (hasExplicitLight) {
    return false;
  }

  return window.matchMedia(
    '(prefers-color-scheme: dark)',
  ).matches;
}

export default function DocQuickBadges({
  items,
  favoriteItems = [],
  mode = 'quick',
  onFavoriteRemove,
  hidden = false,
  expandWidth = 150,
  hoverBg = 'rgb(255, 69, 69)',
  hoverCooldownMs = 220,
  topOffset = 92,
}: Props) {
  const router =
    useRouter();

  const rootRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const hoverInsideRef =
    useRef(false);

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    isDarkMode,
    setIsDarkMode,
  ] = useState(false);

  const [
    hoverLock,
    setHoverLock,
  ] = useState(false);

  const hoverLockTimerRef =
    useRef<number | null>(null);

  const prevOpenRef =
    useRef(false);

  const isFavoritesMode =
    mode === 'favorites';

  const activeItems =
    useMemo(() => {
      if (!isFavoritesMode) {
        return items.slice(0, 5);
      }

      const favorites =
        favoriteItems.slice(0, 10);

      if (favorites.length > 0) {
        return favorites;
      }

      return [
        {
          title:
            '즐겨찾기 목록이 비었습니다',
          href: '#',
          emoji: '⭐',
          disabled: true,
          emptyState: true,
        },
      ];
    }, [
      favoriteItems,
      isFavoritesMode,
      items,
    ]);

  const mainTitle =
    isFavoritesMode
      ? '즐겨찾기'
      : '바로가기';

  const mainButtonTitle =
    mainTitle;

  const activeExpandWidth =
    isFavoritesMode
      ? Math.max(expandWidth, 220)
      : expandWidth;

  const rootHeight =
    Math.max(
      120,
      90 +
        activeItems.length * 56,
    );

  const emitHoverState = (
    nextOpen: boolean,
  ) => {
    hoverInsideRef.current =
      nextOpen;

    window.dispatchEvent(
      new CustomEvent(
        BADGE_HOVER_EVENT,
        {
          detail: {
            open: nextOpen,
          },
        },
      ),
    );
  };

  const go = (
    item: DocQuickBadgeItem,
  ) => {
    if (
      hidden ||
      item.disabled
    ) {
      return;
    }

    if (item.external) {
      window.open(
        item.href,
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }

    router.push(
      item.href,
      {
        scroll: false,
      },
    );
  };

  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    const apply = () => {
      setIsDarkMode(
        detectDarkMode(),
      );
    };

    apply();

    const html =
      document.documentElement;
    const body =
      document.body;

    const observer =
      new MutationObserver(
        apply,
      );

    observer.observe(
      html,
      {
        attributes: true,
        attributeFilter: [
          'class',
          'data-theme',
          'data-color-mode',
          'style',
        ],
      },
    );

    if (body) {
      observer.observe(
        body,
        {
          attributes: true,
          attributeFilter: [
            'class',
            'data-theme',
            'data-color-mode',
            'style',
          ],
        },
      );
    }

    const media =
      window.matchMedia(
        '(prefers-color-scheme: dark)',
      );

    const onMediaChange = () => {
      apply();
    };

    if (
      typeof media.addEventListener ===
      'function'
    ) {
      media.addEventListener(
        'change',
        onMediaChange,
      );
    } else {
      media.addListener(
        onMediaChange,
      );
    }

    return () => {
      observer.disconnect();

      if (
        typeof media.removeEventListener ===
        'function'
      ) {
        media.removeEventListener(
          'change',
          onMediaChange,
        );
      } else {
        media.removeListener(
          onMediaChange,
        );
      }
    };
  }, []);

  useEffect(() => {
    const wasOpen =
      prevOpenRef.current;

    prevOpenRef.current =
      open;

    if (!open) {
      setHoverLock(false);

      if (
        hoverLockTimerRef.current
      ) {
        window.clearTimeout(
          hoverLockTimerRef.current,
        );

        hoverLockTimerRef.current =
          null;
      }

      return;
    }

    if (
      !wasOpen &&
      open
    ) {
      setHoverLock(true);

      if (
        hoverLockTimerRef.current
      ) {
        window.clearTimeout(
          hoverLockTimerRef.current,
        );
      }

      hoverLockTimerRef.current =
        window.setTimeout(() => {
          setHoverLock(false);

          hoverLockTimerRef.current =
            null;
        }, hoverCooldownMs);
    }
  }, [
    open,
    hoverCooldownMs,
  ]);

  useEffect(() => {
    if (!hidden) {
      return;
    }

    setOpen(false);
    setHoverLock(false);
    emitHoverState(false);

    if (
      hoverLockTimerRef.current
    ) {
      window.clearTimeout(
        hoverLockTimerRef.current,
      );

      hoverLockTimerRef.current =
        null;
    }
  }, [hidden]);

  useEffect(() => {
    let raf = 0;

    const onMove = (
      event: MouseEvent,
    ) => {
      if (hidden) {
        return;
      }

      const element =
        rootRef.current;

      if (!element) {
        return;
      }

      const rect =
        element.getBoundingClientRect();

      const centerX =
        rect.left + 23;
      const centerY =
        rect.top + 23;

      const x =
        event.clientX;
      const y =
        event.clientY;

      const maxY =
        centerY +
        70 +
        activeItems.length * 56;

      /*
       * 기존 바로가기 버튼과 전환 말풍선이
       * 완전히 동일한 inside 값을 공유한다.
       */
      const inside =
        x >= centerX - 100 &&
        x <= centerX + 60 &&
        y >=
          centerY -
            HOVER_TOP_EXTENSION &&
        y <= maxY;

      if (raf) {
        cancelAnimationFrame(raf);
      }

      raf =
        requestAnimationFrame(() => {
          setOpen(inside);

          if (
            hoverInsideRef.current !==
            inside
          ) {
            emitHoverState(
              inside,
            );
          }
        });
    };

    window.addEventListener(
      'mousemove',
      onMove,
      {
        passive: true,
      },
    );

    return () => {
      if (raf) {
        cancelAnimationFrame(raf);
      }

      emitHoverState(false);

      window.removeEventListener(
        'mousemove',
        onMove,
      );
    };
  }, [
    activeItems.length,
    hidden,
  ]);

  const badgeBaseBg =
    isDarkMode
      ? 'rgba(255, 255, 255, 0.96)'
      : 'rgb(20, 20, 20)';

  const badgeBaseFg =
    isDarkMode
      ? '#111827'
      : '#ffffff';

  const badgeBorder =
    isDarkMode
      ? '1px solid rgba(255, 255, 255, 0.55)'
      : '1px solid rgba(255, 255, 255, 0.08)';

  const badgeShadow =
    isDarkMode
      ? '0px 0px 24px rgba(0, 0, 0, 0.28)'
      : '0px 0px 20px rgba(0, 0, 0, 0.164)';

  const bubbleBg =
    isDarkMode
      ? 'rgba(255, 255, 255, 0.98)'
      : 'rgb(20, 20, 20)';

  const bubbleFg =
    isDarkMode
      ? '#111827'
      : '#ffffff';

  const bubbleBorder =
    isDarkMode
      ? '1px solid rgba(255, 255, 255, 0.55)'
      : '1px solid rgba(255, 255, 255, 0.08)';

  return (
    <div
      ref={rootRef}
      className={[
        'qbd-root',
        hoverLock
          ? 'hover-lock'
          : '',
        hidden
          ? 'is-hidden'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-hidden={hidden}
      data-mode={mode}
      style={
        {
          ['--qbd-expand' as any]:
            `${activeExpandWidth}px`,
          ['--qbd-hover-bg' as any]:
            hoverBg,
          ['--qbd-top' as any]:
            `${topOffset}px`,
          ['--qbd-base-bg' as any]:
            badgeBaseBg,
          ['--qbd-base-fg' as any]:
            badgeBaseFg,
          ['--qbd-base-border' as any]:
            badgeBorder,
          ['--qbd-base-shadow' as any]:
            badgeShadow,
          ['--qbd-bubble-bg' as any]:
            bubbleBg,
          ['--qbd-bubble-fg' as any]:
            bubbleFg,
          ['--qbd-bubble-border' as any]:
            bubbleBorder,
          ['--qbd-root-height' as any]:
            `${rootHeight}px`,
          ['--qbd-label-size' as any]:
            isFavoritesMode
              ? '15px'
              : '20px',
        } as React.CSSProperties
      }
    >
      <button
        type="button"
        className={[
          'qbd-btn',
          'qbd-main',
          open
            ? 'is-hidden'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => {
          if (hidden) {
            return;
          }

          setOpen(
            (value) => {
              const next =
                !value;

              emitHoverState(
                next,
              );

              return next;
            },
          );
        }}
        aria-label={
          mainButtonTitle
        }
        title={
          mainButtonTitle
        }
        data-label={mainTitle}
        disabled={hidden}
      >
        <span
          className="qbd-ic"
          aria-hidden
        >
          <FontAwesomeIcon
            icon={
              isFavoritesMode
                ? faStar
                : faBoltLightning
            }
          />
        </span>
      </button>

      <div
        className={[
          'qbd-bubble',
          open
            ? 'is-hidden'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-hidden={
          open || hidden
        }
      >
        <span className="qbd-bubble-text">
          {mainTitle}
        </span>
      </div>

      <div
        className="qbd-stack"
        aria-hidden={
          !open || hidden
        }
      >
        {activeItems.map(
          (item, index) => {
            const isDisabled =
              hidden ||
              Boolean(
                item.disabled,
              );

            return (
              <button
                key={
                  `${item.href}-${index}`
                }
                type="button"
                className={[
                  'qbd-btn',
                  'qbd-item',
                  open
                    ? 'is-open'
                    : '',
                  item.disabled
                    ? 'is-disabled'
                    : '',
                  item.emptyState
                    ? 'is-empty'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{
                  transform:
                    open
                      ? `translateY(${56 * index}px)`
                      : 'translateY(0px)',
                  transitionDelay:
                    open
                      ? `${index * 55}ms`
                      : '0ms',
                }}
                onClick={(
                  event,
                ) => {
                  if (
                    isDisabled
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }

                  go(item);
                }}
                onContextMenu={(
                  event,
                ) => {
                  if (
                    isDisabled
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                  }

                  if (
                    !isFavoritesMode ||
                    !item.id ||
                    !onFavoriteRemove
                  ) {
                    return;
                  }

                  event.preventDefault();
                  event.stopPropagation();

                  onFavoriteRemove(
                    item,
                  );
                }}
                aria-label={
                  item.title
                }
                aria-disabled={
                  isDisabled
                }
                title={
                  isFavoritesMode &&
                  onFavoriteRemove &&
                  !item.disabled
                    ? `${item.title} (우클릭으로 해제)`
                    : item.title
                }
                data-label={
                  item.title
                }
                disabled={hidden}
                tabIndex={
                  hidden
                    ? -1
                    : 0
                }
              >
                <span
                  className="qbd-ic"
                  aria-hidden
                >
                  {item.docIcon ? (
                    isImageIconValue(
                      item.docIcon,
                    ) ? (
                      <img
                        src={
                          item.docIcon.startsWith(
                            'http',
                          )
                            ? toProxyUrl(
                                item.docIcon,
                              )
                            : item.docIcon
                        }
                        alt=""
                        className="qbd-doc-icon-img"
                        loading="lazy"
                        decoding="async"
                        draggable={
                          false
                        }
                      />
                    ) : (
                      <span className="qbd-emoji">
                        {
                          item.docIcon
                        }
                      </span>
                    )
                  ) : item.emoji ? (
                    <span className="qbd-emoji">
                      {item.emoji}
                    </span>
                  ) : item.icon ? (
                    <FontAwesomeIcon
                      icon={
                        iconByKey(
                          item.icon,
                        )
                      }
                    />
                  ) : (
                    <FontAwesomeIcon
                      icon={faStar}
                    />
                  )}
                </span>
              </button>
            );
          },
        )}
      </div>

      <style jsx>{`
        .qbd-root {
          position: fixed;
          left: 18px;
          top: var(--qbd-top);
          z-index: 80;
          pointer-events: none;
          width: 110px;
          height: var(--qbd-root-height);
          transition:
            opacity 0.18s ease,
            visibility 0.18s ease;
        }

        .qbd-root.is-hidden {
          opacity: 0;
          visibility: hidden;
        }

        .qbd-btn,
        .qbd-stack,
        .qbd-bubble {
          pointer-events: auto;
        }

        .qbd-root.is-hidden .qbd-btn,
        .qbd-root.is-hidden .qbd-stack,
        .qbd-root.is-hidden .qbd-bubble {
          pointer-events: none;
        }

        .qbd-stack {
          position: absolute;
          left: 0;
          top: 0;
          width: 1px;
          height: 1px;
        }

        .qbd-btn {
          position: absolute;
          left: 0;
          top: 0;
          width: 46px;
          height: 46px;
          border-radius: 999px;
          border: none;
          background: transparent;
          cursor: pointer;
          user-select: none;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: visible;
          transition:
            transform 520ms cubic-bezier(0.22, 1, 0.36, 1),
            opacity 220ms ease;
          -webkit-appearance: none;
          appearance: none;
        }

        .qbd-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          width: 46px;
          height: 46px;
          border-radius: 999px;
          background-color: var(--qbd-base-bg);
          border: var(--qbd-base-border);
          box-shadow: var(--qbd-base-shadow);
          transition:
            width 320ms cubic-bezier(0.22, 1, 0.36, 1),
            border-radius 320ms cubic-bezier(0.22, 1, 0.36, 1),
            background-color 240ms ease,
            box-shadow 240ms ease,
            border-color 240ms ease;
        }

        .qbd-btn::after {
          content: attr(data-label);
          position: absolute;
          left: 46px;
          top: 50%;
          transform: translateY(-50%);
          color: white;
          font-weight: 700;
          font-size: 2px;
          opacity: 0;
          padding-right: 12px;
          white-space: nowrap;
          pointer-events: none;
          transition:
            opacity 220ms ease,
            font-size 240ms ease,
            transform 240ms ease;
        }

        .qbd-main::after {
          content: '';
          opacity: 0 !important;
          font-size: 0 !important;
        }

        .qbd-root:not(.hover-lock):not(.is-hidden) .qbd-btn:not(.qbd-main):not(.is-disabled):hover::before,
        .qbd-root:not(.hover-lock):not(.is-hidden) .qbd-btn:not(.qbd-main):not(.is-disabled):focus-visible::before {
          width: calc(46px + var(--qbd-expand));
          border-radius: 50px;
          background-color: var(--qbd-hover-bg);
          border-color: transparent;
          box-shadow: 0px 0px 22px rgba(0, 0, 0, 0.22);
        }

        .qbd-root:not(.hover-lock):not(.is-hidden) .qbd-btn:not(.qbd-main):hover::after,
        .qbd-root:not(.hover-lock):not(.is-hidden) .qbd-btn:not(.qbd-main):focus-visible::after {
          opacity: 1;
          font-size: var(--qbd-label-size);
          transform: translateY(-50%);
        }

        .qbd-item.is-disabled {
          cursor: default;
        }

        .qbd-item.is-disabled::before {
          background-color: ${isDarkMode
            ? 'rgba(255,255,255,0.92)'
            : 'rgba(20,20,20,0.92)'};
        }

        .qbd-item.is-disabled::after {
          opacity: 1;
          font-size: 14px;
          color: ${isDarkMode
            ? '#6b7280'
            : 'rgba(255,255,255,0.82)'};
          transform: translateY(-50%);
        }

        .qbd-item.is-empty::before {
          width: calc(46px + var(--qbd-expand)) !important;
          border-radius: 50px !important;
          background-color: var(--qbd-hover-bg) !important;
          border-color: transparent !important;
          box-shadow: 0px 0px 22px rgba(0, 0, 0, 0.22) !important;
        }

        .qbd-item.is-empty::after {
          opacity: 1 !important;
          font-size: var(--qbd-label-size) !important;
          color: #fff !important;
          transform: translateY(-50%) !important;
        }

        .qbd-item.is-empty .qbd-ic {
          color: #fff !important;
        }

        .qbd-ic {
          position: absolute;
          left: 0;
          top: 0;
          width: 46px;
          height: 46px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--qbd-base-fg);
          font-size: 24px;
          z-index: 2;
          transition: color 240ms ease;
        }

        .qbd-emoji {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 22px;
          line-height: 1;
        }

        .qbd-doc-icon-img {
          width: 24px;
          height: 24px;
          object-fit: cover;
          border-radius: 6px;
          display: block;
          pointer-events: none;
          user-select: none;
        }

        .qbd-root:not(.hover-lock):not(.is-hidden) .qbd-btn:not(.qbd-main):not(.is-disabled):hover .qbd-ic,
        .qbd-root:not(.hover-lock):not(.is-hidden) .qbd-btn:not(.qbd-main):not(.is-disabled):focus-visible .qbd-ic {
          color: #fff;
        }

        .qbd-main.is-hidden {
          opacity: 0;
          pointer-events: none;
        }

        .qbd-item {
          opacity: 0;
          pointer-events: none;
        }

        .qbd-item.is-open {
          opacity: 1;
          pointer-events: auto;
        }

        .qbd-bubble {
          position: absolute;
          left: 23px;
          top: 58px;
          transform: translateX(-50%);
          background: var(--qbd-bubble-bg);
          color: var(--qbd-bubble-fg);
          border: var(--qbd-bubble-border);
          font-size: 13px;
          line-height: 1;
          padding: 8px 12px;
          border-radius: 8px;
          white-space: nowrap;
          box-shadow: 0 10px 18px rgba(0, 0, 0, 0.16);
          opacity: 1;
          pointer-events: none;
          transition:
            opacity 220ms ease,
            transform 220ms ease,
            background-color 240ms ease,
            color 240ms ease,
            border-color 240ms ease;
        }

        .qbd-bubble-text {
          display: inline-block;
          font-size: ${isDarkMode
            ? '14px'
            : '13px'};
          font-weight: ${isDarkMode
            ? 800
            : 700};
          letter-spacing: ${isDarkMode
            ? '-0.15px'
            : '0'};
          text-shadow: ${isDarkMode
            ? '0 0 0.35px currentColor'
            : 'none'};
        }

        .qbd-bubble::before {
          position: absolute;
          content: '';
          width: 8px;
          height: 8px;
          background: var(--qbd-bubble-bg);
          border-left: var(--qbd-bubble-border);
          border-top: var(--qbd-bubble-border);
          top: -5px;
          left: 50%;
          transform:
            translateX(-50%)
            rotate(45deg);
        }

        .qbd-bubble.is-hidden {
          opacity: 0;
          transform:
            translateX(-50%)
            translateY(-6px);
        }

        @media (hover: none) {
          .qbd-btn::after {
            display: none;
          }
        }

        .qbd-main .qbd-ic {
          font-size: ${isDarkMode
            ? '25px'
            : '24px'};
          font-weight: ${isDarkMode
            ? 800
            : 700};
        }

        .qbd-main .qbd-ic :global(svg) {
          filter: ${isDarkMode
            ? 'drop-shadow(0 0 0.45px currentColor) drop-shadow(0 0 0.45px currentColor)'
            : 'none'};
        }
      `}</style>
    </div>
  );
}

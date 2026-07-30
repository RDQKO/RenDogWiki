"use client";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import SmartImage from '@/components/common/SmartImage';
import InlineLinkRenderer from '@/components/wiki-render/link/InlineLinkRenderer';
import {
  normalizeToAppHref,
} from '@/components/wiki-render/link/linkUtils';
import {
  FOOTNOTE_HOVER_EVENT,
} from '../readInteractionEvents';
import {
  getWikiLinkPreviewData,
} from './wikiLinkPreviewService';
import type {
  InlineWikiLinkReadProps,
  WikiLinkPreviewData,
} from './types';
import {
  cdn,
  withVersion,
} from '@lib/cdn';

type PreviewState =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error';

type TooltipPosition = {
  left: number;
  top: number;
  arrowLeft: number;
};

type PreviewPalette = {
  isDark: boolean;
  foreground: string;
  muted: string;
  accent: string;
  accentSoft: string;
  surfaceElevated: string;
  border: string;
  shadow: string;
  tagBackground: string;
  tagBorder: string;
};

const LIGHT_PALETTE: PreviewPalette = {
  isDark: false,
  foreground: '#1b241d',
  muted: '#6f7c73',
  accent: '#4f9d5a',
  accentSoft: '#edf7eb',
  surfaceElevated: '#ffffff',
  border: '#d8e6d7',
  shadow:
    '0 18px 44px rgba(35, 67, 40, 0.14), 0 5px 16px rgba(35, 67, 40, 0.08)',
  tagBackground: '#edf7eb',
  tagBorder: '#d0e6ce',
};

const DARK_PALETTE: PreviewPalette = {
  isDark: true,
  foreground: '#edf6ef',
  muted: '#aabbb0',
  accent: '#98dda3',
  accentSoft: 'rgba(69, 126, 79, 0.38)',
  surfaceElevated: '#15231a',
  border: 'rgba(143, 198, 153, 0.25)',
  shadow:
    '0 20px 48px rgba(0, 0, 0, 0.46), 0 5px 16px rgba(0, 0, 0, 0.25)',
  tagBackground: 'rgba(62, 119, 72, 0.4)',
  tagBorder: 'rgba(139, 205, 151, 0.27)',
};

function parseColor(
  value: string,
): [number, number, number] | null {
  const normalized =
    value.trim().toLowerCase();

  if (
    !normalized ||
    normalized === 'transparent'
  ) {
    return null;
  }

  const rgbMatch =
    normalized.match(
      /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/,
    );

  if (rgbMatch) {
    return [
      Number(rgbMatch[1]),
      Number(rgbMatch[2]),
      Number(rgbMatch[3]),
    ];
  }

  const hexMatch =
    normalized.match(
      /^#([0-9a-f]{3}|[0-9a-f]{6})$/i,
    );

  if (!hexMatch) {
    return null;
  }

  const raw = hexMatch[1];

  if (raw.length === 3) {
    return [
      parseInt(
        raw[0] + raw[0],
        16,
      ),
      parseInt(
        raw[1] + raw[1],
        16,
      ),
      parseInt(
        raw[2] + raw[2],
        16,
      ),
    ];
  }

  return [
    parseInt(
      raw.slice(0, 2),
      16,
    ),
    parseInt(
      raw.slice(2, 4),
      16,
    ),
    parseInt(
      raw.slice(4, 6),
      16,
    ),
  ];
}

function colorLuminance(
  color: [number, number, number],
) {
  const channels =
    color.map((channel) => {
      const value =
        channel / 255;

      return value <= 0.03928
        ? value / 12.92
        : (
            (value + 0.055) /
            1.055
          ) ** 2.4;
    });

  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
}

function getEffectiveBackground(
  element: HTMLElement | null,
) {
  let current:
    HTMLElement | null =
    element;

  while (current) {
    const color =
      getComputedStyle(
        current,
      ).backgroundColor;

    const parsed =
      parseColor(color);

    if (parsed) {
      return parsed;
    }

    current =
      current.parentElement;
  }

  const bodyColor =
    parseColor(
      getComputedStyle(
        document.body,
      ).backgroundColor,
    );

  return bodyColor;
}

function includesDarkToken(
  value: string | null | undefined,
) {
  if (!value) {
    return false;
  }

  return value
    .toLowerCase()
    .split(/\s+/)
    .some((token) =>
      token === 'dark' ||
      token === 'dark-mode' ||
      token === 'theme-dark' ||
      token === 'rdwiki-dark',
    );
}

function readStoredThemeIsDark() {
  if (
    typeof window === 'undefined'
  ) {
    return false;
  }

  const keys = [
    'rdwiki-theme',
    'theme',
    'color-theme',
    'color-scheme',
  ];

  for (const key of keys) {
    try {
      const value =
        window.localStorage
          .getItem(key);

      if (
        value &&
        value
          .toLowerCase()
          .includes('dark')
      ) {
        return true;
      }
    } catch {
      // localStorage가 차단된 환경에서는 DOM과 계산된 색상으로 판별한다.
    }
  }

  return false;
}

function detectDarkMode(
  source: HTMLElement,
) {
  const roots = [
    document.documentElement,
    document.body,
    source.closest<HTMLElement>(
      '#rdwiki-page',
    ),
    source.closest<HTMLElement>(
      '#wiki-scroll-root',
    ),
  ].filter(
    (
      item,
    ): item is HTMLElement =>
      item instanceof HTMLElement,
  );

  const hasExplicitDark =
    roots.some((root) =>
      includesDarkToken(
        root.dataset.theme,
      ) ||
      includesDarkToken(
        root.dataset.mode,
      ) ||
      includesDarkToken(
        root.getAttribute(
          'data-color-scheme',
        ),
      ) ||
      includesDarkToken(
        root.className,
      ),
    );

  if (hasExplicitDark) {
    return true;
  }

  if (readStoredThemeIsDark()) {
    return true;
  }

  const background =
    getEffectiveBackground(
      source.closest<HTMLElement>(
        '#wiki-scroll-root',
      ) ??
      source.closest<HTMLElement>(
        '#rdwiki-page',
      ) ??
      source,
    );

  if (background) {
    return (
      colorLuminance(
        background,
      ) < 0.32
    );
  }

  return false;
}

function createPaletteProbe(
  source: HTMLElement,
) {
  const probe =
    document.createElement(
      'span',
    );

  probe.setAttribute(
    'aria-hidden',
    'true',
  );

  Object.assign(
    probe.style,
    {
      position: 'fixed',
      left: '-99999px',
      top: '-99999px',
      width: '0',
      height: '0',
      overflow: 'hidden',
      visibility: 'hidden',
      pointerEvents: 'none',
    },
  );

  source.appendChild(
    probe,
  );

  return probe;
}

function resolveColorVariable(
  probe: HTMLElement,
  variableName: string,
  fallback: string,
) {
  probe.style.color =
    `var(${variableName}, ${fallback})`;

  const resolved =
    getComputedStyle(
      probe,
    ).color.trim();

  return resolved || fallback;
}

function resolveBackgroundVariable(
  probe: HTMLElement,
  variableName: string,
  fallback: string,
) {
  probe.style.backgroundColor =
    `var(${variableName}, ${fallback})`;

  const resolved =
    getComputedStyle(
      probe,
    ).backgroundColor.trim();

  return resolved || fallback;
}

function resolveBorderVariable(
  probe: HTMLElement,
  variableName: string,
  fallback: string,
) {
  probe.style.borderTopStyle =
    'solid';

  probe.style.borderTopColor =
    `var(${variableName}, ${fallback})`;

  const resolved =
    getComputedStyle(
      probe,
    ).borderTopColor.trim();

  return resolved || fallback;
}

function resolveShadowVariable(
  probe: HTMLElement,
  variableName: string,
  fallback: string,
) {
  probe.style.boxShadow =
    `var(${variableName}, ${fallback})`;

  const resolved =
    getComputedStyle(
      probe,
    ).boxShadow.trim();

  return (
    resolved &&
    resolved !== 'none'
  )
    ? resolved
    : fallback;
}

function buildPreviewPalette(
  source: HTMLElement | null,
): PreviewPalette {
  if (
    typeof window === 'undefined' ||
    !source
  ) {
    return LIGHT_PALETTE;
  }

  const isDark =
    detectDarkMode(source);

  const fallback =
    isDark
      ? DARK_PALETTE
      : LIGHT_PALETTE;

  const probe =
    createPaletteProbe(
      source,
    );

  try {
    const foreground =
      resolveColorVariable(
        probe,
        '--foreground',
        fallback.foreground,
      );

    const muted =
      resolveColorVariable(
        probe,
        '--muted',
        fallback.muted,
      );

    const accent =
      resolveColorVariable(
        probe,
        '--accent',
        fallback.accent,
      );

    const accentSoft =
      resolveBackgroundVariable(
        probe,
        '--accent-soft',
        fallback.accentSoft,
      );

    const surfaceElevated =
      resolveBackgroundVariable(
        probe,
        '--surface-elevated',
        fallback.surfaceElevated,
      );

    const border =
      resolveBorderVariable(
        probe,
        '--border',
        fallback.border,
      );

    const shadow =
      resolveShadowVariable(
        probe,
        '--shadow-lg',
        fallback.shadow,
      );

    return {
      isDark,
      foreground,
      muted,
      accent,
      accentSoft,
      surfaceElevated,
      border,
      shadow,
      tagBackground:
        isDark
          ? DARK_PALETTE
              .tagBackground
          : accentSoft,
      tagBorder:
        isDark
          ? DARK_PALETTE
              .tagBorder
          : fallback.tagBorder,
    };
  } finally {
    probe.remove();
  }
}

function paletteEquals(
  left: PreviewPalette,
  right: PreviewPalette,
) {
  return (
    left.isDark === right.isDark &&
    left.foreground ===
      right.foreground &&
    left.muted ===
      right.muted &&
    left.accent ===
      right.accent &&
    left.accentSoft ===
      right.accentSoft &&
    left.surfaceElevated ===
      right.surfaceElevated &&
    left.border ===
      right.border &&
    left.shadow ===
      right.shadow &&
    left.tagBackground ===
      right.tagBackground &&
    left.tagBorder ===
      right.tagBorder
  );
}

export default function InlineWikiLinkRead({
  href,
  children,
  onWikiNavigate,
  onBeforeNavigate,
}: InlineWikiLinkReadProps) {
  const router =
    useRouter();

  const rootRef =
    useRef<HTMLAnchorElement | null>(
      null,
    );

  const tooltipRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const tooltipIdRef =
    useRef(
      `wiki-inline-preview-${Math.random()
        .toString(36)
        .slice(2, 10)}`,
    );

  const mountedRef =
    useRef(false);

  const previewReqSeqRef =
    useRef(0);

  const previewTimeoutRef =
    useRef<number | null>(
      null,
    );

  const [
    portalReady,
    setPortalReady,
  ] = useState(false);

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    isMobileViewport,
    setIsMobileViewport,
  ] = useState(false);

  const [
    preview,
    setPreview,
  ] =
    useState<WikiLinkPreviewData | null>(
      null,
    );

  const [
    previewState,
    setPreviewState,
  ] =
    useState<PreviewState>(
      'idle',
    );

  const [
    tooltipPos,
    setTooltipPos,
  ] =
    useState<TooltipPosition>({
      left: 0,
      top: 0,
      arrowLeft: 24,
    });

  const [
    tooltipMeasured,
    setTooltipMeasured,
  ] = useState(false);

  const [
    palette,
    setPalette,
  ] =
    useState<PreviewPalette>(
      LIGHT_PALETTE,
    );

  const normalizedHref =
    useMemo(
      () =>
        normalizeToAppHref(
          href,
        ),
      [href],
    );

  const clearPreviewTimeout =
    useCallback(() => {
      if (
        previewTimeoutRef.current != null &&
        typeof window !== 'undefined'
      ) {
        window.clearTimeout(
          previewTimeoutRef.current,
        );

        previewTimeoutRef.current =
          null;
      }
    }, []);

  const syncPalette =
    useCallback(() => {
      const nextPalette =
        buildPreviewPalette(
          rootRef.current,
        );

      setPalette(
        (current) =>
          paletteEquals(
            current,
            nextPalette,
          )
            ? current
            : nextPalette,
      );
    }, []);

  useEffect(() => {
    mountedRef.current =
      true;

    return () => {
      mountedRef.current =
        false;

      clearPreviewTimeout();
    };
  }, [
    clearPreviewTimeout,
  ]);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    const media =
      window.matchMedia(
        '(max-width: 768px)',
      );

    const apply = () => {
      setIsMobileViewport(
        media.matches,
      );
    };

    apply();

    if (
      typeof media
        .addEventListener ===
      'function'
    ) {
      media.addEventListener(
        'change',
        apply,
      );

      return () => {
        media.removeEventListener(
          'change',
          apply,
        );
      };
    }

    media.addListener(apply);

    return () => {
      media.removeListener(
        apply,
      );
    };
  }, []);

  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    const handleFootnoteHover =
      () => {
        clearPreviewTimeout();
        setOpen(false);
      };

    window.addEventListener(
      FOOTNOTE_HOVER_EVENT,
      handleFootnoteHover,
    );

    return () => {
      window.removeEventListener(
        FOOTNOTE_HOVER_EVENT,
        handleFootnoteHover,
      );
    };
  }, [
    clearPreviewTimeout,
  ]);

  useEffect(() => {
    previewReqSeqRef.current +=
      1;

    clearPreviewTimeout();
    setOpen(false);
    setPreviewState('idle');
    setPreview(null);
    setTooltipMeasured(false);
  }, [
    normalizedHref,
    clearPreviewTimeout,
  ]);

  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return;
    }

    const source =
      rootRef.current;

    if (!source) {
      return;
    }

    const targets = [
      document.documentElement,
      document.body,
      source.closest<HTMLElement>(
        '#rdwiki-page',
      ),
      source.closest<HTMLElement>(
        '#wiki-scroll-root',
      ),
    ].filter(
      (
        item,
      ): item is HTMLElement =>
        item instanceof HTMLElement,
    );

    const observer =
      new MutationObserver(
        syncPalette,
      );

    for (
      const target
      of targets
    ) {
      observer.observe(
        target,
        {
          attributes: true,
          attributeFilter: [
            'class',
            'style',
            'data-theme',
            'data-mode',
            'data-color-scheme',
          ],
        },
      );
    }

    window.addEventListener(
      'storage',
      syncPalette,
    );

    syncPalette();

    return () => {
      observer.disconnect();

      window.removeEventListener(
        'storage',
        syncPalette,
      );
    };
  }, [
    syncPalette,
  ]);

  const beginPreviewLoad =
    useCallback(() => {
      if (
        isMobileViewport
      ) {
        return;
      }

      if (
        previewState ===
          'ready' &&
        preview
      ) {
        return;
      }

      if (
        previewState ===
        'loading'
      ) {
        return;
      }

      const requestSequence =
        ++previewReqSeqRef.current;

      setPreviewState(
        'loading',
      );

      clearPreviewTimeout();

      if (
        typeof window !==
        'undefined'
      ) {
        previewTimeoutRef.current =
          window.setTimeout(
            () => {
              if (
                !mountedRef.current ||
                previewReqSeqRef.current !==
                  requestSequence
              ) {
                return;
              }

              setPreviewState(
                'error',
              );
            },
            6000,
          );
      }

      getWikiLinkPreviewData(
        normalizedHref,
      )
        .then((data) => {
          if (
            !mountedRef.current ||
            previewReqSeqRef.current !==
              requestSequence
          ) {
            return;
          }

          clearPreviewTimeout();

          if (!data) {
            setPreview(null);
            setPreviewState(
              'error',
            );
            return;
          }

          setPreview(data);
          setPreviewState(
            'ready',
          );
        })
        .catch(() => {
          if (
            !mountedRef.current ||
            previewReqSeqRef.current !==
              requestSequence
          ) {
            return;
          }

          clearPreviewTimeout();
          setPreview(null);
          setPreviewState(
            'error',
          );
        });
    }, [
      clearPreviewTimeout,
      isMobileViewport,
      normalizedHref,
      preview,
      previewState,
    ]);

  useEffect(() => {
    if (
      !open ||
      isMobileViewport
    ) {
      return;
    }

    if (
      previewState ===
        'ready' &&
      preview
    ) {
      return;
    }

    beginPreviewLoad();
  }, [
    beginPreviewLoad,
    isMobileViewport,
    open,
    preview,
    previewState,
  ]);

  const updateTooltipPosition =
    useCallback(() => {
      if (
        typeof window ===
        'undefined' ||
        !rootRef.current ||
        !tooltipRef.current
      ) {
        return;
      }

      const triggerRect =
        rootRef.current
          .getBoundingClientRect();

      const tooltipRect =
        tooltipRef.current
          .getBoundingClientRect();

      const sidePadding = 12;
      const gap = 10;

      let left =
        triggerRect.left +
        triggerRect.width / 2 -
        tooltipRect.width / 2;

      left = Math.max(
        sidePadding,
        Math.min(
          left,
          window.innerWidth -
            sidePadding -
            tooltipRect.width,
        ),
      );

      let top =
        triggerRect.top -
        gap -
        tooltipRect.height;

      top = Math.max(
        12,
        top,
      );

      const triggerCenterX =
        triggerRect.left +
        triggerRect.width / 2;

      let arrowLeft =
        triggerCenterX -
        left;

      arrowLeft = Math.max(
        16,
        Math.min(
          arrowLeft,
          tooltipRect.width -
            16,
        ),
      );

      setTooltipPos({
        left,
        top,
        arrowLeft,
      });

      setTooltipMeasured(
        true,
      );
    }, []);

  useLayoutEffect(() => {
    if (
      !portalReady ||
      !open ||
      isMobileViewport
    ) {
      return;
    }

    let animationFrame = 0;

    const schedule = () => {
      cancelAnimationFrame(
        animationFrame,
      );

      animationFrame =
        requestAnimationFrame(
          updateTooltipPosition,
        );
    };

    schedule();

    window.addEventListener(
      'resize',
      schedule,
    );

    window.addEventListener(
      'scroll',
      schedule,
      true,
    );

    const resizeObserver =
      typeof ResizeObserver ===
      'undefined'
        ? null
        : new ResizeObserver(
            schedule,
          );

    if (
      resizeObserver &&
      tooltipRef.current
    ) {
      resizeObserver.observe(
        tooltipRef.current,
      );
    }

    return () => {
      cancelAnimationFrame(
        animationFrame,
      );

      window.removeEventListener(
        'resize',
        schedule,
      );

      window.removeEventListener(
        'scroll',
        schedule,
        true,
      );

      resizeObserver?.disconnect();
    };
  }, [
    isMobileViewport,
    open,
    palette,
    portalReady,
    preview,
    previewState,
    updateTooltipPosition,
  ]);

  const handleClick = (
    event: React.MouseEvent,
  ) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      event.button !== 0
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    setOpen(false);
    onBeforeNavigate?.();

    if (onWikiNavigate) {
      onWikiNavigate(
        normalizedHref,
      );
      return;
    }

    router.push(
      normalizedHref,
    );
  };

  const handlePreviewOpen =
    () => {
      if (
        isMobileViewport
      ) {
        return;
      }

      clearPreviewTimeout();
      syncPalette();

      if (
        previewState ===
        'error'
      ) {
        setPreview(null);
        setPreviewState(
          'idle',
        );
      }

      setTooltipMeasured(false);
      setOpen(true);
    };

  const showTooltip =
    portalReady &&
    !isMobileViewport &&
    open;

  const tooltipVisible =
    showTooltip &&
    tooltipMeasured;

  const tooltipContent =
    previewState ===
    'error' ? (
      <div
        className="wiki-inline-preview-status"
        style={{
          color:
            palette.muted,
        }}
      >
        문서 정보를 불러오지
        못했습니다.
        <br />
        다시 올리면
        재시도합니다.
      </div>
    ) : previewState ===
        'loading' ||
      !preview ? (
      <div
        className="wiki-inline-preview-status"
        style={{
          color:
            palette.muted,
        }}
      >
        문서 정보를
        불러오는 중...
      </div>
    ) : (
      <div className="wiki-inline-preview-content">
        <div
          className="wiki-inline-preview-icon"
          style={{
            background:
              palette.accentSoft,
          }}
        >
          {preview.icon ? (
            preview.icon.startsWith(
              'http',
            ) ? (
              <SmartImage
                src={withVersion(
                  cdn(
                    preview.icon,
                  ),
                )}
                alt="doc icon"
                width={22}
                height={22}
                style={{
                  width: 22,
                  height: 22,
                  objectFit:
                    'contain',
                  display:
                    'block',
                }}
              />
            ) : (
              <span
                style={{
                  fontSize: 20,
                  lineHeight: 1,
                }}
              >
                {preview.icon}
              </span>
            )
          ) : (
            <span
              aria-hidden
              style={{
                fontSize: 18,
                lineHeight: 1,
              }}
            />
          )}
        </div>

        <div className="wiki-inline-preview-copy">
          <div
            className="wiki-inline-preview-category"
            title={
              preview.categoryLabel
            }
            style={{
              color:
                palette.muted,
            }}
          >
            {preview.categoryLabel}
          </div>

          <div
            className="wiki-inline-preview-title"
            style={{
              color:
                palette.foreground,
            }}
          >
            {preview.title}
          </div>

          {preview.tags.length >
          0 ? (
            <div className="wiki-inline-preview-tags">
              {preview.tags.map(
                (
                  tag,
                  index,
                ) => (
                  <span
                    key={`${tag}-${index}`}
                    className="wiki-inline-preview-tag"
                    style={{
                      color:
                        palette.accent,
                      background:
                        palette.tagBackground,
                      borderColor:
                        palette.tagBorder,
                    }}
                  >
                    #
                    {tag.replace(
                      /^#+/,
                      '',
                    )}
                  </span>
                ),
              )}
            </div>
          ) : null}
        </div>
      </div>
    );

  const desktopTooltip =
    showTooltip
      ? createPortal(
          <div
            ref={tooltipRef}
            id={
              tooltipIdRef.current
            }
            className="wiki-inline-preview"
            data-preview-theme={
              palette.isDark
                ? 'dark'
                : 'light'
            }
            role="tooltip"
            aria-hidden={!open}
            style={{
              pointerEvents:
                'none',
              position: 'fixed',
              left:
                tooltipPos.left,
              top:
                tooltipPos.top,
              transform:
                tooltipVisible
                  ? 'translateY(0)'
                  : 'translateY(6px)',
              opacity:
                tooltipVisible
                  ? 1
                  : 0,
              visibility:
                tooltipVisible
                  ? 'visible'
                  : 'hidden',
              zIndex: 9998,
              width:
                'max-content',
              minWidth: 240,
              maxWidth: 360,
              padding:
                '12px 13px',
              borderRadius: 14,
              border:
                `1px solid ${palette.border}`,
              background:
                palette.surfaceElevated,
              color:
                palette.foreground,
              boxShadow:
                palette.shadow,
              transition:
                'opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease',
            }}
          >
            {tooltipContent}

            <span
              className="wiki-inline-preview-arrow"
              aria-hidden
              style={{
                position:
                  'absolute',
                left:
                  tooltipPos.arrowLeft,
                bottom: -7,
                width: 12,
                height: 12,
                transform:
                  tooltipVisible
                    ? 'translateX(-50%) rotate(45deg)'
                    : 'translateX(-50%) translateY(-2px) rotate(45deg)',
                opacity:
                  tooltipVisible
                    ? 1
                    : 0,
                visibility:
                  tooltipVisible
                    ? 'visible'
                    : 'hidden',
                background:
                  palette.surfaceElevated,
                borderRight:
                  `1px solid ${palette.border}`,
                borderBottom:
                  `1px solid ${palette.border}`,
                transition:
                  'opacity 0.16s ease, transform 0.16s ease, visibility 0.16s ease',
              }}
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <InlineLinkRenderer
        anchorRef={rootRef}
        mode="read"
        href={normalizedHref}
        onClick={handleClick}
        onMouseEnter={
          handlePreviewOpen
        }
        onMouseLeave={() => {
          setOpen(false);
        }}
        onFocus={
          handlePreviewOpen
        }
        onBlur={() => {
          setOpen(false);
        }}
        ariaDescribedBy={
          showTooltip
            ? tooltipIdRef.current
            : undefined
        }
        style={{
          color:
            'var(--accent)',
          textDecoration:
            'none',
        }}
      >
        {children}
      </InlineLinkRenderer>

      {desktopTooltip}
    </>
  );
}

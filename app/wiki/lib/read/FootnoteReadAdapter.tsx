'use client';

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  createPortal,
} from 'react-dom';

import {
  FootnoteInline,
} from '@/components/wiki-render';
import {
  resolveFootnoteNode,
} from '@/components/wiki-render/inline/inlineNodeUtils';

import {
  FOOTNOTE_HOVER_EVENT,
} from './readInteractionEvents';

type FootnoteReadAdapterProps = {
  node: any;
};

type DesktopTooltipPosition = {
  left: number;
  top: number;
  arrowLeft: number;
};

export default function FootnoteReadAdapter({
  node,
}: FootnoteReadAdapterProps) {
  const rootRef =
    useRef<HTMLSpanElement | null>(null);
  const desktopTooltipRef =
    useRef<HTMLDivElement | null>(null);

  const [
    open,
    setOpen,
  ] = useState(false);
  const [
    isMobileViewport,
    setIsMobileViewport,
  ] = useState(false);
  const [
    portalReady,
    setPortalReady,
  ] = useState(false);
  const [
    desktopTooltipPos,
    setDesktopTooltipPos,
  ] = useState<DesktopTooltipPosition>({
    left: 0,
    top: 0,
    arrowLeft: 20,
  });

  const {
    label,
    content,
    hasContent,
  } = resolveFootnoteNode(node);

  const notifyFootnoteHover = useCallback(() => {
    if (
      typeof window === 'undefined'
    ) {
      return;
    }

    window.dispatchEvent(
      new CustomEvent(
        FOOTNOTE_HOVER_EVENT,
      ),
    );
  }, []);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  useEffect(() => {
    if (
      typeof window === 'undefined'
    ) {
      return;
    }

    const mediaQuery =
      window.matchMedia(
        '(max-width: 768px)',
      );

    const apply = () => {
      setIsMobileViewport(
        mediaQuery.matches,
      );
    };

    apply();

    if (
      typeof mediaQuery.addEventListener ===
      'function'
    ) {
      mediaQuery.addEventListener(
        'change',
        apply,
      );

      return () => {
        mediaQuery.removeEventListener(
          'change',
          apply,
        );
      };
    }

    mediaQuery.addListener(apply);

    return () => {
      mediaQuery.removeListener(apply);
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (
      event: MouseEvent | TouchEvent,
    ) => {
      const target =
        event.target as Node | null;

      if (!target) return;
      if (isMobileViewport) return;

      if (
        rootRef.current?.contains(target)
      ) {
        return;
      }

      if (
        desktopTooltipRef.current?.contains(
          target,
        )
      ) {
        return;
      }

      setOpen(false);
    };

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener(
      'mousedown',
      handlePointerDown,
    );
    document.addEventListener(
      'touchstart',
      handlePointerDown,
      {
        passive: true,
      },
    );
    document.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handlePointerDown,
      );
      document.removeEventListener(
        'touchstart',
        handlePointerDown,
      );
      document.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [
    open,
    isMobileViewport,
  ]);

  useEffect(() => {
    if (!isMobileViewport) return;
    if (!open) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [
    open,
    isMobileViewport,
  ]);

  const updateDesktopTooltipPosition =
    useCallback(() => {
      if (
        typeof window === 'undefined'
      ) {
        return;
      }

      if (
        !rootRef.current ||
        !desktopTooltipRef.current
      ) {
        return;
      }

      const triggerRect =
        rootRef.current
          .getBoundingClientRect();
      const tooltipRect =
        desktopTooltipRef.current
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

      top = Math.max(12, top);

      const triggerCenterX =
        triggerRect.left +
        triggerRect.width / 2;

      let arrowLeft =
        triggerCenterX - left;

      arrowLeft = Math.max(
        14,
        Math.min(
          arrowLeft,
          tooltipRect.width - 14,
        ),
      );

      setDesktopTooltipPos({
        left,
        top,
        arrowLeft,
      });
    }, []);

  useLayoutEffect(() => {
    if (
      !portalReady ||
      !open ||
      isMobileViewport ||
      !hasContent
    ) {
      return;
    }

    let animationFrame = 0;

    const schedule = () => {
      cancelAnimationFrame(
        animationFrame,
      );

      animationFrame =
        requestAnimationFrame(() => {
          updateDesktopTooltipPosition();
        });
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
    };
  }, [
    portalReady,
    open,
    isMobileViewport,
    hasContent,
    updateDesktopTooltipPosition,
  ]);

  const openDesktop = () => {
    if (
      !hasContent ||
      isMobileViewport
    ) {
      return;
    }

    notifyFootnoteHover();
    setOpen(true);
  };

  const closeDesktop = () => {
    if (isMobileViewport) return;

    setOpen(false);
  };

  const openMobileModal = (
    event: React.MouseEvent,
  ) => {
    if (
      !hasContent ||
      !isMobileViewport
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    notifyFootnoteHover();
    setOpen(true);
  };

  const closeMobileModal = () => {
    setOpen(false);
  };

  const showDesktopTooltip =
    portalReady &&
    !isMobileViewport &&
    open &&
    hasContent;

  const desktopTooltipStyle = {
    left: desktopTooltipPos.left,
    top: desktopTooltipPos.top,
    '--wiki-footnote-arrow-left':
      `${desktopTooltipPos.arrowLeft}px`,
  } as React.CSSProperties;

  const desktopTooltip =
    showDesktopTooltip
      ? createPortal(
          <div
            ref={desktopTooltipRef}
            role="tooltip"
            className="wiki-footnote-tooltip"
            style={desktopTooltipStyle}
          >
            <div className="wiki-footnote-tooltip-head">
              <strong className="wiki-footnote-tooltip-label">
                [{label}]
              </strong>
            </div>

            <div className="wiki-footnote-tooltip-content">
              {content}
            </div>

            <span
              className="wiki-footnote-tooltip-arrow"
              aria-hidden
            />
          </div>,
          document.body,
        )
      : null;

  const mobileModal =
    portalReady &&
    isMobileViewport &&
    hasContent
      ? createPortal(
          <div
            className="wiki-footnote-modal-backdrop"
            data-open={
              open ? 'true' : 'false'
            }
            onClick={closeMobileModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={`각주 ${label}`}
              className="wiki-footnote-modal"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <div className="wiki-footnote-modal-head">
                <div className="wiki-footnote-modal-title">
                  <strong>
                    [{label}]
                  </strong>
                </div>

                <button
                  type="button"
                  className="wiki-footnote-modal-close"
                  aria-label="각주 닫기"
                  onClick={closeMobileModal}
                >
                  <svg
                    viewBox="0 0 20 20"
                    aria-hidden
                    focusable="false"
                  >
                    <path
                      d="m6 6 8 8M14 6l-8 8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </div>

              <div className="wiki-footnote-modal-content">
                {content}
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <FootnoteInline
        ref={rootRef}
        mode="read"
        label={label}
        content={
          hasContent ? content : null
        }
        tabIndex={
          hasContent ? 0 : -1
        }
        ariaLabel={
          hasContent
            ? `각주: ${content}`
            : `각주 ${label}`
        }
        onMouseEnter={() => {
          notifyFootnoteHover();
          openDesktop();
        }}
        onMouseLeave={closeDesktop}
        onFocus={() => {
          notifyFootnoteHover();
          openDesktop();
        }}
        onBlur={closeDesktop}
        onClick={openMobileModal}
        style={{
          cursor: hasContent
            ? isMobileViewport
              ? 'pointer'
              : 'help'
            : 'default',
        }}
      />

      {desktopTooltip}
      {mobileModal}
    </>
  );
}

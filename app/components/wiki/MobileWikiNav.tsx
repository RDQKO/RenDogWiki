'use client';

import { useEffect, useMemo, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faAlignLeft,
  faArrowUp,
  faArrowDown,
} from '@fortawesome/free-solid-svg-icons';
import TableOfContents from './TableOfContents';

type Heading = {
  id: string;
  text: string;
  icon?: string;
  level: 1 | 2 | 3;
};

type MobileWikiNavProps = {
  headings: Heading[];
  docTitle?: string | null;
  docIcon?: string | null;
  scrollRootSelector?: string;
  headerOffset?: number;
};

export default function MobileWikiNav({
  headings,
  docTitle,
  docIcon,
  scrollRootSelector,
  headerOffset = 72,
}: MobileWikiNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);

  useEffect(() => {
    const syncViewport = () => setViewportWidth(window.innerWidth);
    syncViewport();
    window.addEventListener('resize', syncViewport);
    return () => window.removeEventListener('resize', syncViewport);
  }, []);

  const isMobile = viewportWidth > 0 && viewportWidth <= 1199;

  useEffect(() => {
    if (!isMobile) setIsOpen(false);
  }, [isMobile]);

  useEffect(() => {
    setIsOpen(false);
  }, [docTitle]);

  useEffect(() => {
    if (!isOpen) return;

    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevTouchAction = body.style.touchAction;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    window.addEventListener('keydown', onKeyDown);

    return () => {
      body.style.overflow = prevOverflow;
      body.style.touchAction = prevTouchAction;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  const panelWidth = useMemo(() => {
    if (!viewportWidth) return 280;
    return Math.max(250, Math.min(300, viewportWidth - 96));
    }, [viewportWidth]);

  const getScrollRoot = (): HTMLElement | null => {
    if (typeof window === 'undefined') return null;

    if (scrollRootSelector) {
      const found = document.querySelector(scrollRootSelector);
      if (found instanceof HTMLElement) return found;
    }

    const fallback = document.getElementById('wiki-scroll-root');
    return fallback instanceof HTMLElement ? fallback : null;
  };

  const scrollToTop = () => {
    const root = getScrollRoot();
    if (root) {
      root.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const scrollToBottom = () => {
    const root = getScrollRoot();
    if (root) {
      root.scrollTo({ top: root.scrollHeight, behavior: 'smooth' });
      return;
    }

    const doc = document.documentElement;
    window.scrollTo({ top: doc.scrollHeight, behavior: 'smooth' });
  };

  if (!isMobile) return null;

  return (
    <>
      {isOpen && (
        <button
          type="button"
          className="mobile-wiki-nav-backdrop"
          aria-label="목차 닫기"
          onClick={() => setIsOpen(false)}
        />
      )}

      <div className="mobile-wiki-nav">
        <button
          type="button"
          className={`mobile-wiki-nav-btn ${isOpen ? 'is-active' : ''}`}
          aria-label="목차 열기"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <FontAwesomeIcon icon={faAlignLeft} />
        </button>

        <div className="mobile-wiki-nav-stack" role="group" aria-label="문서 탐색">
          <button
            type="button"
            className="mobile-wiki-nav-btn is-segment"
            aria-label="상단으로 이동"
            onClick={scrollToTop}
          >
            <FontAwesomeIcon icon={faArrowUp} />
          </button>

          <button
            type="button"
            className="mobile-wiki-nav-btn is-segment"
            aria-label="하단으로 이동"
            onClick={scrollToBottom}
          >
            <FontAwesomeIcon icon={faArrowDown} />
          </button>
        </div>
      </div>

      {isOpen && (
        <TableOfContents
            headings={headings}
            headerOffset={headerOffset}
            right={78}
            top={92}
            width={panelWidth}
            title="목차"
            docTitle={docTitle ?? undefined}
            docIcon={docIcon ?? undefined}
            scrollRootSelector={scrollRootSelector}
            onNavigate={() => setIsOpen(false)}
        />
        )}

      <style jsx>{`
        .mobile-wiki-nav-backdrop {
          position: fixed;
          inset: 0;
          z-index: 49;
          border: 0;
          padding: 0;
          margin: 0;
          background: rgba(0, 0, 0, 0.14);
        }

        .mobile-wiki-nav {
            position: fixed;
            right: 12px;
            bottom: calc(env(safe-area-inset-bottom, 0px) + 24px);
            z-index: 52;
            display: flex;
            flex-direction: column;
            gap: 10px;
            }

        .mobile-wiki-nav-btn {
          width: 46px;
          height: 46px;
          border: 1px solid var(--border);
          border-radius: 14px;
          display: grid;
          place-items: center;
          cursor: pointer;
          color: var(--foreground);
          background: rgba(18, 22, 30, 0.68);
          background: color-mix(
            in srgb,
            var(--surface-elevated) 78%,
            transparent
          );
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          transition:
            transform 0.14s ease,
            background 0.14s ease,
            color 0.14s ease;
        }

        .mobile-wiki-nav-btn:active {
          transform: scale(0.97);
        }

        .mobile-wiki-nav-btn.is-active {
          color: var(--accent);
        }

        .mobile-wiki-nav-stack {
          display: flex;
          flex-direction: column;
          overflow: hidden;
          border-radius: 14px;
          box-shadow: 0 10px 24px rgba(0, 0, 0, 0.22);
        }

        .mobile-wiki-nav-stack .is-segment {
          border-radius: 0;
          box-shadow: none;
        }

        .mobile-wiki-nav-stack .is-segment + .is-segment {
          border-top: 1px solid var(--border);
        }

        @media (min-width: 1200px) {
          .mobile-wiki-nav,
          .mobile-wiki-nav-backdrop {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
// =============================================
// File: app/components/wiki/DocBadgeModeSwitcher.tsx
// 전체 코드
//
// - 자체 hover 판정 제거
// - DocQuickBadges가 계산한 open 상태를 그대로 사용
// - 바로가기 버튼과 전환 버튼이 정확히 동시에 열리고 닫힘
// =============================================

'use client';

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
} from 'react';
import {
  createPortal,
} from 'react-dom';

import styles from '@/wiki/css/docBadgeModeSwitcher.module.css';

type DocBadgeMode =
  | 'quick'
  | 'favorites';

type HoverEventDetail = {
  open: boolean;
};

type SwitcherPosition = {
  left: number;
  top: number;
};

const BADGE_MODE_STORAGE =
  'wiki:doc-badge-mode';

const BADGE_MODE_EVENT =
  'wiki-doc-badge-mode-change';

const BADGE_HOVER_EVENT =
  'wiki-doc-quick-badges-hover';

const BADGE_ROOT_SELECTOR =
  '.wiki-quick-badges-wrap .qbd-root';

const BADGE_ANCHOR_SELECTOR =
  '.qbd-main';

const BADGE_TRANSITION_MS = 220;

function readBadgeMode(): DocBadgeMode {
  if (
    typeof window ===
    'undefined'
  ) {
    return 'quick';
  }

  return window.localStorage.getItem(
    BADGE_MODE_STORAGE,
  ) === 'favorites'
    ? 'favorites'
    : 'quick';
}

function findAnchor() {
  const root =
    document.querySelector<HTMLElement>(
      BADGE_ROOT_SELECTOR,
    );

  if (
    !root ||
    !root.isConnected
  ) {
    return null;
  }

  return (
    root.querySelector<HTMLElement>(
      BADGE_ANCHOR_SELECTOR,
    ) ??
    root
  );
}

export default function DocBadgeModeSwitcher() {
  const [
    mounted,
    setMounted,
  ] = useState(false);

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    mode,
    setMode,
  ] = useState<DocBadgeMode>(
    'quick',
  );

  const [
    position,
    setPosition,
  ] = useState<SwitcherPosition>({
    left: 41,
    top: 84,
  });

  const updatePosition =
    useCallback(() => {
      const anchor =
        findAnchor();

      if (!anchor) {
        return;
      }

      const rect =
        anchor.getBoundingClientRect();

      setPosition({
        left:
          rect.left +
          rect.width / 2,
        top:
          rect.top - 8,
      });
    }, []);

  useEffect(() => {
    setMounted(true);
    setMode(readBadgeMode());

    return () => {
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    const syncMode = () => {
      setMode(readBadgeMode());
    };

    const onStorage = (
      event: StorageEvent,
    ) => {
      if (
        event.key ===
        BADGE_MODE_STORAGE
      ) {
        syncMode();
      }
    };

    window.addEventListener(
      'storage',
      onStorage,
    );

    window.addEventListener(
      BADGE_MODE_EVENT,
      syncMode,
    );

    return () => {
      window.removeEventListener(
        'storage',
        onStorage,
      );

      window.removeEventListener(
        BADGE_MODE_EVENT,
        syncMode,
      );
    };
  }, []);

  useEffect(() => {
    const onHoverChange = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<
          HoverEventDetail
        >;

      const nextOpen =
        Boolean(
          customEvent.detail?.open,
        );

      if (nextOpen) {
        updatePosition();
      }

      setOpen(nextOpen);
    };

    window.addEventListener(
      BADGE_HOVER_EVENT,
      onHoverChange,
    );

    return () => {
      window.removeEventListener(
        BADGE_HOVER_EVENT,
        onHoverChange,
      );
    };
  }, [updatePosition]);

  useEffect(() => {
    const onViewportChange = () => {
      if (open) {
        updatePosition();
      }
    };

    window.addEventListener(
      'resize',
      onViewportChange,
    );

    window.addEventListener(
      'scroll',
      onViewportChange,
      true,
    );

    return () => {
      window.removeEventListener(
        'resize',
        onViewportChange,
      );

      window.removeEventListener(
        'scroll',
        onViewportChange,
        true,
      );
    };
  }, [
    open,
    updatePosition,
  ]);

  const toggleMode = () => {
    const nextMode: DocBadgeMode =
      mode === 'quick'
        ? 'favorites'
        : 'quick';

    window.localStorage.setItem(
      BADGE_MODE_STORAGE,
      nextMode,
    );

    setMode(nextMode);

    window.dispatchEvent(
      new StorageEvent(
        'storage',
        {
          key:
            BADGE_MODE_STORAGE,
          oldValue: mode,
          newValue:
            nextMode,
          storageArea:
            window.localStorage,
        },
      ),
    );

    window.dispatchEvent(
      new CustomEvent(
        BADGE_MODE_EVENT,
        {
          detail: {
            mode:
              nextMode,
          },
        },
      ),
    );

    document.documentElement.setAttribute(
      'data-doc-badge-mode',
      nextMode,
    );

    window.requestAnimationFrame(
      updatePosition,
    );
  };

  if (!mounted) {
    return null;
  }

  const nextModeLabel =
    mode === 'quick'
      ? '즐겨찾기'
      : '바로가기';

  const currentModeLabel =
    mode === 'quick'
      ? '바로가기'
      : '즐겨찾기';

  return createPortal(
    <div
      className={`${styles.switcher} ${
        open
          ? styles.switcherOpen
          : ''
      }`}
      style={
        {
          left:
            position.left,
          top:
            position.top,
          '--badge-transition-ms':
            `${BADGE_TRANSITION_MS}ms`,
        } as CSSProperties
      }
      aria-hidden={!open}
    >
      <button
        type="button"
        className={
          styles.switchButton
        }
        onClick={
          toggleMode
        }
        tabIndex={
          open
            ? 0
            : -1
        }
        aria-label={`${currentModeLabel}에서 ${nextModeLabel}로 전환`}
        title={`${nextModeLabel}로 전환`}
      >
        <span
          className={
            styles.switchIcon
          }
          aria-hidden="true"
        >
          {mode === 'quick'
            ? '★'
            : '⚡'}
        </span>

        <span
          className={
            styles.switchLabel
          }
        >
          {nextModeLabel}
        </span>
      </button>

      <span
        className={styles.bridge}
        aria-hidden="true"
      />
    </div>,
    document.body,
  );
}

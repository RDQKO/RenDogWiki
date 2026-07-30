// =============================================
// File: app/components/common/Header.tsx
// 전체 코드
// - 홈 헤더와 동일한 디자인 적용
// - 문서 헤더에만 중앙 검색창 유지
// - 바로가기/즐겨찾기 전환 버튼 제거
// - 기존 관리자 메뉴 및 모바일 카테고리 동작 유지
// - 홈 분위기의 카테고리·문서 목차 스타일 적용
// =============================================

'use client';

import {
  useEffect,
  useState,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';

import HamburgerMenu from '@/components/common/HamburgerMenu';
import SearchBox from '@/components/common/SearchBox';
import ThemeToggle from '@/components/common/ThemeToggle';
import DocBadgeModeSwitcher from '@/components/wiki/DocBadgeModeSwitcher';

import '@/wiki/css/header.css';
import '@/wiki/css/categoryTree.css';
import '@/wiki/css/tableOfContentsHome.css';

import styles from '@/wiki/css/wikiHeaderHome.module.css';

type WikiHeaderProps = {
  user: {
    id: number;
    username: string;
    minecraft_name: string;
    email: string;
  } | null;
  onQuestNpcClick?: (id: number) => void;
  mobileCategoryOpen?: boolean;
  onToggleMobileCategory?: () => void;
  hideAdminMenu?: boolean;
};

const DEFAULT_MODE = 'RPG';
const MODE_PARAM = 'mode';
const MODE_STORAGE = 'wiki:mode';
const MODE_EVENT = 'wiki-mode-change';
const VALID_MODES = new Set([
  'RPG',
  '렌독런',
  '마인팜',
  '부엉이타운',
]);

export default function WikiHeader({
  user,
  mobileCategoryOpen = false,
  onToggleMobileCategory,
  hideAdminMenu = false,
  onQuestNpcClick,
}: WikiHeaderProps) {
  const [
    isMenuOpen,
    setIsMenuOpen,
  ] = useState(false);

  /*
   * 기존 문서 화면이 사용하던 mode 파라미터 초기화는 유지한다.
   * 화면에 표시되던 모드 선택 UI와는 별개인 호환성 처리다.
   */
  useEffect(() => {
    const url =
      new URL(window.location.href);
    const urlMode =
      url.searchParams.get(MODE_PARAM);
    const storedMode =
      window.localStorage.getItem(
        MODE_STORAGE,
      );

    const nextMode =
      urlMode &&
      VALID_MODES.has(urlMode)
        ? urlMode
        : storedMode &&
            VALID_MODES.has(storedMode)
          ? storedMode
          : DEFAULT_MODE;

    if (urlMode !== nextMode) {
      url.searchParams.set(
        MODE_PARAM,
        nextMode,
      );

      window.history.replaceState(
        {},
        '',
        url,
      );
    }

    window.localStorage.setItem(
      MODE_STORAGE,
      nextMode,
    );

    window.dispatchEvent(
      new CustomEvent(MODE_EVENT, {
        detail: {
          mode: nextMode,
        },
      }),
    );
  }, []);

  useEffect(() => {
    if (!isMenuOpen) {
      return;
    }

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
      }
    };

    window.addEventListener(
      'keydown',
      onKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        onKeyDown,
      );
    };
  }, [isMenuOpen]);

  const openAdminMenu = () => {
    setIsMenuOpen(true);
  };

  async function handleLogout() {
    try {
      const response = await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
        },
      );

      if (!response.ok) {
        window.alert(
          '로그아웃에 실패했습니다.',
        );
        return;
      }

      window.location.href = '/';
    } catch (error) {
      console.error(
        '[WikiHeader] 로그아웃 실패:',
        error,
      );

      window.alert(
        '로그아웃 요청 중 오류가 발생했습니다.',
      );
    }
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.inner}>
          <Link
            href="/"
            className={styles.brand}
            aria-label="RDWIKI 홈"
          >
            <Image
              src="/images/home/branding/rdwiki-logo.png"
              alt="RDWIKI"
              width={360}
              height={120}
              className={styles.brandLogo}
              priority
            />
          </Link>

          <div className={styles.search}>
            <SearchBox
              align="center"
              width="100%"
              paddingLeft={0}
              onQuestNpcClick={
                onQuestNpcClick
              }
            />
          </div>

          <div className={styles.actions}>
            <ThemeToggle />

            {!hideAdminMenu && (
              <button
                type="button"
                onClick={openAdminMenu}
                className={`${styles.iconButton} ${styles.desktopAdminButton}`}
                aria-label="관리 메뉴 열기"
                aria-haspopup="dialog"
                aria-expanded={isMenuOpen}
              >
                ☰
              </button>
            )}

            {onToggleMobileCategory ? (
              <button
                type="button"
                className={`${styles.iconButton} ${styles.mobileMenuButton}`}
                onClick={
                  onToggleMobileCategory
                }
                aria-label={
                  mobileCategoryOpen
                    ? '카테고리 닫기'
                    : '카테고리 열기'
                }
                aria-expanded={
                  mobileCategoryOpen
                }
              >
                ☰
              </button>
            ) : (
              !hideAdminMenu && (
                <button
                  type="button"
                  onClick={openAdminMenu}
                  className={`${styles.iconButton} ${styles.mobileMenuButton}`}
                  aria-label="관리 메뉴 열기"
                  aria-haspopup="dialog"
                  aria-expanded={isMenuOpen}
                >
                  ☰
                </button>
              )
            )}
          </div>
        </div>

        <DocBadgeModeSwitcher />
      </header>

      {isMenuOpen && !hideAdminMenu && (
        <HamburgerMenu
          isOpen={isMenuOpen}
          onClose={() => {
            setIsMenuOpen(false);
          }}
          isLoggedIn={Boolean(user)}
          username={
            user?.minecraft_name || ''
          }
          uuid={undefined}
          onLogout={handleLogout}
        />
      )}
    </>
  );
}
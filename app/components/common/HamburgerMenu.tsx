// =============================================
// File: app/components/common/HamburgerMenu.tsx
// 전체 코드
//
// - 현재 홈 페이지용 햄버거 메뉴 디자인 유지
// - 메뉴가 열릴 때 /api/auth/me로 실제 로그인 상태 재확인
// - Header/Home에서 전달된 user prop이 없어도 로그인 상태 정상 표시
// - writer/admin 권한 확인 후 관리 메뉴 이동
// - 권한이 없으면 기존과 동일하게 경고 모달 표시
// - Minecraft UUID와 스킨 아이콘 보정
// - minecraft_name을 별도 치환 없이 그대로 표시
// - 메뉴 내부 Link prefetch 비활성화
// - portal, 백드롭, ESC, 스크롤 잠금 유지
// =============================================

'use client';

import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  createPortal,
} from 'react-dom';

import {
  ModalCard,
} from '@/components/common/Modal';
import {
  toProxyUrl,
} from '@lib/cdn';

import styles from '@/wiki/css/hamburgerMenu.module.css';

type HamburgerMenuProps = {
  isOpen?: boolean;
  onClose: () => void;
  isLoggedIn: boolean;
  username?: string;
  uuid?: string;
  onLogout: () => void | Promise<void>;
};

type Role =
  | 'guest'
  | 'writer'
  | 'admin';

type AuthUser = {
  id?: number;
  username?: string;
  email?: string;
  minecraft_name?: string;
  minecraft_uuid?: string;
  role?: string | null;
};

type AuthMeResponse = {
  loggedIn?: boolean;
  role?: string | null;
  user?: AuthUser | null;
};

type MenuItem = {
  href: string;
  title: string;
  description: string;
  icon: ReactNode;
  tone:
    | 'green'
    | 'mint'
    | 'blue'
    | 'orange'
    | 'lime';
};

const menuItems: ReadonlyArray<MenuItem> = [
  {
    href: '/manage/image',
    title: '이미지 관리',
    description:
      '이미지와 폴더를 정리합니다.',
    tone: 'green',
    icon: (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M4 5.75A1.75 1.75 0 0 1 5.75 4h12.5A1.75 1.75 0 0 1 20 5.75v12.5A1.75 1.75 0 0 1 18.25 20H5.75A1.75 1.75 0 0 1 4 18.25V5.75Z" />
        <path d="m6.8 17 3.2-3.4 2.45 2.35 1.85-1.8L17.3 17H6.8Z" />
        <circle
          cx="8.4"
          cy="8.4"
          r="1.35"
        />
      </svg>
    ),
  },
  {
    href: '/manage/category',
    title: '카테고리 관리',
    description:
      '문서 분류와 순서를 관리합니다.',
    tone: 'mint',
    icon: (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M4.5 6.5h6v5h-6zM13.5 6.5h6v5h-6zM4.5 14h6v4h-6zM13.5 14h6v4h-6z" />
      </svg>
    ),
  },
  {
    href: '/manage/npc',
    title: 'NPC 관리',
    description:
      'NPC 정보와 대사를 편집합니다.',
    tone: 'blue',
    icon: (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle
          cx="12"
          cy="8"
          r="3.25"
        />
        <path d="M5.75 19.25c.55-3.35 2.65-5.15 6.25-5.15s5.7 1.8 6.25 5.15" />
      </svg>
    ),
  },
  {
    href: '/manage/quest',
    title: '퀘스트 관리',
    description:
      '퀘스트와 보상 정보를 관리합니다.',
    tone: 'orange',
    icon: (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M7 4.5h10v15H7z" />
        <path d="M9.5 8h5M9.5 11.5h5M9.5 15h3" />
      </svg>
    ),
  },
  {
    href: '/manage/head',
    title: '머리 관리',
    description:
      '머리 위치와 이미지를 관리합니다.',
    tone: 'lime',
    icon: (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="m12 3.8 7 4v8.4l-7 4-7-4V7.8l7-4Z" />
        <path d="m5 7.8 7 4 7-4M12 11.8v8.4" />
      </svg>
    ),
  },
];

function normalizeRole(
  value: unknown,
): Role {
  const normalized =
    String(value ?? '')
      .trim()
      .toLowerCase();

  if (
    normalized === 'admin' ||
    normalized === 'writer'
  ) {
    return normalized;
  }

  return 'guest';
}

function ArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

function LoginIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M13 5h5v14h-5M10 8l4 4-4 4M14 12H4" />
    </svg>
  );
}

function UserPlusIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="9"
        cy="8"
        r="3"
      />
      <path d="M3.5 19c.5-3.2 2.35-4.8 5.5-4.8 2.2 0 3.75.8 4.7 2.4M18 8v6M15 11h6" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="8"
        r="3.25"
      />
      <path d="M5.75 19.25c.55-3.35 2.65-5.15 6.25-5.15s5.7 1.8 6.25 5.15" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M11 5H6v14h5M14 8l4 4-4 4M18 12H9" />
    </svg>
  );
}

export default function HamburgerMenu({
  isOpen = true,
  onClose,
  isLoggedIn,
  username = '',
  uuid,
  onLogout,
}: HamburgerMenuProps) {
  const [
    mounted,
    setMounted,
  ] = useState(false);

  const [
    loggingOut,
    setLoggingOut,
  ] = useState(false);

  const [
    authChecking,
    setAuthChecking,
  ] = useState(true);

  const [
    effectiveLoggedIn,
    setEffectiveLoggedIn,
  ] = useState(isLoggedIn);

  const [
    effectiveUsername,
    setEffectiveUsername,
  ] = useState(username);

  const [
    resolvedUUID,
    setResolvedUUID,
  ] = useState<string | null>(
    uuid || null,
  );

  const [
    role,
    setRole,
  ] = useState<Role>('guest');

  const [
    roleLoaded,
    setRoleLoaded,
  ] = useState(false);

  const [
    denyOpen,
    setDenyOpen,
  ] = useState(false);

  useEffect(() => {
    setEffectiveLoggedIn(
      isLoggedIn,
    );
    setEffectiveUsername(
      username || '',
    );
    setResolvedUUID(
      uuid || null,
    );

    /*
     * props는 빠른 첫 표시를 위한 힌트다.
     * 실제 로그인/권한 상태는 메뉴가 열릴 때
     * /api/auth/me 응답으로 다시 확정한다.
     */
    setRole('guest');
    setRoleLoaded(false);
  }, [
    isLoggedIn,
    username,
    uuid,
  ]);

  useEffect(() => {
    setMounted(true);

    return () => {
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let aborted = false;

    setAuthChecking(true);
    setRoleLoaded(false);
    setDenyOpen(false);

    const fetchUuidByName =
      async (
        minecraftName: string,
      ) => {
        try {
          const response =
            await fetch(
              `/api/mojang/uuid?name=${encodeURIComponent(
                minecraftName,
              )}`,
              {
                cache: 'no-store',
                credentials:
                  'same-origin',
              },
            );

          if (!response.ok) {
            return;
          }

          const payload =
            await response
              .json()
              .catch(() => ({}));

          const nextUuid =
            typeof payload?.uuid ===
            'string'
              ? payload.uuid.trim()
              : '';

          if (
            !aborted &&
            nextUuid
          ) {
            setResolvedUUID(
              nextUuid,
            );
          }
        } catch {
          /*
           * UUID 조회 실패는 로그인 상태와 무관하다.
           * 사용자명 표시는 그대로 유지한다.
           */
        }
      };

    void (async () => {
      try {
        const response =
          await fetch(
            '/api/auth/me',
            {
              cache: 'no-store',
              credentials: 'include',
            },
          );

        const payload:
          AuthMeResponse | null =
          response.ok
            ? await response
                .json()
                .catch(() => null)
            : null;

        const authUser =
          payload?.user ?? null;

        const nextLoggedIn =
          Boolean(
            payload?.loggedIn &&
              authUser,
          );

        const nextRole =
          normalizeRole(
            authUser?.role ??
              payload?.role,
          );

        const nextUsername =
          String(
            authUser?.minecraft_name ??
              authUser?.username ??
              username ??
              '',
          ).trim();

        const nextUuid =
          String(
            uuid ??
              authUser?.minecraft_uuid ??
              '',
          ).trim();

        if (aborted) {
          return;
        }

        setEffectiveLoggedIn(
          nextLoggedIn,
        );
        setEffectiveUsername(
          nextUsername,
        );
        setRole(nextRole);
        setRoleLoaded(true);

        if (nextUuid) {
          setResolvedUUID(
            nextUuid,
          );
        } else {
          setResolvedUUID(null);

          if (nextUsername) {
            void fetchUuidByName(
              nextUsername,
            );
          }
        }
      } catch {
        if (aborted) {
          return;
        }

        /*
         * API가 일시적으로 실패하면 호출부에서 전달한
         * 로그인 정보는 유지하고 권한만 보수적으로 guest 처리한다.
         */
        setEffectiveLoggedIn(
          isLoggedIn,
        );
        setEffectiveUsername(
          username || '',
        );
        setResolvedUUID(
          uuid || null,
        );
        setRole('guest');
        setRoleLoaded(true);
      } finally {
        if (!aborted) {
          setAuthChecking(false);
        }
      }
    })();

    return () => {
      aborted = true;
    };
  }, [
    isOpen,
    isLoggedIn,
    username,
    uuid,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;
    const previousPaddingRight =
      document.body.style.paddingRight;

    const scrollbarWidth =
      window.innerWidth -
      document.documentElement.clientWidth;

    document.body.style.overflow =
      'hidden';

    if (scrollbarWidth > 0) {
      document.body.style.paddingRight =
        `${scrollbarWidth}px`;
    }

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        if (denyOpen) {
          setDenyOpen(false);
          return;
        }

        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      onKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;
      document.body.style.paddingRight =
        previousPaddingRight;

      window.removeEventListener(
        'keydown',
        onKeyDown,
      );
    };
  }, [
    isOpen,
    onClose,
    denyOpen,
  ]);

  const displayName =
    effectiveUsername.trim() ||
    'RDWIKI 사용자';

  const initial =
    useMemo(() => {
      const value =
        displayName.trim();

      return (
        value
          .charAt(0)
          .toUpperCase() ||
        'R'
      );
    }, [displayName]);

  const skinUrl =
    resolvedUUID
      ? `https://crafthead.net/helm/${resolvedUUID}/64.png`
      : null;

  const canManage =
    role === 'writer' ||
    role === 'admin';

  const permissionMessage =
    !effectiveLoggedIn
      ? '로그인이 필요합니다.'
      : '권한이 없습니다.\n관리자에게 문의해주세요.';

  const handleGuardedClick = (
    event:
      ReactMouseEvent<
        HTMLAnchorElement
      >,
  ) => {
    if (
      !roleLoaded ||
      !canManage
    ) {
      event.preventDefault();
      event.stopPropagation();
      setDenyOpen(true);
      return;
    }

    onClose();
  };

  const handleLogout =
    async () => {
      if (loggingOut) {
        return;
      }

      setLoggingOut(true);

      try {
        await onLogout();
      } finally {
        setLoggingOut(false);
      }
    };

  if (
    !mounted ||
    !isOpen
  ) {
    return null;
  }

  return createPortal(
    <>
      <div
        className={styles.layer}
        role="presentation"
      >
        <button
          type="button"
          className={styles.backdrop}
          aria-label="관리 메뉴 닫기"
          onClick={onClose}
        />

        <aside
          className={styles.panel}
          role="dialog"
          aria-modal="true"
          aria-labelledby="rdwiki-menu-title"
        >
          <div
            className={styles.ambient}
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </div>

          <header className={styles.header}>
            <Link
              href="/"
              prefetch={false}
              className={styles.brand}
              aria-label="RDWIKI 홈"
              onClick={onClose}
            >
              <Image
                src="/images/home/branding/rdwiki-logo.png"
                alt="RDWIKI"
                width={360}
                height={120}
                className={styles.logo}
                priority
              />
            </Link>

            <button
              type="button"
              className={
                styles.closeButton
              }
              onClick={onClose}
              aria-label="관리 메뉴 닫기"
            >
              <CloseIcon />
            </button>
          </header>

          <div className={styles.scrollArea}>
            <section
              className={styles.welcomeCard}
              aria-label={
                authChecking
                  ? '로그인 상태 확인 중'
                  : effectiveLoggedIn
                    ? '로그인 사용자 정보'
                    : '비로그인 사용자 안내'
              }
            >
              <div
                className={styles.avatar}
                aria-hidden="true"
              >
                {effectiveLoggedIn &&
                skinUrl ? (
                  <img
                    src={toProxyUrl(
                      skinUrl,
                    )}
                    alt=""
                    width={58}
                    height={58}
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    style={{
                      display:
                        'block',
                      width: '100%',
                      height: '100%',
                      borderRadius:
                        '16px',
                      objectFit:
                        'cover',
                      imageRendering:
                        'pixelated',
                    }}
                  />
                ) : effectiveLoggedIn ? (
                  <span>{initial}</span>
                ) : (
                  <UserIcon />
                )}
              </div>

              <div className={styles.welcomeBody}>
                <p className={styles.eyebrow}>
                  {authChecking
                    ? 'CHECKING ACCOUNT'
                    : effectiveLoggedIn
                      ? 'WELCOME BACK'
                      : 'WELCOME TO RDWIKI'}
                </p>

                <h2 id="rdwiki-menu-title">
                  {authChecking
                    ? '로그인 상태 확인 중'
                    : effectiveLoggedIn
                      ? `${displayName}님`
                      : '게스트로 둘러보는 중'}
                </h2>

                <p>
                  {authChecking
                    ? '현재 계정과 관리 권한을 확인하고 있습니다.'
                    : effectiveLoggedIn
                      ? canManage
                        ? (
                          <>
                            렌독위키 관리 도구와
                            <br />
                            개인 메뉴를 이용할 수 있습니다.
                          </>
                        )
                        : '로그인되었습니다. 관리 기능은 권한이 있는 계정만 이용할 수 있습니다.'
                      : '로그인하면 문서와 관리 기능을 더욱 편하게 이용할 수 있습니다.'}
                </p>
              </div>
            </section>

            <section
              className={styles.menuSection}
              aria-labelledby="manage-menu-heading"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <p className={styles.eyebrow}>
                    RDWIKI TOOLS
                  </p>

                  <h3 id="manage-menu-heading">
                    관리 메뉴
                  </h3>
                </div>

              </div>

              <nav
                className={styles.menuList}
                aria-label="관리 도구"
              >
                {menuItems.map(
                  (item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch={false}
                      className={
                        styles.menuItem
                      }
                      data-tone={item.tone}
                      onClick={
                        handleGuardedClick
                      }
                      aria-disabled={
                        !roleLoaded ||
                        !canManage
                      }
                      title={
                        !roleLoaded
                          ? '권한 확인 중'
                          : !canManage
                            ? 'writer 또는 admin 권한 필요'
                            : item.title
                      }
                    >
                      <span
                        className={
                          styles.menuIcon
                        }
                        aria-hidden="true"
                      >
                        {item.icon}
                      </span>

                      <span
                        className={
                          styles.menuText
                        }
                      >
                        <strong>
                          {item.title}
                        </strong>

                        <span>
                          {item.description}
                        </span>
                      </span>

                      <span
                        className={
                          styles.menuArrow
                        }
                        aria-hidden="true"
                      >
                        <ArrowIcon />
                      </span>
                    </Link>
                  ),
                )}
              </nav>
            </section>
          </div>

          <footer className={styles.footer}>
            {authChecking ? (
              <>
                <button
                  type="button"
                  className={`${styles.accountButton} ${styles.accountButtonPrimary}`}
                  disabled
                >
                  <UserIcon />
                  <span>확인 중</span>
                </button>

                <button
                  type="button"
                  className={`${styles.accountButton} ${styles.accountButtonSecondary}`}
                  disabled
                >
                  <span>잠시만요</span>
                </button>
              </>
            ) : effectiveLoggedIn ? (
              <>
                <Link
                  href="/mypage"
                  prefetch={false}
                  className={`${styles.accountButton} ${styles.accountButtonPrimary}`}
                  onClick={onClose}
                >
                  <UserIcon />
                  <span>마이페이지</span>
                </Link>

                <button
                  type="button"
                  className={`${styles.accountButton} ${styles.accountButtonSecondary}`}
                  onClick={() => {
                    void handleLogout();
                  }}
                  disabled={loggingOut}
                >
                  <LogoutIcon />
                  <span>
                    {loggingOut
                      ? '로그아웃 중'
                      : '로그아웃'}
                  </span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  prefetch={false}
                  className={`${styles.accountButton} ${styles.accountButtonPrimary}`}
                  onClick={onClose}
                >
                  <LoginIcon />
                  <span>로그인</span>
                </Link>

                <Link
                  href="/register"
                  prefetch={false}
                  className={`${styles.accountButton} ${styles.accountButtonSecondary}`}
                  onClick={onClose}
                >
                  <UserPlusIcon />
                  <span>회원가입</span>
                </Link>
              </>
            )}
          </footer>
        </aside>
      </div>

      <ModalCard
        open={denyOpen}
        onClose={() => {
          setDenyOpen(false);
        }}
        title="경고"
        width={360}
        actions={
          <button
            type="button"
            className={`${styles.accountButton} ${styles.accountButtonPrimary}`}
            onClick={() => {
              setDenyOpen(false);
            }}
          >
            확인
          </button>
        }
      >
        <div
          style={{
            whiteSpace:
              'pre-line',
          }}
        >
          {permissionMessage}
        </div>
      </ModalCard>
    </>,
    document.body,
  );
}
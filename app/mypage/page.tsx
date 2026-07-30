// =============================================
// File: app/mypage/page.tsx
// 전체 코드
//
// - /api/auth/me 연동
// - 마인크래프트 닉네임 변경
// - 비밀번호 변경
// - 로그아웃
// =============================================

'use client';

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import {
  useRouter,
} from 'next/navigation';

import WikiHeader from '@/components/common/Header';
import '@/wiki/css/mypage.css';

type User = {
  id: number;
  username: string;
  minecraft_name: string;
  email: string;
  role?: string;
};

type ModalKind =
  | 'minecraft'
  | 'password'
  | null;

type Notice = {
  tone: 'success' | 'error';
  text: string;
} | null;

function normalizeUser(
  data: unknown,
): User | null {
  if (
    !data ||
    typeof data !== 'object'
  ) {
    return null;
  }

  const root =
    data as Record<string, unknown>;

  const source =
    root.user &&
    typeof root.user === 'object'
      ? root.user as Record<string, unknown>
      : root;

  const id =
    Number(source.id);

  if (
    !Number.isFinite(id)
  ) {
    return null;
  }

  return {
    id,
    username:
      String(
        source.username ??
        '',
      ),
    minecraft_name:
      String(
        source.minecraft_name ??
        source.minecraftName ??
        '',
      ),
    email:
      String(
        source.email ??
        '',
      ),
    role:
      source.role == null
        ? undefined
        : String(source.role),
  };
}

async function readError(
  response: Response,
  fallback: string,
) {
  const data =
    await response
      .json()
      .catch(() => null);

  return String(
    data?.error ??
    data?.message ??
    fallback,
  );
}

async function requestWithMethodFallback(
  url: string,
  methods: readonly string[],
  body: Record<string, unknown>,
) {
  let lastResponse:
    Response | null = null;

  for (
    const method of methods
  ) {
    const response = await fetch(
      url,
      {
        method,
        headers: {
          'Content-Type':
            'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      },
    );

    lastResponse = response;

    if (
      response.status !== 405
    ) {
      return response;
    }
  }

  return lastResponse ??
    new Response(
      null,
      {
        status: 500,
      },
    );
}

function roleLabel(
  role?: string,
) {
  switch (
    String(role ?? '')
      .toLowerCase()
  ) {
    case 'admin':
      return '관리자';
    case 'manager':
      return '매니저';
    case 'writer':
      return '작성자';
    default:
      return '일반 회원';
  }
}

export default function MyPage() {
  const router =
    useRouter();

  const [
    user,
    setUser,
  ] = useState<User | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    modal,
    setModal,
  ] = useState<ModalKind>(
    null,
  );

  const [
    notice,
    setNotice,
  ] = useState<Notice>(
    null,
  );

  const [
    avatarFailed,
    setAvatarFailed,
  ] = useState(false);

  const loadUser = async () => {
    setLoading(true);

    try {
      const response = await fetch(
        '/api/auth/me',
        {
          cache: 'no-store',
          credentials: 'include',
        },
      );

      if (!response.ok) {
        router.replace('/login');
        return;
      }

      const data =
        await response.json();

      const nextUser =
        normalizeUser(data);

      if (!nextUser) {
        router.replace('/login');
        return;
      }

      setUser(nextUser);
      setAvatarFailed(false);
    } catch {
      setNotice({
        tone: 'error',
        text:
          '회원 정보를 불러오지 못했습니다.',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avatarUrl =
    useMemo(
      () => {
        const name =
          user?.minecraft_name
            .trim();

        if (!name) return '';

        return `https://mc-heads.net/avatar/${encodeURIComponent(name)}/128`;
      },
      [user?.minecraft_name],
    );

  const logout = async () => {
    try {
      await fetch(
        '/api/auth/logout',
        {
          method: 'POST',
          credentials: 'include',
        },
      );
    } finally {
      router.push('/login');
      router.refresh();
    }
  };

  return (
    <div className="mypage-root">
      <WikiHeader
        user={user}
      />

      <main className="mypage-bg">
        <section className="mypage-shell">
          <header className="mypage-heading">
            <div>
              <span className="mypage-kicker">
                MY RDWIKI
              </span>
              <h1>마이페이지</h1>
              <p>
                계정 정보와 보안 설정을 관리합니다.
              </p>
            </div>

            <Link
              href="/wiki"
              className="mypage-wiki-link"
            >
              위키로 돌아가기
            </Link>
          </header>

          {loading ? (
            <div className="mypage-loading">
              <span />
              회원 정보를 불러오는 중입니다.
            </div>
          ) : user ? (
            <div className="mypage-grid">
              <aside className="mypage-profile-card">
                <div className="mypage-avatar-frame">
                  {avatarUrl &&
                  !avatarFailed ? (
                    <img
                      src={avatarUrl}
                      alt={`${user.minecraft_name} 스킨 얼굴`}
                      onError={() =>
                        setAvatarFailed(true)
                      }
                    />
                  ) : (
                    <span>
                      {(
                        user.minecraft_name ||
                        user.username ||
                        'R'
                      )
                        .slice(0, 1)
                        .toUpperCase()}
                    </span>
                  )}
                </div>

                <span className="mypage-role-badge">
                  {roleLabel(
                    user.role,
                  )}
                </span>

                <h2>
                  {user.username}
                </h2>

                <p>
                  {user.minecraft_name ||
                    '마인크래프트 닉네임 미설정'}
                </p>

                <div className="mypage-profile-actions">
                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setModal('minecraft');
                    }}
                  >
                    프로필 수정
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setModal('password');
                    }}
                  >
                    비밀번호 변경
                  </button>
                </div>
              </aside>

              <section className="mypage-info-card">
                <div className="mypage-card-title">
                  <span>
                    계정 정보
                  </span>
                  <p>
                    현재 계정에 연결된 정보입니다.
                  </p>
                </div>

                <dl className="mypage-info-list">
                  <div>
                    <dt>아이디</dt>
                    <dd>
                      {user.username}
                    </dd>
                  </div>

                  <div>
                    <dt>이메일</dt>
                    <dd>
                      {user.email}
                    </dd>
                  </div>

                  <div>
                    <dt>
                      마인크래프트 닉네임
                    </dt>
                    <dd>
                      {user.minecraft_name ||
                        '설정되지 않음'}
                    </dd>
                  </div>

                  <div>
                    <dt>권한</dt>
                    <dd>
                      {roleLabel(
                        user.role,
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="mypage-security-box">
                  <div>
                    <span className="mypage-security-icon">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path
                          d="M12 3 5 6v5c0 4.6 2.9 8.2 7 10 4.1-1.8 7-5.4 7-10V6Z"
                          strokeLinejoin="round"
                        />
                        <path
                          d="m9.5 12 1.7 1.7 3.5-4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>

                    <div>
                      <strong>
                        계정 보안
                      </strong>
                      <p>
                        주기적으로 비밀번호를 변경해 계정을 보호하세요.
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setNotice(null);
                      setModal('password');
                    }}
                  >
                    변경
                  </button>
                </div>

                {notice && (
                  <div
                    className={`mypage-notice is-${notice.tone}`}
                    aria-live="polite"
                  >
                    {notice.text}
                  </div>
                )}

                <button
                  type="button"
                  className="mypage-logout"
                  onClick={() =>
                    void logout()
                  }
                >
                  로그아웃
                </button>
              </section>
            </div>
          ) : (
            <div className="mypage-loading is-error">
              회원 정보를 확인할 수 없습니다.
            </div>
          )}
        </section>
      </main>

      {user &&
      modal === 'minecraft' && (
        <MinecraftNameModal
          currentName={
            user.minecraft_name
          }
          onClose={() =>
            setModal(null)
          }
          onSaved={async (
            minecraftName,
          ) => {
            setModal(null);
            setUser((current) =>
              current
                ? {
                    ...current,
                    minecraft_name:
                      minecraftName,
                  }
                : current,
            );
            setAvatarFailed(false);
            setNotice({
              tone: 'success',
              text:
                '마인크래프트 닉네임을 변경했습니다.',
            });
          }}
        />
      )}

      {modal === 'password' && (
        <PasswordModal
          onClose={() =>
            setModal(null)
          }
          onSaved={() => {
            setModal(null);
            setNotice({
              tone: 'success',
              text:
                '비밀번호를 변경했습니다.',
            });
          }}
        />
      )}
    </div>
  );
}

function MinecraftNameModal({
  currentName,
  onClose,
  onSaved,
}: {
  currentName: string;
  onClose: () => void;
  onSaved: (
    minecraftName: string,
  ) => void;
}) {
  const [
    value,
    setValue,
  ] = useState(
    currentName,
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const submit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const minecraftName =
      value.trim();

    if (
      !/^[A-Za-z0-9_]{3,16}$/.test(
        minecraftName,
      )
    ) {
      setError(
        '영문, 숫자, 밑줄로 3~16자 입력해주세요.',
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response =
        await requestWithMethodFallback(
          '/api/profile/minecraft-name',
          [
            'PATCH',
            'POST',
            'PUT',
          ],
          {
            minecraft_name:
              minecraftName,
            minecraftName,
            newMinecraftName:
              minecraftName,
          },
        );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            '닉네임 변경에 실패했습니다.',
          ),
        );
      }

      onSaved(
        minecraftName,
      );
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : '닉네임 변경에 실패했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsModal
      title="프로필 수정"
      description="위키에서 사용할 마인크래프트 닉네임을 변경합니다."
      onClose={onClose}
      saving={saving}
    >
      <form
        className="mypage-modal-form"
        onSubmit={submit}
      >
        <label>
          <span>
            마인크래프트 닉네임
          </span>
          <input
            value={value}
            onChange={(event) => {
              setValue(
                event.target.value
                  .replace(
                    /[^A-Za-z0-9_]/g,
                    '',
                  )
                  .slice(0, 16),
              );
              setError('');
            }}
            autoFocus
            autoComplete="off"
            placeholder="Minecraft nickname"
            disabled={saving}
          />
          <small>
            영문, 숫자, 밑줄 조합 3~16자
          </small>
        </label>

        {error && (
          <p className="mypage-modal-error">
            {error}
          </p>
        )}

        <div className="mypage-modal-actions">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            취소
          </button>

          <button
            type="submit"
            className="is-primary"
            disabled={saving}
          >
            {saving
              ? '저장 중'
              : '변경 사항 저장'}
          </button>
        </div>
      </form>
    </SettingsModal>
  );
}

function PasswordModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [
    currentPassword,
    setCurrentPassword,
  ] = useState('');

  const [
    newPassword,
    setNewPassword,
  ] = useState('');

  const [
    confirmPassword,
    setConfirmPassword,
  ] = useState('');

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const submit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (
      newPassword.length < 8
    ) {
      setError(
        '새 비밀번호는 8자 이상 입력해주세요.',
      );
      return;
    }

    if (
      newPassword !==
      confirmPassword
    ) {
      setError(
        '새 비밀번호 확인이 일치하지 않습니다.',
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response =
        await requestWithMethodFallback(
          '/api/auth/password',
          [
            'PATCH',
            'POST',
            'PUT',
          ],
          {
            currentPassword,
            oldPassword:
              currentPassword,
            current_password:
              currentPassword,
            old_password:
              currentPassword,
            password:
              currentPassword,
            newPassword,
            new_password:
              newPassword,
            confirmPassword:
              newPassword,
          },
        );

      if (!response.ok) {
        throw new Error(
          await readError(
            response,
            '비밀번호 변경에 실패했습니다.',
          ),
        );
      }

      onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : '비밀번호 변경에 실패했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingsModal
      title="비밀번호 변경"
      description="현재 비밀번호 확인 후 새 비밀번호를 설정합니다."
      onClose={onClose}
      saving={saving}
    >
      <form
        className="mypage-modal-form"
        onSubmit={submit}
      >
        <label>
          <span>현재 비밀번호</span>
          <input
            type="password"
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(
                event.target.value,
              );
              setError('');
            }}
            autoFocus
            autoComplete="current-password"
            disabled={saving}
          />
        </label>

        <label>
          <span>새 비밀번호</span>
          <input
            type="password"
            value={newPassword}
            onChange={(event) => {
              setNewPassword(
                event.target.value,
              );
              setError('');
            }}
            autoComplete="new-password"
            disabled={saving}
          />
          <small>
            8자 이상 입력해주세요.
          </small>
        </label>

        <label>
          <span>
            새 비밀번호 확인
          </span>
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(
                event.target.value,
              );
              setError('');
            }}
            autoComplete="new-password"
            disabled={saving}
          />
        </label>

        {error && (
          <p className="mypage-modal-error">
            {error}
          </p>
        )}

        <div className="mypage-modal-actions">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
          >
            취소
          </button>

          <button
            type="submit"
            className="is-primary"
            disabled={saving}
          >
            {saving
              ? '변경 중'
              : '비밀번호 변경'}
          </button>
        </div>
      </form>
    </SettingsModal>
  );
}

function SettingsModal({
  title,
  description,
  onClose,
  saving,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  saving: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape' &&
        !saving
      ) {
        onClose();
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
      document.body.style.overflow =
        previousOverflow;
    };
  }, [
    onClose,
    saving,
  ]);

  return (
    <div
      className="mypage-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget &&
          !saving
        ) {
          onClose();
        }
      }}
    >
      <section
        className="mypage-modal"
        role="dialog"
        aria-modal="true"
      >
        <header>
          <div>
            <span>계정 설정</span>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="설정 모달 닫기"
          >
            ×
          </button>
        </header>

        {children}
      </section>
    </div>
  );
}

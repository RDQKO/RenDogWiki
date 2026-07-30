// =============================================
// File: app/login/page.tsx
// 전체 코드
// =============================================

'use client';

import {
  useState,
  type ChangeEvent,
  type FormEvent,
} from 'react';
import Link from 'next/link';
import {
  useRouter,
} from 'next/navigation';

import WikiHeader from '@/components/common/Header';
import {
  DEFAULT_WIKI_DOCUMENT_URL,
} from '@/wiki/lib/defaultWikiDocument';
import '@/wiki/css/login.css';

const HANGUL_GLOBAL =
  /[\uAC00-\uD7A3\u1100-\u11FF\u3131-\u318E]/g;

const stripHangul = (
  value: string,
) =>
  value.replace(
    HANGUL_GLOBAL,
    '',
  );

type MessageTone =
  | 'success'
  | 'error'
  | '';

export default function LoginPage() {
  const [
    form,
    setForm,
  ] = useState({
    username: '',
    password: '',
  });

  const [
    message,
    setMessage,
  ] = useState('');

  const [
    messageTone,
    setMessageTone,
  ] = useState<MessageTone>('');

  const [
    loading,
    setLoading,
  ] = useState(false);

  const router =
    useRouter();

  const handleChange = (
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    const {
      name,
      value,
    } = event.target;

    const nextValue =
      name === 'username' ||
      name === 'password'
        ? stripHangul(value)
        : value;

    setForm((current) => ({
      ...current,
      [name]: nextValue,
    }));

    if (message) {
      setMessage('');
      setMessageTone('');
    }
  };

  const handleSubmit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    setLoading(true);
    setMessage('');
    setMessageTone('');

    try {
      const response = await fetch(
        '/api/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          credentials: 'include',
          body: JSON.stringify(
            form,
          ),
        },
      );

      const data =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        setMessage(
          data?.error ??
          '아이디 또는 비밀번호를 확인해주세요.',
        );
        setMessageTone('error');
        return;
      }

      setMessage(
        '로그인되었습니다. 위키로 이동합니다.',
      );
      setMessageTone('success');

      window.setTimeout(
        () => {
          router.push(
            DEFAULT_WIKI_DOCUMENT_URL,
          );
        },
        900,
      );
    } catch {
      setMessage(
        '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',
      );
      setMessageTone('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page-root">
      <WikiHeader user={null} />

      <main className="login-bg">
        <div
          className="login-decoration login-decoration-one"
          aria-hidden="true"
        />
        <div
          className="login-decoration login-decoration-two"
          aria-hidden="true"
        />

        <section className="login-shell">
          <aside className="login-guide">
            <span className="login-guide-kicker">
              RENDOG WIKI
            </span>

            <h1>
              렌독서버의 정보를
              <br />
              한곳에서 확인하세요
            </h1>

            <p>
              필요한 문서와 가이드를 빠르게 찾고,
              작성 권한이 있다면 위키 관리 기능도 이용할 수 있습니다.
            </p>

            <div className="login-guide-points">
              <div>
                <span>01</span>
                문서와 가이드 탐색
              </div>
              <div>
                <span>02</span>
                즐겨찾기와 최근 문서
              </div>
              <div>
                <span>03</span>
                권한별 관리 기능
              </div>
            </div>
          </aside>

          <div id="form-ui">
            <form
              id="form"
              onSubmit={handleSubmit}
              autoComplete="on"
            >
              <div id="form-body">
                <div id="welcome-lines">
                  <span className="login-form-kicker">
                    다시 만나서 반가워요
                  </span>
                  <div id="welcome-line-1">
                    로그인
                  </div>
                  <div id="welcome-line-2">
                    계정 정보를 입력해 위키를 이용하세요.
                  </div>
                </div>

                <div id="input-area">
                  <label className="login-input-group">
                    <span className="login-field-label">
                      아이디
                    </span>

                    <span className="login-input-box">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <circle
                          cx="12"
                          cy="8"
                          r="4"
                        />
                        <path
                          d="M4.5 20a7.5 7.5 0 0 1 15 0"
                          strokeLinecap="round"
                        />
                      </svg>

                      <input
                        type="text"
                        name="username"
                        id="username"
                        required
                        className="login-input"
                        value={form.username}
                        onChange={handleChange}
                        autoComplete="username"
                        autoCapitalize="off"
                        autoCorrect="off"
                        placeholder="아이디 입력"
                        spellCheck={false}
                      />
                    </span>
                  </label>

                  <label className="login-input-group">
                    <span className="login-field-label">
                      비밀번호
                    </span>

                    <span className="login-input-box">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <rect
                          x="4"
                          y="10"
                          width="16"
                          height="10"
                          rx="3"
                        />
                        <path
                          d="M8 10V7a4 4 0 0 1 8 0v3"
                          strokeLinecap="round"
                        />
                      </svg>

                      <input
                        type="password"
                        name="password"
                        id="password"
                        required
                        className="login-input"
                        value={form.password}
                        onChange={handleChange}
                        autoComplete="current-password"
                        placeholder="비밀번호 입력"
                        spellCheck={false}
                      />
                    </span>
                  </label>
                </div>

                <div id="submit-button-cvr">
                  <button
                    id="submit-button"
                    type="submit"
                    disabled={loading}
                  >
                    {loading && (
                      <span className="login-button-spinner" />
                    )}
                    {loading
                      ? '로그인 중'
                      : '로그인'}
                  </button>
                </div>

                <div className="login-links">
                  <span>
                    아직 계정이 없나요?
                  </span>
                  <Link href="/register">
                    회원가입
                  </Link>
                </div>

                {message && (
                  <p
                    className={`login-message is-${messageTone}`}
                    aria-live="polite"
                  >
                    {message}
                  </p>
                )}

                <Link
                  className="login-back-link"
                  href="/"
                >
                  ← 홈페이지로 돌아가기
                </Link>
              </div>
            </form>
          </div>
        </section>
      </main>
    </div>
  );
}

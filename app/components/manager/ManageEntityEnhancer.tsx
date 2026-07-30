// =============================================
// File: app/components/manager/ManageEntityEnhancer.tsx
// 전체 코드 - 새 파일
//
// 적용 대상:
// - /manage/quest
// - /manage/npc
// - /manage/head
//
// 역할:
// - 대상 관리 페이지에만 디자인 스코프용 body 속성 부여
// - 실제 삭제 버튼을 누르면 비밀번호 확인 모달 표시
// - 승인된 DELETE 요청에만 서버 검증용 헤더를 한 번 추가
// - 기존 페이지의 삭제·저장·정렬·모달 로직은 그대로 실행
// =============================================

'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  createPortal,
} from 'react-dom';
import {
  usePathname,
} from 'next/navigation';

type ManageEntityKind =
  | 'quest'
  | 'npc'
  | 'head';

type DeletePrompt = {
  button: HTMLButtonElement;
  label: string;
};

const DELETE_PASSWORD = '1290';
const DELETE_PASSWORD_HEADER =
  'x-rdwiki-delete-password';

const GUARDED_DELETE_PATHS = [
  '/api/npcs/',
  '/api/head/',
  '/api/villages/',
] as const;

function getManageEntityKind(
  pathname: string | null,
): ManageEntityKind | null {
  if (!pathname) return null;

  if (
    pathname === '/manage/quest' ||
    pathname.startsWith('/manage/quest/')
  ) {
    return 'quest';
  }

  if (
    pathname === '/manage/npc' ||
    pathname.startsWith('/manage/npc/')
  ) {
    return 'npc';
  }

  if (
    pathname === '/manage/head' ||
    pathname.startsWith('/manage/head/')
  ) {
    return 'head';
  }

  return null;
}

function isGuardedDeleteUrl(
  rawUrl: string,
) {
  try {
    const url = new URL(
      rawUrl,
      window.location.origin,
    );

    return GUARDED_DELETE_PATHS.some(
      (prefix) =>
        url.pathname.startsWith(prefix),
    );
  } catch {
    return false;
  }
}

function getRequestUrl(
  input: RequestInfo | URL,
) {
  if (
    typeof input === 'string'
  ) {
    return input;
  }

  if (
    input instanceof URL
  ) {
    return input.toString();
  }

  return input.url;
}

function getRequestMethod(
  input: RequestInfo | URL,
  init?: RequestInit,
) {
  if (init?.method) {
    return String(
      init.method,
    ).toUpperCase();
  }

  if (
    typeof Request !== 'undefined' &&
    input instanceof Request
  ) {
    return input.method.toUpperCase();
  }

  return 'GET';
}

function buildAuthorizedRequest(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  password: string,
): [
  RequestInfo | URL,
  RequestInit | undefined,
] {
  const headers = new Headers();

  if (
    typeof Request !== 'undefined' &&
    input instanceof Request
  ) {
    input.headers.forEach(
      (value, key) => {
        headers.set(
          key,
          value,
        );
      },
    );
  }

  if (init?.headers) {
    new Headers(
      init.headers,
    ).forEach(
      (value, key) => {
        headers.set(
          key,
          value,
        );
      },
    );
  }

  headers.set(
    DELETE_PASSWORD_HEADER,
    password,
  );

  if (
    typeof Request !== 'undefined' &&
    input instanceof Request
  ) {
    return [
      new Request(
        input,
        {
          ...init,
          headers,
        },
      ),
      undefined,
    ];
  }

  return [
    input,
    {
      ...init,
      headers,
    },
  ];
}

function normalizeButtonLabel(
  button: HTMLButtonElement,
) {
  const raw = [
    button.getAttribute(
      'aria-label',
    ),
    button.getAttribute(
      'title',
    ),
    button.textContent,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const cleaned = raw
    .replace(
      /삭제/g,
      '',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();

  return cleaned || '선택한 항목';
}

function resolveDeleteButton(
  target: EventTarget | null,
): HTMLButtonElement | null {
  if (
    !(target instanceof Element)
  ) {
    return null;
  }

  const button = target.closest(
    'button',
  );

  if (
    !(button instanceof HTMLButtonElement)
  ) {
    return null;
  }

  if (
    button.disabled ||
    button.getAttribute(
      'aria-disabled',
    ) === 'true' ||
    button.closest(
      '[data-delete-guard-ignore]',
    )
  ) {
    return null;
  }

  // 사진 한 장, 보상 한 줄처럼 폼 내부의 임시 항목을 지우는 버튼은
  // 데이터베이스 삭제 제한 대상이 아니다.
  if (
    button.matches(
      '.rd-thumb-x, .rw-del-btn, [data-local-remove]',
    ) ||
    button.closest(
      '.rd-thumb, .rw-row',
    )
  ) {
    return null;
  }

  const label = [
    button.getAttribute(
      'aria-label',
    ),
    button.getAttribute(
      'title',
    ),
    button.textContent,
  ]
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  const isKnownDangerButton =
    button.classList.contains(
      'danger',
    ) &&
    (
      button.classList.contains(
        'seg-btn',
      ) ||
      button.classList.contains(
        'rd-btn',
      )
    );

  const isNamedDeleteButton =
    /(?:마을|NPC|엔피씨|퀘스트|머리|머리찾기)\s*삭제/i.test(
      label,
    );

  return (
    isKnownDangerButton ||
    isNamedDeleteButton
  )
    ? button
    : null;
}

export default function ManageEntityEnhancer() {
  const pathname = usePathname();

  const entityKind = useMemo(
    () =>
      getManageEntityKind(
        pathname,
      ),
    [pathname],
  );

  const [
    mounted,
    setMounted,
  ] = useState(false);

  const [
    prompt,
    setPrompt,
  ] = useState<DeletePrompt | null>(
    null,
  );

  const [
    password,
    setPassword,
  ] = useState('');

  const [
    error,
    setError,
  ] = useState('');

  const inputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const authorizedButtonsRef =
    useRef(
      new WeakSet<HTMLButtonElement>(),
    );

  const pendingPasswordRef =
    useRef<string | null>(
      null,
    );

  const bypassConfirmRef =
    useRef(false);

  const cleanupTimerRef =
    useRef<number | null>(
      null,
    );

  useEffect(() => {
    setMounted(true);

    return () => {
      setMounted(false);
    };
  }, []);

  useEffect(() => {
    const body =
      document.body;

    if (entityKind) {
      body.dataset.manageEntity =
        entityKind;
    } else {
      delete body.dataset.manageEntity;
    }

    return () => {
      if (
        body.dataset.manageEntity ===
        entityKind
      ) {
        delete body.dataset.manageEntity;
      }
    };
  }, [entityKind]);

  useEffect(() => {
    if (!entityKind) {
      setPrompt(null);
      setPassword('');
      setError('');
      return;
    }

    const originalFetch =
      window.fetch.bind(
        window,
      );

    const originalConfirm =
      window.confirm.bind(
        window,
      );

    const patchedConfirm = (
      message?: string,
    ) => {
      if (
        bypassConfirmRef.current &&
        /삭제|지우|제거/.test(
          String(
            message ?? '',
          ),
        )
      ) {
        bypassConfirmRef.current =
          false;
        return true;
      }

      return originalConfirm(
        message,
      );
    };

    const patchedFetch:
      typeof window.fetch =
      async (
        input,
        init,
      ) => {
        const method =
          getRequestMethod(
            input,
            init,
          );

        const rawUrl =
          getRequestUrl(
            input,
          );

        const pendingPassword =
          pendingPasswordRef.current;

        if (
          method === 'DELETE' &&
          pendingPassword &&
          isGuardedDeleteUrl(
            rawUrl,
          )
        ) {
          pendingPasswordRef.current =
            null;

          const [
            nextInput,
            nextInit,
          ] =
            buildAuthorizedRequest(
              input,
              init,
              pendingPassword,
            );

          return originalFetch(
            nextInput,
            nextInit,
          );
        }

        return originalFetch(
          input,
          init,
        );
      };

    const onDocumentClick = (
      event: MouseEvent,
    ) => {
      const button =
        resolveDeleteButton(
          event.target,
        );

      if (!button) return;

      if (
        authorizedButtonsRef.current.has(
          button,
        )
      ) {
        authorizedButtonsRef.current.delete(
          button,
        );
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      setPassword('');
      setError('');
      setPrompt({
        button,
        label:
          normalizeButtonLabel(
            button,
          ),
      });
    };

    window.confirm =
      patchedConfirm;
    window.fetch =
      patchedFetch;

    document.addEventListener(
      'click',
      onDocumentClick,
      true,
    );

    return () => {
      document.removeEventListener(
        'click',
        onDocumentClick,
        true,
      );

      if (
        window.confirm ===
        patchedConfirm
      ) {
        window.confirm =
          originalConfirm;
      }

      if (
        window.fetch ===
        patchedFetch
      ) {
        window.fetch =
          originalFetch;
      }

      pendingPasswordRef.current =
        null;
      bypassConfirmRef.current =
        false;

      if (
        cleanupTimerRef.current != null
      ) {
        window.clearTimeout(
          cleanupTimerRef.current,
        );
        cleanupTimerRef.current =
          null;
      }
    };
  }, [entityKind]);

  useEffect(() => {
    if (!prompt) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const focusTimer =
      window.setTimeout(
        () => {
          inputRef.current?.focus();
        },
        30,
      );

    const onKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === 'Escape'
      ) {
        setPrompt(null);
        setPassword('');
        setError('');
      }
    };

    window.addEventListener(
      'keydown',
      onKeyDown,
    );

    return () => {
      window.clearTimeout(
        focusTimer,
      );
      window.removeEventListener(
        'keydown',
        onKeyDown,
      );
      document.body.style.overflow =
        previousOverflow;
    };
  }, [prompt]);

  const closePrompt = () => {
    setPrompt(null);
    setPassword('');
    setError('');
  };

  const submitDelete = (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    if (!prompt) return;

    if (
      password !==
      DELETE_PASSWORD
    ) {
      setError(
        '비밀번호가 올바르지 않습니다.',
      );
      inputRef.current?.focus();
      inputRef.current?.select();
      return;
    }

    const targetButton =
      prompt.button;

    authorizedButtonsRef.current.add(
      targetButton,
    );

    pendingPasswordRef.current =
      password;
    bypassConfirmRef.current =
      true;

    setPrompt(null);
    setPassword('');
    setError('');

    if (
      cleanupTimerRef.current != null
    ) {
      window.clearTimeout(
        cleanupTimerRef.current,
      );
    }

    cleanupTimerRef.current =
      window.setTimeout(
        () => {
          pendingPasswordRef.current =
            null;
          bypassConfirmRef.current =
            false;
          cleanupTimerRef.current =
            null;
        },
        2500,
      );

    window.requestAnimationFrame(
      () => {
        if (
          !targetButton.isConnected ||
          targetButton.disabled
        ) {
          pendingPasswordRef.current =
            null;
          bypassConfirmRef.current =
            false;
          return;
        }

        targetButton.click();
      },
    );
  };

  if (
    !mounted ||
    !entityKind ||
    !prompt
  ) {
    return null;
  }

  return createPortal(
    <div
      className="manage-delete-guard-backdrop"
      data-delete-guard-ignore
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          closePrompt();
        }
      }}
    >
      <section
        className="manage-delete-guard-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="manage-delete-guard-title"
        aria-describedby="manage-delete-guard-description"
      >
        <div
          className="manage-delete-guard-icon"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path
              d="M12 8v5"
              strokeLinecap="round"
            />
            <path
              d="M12 17.25h.01"
              strokeLinecap="round"
            />
            <path
              d="M10.29 3.86 2.82 17a2 2 0 0 0 1.74 3h14.88a2 2 0 0 0 1.74-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="manage-delete-guard-heading">
          <span className="manage-delete-guard-eyebrow">
            삭제 제한
          </span>
          <h2
            id="manage-delete-guard-title"
          >
            {prompt.label}을(를) 삭제할까요?
          </h2>
          <p
            id="manage-delete-guard-description"
          >
            삭제 후에는 되돌릴 수 없습니다.
            계속하려면 관리 비밀번호를 입력하세요.
          </p>
        </div>

        <form
          className="manage-delete-guard-form"
          onSubmit={submitDelete}
        >
          <label
            className="manage-delete-guard-label"
            htmlFor="manage-delete-password"
          >
            삭제 비밀번호
          </label>

          <input
            ref={inputRef}
            id="manage-delete-password"
            className={
              'manage-delete-guard-input' +
              (
                error
                  ? ' is-error'
                  : ''
              )
            }
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={20}
            value={password}
            onChange={(event) => {
              setPassword(
                event.target.value,
              );

              if (error) {
                setError('');
              }
            }}
            aria-invalid={
              error
                ? true
                : undefined
            }
            aria-describedby={
              error
                ? 'manage-delete-guard-error'
                : undefined
            }
            placeholder="비밀번호 입력"
          />

          <div
            className="manage-delete-guard-message"
            aria-live="polite"
          >
            {error ? (
              <span
                id="manage-delete-guard-error"
              >
                {error}
              </span>
            ) : (
              <span>
                승인된 요청만 서버에서 처리됩니다.
              </span>
            )}
          </div>

          <div className="manage-delete-guard-actions">
            <button
              type="button"
              className="manage-delete-guard-button is-cancel"
              onClick={closePrompt}
            >
              취소
            </button>

            <button
              type="submit"
              className="manage-delete-guard-button is-delete"
              disabled={!password}
            >
              확인 후 삭제
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}

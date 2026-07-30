// =============================================
// File: app/components/wiki/FaqUpsertModal.tsx
// 전체 코드
//
// - 질문 생성 / 편집 공용 모달
// - 기존 /api/faq API 계약 유지
// - PUT 미지원 환경에서는 PATCH로 자동 재시도
// =============================================

'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';

type FaqInitial = {
  id: number;
  title: string;
  content: string;
  tags?: string[] | string;
  uploader?: string;
};

type Props = {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: FaqInitial | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

type FormState = {
  title: string;
  content: string;
  tags: string;
};

function initialToForm(
  initial?: FaqInitial | null,
): FormState {
  const rawTags =
    initial?.tags;

  const tags =
    Array.isArray(rawTags)
      ? rawTags.join(', ')
      : typeof rawTags === 'string'
        ? rawTags
        : '';

  return {
    title:
      initial?.title ??
      '',
    content:
      initial?.content ??
      '',
    tags,
  };
}

async function readResponseError(
  response: Response,
) {
  const data =
    await response
      .json()
      .catch(() => null);

  return String(
    data?.error ??
    data?.message ??
    '저장에 실패했습니다.',
  );
}

async function updateFaq(
  id: number,
  body: string,
) {
  const methods = [
    'PUT',
    'PATCH',
  ] as const;

  let lastResponse:
    Response | null = null;

  for (
    const method of methods
  ) {
    const response = await fetch(
      `/api/faq/${id}`,
      {
        method,
        headers: {
          'Content-Type':
            'application/json',
        },
        credentials: 'include',
        body,
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

export default function FaqUpsertModal({
  open,
  mode,
  initial,
  onClose,
  onSaved,
}: Props) {
  const titleId =
    useId();

  const [
    form,
    setForm,
  ] = useState<FormState>(
    () =>
      initialToForm(
        initial,
      ),
  );

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const titleInputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  useEffect(() => {
    if (!open) return;

    setForm(
      initialToForm(
        initial,
      ),
    );
    setError('');
    setSaving(false);

    const focusTimer =
      window.setTimeout(
        () => {
          titleInputRef.current?.focus();
        },
        40,
      );

    return () => {
      window.clearTimeout(
        focusTimer,
      );
    };
  }, [
    open,
    mode,
    initial?.id,
    initial?.title,
    initial?.content,
  ]);

  useEffect(() => {
    if (!open) return;

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
    open,
    saving,
    onClose,
  ]);

  const parsedTags =
    useMemo(
      () =>
        form.tags
          .split(',')
          .map((tag) =>
            tag.trim(),
          )
          .filter(Boolean)
          .slice(0, 12),
      [form.tags],
    );

  if (!open) return null;

  const setField = (
    field: keyof FormState,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));

    if (error) {
      setError('');
    }
  };

  const submit = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault();

    const title =
      form.title.trim();

    const content =
      form.content.trim();

    if (!title) {
      setError(
        '질문 제목을 입력해주세요.',
      );
      titleInputRef.current?.focus();
      return;
    }

    if (!content) {
      setError(
        '답변 내용을 입력해주세요.',
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      const body =
        JSON.stringify({
          title,
          content,
          tags:
            parsedTags.join(','),
        });

      const response =
        mode === 'edit'
          ? initial?.id
            ? await updateFaq(
                initial.id,
                body,
              )
            : new Response(
                null,
                {
                  status: 400,
                },
              )
          : await fetch(
              '/api/faq',
              {
                method: 'POST',
                headers: {
                  'Content-Type':
                    'application/json',
                },
                credentials:
                  'include',
                body,
              },
            );

      if (!response.ok) {
        throw new Error(
          await readResponseError(
            response,
          ),
        );
      }

      await onSaved();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : '저장에 실패했습니다.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="faq-upsert-backdrop"
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
        className="faq-upsert-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="faq-upsert-header">
          <div className="faq-upsert-heading">
            <span
              className="faq-upsert-icon"
              aria-hidden="true"
            >
              Q
            </span>

            <div>
              <span className="faq-upsert-eyebrow">
                FAQ 관리
              </span>

              <h2 id={titleId}>
                {mode === 'create'
                  ? '질문 추가'
                  : '질문 편집'}
              </h2>

              <p>
                자주 찾는 정보를 짧고 명확하게 정리합니다.
              </p>
            </div>
          </div>

          <button
            type="button"
            className="faq-modal-close"
            onClick={onClose}
            disabled={saving}
            aria-label="질문 편집 닫기"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path
                d="m6 6 12 12M18 6 6 18"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </header>

        <form
          className="faq-upsert-form"
          onSubmit={submit}
        >
          <div className="faq-upsert-body">
            <label className="faq-form-field">
              <span>
                질문
                <em>필수</em>
              </span>

              <input
                ref={titleInputRef}
                value={form.title}
                onChange={(event) =>
                  setField(
                    'title',
                    event.target.value,
                  )
                }
                maxLength={160}
                placeholder="질문 제목을 입력하세요"
                disabled={saving}
              />

              <small>
                {form.title.length}/160
              </small>
            </label>

            <label className="faq-form-field">
              <span>
                답변
                <em>필수</em>
              </span>

              <textarea
                value={form.content}
                onChange={(event) =>
                  setField(
                    'content',
                    event.target.value,
                  )
                }
                rows={8}
                maxLength={5000}
                placeholder="사용자가 바로 이해할 수 있도록 답변을 작성하세요"
                disabled={saving}
              />

              <small>
                {form.content.length}/5000
              </small>
            </label>

            <label className="faq-form-field">
              <span>
                태그
                <b>선택</b>
              </span>

              <input
                value={form.tags}
                onChange={(event) =>
                  setField(
                    'tags',
                    event.target.value,
                  )
                }
                placeholder="뉴비, 설정, 시스템"
                disabled={saving}
              />

              <small>
                쉼표로 구분해 최대 12개까지 입력할 수 있습니다.
              </small>
            </label>

            {parsedTags.length > 0 && (
              <div className="faq-form-tag-preview">
                {parsedTags.map(
                  (tag) => (
                    <span key={tag}>
                      #{tag}
                    </span>
                  ),
                )}
              </div>
            )}

            <div
              className={
                'faq-form-message' +
                (
                  error
                    ? ' is-error'
                    : ''
                )
              }
              aria-live="polite"
            >
              {error || (
                mode === 'create'
                  ? '저장하면 질문 목록에 바로 반영됩니다.'
                  : '기존 질문의 내용이 변경됩니다.'
              )}
            </div>
          </div>

          <footer className="faq-upsert-actions">
            <button
              type="button"
              className="faq-upsert-cancel"
              onClick={onClose}
              disabled={saving}
            >
              취소
            </button>

            <button
              type="submit"
              className="faq-upsert-submit"
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="faq-button-spinner" />
                  저장 중
                </>
              ) : (
                mode === 'create'
                  ? '질문 추가'
                  : '변경 사항 저장'
              )}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}

// =============================================
// File: app/components/wiki/FaqList.tsx
// 전체 코드
//
// - 기존 FAQ 문서 목록 디자인 복원
// - 기존 FAQ 상세 모달 디자인 복원
// - writer / manager / admin에게 항목별 편집 버튼만 추가
// - admin 삭제 메뉴 유지
// - 질문 추가·편집 모달은 FaqUpsertModal을 그대로 사용
// =============================================

'use client';

import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  createPortal,
} from 'react-dom';

import FaqUpsertModal from '@/components/wiki/FaqUpsertModal';
import {
  recordFaqView,
} from '@/wiki/lib/faqView';

type User = {
  id: number;
  username: string;
  minecraft_name: string;
  email: string;
} | null;

export type FaqItem = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  uploader: string;
  created_at?: string;
  updated_at?: string;
};

type AuthFlags = {
  canWrite: boolean;
  isAdmin: boolean;
};

type MenuState = {
  open: boolean;
  id: number | null;
  x: number;
  y: number;
};

const CLOSED_MENU: MenuState = {
  open: false,
  id: null,
  x: 0,
  y: 0,
};

function normalizeRoleList(
  value: unknown,
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (
        item &&
        typeof item === 'object'
      ) {
        const row =
          item as Record<string, unknown>;

        return String(
          row.name ??
          row.role ??
          row.permission ??
          row.key ??
          '',
        ).toLowerCase();
      }

      return String(
        item ?? '',
      ).toLowerCase();
    })
    .filter(Boolean);
}

function useAuthFlags(
  user: User,
) {
  const [
    flags,
    setFlags,
  ] = useState<AuthFlags>({
    canWrite: false,
    isAdmin: false,
  });

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setFlags({
        canWrite: false,
        isAdmin: false,
      });
      return;
    }

    void (async () => {
      try {
        const response = await fetch(
          '/api/auth/me',
          {
            cache: 'no-store',
            credentials: 'include',
          },
        );

        if (!response.ok) {
          throw new Error(
            `auth-fetch-failed:${response.status}`,
          );
        }

        const data =
          await response.json();

        const role = String(
          data?.role ??
          data?.user?.role ??
          '',
        ).toLowerCase();

        const roles = normalizeRoleList(
          data?.roles ??
          data?.permissions ??
          data?.user?.roles ??
          data?.user?.permissions,
        );

        const isAdmin =
          Boolean(
            data?.isAdmin ??
            data?.user?.isAdmin,
          ) ||
          role === 'admin' ||
          roles.includes('admin');

        const canWrite =
          Boolean(
            data?.canWrite ??
            data?.user?.canWrite,
          ) ||
          isAdmin ||
          role === 'writer' ||
          role === 'manager' ||
          roles.includes('writer') ||
          roles.includes('manager');

        if (!cancelled) {
          setFlags({
            canWrite,
            isAdmin,
          });
        }
      } catch {
        if (!cancelled) {
          setFlags({
            canWrite: false,
            isAdmin: false,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return flags;
}

function normalizeFaqItem(
  value: unknown,
): FaqItem | null {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return null;
  }

  const row =
    value as Record<string, unknown>;

  const id =
    Number(row.id);

  if (!Number.isFinite(id)) {
    return null;
  }

  const rawTags =
    row.tags;

  const tags = Array.isArray(rawTags)
    ? rawTags
        .map((tag) =>
          String(tag).trim(),
        )
        .filter(Boolean)
    : String(rawTags ?? '')
        .split(',')
        .map((tag) =>
          tag.trim(),
        )
        .filter(Boolean);

  return {
    id,
    title:
      String(row.title ?? ''),
    content:
      String(row.content ?? ''),
    tags,
    uploader:
      String(
        row.uploader ??
        row.username ??
        '',
      ),
    created_at:
      row.created_at == null
        ? undefined
        : String(row.created_at),
    updated_at:
      row.updated_at == null
        ? undefined
        : String(row.updated_at),
  };
}

export async function fetchFaqDetail(
  id: number,
): Promise<FaqItem | null> {
  try {
    const response = await fetch(
      `/api/faq/${id}`,
      {
        cache: 'no-store',
        credentials: 'include',
      },
    );

    if (!response.ok) {
      return null;
    }

    return normalizeFaqItem(
      await response.json(),
    );
  } catch (error) {
    console.error(
      '[FAQ detail] failed',
      error,
    );

    return null;
  }
}

export function FaqDetailModal({
  sel,
  onClose,
}: {
  sel: FaqItem;
  onClose: () => void;
}) {
  const [portalReady, setPortalReady] =
    useState(false);

  useEffect(() => {
    setPortalReady(true);

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      'hidden';

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );

      document.body.style.overflow =
        previousOverflow;
    };
  }, [onClose]);

  if (
    !portalReady ||
    typeof document === 'undefined'
  ) {
    return null;
  }

  return createPortal(
    <div
      className="faq-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <div
        className="faq-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={
          `faq-detail-title-${sel.id}`
        }
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="faq-modal-header">
          <div className="faq-modal-title">
            <span
              className="faq-qa q"
              aria-hidden="true"
            >
              Q
            </span>

            <h3
              id={
                `faq-detail-title-${sel.id}`
              }
            >
              {sel.title}
            </h3>
          </div>

          <button
            type="button"
            className="faq-modal-close"
            onClick={onClose}
            aria-label="질문 상세 닫기"
          >
            ✕
          </button>
        </div>

        <div className="faq-modal-body">
          <div className="qa-line a">
            <span
              className="faq-qa a"
              aria-hidden="true"
            >
              A
            </span>

            <p className="qa-text">
              {sel.content}
            </p>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Props = {
  query?: string;
  tags?: string[];
  user: User;
  refreshSignal?: number;
};

export default function FaqList({
  query = '',
  tags = [],
  user,
  refreshSignal = 0,
}: Props) {
  const {
    canWrite,
    isAdmin,
  } = useAuthFlags(user);

  const [
    items,
    setItems,
  ] = useState<FaqItem[]>([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    selected,
    setSelected,
  ] = useState<FaqItem | null>(
    null,
  );

  const [
    editTarget,
    setEditTarget,
  ] = useState<FaqItem | null>(
    null,
  );

  const [
    menu,
    setMenu,
  ] = useState<MenuState>(
    CLOSED_MENU,
  );

  const [
    bottomSearch,
    setBottomSearch,
  ] = useState('');

  const [
    page,
    setPage,
  ] = useState(0);

  const [
    isMobile,
    setIsMobile,
  ] = useState(false);

  const pageSize =
    isMobile
      ? 10
      : 12;

  const maxVisiblePageButtons =
    isMobile
      ? 5
      : Number.MAX_SAFE_INTEGER;

  useEffect(() => {
    const media =
      window.matchMedia(
        '(max-width: 768px)',
      );

    const apply = () => {
      setIsMobile(
        media.matches,
      );
    };

    apply();

    if (
      typeof media.addEventListener ===
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
      media.removeListener(apply);
    };
  }, []);

  const requestQuery =
    useMemo(
      () => {
        const params =
          new URLSearchParams();

        if (query.trim()) {
          params.set(
            'q',
            query.trim(),
          );
        }

        if (tags.length > 0) {
          params.set(
            'tags',
            tags.join(','),
          );
        }

        return params.toString();
      },
      [query, tags],
    );

  const refresh = async () => {
    setLoading(true);

    try {
      const collected: FaqItem[] = [];
      const limit = 100;
      let offset = 0;

      for (
        let round = 0;
        round < 200;
        round += 1
      ) {
        const params =
          new URLSearchParams(
            requestQuery,
          );

        params.set(
          'limit',
          String(limit),
        );

        params.set(
          'offset',
          String(offset),
        );

        const response = await fetch(
          `/api/faq?${params.toString()}`,
          {
            cache: 'no-store',
            credentials: 'include',
          },
        );

        if (!response.ok) {
          throw new Error(
            `faq-list-failed:${response.status}`,
          );
        }

        const data =
          await response.json();

        const rows: unknown[] =
          Array.isArray(data?.items)
            ? data.items
            : Array.isArray(data)
              ? data
              : [];

        const chunk = rows
          .map(normalizeFaqItem)
          .filter(
            (
              item,
            ): item is FaqItem =>
              item !== null,
          );

        collected.push(
          ...chunk,
        );

        if (
          rows.length <
          limit
        ) {
          break;
        }

        offset += limit;
      }

      setItems(
        collected,
      );
    } catch (error) {
      console.error(
        '[FAQ list] failed',
        error,
      );

      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestQuery]);

  useEffect(() => {
    if (
      refreshSignal === 0
    ) {
      return;
    }

    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshSignal]);

  useEffect(() => {
    if (!menu.open) {
      return;
    }

    const closeMenu = () => {
      setMenu(
        CLOSED_MENU,
      );
    };

    const handlePointer = (
      event: Event,
    ) => {
      const target =
        event.target as HTMLElement | null;

      if (
        !target?.closest(
          '.faq-popover',
        ) &&
        !target?.closest(
          '.faq-menu-btn',
        )
      ) {
        closeMenu();
      }
    };

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        closeMenu();
      }
    };

    document.addEventListener(
      'mousedown',
      handlePointer,
      true,
    );

    document.addEventListener(
      'touchstart',
      handlePointer,
      true,
    );

    document.addEventListener(
      'scroll',
      handlePointer,
      true,
    );

    window.addEventListener(
      'resize',
      closeMenu,
      {
        passive: true,
      },
    );

    window.addEventListener(
      'keydown',
      handleKeyDown,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        handlePointer,
        true,
      );

      document.removeEventListener(
        'touchstart',
        handlePointer,
        true,
      );

      document.removeEventListener(
        'scroll',
        handlePointer,
        true,
      );

      window.removeEventListener(
        'resize',
        closeMenu,
      );

      window.removeEventListener(
        'keydown',
        handleKeyDown,
      );
    };
  }, [menu.open]);

  const normalizedSearch =
    bottomSearch
      .trim()
      .toLowerCase();

  const filteredItems =
    useMemo(
      () => {
        if (!normalizedSearch) {
          return items;
        }

        return items.filter(
          (item) => {
            const searchable = [
              item.title,
              item.content,
              item.uploader,
              item.tags.join(' '),
            ]
              .join(' ')
              .toLowerCase();

            return searchable.includes(
              normalizedSearch,
            );
          },
        );
      },
      [
        items,
        normalizedSearch,
      ],
    );

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        filteredItems.length /
        pageSize,
      ),
    );

  useEffect(() => {
    setPage((current) =>
      Math.min(
        current,
        pageCount - 1,
      ),
    );
  }, [pageCount]);

  useEffect(() => {
    setPage(0);
  }, [
    normalizedSearch,
    isMobile,
  ]);

  const visibleItems =
    useMemo(
      () =>
        filteredItems.slice(
          page * pageSize,
          (page + 1) *
          pageSize,
        ),
      [
        filteredItems,
        page,
        pageSize,
      ],
    );

  const visiblePageNumbers =
    useMemo(
      () => {
        if (
          !isMobile ||
          pageCount <=
          maxVisiblePageButtons
        ) {
          return Array.from(
            {
              length: pageCount,
            },
            (_, index) =>
              index,
          );
        }

        const half =
          Math.floor(
            maxVisiblePageButtons /
            2,
          );

        let start =
          Math.max(
            0,
            page - half,
          );

        let end =
          start +
          maxVisiblePageButtons -
          1;

        if (
          end >=
          pageCount
        ) {
          end =
            pageCount -
            1;

          start =
            Math.max(
              0,
              end -
              maxVisiblePageButtons +
              1,
            );
        }

        return Array.from(
          {
            length:
              end -
              start +
              1,
          },
          (_, index) =>
            start +
            index,
        );
      },
      [
        isMobile,
        page,
        pageCount,
        maxVisiblePageButtons,
      ],
    );

  const openDetail = async (
    item: FaqItem,
  ) => {
    const fresh =
      await fetchFaqDetail(
        item.id,
      );

    setSelected(
      fresh ??
      item,
    );

    void recordFaqView(
      item.id,
      'list',
    );
  };

  const openEdit = async (
    item: FaqItem,
  ) => {
    const fresh =
      await fetchFaqDetail(
        item.id,
      );

    setEditTarget(
      fresh ??
      item,
    );
  };

  const handleDelete = async (
    id: number,
  ) => {
    if (
      !window.confirm(
        '정말 삭제할까요?',
      )
    ) {
      return;
    }

    const response = await fetch(
      `/api/faq/${id}`,
      {
        method: 'DELETE',
        credentials: 'include',
      },
    );

    if (response.ok) {
      if (
        selected?.id ===
        id
      ) {
        setSelected(null);
      }

      await refresh();
    }
  };

  return (
    <div className="faq-wrap">
      <div className="faq-list-card">
        {loading ? (
          <div className="faq-row muted">
            불러오는 중…
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="faq-row muted">
            {normalizedSearch
              ? '검색 결과가 없습니다.'
              : '등록된 질문이 없습니다.'}
          </div>
        ) : (
          visibleItems.map(
            (item) => (
              <div
                key={item.id}
                className="faq-row"
              >
                <button
                  type="button"
                  className="faq-title"
                  onClick={() => {
                    void openDetail(
                      item,
                    );
                  }}
                  title={item.title}
                >
                  <span
                    className="faq-q"
                    aria-hidden="true"
                  >
                    Q
                  </span>

                  <span className="faq-title-text">
                    {item.title}
                  </span>
                </button>

                {canWrite && (
                  <div className="faq-row-actions">
                    <button
                      type="button"
                      className="faq-inline-edit"
                      onClick={(event) => {
                        event.stopPropagation();

                        void openEdit(
                          item,
                        );
                      }}
                      title="질문 편집"
                      aria-label={
                        `${item.title} 편집`
                      }
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 20h9"
                          strokeLinecap="round"
                        />
                        <path
                          d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>

                      <span>편집</span>
                    </button>

                    {isAdmin && (
                      <div className="faq-menu">
                        <button
                          type="button"
                          className="faq-menu-btn"
                          aria-label={
                            `${item.title} 관리 메뉴`
                          }
                          aria-expanded={
                            menu.open &&
                            menu.id ===
                            item.id
                          }
                          onClick={(event) => {
                            event.stopPropagation();

                            const rect =
                              event.currentTarget
                                .getBoundingClientRect();

                            const width = 104;

                            const x =
                              Math.min(
                                window.innerWidth -
                                width -
                                8,
                                Math.max(
                                  8,
                                  rect.right -
                                  width,
                                ),
                              );

                            const y =
                              rect.bottom +
                              6;

                            setMenu((current) =>
                              current.open &&
                              current.id ===
                              item.id
                                ? CLOSED_MENU
                                : {
                                    open: true,
                                    id: item.id,
                                    x,
                                    y,
                                  },
                            );
                          }}
                        >
                          ⋯
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ),
          )
        )}
      </div>

      <div className="faq-between-spacer" />

      {pageCount > 1 && (
        <div className="faq-paging">
          <div className="faq-paging-seg">
            <button
              type="button"
              className="faq-page-btn"
              onClick={() => {
                setPage((current) =>
                  Math.max(
                    0,
                    current -
                    1,
                  ),
                );
              }}
              disabled={
                page === 0
              }
              aria-label="이전 페이지"
            >
              ‹
            </button>

            <ol className="faq-pages">
              {visiblePageNumbers.map(
                (pageNumber) => (
                  <li key={pageNumber}>
                    <button
                      type="button"
                      className={
                        pageNumber ===
                        page
                          ? 'faq-page active'
                          : 'faq-page'
                      }
                      onClick={() => {
                        setPage(
                          pageNumber,
                        );
                      }}
                      aria-current={
                        pageNumber ===
                        page
                          ? 'page'
                          : undefined
                      }
                    >
                      {pageNumber + 1}
                    </button>
                  </li>
                ),
              )}
            </ol>

            <button
              type="button"
              className="faq-page-btn next"
              onClick={() => {
                setPage((current) =>
                  Math.min(
                    pageCount -
                    1,
                    current +
                    1,
                  ),
                );
              }}
              disabled={
                page ===
                pageCount -
                1
              }
              aria-label="다음 페이지"
            >
              ›
            </button>
          </div>
        </div>
      )}

      <div className="faq-bottom-search">
        <label className="faq-search-box">
          <svg
            className="faq-search-ico"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle
              cx="11"
              cy="11"
              r="7"
            />
            <path
              d="m20 20-3.4-3.4"
              strokeLinecap="round"
            />
          </svg>

          <input
            value={bottomSearch}
            onChange={(event) => {
              setBottomSearch(
                event.target.value,
              );
            }}
            placeholder="목록 내 검색"
            aria-label="FAQ 목록 내 검색"
          />

          {bottomSearch && (
            <button
              type="button"
              className="faq-search-clear"
              onClick={() => {
                setBottomSearch('');
              }}
              aria-label="검색어 지우기"
            >
              ×
            </button>
          )}
        </label>
      </div>

      {menu.open && (
        <div
          className="faq-menu-pop faq-popover"
          style={{
            position: 'fixed',
            left: menu.x,
            top: menu.y,
            zIndex: 2500,
            width: 104,
            padding: 4,
          }}
        >
          <button
            type="button"
            style={{
              width: '100%',
              minHeight: 34,
              padding: '0 10px',
              color: '#d24646',
              textAlign: 'left',
              cursor: 'pointer',
              background: 'transparent',
              border: 0,
              borderRadius: 7,
            }}
            onClick={() => {
              const id =
                menu.id;

              setMenu(
                CLOSED_MENU,
              );

              if (id != null) {
                void handleDelete(
                  id,
                );
              }
            }}
          >
            삭제
          </button>
        </div>
      )}

      {selected && (
        <FaqDetailModal
          sel={selected}
          onClose={() => {
            setSelected(null);
          }}
        />
      )}

      {editTarget && (
        <FaqUpsertModal
          open
          mode="edit"
          initial={editTarget}
          onClose={() => {
            setEditTarget(null);
          }}
          onSaved={async () => {
            const editedId =
              editTarget.id;

            setEditTarget(null);

            await refresh();

            if (
              selected?.id ===
              editedId
            ) {
              const fresh =
                await fetchFaqDetail(
                  editedId,
                );

              if (fresh) {
                setSelected(
                  fresh,
                );
              }
            }
          }}
        />
      )}
    </div>
  );
}

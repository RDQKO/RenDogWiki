// =============================================
// File: app/components/common/SearchBox.tsx
// 전체 코드
//
// - Home과 Wiki Header에서 공통 사용
// - 문서 / 본문·목차 / 태그 검색
// - 퀘스트 NPC 검색 및 상위 상세 모달 연결
// - FAQ 검색, 최신 상세 조회, 열람수 기록
// - 인기 검색어 칩의 외부 검색 요청 지원
// - 검색어 선택 집계 유지
// - 키보드 탐색, 외부 클릭, ESC 동작 유지
// - 명시적인 검색 초기화 X 버튼 사용
// - 마우스가 결과 영역을 벗어나면 강조 해제
// - FAQ 모달은 document.body portal로 렌더링
// - 홈/문서 헤더의 containing block 영향을 받지 않음
// =============================================

'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEventHandler,
} from 'react';
import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';

import { toProxyUrl } from '@lib/cdn';
import {
  recordFaqView,
} from '@/wiki/lib/faqView';
import {
  createSearchSessionId,
  recordCommittedSearch,
  SEARCH_QUERY_REQUEST_EVENT,
  type SearchCommitResultType,
} from '@/wiki/lib/searchPopularity';
import {
  markNextDocViewSource,
} from '@/wiki/lib/viewSource';

import '@/wiki/css/searchBox.css';

type DocResult = {
  id: number;
  title: string;
  path: string | number;
  icon?: string;
  tags: string[];
  match_type:
    | 'title'
    | 'tags'
    | 'content';
  category_breadcrumb?: string;
  section_heading?: string | null;
  section_dom_id?: string | null;
  section_level?: 1 | 2 | 3 | null;
  section_snippet?: string | null;
  section_match_source?:
    | 'heading'
    | 'body'
    | null;
};

type FaqItem = {
  id: number;
  title: string;
  content: string;
  tags: string[];
  uploader: string;
  created_at?: string;
  updated_at?: string;
};

type QuestNpcResult = {
  id: number;
  name: string;
  icon?: string | null;
  village_name?: string | null;
};

type SearchResultItem =
  | {
      kind: 'doc';
      id: number;
      data: DocResult;
    }
  | {
      kind: 'quest';
      id: number;
      data: QuestNpcResult;
    };

type SearchCommitState = {
  queryKey: string;
  sessionId: string;
  committed: boolean;
};

type SearchQueryRequestDetail = {
  keyword?: unknown;
};

type Props = {
  /** 헤더 안 정렬 */
  align?: 'center' | 'left';

  /** 검색창 전체 너비 */
  width?: string;

  /** 기존 호출부 호환용 */
  paddingLeft?: number;

  /** 퀘스트 NPC 결과 클릭 시 상위 모달 열기 */
  onQuestNpcClick?: (
    id: number,
  ) => void;

  /**
   * SearchBox 외부에서 열린 상세 모달 상태.
   * true인 동안 모달 클릭을 검색창 외부 클릭으로 처리하지 않는다.
   */
  resultModalOpen?: boolean;
};

function normalizeSearchText(
  value: string,
) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');
}

function isSectionHeadingHighlighted(
  heading: string,
  keyword: string,
) {
  const normalizedHeading =
    normalizeSearchText(heading);
  const normalizedKeyword =
    normalizeSearchText(keyword);

  if (
    !normalizedHeading ||
    !normalizedKeyword
  ) {
    return false;
  }

  return normalizedHeading.includes(
    normalizedKeyword,
  );
}

function buildCompactIndexMap(
  text: string,
) {
  const compactChars: string[] = [];
  const indexMap: number[] = [];

  for (
    let index = 0;
    index < text.length;
    index += 1
  ) {
    const character = text[index];

    if (/\s/.test(character)) {
      continue;
    }

    compactChars.push(
      character.toLowerCase(),
    );
    indexMap.push(index);
  }

  return {
    compact: compactChars.join(''),
    indexMap,
  };
}

function findLooseMatchRange(
  text: string,
  keyword: string,
): {
  start: number;
  end: number;
} | null {
  if (!text || !keyword) {
    return null;
  }

  const normalizedKeyword =
    normalizeSearchText(keyword);

  if (!normalizedKeyword) {
    return null;
  }

  const {
    compact,
    indexMap,
  } = buildCompactIndexMap(text);

  const compactIndex =
    compact.indexOf(
      normalizedKeyword,
    );

  if (compactIndex < 0) {
    return null;
  }

  const start =
    indexMap[compactIndex];

  const compactEnd =
    compactIndex +
    normalizedKeyword.length -
    1;

  const end =
    (indexMap[compactEnd] ??
      start) + 1;

  return {
    start,
    end,
  };
}

function highlight(
  text: string,
  keyword: string,
) {
  if (!keyword) {
    return text;
  }

  const range =
    findLooseMatchRange(
      text,
      keyword,
    );

  if (!range) {
    return text;
  }

  return (
    <>
      {range.start > 0
        ? text.slice(
            0,
            range.start,
          )
        : null}

      <mark className="search-highlight">
        {text.slice(
          range.start,
          range.end,
        )}
      </mark>

      {range.end < text.length
        ? text.slice(range.end)
        : null}
    </>
  );
}

const isImageLike = (
  value?: string | null,
) =>
  Boolean(
    value &&
      (/^https?:\/\//i.test(
        value,
      ) ||
        value.startsWith(
          'data:image',
        ) ||
        value.startsWith('/')),
  );

const isRemoteHttp = (
  value?: string | null,
) =>
  Boolean(
    value &&
      /^https?:\/\//i.test(value),
  );

function normalizeTag(
  raw: string,
) {
  return String(raw ?? '')
    .replace(/^#+\s*/, '')
    .trim();
}

function escapeRegexCharacter(
  character: string,
) {
  return character.replace(
    /[.*+?^${}()|[\]\\]/g,
    '\\$&',
  );
}

function makeLooseRegex(
  keyword: string,
) {
  const compact =
    normalizeSearchText(keyword);

  if (!compact) {
    return null;
  }

  try {
    return new RegExp(
      compact
        .split('')
        .map(
          escapeRegexCharacter,
        )
        .join('.*'),
      'i',
    );
  } catch {
    return null;
  }
}

function isTagMatched(
  tag: string,
  keyword: string,
) {
  const cleanTag =
    normalizeTag(tag);
  const query =
    String(keyword ?? '').trim();

  if (!cleanTag || !query) {
    return false;
  }

  const lowerTag =
    cleanTag.toLowerCase();
  const lowerQuery =
    query.toLowerCase();

  if (
    lowerTag.includes(lowerQuery)
  ) {
    return true;
  }

  const compactTag =
    normalizeSearchText(cleanTag);
  const compactQuery =
    normalizeSearchText(query);

  if (
    compactQuery &&
    compactTag.includes(
      compactQuery,
    )
  ) {
    return true;
  }

  if (compactQuery.length >= 2) {
    const looseRegex =
      makeLooseRegex(query);

    if (
      looseRegex &&
      looseRegex.test(compactTag)
    ) {
      return true;
    }
  }

  return false;
}

function getDocumentPriority(
  document: DocResult,
) {
  if (
    document.match_type ===
    'title'
  ) {
    return 0;
  }

  if (
    document.match_type ===
      'content' &&
    document.section_match_source ===
      'heading'
  ) {
    return 1;
  }

  if (
    document.match_type ===
    'tags'
  ) {
    return 2;
  }

  if (
    document.match_type ===
      'content' &&
    document.section_match_source ===
      'body'
  ) {
    return 3;
  }

  if (
    document.match_type ===
    'content'
  ) {
    return 4;
  }

  return 99;
}

function SearchIcon() {
  return (
    <svg
      className="search-icon"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M10.8 3.5a7.3 7.3 0 1 0 4.55 13.01l4.07 4.07 1.16-1.16-4.07-4.07A7.3 7.3 0 0 0 10.8 3.5Zm0 1.65a5.65 5.65 0 1 1 0 11.3 5.65 5.65 0 0 1 0-11.3Z" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5" />
    </svg>
  );
}

export default function SearchBox({
  align = 'center',
  width =
    'min(720px, 56vw)',
  paddingLeft = 100,
  onQuestNpcClick,
  resultModalOpen = false,
}: Props) {
  void paddingLeft;

  const [
    query,
    setQuery,
  ] = useState('');

  const [
    open,
    setOpen,
  ] = useState(false);

  const [
    docs,
    setDocs,
  ] = useState<DocResult[]>([]);

  const [
    loadingDocs,
    setLoadingDocs,
  ] = useState(false);

  const [
    questNpcs,
    setQuestNpcs,
  ] = useState<
    QuestNpcResult[]
  >([]);

  const [
    loadingQuestNpcs,
    setLoadingQuestNpcs,
  ] = useState(false);

  const [
    faqs,
    setFaqs,
  ] = useState<FaqItem[]>([]);

  const [
    loadingFaqs,
    setLoadingFaqs,
  ] = useState(false);

  const [
    activeDocIndex,
    setActiveDocIndex,
  ] = useState(-1);

  const [
    faqView,
    setFaqView,
  ] = useState<FaqItem | null>(
    null,
  );

  const [
    portalReady,
    setPortalReady,
  ] = useState(false);

  const inputRef =
    useRef<HTMLInputElement | null>(
      null,
    );

  const wrapRef =
    useRef<HTMLDivElement | null>(
      null,
    );

  const abortDocsRef =
    useRef<AbortController | null>(
      null,
    );

  const abortQuestNpcRef =
    useRef<AbortController | null>(
      null,
    );

  const abortFaqRef =
    useRef<AbortController | null>(
      null,
    );

  const timerRef =
    useRef<number | null>(null);

  const faqTimerRef =
    useRef<number | null>(null);

  const searchCommitRef =
    useRef<SearchCommitState>({
      queryKey: '',
      sessionId:
        createSearchSessionId(),
      committed: false,
    });

  const router = useRouter();

  const listId =
    useMemo(
      () =>
        `search-list-${Math.random()
          .toString(36)
          .slice(2)}`,
      [],
    );

  const syncSearchCommitSession =
    useCallback(
      (value: string) => {
        const queryKey =
          normalizeSearchText(
            value,
          );

        if (
          queryKey !==
          searchCommitRef.current
            .queryKey
        ) {
          searchCommitRef.current =
            {
              queryKey,
              sessionId:
                createSearchSessionId(),
              committed: false,
            };
        }

        return searchCommitRef.current;
      },
      [],
    );

  const updateQuery =
    useCallback(
      (value: string) => {
        syncSearchCommitSession(
          value,
        );

        setQuery(value);
        setActiveDocIndex(-1);
      },
      [
        syncSearchCommitSession,
      ],
    );

  const commitCurrentSearch =
    useCallback(
      (
        resultType:
          SearchCommitResultType,
      ) => {
        const keyword =
          String(query ?? '')
            .replace(
              /\s+/g,
              ' ',
            )
            .trim();

        if (
          normalizeSearchText(
            keyword,
          ).length < 2
        ) {
          return;
        }

        const session =
          syncSearchCommitSession(
            keyword,
          );

        if (session.committed) {
          return;
        }

        session.committed = true;

        void recordCommittedSearch({
          keyword,
          sessionId:
            session.sessionId,
          resultType,
        });
      },
      [
        query,
        syncSearchCommitSession,
      ],
    );

  useEffect(() => {
    setPortalReady(true);

    return () => {
      setPortalReady(false);
    };
  }, []);

  useEffect(() => {
    if (!faqView) {
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
        setFaqView(null);
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
  }, [faqView]);

  useEffect(() => {
    const onSearchQueryRequest = (
      event: Event,
    ) => {
      const customEvent =
        event as CustomEvent<
          SearchQueryRequestDetail
        >;

      const requestedKeyword =
        String(
          customEvent.detail
            ?.keyword ?? '',
        )
          .replace(/\s+/g, ' ')
          .trim();

      if (
        normalizeSearchText(
          requestedKeyword,
        ).length < 2
      ) {
        return;
      }

      updateQuery(
        requestedKeyword,
      );
      setOpen(true);

      window.requestAnimationFrame(
        () => {
          inputRef.current?.focus();
        },
      );
    };

    window.addEventListener(
      SEARCH_QUERY_REQUEST_EVENT,
      onSearchQueryRequest,
    );

    return () => {
      window.removeEventListener(
        SEARCH_QUERY_REQUEST_EVENT,
        onSearchQueryRequest,
      );
    };
  }, [updateQuery]);

  const sortedDocs =
    useMemo(() => {
      return docs
        .map(
          (
            document,
            index,
          ) => ({
            document,
            index,
          }),
        )
        .sort(
          (
            first,
            second,
          ) => {
            const firstPriority =
              getDocumentPriority(
                first.document,
              );

            const secondPriority =
              getDocumentPriority(
                second.document,
              );

            if (
              firstPriority !==
              secondPriority
            ) {
              return (
                firstPriority -
                secondPriority
              );
            }

            return (
              first.index -
              second.index
            );
          },
        )
        .map(
          ({
            document,
          }) => document,
        );
    }, [docs]);

  const combinedDocItems =
    useMemo<
      SearchResultItem[]
    >(() => {
      const documentItems =
        sortedDocs.map(
          (document) => ({
            kind:
              'doc' as const,
            id: document.id,
            data: document,
          }),
        );

      const questItems =
        questNpcs.map(
          (npc) => ({
            kind:
              'quest' as const,
            id: npc.id,
            data: npc,
          }),
        );

      return [
        ...documentItems,
        ...questItems,
      ];
    }, [
      questNpcs,
      sortedDocs,
    ]);

  const combinedCount =
    combinedDocItems.length;

  useEffect(() => {
    const trimmedQuery =
      query.trim();

    const compactQuery =
      normalizeSearchText(
        trimmedQuery,
      );

    if (
      timerRef.current !== null
    ) {
      window.clearTimeout(
        timerRef.current,
      );

      timerRef.current = null;
    }

    if (
      faqTimerRef.current !==
      null
    ) {
      window.clearTimeout(
        faqTimerRef.current,
      );

      faqTimerRef.current = null;
    }

    abortDocsRef.current?.abort();
    abortQuestNpcRef.current?.abort();
    abortFaqRef.current?.abort();

    if (
      compactQuery.length < 2
    ) {
      setOpen(false);
      setDocs([]);
      setQuestNpcs([]);
      setFaqs([]);
      setActiveDocIndex(-1);
      setLoadingDocs(false);
      setLoadingQuestNpcs(false);
      setLoadingFaqs(false);
      return;
    }

    timerRef.current =
      window.setTimeout(
        () => {
          const docsController =
            new AbortController();

          const questController =
            new AbortController();

          const faqController =
            new AbortController();

          abortDocsRef.current =
            docsController;

          abortQuestNpcRef.current =
            questController;

          abortFaqRef.current =
            faqController;

          setLoadingDocs(true);
          setLoadingQuestNpcs(
            true,
          );
          setLoadingFaqs(true);
          setOpen(true);
          setActiveDocIndex(-1);

          void (async () => {
            try {
              const response =
                await fetch(
                  `/api/search?query=${encodeURIComponent(
                    trimmedQuery,
                  )}&compact=${encodeURIComponent(
                    compactQuery,
                  )}&limit=50`,
                  {
                    signal:
                      docsController
                        .signal,
                    cache:
                      'no-store',
                  },
                );

              if (!response.ok) {
                throw new Error(
                  'search-failed',
                );
              }

              const data =
                (await response.json()) as DocResult[];

              setDocs(
                Array.isArray(data)
                  ? data
                  : [],
              );

              /*
               * 검색 직후 첫 결과를 강제로 선택하지 않는다.
               * 키보드 탐색은 -1에서 ArrowDown 시 첫 항목으로 이동한다.
               */
              setActiveDocIndex(-1);
            } catch (error) {
              if (
                !(
                  error instanceof
                    DOMException &&
                  error.name ===
                    'AbortError'
                )
              ) {
                setDocs([]);
                setActiveDocIndex(
                  -1,
                );
              }
            } finally {
              if (
                !docsController
                  .signal.aborted
              ) {
                setLoadingDocs(
                  false,
                );
              }
            }
          })();

          void (async () => {
            try {
              const response =
                await fetch(
                  `/api/search/quest?query=${encodeURIComponent(
                    trimmedQuery,
                  )}&limit=20`,
                  {
                    signal:
                      questController
                        .signal,
                    cache:
                      'no-store',
                  },
                );

              if (!response.ok) {
                throw new Error(
                  'quest-search-failed',
                );
              }

              const data =
                (await response.json()) as QuestNpcResult[];

              setQuestNpcs(
                Array.isArray(data)
                  ? data
                  : [],
              );
            } catch (error) {
              if (
                !(
                  error instanceof
                    DOMException &&
                  error.name ===
                    'AbortError'
                )
              ) {
                setQuestNpcs([]);
              }
            } finally {
              if (
                !questController
                  .signal.aborted
              ) {
                setLoadingQuestNpcs(
                  false,
                );
              }
            }
          })();

          faqTimerRef.current =
            window.setTimeout(
              () => {
                void (async () => {
                  try {
                    const url =
                      `/api/faq?q=${encodeURIComponent(
                        trimmedQuery,
                      )}` +
                      `&compact=${encodeURIComponent(
                        compactQuery,
                      )}` +
                      '&limit=10&offset=0';

                    const response =
                      await fetch(
                        url,
                        {
                          signal:
                            faqController
                              .signal,
                          cache:
                            'no-store',
                        },
                      );

                    const data =
                      response.ok
                        ? ((await response.json()) as {
                            items?: FaqItem[];
                          })
                        : {
                            items: [],
                          };

                    setFaqs(
                      Array.isArray(
                        data.items,
                      )
                        ? data.items
                        : [],
                    );
                  } catch (error) {
                    if (
                      !(
                        error instanceof
                          DOMException &&
                        error.name ===
                          'AbortError'
                      )
                    ) {
                      setFaqs([]);
                    }
                  } finally {
                    if (
                      !faqController
                        .signal
                        .aborted
                    ) {
                      setLoadingFaqs(
                        false,
                      );
                    }
                  }
                })();
              },
              180,
            );
        },
        200,
      );

    return () => {
      if (
        timerRef.current !== null
      ) {
        window.clearTimeout(
          timerRef.current,
        );
      }

      if (
        faqTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          faqTimerRef.current,
        );
      }
    };
  }, [query]);

  useEffect(() => {
    return () => {
      abortDocsRef.current?.abort();
      abortQuestNpcRef.current?.abort();
      abortFaqRef.current?.abort();

      if (
        timerRef.current !== null
      ) {
        window.clearTimeout(
          timerRef.current,
        );
      }

      if (
        faqTimerRef.current !==
        null
      ) {
        window.clearTimeout(
          faqTimerRef.current,
        );
      }
    };
  }, []);

  useEffect(() => {
    const onDocumentMouseDown = (
      event: MouseEvent,
    ) => {
      const root =
        wrapRef.current;

      if (!root) {
        return;
      }

      if (
        faqView ||
        resultModalOpen
      ) {
        return;
      }

      if (
        !root.contains(
          event.target as Node,
        )
      ) {
        setOpen(false);
        setActiveDocIndex(-1);
      }
    };

    document.addEventListener(
      'mousedown',
      onDocumentMouseDown,
    );

    return () => {
      document.removeEventListener(
        'mousedown',
        onDocumentMouseDown,
      );
    };
  }, [
    faqView,
    resultModalOpen,
  ]);

  const renderDocumentTitle = (
    result: DocResult,
  ) => {
    if (
      result.match_type ===
      'title'
    ) {
      return (
        <mark className="search-highlight">
          {result.title}
        </mark>
      );
    }

    return highlight(
      result.title,
      query,
    );
  };

  const renderSectionMeta = (
    result: DocResult,
  ) => {
    const sectionHeading =
      String(
        result.section_heading ??
          '',
      ).trim();

    const breadcrumb =
      String(
        result.category_breadcrumb ??
          '',
      ).trim();

    if (
      result.match_type ===
        'content' &&
      sectionHeading
    ) {
      const highlighted =
        isSectionHeadingHighlighted(
          sectionHeading,
          query,
        );

      return (
        <div
          className={
            highlighted
              ? 'search-result-meta is-match'
              : 'search-result-meta'
          }
          title={sectionHeading}
        >
          {highlight(
            sectionHeading,
            query,
          )}
        </div>
      );
    }

    if (!breadcrumb) {
      return null;
    }

    return (
      <div
        className="search-result-meta"
        title={breadcrumb}
      >
        {highlight(
          breadcrumb,
          query,
        )}
      </div>
    );
  };

  const resetSearchState =
    () => {
      setOpen(false);
      updateQuery('');
      setDocs([]);
      setQuestNpcs([]);
      setFaqs([]);
      setActiveDocIndex(-1);
    };

  const goDocument = (
    result: DocResult | null,
  ) => {
    if (!result) {
      return;
    }

    const nextHashDomId =
      String(
        result.section_dom_id ??
          '',
      ).trim();

    commitCurrentSearch(
      'document',
    );

    resetSearchState();

    const href =
      `/wiki?id=${encodeURIComponent(
        result.id,
      )}` +
      `&path=${encodeURIComponent(
        result.path,
      )}` +
      `&title=${encodeURIComponent(
        result.title,
      )}` +
      (nextHashDomId
        ? `#${encodeURIComponent(
            nextHashDomId,
          )}`
        : '');

    markNextDocViewSource(
      'search',
    );

    router.push(href, {
      scroll: false,
    });

    if (
      nextHashDomId &&
      typeof window !==
        'undefined'
    ) {
      window.requestAnimationFrame(
        () => {
          window.dispatchEvent(
            new CustomEvent(
              'rdwiki:search-hash-nav',
              {
                detail: {
                  domId:
                    nextHashDomId,
                },
              },
            ),
          );
        },
      );
    }
  };

  const openQuestNpc = (
    npc:
      | QuestNpcResult
      | null,
  ) => {
    if (!npc) {
      return;
    }

    /*
     * 상위 NPC 모달을 닫았을 때 같은 검색 결과를 다시 볼 수 있게
     * 검색어와 결과 목록은 유지한다.
     */
    setOpen(true);
    onQuestNpcClick?.(npc.id);
  };

  const openFaq =
    async (
      faq: FaqItem,
    ) => {
      setOpen(true);

      commitCurrentSearch('faq');

      void recordFaqView(
        faq.id,
        'search',
      );

      try {
        const response =
          await fetch(
            `/api/faq/${encodeURIComponent(
              faq.id,
            )}`,
            {
              cache: 'no-store',
            },
          );

        if (!response.ok) {
          throw new Error(
            `faq-detail-failed:${response.status}`,
          );
        }

        const fresh =
          (await response.json()) as FaqItem;

        setFaqView(
          fresh &&
            Number(fresh.id) > 0
            ? fresh
            : faq,
        );
      } catch (error) {
        console.error(
          '[SearchBox] FAQ 상세 조회 실패:',
          error,
        );

        setFaqView(faq);
      }
    };

  const clearSearch = () => {
    resetSearchState();

    window.requestAnimationFrame(
      () => {
        inputRef.current?.focus();
      },
    );
  };

  const onKeyDown:
    KeyboardEventHandler<HTMLInputElement> =
    (event) => {
      if (
        !open ||
        (!combinedCount &&
          event.key !==
            'Escape')
      ) {
        if (
          event.key === 'Escape'
        ) {
          setOpen(false);
          setActiveDocIndex(-1);
        }

        return;
      }

      if (
        event.key ===
        'ArrowDown'
      ) {
        event.preventDefault();

        setActiveDocIndex(
          (index) =>
            combinedCount
              ? (index + 1) %
                combinedCount
              : -1,
        );
      } else if (
        event.key === 'ArrowUp'
      ) {
        event.preventDefault();

        setActiveDocIndex(
          (index) =>
            combinedCount
              ? index < 0
                ? combinedCount -
                  1
                : (index -
                    1 +
                    combinedCount) %
                  combinedCount
              : -1,
        );
      } else if (
        event.key === 'Enter'
      ) {
        event.preventDefault();

        const selected =
          combinedDocItems[
            activeDocIndex
          ] ??
          combinedDocItems[0] ??
          null;

        if (!selected) {
          return;
        }

        if (
          selected.kind ===
          'doc'
        ) {
          goDocument(
            selected.data,
          );
        } else {
          openQuestNpc(
            selected.data,
          );
        }
      } else if (
        event.key === 'Escape'
      ) {
        event.preventDefault();
        setOpen(false);
        setActiveDocIndex(-1);
      }
    };

  const dropdownMaxHeight =
    'min(72vh, 560px)';

  return (
    <>
      <div
        ref={wrapRef}
        className="search-wrapper"
        role="combobox"
        aria-expanded={open}
        aria-owns={listId}
        aria-haspopup="listbox"
        data-align={align}
        style={{
          width,
        }}
      >
        <SearchIcon />

        <input
          type="text"
          ref={inputRef}
          className="search-input"
          placeholder="Search"
          value={query}
          onChange={(event) => {
            updateQuery(
              event.target.value,
            );
          }}
          onFocus={() => {
            if (
              docs.length ||
              questNpcs.length ||
              faqs.length
            ) {
              setOpen(true);
            }
          }}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={
            activeDocIndex >= 0 &&
            combinedDocItems[
              activeDocIndex
            ]
              ? `${listId}-opt-${combinedDocItems[activeDocIndex].kind}-${combinedDocItems[activeDocIndex].id}`
              : undefined
          }
        />

        {query ? (
          <button
            type="button"
            className="search-clear-button"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={clearSearch}
            aria-label="검색어 지우기"
            title="검색어 지우기"
          >
            <ClearIcon />
          </button>
        ) : null}

        {open ? (
          <div
            className="wiki-search-dropdown"
            style={{
              maxHeight:
                dropdownMaxHeight,
            }}
            onMouseLeave={() => {
              setActiveDocIndex(-1);
            }}
          >
            <div className="search-result-grid">
              <section className="search-result-column search-document-column">
                <h3 className="search-result-heading">
                  문서
                </h3>

                {!loadingDocs &&
                !loadingQuestNpcs &&
                combinedDocItems.length ===
                  0 ? (
                  <div className="search-empty">
                    결과가 없습니다.
                  </div>
                ) : null}

                <ul
                  id={listId}
                  role="listbox"
                  className="search-result-list"
                  onMouseLeave={() => {
                    setActiveDocIndex(
                      -1,
                    );
                  }}
                >
                  {combinedDocItems.map(
                    (
                      item,
                      index,
                    ) => {
                      const selected =
                        index ===
                        activeDocIndex;

                      if (
                        item.kind ===
                        'doc'
                      ) {
                        const result =
                          item.data;

                        const cleanTags =
                          (
                            result.tags ??
                            []
                          )
                            .map(
                              normalizeTag,
                            )
                            .filter(
                              Boolean,
                            )
                            .filter(
                              (tag) =>
                                isTagMatched(
                                  tag,
                                  query,
                                ),
                            );

                        return (
                          <li
                            id={`${listId}-opt-doc-${result.id}`}
                            key={`doc-${result.id}-${index}`}
                            role="option"
                            aria-selected={
                              selected
                            }
                            className={
                              selected
                                ? 'search-result-item is-active'
                                : 'search-result-item'
                            }
                            onMouseEnter={() => {
                              setActiveDocIndex(
                                index,
                              );
                            }}
                            onClick={() => {
                              goDocument(
                                result,
                              );
                            }}
                          >
                            <span className="search-result-icon">
                              {result.icon ? (
                                isImageLike(
                                  result.icon,
                                ) ? (
                                  <img
                                    src={
                                      isRemoteHttp(
                                        result.icon,
                                      )
                                        ? toProxyUrl(
                                            result.icon,
                                          )
                                        : result.icon
                                    }
                                    alt=""
                                    width={22}
                                    height={22}
                                    loading="lazy"
                                    decoding="async"
                                    draggable={
                                      false
                                    }
                                  />
                                ) : (
                                  result.icon
                                )
                              ) : (
                                '📄'
                              )}
                            </span>

                            <div className="search-result-content">
                              <div className="search-result-main">
                                <div
                                  className="search-result-title"
                                  title={
                                    result.title
                                  }
                                >
                                  {renderDocumentTitle(
                                    result,
                                  )}
                                </div>

                                {renderSectionMeta(
                                  result,
                                )}
                              </div>

                              {cleanTags.length >
                              0 ? (
                                <div className="search-result-tags">
                                  {cleanTags.map(
                                    (
                                      tag,
                                      tagIndex,
                                    ) => (
                                      <span
                                        key={`${tag}-${tagIndex}`}
                                        className="search-result-tag"
                                        title={
                                          tag
                                        }
                                      >
                                        {highlight(
                                          tag,
                                          query,
                                        )}
                                      </span>
                                    ),
                                  )}
                                </div>
                              ) : null}
                            </div>
                          </li>
                        );
                      }

                      const npc =
                        item.data;

                      const villageName =
                        String(
                          npc.village_name ??
                            '',
                        ).trim();

                      return (
                        <li
                          id={`${listId}-opt-quest-${npc.id}`}
                          key={`quest-${npc.id}-${index}`}
                          role="option"
                          aria-selected={
                            selected
                          }
                          className={
                            selected
                              ? 'search-result-item is-active'
                              : 'search-result-item'
                          }
                          onMouseEnter={() => {
                            setActiveDocIndex(
                              index,
                            );
                          }}
                          onClick={() => {
                            openQuestNpc(
                              npc,
                            );
                          }}
                        >
                          <span className="search-result-icon">
                            {npc.icon ? (
                              isImageLike(
                                npc.icon,
                              ) ? (
                                <img
                                  src={
                                    isRemoteHttp(
                                      npc.icon,
                                    )
                                      ? toProxyUrl(
                                          npc.icon,
                                        )
                                      : npc.icon
                                  }
                                  alt=""
                                  width={22}
                                  height={22}
                                  loading="lazy"
                                  decoding="async"
                                  draggable={
                                    false
                                  }
                                />
                              ) : (
                                npc.icon
                              )
                            ) : (
                              '🧑'
                            )}
                          </span>

                          <div className="search-result-content">
                            <div className="search-result-main">
                              <div
                                className="search-result-title"
                                title={
                                  npc.name
                                }
                              >
                                {highlight(
                                  npc.name,
                                  query,
                                )}
                              </div>

                              <div className="search-result-meta">
                                퀘스트
                              </div>
                            </div>

                            {villageName ? (
                              <div className="search-result-tags">
                                <span
                                  className="search-result-tag"
                                  title={
                                    villageName
                                  }
                                >
                                  {highlight(
                                    villageName,
                                    query,
                                  )}
                                </span>
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    },
                  )}
                </ul>
              </section>

              <section className="search-result-column search-faq-column">
                <h3 className="search-result-heading">
                  자주 묻는 질문
                </h3>

                {!loadingFaqs &&
                faqs.length === 0 ? (
                  <div className="search-empty">
                    결과가 없습니다.
                  </div>
                ) : null}

                <ul className="search-faq-list">
                  {faqs.map((faq) => (
                    <li
                      key={faq.id}
                      className="search-faq-item"
                      onClick={() => {
                        void openFaq(faq);
                      }}
                    >
                      <span
                        className="search-faq-icon"
                        aria-hidden="true"
                      >
                        Q
                      </span>

                      <div className="search-faq-content">
                        <div className="search-faq-title">
                          {highlight(
                            faq.title,
                            query,
                          )}
                        </div>

                        {faq.tags?.length >
                        0 ? (
                          <div className="search-faq-tags">
                            {faq.tags.map(
                              (
                                tag,
                                tagIndex,
                              ) => (
                                <span
                                  key={`${tag}-${tagIndex}`}
                                >
                                  {highlight(
                                    tag,
                                    query,
                                  )}
                                </span>
                              ),
                            )}
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        ) : null}
      </div>

      {portalReady && faqView
        ? createPortal(
            <div
              className="search-faq-modal-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                /*
                 * 백드롭 클릭은 FAQ 모달만 닫는다.
                 * 이벤트가 document의 검색창 외부 클릭 감지까지 전달되면
                 * 유지 중인 검색 결과도 함께 닫히므로 여기서 전파를 막는다.
                 */
                event.stopPropagation();

                if (
                  event.target ===
                  event.currentTarget
                ) {
                  setFaqView(null);
                }
              }}
            >
              <article
                className="search-faq-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="search-faq-modal-title"
                onMouseDown={(event) => {
                  event.stopPropagation();
                }}
              >
                <header className="search-faq-modal-header">
                  <span
                    className="search-faq-modal-icon"
                    aria-hidden="true"
                  >
                    Q
                  </span>

                  <h3 id="search-faq-modal-title">
                    {faqView.title}
                  </h3>

                  <button
                    type="button"
                    className="search-faq-modal-close"
                    onClick={() => {
                      setFaqView(null);
                    }}
                    aria-label="질문 닫기"
                  >
                    ×
                  </button>
                </header>

                <div className="search-faq-modal-answer">
                  <span
                    className="search-faq-modal-icon is-answer"
                    aria-hidden="true"
                  >
                    A
                  </span>

                  <p>
                    {faqView.content}
                  </p>
                </div>

                {faqView.tags?.length >
                0 ? (
                  <div className="search-faq-modal-tags">
                    {faqView.tags.map(
                      (
                        tag,
                        index,
                      ) => (
                        <span
                          key={`${tag}-${index}`}
                        >
                          #{tag}
                        </span>
                      ),
                    )}
                  </div>
                ) : null}
              </article>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

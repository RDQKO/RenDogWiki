// =============================================
// File: app/components/home/HomePage.tsx
// 전체 교체용 코드
// - 문서 화면과 동일한 3열 폭 유지
// - 실제 최근 업데이트 문서 표시
// - 최근 7일 조회수 기준 인기 문서 비동기 표시
// - 최근 7일 열람수 기준 자주 묻는 질문 순위 비동기 표시
// - 실제 선택으로 집계된 최근 7일 인기 검색어 표시
// - Wiki Header와 동일한 SearchBox 사용
// - 퀘스트 NPC 상세 모달과 FAQ 상세 동작 지원
// - 생성 이미지 기반 Hero와 좌우 배경 적용
// - 퀘스트 대표 버튼과 커뮤니티 바로가기 적용
// - 봄날 분위기의 나뭇잎과 반딧불이 효과 적용
// - 홈 전용 일러스트 아이콘 적용
// =============================================

'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import Link from 'next/link';

import HamburgerMenu from '@/components/common/HamburgerMenu';
import SearchBox from '@/components/common/SearchBox';
import ThemeToggle from '@/components/common/ThemeToggle';
import NpcDetailModal, {
  type Npc,
} from '@/components/wiki/NpcDetailModal';
import {
  FaqDetailModal,
  type FaqItem,
} from '@/components/wiki/FaqList';
import {
  recordFaqView,
} from '@/wiki/lib/faqView';
import {
  requestSearchQuery,
} from '@/wiki/lib/searchPopularity';

import type {
  HomeCategoryKey,
  HomeCategoryLink,
  HomePopularDocument,
  HomeRecentDocument,
} from './homeData';
import '@/wiki/css/header.css';

import styles from './home.module.css';
import darkBackgroundStyles from './homeDarkBackgrounds.module.css';

const categoryCards: ReadonlyArray<{
  key: HomeCategoryKey;
  title: string;
  description: string;
  iconSrc: string;
  tone: 'green' | 'mint' | 'blue' | 'orange';
  href?: string;
}> = [
  {
    key: 'content',
    title: '컨텐츠',
    description:
      '던전, 보스 등 다양한 컨텐츠들의 정보를 확인하세요',
    iconSrc: '/images/home/icons/content.png',
    tone: 'green',
  },
  {
    key: 'system',
    title: '시스템',
    description:
      '거래, 명령어 등 서버의 주요 시스템을 알아보세요',
    iconSrc: '/images/home/icons/system.png',
    tone: 'mint',
  },
  {
    key: 'price',
    title: '퀘스트',
    description:
      '주요 퀘스트와 진행에 필요한 정보를 확인하세요',
    iconSrc: '/images/home/icons/quest.png',
    tone: 'blue',
    href:
      '/wiki?mode=RPG&path=27&title=%ED%80%98%EC%8A%A4%ED%8A%B8&id=271',
  },
  {
    key: 'policy',
    title: '법전',
    description:
      '서버의 규칙과 운영 기준을 확인할 수 있습니다',
    iconSrc: '/images/home/icons/rules.png',
    tone: 'orange',
  },
];

const FAQ_DOCUMENT = {
  id: 71,
  title: '자주 물으시는 질문',
  path: '0',
  special: 'faq',
} as const;

const faqDocumentSearchParams =
  new URLSearchParams({
    id: String(FAQ_DOCUMENT.id),
    path: FAQ_DOCUMENT.path,
    title: FAQ_DOCUMENT.title,
    mode: 'RPG',
  });

const FAQ_DOCUMENT_HREF =
  `/wiki?${faqDocumentSearchParams.toString()}`;

const recommendations = [
  {
    label: '무기 정보를 찾고 있다면',
    title: '무기',
    description:
      '렌독 서버의 무기 종류와\n세부 정보를 확인해 보세요',
    iconSrc: '/images/home/icons/weapon.png',
    href:
      '/wiki?mode=RPG&path=48&title=%EB%AC%B4%EA%B8%B0&id=289',
  },
  {
    label: '레이드 패턴을 자세히 알고 싶다면',
    title: '레이드',
    description:
      '레이드 종류와 공략에\n필요한 정보를 확인해 보세요',
    iconSrc: '/images/home/icons/raid.png',
    href:
      '/wiki?mode=RPG&path=82&title=%EB%A0%88%EC%9D%B4%EB%93%9C&id=248',
  },
  {
    label: '도감 정보를 확인하고 싶다면',
    title: '도감',
    description:
      '도감 목록과 보상을 살펴보세요',
    iconSrc: '/images/home/icons/collection-book.png',
    href:
      '/wiki?mode=RPG&path=34&title=%EB%8F%84%EA%B0%90&id=207',
  },
] as const;

const SPRING_LEAF_COUNT = 14;

const HOME_BACKGROUND_IMAGES = [
  '/images/home/home-hero-background.png',
  '/images/home/home-side-background-left.png',
  '/images/home/home-side-background-right.png',
  '/images/home/home-hero-background-dark.png',
  '/images/home/home-side-background-left-dark.png',
  '/images/home/home-side-background-right-dark.png',
] as const;

type HomePageProps = {
  recentDocuments: HomeRecentDocument[];
  categoryLinks: HomeCategoryLink[];
};

type PopularDocumentsResponse = {
  items?: HomePopularDocument[];
};

type HomeFaqRankItem = {
  id: number;
  title: string;
  views: number;
};

type HomeFaqRankingResponse = {
  items?: HomeFaqRankItem[];
};

type HomePopularSearchItem = {
  keyword: string;
  searches: number;
};

type HomePopularSearchResponse = {
  items?: HomePopularSearchItem[];
};

type HomeHeaderUser = {
  id: number;
  username: string;
  minecraft_name: string;
  email: string;
};

function normalizeNpcPayload(payload: unknown): Npc {
  const raw =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};

  const rawRewards = Array.isArray(raw.rewards)
    ? raw.rewards
    : [];

  const rewards = rawRewards
    .map(
      (
        reward
      ): {
        icon?: string;
        text: string;
      } | null => {
        if (!reward || typeof reward !== 'object') {
          return null;
        }

        const rewardRecord =
          reward as Record<string, unknown>;
        const text = String(
          rewardRecord.text ?? ''
        ).trim();

        if (!text) {
          return null;
        }

        if (rewardRecord.icon) {
          return {
            icon: String(rewardRecord.icon),
            text,
          };
        }

        return { text };
      }
    )
    .filter(
      (
        reward
      ): reward is {
        icon?: string;
        text: string;
      } => reward !== null
    );

  return {
    id: Number(raw.id ?? 0),
    name: String(raw.name ?? '이름 없는 NPC'),
    icon: String(raw.icon ?? ''),
    pictures: Array.isArray(raw.pictures)
      ? raw.pictures.map((picture) => String(picture))
      : [],
    location_x: Number(raw.location_x ?? 0),
    location_y: Number(raw.location_y ?? 0),
    location_z: Number(raw.location_z ?? 0),
    line: raw.line == null
      ? undefined
      : String(raw.line),
    quest: raw.quest == null
      ? undefined
      : String(raw.quest),
    rewards,
    requirement:
      raw.requirement == null
        ? undefined
        : String(raw.requirement),
    tag: raw.tag == null
      ? null
      : String(raw.tag),
  };
}

export default function HomePage({
  recentDocuments,
  categoryLinks,
}: HomePageProps) {
  const categoryHrefByKey =
    new Map<HomeCategoryKey, string>(
      categoryLinks.map(
        (category) => [
          category.key,
          category.href,
        ]
      )
    );

  const getCategoryHref = (
    key: HomeCategoryKey
  ) =>
    categoryHrefByKey.get(key) ??
    '/wiki';
  const [selectedQuestNpc, setSelectedQuestNpc] =
    useState<Npc | null>(null);
  const [loadingQuestNpc, setLoadingQuestNpc] =
    useState(false);
  const [questNpcError, setQuestNpcError] =
    useState<string | null>(null);
  const [
    popularDocuments,
    setPopularDocuments,
  ] = useState<HomePopularDocument[]>([]);
  const [
    popularDocumentsLoading,
    setPopularDocumentsLoading,
  ] = useState(true);
  const [
    faqRanking,
    setFaqRanking,
  ] = useState<HomeFaqRankItem[]>([]);
  const [
    faqRankingLoading,
    setFaqRankingLoading,
  ] = useState(true);
  const [
    selectedFaq,
    setSelectedFaq,
  ] = useState<FaqItem | null>(null);
  const [
    loadingFaq,
    setLoadingFaq,
  ] = useState(false);
  const [
    faqError,
    setFaqError,
  ] = useState<string | null>(null);
  const [
    popularSearches,
    setPopularSearches,
  ] = useState<
    HomePopularSearchItem[]
  >([]);
  const [
    popularSearchesLoading,
    setPopularSearchesLoading,
  ] = useState(true);
  const [
    isHeaderMenuOpen,
    setIsHeaderMenuOpen,
  ] = useState(false);
  const [
    headerUser,
    setHeaderUser,
  ] = useState<HomeHeaderUser | null>(null);
  const backgroundImagesRef =
    useRef<HTMLImageElement[]>([]);

  /*
   * 테마를 처음 전환할 때 이미지 다운로드와 디코딩 때문에
   * 화면이 잠깐 끊기지 않도록 낮/밤 배경을 함께 준비한다.
   */
  useEffect(() => {
    backgroundImagesRef.current =
      HOME_BACKGROUND_IMAGES.map((src) => {
        const image = new window.Image();

        image.decoding = 'async';
        image.src = src;

        void image.decode().catch(() => {
          /*
           * 일부 브라우저는 캐시에 들어간 이미지도 decode()를
           * 거부할 수 있다. 이미지 요청 자체는 그대로 유지한다.
           */
        });

        return image;
      });

    return () => {
      backgroundImagesRef.current = [];
    };
  }, []);

  /*
   * 기존 위키 헤더와 동일한 메뉴 상태를 홈에서도 사용한다.
   * 인증 확인에 실패해도 홈 화면과 메뉴 버튼은 정상 표시된다.
   */
  useEffect(() => {
    const controller =
      new AbortController();
    let active = true;

    void fetch('/api/auth/me', {
      cache: 'no-store',
      credentials: 'include',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (
          response.status === 401 ||
          response.status === 403
        ) {
          return null;
        }

        if (!response.ok) {
          throw new Error(
            `home-auth-fetch-failed:${response.status}`
          );
        }

        return (await response.json()) as unknown;
      })
      .then((payload) => {
        if (
          !active ||
          !payload ||
          typeof payload !== 'object'
        ) {
          return;
        }

        const payloadRecord =
          payload as Record<string, unknown>;
        const nestedUser =
          payloadRecord.user &&
          typeof payloadRecord.user === 'object'
            ? (payloadRecord.user as Record<
                string,
                unknown
              >)
            : payloadRecord;
        const id = Number(nestedUser.id ?? 0);

        if (
          !Number.isInteger(id) ||
          id <= 0
        ) {
          setHeaderUser(null);
          return;
        }

        setHeaderUser({
          id,
          username: String(
            nestedUser.username ?? ''
          ),
          minecraft_name: String(
            nestedUser.minecraft_name ??
              nestedUser.username ??
              ''
          ),
          email: String(
            nestedUser.email ?? ''
          ),
        });
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          '[HomePage] 사용자 정보 조회 실패:',
          error
        );

        if (active) {
          setHeaderUser(null);
        }
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    if (!isHeaderMenuOpen) {
      return;
    }

    const onKeyDown = (
      event: KeyboardEvent
    ) => {
      if (event.key === 'Escape') {
        setIsHeaderMenuOpen(false);
      }
    };

    window.addEventListener(
      'keydown',
      onKeyDown
    );

    return () => {
      window.removeEventListener(
        'keydown',
        onKeyDown
      );
    };
  }, [isHeaderMenuOpen]);

  const handleHeaderLogout = useCallback(
    async () => {
      try {
        const response = await fetch(
          '/api/auth/logout',
          {
            method: 'POST',
            credentials: 'include',
          }
        );

        if (!response.ok) {
          throw new Error(
            `home-logout-failed:${response.status}`
          );
        }

        setHeaderUser(null);
        setIsHeaderMenuOpen(false);
        window.location.href = '/';
      } catch (error) {
        console.error(
          '[HomePage] 로그아웃 실패:',
          error
        );
        window.alert(
          '로그아웃에 실패했습니다.'
        );
      }
    },
    []
  );

  /*
   * 인기 문서는 Home 서버 렌더링과 분리한다.
   * 조회가 느리거나 실패해도 / 페이지 자체는 정상 표시된다.
   */
  useEffect(() => {
    const controller =
      new AbortController();

    const timeoutId =
      window.setTimeout(() => {
        controller.abort();
      }, 8000);

    void fetch('/api/home/popular', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `popular-fetch-failed:${response.status}`
          );
        }

        return (await response.json()) as
          PopularDocumentsResponse;
      })
      .then((payload) => {
        setPopularDocuments(
          Array.isArray(payload.items)
            ? payload.items
            : []
        );
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          '[HomePage] 인기 문서 조회 실패:',
          error
        );
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
        setPopularDocumentsLoading(false);
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  /*
   * FAQ 순위도 Home 서버 렌더링과 분리한다.
   * FAQ 조회가 실패해도 Home 전체 화면은 정상 표시된다.
   */
  useEffect(() => {
    const controller =
      new AbortController();
    let active = true;

    const timeoutId =
      window.setTimeout(() => {
        controller.abort();
      }, 8000);

    void fetch('/api/home/faqs?range=week&limit=5', {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `faq-ranking-fetch-failed:${response.status}`
          );
        }

        return (await response.json()) as
          HomeFaqRankingResponse;
      })
      .then((payload) => {
        if (!active) {
          return;
        }

        setFaqRanking(
          Array.isArray(payload.items)
            ? payload.items
            : []
        );
      })
      .catch((error) => {
        if (
          error instanceof DOMException &&
          error.name === 'AbortError'
        ) {
          return;
        }

        console.error(
          '[HomePage] FAQ 순위 조회 실패:',
          error
        );
      })
      .finally(() => {
        window.clearTimeout(timeoutId);

        if (active) {
          setFaqRankingLoading(false);
        }
      });

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  /*
   * 인기 검색어는 검색 결과가 실제로 선택된 횟수를 기준으로 한다.
   * 단순 입력이나 실시간 검색 API 호출만으로는 증가하지 않는다.
   */
  useEffect(() => {
    const controller =
      new AbortController();
    let active = true;

    const timeoutId =
      window.setTimeout(() => {
        controller.abort();
      }, 8000);

    void fetch(
      '/api/home/search-keywords?range=week&limit=6',
      {
        cache: 'no-store',
        signal:
          controller.signal,
      }
    )
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `popular-search-fetch-failed:${response.status}`
          );
        }

        return (
          await response.json()
        ) as HomePopularSearchResponse;
      })
      .then((payload) => {
        if (!active) {
          return;
        }

        setPopularSearches(
          Array.isArray(
            payload.items
          )
            ? payload.items
            : []
        );
      })
      .catch((error) => {
        if (
          error instanceof
            DOMException &&
          error.name ===
            'AbortError'
        ) {
          return;
        }

        console.error(
          '[HomePage] 인기 검색어 조회 실패:',
          error
        );
      })
      .finally(() => {
        window.clearTimeout(
          timeoutId
        );

        if (active) {
          setPopularSearchesLoading(
            false
          );
        }
      });

    return () => {
      active = false;
      window.clearTimeout(
        timeoutId
      );
      controller.abort();
    };
  }, []);

  const openFaq = useCallback(
    async (faqId: number) => {
      setLoadingFaq(true);
      setFaqError(null);

      try {
        /*
         * 상세 내용 조회와 조회수 기록을 분리한다.
         * Home 순위에서 실제 질문을 연 경우 source=home으로 기록한다.
         */
        const response = await fetch(
          `/api/faq/${encodeURIComponent(faqId)}`,
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          throw new Error(
            `faq-fetch-failed:${response.status}`
          );
        }

        const payload =
          (await response.json()) as FaqItem;

        if (
          !Number.isInteger(Number(payload?.id)) ||
          Number(payload.id) <= 0
        ) {
          throw new Error(
            'invalid-faq-payload'
          );
        }

        setSelectedFaq(payload);
        void recordFaqView(
          faqId,
          'home'
        );
      } catch (error) {
        console.error(
          '[HomePage] FAQ 상세 조회 실패:',
          error
        );
        setFaqError(
          '질문 내용을 불러오지 못했습니다.'
        );
      } finally {
        setLoadingFaq(false);
      }
    },
    []
  );

  const openQuestNpc = useCallback(
    async (npcId: number) => {
      setLoadingQuestNpc(true);
      setQuestNpcError(null);

      try {
        const response = await fetch(
          `/api/npcs/${encodeURIComponent(npcId)}`,
          {
            cache: 'no-store',
          }
        );

        if (!response.ok) {
          throw new Error(
            `npc-fetch-failed:${response.status}`
          );
        }

        const payload = await response.json();
        const normalizedNpc = normalizeNpcPayload(payload);

        if (
          !Number.isFinite(normalizedNpc.id) ||
          normalizedNpc.id <= 0
        ) {
          throw new Error('invalid-npc-payload');
        }

        setSelectedQuestNpc(normalizedNpc);
      } catch (error) {
        console.error(
          '[HomePage] 퀘스트 NPC 상세 조회 실패:',
          error
        );
        setQuestNpcError(
          'NPC 정보를 불러오지 못했습니다.'
        );
      } finally {
        setLoadingQuestNpc(false);
      }
    },
    []
  );

  return (
    <div
      className={`${styles.page} ${darkBackgroundStyles.scope}`}
    >
      <div
        className={styles.springAtmosphere}
        data-home-atmosphere="true"
        aria-hidden="true"
      >
        {Array.from(
          {
            length:
              SPRING_LEAF_COUNT,
          },
          (_, index) => (
            <span
              key={index}
              className={
                styles.springLeaf
              }
              data-home-particle="true"
            />
          )
        )}
      </div>

      <header className={styles.header}>
        <div
          className={styles.headerInner}
          style={{
            width:
              'min(calc(100% - 48px), 1480px)',
          }}
        >
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

          <div
            className={styles.headerNav}
            aria-label="홈 도구"
          >
            <ThemeToggle />

            <button
              type="button"
              onClick={() =>
                setIsHeaderMenuOpen(true)
              }
              className="wiki-admin-menu-btn"
              aria-label="관리 메뉴 열기"
              aria-haspopup="dialog"
              aria-expanded={isHeaderMenuOpen}
              style={{
                display: 'inline-flex',
              }}
            >
              ☰
            </button>
          </div>
        </div>
      </header>

      {isHeaderMenuOpen && (
        <HamburgerMenu
          isOpen={isHeaderMenuOpen}
          onClose={() =>
            setIsHeaderMenuOpen(false)
          }
          isLoggedIn={Boolean(headerUser)}
          username={
            headerUser?.minecraft_name || ''
          }
          uuid={undefined}
          onLogout={handleHeaderLogout}
        />
      )}

      <div className={styles.shell}>
        <div className={styles.layout}>
          <aside
            className={styles.leftRail}
            data-home-rail="left"
            aria-hidden="true"
          />

          <main className={styles.main}>
            <section
              className={styles.hero}
              data-home-hero="true"
              style={{
                zIndex: 20,
              }}
            >
              <div className={styles.heroContent}>
                <p
                  className={styles.heroEyebrow}
                  data-home-hero-text="eyebrow"
                >
                  마인크래프트 렌독 서버 비공식 위키
                </p>

                <h1
                  className={styles.heroTitle}
                  data-home-hero-text="title"
                >
                  RDWIKI
                </h1>

                <p
                  className={styles.heroDescription}
                  data-home-hero-text="description"
                >
                  원하는 정보를 빠르고 편하게 찾아보세요
                </p>

                <div
                  style={{
                    position: 'relative',
                    zIndex: 30,
                    width: '100%',
                    marginTop: 18,
                    textAlign: 'left',
                  }}
                >
                  <SearchBox
                    align="left"
                    width="100%"
                    paddingLeft={0}
                    resultModalOpen={
                      loadingQuestNpc ||
                      selectedQuestNpc !== null ||
                      loadingFaq ||
                      selectedFaq !== null
                    }
                    onQuestNpcClick={(npcId) => {
                      void openQuestNpc(npcId);
                    }}
                  />

                  {loadingQuestNpc && (
                    <span
                      role="status"
                      aria-live="polite"
                      style={{
                        display: 'block',
                        marginTop: 7,
                        paddingLeft: 12,
                        color: '#4d7356',
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      NPC 정보를 불러오는 중입니다.
                    </span>
                  )}
                </div>

                <div
                  className={styles.keywordRow}
                  data-home-keywords="true"
                >
                  <strong>인기 검색어</strong>

                  {popularSearchesLoading ? (
                    <span
                      style={{
                        color:
                          '#56715b',
                      }}
                    >
                      집계 중
                    </span>
                  ) : popularSearches.length >
                    0 ? (
                    popularSearches.map(
                      (item) => (
                        <a
                          key={
                            item.keyword
                          }
                          href="#home-search"
                          title={`최근 7일 검색 ${item.searches}회`}
                          onClick={(
                            event
                          ) => {
                            event.preventDefault();

                            requestSearchQuery(
                              item.keyword
                            );
                          }}
                        >
                          {item.keyword}
                        </a>
                      )
                    )
                  ) : (
                    <span
                      style={{
                        color:
                          '#56715b',
                      }}
                    >
                      집계된 검색어가 없습니다.
                    </span>
                  )}
                </div>
              </div>

            </section>

            <section
              className={styles.newcomer}
              data-home-panel="newcomer"
            >
              <div
                className={styles.newcomerCharacter}
                aria-hidden="true"
              >
                <Image
                  src="/images/home/icons/newcomer-guide.png"
                  alt=""
                  width={64}
                  height={64}
                  className={
                    styles.newcomerIconImage
                  }
                />
              </div>

              <div className={styles.newcomerContent}>
                <p
                  className={styles.sectionEyebrow}
                  data-home-eyebrow="true"
                >
                  WELCOME TO RDWIKI
                </p>

                <h2>처음 오셨나요?</h2>

                <p>
                  렌독 서버가 처음이라면 뉴비
                  가이드에서 기본적인 성장 과정과 위키
                  사용 방법을 확인해 보세요.
                </p>

                <div className={styles.newcomerTags}>
                  <Link
                    href="/wiki?mode=RPG&path=32&title=%EC%9C%84%ED%82%A4%EC%9D%98_%EC%9D%B4%EC%9A%A9_%EB%B0%A9%EB%B2%95%EC%9D%84_%EC%95%8C%EA%B3%A0%EC%8B%B6%EC%96%B4%EC%9A%94&id=349"
                  >
                    위키 사용법
                  </Link>

                  <Link
                    href="/wiki?mode=RPG&path=32&title=1%EC%B0%A8_%EC%A0%84%EC%A7%81_%EC%A4%91_%ED%95%84%EC%9A%94%ED%95%9C_%ED%8C%81&id=334"
                  >
                    1차 전직 가이드
                  </Link>

                  <Link
                    href="/wiki?mode=RPG&path=32&title=2%EC%B0%A8_%EC%A0%84%EC%A7%81_%EA%B0%80%EC%9D%B4%EB%93%9C&id=325"
                  >
                    2차 전직 가이드
                  </Link>

                  <Link
                    href="/wiki?mode=RPG&path=32&title=%EC%84%9C%EB%B2%84%EC%9D%98_%EC%9A%A9%EC%96%B4%EB%A5%BC_%EC%95%8C%EA%B3%A0%EC%8B%B6%EC%96%B4%EC%9A%94&id=324"
                  >
                    서버 용어
                  </Link>
                </div>
              </div>

              <Link
                href="/wiki?mode=RPG&path=32&title=%EC%84%9C%EB%B2%84%EC%97%90_%EC%B2%98%EC%9D%8C_%EB%93%A4%EC%96%B4%EC%99%94%EC%96%B4%EC%9A%94&id=323"
                className={styles.outlineButton}
                data-home-action="newcomer"
              >
                뉴비 가이드 보기
                <span aria-hidden="true">›</span>
              </Link>
            </section>

            <section
              className={styles.categoryGrid}
              aria-label="대표 카테고리"
            >
              {categoryCards.map((category) => (
                <Link
                  key={category.title}
                  href={
                    category.href ??
                    getCategoryHref(category.key)
                  }
                  data-home-card="category"
                  className={`${styles.categoryCard} ${
                    styles[
                      `categoryCard_${category.tone}`
                    ]
                  }`}
                >
                  <span
                    className={styles.categoryIcon}
                    aria-hidden="true"
                  >
                    <Image
                      src={category.iconSrc}
                      alt=""
                      width={56}
                      height={56}
                      className={
                        styles.categoryIconImage
                      }
                    />
                  </span>

                  <span className={styles.categoryBody}>
                    <strong>{category.title}</strong>
                    <span>
                      {category.description}
                    </span>
                  </span>

                  <span
                    className={styles.categoryArrow}
                    data-home-arrow="true"
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </Link>
              ))}
            </section>

            <section
              className={styles.informationGrid}
            >
              <article
                className={styles.informationCard}
                data-home-card="information"
              >
                <div className={styles.cardHeading}>
                  <h2>
                    <Image
                      src="/images/home/icons/faq.png"
                      alt=""
                      width={22}
                      height={22}
                      className={
                        styles.informationHeadingIcon
                      }
                    />
                    자주 묻는 질문
                  </h2>

                  <Link href={FAQ_DOCUMENT_HREF}>
                    더보기 ›
                  </Link>
                </div>

                <ol className={styles.popularList}>
                  {faqRankingLoading ? (
                    <li
                      className={
                        styles.emptyDocument
                      }
                    >
                      질문 순위를 불러오는 중입니다.
                    </li>
                  ) : faqRanking.length > 0 ? (
                    faqRanking.map(
                      (faq, index) => (
                        <li key={faq.id}>
                          <Link
                            href={FAQ_DOCUMENT_HREF}
                            aria-label={`${index + 1}위 ${
                              faq.title
                            }, 누적 열람 ${
                              faq.views
                            }회`}
                            onClick={(event) => {
                              event.preventDefault();
                              void openFaq(faq.id);
                            }}
                          >
                            <span
                              className={
                                styles.popularRank
                              }
                              data-home-badge="rank"
                            >
                              {index + 1}
                            </span>

                            <span>{faq.title}</span>
                          </Link>
                        </li>
                      )
                    )
                  ) : (
                    <li
                      className={
                        styles.emptyDocument
                      }
                    >
                      등록된 질문이 없습니다.
                    </li>
                  )}
                </ol>
              </article>

              <article
                className={styles.informationCard}
                data-home-card="information"
              >
                <div className={styles.cardHeading}>
                  <h2>
                    <Image
                      src="/images/home/icons/recent-updates.png"
                      alt=""
                      width={22}
                      height={22}
                      className={
                        styles.informationHeadingIcon
                      }
                    />
                    최근 업데이트된 문서
                  </h2>

                  <Link href="/wiki">
                    더보기 ›
                  </Link>
                </div>

                <ul className={styles.documentList}>
                  {recentDocuments.length > 0 ? (
                    recentDocuments.map((document) => (
                      <li key={document.id}>
                        <Link href={document.href}>
                          <span
                            className={
                              styles.documentType
                            }
                            data-home-badge="type"
                          >
                            {document.category}
                          </span>

                          <span
                            className={
                              styles.documentTitle
                            }
                          >
                            {document.title}
                          </span>

                          <time
                            dateTime={
                              document.updatedAt
                            }
                          >
                            {document.updatedLabel}
                          </time>
                        </Link>
                      </li>
                    ))
                  ) : (
                    <li
                      className={
                        styles.emptyDocument
                      }
                    >
                      최근 업데이트된 문서를
                      불러오지 못했습니다.
                    </li>
                  )}
                </ul>
              </article>

              <article
                className={styles.informationCard}
                data-home-card="information"
              >
                <div className={styles.cardHeading}>
                  <h2>
                    <Image
                      src="/images/home/icons/popular-documents.png"
                      alt=""
                      width={22}
                      height={22}
                      className={
                        styles.informationHeadingIcon
                      }
                    />
                    인기 문서
                  </h2>

                  <Link href="/wiki">
                    더보기 ›
                  </Link>
                </div>

                <ol className={styles.popularList}>
                  {popularDocumentsLoading ? (
                    <li
                      className={
                        styles.emptyDocument
                      }
                    >
                      인기 문서를 불러오는 중입니다.
                    </li>
                  ) : popularDocuments.length > 0 ? (
                    popularDocuments.map(
                      (document, index) => (
                        <li key={document.id}>
                          <Link
                            href={document.href}
                            aria-label={`${index + 1}위 ${
                              document.title
                            }, 최근 7일 조회수 ${
                              document.views
                            }회`}
                          >
                            <span
                              className={
                                styles.popularRank
                              }
                              data-home-badge="rank"
                            >
                              {index + 1}
                            </span>

                            <span>
                              {document.title}
                            </span>
                          </Link>
                        </li>
                      )
                    )
                  ) : (
                    <li
                      className={
                        styles.emptyDocument
                      }
                    >
                      최근 7일간 집계된 인기 문서가
                      없습니다.
                    </li>
                  )}
                </ol>
              </article>
            </section>

            <section
              className={styles.recommendSection}
              data-home-panel="recommend"
            >
              <div className={styles.sectionHeading}>
                <div>
                  <p
                    className={
                      styles.sectionEyebrow
                    }
                    data-home-eyebrow="true"
                  >
                    RECOMMENDED
                  </p>

                  <h2>추천 탐색</h2>
                </div>

                <Link href="/wiki">
                  전체 문서 보기 ›
                </Link>
              </div>

              <div className={styles.recommendGrid}>
                {recommendations.map(
                  (recommendation) => (
                    <Link
                      key={recommendation.title}
                      href={recommendation.href}
                      className={
                        styles.recommendCard
                      }
                      data-home-card="recommend"
                    >
                      <span
                        className={
                          styles.recommendIcon
                        }
                        aria-hidden="true"
                      >
                        <Image
                          src={
                            recommendation.iconSrc
                          }
                          alt=""
                          width={38}
                          height={38}
                          className={
                            styles.recommendIconImage
                          }
                        />
                      </span>

                      <span
                        className={
                          styles.recommendBody
                        }
                      >
                        <small>
                          {recommendation.label}
                        </small>
                        <strong>
                          {recommendation.title}
                        </strong>
                        <span>
                          {
                            recommendation.description
                          }
                        </span>
                      </span>

                      <span
                        className={
                          styles.recommendArrow
                        }
                        data-home-arrow="true"
                        aria-hidden="true"
                      >
                        ›
                      </span>
                    </Link>
                  )
                )}
              </div>
            </section>

            <footer
              className={styles.footer}
              data-home-panel="footer"
            >
              <div className={styles.footerBrand}>
                <Link
                  href="/"
                  aria-label="RDWIKI 홈"
                >
                  <Image
                    src="/images/home/branding/rdwiki-logo.png"
                    alt="RDWIKI"
                    width={360}
                    height={120}
                    className={styles.footerLogo}
                  />
                </Link>

                <span>
                  렌독 유저를 위한 비공식 정보 위키
                </span>
              </div>

              <div
                className={styles.communityLinks}
                aria-label="렌독 커뮤니티"
              >
                <a
                  href="https://discord.gg/rendogkr"
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.communityLink} ${styles.communityLinkDiscord}`}
                  aria-label="렌독서버 디스코드 열기"
                  data-tooltip="렌독서버 디스코드"
                >
                  <svg
                    viewBox="0 0 16 16"
                    aria-hidden="true"
                  >
                    <path
                      d="M13.545 2.907a13.2 13.2 0 0 0-3.257-.639c.05.09.11.212.15.315a12.3 12.3 0 0 0-3.495 0 8 8 0 0 1 .152-.315 13.2 13.2 0 0 0-3.258.639C1.735 6.028 1.06 9.067 1.36 12.06c1.253.93 2.466 1.494 3.659 1.865q.444-.608.808-1.272a8 8 0 0 1-1.262-.61q.158-.118.311-.242c2.434 1.126 5.073 1.126 7.477 0q.153.124.311.242a8 8 0 0 1-1.262.61q.364.665.808 1.272c1.193-.371 2.406-.935 3.659-1.865.35-3.467-.599-6.476-2.324-9.153M6.07 10.245c-.732 0-1.333-.667-1.333-1.485s.588-1.485 1.333-1.485c.752 0 1.345.673 1.333 1.485 0 .818-.588 1.485-1.333 1.485m4.639 0c-.733 0-1.334-.667-1.334-1.485s.588-1.485 1.334-1.485c.752 0 1.345.673 1.333 1.485 0 .818-.581 1.485-1.333 1.485"
                    />
                  </svg>
                </a>

                <a
                  href="https://cafe.naver.com/rendogserver"
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.communityLink} ${styles.communityLinkNaver}`}
                  aria-label="렌독서버 공식카페 열기"
                  data-tooltip="렌독서버 공식카페"
                >
                  <span aria-hidden="true">N</span>
                </a>

                <a
                  href="https://minelist.kr/servers/2113-rendog.kr"
                  target="_blank"
                  rel="noreferrer"
                  className={`${styles.communityLink} ${styles.communityLinkMinelist}`}
                  aria-label="마인리스트 열기"
                  data-tooltip="마인리스트"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 5.5h12v3H6v-3Zm0 5h12v3H6v-3Zm0 5h8v3H6v-3Zm10 0h2v3h-2v-3Z"
                    />
                  </svg>
                </a>
              </div>
            </footer>
          </main>

          <aside
            className={styles.rightRail}
            data-home-rail="right"
            aria-hidden="true"
          />
        </div>
      </div>

      {selectedFaq && (
        <FaqDetailModal
          sel={selectedFaq}
          onClose={() => {
            setSelectedFaq(null);
          }}
        />
      )}

      {loadingFaq && (
        <span
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            right: 18,
            bottom: 18,
            zIndex: 12000,
            padding: '10px 12px',
            border: '1px solid var(--border)',
            borderRadius: 10,
            background:
              'var(--surface-elevated)',
            boxShadow: 'var(--shadow-xl)',
            color: 'var(--foreground)',
            fontSize: 12,
            fontWeight: 700,
          }}
        >
          질문 내용을 불러오는 중입니다.
        </span>
      )}

      {selectedQuestNpc && (
        <NpcDetailModal
          npc={selectedQuestNpc}
          mode="quest"
          onClose={() => {
            setSelectedQuestNpc(null);
          }}
        />
      )}

      {faqError && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            right: 18,
            bottom: 18,
            zIndex: 12000,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 360,
            padding: '12px 14px',
            border: '1px solid var(--border)',
            borderRadius: 12,
            background:
              'var(--surface-elevated)',
            boxShadow: 'var(--shadow-xl)',
            color: 'var(--foreground)',
            fontSize: 13,
          }}
        >
          <span>{faqError}</span>

          <button
            type="button"
            aria-label="FAQ 오류 알림 닫기"
            onClick={() => {
              setFaqError(null);
            }}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 26,
              height: 26,
              border: 0,
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--danger-fg)',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}

      {questNpcError && (
        <div
          role="alert"
          style={{
            position: 'fixed',
            right: 18,
            bottom: 18,
            zIndex: 12000,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            maxWidth: 360,
            padding: '12px 14px',
            border: '1px solid var(--border)',
            borderRadius: 12,
            background:
              'var(--surface-elevated)',
            boxShadow: 'var(--shadow-xl)',
            color: 'var(--foreground)',
            fontSize: 13,
          }}
        >
          <span>{questNpcError}</span>

          <button
            type="button"
            aria-label="오류 알림 닫기"
            onClick={() => {
              setQuestNpcError(null);
            }}
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 26,
              height: 26,
              border: 0,
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--danger-fg)',
              fontSize: 18,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
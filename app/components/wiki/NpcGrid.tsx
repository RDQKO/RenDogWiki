"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import { toProxyUrl } from "@lib/cdn";

import "../../wiki/css/document-components/quest-grid.css";

const ALLOWED_TAGS = [
  "추천",
  "필수",
  "완정",
  "보스",
  "타임어택",
  "기사단",
  "극난퀘",
  "혼의 시련",
  "6차",
] as const;

type TagKey =
  (typeof ALLOWED_TAGS)[number];

export type Npc = {
  id: number;
  name: string;
  icon: string;
  location_x: number;
  location_y: number;
  location_z: number;
  pictures?: string[];
  tag?: string | null;
};

type Props = {
  npcs: Npc[];
  onClick?: (
    npc: Npc,
  ) => void;
  selectedNpcId?:
    number | null;
  page?: number;
  onPageChange?: (
    nextPage: number,
  ) => void;
  pageSize?: number;
  showPager?: boolean;
  villageName?: string | null;
};

const DESKTOP_PAGE_SIZE =
  7 * 3;

const MOBILE_PAGE_SIZE =
  3 * 4;

const MOBILE_QUERY =
  "(max-width: 768px)";

type VillageTheme =
  | "slime"
  | "desert"
  | "frost"
  | "under"
  | "seloterain"
  | "atlantis"
  | "cretora"
  | "hell"
  | "finalis"
  | "default";

function normalizeVillageName(
  value?: string | null,
) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(
      /[\s_\-·ㆍ.,()[\]{}]+/g,
      "",
    );
}

function resolveVillageTheme(
  value?: string | null,
): VillageTheme {
  const village =
    normalizeVillageName(value);

  if (!village) {
    return "default";
  }

  if (
    village.includes(
      "슬라임빌리지",
    ) ||
    village === "슬라임"
  ) {
    return "slime";
  }

  if (
    village.includes(
      "데저트빌리지",
    ) ||
    village.includes("데저트") ||
    village.includes("사막")
  ) {
    return "desert";
  }

  if (
    village.includes(
      "프로스트타운",
    ) ||
    village.includes("프로스트") ||
    village.includes("설원")
  ) {
    return "frost";
  }

  if (
    village.includes(
      "언더빌리지",
    ) ||
    village.includes("언더") ||
    village.includes("지하")
  ) {
    return "under";
  }

  if (
    village.includes(
      "셀로테레인",
    ) ||
    village.includes(
      "셀로테라인",
    )
  ) {
    return "seloterain";
  }

  if (
    village.includes(
      "아틀란티스",
    )
  ) {
    return "atlantis";
  }

  if (
    village.includes(
      "크레토라",
    )
  ) {
    return "cretora";
  }

  if (
    village.includes(
      "헬스토니아",
    ) ||
    village.includes("헬스토니아")
  ) {
    return "hell";
  }

  if (
    village.includes(
      "피날리스",
    ) ||
    village.includes("공허")
  ) {
    return "finalis";
  }

  return "default";
}

function readVillageNameFromPage() {
  if (
    typeof window ===
    "undefined"
  ) {
    return "";
  }

  const search =
    new URLSearchParams(
      window.location.search,
    );

  const titleParam =
    search.get("title");

  if (titleParam) {
    try {
      return decodeURIComponent(
        titleParam,
      ).replace(/_/g, " ");
    } catch {
      return titleParam.replace(
        /_/g,
        " ",
      );
    }
  }

  const titleElement =
    document.querySelector(
      ".wiki-content-title",
    );

  return String(
    titleElement?.textContent ??
      "",
  ).trim();
}

function isImageUrl(
  value?: string | null,
) {
  return (
    typeof value ===
      "string" &&
    value.startsWith("http")
  );
}

function slug(
  value: string,
) {
  return value.replace(
    /\s+/g,
    "-",
  );
}

function resolveTag(
  value?: string | null,
): TagKey | null {
  const tag =
    String(value ?? "").trim();

  return (
    ALLOWED_TAGS as readonly string[]
  ).includes(tag)
    ? (tag as TagKey)
    : null;
}

function getNameClass(
  name: string,
) {
  const compactLength =
    name.replace(
      /\s+/g,
      "",
    ).length;

  if (compactLength >= 13) {
    return " is-xlong";
  }

  if (compactLength >= 9) {
    return " is-longer";
  }

  if (compactLength >= 6) {
    return " is-long";
  }

  return "";
}

function QuestName({
  name,
  sizeClass,
}: {
  name: string;
  sizeClass: string;
}) {
  const ref =
    React.useRef<HTMLSpanElement | null>(
      null,
    );

  const [
    fittedFontSize,
    setFittedFontSize,
  ] = React.useState<number | null>(
    null,
  );

  React.useLayoutEffect(() => {
    const element =
      ref.current;

    if (!element) return;

    let animationFrame = 0;

    const fit = () => {
      cancelAnimationFrame(
        animationFrame,
      );

      animationFrame =
        requestAnimationFrame(() => {
          const target =
            ref.current;

          if (!target) return;

          /*
           * 이전 측정에서 적용한 인라인 크기를 잠시 제거한 뒤,
           * CSS가 정한 기본 크기를 기준으로 다시 계산한다.
           */
          target.style.fontSize = "";

          const computed =
            window.getComputedStyle(
              target,
            );

          const baseFontSize =
            Number.parseFloat(
              computed.fontSize,
            ) || 15;

          const availableWidth =
            target.clientWidth;

          const requiredWidth =
            target.scrollWidth;

          if (
            requiredWidth <=
              availableWidth + 0.5 ||
            availableWidth <= 0
          ) {
            setFittedFontSize(
              null,
            );
            return;
          }

          const ratio =
            availableWidth /
            requiredWidth;

          const nextSize =
            Math.max(
              10,
              Math.floor(
                baseFontSize *
                  ratio *
                  100,
              ) / 100,
            );

          setFittedFontSize(
            nextSize,
          );
        });
    };

    fit();

    const resizeObserver =
      typeof ResizeObserver !==
      "undefined"
        ? new ResizeObserver(
            fit,
          )
        : null;

    resizeObserver?.observe(
      element,
    );

    if (element.parentElement) {
      resizeObserver?.observe(
        element.parentElement,
      );
    }

    window.addEventListener(
      "resize",
      fit,
    );

    void document.fonts?.ready
      ?.then(fit)
      .catch(() => undefined);

    return () => {
      cancelAnimationFrame(
        animationFrame,
      );

      resizeObserver?.disconnect();

      window.removeEventListener(
        "resize",
        fit,
      );
    };
  }, [
    name,
    sizeClass,
  ]);

  return (
    <span
      ref={ref}
      className={[
        "npc-name",
        sizeClass,
      ]
        .filter(Boolean)
        .join(" ")}
      style={
        fittedFontSize
          ? {
              fontSize:
                `${fittedFontSize}px`,
            }
          : undefined
      }
      title={name}
    >
      {name}
    </span>
  );
}

function QuestCard({
  npc,
  selected,
  onActivate,
}: {
  npc: Npc;
  selected: boolean;
  onActivate: () => void;
}) {
  const tag =
    resolveTag(npc.tag);

  const nameClass =
    getNameClass(npc.name);

  const title = [
    npc.name,
    `(${npc.location_x}, ${npc.location_y}, ${npc.location_z})`,
  ].join(" · ");

  return (
    <button
      type="button"
      className={[
        "npc-card",
        selected
          ? "is-selected"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={selected}
      aria-label={npc.name}
      title={title}
      data-selected={
        selected
          ? "true"
          : "false"
      }
      data-has-tag={
        tag
          ? "true"
          : "false"
      }
      onClick={onActivate}
    >
      {tag ? (
        <span
          className={[
            "npc-tag-badge",
            `tag-${slug(tag)}`,
          ].join(" ")}
          data-quest-tag={tag}
          aria-hidden
        >
          {tag}
        </span>
      ) : null}

      <span
        className="npc-card-inner"
        aria-hidden
      >
        <span className="npc-icon-wrap">
          <span className="npc-icon-surface">
            {isImageUrl(
              npc.icon,
            ) ? (
              <img
                src={toProxyUrl(
                  npc.icon,
                )}
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
                className="npc-icon-img"
              />
            ) : (
              <span className="npc-emoji">
                {npc.icon || ""}
              </span>
            )}
          </span>
        </span>

        <QuestName
          name={npc.name}
          sizeClass={
            nameClass.trim()
          }
        />

        <span
          className="npc-card-open-indicator"
        >
          <span>상세 보기</span>

          <svg
            viewBox="0 0 18 18"
            focusable="false"
          >
            <path
              d="m7 5 4 4-4 4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </button>
  );
}

export default function NpcGrid({
  npcs,
  onClick,
  selectedNpcId,
  page,
  onPageChange,
  pageSize,
  showPager = false,
  villageName,
}: Props) {
  const [
    innerPage,
    setInnerPage,
  ] = useState(0);

  const [
    isMobile,
    setIsMobile,
  ] = useState(false);

  const [
    detectedVillageName,
    setDetectedVillageName,
  ] = useState(
    villageName ?? "",
  );

  useEffect(() => {
    if (villageName) {
      setDetectedVillageName(
        villageName,
      );
      return;
    }

    /*
     * 현재 구조에서는 NpcGrid 호출부에 마을명이 직접 전달되지
     * 않는 경우가 있으므로 문서 URL 제목을 안전한 fallback으로 쓴다.
     * npcs가 바뀔 때 다시 읽어 마을 문서 전환에도 대응한다.
     */
    setDetectedVillageName(
      readVillageNameFromPage(),
    );
  }, [
    npcs,
    villageName,
  ]);

  const villageTheme =
    useMemo(
      () =>
        resolveVillageTheme(
          villageName ??
            detectedVillageName,
        ),
      [
        detectedVillageName,
        villageName,
      ],
    );

  useEffect(() => {
    if (
      typeof window ===
      "undefined"
    ) {
      return;
    }

    const mediaQuery =
      window.matchMedia(
        MOBILE_QUERY,
      );

    const apply = () => {
      setIsMobile(
        mediaQuery.matches,
      );
    };

    apply();

    if (
      typeof mediaQuery
        .addEventListener ===
      "function"
    ) {
      mediaQuery.addEventListener(
        "change",
        apply,
      );

      return () => {
        mediaQuery.removeEventListener(
          "change",
          apply,
        );
      };
    }

    mediaQuery.addListener(
      apply,
    );

    return () => {
      mediaQuery.removeListener(
        apply,
      );
    };
  }, []);

  const resolvedPageSize =
    typeof page ===
      "number" &&
    typeof pageSize ===
      "number" &&
    pageSize > 0
      ? pageSize
      : typeof pageSize ===
            "number" &&
          pageSize > 0
        ? pageSize
        : isMobile
          ? MOBILE_PAGE_SIZE
          : DESKTOP_PAGE_SIZE;

  const currentPage =
    typeof page ===
    "number"
      ? page
      : innerPage;

  const pageCount =
    Math.max(
      1,
      Math.ceil(
        npcs.length /
          resolvedPageSize,
      ),
    );

  useEffect(() => {
    if (
      currentPage <=
      pageCount - 1
    ) {
      return;
    }

    const nextPage =
      Math.max(
        0,
        pageCount - 1,
      );

    if (
      typeof page ===
        "number" &&
      onPageChange
    ) {
      onPageChange(
        nextPage,
      );
      return;
    }

    setInnerPage(
      nextPage,
    );
  }, [
    currentPage,
    onPageChange,
    page,
    pageCount,
  ]);

  const visibleNpcs =
    useMemo(() => {
      const start =
        currentPage *
        resolvedPageSize;

      return npcs.slice(
        start,
        start +
          resolvedPageSize,
      );
    }, [
      currentPage,
      npcs,
      resolvedPageSize,
    ]);

  const goPage = (
    targetPage: number,
  ) => {
    const nextPage =
      Math.min(
        Math.max(
          0,
          targetPage,
        ),
        pageCount - 1,
      );

    if (
      typeof page ===
        "number" &&
      onPageChange
    ) {
      onPageChange(
        nextPage,
      );
      return;
    }

    setInnerPage(
      nextPage,
    );
  };

  return (
    <div
      className="npc-grid-wrap"
      data-wiki-grid="quest"
      data-village-theme={
        villageTheme
      }
      data-village-name={
        villageName ??
        detectedVillageName
      }
    >
      {visibleNpcs.length >
      0 ? (
        <div
          role="grid"
          aria-label="퀘스트 목록"
          className="npc-grid"
        >
          {visibleNpcs.map(
            (npc) => (
              <QuestCard
                key={npc.id}
                npc={npc}
                selected={
                  selectedNpcId ===
                  npc.id
                }
                onActivate={() =>
                  onClick?.(
                    npc,
                  )
                }
              />
            ),
          )}
        </div>
      ) : (
        <div
          className="npc-grid-empty"
          role="status"
        >
          <span
            className="npc-grid-empty__icon"
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              focusable="false"
            >
              <path
                d="M7 4.5h10v15H7v-15Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M9.5 8h5M9.5 11.5h5M9.5 15h3.2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <span>
            등록된 목록이 없습니다.
          </span>
        </div>
      )}

      {showPager &&
      pageCount > 1 ? (
        <div className="npc-pager-wrap">
          <div
            className="npc-pager"
            aria-label="퀘스트 페이지 이동"
          >
            <button
              type="button"
              className="npc-pg-btn"
              onClick={() =>
                goPage(
                  currentPage - 1,
                )
              }
              disabled={
                currentPage <= 0
              }
              aria-label="이전 페이지"
              title="이전 페이지"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden
                focusable="false"
              >
                <path
                  d="m12.25 5.5-4.5 4.5 4.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>

            <span
              className="npc-pg-text"
              aria-live="polite"
            >
              <strong>
                {currentPage +
                  1}
              </strong>

              <span>/</span>

              <span>
                {pageCount}
              </span>
            </span>

            <button
              type="button"
              className="npc-pg-btn"
              onClick={() =>
                goPage(
                  currentPage + 1,
                )
              }
              disabled={
                currentPage >=
                pageCount - 1
              }
              aria-label="다음 페이지"
              title="다음 페이지"
            >
              <svg
                viewBox="0 0 20 20"
                aria-hidden
                focusable="false"
              >
                <path
                  d="m7.75 5.5 4.5 4.5-4.5 4.5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

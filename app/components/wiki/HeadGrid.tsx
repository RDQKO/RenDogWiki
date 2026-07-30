"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { toProxyUrl } from "@lib/cdn";

import "../../wiki/css/document-components/head-grid.css";

export type Head = {
  id: number;
  order: number;
  location_x: number;
  location_y: number;
  location_z: number;
  pictures?: string[];
};

type Props = {
  heads: Head[];
  onClick?: (
    head: Head,
  ) => void;
  selectedHeadId?:
    number | null;
  headIcon?:
    string | null;
  villageName?:
    string | null;
};

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
    )
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
    return titleParam.replace(
      /_/g,
      " ",
    );
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

function isImageSource(
  value?: string | null,
) {
  return (
    typeof value ===
      "string" &&
    value.trim().length > 0
  );
}

function HeadCoordinate({
  value,
}: {
  value: string;
}) {
  const coordinateRef =
    useRef<HTMLSpanElement | null>(
      null,
    );

  const [
    fittedFontSize,
    setFittedFontSize,
  ] = useState<number | null>(
    null,
  );

  useLayoutEffect(() => {
    const element =
      coordinateRef.current;

    if (!element) {
      return;
    }

    let animationFrame = 0;

    const fitCoordinate = () => {
      cancelAnimationFrame(
        animationFrame,
      );

      animationFrame =
        requestAnimationFrame(() => {
          const target =
            coordinateRef.current;

          if (!target) {
            return;
          }

          /*
           * 먼저 CSS 기본 크기로 되돌린 뒤 실제 너비를 측정한다.
           * 넉넉한 좌표는 12px을 유지하고,
           * 카드 폭을 넘는 좌표만 필요한 만큼 축소한다.
           */
          target.style.fontSize = "";

          const computed =
            window.getComputedStyle(
              target,
            );

          const baseFontSize =
            Number.parseFloat(
              computed.fontSize,
            ) || 12;

          const availableWidth =
            target.clientWidth;

          const requiredWidth =
            target.scrollWidth;

          if (
            availableWidth <= 0 ||
            requiredWidth <=
              availableWidth + 0.5
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

    fitCoordinate();

    const resizeObserver =
      typeof ResizeObserver !==
      "undefined"
        ? new ResizeObserver(
            fitCoordinate,
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
      fitCoordinate,
    );

    void document.fonts?.ready
      ?.then(fitCoordinate)
      .catch(() => undefined);

    return () => {
      cancelAnimationFrame(
        animationFrame,
      );

      resizeObserver?.disconnect();

      window.removeEventListener(
        "resize",
        fitCoordinate,
      );
    };
  }, [value]);

  return (
    <span
      ref={coordinateRef}
      className="head-card__coordinate"
      style={
        fittedFontSize
          ? {
              fontSize:
                `${fittedFontSize}px`,
            }
          : undefined
      }
      title={value}
    >
      {value}
    </span>
  );
}

function HeadCard({
  head,
  selected,
  thumbnail,
  onActivate,
}: {
  head: Head;
  selected: boolean;
  thumbnail:
    string | null;
  onActivate: () => void;
}) {
  const coordinateText =
    [
      head.location_x,
      head.location_y,
      head.location_z,
    ].join(", ");

  return (
    <button
      type="button"
      className={[
        "head-card",
        selected
          ? "is-selected"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-pressed={selected}
      aria-label={
        `${head.order}번 머리, 좌표 ${coordinateText}`
      }
      title={
        `${head.order}번 · (${coordinateText})`
      }
      data-selected={
        selected
          ? "true"
          : "false"
      }
      onClick={onActivate}
    >
      <span
        className="head-card__decor"
        aria-hidden
      />

      <span
        className="head-card__icon-wrap"
        aria-hidden
      >
        <span className="head-card__icon-surface">
          {isImageSource(
            thumbnail,
          ) ? (
            <img
              src={toProxyUrl(
                thumbnail!,
              )}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
              className="head-card-img"
            />
          ) : (
            <span className="head-card-emoji">
              ?
            </span>
          )}
        </span>
      </span>

      <span className="head-card__order">
        <strong>
          {head.order}
        </strong>

        <span>
          번
        </span>
      </span>

      <HeadCoordinate
        value={coordinateText}
      />
    </button>
  );
}

export default function HeadGrid({
  heads,
  onClick,
  selectedHeadId,
  headIcon,
  villageName,
}: Props) {
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

    setDetectedVillageName(
      readVillageNameFromPage(),
    );
  }, [
    heads,
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

  const villageIcon =
    isImageSource(headIcon)
      ? headIcon!.trim()
      : null;

  return (
    <div
      className="head-grid-wrap"
      data-wiki-grid="head"
      data-village-theme={
        villageTheme
      }
      data-village-name={
        villageName ??
        detectedVillageName
      }
    >
      {heads.length > 0 ? (
        <div
          className="head-grid"
          role="grid"
          aria-label="머리찾기 목록"
        >
          {heads.map(
            (head) => {
              const headPicture =
                Array.isArray(
                  head.pictures,
                ) &&
                head.pictures.length >
                  0
                  ? head.pictures[0]
                  : null;

              const thumbnail =
                villageIcon ??
                headPicture;

              return (
                <HeadCard
                  key={head.id}
                  head={head}
                  selected={
                    selectedHeadId ===
                    head.id
                  }
                  thumbnail={
                    thumbnail
                  }
                  onActivate={() =>
                    onClick?.(
                      head,
                    )
                  }
                />
              );
            },
          )}
        </div>
      ) : (
        <div
          className="head-grid-empty"
          role="status"
        >
          <span
            className="head-grid-empty__icon"
            aria-hidden
          >
            <svg
              viewBox="0 0 24 24"
              focusable="false"
            >
              <path
                d="M7 5.5h10v13H7v-13Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="M9.2 10.2h.01M14.8 10.2h.01M9.5 14.2c.8.6 1.6.9 2.5.9s1.7-.3 2.5-.9"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </span>

          <span>
            등록된 머리가 없습니다.
          </span>
        </div>
      )}
    </div>
  );
}

"use client";

import React, {
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";

import { toProxyUrl } from "@lib/cdn";

import NpcPictureSlider from "./NpcPictureSlider";

import "@/wiki/css/wiki-detail-modal.css";
import "@/wiki/css/document-components/head-detail-modal.css";

export type HeadLike = {
  id: number;
  order: number;
  location_x: number;
  location_y: number;
  location_z: number;
  pictures?: string[];
};

export type HeadDetailModalProps = {
  head: HeadLike;

  /**
   * 현재 머리찾기 문서의 대표 아이콘.
   * 이미지 URL 또는 이모지를 지원한다.
   */
  docIcon?: string;

  /**
   * 전달하지 않아도 현재 문서 제목에서 자동 감지한다.
   */
  villageName?: string | null;

  onClose: () => void;
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

function isRemoteImage(
  value?: string | null,
) {
  return (
    typeof value ===
      "string" &&
    /^https?:\/\//i.test(
      value.trim(),
    )
  );
}

function CoordinateAxis({
  axis,
  value,
}: {
  axis: "X" | "Y" | "Z";
  value: number;
}) {
  return (
    <div className="head-detail-modal__axis">
      <span className="head-detail-modal__axis-label">
        {axis}
      </span>

      <strong className="head-detail-modal__axis-value">
        {value}
      </strong>
    </div>
  );
}

export default function HeadDetailModal({
  head,
  docIcon,
  villageName,
  onClose,
}: HeadDetailModalProps) {
  const titleId =
    useId();

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
  }, [villageName]);

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
    document.body.classList.add(
      "rd-modal-open",
    );

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.classList.remove(
        "rd-modal-open",
      );

      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [onClose]);

  const coordinateText =
    `${head.location_x}, ${head.location_y}, ${head.location_z}`;

  return (
    <div
      className={[
        "npc-modal-backdrop",
        "head-detail-modal-backdrop",
      ].join(" ")}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={[
          "npc-modal-main",
          "head-detail-modal",
        ].join(" ")}
        data-village-theme={
          villageTheme
        }
        data-village-name={
          villageName ??
          detectedVillageName
        }
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <section
          className={[
            "npc-modal-left",
            "head-detail-modal__media",
          ].join(" ")}
          aria-label="머리 위치 사진"
        >
          <div className="head-detail-modal__profile">
            <span
              className="head-detail-modal__profile-icon"
              aria-hidden
            >
              {isRemoteImage(
                docIcon,
              ) ? (
                <img
                  src={toProxyUrl(
                    docIcon!,
                  )}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                />
              ) : (
                <span className="head-detail-modal__profile-emoji">
                  {docIcon || "?"}
                </span>
              )}
            </span>

            <span className="head-detail-modal__profile-copy">
              <span className="head-detail-modal__eyebrow">
                HEAD FINDER
              </span>

              <strong
                id={titleId}
                className="head-detail-modal__title"
              >
                {head.order}
                번 머리
              </strong>
            </span>
          </div>

          <div className="head-detail-modal__picture-frame">
            <NpcPictureSlider
              pictures={
                head.pictures || []
              }
            />
          </div>
        </section>

        <section
          className={[
            "npc-modal-right",
            "head-detail-modal__information",
          ].join(" ")}
          aria-label="머리 위치 정보"
        >
          <div className="head-detail-modal__information-inner">
            <header className="head-detail-modal__heading">
              <span
                className="head-detail-modal__heading-icon"
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  focusable="false"
                >
                  <path
                    d="M12 21s6-6.1 6-11a6 6 0 1 0-12 0c0 4.9 6 11 6 11Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinejoin="round"
                  />
                  <circle
                    cx="12"
                    cy="10"
                    r="2.15"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                  />
                </svg>
              </span>

              <span className="head-detail-modal__heading-copy">
                <strong>
                  머리 위치
                </strong>

                <small>
                  사진과 좌표를 함께 확인하세요.
                </small>
              </span>
            </header>

            <div className="head-detail-modal__coordinate-card">
              <span className="head-detail-modal__coordinate-label">
                좌표
              </span>

              <strong className="head-detail-modal__coordinate-full">
                (
                {" "}
                {coordinateText}
                {" "}
                )
              </strong>

              <div className="head-detail-modal__axis-grid">
                <CoordinateAxis
                  axis="X"
                  value={
                    head.location_x
                  }
                />

                <CoordinateAxis
                  axis="Y"
                  value={
                    head.location_y
                  }
                />

                <CoordinateAxis
                  axis="Z"
                  value={
                    head.location_z
                  }
                />
              </div>
            </div>

            <div className="head-detail-modal__guide">
              <span
                className="head-detail-modal__guide-icon"
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  focusable="false"
                >
                  <path
                    d="M12 3.8a7.1 7.1 0 0 0-4.5 12.6c.7.6 1.1 1.2 1.2 1.9h6.6c.1-.7.5-1.3 1.2-1.9A7.1 7.1 0 0 0 12 3.8Z"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.2 21h5.6M9 18.3h6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                </svg>
              </span>

              <span>
                사진 속 주변 지형을 기준으로
                <br />
                좌표의 정확한 위치를 찾을 수 있습니다.
              </span>
            </div>
          </div>
        </section>

        <button
          type="button"
          className={[
            "npc-modal-close-btn",
            "head-detail-modal__close",
          ].join(" ")}
          onClick={onClose}
          aria-label="머리 상세 정보 닫기"
        >
          <svg
            viewBox="0 0 20 20"
            aria-hidden
            focusable="false"
          >
            <path
              d="m6 6 8 8M14 6l-8 8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

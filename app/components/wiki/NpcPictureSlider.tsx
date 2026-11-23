// =============================================
// File: app/components/wiki/NpcPictureSlider.tsx
// =============================================
'use client';
import ManagedImage from '@/components/common/ManagedImage';


import React, { useEffect, useMemo, useState } from 'react';
import { toProxyUrl } from '@lib/cdn';

/**
 * NPC 사진 슬라이더
 * - pictures 배열을 좌/우 버튼(또는 키보드 좌/우)로 순회
 * - 빈 배열이면 "사진 없음" 표시
 * - 외부 스타일: .npc-picture-slider, .npc-picture-img, 버튼 클래스 그대로 사용
 */
const NpcPictureSlider = ({ pictures = [] }: { pictures: string[] }) => {
  const [idx, setIdx] = useState(0);

  // ✅ 슬라이더에서 사용할 URL을 CloudFront로 미리 리라이트
  const urls = useMemo(() => pictures.map((p) => toProxyUrl(p)), [pictures]);

  // pictures 변경 시 인덱스 안전화(리셋/클램프)
  useEffect(() => {
    if (!urls.length) {
      setIdx(0);
      return;
    }
    if (idx >= urls.length) setIdx(0);
  }, [urls, idx]);

  if (!urls.length) {
    return <div className="npc-picture-slider-empty">사진 없음</div>;
  }

  const total = urls.length;
  const prev = () => setIdx(i => (i - 1 + total) % total);
  const next = () => setIdx(i => (i + 1) % total);

  return (
    <div
      className="npc-picture-slider"
      tabIndex={0}
      role="group"
      aria-roledescription="carousel"
      aria-label="NPC 사진 슬라이더"
      aria-live="polite"
      onKeyDown={(e) => {
        if (total <= 1) return;
        if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
        if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      }}
    >
      <ManagedImage
        src={urls[idx]}
        alt={`npc image ${idx + 1}/${total}`}
        className="npc-picture-img"
        loading="lazy"
        decoding="async"
        draggable={false}
      />

      {total > 1 && (
        <>
          <button
            onClick={prev}
            className="npc-picture-slider-btn npc-picture-slider-btn-left"
            aria-label="이전"
            type="button"
          >
            <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
              <polyline
                points="22,12 16,19 22,26"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            onClick={next}
            className="npc-picture-slider-btn npc-picture-slider-btn-right"
            aria-label="다음"
            type="button"
          >
            <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true">
              <polyline
                points="16,12 22,19 16,26"
                fill="none"
                stroke="#fff"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      )}
    </div>
  );
};

export default NpcPictureSlider;

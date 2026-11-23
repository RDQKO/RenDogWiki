// =============================================
// File: app/components/manager/PictureGrid.tsx
// =============================================

'use client';
import ManagedImage from '@/components/common/ManagedImage';


import React, { useMemo } from 'react';
import { toProxyUrl } from '@lib/cdn';

/**
 * 간단한 썸네일 그리드
 * - pictures 또는 urls 중 하나로 이미지 배열을 받아 렌더링
 * - 빈 상태 메시지/추가 버튼, 각 썸네일별 삭제 버튼(옵션)
 * - 퍼포먼스/접근성 보강: lazy loading, async decoding, 버튼 aria/타입 지정
 */

type PictureGridProps = {
  /** 이미지 배열: pictures 또는 urls 아무거나 사용 가능 (pictures 우선) */
  pictures?: string[];
  urls?: string[];

  /** 썸네일 크기(px) / 간격(px) */
  size?: number;
  gap?: number;

  /** 비었을 때 표시 */
  emptyText?: React.ReactNode;

  /** 삭제/추가 동작(주면 버튼 렌더링) */
  onRemove?: (index: number) => void;
  onAddClick?: () => void;
};

export function PictureGrid({
  pictures,
  urls,
  size = 70,
  gap = 10,
  emptyText,
  onRemove,
  onAddClick,
}: PictureGridProps) {
  // pictures가 있으면 사용, 아니면 urls 사용
  const items = useMemo(() => (pictures ?? urls ?? []) as string[], [pictures, urls]);

  if (!items.length) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ color: '#bbb' }}>{emptyText ?? '사진 없음'}</span>
        {onAddClick && (
          <button
            type="button"
            className="npc-modal-image-btn"
            onClick={onAddClick}
            aria-label="사진 추가"
            title="사진 추가"
          >
            + 사진 추가
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap }}>
      {items.map((url, idx) => {
        const src = url?.startsWith('http') ? toProxyUrl(url) : url;
        return (
          <div key={`${idx}-${url}`} style={{ position: 'relative' }}>
            <ManagedImage
              src={src}
              alt={`pic-${idx + 1}`}
              width={size}
              height={size}
              loading="lazy"
              decoding="async"
              draggable={false}
              style={{
                width: size,
                height: size,
                objectFit: 'cover',
                borderRadius: 8,
                border: '1px solid #ccc',
                display: 'block',
              }}
            />
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(idx)}
                aria-label={`사진 ${idx + 1} 삭제`}
                title="삭제"
                style={{
                  position: 'absolute',
                  top: -8,
                  right: -8,
                  border: 'none',
                  background: '#fff',
                  borderRadius: '50%',
                  width: 24,
                  height: 24,
                  boxShadow: '0 1px 4px #0002',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            )}
          </div>
        );
      })}

      {onAddClick && (
        <button
          type="button"
          className="npc-modal-image-btn"
          onClick={onAddClick}
          aria-label="사진 추가"
          title="사진 추가"
          style={{ alignSelf: 'center' }}
        >
          + 사진 추가
        </button>
      )}
    </div>
  );
}

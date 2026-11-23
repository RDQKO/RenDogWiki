// =============================================
// File: app/components/manager/IconCell.tsx
// =============================================
'use client';
import ManagedImage from '@/components/common/ManagedImage';


import React from 'react';
import { toProxyUrl } from '@lib/cdn';

type IconCellProps = {
  icon?: string | null;
  size?: number;     // px
  rounded?: number;  // px
  alt?: string;
  className?: string;
};

// 이미지처럼 렌더해야 하는지 판별(원격 http/https 또는 data:image)
const isImageLike = (v?: string | null) =>
  !!v && (/^https?:\/\//i.test(v) || v.startsWith('data:image'));

const isRemoteHttp = (v?: string | null) => !!v && /^https?:\/\//i.test(v);

/**
 * 목록/디테일 셀에 들어가는 작고 단순한 아이콘 셀
 * - 원격 URL(http/https)은 프록시(toProxyUrl)로 감싸서 403/CORS 회피
 * - data:image도 <img> 로 렌더
 * - 그 외(이모지/문자)면 <span>
 * - 아이콘이 없을 때도 셀 크기를 유지해 레이아웃 흔들림 방지
 */
export const IconCell = React.memo(function IconCell({
  icon,
  size = 24,
  rounded = 6,
  alt = 'icon',
  className,
}: IconCellProps) {
  // 아이콘이 없더라도 공간 확보(인라인 요소는 width/height가 적용 안 되므로 inline-block)
  if (!icon) {
    return (
      <span
        className={className}
        style={{ display: 'inline-block', width: size, height: size }}
      />
    );
  }

  if (isImageLike(icon)) {
    const src = isRemoteHttp(icon) ? toProxyUrl(icon) : icon;
    return (
      <ManagedImage
        src={src}
        alt={alt}
        className={className}
        width={size}                 // 레이아웃 안정화(CLS 완화)
        height={size}
        loading="lazy"               // 지연 로딩
        decoding="async"             // 디코딩 힌트
        draggable={false}
        style={{
          width: size,
          height: size,
          borderRadius: rounded,
          objectFit: 'cover',
          display: 'block',          // 이미지 하단 공백 제거
        }}
      />
    );
  }

  // 이모지/문자 아이콘
  return (
    <span
      className={className}
      role="img"
      aria-label={alt}
      style={{ fontSize: size * 0.9, lineHeight: 1, display: 'inline-block' }}
    >
      {icon}
    </span>
  );
});

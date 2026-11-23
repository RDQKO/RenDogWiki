// File: app/components/common/SmartImage.tsx
'use client';

import React, { CSSProperties } from 'react';
import Image, { type ImageProps } from 'next/image';
import { toProxyUrl } from '@lib/cdn';
import { useResolvedImage } from '@/components/image/ImageReplacementProvider';

type Props = Omit<ImageProps, 'src'> & {
  src: string;
  rounded?: number | string;
  unoptimized?: boolean;

  /**
   * 강제로 Next Image 최적화를 유지할지 여부
   * - 기본값 false
   * - true일 때만 원격 이미지도 최적화 유지
   */
  keepOptimization?: boolean;
};

function isRemoteUrl(src: string) {
  return /^https?:\/\//i.test(src);
}

function isLikelyLocalAsset(src: string) {
  return src.startsWith('/') || src.startsWith('./') || src.startsWith('../');
}

export default function SmartImage({
  src,
  rounded,
  style,
  unoptimized,
  sizes,
  width,
  height,
  loading,
  fill,
  quality,
  keepOptimization = false,
  alt,
  ...rest
}: Props) {
  const resolved = useResolvedImage(src) || src;
  const proxied = toProxyUrl(resolved);

  const wNum = typeof width === 'number' ? width : null;
  const hNum = typeof height === 'number' ? height : null;

  const isIcon =
    wNum !== null &&
    hNum !== null &&
    Math.max(wNum, hNum) <= 128;

  const originalIsRemote = /^https?:\/\//i.test(src);
  const proxiedIsRemote = /^https?:\/\//i.test(proxied);
  const isRemoteImage = originalIsRemote || proxiedIsRemote;

  const isLocalAsset =
    (src.startsWith('/') || src.startsWith('./') || src.startsWith('../')) &&
    !originalIsRemote;

  const finalUnoptimized =
    isIcon ||
    !!unoptimized ||
    (isRemoteImage && !keepOptimization);

  const CONTENT_MAX_PX = 960;

  const computedSizesForIcon =
    wNum !== null && hNum !== null
      ? `${Math.max(wNum, hNum)}px`
      : '128px';

  const computedSizesForContent = (() => {
    if (fill) {
      return `(max-width: 768px) 100vw, ${CONTENT_MAX_PX}px`;
    }

    const desktopPx =
      wNum !== null ? Math.min(wNum, CONTENT_MAX_PX) : CONTENT_MAX_PX;

    return `(max-width: 640px) 100vw, (max-width: 1200px) ${desktopPx}px, ${desktopPx}px`;
  })();

  const finalSizes = isIcon
    ? sizes ?? computedSizesForIcon
    : sizes ?? computedSizesForContent;

  const mergedStyle: CSSProperties = {
    ...style,
    ...(rounded !== undefined
      ? {
          borderRadius:
            typeof rounded === 'number' ? `${rounded}px` : rounded,
        }
      : {}),
  };

  const finalQuality = finalUnoptimized ? undefined : quality ?? 75;
  const finalSrc = isLocalAsset ? src : proxied;

  return (
    <Image
      src={finalSrc}
      alt={alt ?? ''}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      fill={fill}
      loading={loading ?? 'lazy'}
      sizes={finalSizes}
      quality={finalQuality}
      unoptimized={finalUnoptimized}
      style={mergedStyle}
      {...rest}
    />
  );
}

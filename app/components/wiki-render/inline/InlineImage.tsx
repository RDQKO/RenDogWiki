
import ManagedImage from '@/components/common/ManagedImage';
import React from 'react';

type InlineImageProps = {
  mode: 'read' | 'edit';
  src?: string | null;
  alt?: string;
  width?: number | string | null;
  height?: number | string | null;
  children?: React.ReactNode;
  attributes?: React.HTMLAttributes<HTMLSpanElement>;
  imageProps?: React.ImgHTMLAttributes<HTMLImageElement>;
  imageStyle?: React.CSSProperties;
};

export default function InlineImage({
  mode,
  src,
  alt = '',
  width,
  height,
  children,
  attributes,
  imageProps,
  imageStyle,
}: InlineImageProps) {
  const safeSrc = String(src ?? '').trim();

  if (!safeSrc) {
    return mode === 'edit' ? <span {...attributes}>{children}</span> : null;
  }

  const defaultImageStyle: React.CSSProperties =
    width || height
      ? {
          width: width ?? 22,
          height: height ?? 22,
          objectFit: 'contain',
          display: 'inline-block',
          verticalAlign: 'middle',
          margin: '0 2px',
          borderRadius: 4,
        }
      : {
          height: '2em',
          width: 'auto',
          display: 'inline',
          verticalAlign: 'middle',
          margin: '0 2px',
          borderRadius: 4,
        };

  return (
    <span
      {...attributes}
      contentEditable={mode === 'edit' ? false : attributes?.contentEditable}
      suppressContentEditableWarning={mode === 'edit' ? true : undefined}
      data-wiki-inline="inline-image"
      data-wiki-mode={mode}
      style={{
        display: 'inline-block',
        verticalAlign: 'middle',
        ...(attributes?.style ?? {}),
      }}
    >
      <ManagedImage
        {...imageProps}
        src={safeSrc}
        alt={alt}
        loading={imageProps?.loading ?? 'lazy'}
        decoding={imageProps?.decoding ?? 'async'}
        fetchPriority={imageProps?.fetchPriority ?? 'low'}
        draggable={imageProps?.draggable ?? false}
        style={{
          ...defaultImageStyle,
          ...(imageProps?.style ?? {}),
          ...imageStyle,
        }}
      />
      {children}
    </span>
  );
}
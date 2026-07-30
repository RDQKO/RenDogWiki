import React from 'react';
import type { WikiRenderMode } from '../types';

type MediaKind = 'image' | 'video';

type RenderImageArgs = {
  src: string;
  alt?: string;
  width?: number;
  height?: number;
  style: React.CSSProperties;
  className?: string;
};

type MediaBlockProps = {
  mode: WikiRenderMode;
  kind: MediaKind;

  src?: string | null;
  alt?: string | null;
  textAlign?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  selected?: boolean;
  focused?: boolean;

  attributes?: React.HTMLAttributes<HTMLDivElement>;
  children?: React.ReactNode;

  editControls?: React.ReactNode;
  readControls?: React.ReactNode;

  renderImage?: (args: RenderImageArgs) => React.ReactNode;
  imageRef?: React.Ref<HTMLImageElement>;
};

function readJustifyFromAlign(
  textAlign?: string | null
): 'flex-start' | 'center' | 'flex-end' {
  if (textAlign === 'center') return 'center';
  if (textAlign === 'right') return 'flex-end';
  return 'flex-start';
}

function editJustifyFromAlign(
  textAlign?: string | null
): 'flex-start' | 'center' | 'flex-end' {
  if (textAlign === 'center') return 'center';
  if (textAlign === 'right') return 'flex-end';
  return 'flex-start';
}

function numberOrUndefined(value?: number | string | null) {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }

  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/px$/i, '');
    const n = Number(cleaned);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  }

  return undefined;
}

export default function MediaBlock({
  mode,
  kind,
  src,
  alt,
  textAlign,
  width,
  height,
  selected,
  focused,
  attributes,
  children,
  editControls,
  readControls,
  renderImage,
  imageRef,
}: MediaBlockProps) {
  const safeSrc = String(src || '');
  const resolvedWidth = numberOrUndefined(width);
  const resolvedHeight = numberOrUndefined(height);
  const controls = mode === 'edit' ? editControls : readControls;

  if (mode === 'read') {
    const justifyContent = readJustifyFromAlign(textAlign);

    const outerStyle: React.CSSProperties = {
      ...(attributes?.style || {}),
      display: 'flex',
      justifyContent,
      width: '100%',
      margin: '10px 0',
    };

    const readMediaStyle: React.CSSProperties = {
      display: 'block',
      maxWidth: '100%',
      width: resolvedWidth ? `${resolvedWidth}px` : 'auto',
      height: resolvedHeight ? `${resolvedHeight}px` : 'auto',
      objectFit: resolvedWidth && resolvedHeight ? 'contain' : undefined,
      borderRadius: 10,
    };

    const mediaNode =
      kind === 'image' ? (
        renderImage ? (
          renderImage({
            src: safeSrc,
            alt: alt || '',
            width: resolvedWidth,
            height: resolvedHeight,
            style: readMediaStyle,
            className: 'wiki-media-image',
          })
        ) : (
          <img
            src={safeSrc}
            alt={alt || ''}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="wiki-media-image"
            style={readMediaStyle}
          />
        )
      ) : (
        <video
          src={safeSrc}
          controls
          playsInline
          preload="metadata"
          className="wiki-media-video"
          style={{
            ...readMediaStyle,
            background: '#000',
          }}
        />
      );

    return (
      <div
        {...attributes}
        className={[
          'wiki-media-block',
          `wiki-media-${kind}`,
          'wiki-media-read',
          attributes?.className || '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={outerStyle}
      >
        {safeSrc ? mediaNode : null}
        {controls}
      </div>
    );
  }

  const justifyContent = editJustifyFromAlign(textAlign);
  const outerStyle: React.CSSProperties = {
    ...(attributes?.style || {}),
    margin: '16px 0',
  };

  const alignWrapperStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'row',
    justifyContent,
    alignItems: 'flex-start',
    minHeight: 40,
    width: '100%',
  };

  const shellStyle: React.CSSProperties = {
    position: 'relative',
    display: 'inline-block',
    maxWidth: '100%',
  };

  // 저장된 width/height는 실제 표시 크기로 적용한다.
  // 크기가 지정되지 않은 새 이미지는 원본 크기로 표시하되 편집 영역을 넘지 않는다.
  const baseEditMediaStyle: React.CSSProperties = {
    width: resolvedWidth ? `${resolvedWidth}px` : 'auto',
    maxWidth: '100%',
    height: resolvedHeight ? `${resolvedHeight}px` : 'auto',
    objectFit: resolvedWidth && resolvedHeight ? 'contain' : undefined,
    borderRadius: 10,
    boxShadow: '0 2px 12px 0 #0001',
    display: 'block',
  };

  const imageStyle: React.CSSProperties = {
    ...baseEditMediaStyle,
    background: '#fff',
    border: selected && focused ? '2px solid #2a90ff' : 'none',
    transition: 'border 0.1s',
  };

  const videoStyle: React.CSSProperties = {
    ...baseEditMediaStyle,
    background: '#000',
    outline: selected && focused ? '2px solid #2a90ff' : 'none',
    transition: 'outline 0.1s',
  };

  const mediaNode =
    kind === 'image' ? (
      renderImage ? (
        renderImage({
          src: safeSrc,
          alt: alt || '',
          width: resolvedWidth,
          height: resolvedHeight,
          style: imageStyle,
          className: 'wiki-media-image',
        })
      ) : (
        <img
          ref={imageRef}
          src={safeSrc}
          alt={alt || ''}
          loading="lazy"
          decoding="async"
          draggable={false}
          className="wiki-media-image"
          style={imageStyle}
          contentEditable={false}
        />
      )
    ) : (
      <video
        src={safeSrc}
        controls
        playsInline
        preload="metadata"
        className="wiki-media-video"
        style={videoStyle}
        contentEditable={false}
      />
    );

  return (
    <div
      {...attributes}
      className={[
        'wiki-media-block',
        `wiki-media-${kind}`,
        'wiki-media-edit',
        attributes?.className || '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={outerStyle}
    >
      <div
        key={textAlign || 'left'}
        contentEditable={false}
        suppressContentEditableWarning
        style={alignWrapperStyle}
      >
        <div style={shellStyle}>
          {safeSrc ? mediaNode : null}
          {controls}
        </div>
      </div>
      {children}
    </div>
  );
}

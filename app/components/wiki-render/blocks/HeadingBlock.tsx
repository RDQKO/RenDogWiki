import React from 'react';

import SmartImage from '@/components/common/SmartImage';
import { cdn, withVersion } from '@lib/cdn';

import '../../../wiki/css/document-components/heading.css';

import type { WikiRenderMode } from '../types';

type HeadingLevel = 1 | 2 | 3;
type HeadingAlign = 'left' | 'center' | 'right';

type HeadingBlockProps = {
  mode: WikiRenderMode;
  level: HeadingLevel;
  textAlign?: string | null;
  icon?: string | null;
  domId?: string;
  dataHeadingId?: string;
  onIconClick?: () => void;
  attributes?: React.HTMLAttributes<HTMLElement>;
  children?: React.ReactNode;
};

function getHeadingTag(level: HeadingLevel): 'h1' | 'h2' | 'h3' {
  if (level === 1) return 'h1';
  if (level === 2) return 'h2';

  return 'h3';
}

function normalizeHeadingAlign(textAlign?: string | null): HeadingAlign {
  if (textAlign === 'center') return 'center';
  if (textAlign === 'right') return 'right';

  return 'left';
}

function looksLikeImageIcon(icon: string) {
  const value = icon.trim();

  if (!value) return false;

  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/api/') ||
    value.startsWith('/uploads/') ||
    value.startsWith('/images/') ||
    value.startsWith('/_next/') ||
    /\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(value)
  );
}

function getImageRequestSize(level: HeadingLevel) {
  if (level === 1) return 64;
  if (level === 2) return 52;

  return 44;
}

function HeadingIcon({
  icon,
  mode,
  level,
  onIconClick,
}: {
  icon: string;
  mode: WikiRenderMode;
  level: HeadingLevel;
  onIconClick?: () => void;
}) {
  const [imageFailed, setImageFailed] = React.useState(false);

  const safeIcon = String(icon ?? '').trim();

  if (!safeIcon) return null;

  const shouldRenderAsImage =
    looksLikeImageIcon(safeIcon) && !imageFailed;

  const canEditIcon = mode === 'edit' && Boolean(onIconClick);
  const imageRequestSize = getImageRequestSize(level);

  const handleMouseDown = (
    event: React.MouseEvent<HTMLSpanElement>,
  ) => {
    if (!canEditIcon || !onIconClick) return;
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();
    onIconClick();
  };

  return (
    <span
      className={[
        'wiki-heading-icon',
        shouldRenderAsImage
          ? 'wiki-heading-icon--image'
          : 'wiki-heading-icon--text',
        canEditIcon
          ? 'wiki-heading-icon--editable'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={canEditIcon ? handleMouseDown : undefined}
      contentEditable={false}
      suppressContentEditableWarning
    >
      {shouldRenderAsImage ? (
        <SmartImage
          src={withVersion(cdn(safeIcon))}
          alt=""
          width={imageRequestSize}
          height={imageRequestSize}
          onError={() => setImageFailed(true)}
          className="wiki-heading-icon-image"
        />
      ) : (
        <span className="wiki-heading-icon-text">
          {safeIcon}
        </span>
      )}
    </span>
  );
}

export default function HeadingBlock({
  mode,
  level,
  textAlign,
  icon,
  domId,
  dataHeadingId,
  onIconClick,
  attributes,
  children,
}: HeadingBlockProps) {
  const Tag = getHeadingTag(level);
  const align = normalizeHeadingAlign(textAlign);

  const {
    className: attributeClassName,
    style: attributeStyle,
    id: attributeId,
    ...restAttributes
  } = attributes ?? {};

  return (
    <Tag
      {...restAttributes}
      id={domId ?? attributeId}
      data-rdwiki-heading="true"
      data-wiki-mode={mode}
      data-heading-id={dataHeadingId}
      data-heading-level={level}
      data-heading-align={align}
      data-heading-has-icon={icon ? 'true' : 'false'}
      suppressHydrationWarning
      className={[
        'wiki-document-heading',
        `wiki-document-heading--level-${level}`,
        attributeClassName || '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={attributeStyle}
    >
      {icon ? (
        <HeadingIcon
          icon={icon}
          mode={mode}
          level={level}
          onIconClick={onIconClick}
        />
      ) : null}

      {children}
    </Tag>
  );
}

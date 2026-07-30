import React from 'react';

import '../../../wiki/css/document-components/link-card.css';

import type { WikiRenderMode } from '../types';

type LinkCardBlockProps = {
  mode: WikiRenderMode;
  href?: string | null;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  metaText?: React.ReactNode;
  icon?: React.ReactNode;
  fallbackIcon?: React.ReactNode;
  size?: 'normal' | 'small' | 'half' | 'full' | string | null;
  inRow?: boolean;
  isWikiLink?: boolean;
  attributes?: React.HTMLAttributes<HTMLDivElement>;
  children?: React.ReactNode;
  editControls?: React.ReactNode;
  readControls?: React.ReactNode;
  clickableInReadMode?: boolean;
};

function isHalfSize(size?: LinkCardBlockProps['size']) {
  return size === 'small' || size === 'half';
}

function DefaultIcon({ isWikiLink }: { isWikiLink?: boolean }) {
  if (isWikiLink) {
    return (
      <svg
        className="wiki-link-card-default-icon-svg"
        viewBox="0 0 24 24"
        aria-hidden
        focusable="false"
      >
        <path
          d="M6.75 3.75h7.1L18 7.9v12.35H6.75V3.75Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <path
          d="M13.5 3.9v4.35h4.35M9.25 12h6.2M9.25 15.25h4.65"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg
      className="wiki-link-card-default-icon-svg"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        d="M14.25 4.75h5v5M19 5l-7.1 7.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.25 13v5.25H5.75V5.75H11"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function LinkCardBlock({
  mode,
  href,
  title,
  subtitle,
  metaText,
  icon,
  fallbackIcon,
  size,
  inRow,
  isWikiLink,
  attributes,
  children,
  editControls,
  readControls,
  clickableInReadMode = true,
}: LinkCardBlockProps) {
  const half = isHalfSize(size);
  const controls = mode === 'edit' ? editControls : readControls;
  const resolvedIcon =
    icon || fallbackIcon || <DefaultIcon isWikiLink={isWikiLink} />;

  const {
    className: attributeClassName,
    style: attributeStyle,
    ...restAttributes
  } = attributes ?? {};

  const content = (
    <div
      {...restAttributes}
      className={[
        'wiki-link-card',
        mode === 'edit' ? 'wiki-link-card-edit' : 'wiki-link-card-read',
        half ? 'wiki-link-card-half' : '',
        inRow ? 'wiki-link-card-in-row' : '',
        isWikiLink ? 'wiki-link-card-wiki' : 'wiki-link-card-external',
        mode === 'read' && href ? 'wiki-link-card-clickable' : '',
        attributeClassName || '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={attributeStyle}
    >
      <div className="wiki-link-card-inner">
        {controls ? (
          <span
            className="wiki-link-card-controls"
            contentEditable={false}
            suppressContentEditableWarning
          >
            {controls}
          </span>
        ) : null}

        <span
          className="wiki-link-card-icon"
          contentEditable={false}
          suppressContentEditableWarning
        >
          {resolvedIcon}
        </span>

        <span className="wiki-link-card-text">
          <span className="wiki-link-card-title">
            {title || children || '링크'}
          </span>

          {subtitle ? (
            <span
              className="wiki-link-card-subtitle"
              contentEditable={false}
              suppressContentEditableWarning
            >
              {subtitle}
            </span>
          ) : null}

          {metaText ? (
            <span
              className="wiki-link-card-meta"
              contentEditable={false}
              suppressContentEditableWarning
            >
              {metaText}
            </span>
          ) : null}
        </span>

        <span
          className="wiki-link-card-arrow"
          aria-hidden
          contentEditable={false}
          suppressContentEditableWarning
        >
          <svg viewBox="0 0 20 20" focusable="false">
            <path
              d="M6.75 10h6.5M10.75 6.5 14.25 10l-3.5 3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );

  if (mode === 'read' && clickableInReadMode && href) {
    return (
      <a href={href} className="wiki-link-card-anchor">
        {content}
      </a>
    );
  }

  return content;
}

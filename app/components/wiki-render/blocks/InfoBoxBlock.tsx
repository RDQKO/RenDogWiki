'use client';

import React from 'react';

import '../../../wiki/css/document-components/info-box.css';

import type { WikiRenderMode } from '../types';

type InfoBoxBlockProps = {
  mode: WikiRenderMode;
  tone?: string | null;
  noIcon?: boolean;
  attributes?: React.HTMLAttributes<HTMLDivElement>;
  children?: React.ReactNode;
  editControls?: React.ReactNode;
  readControls?: React.ReactNode;
};

function normalizeInfoBoxType(
  raw: string | null | undefined,
) {
  const value = String(raw || 'info')
    .toLowerCase()
    .trim();

  if (value === 'note') return 'info';
  if (value === 'warn') return 'warning';
  if (value === 'error') return 'danger';
  if (value === 'success') return 'tip';

  if (
    value === 'white' ||
    value === '하양' ||
    value === '흰색'
  ) {
    return 'white';
  }

  if (
    value === 'yellow' ||
    value === '노랑' ||
    value === '노란'
  ) {
    return 'yellow';
  }

  if (
    value === 'lime' ||
    value === 'green' ||
    value === 'lightgreen' ||
    value === 'mint' ||
    value === '연두'
  ) {
    return 'lime';
  }

  if (
    value === 'pink' ||
    value === 'lightpink' ||
    value === 'rose' ||
    value === '연분홍'
  ) {
    return 'pink';
  }

  if (
    value === 'red' ||
    value === 'crimson' ||
    value === '빨강' ||
    value === '빨간'
  ) {
    return 'red';
  }

  return value || 'info';
}

function getInfoBoxRole(
  type: string,
): 'note' | 'alert' {
  return (
    type === 'danger' ||
    type === 'red'
      ? 'alert'
      : 'note'
  );
}

function infoBoxTypeHasIcon(
  type: string,
) {
  return (
    type === 'info' ||
    type === 'warning' ||
    type === 'danger' ||
    type === 'tip'
  );
}

type InfoBoxIconPreset = {
  accent: string;
  mask: string;
};

function getInfoBoxIconPreset(
  type: string,
): InfoBoxIconPreset | null {
  const presets: Record<
    string,
    InfoBoxIconPreset
  > = {
    info: {
      accent: '#3b82f6',
      mask:
        'https://ka-p.fontawesome.com/releases/v6.6.0/svgs/regular/circle-info.svg?v=2&token=a463935e93',
    },
    warning: {
      accent: '#f59e0b',
      mask:
        'https://ka-p.fontawesome.com/releases/v6.6.0/svgs/regular/circle-exclamation.svg?v=2&token=a463935e93',
    },
    danger: {
      accent: '#ef4444',
      mask:
        'https://ka-p.fontawesome.com/releases/v6.6.0/svgs/regular/triangle-exclamation.svg?v=2&token=a463935e93',
    },
    tip: {
      accent: '#10b981',
      mask:
        'https://ka-p.fontawesome.com/releases/v6.6.0/svgs/regular/circle-exclamation.svg?v=2&token=a463935e93',
    },
  };

  return presets[type] ?? null;
}

export default function InfoBoxBlock({
  mode,
  tone,
  noIcon,
  attributes,
  children,
  editControls,
  readControls,
}: InfoBoxBlockProps) {
  const type = normalizeInfoBoxType(tone);
  const role = getInfoBoxRole(type);

  const iconPreset =
    getInfoBoxIconPreset(type);

  const showIcon =
    !noIcon &&
    infoBoxTypeHasIcon(type) &&
    Boolean(iconPreset);

  const controls =
    mode === 'edit'
      ? editControls
      : readControls;

  const {
    className: attributeClassName,
    style: attributeStyle,
    ...restAttributes
  } = attributes ?? {};

  return (
    <div
      {...restAttributes}
      role={role}
      data-info-box-tone={type}
      data-info-box-mode={mode}
      className={[
        'info-box',
        `info-box--${type}`,
        showIcon
          ? 'info-box--with-icon'
          : 'info-box--without-icon',
        mode === 'edit'
          ? 'info-box--edit'
          : 'info-box--read',
        attributeClassName || '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={attributeStyle}
    >
      {showIcon && iconPreset ? (
        <span
          className="info-box__icon"
          aria-hidden
          contentEditable={false}
          suppressContentEditableWarning
          style={{
            backgroundColor:
              iconPreset.accent,
            WebkitMaskImage:
              `url(${iconPreset.mask})`,
            maskImage:
              `url(${iconPreset.mask})`,
            WebkitMaskRepeat:
              'no-repeat',
            maskRepeat:
              'no-repeat',
            WebkitMaskPosition:
              'center',
            maskPosition:
              'center',
            WebkitMaskSize:
              'contain',
            maskSize:
              'contain',
          }}
        />
      ) : null}

      <div className="info-box__content">
        {children}
      </div>

      {controls ? (
        <div
          className="info-box__controls"
          contentEditable={false}
          suppressContentEditableWarning
        >
          {controls}
        </div>
      ) : null}
    </div>
  );
}
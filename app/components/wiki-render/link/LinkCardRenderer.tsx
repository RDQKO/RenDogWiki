'use client';

import React from 'react';

import SmartImage from '@/components/common/SmartImage';
import LinkCardBlock from '@/components/wiki-render/blocks/LinkCardBlock';

import { cdn, withVersion } from '@lib/cdn';

import {
  decodeTitleForDisplay,
  normalizeToAppHref,
  resolveLinkCardTarget,
} from './linkUtils';

type LinkCardInputSize =
  | 'small'
  | 'large'
  | 'half'
  | 'full'
  | 'normal'
  | null
  | undefined;

type LinkCardRendererProps = {
  mode: 'read' | 'edit';
  url?: string;
  isWiki?: boolean;
  wikiPath?: string | number | null;
  wikiTitle?: string | null;
  sitename?: string | null;

  /**
   * main 기존 Slate 데이터는 small | large를 사용한다.
   * 저장된 데이터는 변경하지 않고 렌더링 경계에서만 해석한다.
   */
  size?: LinkCardInputSize;
  docIcon?: string | null;
  labelText?: string;

  /**
   * 기존 Element/editor adapter 호출부 호환 props
   */
  titleContent?: React.ReactNode;
  subtitle?: React.ReactNode;
  metaText?: React.ReactNode;
  inRow?: boolean;
  attributes?: React.HTMLAttributes<HTMLElement>;
  editControls?: React.ReactNode;
  readControls?: React.ReactNode;
  clickableInReadMode?: boolean;
  compactMobile?: boolean;
  onWikiNavigate?: (href: string) => void;
  onClick?: (event: React.MouseEvent) => void;
  children?: React.ReactNode;
};

function ExternalLinkIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        d="M14 3h7v7h-2V6.41l-9.29 9.3-1.42-1.42 9.3-9.29H14V3zM19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7z"
        fill="currentColor"
      />
    </svg>
  );
}

function WikiDocumentIcon() {
  return (
    <svg
      className="wiki-link-card-default-wiki-icon"
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

function looksLikeImageIcon(icon: string | null | undefined) {
  const value = String(icon ?? '').trim();

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

function isHalfLinkCardSize(size: LinkCardInputSize) {
  return size === 'small' || size === 'half';
}

export default function LinkCardRenderer({
  mode,
  url,
  isWiki,
  wikiTitle,
  sitename,
  size,
  docIcon,
  labelText,
  titleContent,
  subtitle,
  metaText,
  inRow,
  attributes,
  editControls,
  readControls,
  clickableInReadMode = true,
  compactMobile = false,
  onWikiNavigate,
  onClick,
  children,
}: LinkCardRendererProps) {
  const { parsedUrl, isWikiLink } = resolveLinkCardTarget(url, isWiki);

  const normalizedHref = React.useMemo(
    () => normalizeToAppHref(url || '#'),
    [url],
  );

  const [faviconFailed, setFaviconFailed] = React.useState(false);

  /**
   * 문서 아이콘 조회는 이 공통 렌더러에서 처리하지 않는다.
   *
   * - 읽기 화면: LinkCardReadAdapter
   * - 에디터: LinkBlockEditorAdapter
   *
   * 각 adapter가 useResolvedWikiDocIcon을 통해 해석한 아이콘을
   * docIcon prop으로 전달한다.
   */
  const resolvedDocIcon = String(docIcon ?? '').trim() || null;

  React.useEffect(() => {
    setFaviconFailed(false);
  }, [url, isWikiLink]);

  let displaySitename = sitename ?? '';

  if (!isWikiLink && !displaySitename && parsedUrl) {
    displaySitename = parsedUrl.hostname.replace(/^www\./, '');
  }

  const externalFavicon: string | null =
    !isWikiLink && parsedUrl ? `${parsedUrl.origin}/favicon.ico` : null;

  const isHalf = isHalfLinkCardSize(size);
  const isCompactTwoColMobile = compactMobile && isHalf;

  const fallbackTitleText =
    labelText ||
    (isWikiLink
      ? decodeTitleForDisplay(wikiTitle) || sitename || '문서'
      : displaySitename || url || '링크');

  const fallbackSubtitle = isWikiLink
    ? 'RenDog Wiki'
    : displaySitename ||
      (parsedUrl ? parsedUrl.origin.replace(/^https?:\/\//, '') : '');

  const iconNode = isWikiLink ? (
    resolvedDocIcon ? (
      looksLikeImageIcon(resolvedDocIcon) ? (
        <SmartImage
          src={withVersion(cdn(resolvedDocIcon))}
          alt="doc icon"
          width={22}
          height={22}
          className="wiki-link-card-doc-image"
        />
      ) : (
        <span className="wiki-link-card-doc-symbol">
          {resolvedDocIcon}
        </span>
      )
    ) : (
      <WikiDocumentIcon />
    )
  ) : externalFavicon && !faviconFailed ? (
    <img
      src={externalFavicon}
      alt=""
      loading="lazy"
      decoding="async"
      width={20}
      height={20}
      referrerPolicy="no-referrer"
      onError={() => setFaviconFailed(true)}
      className="wiki-link-card-favicon"
    />
  ) : (
    <span className="wiki-link-card-external-icon" aria-hidden>
      <ExternalLinkIcon />
    </span>
  );

  const renderedTitleContent =
    titleContent !== undefined && titleContent !== null
      ? titleContent
      : fallbackTitleText;

  const titleNode = (
    <span
      className={[
        'wiki-link-card-renderer-title',
        isCompactTwoColMobile
          ? 'wiki-link-card-renderer-title-compact'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {renderedTitleContent}
    </span>
  );

  const renderedSubtitle =
    subtitle !== undefined && subtitle !== null
      ? subtitle
      : isCompactTwoColMobile
        ? undefined
        : fallbackSubtitle;

  const handleReadClick = (event: React.MouseEvent) => {
    onClick?.(event);

    if (event.defaultPrevented) return;

    if (!clickableInReadMode) {
      event.preventDefault();
      return;
    }

    if (!isWikiLink) {
      return;
    }

    if (
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    if (event.button !== 0) return;

    /**
     * 읽기 adapter가 전달되지 않은 경우에는
     * 브라우저 기본 anchor 이동을 그대로 사용한다.
     */
    if (!onWikiNavigate) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onWikiNavigate(normalizedHref);
  };

  const card = (
    <LinkCardBlock
      mode={mode}
      href={normalizedHref}
      title={titleNode}
      subtitle={renderedSubtitle}
      metaText={metaText}
      icon={iconNode}
      size="normal"
      inRow={inRow}
      isWikiLink={isWikiLink}
      editControls={editControls}
      readControls={readControls}
      clickableInReadMode={false}
    />
  );

  const {
    className: attributeClassName,
    style: attributeStyle,
    ...restAttributes
  } = attributes ?? {};

  return (
    <div
      {...restAttributes}
      data-wiki-block="link-block"
      data-wiki-mode={mode}
      data-wiki-link-kind={isWikiLink ? 'internal' : 'external'}
      className={[
        'wiki-link-card-renderer',
        isHalf ? 'wiki-link-card-renderer-half' : '',
        inRow ? 'wiki-link-card-renderer-in-row' : '',
        isCompactTwoColMobile
          ? 'wiki-link-card-renderer-compact-mobile'
          : '',
        attributeClassName || '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={attributeStyle}
    >
      {mode === 'read' ? (
        <a
          href={normalizedHref}
          onClick={handleReadClick}
          target={isWikiLink ? undefined : '_blank'}
          rel={
            isWikiLink
              ? undefined
              : 'noopener noreferrer nofollow'
          }
          className="wiki-link-card-renderer-anchor"
          aria-label={
            typeof fallbackTitleText === 'string'
              ? fallbackTitleText
              : '링크'
          }
        >
          {card}
        </a>
      ) : (
        <div
          onClick={onClick}
          className="wiki-link-card-renderer-edit-area"
        >
          {card}
        </div>
      )}

      {mode === 'read' && children ? (
        <span className="wiki-link-card-renderer-hidden-children">
          {children}
        </span>
      ) : null}
    </div>
  );
}

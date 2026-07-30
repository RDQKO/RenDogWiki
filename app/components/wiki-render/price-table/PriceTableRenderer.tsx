import React from 'react';

import SmartImage from '@/components/common/SmartImage';

import { cdn, withVersion } from '@lib/cdn';

import '../../../wiki/css/document-components/price-table.css';

import type {
  PriceTableImageRenderArgs,
  PriceTablePreparedItem,
  PriceTableRendererProps,
} from './types';

import {
  getPriceBadgeColor,
  isProbablyCompressedPrice,
  preparePriceTableItems,
  priceTableNameFontSize,
  priceTablePriceFontSize,
  smartNameBreakInfo,
  tokenizeCompressedForColor,
} from './priceTableViewModel';

function stop(event: React.MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
}

function defaultResolveImageSrc(src: string) {
  const raw = String(src ?? '').trim();

  return raw
    ? withVersion(cdn(raw))
    : '';
}

function PriceName({
  name,
}: {
  name: string;
}) {
  const info =
    smartNameBreakInfo(name);

  if (!info.broke) {
    return <>{name}</>;
  }

  return (
    <span>
      {info.parts[0]}
      <br />
      {info.parts[1]}
    </span>
  );
}

export function ColoredCompressedText({
  value,
}: {
  value:
    | string
    | number
    | null
    | undefined;
}) {
  const raw =
    String(value ?? '');
  const text =
    raw.trim();

  if (!text) {
    return (
      <span className="ptc-price-text" />
    );
  }

  if (text.includes('~')) {
    const [
      left,
      right,
    ] = text.split(
      '~',
      2,
    );

    const leftChunks =
      isProbablyCompressedPrice(left)
        ? tokenizeCompressedForColor(left)
        : [{ text: left }];

    const rightChunks =
      isProbablyCompressedPrice(right)
        ? tokenizeCompressedForColor(right)
        : [{ text: right }];

    return (
      <span className="ptc-price-text">
        <span className="ptc-price-text__group">
          {leftChunks.map(
            (
              chunk,
              index,
            ) => (
              <span
                key={`l-${index}`}
                style={
                  chunk.color
                    ? {
                        color:
                          chunk.color,
                      }
                    : undefined
                }
              >
                {chunk.text}
              </span>
            ),
          )}

          <span className="ptc-price-text__range">
            ~
          </span>
        </span>

        <wbr />

        <span className="ptc-price-text__group">
          {rightChunks.map(
            (
              chunk,
              index,
            ) => (
              <span
                key={`r-${index}`}
                style={
                  chunk.color
                    ? {
                        color:
                          chunk.color,
                      }
                    : undefined
                }
              >
                {chunk.text}
              </span>
            ),
          )}
        </span>
      </span>
    );
  }

  const chunks =
    isProbablyCompressedPrice(text)
      ? tokenizeCompressedForColor(
          text,
        )
      : [{ text }];

  return (
    <span className="ptc-price-text">
      {chunks.map(
        (
          chunk,
          index,
        ) => (
          <span
            key={index}
            style={
              chunk.color
                ? {
                    color:
                      chunk.color,
                  }
                : undefined
            }
          >
            {chunk.text}
          </span>
        ),
      )}
    </span>
  );
}

function defaultRenderImage({
  src,
  alt,
  width,
  height,
  style,
}: PriceTableImageRenderArgs) {
  return (
    <SmartImage
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      style={style}
    />
  );
}

type PriceTableCardProps = {
  mode:
    PriceTableRendererProps['mode'];
  item:
    PriceTablePreparedItem;
  index:
    number;
  stageIndex:
    number;
  hovered:
    boolean;
  onHoverIndexChange?:
    PriceTableRendererProps[
      'onHoverIndexChange'
    ];
  onPrevStage?:
    PriceTableRendererProps[
      'onPrevStage'
    ];
  onNextStage?:
    PriceTableRendererProps[
      'onNextStage'
    ];
  onImageClick?:
    PriceTableRendererProps[
      'onImageClick'
    ];
  onNameClick?:
    PriceTableRendererProps[
      'onNameClick'
    ];
  onCardContextMenu?:
    PriceTableRendererProps[
      'onCardContextMenu'
    ];
  resolveImageSrc:
    NonNullable<
      PriceTableRendererProps[
        'resolveImageSrc'
      ]
    >;
  renderImage:
    NonNullable<
      PriceTableRendererProps[
        'renderImage'
      ]
    >;
  renderItemControls?:
    PriceTableRendererProps[
      'renderItemControls'
    ];
};

function PriceTableCard({
  mode,
  item,
  index,
  stageIndex,
  hovered,
  onHoverIndexChange,
  onPrevStage,
  onNextStage,
  onImageClick,
  onNameClick,
  onCardContextMenu,
  resolveImageSrc,
  renderImage,
  renderItemControls,
}: PriceTableCardProps) {
  const safeStageIndex =
    Math.min(
      Math.max(
        0,
        stageIndex || 0,
      ),
      Math.max(
        0,
        item.stages.length - 1,
      ),
    );

  const stage =
    item.stages[
      safeStageIndex
    ] ?? '';

  const priceValue =
    item.prices[
      safeStageIndex
    ] ?? '';

  const badgeColor =
    getPriceBadgeColor(
      stage,
      item.colorType,
    );

  const name =
    item.displayName ||
    '이름 없음';

  const nameBreakInfo =
    smartNameBreakInfo(name);

  const nameFontSize =
    priceTableNameFontSize(
      name,
      nameBreakInfo,
    );

  const priceFontSize =
    priceTablePriceFontSize(
      priceValue,
    );

  const rawImage =
    String(
      item.image ?? '',
    ).trim();

  const imageSrc =
    rawImage
      ? resolveImageSrc(
          rawImage,
          item,
          index,
        )
      : '';

  const hasMultipleStages =
    item.stages.length > 1;

  const showArrows =
    hovered &&
    hasMultipleStages;

  const canEdit =
    mode === 'edit';

  const stageTextColor =
    stage === '봉인' ||
    stage === '거불'
      ? '#ffffff'
      : '#172019';

  const cardStyle = {
    '--price-table-stage-color':
      badgeColor,
    '--price-table-stage-text':
      stageTextColor,
  } as React.CSSProperties &
    Record<string, string>;

  return (
    <div
      data-wiki-price-table-card
      data-price-table-mode={mode}
      data-price-table-hovered={
        hovered
          ? 'true'
          : 'false'
      }
      data-price-table-has-stages={
        hasMultipleStages
          ? 'true'
          : 'false'
      }
      className={[
        'price-table-card',
        canEdit
          ? 'price-table-card--edit'
          : 'price-table-card--read',
        hovered
          ? 'price-table-card--hovered'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={cardStyle}
      onMouseEnter={() =>
        onHoverIndexChange?.(
          index,
        )
      }
      onMouseLeave={() =>
        onHoverIndexChange?.(
          null,
        )
      }
      onContextMenu={
        onCardContextMenu
          ? (event) =>
              onCardContextMenu(
                item,
                index,
                event,
              )
          : undefined
      }
    >
      {renderItemControls?.(
        item,
        index,
      )}

      {hasMultipleStages ? (
        <div className="price-table-card__stage-wrap">
          <span className="price-table-card__stage">
            {stage}
          </span>
        </div>
      ) : null}

      {showArrows ? (
        <>
          <button
            type="button"
            aria-label="이전 단계"
            className={[
              'price-table-card__stage-button',
              'price-table-card__stage-button--prev',
            ].join(' ')}
            tabIndex={-1}
            onClick={(event) => {
              stop(event);

              onPrevStage?.(
                index,
                item.stages.length,
              );
            }}
            title="이전"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden
              focusable="false"
            >
              <path
                d="m12.25 5.75-4.5 4.25 4.5 4.25"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>

          <button
            type="button"
            aria-label="다음 단계"
            className={[
              'price-table-card__stage-button',
              'price-table-card__stage-button--next',
            ].join(' ')}
            tabIndex={-1}
            onClick={(event) => {
              stop(event);

              onNextStage?.(
                index,
                item.stages.length,
              );
            }}
            title="다음"
          >
            <svg
              viewBox="0 0 20 20"
              aria-hidden
              focusable="false"
            >
              <path
                d="m7.75 5.75 4.5 4.25-4.5 4.25"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </>
      ) : null}

      <div
        className={[
          'price-table-card__image',
          canEdit &&
          onImageClick
            ? 'price-table-card__image--editable'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        title={
          canEdit &&
          onImageClick
            ? '이미지 변경'
            : undefined
        }
        onClick={
          onImageClick
            ? (event) => {
                event.stopPropagation();

                onImageClick(
                  item,
                  index,
                  event,
                );
              }
            : undefined
        }
      >
        {imageSrc ? (
          renderImage({
            item,
            index,
            src: imageSrc,
            alt: name,
            width: 68,
            height: 68,
            style: {
              width: 68,
              height: 68,
              objectFit:
                'contain',
              borderRadius: 8,
              background:
                'transparent',
              display: 'block',
            },
          })
        ) : (
          <span className="price-table-card__image-placeholder">
            <svg
              viewBox="0 0 24 24"
              aria-hidden
              focusable="false"
            >
              <path
                d="M5.5 5.5h13v13h-13v-13Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path
                d="m7.5 16 3.2-3.5 2.1 2 1.8-1.8 2.9 3.3M9 9.2h.01"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        )}
      </div>

      <div
        className={[
          'price-table-card__name',
          !item.name
            ? 'price-table-card__name--empty'
            : '',
          canEdit &&
          onNameClick
            ? 'price-table-card__name--editable'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          fontSize:
            nameFontSize,
        }}
        title={
          canEdit &&
          onNameClick
            ? '아이템 선택'
            : undefined
        }
        onClick={
          onNameClick
            ? (event) => {
                event.stopPropagation();

                onNameClick(
                  item,
                  index,
                  event,
                );
              }
            : undefined
        }
      >
        {item.name ? (
          <PriceName
            name={name}
          />
        ) : (
          <span>
            이름 없음
          </span>
        )}
      </div>

      <div
        className="price-table-card__price"
        style={{
          fontSize:
            priceFontSize,
        }}
      >
        <ColoredCompressedText
          value={priceValue}
        />
      </div>
    </div>
  );
}

export default function PriceTableRenderer({
  mode,
  items,
  attributes,
  className,
  style,
  stageIndexes,
  hoveredIndex,
  onHoverIndexChange,
  onPrevStage,
  onNextStage,
  onImageClick,
  onNameClick,
  onCardContextMenu,
  resolveImageSrc =
    defaultResolveImageSrc,
  renderImage =
    defaultRenderImage,
  renderBlockControls,
  renderItemControls,
  children,
}: PriceTableRendererProps) {
  const preparedItems =
    React.useMemo(
      () =>
        preparePriceTableItems(
          items,
        ),
      [items],
    );

  const {
    className:
      attributeClassName,
    style:
      attributeStyle,
    ...restAttributes
  } = attributes ?? {};

  return (
    <div
      {...restAttributes}
      data-wiki-block="price-table-card"
      data-price-table-mode={mode}
      className={[
        'price-table-renderer',
        `price-table-renderer--${mode}`,
        className || '',
        attributeClassName || '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        ...(attributeStyle || {}),
        ...style,
      }}
    >
      <div
        className="price-table-renderer__shell"
        contentEditable={false}
        suppressContentEditableWarning
      >
        {renderBlockControls?.()}

        <div className="price-table-renderer__grid">
          {preparedItems.map(
            (
              item,
              index,
            ) => (
              <PriceTableCard
                key={
                  item.viewKey
                }
                mode={mode}
                item={item}
                index={index}
                stageIndex={
                  stageIndexes?.[
                    index
                  ] ?? 0
                }
                hovered={
                  hoveredIndex ===
                  index
                }
                onHoverIndexChange={
                  onHoverIndexChange
                }
                onPrevStage={
                  onPrevStage
                }
                onNextStage={
                  onNextStage
                }
                onImageClick={
                  onImageClick
                }
                onNameClick={
                  onNameClick
                }
                onCardContextMenu={
                  onCardContextMenu
                }
                resolveImageSrc={
                  resolveImageSrc
                }
                renderImage={
                  renderImage
                }
                renderItemControls={
                  renderItemControls
                }
              />
            ),
          )}
        </div>
      </div>

      {children}
    </div>
  );
}

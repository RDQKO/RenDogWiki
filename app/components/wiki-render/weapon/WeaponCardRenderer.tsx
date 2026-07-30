import React from 'react';
import { createPortal } from 'react-dom';

import {
  getEnabledWeaponStats,
  getWeaponStatDisplay,
  isMaxLevelLabel,
  isSpiritWeapon,
  isTranscendWeapon,
  normalizeWeaponData,
  normalizeWeaponLevelLabels,
  shortLevelLabel,
} from './weaponViewModel';
import type {
  WeaponCardRendererProps,
  WeaponImageRenderArgs,
  WeaponMetaLike,
  WeaponStatLike,
} from './types';

type WeaponVisualTheme = {
  key: string;
  accent: string;
  spark: string;
  base0: string;
  base1: string;
  base2: string;
};

type WeaponThemeVariables =
  React.CSSProperties &
  Record<
    `--weapon-${string}`,
    string | number
  >;

const WEAPON_VISUAL_THEMES: Record<
  string,
  WeaponVisualTheme
> = {
  epic: {
    key: 'epic',
    accent: '#c084fc',
    spark: '#f5d0fe',
    base0: '#080513',
    base1: '#170b2e',
    base2: '#31105a',
  },
  unique: {
    key: 'unique',
    accent: '#67e8f9',
    spark: '#ecfeff',
    base0: '#03131b',
    base1: '#062a3d',
    base2: '#07506f',
  },
  legendary: {
    key: 'legendary',
    accent: '#fb7185',
    spark: '#ffe4e6',
    base0: '#170407',
    base1: '#3b0a12',
    base2: '#68101d',
  },
  divine: {
    key: 'divine',
    accent: '#bef264',
    spark: '#fef9c3',
    base0: '#031208',
    base1: '#07341a',
    base2: '#0d5728',
  },
  superior: {
    key: 'superior',
    accent: '#fde047',
    spark: '#fff7c2',
    base0: '#171002',
    base1: '#3d2903',
    base2: '#704707',
  },
  class: {
    key: 'class',
    accent: '#a5b4fc',
    spark: '#e0e7ff',
    base0: '#070b20',
    base1: '#111d49',
    base2: '#24377c',
  },
  block: {
    key: 'block',
    accent: '#bef264',
    spark: '#ecfccb',
    base0: '#061105',
    base1: '#123313',
    base2: '#286322',
  },
  hidden: {
    key: 'hidden',
    accent: '#2dd4bf',
    spark: '#99f6e4',
    base0: '#010807',
    base1: '#05221f',
    base2: '#07433d',
  },
  limited: {
    key: 'limited',
    accent: '#fb923c',
    spark: '#ffedd5',
    base0: '#190901',
    base1: '#461704',
    base2: '#812d08',
  },
  ancient: {
    key: 'ancient',
    accent: '#d6d3d1',
    spark: '#f5f5f4',
    base0: '#0e0c09',
    base1: '#28221a',
    base2: '#4b4133',
  },
  boss: {
    key: 'boss',
    accent: '#e879f9',
    spark: '#f5d0fe',
    base0: '#0d0215',
    base1: '#2a0640',
    base2: '#550d6b',
  },
  miniBoss: {
    key: 'mini-boss',
    accent: '#f87171',
    spark: '#fee2e2',
    base0: '#180303',
    base1: '#430707',
    base2: '#781010',
  },
  'mini-boss': {
    key: 'mini-boss',
    accent: '#f87171',
    spark: '#fee2e2',
    base0: '#180303',
    base1: '#430707',
    base2: '#781010',
  },
  monster: {
    key: 'monster',
    accent: '#4ade80',
    spark: '#d9f99d',
    base0: '#020e06',
    base1: '#082c13',
    base2: '#0d5522',
  },
  rune: {
    key: 'rune',
    accent: '#818cf8',
    spark: '#ddd6fe',
    base0: '#070217',
    base1: '#170737',
    base2: '#311068',
  },
  'fishing-rod': {
    key: 'fishing',
    accent: '#22d3ee',
    spark: '#bae6fd',
    base0: '#020d18',
    base1: '#042a43',
    base2: '#075b80',
  },
  armor: {
    key: 'armor',
    accent: '#94a3b8',
    spark: '#e2e8f0',
    base0: '#070b10',
    base1: '#17222f',
    base2: '#34465a',
  },
  weapon: {
    key: 'weapon',
    accent: '#fb923c',
    spark: '#fecaca',
    base0: '#0e0b0a',
    base1: '#291613',
    base2: '#4e251d',
  },
  spirit: {
    key: 'spirit',
    accent: '#2dd4bf',
    spark: '#ccfbf1',
    base0: '#010807',
    base1: '#032321',
    base2: '#07504a',
  },
  'transcend-epic': {
    key: 'transcend-epic',
    accent: '#e9d5ff',
    spark: '#ffffff',
    base0: '#090514',
    base1: '#21103c',
    base2: '#4c1d72',
  },
  'transcend-unique': {
    key: 'transcend-unique',
    accent: '#cffafe',
    spark: '#ffffff',
    base0: '#02131b',
    base1: '#073249',
    base2: '#096786',
  },
  'transcend-legend': {
    key: 'transcend-legendary',
    accent: '#ffe4e6',
    spark: '#ffffff',
    base0: '#160406',
    base1: '#420d14',
    base2: '#7b1422',
  },
  'transcend-divine': {
    key: 'transcend-divine',
    accent: '#ecfccb',
    spark: '#ffffff',
    base0: '#031108',
    base1: '#09351b',
    base2: '#12622d',
  },
  'transcend-superior': {
    key: 'transcend-superior',
    accent: '#fef9c3',
    spark: '#ffffff',
    base0: '#171002',
    base1: '#432d04',
    base2: '#7b4e08',
  },
};

function resolveWeaponVisualTheme(
  weaponType: string,
): WeaponVisualTheme {
  return (
    WEAPON_VISUAL_THEMES[
      weaponType
    ] ??
    WEAPON_VISUAL_THEMES.weapon
  );
}

function createWeaponThemeVariables({
  weaponType,
  meta,
  cardWidth,
}: {
  weaponType: string;
  meta: WeaponMetaLike;
  cardWidth: number;
}): WeaponThemeVariables {
  const theme =
    resolveWeaponVisualTheme(
      weaponType,
    );

  return {
    '--weapon-card-width':
      `${cardWidth}px`,
    '--weapon-primary':
      meta.headerBg ||
      theme.accent,
    '--weapon-secondary':
      meta.border ||
      theme.accent,
    '--weapon-deep':
      meta.badgeBg ||
      theme.base1,
    '--weapon-accent':
      theme.accent,
    '--weapon-spark':
      theme.spark,
    '--weapon-base-0':
      theme.base0,
    '--weapon-base-1':
      theme.base1,
    '--weapon-base-2':
      theme.base2,
  };
}

function defaultRenderImage({
  src,
  alt,
  width,
  height,
  style,
}: WeaponImageRenderArgs) {
  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      draggable={false}
      style={style}
    />
  );
}

type WeaponLevelSelectorProps = {
  levelLabels: string[];
  selectedIndex: number | null;
  onChange?: (idx: number) => void;
  compact?: boolean;
  overlay?: boolean;
  spiritLayout?: boolean;
};

function WeaponLevelSelector({
  levelLabels,
  selectedIndex,
  onChange,
  compact = false,
  overlay = false,
  spiritLayout = false,
}: WeaponLevelSelectorProps) {
  const [
    open,
    setOpen,
  ] = React.useState(false);

  if (levelLabels.length <= 1) {
    return null;
  }

  const displayLevelLabels =
    normalizeWeaponLevelLabels(
      levelLabels,
      spiritLayout,
    );

  const selectedLabel =
    selectedIndex != null
      ? displayLevelLabels[
          selectedIndex
        ]
      : null;

  const selectedShort =
    selectedLabel
      ? shortLevelLabel(
          selectedLabel,
        )
      : '-';

  const selectedIsMax =
    isMaxLevelLabel(
      selectedLabel,
      selectedShort,
    );

  const selectLevel = (
    index: number,
  ) => {
    onChange?.(index);
    setOpen(false);
  };

  const renderLevelButton = (
    fullLabel: string,
    index: number,
  ) => {
    const short =
      shortLevelLabel(
        fullLabel,
      );

    const active =
      selectedIndex === index;

    const max =
      isMaxLevelLabel(
        fullLabel,
        short,
      );

    return (
      <button
        key={`${fullLabel}-${index}`}
        type="button"
        className={[
          'weapon-level-selector__option',
          active
            ? 'weapon-level-selector__option--active'
            : '',
          max
            ? 'weapon-level-selector__option--max'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-pressed={active}
        title={fullLabel}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          selectLevel(index);
        }}
      >
        {short}
      </button>
    );
  };

  return (
    <div
      data-wiki-part="weapon-level-selector"
      data-weapon-level-overlay={
        overlay
          ? 'true'
          : 'false'
      }
      data-weapon-level-compact={
        compact
          ? 'true'
          : 'false'
      }
      className={[
        'weapon-level-selector',
        overlay
          ? 'weapon-level-selector--overlay'
          : '',
        compact
          ? 'weapon-level-selector--compact'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      contentEditable={false}
      suppressContentEditableWarning
    >
      <button
        type="button"
        className={[
          'weapon-level-selector__trigger',
          selectedIsMax
            ? 'weapon-level-selector__trigger--max'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        aria-expanded={open}
        title="강화 단계 선택"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();

          setOpen(
            (previous) =>
              !previous,
          );
        }}
      >
        <span className="weapon-level-selector__current">
          {selectedShort}
        </span>

        <span
          className="weapon-level-selector__chevron"
          aria-hidden
        >
          {open ? '▲' : '▼'}
        </span>
      </button>

      {open ? (
        <div
          className={[
            'weapon-level-selector__menu',
            spiritLayout
              ? 'weapon-level-selector__menu--spirit'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {spiritLayout ? (
            <>
              <div className="weapon-level-selector__column">
                {displayLevelLabels
                  .slice(0, 9)
                  .map(
                    renderLevelButton,
                  )}
              </div>

              <div className="weapon-level-selector__column">
                {displayLevelLabels
                  .slice(9)
                  .map(
                    (
                      fullLabel,
                      localIndex,
                    ) =>
                      renderLevelButton(
                        fullLabel,
                        localIndex + 9,
                      ),
                  )}
              </div>
            </>
          ) : (
            <div className="weapon-level-selector__column">
              {displayLevelLabels.map(
                renderLevelButton,
              )}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

type WeaponStatTooltipPosition = {
  left: number;
  top: number;
  arrowLeft: number;
  placement: 'top' | 'bottom';
};

type WeaponStatTooltipStyle =
  React.CSSProperties & {
    '--weapon-tooltip-arrow-left': string;
    '--weapon-tooltip-accent': string;
  };

function WeaponStatValue({
  label,
  value,
  unit,
  tooltipAccent,
}: {
  label: string;
  value: string;
  unit: string;
  tooltipAccent: string;
}) {
  const triggerRef =
    React.useRef<HTMLSpanElement | null>(
      null,
    );

  const tooltipRef =
    React.useRef<HTMLDivElement | null>(
      null,
    );

  const [
    portalReady,
    setPortalReady,
  ] = React.useState(false);

  const [
    isOverflowing,
    setIsOverflowing,
  ] = React.useState(false);

  const [
    open,
    setOpen,
  ] = React.useState(false);

  const [
    measured,
    setMeasured,
  ] = React.useState(false);

  const [
    position,
    setPosition,
  ] =
    React.useState<WeaponStatTooltipPosition>({
      left: 0,
      top: 0,
      arrowLeft: 24,
      placement: 'top',
    });

  const fullValue = [
    value || '-',
    unit,
  ]
    .filter(Boolean)
    .join(' ');

  const measureOverflow =
    React.useCallback(() => {
      const element =
        triggerRef.current;

      if (!element) return;

      const overflowed =
        element.scrollWidth >
        element.clientWidth + 1;

      setIsOverflowing(
        overflowed,
      );

      if (!overflowed) {
        setOpen(false);
      }
    }, []);

  React.useEffect(() => {
    setPortalReady(true);
  }, []);

  React.useLayoutEffect(() => {
    measureOverflow();

    const element =
      triggerRef.current;

    if (!element) return;

    const observer =
      typeof ResizeObserver !==
      'undefined'
        ? new ResizeObserver(
            measureOverflow,
          )
        : null;

    observer?.observe(element);

    window.addEventListener(
      'resize',
      measureOverflow,
    );

    void document.fonts?.ready
      ?.then(measureOverflow)
      .catch(() => undefined);

    return () => {
      observer?.disconnect();

      window.removeEventListener(
        'resize',
        measureOverflow,
      );
    };
  }, [
    fullValue,
    measureOverflow,
  ]);

  const updateTooltipPosition =
    React.useCallback(() => {
      if (
        typeof window ===
        'undefined'
      ) {
        return;
      }

      if (
        !triggerRef.current ||
        !tooltipRef.current
      ) {
        return;
      }

      const triggerRect =
        triggerRef.current
          .getBoundingClientRect();

      const tooltipRect =
        tooltipRef.current
          .getBoundingClientRect();

      const sidePadding = 12;
      const gap = 10;

      let left =
        triggerRect.right -
        tooltipRect.width;

      left = Math.max(
        sidePadding,
        Math.min(
          left,
          window.innerWidth -
            sidePadding -
            tooltipRect.width,
        ),
      );

      let placement:
        | 'top'
        | 'bottom' =
        'top';

      let top =
        triggerRect.top -
        gap -
        tooltipRect.height;

      if (top < sidePadding) {
        placement = 'bottom';
        top =
          triggerRect.bottom +
          gap;
      }

      const triggerCenter =
        triggerRect.left +
        triggerRect.width / 2;

      const arrowLeft =
        Math.max(
          18,
          Math.min(
            triggerCenter - left,
            tooltipRect.width - 18,
          ),
        );

      setPosition({
        left,
        top,
        arrowLeft,
        placement,
      });

      setMeasured(true);
    }, []);

  React.useLayoutEffect(() => {
    if (
      !portalReady ||
      !open ||
      !isOverflowing
    ) {
      return;
    }

    let animationFrame = 0;

    const schedule = () => {
      cancelAnimationFrame(
        animationFrame,
      );

      animationFrame =
        requestAnimationFrame(
          updateTooltipPosition,
        );
    };

    schedule();

    window.addEventListener(
      'resize',
      schedule,
    );

    window.addEventListener(
      'scroll',
      schedule,
      true,
    );

    return () => {
      cancelAnimationFrame(
        animationFrame,
      );

      window.removeEventListener(
        'resize',
        schedule,
      );

      window.removeEventListener(
        'scroll',
        schedule,
        true,
      );
    };
  }, [
    portalReady,
    open,
    isOverflowing,
    updateTooltipPosition,
  ]);

  const tooltipStyle:
    WeaponStatTooltipStyle = {
      left: position.left,
      top: position.top,
      '--weapon-tooltip-arrow-left':
        `${position.arrowLeft}px`,
      '--weapon-tooltip-accent':
        tooltipAccent,
    };

  const tooltip =
    portalReady &&
    open &&
    isOverflowing
      ? createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            aria-hidden={
              !measured
            }
            data-visible={
              measured
                ? 'true'
                : 'false'
            }
            data-placement={
              position.placement
            }
            className="weapon-stat-tooltip"
            style={tooltipStyle}
          >
            <span className="weapon-stat-tooltip__label">
              {label}
            </span>

            <strong className="weapon-stat-tooltip__value">
              {fullValue}
            </strong>

            <span
              className="weapon-stat-tooltip__arrow"
              aria-hidden
            />
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <span className="weapon-card__stat-value-wrap">
        <span
          ref={triggerRef}
          data-truncated={
            isOverflowing
              ? 'true'
              : 'false'
          }
          className="weapon-card__stat-value"
          onMouseEnter={() => {
            if (!isOverflowing) {
              return;
            }

            setMeasured(false);
            setOpen(true);
          }}
          onMouseLeave={() => {
            setOpen(false);
          }}
        >
          {fullValue}
        </span>
      </span>

      {tooltip}
    </>
  );
}

function WeaponStatRow({
  stat,
  selectedLevelIndex,
  tooltipAccent,
  onClick,
}: {
  stat: WeaponStatLike;
  selectedLevelIndex:
    number | null;
  tooltipAccent: string;
  onClick?: (
    stat: WeaponStatLike,
    event: React.MouseEvent,
  ) => void;
}) {
  const {
    value,
    unit,
  } = getWeaponStatDisplay(
    stat,
    selectedLevelIndex,
  );

  const label =
    String(
      stat.label ??
      '정보',
    ).trim() ||
    '정보';

  return (
    <button
      data-wiki-part="weapon-stat-row"
      type="button"
      className={[
        'weapon-card__stat-row',
        onClick
          ? 'weapon-card__stat-row--editable'
          : '',
      ]
        .filter(Boolean)
        .join(' ')}
      title={
        onClick
          ? '클릭해서 강화별 상세 정보 보기/편집'
          : undefined
      }
      onClick={
        onClick
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();

              onClick(
                stat,
                event,
              );
            }
          : undefined
      }
    >
      <span className="weapon-card__stat-label">
        {label}
      </span>

      <WeaponStatValue
        label={label}
        value={value || '-'}
        unit={unit}
        tooltipAccent={
          tooltipAccent
        }
      />
    </button>
  );
}

export default function WeaponCardRenderer({
  mode,
  weapon,
  meta,
  stats,
  imageSrc,
  videoSrc,
  supportsVideo = true,
  isDarkMode = false,
  isMobile = false,
  selectedLevelIndex = null,
  levelLabels = [],
  onLevelChange,
  onTypeClick,
  onNameClick,
  onImageClick,
  onStatClick,
  onVideoClick,
  onVideoSettingClick,
  onStatSettingClick,
  onContextMenu,
  renderImage =
    defaultRenderImage,
  renderExtraControls,
  children,
}: WeaponCardRendererProps) {
  const normalized =
    normalizeWeaponData(
      weapon,
    );

  const weaponType =
    normalized.weaponType;

  const visualTheme =
    resolveWeaponVisualTheme(
      weaponType,
    );

  const isSpirit =
    isSpiritWeapon(
      weaponType,
    );

  const isTranscend =
    isTranscendWeapon(
      weaponType,
      meta,
    );

  const enabledStats =
    getEnabledWeaponStats(
      stats,
    );

  const cardWidth =
    isMobile
      ? 220
      : 260;

  const label =
    meta.label ||
    weaponType ||
    'WEAPON';

  const name =
    normalized.name ||
    '새 무기 이름';

  const safeImageSrc =
    String(
      imageSrc ??
      normalized.imageUrl ??
      '',
    ).trim();

  const safeVideoSrc =
    String(
      videoSrc ??
      normalized.videoUrl ??
      '',
    ).trim();

  const canEdit =
    mode === 'edit';

  const themeVariables =
    createWeaponThemeVariables({
      weaponType,
      meta,
      cardWidth,
    });

  return (
    <>
      <div
        data-wiki-card-wrap={
          mode === 'read'
            ? 'weapon-read'
            : 'weapon-edit'
        }
        data-weapon-type={
          weaponType
        }
        data-weapon-theme={
          visualTheme.key
        }
        data-weapon-spirit={
          isSpirit
            ? 'true'
            : 'false'
        }
        data-weapon-transcend={
          isTranscend
            ? 'true'
            : 'false'
        }
        data-weapon-mobile={
          isMobile
            ? 'true'
            : 'false'
        }
        data-weapon-dark={
          isDarkMode
            ? 'true'
            : 'false'
        }
        className={[
          'weapon-card-wrap',
          `weapon-card-wrap--${mode}`,
          isSpirit
            ? 'weapon-card-wrap--spirit'
            : '',
          isTranscend
            ? 'weapon-card-wrap--transcend'
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
        contentEditable={false}
        suppressContentEditableWarning
        onContextMenu={
          onContextMenu
        }
        style={
          themeVariables
        }
      >
        <div className="weapon-card-frame">
          <div
            data-wiki-card={
              mode === 'read'
                ? 'weapon-read'
                : 'weapon-edit'
            }
            className={[
              'weapon-card',
              `weapon-card--${mode}`,
            ].join(' ')}
          >
            <span
              className="weapon-card__cosmic-field"
              aria-hidden
            />

            <div className="weapon-card__content">
              {renderExtraControls?.()}

              <button
                data-wiki-part="weapon-type-bar"
                type="button"
                className={[
                  'weapon-card__type-bar',
                  onTypeClick
                    ? 'weapon-card__type-bar--editable'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={
                  onTypeClick
                    ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        onTypeClick(
                          event,
                        );
                      }
                    : undefined
                }
              >
                <span>
                  {label}
                </span>
              </button>

              <div
                data-wiki-part="weapon-name"
                className={[
                  'weapon-card__name',
                  onNameClick
                    ? 'weapon-card__name--editable'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={
                  onNameClick
                    ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        onNameClick(
                          event,
                        );
                      }
                    : undefined
                }
              >
                {name}
              </div>

              {levelLabels.length >
                1 &&
              isMobile ? (
                <WeaponLevelSelector
                  levelLabels={
                    levelLabels
                  }
                  selectedIndex={
                    selectedLevelIndex
                  }
                  onChange={
                    onLevelChange
                  }
                  compact
                  overlay
                  spiritLayout={
                    isSpirit
                  }
                />
              ) : null}

              <div
                data-wiki-part="weapon-image"
                className={[
                  'weapon-card__image',
                  onImageClick
                    ? 'weapon-card__image--editable'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={
                  onImageClick
                    ? (event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        onImageClick(
                          event,
                        );
                      }
                    : undefined
                }
              >
                <span
                  className="weapon-card__image-aura"
                  aria-hidden
                />

                {safeImageSrc ? (
                  renderImage({
                    src:
                      safeImageSrc,
                    alt: name,
                    width: 160,
                    height: 96,
                    style: {
                      maxWidth: '80%',
                      maxHeight: '80%',
                      objectFit:
                        'contain',
                      display:
                        'block',
                    },
                  })
                ) : (
                  <span className="weapon-card__image-empty">
                    이미지 없음
                  </span>
                )}
              </div>

              <div
                data-wiki-part="weapon-stats"
                className="weapon-card__stats"
              >
                {enabledStats.length ===
                0 ? (
                  <div className="weapon-card__stats-empty">
                    표시할 정보가
                    없습니다.
                    {canEdit
                      ? ' 정보 설정 버튼으로 추가하세요.'
                      : ''}
                  </div>
                ) : null}

                {enabledStats.map(
                  (stat) => (
                    <WeaponStatRow
                      key={
                        stat.key ||
                        stat.label
                      }
                      stat={stat}
                      selectedLevelIndex={
                        selectedLevelIndex
                      }
                      tooltipAccent={
                        meta.headerBg ||
                        visualTheme.accent
                      }
                      onClick={
                        onStatClick
                      }
                    />
                  ),
                )}
              </div>

              {supportsVideo ? (
                <div
                  data-wiki-part="weapon-video-actions"
                  className="weapon-card__video-actions"
                >
                  <button
                    data-wiki-part="weapon-video-button"
                    type="button"
                    className="weapon-card__video-button"
                    disabled={
                      !safeVideoSrc
                    }
                    onClick={
                      safeVideoSrc &&
                      onVideoClick
                        ? (event) => {
                            event.preventDefault();
                            event.stopPropagation();

                            onVideoClick(
                              event,
                            );
                          }
                        : undefined
                    }
                  >
                    스킬 사용 영상
                  </button>

                  {canEdit &&
                  onVideoSettingClick ? (
                    <button
                      type="button"
                      className="weapon-card__secondary-button"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();

                        onVideoSettingClick(
                          event,
                        );
                      }}
                    >
                      영상 설정
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {levelLabels.length >
          1 &&
        !isMobile ? (
          <WeaponLevelSelector
            levelLabels={
              levelLabels
            }
            selectedIndex={
              selectedLevelIndex
            }
            onChange={
              onLevelChange
            }
            spiritLayout={
              isSpirit
            }
          />
        ) : null}

        {canEdit &&
        onStatSettingClick ? (
          <button
            type="button"
            className="weapon-card__settings-button"
            title="표시할 정보 선택"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();

              onStatSettingClick(
                event,
              );
            }}
          >
            정보 설정
          </button>
        ) : null}
      </div>

      {children}
    </>
  );
}

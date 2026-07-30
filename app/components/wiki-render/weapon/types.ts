import type React from 'react';

export type WeaponRenderMode = 'read' | 'edit';

export type WeaponMetaLike = {
  label?: string;
  border?: string;
  headerBg?: string;
  badgeBg?: string;
};

export type WeaponStatLevelLike =
  | string
  | number
  | null
  | undefined
  | {
      label?: string;
      name?: string;
      value?: string | number | null;
      summary?: string | number | null;
      unit?: string | null;
      [key: string]: any;
    };

export type WeaponStatLike = {
  key?: string;
  label?: string;
  summary?: string | number | null;
  unit?: string | null;
  enabled?: boolean;
  value?: string | number | null;
  values?: Array<
    string | number | null | undefined
  >;

  // 중요: 실제 WeaponStatDetail[]도 받을 수 있어야 함
  levels?: WeaponStatLevelLike[];
  levelLabels?: string[];
  [key: string]: any;
};

export type WeaponCardData = {
  weaponType?: string | null;
  name?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  stats?: WeaponStatLike[] | null;
  [key: string]: any;
};

export type WeaponImageRenderArgs = {
  src: string;
  alt: string;
  width: number;
  height: number;
  style: React.CSSProperties;
};

export type WeaponCardRendererProps = {
  mode: WeaponRenderMode;
  weapon: WeaponCardData;
  meta: WeaponMetaLike;
  stats: WeaponStatLike[];
  imageSrc?: string;
  videoSrc?: string;
  supportsVideo?: boolean;
  isDarkMode?: boolean;
  isMobile?: boolean;
  selectedLevelIndex?: number | null;
  levelLabels?: string[];
  onLevelChange?: (index: number) => void;
  onTypeClick?: (
    event: React.MouseEvent,
  ) => void;
  onNameClick?: (
    event: React.MouseEvent,
  ) => void;
  onImageClick?: (
    event: React.MouseEvent,
  ) => void;
  onStatClick?: (
    stat: WeaponStatLike,
    event: React.MouseEvent,
  ) => void;
  onVideoClick?: (
    event: React.MouseEvent,
  ) => void;
  onVideoSettingClick?: (
    event: React.MouseEvent,
  ) => void;
  onStatSettingClick?: (
    event: React.MouseEvent,
  ) => void;
  onContextMenu?: (
    event: React.MouseEvent,
  ) => void;
  renderImage?: (
    args: WeaponImageRenderArgs,
  ) => React.ReactNode;
  renderExtraControls?: () => React.ReactNode;
  children?: React.ReactNode;
};

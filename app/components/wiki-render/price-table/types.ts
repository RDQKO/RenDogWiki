import type React from 'react';

export type PriceTableRenderMode = 'read' | 'edit';

export type PriceTablePriceValue = string | number;

export type PriceFormat =
  | 'block'
  | 'cash'
  | 'limited'
  | 'box'
  | 'armor'
  | 'boss'
  | 'monster'
  | 'title'
  | 'costume'
  | 'fishing'
  | 'scroll'
  | 'rune'
  | 'epic'
  | 'unique'
  | 'legendary'
  | 'divine'
  | 'superior'
  | 'transcend epic'
  | 'transcend unique'
  | 'transcend legendary'
  | 'transcend divine'
  | 'transcend superior';

export type PriceTableRawItem = {
  id?: number | string | null;
  name?: string | null;
  name_key?: string | null;
  nameKey?: string | null;

  image?: string | null;
  mode?: string | null;
  colorType?: string | null;

  stages?: string[] | null;
  prices?: Array<PriceTablePriceValue | null | undefined> | null;

  latestPrices?: Array<PriceTablePriceValue | null | undefined> | null;
  pricesLatest?: Array<PriceTablePriceValue | null | undefined> | null;
  prices_latest?: Array<PriceTablePriceValue | null | undefined> | null;
  dbPrices?: Array<PriceTablePriceValue | null | undefined> | null;
  db_prices?: Array<PriceTablePriceValue | null | undefined> | null;

  priceByStage?: Record<string, PriceTablePriceValue | null | undefined> | null;
  pricesByStage?: Record<string, PriceTablePriceValue | null | undefined> | null;
  prices_by_stage?: Record<string, PriceTablePriceValue | null | undefined> | null;
  price_map?: Record<string, PriceTablePriceValue | null | undefined> | null;

  price?: PriceTablePriceValue | null;
  value?: PriceTablePriceValue | null;
  latestPrice?: PriceTablePriceValue | null;
  priceLatest?: PriceTablePriceValue | null;

  [key: string]: any;
};

export type PriceTablePreparedItem = PriceTableRawItem & {
  viewKey: string;
  displayName: string;
  nameKey: string;
  stages: string[];
  prices: PriceTablePriceValue[];
};

export type PriceTableImageRenderArgs = {
  item: PriceTablePreparedItem;
  index: number;
  src: string;
  alt: string;
  width: number;
  height: number;
  style: React.CSSProperties;
};

export type PriceTableRendererProps = {
  mode: PriceTableRenderMode;
  items: PriceTableRawItem[];

  attributes?: React.HTMLAttributes<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;

  stageIndexes?: number[];
  hoveredIndex?: number | null;

  onHoverIndexChange?: (index: number | null) => void;
  onPrevStage?: (index: number, stageLength: number) => void;
  onNextStage?: (index: number, stageLength: number) => void;

  onImageClick?: (item: PriceTablePreparedItem, index: number, event: React.MouseEvent) => void;
  onNameClick?: (item: PriceTablePreparedItem, index: number, event: React.MouseEvent) => void;
  onCardContextMenu?: (item: PriceTablePreparedItem, index: number, event: React.MouseEvent) => void;

  resolveImageSrc?: (src: string, item: PriceTablePreparedItem, index: number) => string;
  renderImage?: (args: PriceTableImageRenderArgs) => React.ReactNode;

  renderBlockControls?: () => React.ReactNode;
  renderItemControls?: (item: PriceTablePreparedItem, index: number) => React.ReactNode;

  children?: React.ReactNode;
};

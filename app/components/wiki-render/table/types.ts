import React from 'react';

export type WikiTableMode = 'read' | 'edit';

export type WikiTableRendererProps = {
  mode: WikiTableMode;
  attributes?: React.HTMLAttributes<HTMLDivElement>;
  children?: React.ReactNode;

  containerRef?: React.Ref<HTMLDivElement>;
  className?: string;
  style?: React.CSSProperties;

  /**
   * 새 구조:
   * children으로 row를 받으면 내부에서 table을 만든다.
   *
   * 호환 구조:
   * 기존 TableBlock처럼 완성된 table을 넘기면 그대로 출력한다.
   */
  table?: React.ReactNode;

  tableClassName?: string;
  tableStyle?: React.CSSProperties;

  overlay?: React.ReactNode;

  afterContent?: React.ReactNode;

  scrollable?: boolean;
  compact?: boolean;
  tableInnerStyle?: React.CSSProperties;

  onMouseMoveCapture?: React.MouseEventHandler<HTMLDivElement>;
  onMouseDownCapture?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUpCapture?: React.MouseEventHandler<HTMLDivElement>;
};

export type WikiTableRowRendererProps = {
  attributes?: React.HTMLAttributes<HTMLTableRowElement>;
  children?: React.ReactNode;
};

export type WikiTableCellRendererProps = {
  mode: WikiTableMode;
  attributes?: React.TdHTMLAttributes<HTMLTableCellElement>;
  children?: React.ReactNode;

  colSpan?: number;
  rowSpan?: number;

  className?: string;
  style?: React.CSSProperties;

  dataAttributes?: Record<string, string | number | undefined>;

  onMouseDown?: React.MouseEventHandler<HTMLTableCellElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLTableCellElement>;
  onContextMenu?: React.MouseEventHandler<HTMLTableCellElement>;
};

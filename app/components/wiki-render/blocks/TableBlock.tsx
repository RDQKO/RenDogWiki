import React from 'react';

import type { WikiRenderMode } from '../types';
import { WikiTableRenderer } from '../table/TableRenderer';

type TableBlockProps = {
  mode: WikiRenderMode;
  attributes?: React.HTMLAttributes<HTMLDivElement>;
  children?: React.ReactNode;

  containerRef?: React.Ref<HTMLDivElement>;
  containerStyle?: React.CSSProperties;

  onMouseMoveCapture?: React.MouseEventHandler<HTMLDivElement>;
  onMouseDownCapture?: React.MouseEventHandler<HTMLDivElement>;
  onMouseUpCapture?: React.MouseEventHandler<HTMLDivElement>;

  table: React.ReactNode;
  overlay?: React.ReactNode;

  scrollable?: boolean;
  compact?: boolean;
  tableInnerStyle?: React.CSSProperties;
};

function normalizeMode(mode: WikiRenderMode): 'read' | 'edit' {
  return mode === 'edit' ? 'edit' : 'read';
}

export default function TableBlock({
  mode,
  attributes,
  children,
  containerRef,
  containerStyle,
  onMouseMoveCapture,
  onMouseDownCapture,
  onMouseUpCapture,
  table,
  overlay,
  scrollable = false,
  compact = false,
  tableInnerStyle,
}: TableBlockProps) {
  const normalizedMode = normalizeMode(mode);

  return (
    <WikiTableRenderer
      mode={normalizedMode}
      attributes={attributes}
      containerRef={containerRef}
      style={containerStyle}
      table={table}
      overlay={overlay}
      scrollable={scrollable}
      compact={compact}
      tableInnerStyle={tableInnerStyle}
      onMouseMoveCapture={onMouseMoveCapture}
      onMouseDownCapture={onMouseDownCapture}
      onMouseUpCapture={onMouseUpCapture}
      afterContent={normalizedMode === 'edit' ? children : null}
    />
  );
}

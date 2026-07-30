import React from 'react';

import '../../../wiki/css/document-components/table.css';
import { tableElementBaseStyle } from './tableLayout';
import type {
  WikiTableCellRendererProps,
  WikiTableRendererProps,
  WikiTableRowRendererProps,
} from './types';

function mergeClassName(
  ...names: Array<string | undefined | null | false>
) {
  return names.filter(Boolean).join(' ') || undefined;
}

export function WikiTableRenderer({
  mode,
  attributes,
  children,
  containerRef,
  className,
  style,
  table,
  tableClassName,
  tableStyle,
  overlay,
  afterContent,
  scrollable = false,
  compact = false,
  tableInnerStyle,
  onMouseMoveCapture,
  onMouseDownCapture,
  onMouseUpCapture,
}: WikiTableRendererProps) {
  const attrStyle = attributes?.style;
  const tableNode =
    table ?? (
      <table
        className={mergeClassName('rdwiki-table', tableClassName)}
        onDragStart={(event) => event.preventDefault()}
        style={{
          ...tableElementBaseStyle,
          ...tableStyle,
        }}
      >
        <tbody>{children}</tbody>
      </table>
    );

  const content = (
    <>
      {tableNode}
      {overlay}
      {afterContent}
    </>
  );

  return (
    <div
      {...attributes}
      ref={containerRef}
      data-wiki-block="table"
      data-wiki-mode={mode}
      data-wiki-compact={compact ? 'true' : 'false'}
      className={mergeClassName(
        'rdwiki-table-block',
        attributes?.className,
        className,
      )}
      onMouseMoveCapture={onMouseMoveCapture}
      onMouseDownCapture={onMouseDownCapture}
      onMouseUpCapture={onMouseUpCapture}
      style={{
        ...style,
        ...attrStyle,
      }}
    >
      {scrollable ? (
        <div
          className="rdwiki-table-scroll"
          style={{
            overflowX: 'auto',
            maxWidth: '100%',
            ...tableInnerStyle,
          }}
        >
          {content}
        </div>
      ) : (
        content
      )}
    </div>
  );
}

export function WikiTableRowRenderer({
  attributes,
  children,
}: WikiTableRowRendererProps) {
  return (
    <tr
      {...attributes}
      className={mergeClassName(
        'rdwiki-table-row',
        attributes?.className,
      )}
    >
      {children}
    </tr>
  );
}

export function WikiTableCellRenderer({
  mode,
  attributes,
  children,
  colSpan = 1,
  rowSpan = 1,
  className,
  style,
  dataAttributes,
  onMouseDown,
  onMouseEnter,
  onContextMenu,
}: WikiTableCellRendererProps) {
  return (
    <td
      {...attributes}
      {...dataAttributes}
      colSpan={colSpan}
      rowSpan={rowSpan}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onContextMenu={onContextMenu}
      onDragStart={(event) => event.preventDefault()}
      draggable={false}
      className={mergeClassName(
        'rdwiki-table-cell',
        attributes?.className,
        className,
      )}
      data-wiki-mode={mode}
      style={{
        ...style,
        ...(attributes?.style ?? {}),
      }}
    >
      {children}
    </td>
  );
}

export default WikiTableRenderer;

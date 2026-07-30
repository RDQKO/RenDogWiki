'use client';

import React from 'react';
import { ReactEditor } from 'slate-react';
import type { RenderElementProps } from 'slate-react';

import {
  TableBlock,
  WikiTableCellRenderer,
  WikiTableRowRenderer,
} from '@/components/wiki-render';
import {
  tableElementBaseStyle,
} from '@/components/wiki-render/table/tableLayout';

import {
  tablePathKey,
  useDragRect,
  beginDrag,
  hoverCell,
} from '../../helpers/tableDrag';

export function TableEditorAdapter(
  props: RenderElementProps & { editor: any },
) {
  const { attributes, children, element, editor } = props;
  const tablePath = ReactEditor.findPath(editor, element);
  const tkey = tablePathKey(tablePath);
  const rect = useDragRect(tkey);

  const wrapRef = React.useRef<HTMLDivElement | null>(null);
  const ovRef = React.useRef<HTMLDivElement | null>(null);

  const positionOverlay = React.useCallback(() => {
    const wrap = wrapRef.current;
    const ov = ovRef.current;

    if (!wrap || !ov || !rect) {
      if (ov) ov.style.display = 'none';
      return;
    }

    const queryCell = (row: number, column: number) =>
      wrap.querySelector(
        `td.slate-table__cell[data-tkey="${tkey}"][data-r="${row}"][data-c="${column}"]`,
      ) as HTMLElement | null;

    const firstCell = queryCell(rect.r0, rect.c0);
    const lastCell = queryCell(rect.r1, rect.c1);

    if (!firstCell || !lastCell) {
      ov.style.display = 'none';
      return;
    }

    const firstRect = firstCell.getBoundingClientRect();
    const lastRect = lastCell.getBoundingClientRect();
    const baseRect = wrap.getBoundingClientRect();

    const left = Math.round(firstRect.left - baseRect.left);
    const top = Math.round(firstRect.top - baseRect.top);
    const right = Math.round(lastRect.right - baseRect.left);
    const bottom = Math.round(lastRect.bottom - baseRect.top);

    ov.style.display = 'block';
    ov.style.left = `${left}px`;
    ov.style.top = `${top}px`;
    ov.style.width = `${Math.max(0, right - left - 1)}px`;
    ov.style.height = `${Math.max(0, bottom - top - 1)}px`;
  }, [rect, tkey]);

  React.useLayoutEffect(() => {
    positionOverlay();
  }, [positionOverlay]);

  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const resizeObserver = new ResizeObserver(() => positionOverlay());
    resizeObserver.observe(wrap);

    return () => resizeObserver.disconnect();
  }, [positionOverlay]);

  const mergedRef = React.useCallback(
    (elementNode: HTMLDivElement | null) => {
      wrapRef.current = elementNode;

      const attributeRef = (attributes as any).ref;

      if (typeof attributeRef === 'function') {
        attributeRef(elementNode);
      } else if (attributeRef && typeof attributeRef === 'object') {
        (
          attributeRef as {
            current: HTMLDivElement | null;
          }
        ).current = elementNode;
      }
    },
    [attributes],
  );

  const overlayNode = (
    <div
      ref={ovRef}
      contentEditable={false}
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        border: '2px solid #2a9d6f',
        borderRadius: 6,
        boxSizing: 'border-box',
        background: 'rgba(42,157,111,.12)',
        pointerEvents: 'none',
        display: 'none',
      }}
    />
  );

  const tableNode = (
    <table
      className="slate-table"
      onDragStart={(event) => event.preventDefault()}
      style={tableElementBaseStyle}
    >
      <tbody>{children}</tbody>
    </table>
  );

  return (
    <TableBlock
      mode="edit"
      attributes={
        {
          ...attributes,
          'data-tkey': tkey,
        } as React.HTMLAttributes<HTMLDivElement>
      }
      containerRef={mergedRef}
      containerStyle={{
        position: 'relative',
        width: '100%',
        maxWidth: '100%',
      }}
      table={tableNode}
      overlay={overlayNode}
    />
  );
}

export function TableRowEditorAdapter(props: RenderElementProps) {
  const { attributes, children } = props;

  return (
    <WikiTableRowRenderer attributes={attributes}>
      {children}
    </WikiTableRowRenderer>
  );
}

export function TableCellEditorAdapter(
  props: RenderElementProps & { editor: any },
) {
  const { attributes, children, element, editor } = props;
  const cell = element as any;

  const colSpan = Math.max(1, Number(cell.colspan) || 1);
  const rowSpan = Math.max(1, Number(cell.rowspan) || 1);

  const path = ReactEditor.findPath(editor, element);
  const tablePath = path.slice(0, -2);
  const tkey = tablePathKey(tablePath);
  const row = path[path.length - 2] as number;
  const column = path[path.length - 1] as number;

  const onMouseDown: React.MouseEventHandler<HTMLTableCellElement> = (
    event,
  ) => {
    if (event.button !== 0 || !event.shiftKey) return;

    event.preventDefault();
    event.stopPropagation();

    beginDrag(
      editor,
      tablePath,
      tkey,
      row,
      column,
      event.clientX,
      event.clientY,
    );
  };

  const onMouseEnter = () => {
    hoverCell(tkey, row, column);
  };

  const onContextMenu: React.MouseEventHandler<HTMLTableCellElement> = (
    event,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    window.dispatchEvent(
      new CustomEvent('editor:table-menu', {
        detail: {
          x: event.clientX,
          y: event.clientY,
          cellPath: path,
        },
      }),
    );
  };

  return (
    <WikiTableCellRenderer
      mode="edit"
      attributes={
        attributes as React.TdHTMLAttributes<HTMLTableCellElement>
      }
      dataAttributes={{
        'data-tkey': tkey,
        'data-r': row,
        'data-c': column,
      }}
      colSpan={colSpan}
      rowSpan={rowSpan}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onContextMenu={onContextMenu}
      className="slate-table__cell"
    >
      {children}
    </WikiTableCellRenderer>
  );
}

export default TableEditorAdapter;

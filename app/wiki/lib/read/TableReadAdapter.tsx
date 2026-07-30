'use client';

import React from 'react';

import {
  TableBlock,
  WikiTableCellRenderer,
  WikiTableRowRenderer,
} from '@/components/wiki-render';
import {
  tableElementBaseStyle,
} from '@/components/wiki-render/table/tableLayout';
import type {
  ReadRenderEnv,
  ReadRenderNode,
} from './types';

type TableReadAdapterProps = {
  node: any;
  children: React.ReactNode;
};

export function TableReadAdapter({
  children,
}: TableReadAdapterProps) {
  const tableNode = (
    <table
      style={{
        ...tableElementBaseStyle,
      }}
    >
      <tbody>{children}</tbody>
    </table>
  );

  return (
    <TableBlock
      mode="read"
      table={tableNode}
      containerStyle={{
        width: '100%',
        maxWidth: '100%',
        overflowX: 'auto',
        margin: '16px 0',
      }}
    />
  );
}

type TableRowReadAdapterProps = {
  children: React.ReactNode;
};

export function TableRowReadAdapter({
  children,
}: TableRowReadAdapterProps) {
  return (
    <WikiTableRowRenderer>
      {children}
    </WikiTableRowRenderer>
  );
}

type TableCellReadAdapterProps = {
  node: any;
  keyProp?: React.Key;
  ctx?: any;
  handlers?: any;
  env?: ReadRenderEnv;
  renderNode: ReadRenderNode;
};

export function TableCellReadAdapter({
  node,
  keyProp,
  ctx,
  handlers,
  env,
  renderNode,
}: TableCellReadAdapterProps) {
  const colSpan = Math.max(
    1,
    Number(node.colspan) || 1,
  );
  const rowSpan = Math.max(
    1,
    Number(node.rowspan) || 1,
  );
  const customCellBg =
    typeof node.backgroundColor ===
      'string' &&
    node.backgroundColor.trim()
      ? node.backgroundColor
      : typeof node.bgColor === 'string' &&
          node.bgColor.trim()
        ? node.bgColor
        : undefined;
  const resolvedCellBg = env?.isDarkMode
    ? undefined
    : customCellBg;
  const cellChildren =
    node.children?.map(
      (
        child: any,
        index: number,
      ) =>
        renderNode(
          child,
          keyProp
            ? `${keyProp}-${index}`
            : index,
          ctx,
          handlers,
          {
            ...env,
            inDarkTableCell:
              !!env?.isDarkMode,
            inTableCell: true,
          },
        ),
    );

  return (
    <WikiTableCellRenderer
      mode="read"
      colSpan={colSpan}
      rowSpan={rowSpan}
      style={
        resolvedCellBg
          ? { background: resolvedCellBg }
          : undefined
      }
    >
      {cellChildren}
    </WikiTableCellRenderer>
  );
}

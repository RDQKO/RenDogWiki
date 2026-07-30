'use client';

import {
  Editor,
  Element as SlateElement,
  Node as SlateNode,
  Path,
  Text,
  type BaseRange,
  type Descendant,
} from 'slate';

export type TableSelectionRect = {
  tablePath: Path;
  r0: number;
  c0: number;
  r1: number;
  c1: number;
};

export type TableClipboardPayload = {
  plainText: string;
  html: string;
  slateFragment: string;
};

const isTableCell = (
  node: SlateNode,
): node is SlateElement =>
  SlateElement.isElement(node) &&
  (node as { type?: unknown }).type === 'table-cell';

function cloneNode<T>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function encodeSlateFragment(fragment: Descendant[]) {
  if (fragment.length === 0) return '';

  return window.btoa(
    encodeURIComponent(JSON.stringify(fragment)),
  );
}

function serializeText(node: Text) {
  let html = escapeHtml(node.text).replace(/\r?\n/g, '<br>');
  const leaf = node as Text & {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    color?: string;
    backgroundColor?: string;
    fontSize?: string;
  };

  if (leaf.bold) html = `<strong>${html}</strong>`;
  if (leaf.italic) html = `<em>${html}</em>`;
  if (leaf.underline) html = `<u>${html}</u>`;
  if (leaf.strikethrough) html = `<del>${html}</del>`;

  const styles: string[] = [];
  if (leaf.color) styles.push(`color:${escapeHtml(leaf.color)}`);
  if (leaf.backgroundColor) {
    styles.push(`background-color:${escapeHtml(leaf.backgroundColor)}`);
  }
  if (leaf.fontSize) styles.push(`font-size:${escapeHtml(leaf.fontSize)}`);

  return styles.length > 0
    ? `<span style="${styles.join(';')}">${html}</span>`
    : html;
}

function serializeNode(node: SlateNode): string {
  if (Text.isText(node)) return serializeText(node);
  if (!SlateElement.isElement(node)) return '';

  const element = node as SlateElement & {
    type?: string;
    url?: string;
    src?: string;
  };
  const children = element.children.map(serializeNode).join('');

  if (element.type === 'inline-image') {
    const src = String(element.url ?? element.src ?? '').trim();
    return src
      ? `<img src="${escapeHtml(src)}" alt="">`
      : '';
  }

  if (element.type === 'link') {
    const href = String(element.url ?? '').trim();
    return href
      ? `<a href="${escapeHtml(href)}">${children}</a>`
      : children;
  }

  if (element.type === 'paragraph') {
    return `<p>${children || '<br>'}</p>`;
  }

  return children;
}

function makePayload(
  plainText: string,
  fragment: Descendant[],
): TableClipboardPayload {
  return {
    plainText,
    html: fragment.map(serializeNode).join(''),
    slateFragment: encodeSlateFragment(fragment),
  };
}

function getCellNode(
  editor: Editor,
  path: Path,
) {
  try {
    const node = SlateNode.get(editor, path);
    return isTableCell(node) ? node : null;
  } catch {
    return null;
  }
}

function getCellInlineChildren(cell: SlateElement) {
  const result: any[] = [];

  cell.children.forEach((block, blockIndex) => {
    if (SlateElement.isElement(block)) {
      result.push(
        ...block.children.map(child => cloneNode(child)),
      );
    } else {
      result.push(cloneNode(block));
    }

    if (blockIndex < cell.children.length - 1) {
      result.push({ text: '\n' });
    }
  });

  return result;
}

export function buildTableRectClipboardPayload(
  editor: Editor,
  rect: TableSelectionRect,
): TableClipboardPayload | null {
  const plainRows: string[] = [];
  const selectedCells: SlateElement[][] = [];

  for (let row = rect.r0; row <= rect.r1; row += 1) {
    const plainColumns: string[] = [];
    const cellRow: SlateElement[] = [];

    for (let column = rect.c0; column <= rect.c1; column += 1) {
      const cell = getCellNode(
        editor,
        [...rect.tablePath, row, column],
      );

      if (!cell) continue;

      cellRow.push(cell);
      plainColumns.push(
        SlateNode.string(cell).replace(/\r?\n/g, '\n'),
      );
    }

    if (cellRow.length > 0) {
      selectedCells.push(cellRow);
      plainRows.push(plainColumns.join('\t'));
    }
  }

  if (selectedCells.length === 0) return null;

  const isSingleCell =
    selectedCells.length === 1 &&
    selectedCells[0].length === 1;

  if (isSingleCell) {
    const fragment = selectedCells[0][0].children.map(
      child => cloneNode(child),
    ) as Descendant[];

    return makePayload(plainRows[0] ?? '', fragment);
  }

  const fragment = selectedCells.map(cellRow => {
    const children: any[] = [];

    cellRow.forEach((cell, cellIndex) => {
      children.push(...getCellInlineChildren(cell));

      if (cellIndex < cellRow.length - 1) {
        children.push({ text: '\t' });
      }
    });

    return {
      type: 'paragraph',
      children:
        children.length > 0
          ? children
          : [{ text: '' }],
    } as Descendant;
  });

  return makePayload(plainRows.join('\n'), fragment);
}

export function buildTableRangeClipboardPayload(
  editor: Editor,
  selection: BaseRange,
): TableClipboardPayload | null {
  const anchorCell = Editor.above(editor, {
    at: selection.anchor,
    match: isTableCell,
  });
  const focusCell = Editor.above(editor, {
    at: selection.focus,
    match: isTableCell,
  });

  if (!anchorCell || !focusCell) return null;
  if (!Path.equals(anchorCell[1], focusCell[1])) return null;

  const cellPath = anchorCell[1];
  const cell = anchorCell[0] as SlateElement;
  const relativeRange: BaseRange = {
    anchor: {
      path: selection.anchor.path.slice(cellPath.length),
      offset: selection.anchor.offset,
    },
    focus: {
      path: selection.focus.path.slice(cellPath.length),
      offset: selection.focus.offset,
    },
  };

  try {
    const fragment = SlateNode.fragment(
      cell,
      relativeRange,
    ) as Descendant[];

    return makePayload(
      Editor.string(editor, selection),
      fragment,
    );
  } catch {
    return makePayload(
      Editor.string(editor, selection),
      [],
    );
  }
}

export function setTableClipboardData(
  data: DataTransfer,
  payload: TableClipboardPayload,
) {
  data.setData('text/plain', payload.plainText);

  if (payload.html) {
    data.setData('text/html', payload.html);
  }

  if (payload.slateFragment) {
    data.setData(
      'application/x-slate-fragment',
      payload.slateFragment,
    );
    data.setData(
      'text/x-slate-fragment',
      payload.slateFragment,
    );
  }
}

export async function writeTableClipboardData(
  payload: TableClipboardPayload,
) {
  let copiedByEvent = false;

  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    setTableClipboardData(
      event.clipboardData,
      payload,
    );
    copiedByEvent = true;
  };

  document.addEventListener('copy', onCopy, true);

  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', onCopy, true);
  }

  if (copiedByEvent) return;

  const ClipboardItemConstructor =
    window.ClipboardItem;

  if (
    navigator.clipboard?.write &&
    ClipboardItemConstructor
  ) {
    const items: Record<string, Blob> = {
      'text/plain': new Blob(
        [payload.plainText],
        { type: 'text/plain' },
      ),
    };

    if (payload.html) {
      items['text/html'] = new Blob(
        [payload.html],
        { type: 'text/html' },
      );
    }

    await navigator.clipboard.write([
      new ClipboardItemConstructor(items),
    ]);
    return;
  }

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(
      payload.plainText,
    );
    return;
  }

  throw new Error('table clipboard copy failed');
}

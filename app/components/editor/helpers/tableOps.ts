/**
 * C:\next\rdwiki\app\components\editor\helpers\tableOps.ts
 * 표 조작 유틸(병합/분할/행·열/삭제/내용 비우기)
 * - 스키마: table > table-row[] > table-cell{rowspan?:number, colspan?:number} > paragraph > text
 */

import { Editor, Element as SlateElement, Node, Path, Transforms, Point, Range } from 'slate';
import type { TableCellElement } from '@/types/slate';

export type CellPos = { r: number; c: number };

const isTable = (n: any) => SlateElement.isElement(n) && n.type === 'table';
const isRow   = (n: any) => SlateElement.isElement(n) && n.type === 'table-row';
const isCell  = (n: any) => SlateElement.isElement(n) && n.type === 'table-cell';

export const makeEmptyCell = (): TableCellElement => ({
  type: 'table-cell',
  rowspan: 1,
  colspan: 1,
  children: [{ type: 'paragraph', children: [{ text: '' }] }],
});

export function findCellPos(cellPath: Path): CellPos {
  const r = cellPath[cellPath.length - 2] as number;
  const c = cellPath[cellPath.length - 1] as number;
  return { r, c };
}

export function findTablePath(editor: Editor, fromPath: Path): Path {
  const [tableEntry] =
    Editor.nodes(editor, { at: fromPath, reverse: true, match: isTable });
  if (!tableEntry) throw new Error('table not found');
  return tableEntry[1];
}

export function getTableSize(editor: Editor, tablePath: Path) {
  const tableNode = Node.get(editor, tablePath) as any;
  const rows = (tableNode.children || []).length;
  const cols = rows ? (tableNode.children[0]?.children?.length ?? 0) : 0;
  return { rows, cols };
}

/** 선택이 복수 셀이면 그 직사각형 반환, 아니면 현재 셀만 */
export function getSelectedRectOrCell(editor: Editor, fallbackCellPath: Path) {
  const sel = editor.selection;
  if (!sel || Range.isCollapsed(sel)) {
    const { r, c } = findCellPos(fallbackCellPath);
    return { r0: r, c0: c, r1: r, c1: c, tablePath: findTablePath(editor, fallbackCellPath) };
  }

  const anchorCell = Editor.above(editor, { at: sel.anchor, match: isCell });
  const focusCell  = Editor.above(editor, { at: sel.focus,  match: isCell });
  if (!anchorCell || !focusCell) {
    const { r, c } = findCellPos(fallbackCellPath);
    return { r0: r, c0: c, r1: r, c1: c, tablePath: findTablePath(editor, fallbackCellPath) };
  }

  const tableA = findTablePath(editor, anchorCell[1]);
  const tableB = findTablePath(editor, focusCell[1]);
  if (Path.equals(tableA, tableB)) {
    const a = findCellPos(anchorCell[1]);
    const b = findCellPos(focusCell[1]);

    // 한 셀 안의 텍스트 선택은 우클릭한 셀 자체에 적용한다.
    if (a.r === b.r && a.c === b.c) {
      const fallback = findCellPos(fallbackCellPath);
      return {
        r0: fallback.r,
        c0: fallback.c,
        r1: fallback.r,
        c1: fallback.c,
        tablePath: findTablePath(editor, fallbackCellPath),
      };
    }

    return {
      r0: Math.min(a.r, b.r), c0: Math.min(a.c, b.c),
      r1: Math.max(a.r, b.r), c1: Math.max(a.c, b.c),
      tablePath: tableA
    };
  }

  // 서로 다른 표인 경우 fallback
  const { r, c } = findCellPos(fallbackCellPath);
  return { r0: r, c0: c, r1: r, c1: c, tablePath: findTablePath(editor, fallbackCellPath) };
}

/** 셀 병합(선택 직사각형). 지원: 동일 표 내 사각형 병합 */
export function mergeCells(editor: Editor, rect: {tablePath: Path; r0:number; c0:number; r1:number; c1:number}) {
  const { tablePath, r0, c0, r1, c1 } = rect;
  if (r0 === r1 && c0 === c1) return; // 한 셀만 선택이면 무시

  Editor.withoutNormalizing(editor, () => {
    // 1) 상단행: c0+1..c1 제거(역순)
    for (let col = c1; col >= c0 + 1; col--) {
      try { Transforms.removeNodes(editor, { at: [...tablePath, r0, col] }); } catch {}
    }
    // 2) 그 아래 행들: c0..c1 제거(역순)
    for (let row = r0 + 1; row <= r1; row++) {
      for (let col = c1; col >= c0; col--) {
        try { Transforms.removeNodes(editor, { at: [...tablePath, row, col] }); } catch {}
      }
    }
    // 3) 좌상단 셀에 rowspan/colspan 부여
    try {
      Transforms.setNodes(editor, { rowspan: (r1 - r0 + 1), colspan: (c1 - c0 + 1) } as any, { at: [...tablePath, r0, c0] });
    } catch {}
    moveCaretToTopLeftCell(editor, tablePath, r0, c0);
  });
}

/** 현재 셀을 행 기준 분할(rowspan 해제) */
export function splitCellByRow(editor: Editor, cellPath: Path) {
  const tablePath = findTablePath(editor, cellPath);
  const { r, c } = findCellPos(cellPath);
  let rowSpan = 1;
  try { rowSpan = Math.max(1, Number((Node.get(editor, cellPath) as any).rowspan) || 1); } catch {}
  if (rowSpan <= 1) return;

  Editor.withoutNormalizing(editor, () => {
    try { Transforms.setNodes(editor, { rowspan: 1 } as any, { at: cellPath }); } catch {}
    for (let i = 1; i < rowSpan; i++) {
      const rowPath = [...tablePath, r + i];
      try {
        const rowNode = Node.get(editor, rowPath) as any;
        const insertIndex = Math.min(c, rowNode.children?.length ?? c);
        Transforms.insertNodes(editor, makeEmptyCell(), { at: [...rowPath, insertIndex] });
      } catch {}
    }
    moveCaretToTopLeftCell(editor, tablePath, r, c);
  });
}

/** 현재 셀을 열 기준 분할(colspan 해제) */
export function splitCellByCol(editor: Editor, cellPath: Path) {
  const tablePath = findTablePath(editor, cellPath);
  const { r, c } = findCellPos(cellPath);
  let colSpan = 1;
  try { colSpan = Math.max(1, Number((Node.get(editor, cellPath) as any).colspan) || 1); } catch {}
  if (colSpan <= 1) return;

  Editor.withoutNormalizing(editor, () => {
    try { Transforms.setNodes(editor, { colspan: 1 } as any, { at: cellPath }); } catch {}
    for (let i = 1; i < colSpan; i++) {
      try { Transforms.insertNodes(editor, makeEmptyCell(), { at: [...tablePath, r, c + i] }); } catch {}
    }
    moveCaretToTopLeftCell(editor, tablePath, r, c);
  });
}

/** 표 자체 삭제 */
export function removeTable(editor: Editor, tablePath: Path) {
  try { Transforms.removeNodes(editor, { at: tablePath }); } catch {}
}

export function moveCaretToTopLeftCell(editor: Editor, tablePath: Path, r0 = 0, c0 = 0) {
  try {
    const cellPath = [...tablePath, r0, c0];
    const start = Editor.start(editor, cellPath);
    Transforms.select(editor, start);
  } catch {}
}

/** 선택 직사각형의 셀 구조는 유지하고 내부 내용만 빈 문단으로 교체 */
export function clearCellsRect(
  editor: Editor,
  rect: { tablePath: Path; r0: number; c0: number; r1: number; c1: number }
) {
  const { tablePath, r0, c0, r1, c1 } = rect;

  Editor.withoutNormalizing(editor, () => {
    for (let r = r1; r >= r0; r--) {
      for (let c = c1; c >= c0; c--) {
        const cellPath = [...tablePath, r, c];
        try {
          const cell = Node.get(editor, cellPath) as any;
          const childCount = Array.isArray(cell.children)
            ? cell.children.length
            : 0;

          for (let index = childCount - 1; index >= 0; index -= 1) {
            Transforms.removeNodes(editor, {
              at: [...cellPath, index],
            });
          }

          Transforms.insertNodes(
            editor,
            {
              type: 'paragraph',
              children: [{ text: '' }],
            } as any,
            { at: [...cellPath, 0] },
          );
        } catch {
          // 병합 등으로 실제 셀이 없을 수 있으니 무시
        }
      }
    }
    moveCaretToTopLeftCell(editor, tablePath, r0, c0);
  });
}

/* ---------- 네이버 스타일 행/열 삭제 & 판정 ---------- */

export function removeRows(editor: Editor, tablePath: Path, r0: number, r1: number) {
  Editor.withoutNormalizing(editor, () => {
    for (let r = r1; r >= r0; r--) {
      try { Transforms.removeNodes(editor, { at: [...tablePath, r] }); } catch {}
    }
    try {
      const tbl = Node.get(editor, tablePath) as any;
      if (!tbl.children?.length) Transforms.removeNodes(editor, { at: tablePath });
    } catch {}
  });
}

export function removeCols(editor: Editor, tablePath: Path, c0: number, c1: number) {
  Editor.withoutNormalizing(editor, () => {
    try {
      const tbl = Node.get(editor, tablePath) as any;
      const rows = tbl.children?.length ?? 0;
      for (let r = 0; r < rows; r++) {
        for (let c = c1; c >= c0; c--) {
          try { Transforms.removeNodes(editor, { at: [...tablePath, r, c] }); } catch {}
        }
      }
      const first = (Node.get(editor, [...tablePath, 0]) as any)?.children?.length ?? 0;
      if (first === 0) Transforms.removeNodes(editor, { at: tablePath });
    } catch {}
  });
}

export function isFullRowSelection(
  editor: Editor,
  rect: { tablePath: Path; r0:number; c0:number; r1:number; c1:number }
) {
  const { rows, cols } = getTableSize(editor, rect.tablePath);
  return rect.c0 === 0 && rect.c1 === cols - 1 && rows > 0;
}

export function isFullColSelection(
  editor: Editor,
  rect: { tablePath: Path; r0:number; c0:number; r1:number; c1:number }
) {
  const { rows, cols } = getTableSize(editor, rect.tablePath);
  return rect.r0 === 0 && rect.r1 === rows - 1 && cols > 0;
}

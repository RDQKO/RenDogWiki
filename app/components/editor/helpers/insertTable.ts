// File: app/components/editor/helpers/insertTable.ts
// =============================================
// 목적: 에디터에 표(table) 블록을 삽입하고,
//       그 뒤에 바로 이어 쓸 수 있도록 빈 단락(paragraph)을 함께 삽입한다.
// 사용처: 툴바 "표 삽입" 버튼 / 단축키 등
// - 선택 영역이 없을 때도 문서 끝에 안전하게 삽입
// - withoutNormalizing 으로 표 + 단락을 한 번에 삽입
// =============================================

import { Editor, Transforms } from 'slate';
import type {
  TableElement,
  TableRowElement,
  TableCellElement,
  ParagraphElement,
} from '@/types/slate';

export type InsertTableOptions = {
  rows?: number;
  cols?: number;
};

/**
 * insertTable
 * 1) rows x cols 크기의 표를 만들고
 * 2) 그 뒤에 빈 단락을 붙여서 삽입한다.
 *
 * - insertTable(editor, 3, 4)
 * - insertTable(editor, { rows: 3, cols: 4 })
 * 둘 다 지원.
 */
export function insertTable(
  editor: Editor,
  rows: number,
  cols: number,
): void;
export function insertTable(
  editor: Editor,
  options?: InsertTableOptions,
): void;
export function insertTable(
  editor: Editor,
  rowsOrOptions?: number | InsertTableOptions,
  maybeCols?: number,
): void {
  // ---- 옵션 파싱 ----
  let rows = 3;
  let cols = 3;

  if (typeof rowsOrOptions === 'number') {
    rows = rowsOrOptions;
    cols = typeof maybeCols === 'number' ? maybeCols : cols;
  } else if (rowsOrOptions && typeof rowsOrOptions === 'object') {
    rows = rowsOrOptions.rows ?? rows;
    cols = rowsOrOptions.cols ?? cols;
  }

  const safeRows = Math.max(1, rows | 0);
  const safeCols = Math.max(1, cols | 0);

  // ---- 1) 표 노드 생성 ----
  const table: TableElement = {
    type: 'table',
    children: Array.from({ length: safeRows }, () => {
      const row: TableRowElement = {
        type: 'table-row',
        children: Array.from({ length: safeCols }, () => {
          const cell: TableCellElement = {
            type: 'table-cell',
            rowspan: 1,
            colspan: 1,
            children: [
              {
                type: 'paragraph',
                children: [{ text: '' }],
              } as ParagraphElement,
            ],
          };
          return cell;
        }),
      };
      return row;
    }),
  };

  // ---- 2) 뒤따를 빈 단락 ----
  const paragraph: ParagraphElement = {
    type: 'paragraph',
    children: [{ text: '' }],
  };

  // ---- 3) 삽입 위치: selection 없으면 문서 끝 ----
  const at = editor.selection ?? Editor.end(editor, []);

  // ---- 4) 표 + 단락을 한 번에 삽입 ----
  Editor.withoutNormalizing(editor, () => {
    Transforms.insertNodes(editor, [table, paragraph], { at });
  });
}

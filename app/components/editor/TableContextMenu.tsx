// C:\next\rdwiki\app\components\editor\TableContextMenu.tsx
'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Editor, Path, Node as SlateNode, Transforms } from 'slate';
import { ReactEditor } from 'slate-react';
import {
  clearCellsRect,
  getSelectedRectOrCell,
  mergeCells,
  splitCellByCol,
  splitCellByRow,
  findTablePath,
  isFullRowSelection,
  isFullColSelection,
  removeRows,
  removeCols,
} from './helpers/tableOps';
import { getDragRect, clearDrag } from './helpers/tableDrag';
import {
  buildTableRectClipboardPayload,
  writeTableClipboardData,
} from './helpers/tableClipboard';

type Props = { editor: Editor };

export default function TableContextMenu({ editor }: Props) {
  const [open, setOpen] = useState(false);
  const [xy, setXY] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [cellPath, setCellPath] = useState<Path | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Element.tsx 에서 쏘는 'editor:table-menu' 이벤트로 열기
  useEffect(() => {
    const onOpen = (e: Event) => {
      const { x, y, cellPath } = (e as CustomEvent).detail || {};
      if (!cellPath) return;

      setXY({ x, y });
      setCellPath(cellPath);
      setOpen(true);
    };

    window.addEventListener('editor:table-menu' as any, onOpen as any);
    return () =>
      window.removeEventListener('editor:table-menu' as any, onOpen as any);
  }, []);

  // 바깥 클릭/스크롤/ESC → 닫기
  useEffect(() => {
    if (!open) return;

    const close = (e: MouseEvent | WheelEvent) => {
      const target = e.target as HTMLElement | null;
      if (boxRef.current && target && boxRef.current.contains(target)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };

    window.addEventListener('mousedown', close, { capture: true });
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('keydown', esc);

    return () => {
      window.removeEventListener('mousedown', close as any, {
        capture: true,
      } as any);
      window.removeEventListener('wheel', close as any);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  if (!open || !cellPath) return null;

  // 공통 액션 래퍼: 포커스 + 실행 + 드래그 상태 초기화 + 메뉴 닫기
  const act = (fn: () => void) => () => {
    try {
      ReactEditor.focus(editor as any);
    } catch {
      /* ignore */
    }
    fn();
    clearDrag();
    setOpen(false);
  };

  // ✅ 비동기(clipboard) 액션 래퍼
  const actAsync = (fn: () => Promise<void>) => async () => {
    try {
      ReactEditor.focus(editor as any);
    } catch {
      /* ignore */
    }
    try {
      await fn();
    } finally {
      clearDrag();
      setOpen(false);
    }
  };

  // 현재 셀이 속한 표 path
  const tablePath = findTablePath(editor, cellPath);

  // 현재 선택 영역(드래그 or selection)
  const rect = (() => {
    const drag = getDragRect();
    if (drag && Path.equals(drag.tablePath, tablePath)) return drag;
    return getSelectedRectOrCell(editor, cellPath);
  })();

  const canDeleteRow = isFullRowSelection(editor, rect);
  const canDeleteCol = isFullColSelection(editor, rect);
  const canDelete = canDeleteRow || canDeleteCol;

  // ✅ 행 추가(아래) 헬퍼
  const insertRowBelow = () => {
    try {
      const rowIndex = cellPath[cellPath.length - 2] as number;
      const rowPath = [...tablePath, rowIndex];

      const rowNode = SlateNode.get(editor, rowPath) as any;
      if (!rowNode || !Array.isArray(rowNode.children)) return;

      const newRow: any = {
        type: 'table-row',
        children: rowNode.children.map((cell: any) => {
          const newCell: any = {
            type: 'table-cell',
            children: [
              {
                type: 'paragraph',
                children: [{ text: '' }],
              },
            ],
          };
          if (cell.colspan != null) newCell.colspan = cell.colspan;
          if (cell.rowspan != null) newCell.rowspan = cell.rowspan;
          return newCell;
        }),
      };

      Transforms.insertNodes(editor, newRow, {
        at: [...tablePath, rowIndex + 1],
      });
    } catch (e) {
      console.error('insertRowBelow failed', e);
    }
  };

  const copyCellInnerContents = async () => {
    const payload =
      buildTableRectClipboardPayload(
        editor,
        rect,
      );
    if (!payload) return;

    await writeTableClipboardData(payload);
  };

  const insertParagraphBelowTable = () => {
    try {
      const insertPath = Path.next(tablePath);

      Transforms.insertNodes(
        editor,
        {
          type: 'paragraph',
          children: [{ text: '' }],
        } as any,
        { at: insertPath },
      );

      Transforms.select(
        editor,
        Editor.start(editor, insertPath),
      );
      ReactEditor.focus(editor as any);
    } catch (error) {
      console.error(
        'insertParagraphBelowTable failed',
        error,
      );
    }
  };

  return (
    <div
      ref={boxRef}
      className="editor-table-context-menu"
      style={{
        position: 'fixed',
        top: xy.y,
        left: xy.x,
        transform: 'translateY(-6px)',
        zIndex: 99999,
      }}
      role="menu"
      aria-label="표 메뉴"
    >
      {/* 셀 블록을 제외하고 내부 내용만 복사 */}
      <MenuItem onClick={actAsync(copyCellInnerContents)}>
        셀 내용 복사
      </MenuItem>
      <MenuItem
        danger
        onClick={act(() =>
          clearCellsRect(editor, rect)
        )}
      >
        셀 내용 삭제
      </MenuItem>

      <MenuDivider />

      {/* 셀/행/열 조작 */}
      <MenuItem onClick={act(() => mergeCells(editor, rect))}>
        셀 병합
      </MenuItem>
      <MenuItem onClick={act(() => splitCellByRow(editor, cellPath))}>
        행 분할
      </MenuItem>
      <MenuItem onClick={act(() => splitCellByCol(editor, cellPath))}>
        열 분할
      </MenuItem>

      {/* 행 추가(아래) */}
      <MenuItem onClick={act(insertRowBelow)}>
        행 추가(아래)
      </MenuItem>

      <MenuItem
        danger={canDelete}
        onClick={
          canDelete
            ? act(() => {
                if (canDeleteRow) {
                  removeRows(editor, rect.tablePath, rect.r0, rect.r1);
                } else if (canDeleteCol) {
                  removeCols(editor, rect.tablePath, rect.c0, rect.c1);
                }
              })
            : () => {}
        }
      >
        {canDeleteRow
          ? '행 삭제'
          : canDeleteCol
          ? '열 삭제'
          : '삭제(행/열 전체 선택 시)'}
      </MenuItem>

      {/* 표 전체 삭제 */}
      <MenuDivider />
      <MenuItem onClick={act(insertParagraphBelowTable)}>
        표 아래에 빈 문단 생성
      </MenuItem>
      <MenuItem
        danger
        onClick={act(() => {
          Transforms.removeNodes(editor, { at: tablePath });
        })}
      >
        표 삭제
      </MenuItem>
    </div>
  );
}

function MenuDivider() {
  return <div className="editor-table-context-divider" />;
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={[
        'editor-table-context-item',
        danger ? 'is-danger' : '',
      ].filter(Boolean).join(' ')}
      role="menuitem"
    >
      {children}
    </button>
  );
}

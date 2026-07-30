// =============================================
// File: app/components/editor/DividerContextMenu.tsx
// =============================================
/**
 * 에디터 구분선 컨텍스트 메뉴
 * - 구분선의 종류와 속성을 포함한 Slate 블록 전체 복사
 * - 우클릭한 구분선 블록 하나 삭제
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Editor,
  Element as SlateElement,
  Node as SlateNode,
  Path,
  Transforms,
  type BaseRange,
} from 'slate';
import { ReactEditor } from 'slate-react';

type Props = {
  editor: Editor & ReactEditor;
};

type MenuState = {
  x: number;
  y: number;
  path: Path;
  selection: BaseRange | null;
};

const MENU_WIDTH = 224;
const MENU_HEIGHT = 104;
const VIEWPORT_GAP = 8;

function clonePath(path: Path): Path {
  return [...path];
}

function cloneRange(range: BaseRange | null): BaseRange | null {
  if (!range) return null;

  return {
    anchor: {
      path: [...range.anchor.path],
      offset: range.anchor.offset,
    },
    focus: {
      path: [...range.focus.path],
      offset: range.focus.offset,
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max));
}

function resolveMenuPosition(x: number, y: number) {
  const maxX = Math.max(
    VIEWPORT_GAP,
    window.innerWidth - MENU_WIDTH - VIEWPORT_GAP,
  );
  const maxY = Math.max(
    VIEWPORT_GAP,
    window.innerHeight - MENU_HEIGHT - VIEWPORT_GAP,
  );

  return {
    x: clamp(x, VIEWPORT_GAP, maxX),
    y: clamp(y, VIEWPORT_GAP, maxY),
  };
}

function isDividerElement(node: SlateNode) {
  return (
    SlateElement.isElement(node) &&
    (node as { type?: unknown }).type === 'divider'
  );
}

async function writeFormattedData(data: DataTransfer) {
  let copiedByEvent = false;

  const onCopy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;

    event.preventDefault();
    event.stopImmediatePropagation();

    const types = [
      'text/plain',
      'text/html',
      'application/x-slate-fragment',
      'text/x-slate-fragment',
    ];

    for (const type of types) {
      const value = data.getData(type);
      if (!value) continue;

      try {
        event.clipboardData.setData(type, value);
      } catch {
        // 사용자 정의 MIME을 거부하는 브라우저에서도 HTML/텍스트 복사는 유지한다.
      }
    }

    copiedByEvent = true;
  };

  document.addEventListener('copy', onCopy, true);

  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener('copy', onCopy, true);
  }

  if (copiedByEvent) return;

  const ClipboardItemConstructor = window.ClipboardItem;
  if (navigator.clipboard?.write && ClipboardItemConstructor) {
    const plain = data.getData('text/plain');
    const html = data.getData('text/html');
    const clipboardData: Record<string, Blob> = {
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    };

    if (html) {
      clipboardData['text/html'] = new Blob([html], {
        type: 'text/html',
      });
    }

    await navigator.clipboard.write([
      new ClipboardItemConstructor(clipboardData),
    ]);
    return;
  }

  throw new Error('formatted clipboard copy failed');
}

export default function DividerContextMenu({ editor }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasPath = useCallback(
    (path: Path) => {
      try {
        return Editor.hasPath(editor, path);
      } catch {
        return false;
      }
    },
    [editor],
  );

  const restoreSelection = useCallback(
    (selection: BaseRange | null) => {
      try {
        if (!selection) {
          Transforms.deselect(editor);
          return;
        }

        if (!ReactEditor.hasRange(editor, selection)) return;

        Transforms.select(editor, selection);
        ReactEditor.focus(editor);
      } catch {
        // 복사 도중 문서 구조가 바뀌어 이전 선택 영역이 사라진 경우는 무시한다.
      }
    },
    [editor],
  );

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          x?: unknown;
          y?: unknown;
          path?: unknown;
        }>
      ).detail;

      if (
        typeof detail?.x !== 'number' ||
        typeof detail?.y !== 'number' ||
        !Array.isArray(detail?.path)
      ) {
        return;
      }

      const path = detail.path as Path;

      try {
        if (!Editor.hasPath(editor, path)) {
          setMenu(null);
          return;
        }

        const node = SlateNode.get(editor, path);
        if (!isDividerElement(node)) {
          setMenu(null);
          return;
        }

        const position = resolveMenuPosition(
          detail.x,
          detail.y,
        );

        setMenu({
          ...position,
          path: clonePath(path),
          selection: cloneRange(editor.selection),
        });
      } catch {
        setMenu(null);
      }
    };

    window.addEventListener('editor:divider-menu', onOpen);
    return () => {
      window.removeEventListener('editor:divider-menu', onOpen);
    };
  }, [editor]);

  useEffect(() => {
    if (!menu) return;

    const closeOnPointerDown = (event: MouseEvent) => {
      const targetElement =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;
      if (
        menuRef.current &&
        targetElement &&
        menuRef.current.contains(targetElement)
      ) {
        return;
      }

      setMenu(null);
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenu(null);
    };

    const close = () => setMenu(null);

    window.addEventListener('mousedown', closeOnPointerDown, true);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('resize', close);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      window.removeEventListener('mousedown', closeOnPointerDown, true);
      window.removeEventListener('wheel', close);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menu]);

  const copyDivider = async () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    const previousSelection = cloneRange(menu.selection);

    try {
      const node = SlateNode.get(editor, menu.path);

      if (!isDividerElement(node)) {
        setMenu(null);
        return;
      }

      Transforms.select(editor, Editor.range(editor, menu.path));
      ReactEditor.focus(editor);

      const data = new DataTransfer();
      ReactEditor.setFragmentData(editor, data, 'copy');
      await writeFormattedData(data);
    } catch (error) {
      console.error('구분선 복사 실패', error);
      alert('구분선 복사에 실패했습니다.');
    } finally {
      restoreSelection(previousSelection);
      setMenu(null);
    }
  };

  const deleteDivider = () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    const targetPath = clonePath(menu.path);

    try {
      Editor.withoutNormalizing(editor, () => {
        Transforms.removeNodes(editor, { at: targetPath });

        if (editor.children.length === 0) {
          Transforms.insertNodes(
            editor,
            {
              type: 'paragraph',
              children: [{ text: '' }],
            } as any,
            { at: [0] },
          );
        }
      });

      const nextPath = hasPath(targetPath)
        ? targetPath
        : null;
      const previousPath =
        targetPath[targetPath.length - 1] > 0
          ? Path.previous(targetPath)
          : null;
      const focusPath =
        nextPath ??
        (previousPath && hasPath(previousPath) ? previousPath : []);

      Transforms.select(editor, Editor.start(editor, focusPath));
      ReactEditor.focus(editor);
    } catch (error) {
      console.error('구분선 삭제 실패', error);
    } finally {
      setMenu(null);
    }
  };

  return menu ? (
    <div
      ref={menuRef}
      className="editor-divider-context-menu"
      style={{
        top: menu.y,
        left: menu.x,
      }}
      role="menu"
      aria-label="구분선 메뉴"
      onContextMenu={event => event.preventDefault()}
    >
      <DividerMenuItem onClick={() => void copyDivider()}>
        구분선 복사
      </DividerMenuItem>

      <DividerMenuItem onClick={deleteDivider} danger>
        구분선 삭제
      </DividerMenuItem>
    </div>
  ) : null;
}

function DividerMenuItem({
  children,
  onClick,
  danger = false,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        'editor-divider-context-item',
        danger ? 'is-danger' : '',
      ].filter(Boolean).join(' ')}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      role="menuitem"
    >
      {children}
    </button>
  );
}

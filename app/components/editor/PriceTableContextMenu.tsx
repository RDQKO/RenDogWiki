'use client';

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  Editor,
  Element as SlateElement,
  Node as SlateNode,
  Path,
  Transforms,
} from 'slate';
import { ReactEditor } from 'slate-react';

type Props = {
  editor: Editor & ReactEditor;
};

type MenuState = {
  x: number;
  y: number;
  path: Path;
};

const MENU_WIDTH = 224;
const MENU_HEIGHT = 104;
const VIEWPORT_GAP = 8;

function clonePath(path: Path): Path {
  return [...path];
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

function isPriceTableElement(node: SlateNode) {
  return (
    SlateElement.isElement(node) &&
    (node as { type?: unknown }).type === 'price-table-card'
  );
}

export default function PriceTableContextMenu({ editor }: Props) {
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
        if (!isPriceTableElement(node)) {
          setMenu(null);
          return;
        }

        setMenu({
          ...resolveMenuPosition(detail.x, detail.y),
          path: clonePath(path),
        });
      } catch {
        setMenu(null);
      }
    };

    window.addEventListener('editor:price-table-menu', onOpen);
    return () => {
      window.removeEventListener('editor:price-table-menu', onOpen);
    };
  }, [editor]);

  useEffect(() => {
    if (!menu) return;

    const closeOnPointerDown = (event: MouseEvent) => {
      const target =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;

      if (menuRef.current && target && menuRef.current.contains(target)) {
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

  const insertParagraphAfterPriceTable = () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    const targetPath = clonePath(menu.path);

    try {
      const node = SlateNode.get(editor, targetPath);
      if (!isPriceTableElement(node)) return;

      const insertPath = Path.next(targetPath);

      Transforms.insertNodes(
        editor,
        {
          type: 'paragraph',
          children: [{ text: '' }],
        } as any,
        { at: insertPath },
      );
      Transforms.select(editor, Editor.start(editor, insertPath));
      ReactEditor.focus(editor);
    } catch (error) {
      console.error('시세표 다음 빈 문단 생성 실패', error);
    } finally {
      setMenu(null);
    }
  };

  const deletePriceTable = () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    const targetPath = clonePath(menu.path);

    try {
      const node = SlateNode.get(editor, targetPath);
      if (!isPriceTableElement(node)) return;

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

      const nextPath = hasPath(targetPath) ? targetPath : null;
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
      console.error('시세표 삭제 실패', error);
    } finally {
      setMenu(null);
    }
  };

  return menu ? (
    <div
      ref={menuRef}
      className="editor-price-table-context-menu"
      style={{
        top: menu.y,
        left: menu.x,
      }}
      role="menu"
      aria-label="시세표 메뉴"
      onContextMenu={event => event.preventDefault()}
    >
      <PriceTableMenuItem onClick={insertParagraphAfterPriceTable}>
        시세표 아래에 빈 문단 생성
      </PriceTableMenuItem>

      <PriceTableMenuItem onClick={deletePriceTable} danger>
        시세표 삭제
      </PriceTableMenuItem>
    </div>
  ) : null;
}

function PriceTableMenuItem({
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
        'editor-price-table-context-item',
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

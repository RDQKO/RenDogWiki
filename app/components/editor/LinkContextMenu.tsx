// =============================================
// File: app/components/editor/LinkContextMenu.tsx
// =============================================
/**
 * 에디터 인라인 링크 컨텍스트 메뉴
 * - 링크 주소 수정
 * - 링크 속성만 제거하고 텍스트 유지
 * - 링크 요소 전체를 Slate 속성과 함께 복사
 * - 링크 텍스트를 포함한 요소 전체 삭제
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
  type Point,
} from 'slate';
import { ReactEditor } from 'slate-react';

import LinkInputModal from './LinkInputModal';
import type { LinkElement } from '@/types/slate';

type Props = {
  editor: Editor & ReactEditor;
};

type MenuState = {
  x: number;
  y: number;
  path: Path;
  url: string;
  selection: BaseRange | null;
};

type EditTarget = {
  path: Path;
  url: string;
  selection: BaseRange | null;
};

const MENU_WIDTH = 224;
const MENU_HEIGHT = 164;
const VIEWPORT_GAP = 8;

function isLinkElement(node: unknown): node is LinkElement {
  return (
    SlateElement.isElement(node) &&
    (node as { type?: unknown }).type === 'link'
  );
}

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

function getEventElement(target: EventTarget | null): Element | null {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement;
  return null;
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
        // 브라우저가 사용자 정의 MIME을 거부해도 HTML과 일반 텍스트는 유지한다.
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
      clipboardData['text/html'] = new Blob([html], { type: 'text/html' });
    }

    await navigator.clipboard.write([
      new ClipboardItemConstructor(clipboardData),
    ]);
    return;
  }

  throw new Error('formatted clipboard copy failed');
}

export default function LinkContextMenu({ editor }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
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
          return false;
        }

        if (!ReactEditor.hasRange(editor, selection)) return false;

        Transforms.select(editor, selection);
        ReactEditor.focus(editor);
        return true;
      } catch {
        return false;
      }
    },
    [editor],
  );

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => {
      const targetElement = getEventElement(event.target);

      if (
        menuRef.current &&
        targetElement &&
        menuRef.current.contains(targetElement)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const linkElement = targetElement?.closest<HTMLElement>(
        '[data-wiki-inline="link"][data-wiki-mode="edit"]',
      );
      const editable = linkElement?.closest('.editor-slate-content');

      if (!linkElement || !editable) {
        setMenu(null);
        return;
      }

      try {
        const node = ReactEditor.toSlateNode(editor, linkElement);
        if (!isLinkElement(node)) {
          setMenu(null);
          return;
        }

        const path = ReactEditor.findPath(editor, node);
        const position = resolveMenuPosition(event.clientX, event.clientY);

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        setMenu({
          ...position,
          path: clonePath(path),
          url: String(node.url ?? ''),
          selection: cloneRange(editor.selection),
        });
      } catch {
        setMenu(null);
      }
    };

    document.addEventListener('contextmenu', onContextMenu, true);
    return () => document.removeEventListener('contextmenu', onContextMenu, true);
  }, [editor]);

  useEffect(() => {
    if (!menu) return;

    const closeOnPointerDown = (event: MouseEvent) => {
      const targetElement = getEventElement(event.target);
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

  const openEditModal = () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    setEditTarget({
      path: clonePath(menu.path),
      url: menu.url,
      selection: cloneRange(menu.selection),
    });
    setMenu(null);
  };

  const removeLinkAssignment = () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    const selectionRef =
      menu.selection && ReactEditor.hasRange(editor, menu.selection)
        ? Editor.rangeRef(editor, menu.selection, { affinity: 'forward' })
        : null;

    try {
      Transforms.unwrapNodes(editor, {
        at: menu.path,
        match: isLinkElement,
      });

      const nextSelection = selectionRef?.unref() ?? null;
      if (!restoreSelection(nextSelection)) {
        ReactEditor.focus(editor);
      }
    } catch (error) {
      selectionRef?.unref();
      console.error('링크 해제 실패', error);
    } finally {
      setMenu(null);
    }
  };

  const copyLink = async () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    const previousSelection = cloneRange(menu.selection);

    try {
      const node = SlateNode.get(editor, menu.path);
      if (!isLinkElement(node)) {
        setMenu(null);
        return;
      }

      Transforms.select(editor, Editor.range(editor, menu.path));
      ReactEditor.focus(editor);

      const data = new DataTransfer();
      ReactEditor.setFragmentData(editor, data, 'copy');
      await writeFormattedData(data);
    } catch (error) {
      console.error('링크 복사 실패', error);
      alert('링크 복사에 실패했습니다.');
    } finally {
      restoreSelection(previousSelection);
      setMenu(null);
    }
  };

  const deleteLink = () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    const parentPath = Path.parent(menu.path);
    let beforeRef: ReturnType<typeof Editor.pointRef> | null = null;
    let afterRef: ReturnType<typeof Editor.pointRef> | null = null;

    try {
      const before = Editor.before(editor, menu.path);
      const after = Editor.after(editor, menu.path);

      beforeRef = before
        ? Editor.pointRef(editor, before, { affinity: 'backward' })
        : null;
      afterRef = after
        ? Editor.pointRef(editor, after, { affinity: 'forward' })
        : null;

      Transforms.removeNodes(editor, { at: menu.path });

      const afterPoint = afterRef?.unref() ?? null;
      const beforePoint = beforeRef?.unref() ?? null;
      const focusPoint = afterPoint ?? beforePoint;

      if (focusPoint && Editor.hasPath(editor, focusPoint.path)) {
        Transforms.select(editor, focusPoint as Point);
      } else if (Editor.hasPath(editor, parentPath)) {
        Transforms.select(editor, Editor.start(editor, parentPath));
      }

      ReactEditor.focus(editor);
    } catch (error) {
      beforeRef?.unref();
      afterRef?.unref();
      console.error('링크 삭제 실패', error);
    } finally {
      setMenu(null);
    }
  };

  return (
    <>
      {menu && (
        <div
          ref={menuRef}
          className="editor-link-context-menu"
          style={{
            top: menu.y,
            left: menu.x,
          }}
          role="menu"
          aria-label="링크 메뉴"
          onContextMenu={event => event.preventDefault()}
        >
          <LinkMenuItem onClick={openEditModal}>
            링크 수정
          </LinkMenuItem>

          <LinkMenuItem onClick={removeLinkAssignment}>
            링크 해제
          </LinkMenuItem>

          <div className="editor-link-context-divider" />

          <LinkMenuItem onClick={() => void copyLink()}>
            링크 복사
          </LinkMenuItem>

          <LinkMenuItem onClick={deleteLink} danger>
            링크 삭제
          </LinkMenuItem>
        </div>
      )}

      <LinkInputModal
        open={!!editTarget}
        mode="edit"
        defaultValue={editTarget ? [editTarget.url] : []}
        onClose={() => {
          const selection = editTarget?.selection ?? null;
          setEditTarget(null);
          requestAnimationFrame(() => restoreSelection(selection));
        }}
        onSubmit={(items) => {
          const url = String(items[0]?.url ?? '').trim();
          if (!editTarget || !url || !hasPath(editTarget.path)) return;

          try {
            const node = SlateNode.get(editor, editTarget.path);
            if (!isLinkElement(node)) return;

            Transforms.setNodes(
              editor,
              { url } as Partial<LinkElement>,
              { at: editTarget.path },
            );
          } catch (error) {
            console.error('링크 수정 실패', error);
          }
        }}
      />
    </>
  );
}

function LinkMenuItem({
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
        'editor-link-context-item',
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

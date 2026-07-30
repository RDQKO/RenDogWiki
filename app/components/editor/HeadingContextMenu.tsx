// =============================================
// File: app/components/editor/HeadingContextMenu.tsx
// =============================================
/**
 * 에디터 헤딩 컨텍스트 메뉴
 * - 헤딩 단계를 H1/H2/H3으로 변경
 * - 기존 이미지 선택 모달로 헤딩 이미지 교체
 * - 헤딩 안의 텍스트 서식만 제거
 * - 헤딩 블록 전체를 Slate 속성과 함께 복사
 * - 헤딩 블록 전체 삭제
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Editor,
  Element as SlateElement,
  Node as SlateNode,
  Path,
  Text,
  Transforms,
  type BaseRange,
} from 'slate';
import { ReactEditor } from 'slate-react';

import ImageSelectModal from '@/components/image/ImageSelectModal';

type Props = {
  editor: Editor & ReactEditor;
};

type HeadingType =
  | 'heading-one'
  | 'heading-two'
  | 'heading-three';

type MenuState = {
  x: number;
  y: number;
  path: Path;
  type: HeadingType;
  selection: BaseRange | null;
};

type ImageTarget = {
  path: Path;
  selection: BaseRange | null;
};

const HEADING_TYPES: Array<{
  label: string;
  value: HeadingType;
}> = [
  { label: 'H1', value: 'heading-one' },
  { label: 'H2', value: 'heading-two' },
  { label: 'H3', value: 'heading-three' },
];

const TEXT_MARKS = [
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'color',
  'backgroundColor',
  'fontSize',
  'fontFamily',
];

const MENU_WIDTH = 224;
const MENU_HEIGHT = 248;
const VIEWPORT_GAP = 8;

function isHeadingType(value: unknown): value is HeadingType {
  return (
    value === 'heading-one' ||
    value === 'heading-two' ||
    value === 'heading-three'
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
      clipboardData['text/html'] = new Blob([html], { type: 'text/html' });
    }

    await navigator.clipboard.write([
      new ClipboardItemConstructor(clipboardData),
    ]);
    return;
  }

  throw new Error('formatted clipboard copy failed');
}

export default function HeadingContextMenu({ editor }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [imageTarget, setImageTarget] = useState<ImageTarget | null>(null);
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
        // 메뉴 동작 중 문서 구조가 바뀌어 기존 selection이 사라진 경우는 무시한다.
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
        return;
      }

      if (
        targetElement?.closest(
          '[data-wiki-inline="link"][data-wiki-mode="edit"]',
        )
      ) {
        setMenu(null);
        return;
      }

      const headingElement = targetElement?.closest<HTMLElement>(
        '[data-rdwiki-heading="true"][data-wiki-mode="edit"]',
      );
      const editable = headingElement?.closest('.editor-slate-content');

      if (!headingElement || !editable) {
        setMenu(null);
        return;
      }

      try {
        const node = ReactEditor.toSlateNode(editor, headingElement);
        const nodeType = SlateElement.isElement(node)
          ? (node as { type?: unknown }).type
          : null;

        if (
          !SlateElement.isElement(node) ||
          !isHeadingType(nodeType)
        ) {
          setMenu(null);
          return;
        }

        const path = ReactEditor.findPath(editor, node);
        const position = resolveMenuPosition(event.clientX, event.clientY);

        event.preventDefault();
        event.stopPropagation();

        setMenu({
          ...position,
          path: clonePath(path),
          type: nodeType,
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

  const changeHeadingType = (type: HeadingType) => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    try {
      Transforms.setNodes(
        editor,
        { type } as any,
        { at: menu.path },
      );
      restoreSelection(menu.selection);
    } catch (error) {
      console.error('헤딩 단계 변경 실패', error);
    } finally {
      setMenu(null);
    }
  };

  const openImageModal = () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    setImageTarget({
      path: clonePath(menu.path),
      selection: cloneRange(menu.selection),
    });
    setMenu(null);
  };

  const clearFormatting = () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    try {
      Transforms.unsetNodes(editor, TEXT_MARKS, {
        at: menu.path,
        match: Text.isText,
      });
      restoreSelection(menu.selection);
    } catch (error) {
      console.error('헤딩 텍스트 속성 제거 실패', error);
    } finally {
      setMenu(null);
    }
  };

  const copyHeading = async () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    const previousSelection = cloneRange(menu.selection);

    try {
      const node = SlateNode.get(editor, menu.path);
      if (
        !SlateElement.isElement(node) ||
        !isHeadingType((node as { type?: unknown }).type)
      ) {
        setMenu(null);
        return;
      }

      Transforms.select(editor, Editor.range(editor, menu.path));
      ReactEditor.focus(editor);

      const data = new DataTransfer();
      ReactEditor.setFragmentData(editor, data, 'copy');
      await writeFormattedData(data);
    } catch (error) {
      console.error('헤딩 복사 실패', error);
      alert('헤딩 복사에 실패했습니다.');
    } finally {
      restoreSelection(previousSelection);
      setMenu(null);
    }
  };

  const deleteHeading = () => {
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
      console.error('헤딩 삭제 실패', error);
    } finally {
      setMenu(null);
    }
  };

  return (
    <>
      {menu && (
        <div
          ref={menuRef}
          className="editor-heading-context-menu"
          style={{
            top: menu.y,
            left: menu.x,
          }}
          role="menu"
          aria-label="헤딩 메뉴"
          onContextMenu={event => event.preventDefault()}
        >
          <div className="editor-heading-context-label">
            제목 단계
          </div>

          <div
            className="editor-heading-context-levels"
            role="group"
            aria-label="제목 단계 변경"
          >
            {HEADING_TYPES.map(option => (
              <button
                key={option.value}
                type="button"
                className={[
                  'editor-heading-context-level',
                  menu.type === option.value ? 'is-active' : '',
                ].filter(Boolean).join(' ')}
                onMouseDown={event => event.preventDefault()}
                onClick={() => changeHeadingType(option.value)}
                role="menuitemradio"
                aria-checked={menu.type === option.value}
                title={`${option.label}으로 변경`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="editor-heading-context-divider" />

          <HeadingMenuItem onClick={openImageModal}>
            이미지 변경
          </HeadingMenuItem>

          <HeadingMenuItem onClick={clearFormatting} danger>
            서식 제거
          </HeadingMenuItem>

          <div className="editor-heading-context-divider" />

          <HeadingMenuItem onClick={() => void copyHeading()}>
            헤딩 복사
          </HeadingMenuItem>

          <div className="editor-heading-context-divider" />

          <HeadingMenuItem onClick={deleteHeading} danger>
            헤딩 삭제
          </HeadingMenuItem>
        </div>
      )}

      <ImageSelectModal
        open={!!imageTarget}
        onClose={() => {
          const selection = imageTarget?.selection ?? null;
          setImageTarget(null);
          requestAnimationFrame(() => restoreSelection(selection));
        }}
        onSelectImage={(url) => {
          if (imageTarget && hasPath(imageTarget.path)) {
            try {
              Transforms.setNodes(
                editor,
                { icon: url } as any,
                { at: imageTarget.path },
              );
            } catch (error) {
              console.error('헤딩 이미지 변경 실패', error);
            }
          }
        }}
      />
    </>
  );
}

function HeadingMenuItem({
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
        'editor-heading-context-item',
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

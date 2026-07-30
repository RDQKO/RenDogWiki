// =============================================
// File: app/components/editor/ImageContextMenu.tsx
// =============================================
/**
 * 에디터 이미지 컨텍스트 메뉴
 * - 블록 이미지: 복사, 다음 빈 문단 생성, 좌/중앙/우 정렬, 삭제
 * - 인라인 이미지: 복사, 삭제
 */

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
  type BaseRange,
} from 'slate';
import { ReactEditor } from 'slate-react';

import type {
  ImageElement,
  InlineImageElement,
} from '@/types/slate';

type Props = {
  editor: Editor & ReactEditor;
};

type ImageKind =
  | 'block'
  | 'inline';

type ImageAlignment =
  | 'left'
  | 'center'
  | 'right';

type MenuState = {
  x: number;
  y: number;
  kind: ImageKind;
  path: Path;
  selection: BaseRange | null;
};

const MENU_WIDTH = 224;
const BLOCK_MENU_HEIGHT = 260;
const INLINE_MENU_HEIGHT = 92;
const VIEWPORT_GAP = 8;

function clonePath(path: Path): Path {
  return [...path];
}

function cloneRange(
  range: BaseRange | null,
): BaseRange | null {
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

function cloneNode<T>(node: T): T {
  return JSON.parse(
    JSON.stringify(node),
  ) as T;
}

function clamp(
  value: number,
  min: number,
  max: number,
) {
  return Math.max(
    min,
    Math.min(value, max),
  );
}

function resolveMenuPosition(
  x: number,
  y: number,
  kind: ImageKind,
) {
  const menuHeight =
    kind === 'block'
      ? BLOCK_MENU_HEIGHT
      : INLINE_MENU_HEIGHT;
  const maxX = Math.max(
    VIEWPORT_GAP,
    window.innerWidth -
      MENU_WIDTH -
      VIEWPORT_GAP,
  );
  const maxY = Math.max(
    VIEWPORT_GAP,
    window.innerHeight -
      menuHeight -
      VIEWPORT_GAP,
  );

  return {
    x: clamp(
      x,
      VIEWPORT_GAP,
      maxX,
    ),
    y: clamp(
      y,
      VIEWPORT_GAP,
      maxY,
    ),
  };
}

function isBlockImageElement(
  node: SlateNode,
): node is ImageElement {
  return (
    SlateElement.isElement(node) &&
    (node as { type?: unknown }).type ===
      'image'
  );
}

function isInlineImageElement(
  node: SlateNode,
): node is InlineImageElement {
  return (
    SlateElement.isElement(node) &&
    (node as { type?: unknown }).type ===
      'inline-image'
  );
}

function isImageForKind(
  node: SlateNode,
  kind: ImageKind,
) {
  return kind === 'block'
    ? isBlockImageElement(node)
    : isInlineImageElement(node);
}

function getImageUrl(
  node:
    | ImageElement
    | InlineImageElement,
) {
  return String(
    (node as {
      url?: unknown;
      src?: unknown;
    }).url ??
      (node as any).src ??
      '',
  ).trim();
}

function encodeSlateFragment(
  fragment: Array<
    ImageElement | InlineImageElement
  >,
) {
  return window.btoa(
    encodeURIComponent(
      JSON.stringify(fragment),
    ),
  );
}

function escapeHtml(
  value: string,
) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createImageHtml(
  node:
    | ImageElement
    | InlineImageElement,
) {
  const url = getImageUrl(node);
  const width =
    typeof (node as ImageElement).width ===
      'number'
      ? ` width="${(node as ImageElement).width}"`
      : '';
  const height =
    typeof (node as ImageElement).height ===
      'number'
      ? ` height="${(node as ImageElement).height}"`
      : '';

  return `<img src="${escapeHtml(url)}" alt=""${width}${height}>`;
}

async function writeFormattedData(
  data: DataTransfer,
) {
  let copiedByEvent = false;

  const onCopy = (
    event: ClipboardEvent,
  ) => {
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
      const value =
        data.getData(type);
      if (!value) continue;

      try {
        event.clipboardData.setData(
          type,
          value,
        );
      } catch {
        // 사용자 정의 MIME을 지원하지 않아도 HTML/URL 복사는 유지한다.
      }
    }

    copiedByEvent = true;
  };

  document.addEventListener(
    'copy',
    onCopy,
    true,
  );

  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener(
      'copy',
      onCopy,
      true,
    );
  }

  if (copiedByEvent) return;

  const ClipboardItemConstructor =
    window.ClipboardItem;

  if (
    navigator.clipboard?.write &&
    ClipboardItemConstructor
  ) {
    const plain =
      data.getData('text/plain');
    const html =
      data.getData('text/html');
    const clipboardData: Record<
      string,
      Blob
    > = {
      'text/plain': new Blob(
        [plain],
        {
          type: 'text/plain',
        },
      ),
    };

    if (html) {
      clipboardData['text/html'] =
        new Blob([html], {
          type: 'text/html',
        });
    }

    await navigator.clipboard.write([
      new ClipboardItemConstructor(
        clipboardData,
      ),
    ]);
    return;
  }

  throw new Error(
    'formatted clipboard copy failed',
  );
}

export default function ImageContextMenu({
  editor,
}: Props) {
  const [menu, setMenu] =
    useState<MenuState | null>(null);
  const menuRef =
    useRef<HTMLDivElement>(null);

  const hasPath = useCallback(
    (path: Path) => {
      try {
        return Editor.hasPath(
          editor,
          path,
        );
      } catch {
        return false;
      }
    },
    [editor],
  );

  const restoreSelection = useCallback(
    (
      selection: BaseRange | null,
    ) => {
      try {
        if (!selection) {
          Transforms.deselect(editor);
          return;
        }

        if (
          !ReactEditor.hasRange(
            editor,
            selection,
          )
        ) {
          return;
        }

        Transforms.select(
          editor,
          selection,
        );
        ReactEditor.focus(editor);
      } catch {
        // 메뉴 동작 중 선택 범위가 사라진 경우는 무시한다.
      }
    },
    [editor],
  );

  useEffect(() => {
    const onOpen = (
      event: Event,
    ) => {
      const detail = (
        event as CustomEvent<{
          x?: unknown;
          y?: unknown;
          path?: unknown;
          kind?: unknown;
        }>
      ).detail;

      if (
        typeof detail?.x !==
          'number' ||
        typeof detail?.y !==
          'number' ||
        !Array.isArray(detail?.path) ||
        (detail?.kind !== 'block' &&
          detail?.kind !== 'inline')
      ) {
        return;
      }

      const path =
        detail.path as Path;
      const kind =
        detail.kind as ImageKind;

      try {
        if (
          !Editor.hasPath(
            editor,
            path,
          )
        ) {
          setMenu(null);
          return;
        }

        const node = SlateNode.get(
          editor,
          path,
        );

        if (
          !isImageForKind(
            node,
            kind,
          )
        ) {
          setMenu(null);
          return;
        }

        const position =
          resolveMenuPosition(
            detail.x,
            detail.y,
            kind,
          );

        setMenu({
          ...position,
          kind,
          path: clonePath(path),
          selection: cloneRange(
            editor.selection,
          ),
        });
      } catch {
        setMenu(null);
      }
    };

    window.addEventListener(
      'editor:image-menu',
      onOpen,
    );

    return () => {
      window.removeEventListener(
        'editor:image-menu',
        onOpen,
      );
    };
  }, [editor]);

  useEffect(() => {
    if (!menu) return;

    const closeOnPointerDown = (
      event: MouseEvent,
    ) => {
      const targetElement =
        event.target instanceof Element
          ? event.target
          : event.target instanceof Node
            ? event.target.parentElement
            : null;

      if (
        targetElement &&
        menuRef.current?.contains(
          targetElement,
        )
      ) {
        return;
      }

      setMenu(null);
    };

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        setMenu(null);
      }
    };

    const close = () => {
      setMenu(null);
    };

    window.addEventListener(
      'mousedown',
      closeOnPointerDown,
      true,
    );
    window.addEventListener(
      'wheel',
      close,
      { passive: true },
    );
    window.addEventListener(
      'resize',
      close,
    );
    window.addEventListener(
      'keydown',
      closeOnEscape,
    );

    return () => {
      window.removeEventListener(
        'mousedown',
        closeOnPointerDown,
        true,
      );
      window.removeEventListener(
        'wheel',
        close,
      );
      window.removeEventListener(
        'resize',
        close,
      );
      window.removeEventListener(
        'keydown',
        closeOnEscape,
      );
    };
  }, [menu]);

  const copyImage = async () => {
    if (
      !menu ||
      !hasPath(menu.path)
    ) {
      setMenu(null);
      return;
    }

    try {
      const node = SlateNode.get(
        editor,
        menu.path,
      );

      if (
        !isImageForKind(
          node,
          menu.kind,
        )
      ) {
        setMenu(null);
        return;
      }

      const copiedNode = cloneNode(
        node as
          | ImageElement
          | InlineImageElement,
      );
      const encoded =
        encodeSlateFragment([
          copiedNode,
        ]);
      const url =
        getImageUrl(copiedNode);
      const data =
        new DataTransfer();

      data.setData(
        'application/x-slate-fragment',
        encoded,
      );
      data.setData(
        'text/x-slate-fragment',
        encoded,
      );
      data.setData(
        'text/plain',
        url,
      );
      data.setData(
        'text/html',
        `<span data-slate-fragment="${encoded}">${createImageHtml(
          copiedNode,
        )}</span>`,
      );

      await writeFormattedData(data);
      restoreSelection(
        menu.selection,
      );
    } catch (error) {
      console.error(
        '사진 복사 실패',
        error,
      );
      alert(
        '사진 복사에 실패했습니다.',
      );
    } finally {
      setMenu(null);
    }
  };

  const insertParagraphAfterImage =
    () => {
      if (
        !menu ||
        menu.kind !== 'block' ||
        !hasPath(menu.path)
      ) {
        setMenu(null);
        return;
      }

      const targetPath =
        clonePath(menu.path);

      try {
        const node = SlateNode.get(
          editor,
          targetPath,
        );

        if (
          !isBlockImageElement(node)
        ) {
          return;
        }

        const insertPath =
          Path.next(targetPath);

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
          Editor.start(
            editor,
            insertPath,
          ),
        );
        ReactEditor.focus(editor);
      } catch (error) {
        console.error(
          '사진 아래 빈 문단 생성 실패',
          error,
        );
      } finally {
        setMenu(null);
      }
    };

  const alignImage = (
    textAlign: ImageAlignment,
  ) => {
    if (
      !menu ||
      menu.kind !== 'block' ||
      !hasPath(menu.path)
    ) {
      setMenu(null);
      return;
    }

    try {
      const node = SlateNode.get(
        editor,
        menu.path,
      );

      if (
        !isBlockImageElement(node)
      ) {
        return;
      }

      Transforms.setNodes(
        editor,
        { textAlign },
        { at: menu.path },
      );
      restoreSelection(
        menu.selection,
      );
    } catch (error) {
      console.error(
        '사진 정렬 변경 실패',
        error,
      );
    } finally {
      setMenu(null);
    }
  };

  const deleteBlockImage = (
    targetPath: Path,
  ) => {
    Editor.withoutNormalizing(
      editor,
      () => {
        Transforms.removeNodes(
          editor,
          { at: targetPath },
        );

        if (
          editor.children.length ===
          0
        ) {
          Transforms.insertNodes(
            editor,
            {
              type: 'paragraph',
              children: [{ text: '' }],
            } as any,
            { at: [0] },
          );
        }
      },
    );

    const nextPath = hasPath(
      targetPath,
    )
      ? targetPath
      : null;
    const previousPath =
      targetPath[
        targetPath.length - 1
      ] > 0
        ? Path.previous(targetPath)
        : null;
    const focusPath =
      nextPath ??
      (previousPath &&
      hasPath(previousPath)
        ? previousPath
        : []);

    Transforms.select(
      editor,
      Editor.start(
        editor,
        focusPath,
      ),
    );
    ReactEditor.focus(editor);
  };

  const deleteInlineImage = (
    targetPath: Path,
  ) => {
    const parentPath =
      Path.parent(targetPath);
    const parentRef =
      Editor.pathRef(
        editor,
        parentPath,
      );

    try {
      Transforms.removeNodes(
        editor,
        { at: targetPath },
      );

      const nextParentPath =
        parentRef.current;

      if (
        nextParentPath &&
        hasPath(nextParentPath)
      ) {
        Transforms.select(
          editor,
          Editor.end(
            editor,
            nextParentPath,
          ),
        );
      }

      ReactEditor.focus(editor);
    } finally {
      parentRef.unref();
    }
  };

  const deleteImage = () => {
    if (
      !menu ||
      !hasPath(menu.path)
    ) {
      setMenu(null);
      return;
    }

    const targetPath =
      clonePath(menu.path);

    try {
      const node = SlateNode.get(
        editor,
        targetPath,
      );

      if (
        !isImageForKind(
          node,
          menu.kind,
        )
      ) {
        return;
      }

      if (menu.kind === 'block') {
        deleteBlockImage(
          targetPath,
        );
      } else {
        deleteInlineImage(
          targetPath,
        );
      }
    } catch (error) {
      console.error(
        '사진 삭제 실패',
        error,
      );
    } finally {
      setMenu(null);
    }
  };

  if (!menu) return null;

  return (
    <div
      ref={menuRef}
      className="editor-image-context-menu"
      style={{
        top: menu.y,
        left: menu.x,
      }}
      role="menu"
      aria-label={
        menu.kind === 'block'
          ? '사진 메뉴'
          : '인라인 이미지 메뉴'
      }
      onContextMenu={event =>
        event.preventDefault()
      }
    >
      <ImageMenuItem
        onClick={() =>
          void copyImage()
        }
      >
        사진 복사
      </ImageMenuItem>

      {menu.kind === 'block' ? (
        <>
          <ImageMenuItem
            onClick={
              insertParagraphAfterImage
            }
          >
            아래에 빈 문단 생성
          </ImageMenuItem>

          <div className="editor-image-context-divider" />

          <ImageMenuItem
            onClick={() =>
              alignImage('left')
            }
          >
            좌측 정렬
          </ImageMenuItem>

          <ImageMenuItem
            onClick={() =>
              alignImage('center')
            }
          >
            가운데 정렬
          </ImageMenuItem>

          <ImageMenuItem
            onClick={() =>
              alignImage('right')
            }
          >
            우측 정렬
          </ImageMenuItem>

          <div className="editor-image-context-divider" />
        </>
      ) : (
        <div className="editor-image-context-divider" />
      )}

      <ImageMenuItem
        onClick={deleteImage}
        danger
      >
        사진 삭제
      </ImageMenuItem>
    </div>
  );
}

function ImageMenuItem({
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
        'editor-image-context-item',
        danger ? 'is-danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={event =>
        event.preventDefault()
      }
      onClick={onClick}
      role="menuitem"
    >
      {children}
    </button>
  );
}

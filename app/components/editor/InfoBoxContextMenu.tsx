// =============================================
// File: app/components/editor/InfoBoxContextMenu.tsx
// =============================================
/**
 * 에디터 정보박스 컨텍스트 메뉴
 * - 정보박스 블록 전체를 Slate 속성과 내부 서식까지 포함해 복사
 * - 정보박스 내용은 유지한 채 종류와 아이콘 속성 변경
 * - 정보박스 바로 다음 위치에 빈 일반 문단 생성
 * - 우클릭한 정보박스 블록 하나 삭제
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
  InfoBoxElement,
  InfoBoxType,
} from '@/types/slate';

type Props = {
  editor: Editor & ReactEditor;
};

type MenuState = {
  x: number;
  y: number;
  path: Path;
  boxType: InfoBoxType;
  selection: BaseRange | null;
};

const INFO_BOX_TYPES: Array<{
  label: string;
  value: InfoBoxType;
}> = [
  { label: '정보', value: 'info' },
  { label: '주의', value: 'warning' },
  { label: '경고', value: 'danger' },
  { label: '하양', value: 'white' },
  { label: '노랑', value: 'yellow' },
  { label: '연두', value: 'lime' },
  { label: '연분홍', value: 'pink' },
  { label: '빨강', value: 'red' },
];

const MENU_WIDTH = 224;
const MENU_HEIGHT = 166;
const TYPE_MENU_WIDTH = 168;
const TYPE_MENU_HEIGHT = 284;
const TYPE_MENU_GAP = 6;
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
  return Math.max(min, Math.min(value, max));
}

function resolveMenuPosition(
  x: number,
  y: number,
) {
  const maxX = Math.max(
    VIEWPORT_GAP,
    window.innerWidth -
      MENU_WIDTH -
      VIEWPORT_GAP,
  );
  const maxY = Math.max(
    VIEWPORT_GAP,
    window.innerHeight -
      MENU_HEIGHT -
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

function resolveTypeMenuPosition(
  menu: MenuState,
) {
  const rightX =
    menu.x +
    MENU_WIDTH +
    TYPE_MENU_GAP;
  const canOpenRight =
    rightX +
      TYPE_MENU_WIDTH +
      VIEWPORT_GAP <=
    window.innerWidth;

  const leftX =
    menu.x -
    TYPE_MENU_WIDTH -
    TYPE_MENU_GAP;

  return {
    x: canOpenRight
      ? rightX
      : Math.max(
          VIEWPORT_GAP,
          leftX,
        ),
    y: clamp(
      menu.y,
      VIEWPORT_GAP,
      Math.max(
        VIEWPORT_GAP,
        window.innerHeight -
          TYPE_MENU_HEIGHT -
          VIEWPORT_GAP,
      ),
    ),
  };
}

function isInfoBoxElement(
  node: SlateNode,
): node is InfoBoxElement {
  return (
    SlateElement.isElement(node) &&
    (node as { type?: unknown }).type ===
      'info-box'
  );
}

function normalizeInfoBoxType(
  node: InfoBoxElement,
): InfoBoxType {
  const raw = String(
    (node as InfoBoxElement & {
      variant?: unknown;
      tone?: unknown;
      infoType?: unknown;
    }).boxType ??
      (node as any).variant ??
      (node as any).tone ??
      (node as any).infoType ??
      'info',
  )
    .toLowerCase()
    .trim();

  const aliases: Record<
    string,
    InfoBoxType
  > = {
    note: 'info',
    warn: 'warning',
    error: 'danger',
    하양: 'white',
    흰색: 'white',
    노랑: 'yellow',
    노란: 'yellow',
    green: 'lime',
    lightgreen: 'lime',
    mint: 'lime',
    연두: 'lime',
    lightpink: 'pink',
    rose: 'pink',
    연분홍: 'pink',
    crimson: 'red',
    빨강: 'red',
    빨간: 'red',
  };
  const normalized = aliases[raw] ?? raw;

  return INFO_BOX_TYPES.some(
    option => option.value === normalized,
  )
    ? (normalized as InfoBoxType)
    : 'info';
}

function isColorBox(
  boxType: InfoBoxType,
) {
  return (
    boxType === 'white' ||
    boxType === 'yellow' ||
    boxType === 'lime' ||
    boxType === 'pink' ||
    boxType === 'red'
  );
}

function getInfoBoxIcon(
  boxType: InfoBoxType,
) {
  if (isColorBox(boxType)) return '';

  if (boxType === 'info') return 'ℹ️';
  if (boxType === 'warning') return '⚠️';
  return '❗';
}

function encodeSlateFragment(
  fragment: InfoBoxElement[],
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
      const value = data.getData(type);
      if (!value) continue;

      try {
        event.clipboardData.setData(
          type,
          value,
        );
      } catch {
        // 사용자 정의 MIME을 거부하는 브라우저에서도 HTML/텍스트 복사는 유지한다.
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

export default function InfoBoxContextMenu({
  editor,
}: Props) {
  const [menu, setMenu] =
    useState<MenuState | null>(null);
  const [
    typeMenuOpen,
    setTypeMenuOpen,
  ] = useState(false);
  const menuRef =
    useRef<HTMLDivElement>(null);
  const typeMenuRef =
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
        // 메뉴 동작 중 기존 선택 영역이 사라진 경우는 무시한다.
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
        typeof detail?.x !==
          'number' ||
        typeof detail?.y !==
          'number' ||
        !Array.isArray(detail?.path)
      ) {
        return;
      }

      const path =
        detail.path as Path;

      try {
        if (
          !Editor.hasPath(
            editor,
            path,
          )
        ) {
          setMenu(null);
          setTypeMenuOpen(false);
          return;
        }

        const node = SlateNode.get(
          editor,
          path,
        );

        if (!isInfoBoxElement(node)) {
          setMenu(null);
          setTypeMenuOpen(false);
          return;
        }

        const position =
          resolveMenuPosition(
            detail.x,
            detail.y,
          );

        setMenu({
          ...position,
          path: clonePath(path),
          boxType:
            normalizeInfoBoxType(node),
          selection: cloneRange(
            editor.selection,
          ),
        });
        setTypeMenuOpen(false);
      } catch {
        setMenu(null);
        setTypeMenuOpen(false);
      }
    };

    window.addEventListener(
      'editor:info-box-menu',
      onOpen,
    );

    return () => {
      window.removeEventListener(
        'editor:info-box-menu',
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
            ? event.target
                .parentElement
            : null;

      if (
        targetElement &&
        (menuRef.current?.contains(
          targetElement,
        ) ||
          typeMenuRef.current?.contains(
            targetElement,
          ))
      ) {
        return;
      }

      setMenu(null);
      setTypeMenuOpen(false);
    };

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key !== 'Escape') {
        return;
      }

      if (typeMenuOpen) {
        setTypeMenuOpen(false);
        return;
      }

      setMenu(null);
    };

    const close = () => {
      setMenu(null);
      setTypeMenuOpen(false);
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
  }, [menu, typeMenuOpen]);

  const copyInfoBox = async () => {
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

      if (!isInfoBoxElement(node)) {
        setMenu(null);
        return;
      }

      const copiedNode =
        cloneNode(node);
      const plainText =
        SlateNode.string(node);
      const encoded =
        encodeSlateFragment([
          copiedNode,
        ]);
      const data = new DataTransfer();

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
        plainText,
      );
      data.setData(
        'text/html',
        `<div data-slate-fragment="${encoded}">${
          plainText
            ? escapeHtml(plainText)
            : '<br>'
        }</div>`,
      );

      await writeFormattedData(data);
    } catch (error) {
      console.error(
        '정보박스 복사 실패',
        error,
      );
      alert(
        '정보박스 복사에 실패했습니다.',
      );
    } finally {
      setMenu(null);
      setTypeMenuOpen(false);
    }
  };

  const changeInfoBoxType = (
    boxType: InfoBoxType,
  ) => {
    if (
      !menu ||
      !hasPath(menu.path)
    ) {
      setMenu(null);
      setTypeMenuOpen(false);
      return;
    }

    try {
      const node = SlateNode.get(
        editor,
        menu.path,
      );

      if (!isInfoBoxElement(node)) {
        return;
      }

      Transforms.setNodes(
        editor,
        {
          boxType,
          icon:
            getInfoBoxIcon(
              boxType,
            ),
          noIcon:
            isColorBox(boxType),
        } as Partial<InfoBoxElement>,
        { at: menu.path },
      );
      restoreSelection(
        menu.selection,
      );
    } catch (error) {
      console.error(
        '정보박스 종류 변경 실패',
        error,
      );
    } finally {
      setMenu(null);
      setTypeMenuOpen(false);
    }
  };

  const insertParagraphAfterInfoBox =
    () => {
      if (
        !menu ||
        !hasPath(menu.path)
      ) {
        setMenu(null);
        setTypeMenuOpen(false);
        return;
      }

      const targetPath = clonePath(
        menu.path,
      );

      try {
        const node = SlateNode.get(
          editor,
          targetPath,
        );

        if (!isInfoBoxElement(node)) {
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
          '정보박스 다음 빈 문단 생성 실패',
          error,
        );
      } finally {
        setMenu(null);
        setTypeMenuOpen(false);
      }
    };

  const deleteInfoBox = () => {
    if (
      !menu ||
      !hasPath(menu.path)
    ) {
      setMenu(null);
      return;
    }

    const targetPath = clonePath(
      menu.path,
    );

    try {
      Editor.withoutNormalizing(
        editor,
        () => {
          Transforms.removeNodes(
            editor,
            {
              at: targetPath,
            },
          );

          if (
            editor.children.length ===
            0
          ) {
            Transforms.insertNodes(
              editor,
              {
                type: 'paragraph',
                children: [
                  { text: '' },
                ],
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
          ? Path.previous(
              targetPath,
            )
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
    } catch (error) {
      console.error(
        '정보박스 삭제 실패',
        error,
      );
    } finally {
      setMenu(null);
      setTypeMenuOpen(false);
    }
  };

  if (!menu) return null;

  const typeMenuPosition =
    resolveTypeMenuPosition(menu);

  return (
    <>
      <div
        ref={menuRef}
        className="editor-info-box-context-menu"
        style={{
          top: menu.y,
          left: menu.x,
        }}
        role="menu"
        aria-label="정보박스 메뉴"
        onContextMenu={event =>
          event.preventDefault()
        }
      >
        <InfoBoxMenuItem
          onClick={() =>
            void copyInfoBox()
          }
        >
          정보 박스 복사
        </InfoBoxMenuItem>

        <InfoBoxMenuItem
          onClick={() =>
            setTypeMenuOpen(
              open => !open,
            )
          }
          ariaHasPopup
          ariaExpanded={
            typeMenuOpen
          }
        >
          <span>
            정보 박스 종류 변경
          </span>
          <span
            aria-hidden
            className="editor-info-box-context-arrow"
          >
            ›
          </span>
        </InfoBoxMenuItem>

        <InfoBoxMenuItem
          onClick={
            insertParagraphAfterInfoBox
          }
        >
          박스 다음에 빈 문단 생성
        </InfoBoxMenuItem>

        <div className="editor-info-box-context-divider" />

        <InfoBoxMenuItem
          onClick={deleteInfoBox}
          danger
        >
          정보 박스 삭제
        </InfoBoxMenuItem>
      </div>

      {typeMenuOpen && (
        <div
          ref={typeMenuRef}
          className="editor-info-box-context-submenu"
          style={{
            top: typeMenuPosition.y,
            left: typeMenuPosition.x,
          }}
          role="menu"
          aria-label="정보박스 종류 변경"
          onContextMenu={event =>
            event.preventDefault()
          }
        >
          {INFO_BOX_TYPES.map(
            option => (
              <button
                key={option.value}
                type="button"
                className={[
                  'editor-info-box-context-type',
                  menu.boxType ===
                  option.value
                    ? 'is-active'
                    : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onMouseDown={event =>
                  event.preventDefault()
                }
                onClick={() =>
                  changeInfoBoxType(
                    option.value,
                  )
                }
                role="menuitemradio"
                aria-checked={
                  menu.boxType ===
                  option.value
                }
              >
                <span>
                  {option.label}
                </span>
                {menu.boxType ===
                option.value ? (
                  <span aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}

function InfoBoxMenuItem({
  children,
  onClick,
  danger = false,
  ariaHasPopup = false,
  ariaExpanded,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  ariaHasPopup?: boolean;
  ariaExpanded?: boolean;
}) {
  return (
    <button
      type="button"
      className={[
        'editor-info-box-context-item',
        danger ? 'is-danger' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseDown={event =>
        event.preventDefault()
      }
      onClick={onClick}
      role="menuitem"
      aria-haspopup={
        ariaHasPopup
          ? 'menu'
          : undefined
      }
      aria-expanded={
        ariaHasPopup
          ? ariaExpanded
          : undefined
      }
    >
      {children}
    </button>
  );
}

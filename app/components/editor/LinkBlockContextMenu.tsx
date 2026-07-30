// =============================================
// File: app/components/editor/LinkBlockContextMenu.tsx
// =============================================
/**
 * 에디터 링크카드 컨텍스트 메뉴
 * - 우클릭한 카드 한 개의 링크 주소 수정
 * - 카드 한 개 또는 같은 행의 카드 전체 삭제
 * - 카드 한 개를 독립된 전체 폭 블록으로 복사
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Editor,
  Node as SlateNode,
  Path,
  Transforms,
  type BaseRange,
} from 'slate';
import { ReactEditor } from 'slate-react';

import type { LinkBlockElement } from '@/types/slate';
import {
  decodeTitleFromUrlParam,
  isInternalWikiHref,
  parseLinkUrl,
} from '@/components/wiki-render/link/linkUtils';

import LinkInputModal from './LinkInputModal';
import {
  deleteLinkBlockAt,
  getLinkBlockGroup,
  isLinkBlockElement,
} from './render/link/linkBlockActions';

type Props = {
  editor: Editor & ReactEditor;
};

type MenuState = {
  x: number;
  y: number;
  path: Path;
  url: string;
  cardCount: number;
  selection: BaseRange | null;
};

type EditTarget = {
  path: Path;
  url: string;
  selection: BaseRange | null;
};

const MENU_WIDTH = 224;
const MENU_HEIGHT = 220;
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

function cloneNode<T>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
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

function encodeSlateFragment(fragment: LinkBlockElement[]) {
  return window.btoa(
    encodeURIComponent(JSON.stringify(fragment)),
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

function buildLinkTargetPatch(
  url: string,
): Partial<LinkBlockElement> {
  const parsedUrl = parseLinkUrl(url);
  const internalWiki = isInternalWikiHref(url);

  if (internalWiki) {
    const wikiTitle = decodeTitleFromUrlParam(
      parsedUrl?.searchParams.get('title'),
    );
    const wikiPath =
      parsedUrl?.searchParams.get('path') ?? undefined;

    return {
      url,
      isWiki: true,
      sitename: wikiTitle || 'RenDog Wiki',
      wikiTitle: wikiTitle || undefined,
      wikiPath,
      favicon: null,
    };
  }

  const sitename =
    parsedUrl?.hostname.replace(/^www\./, '') ?? '';
  const favicon = parsedUrl
    ? `${parsedUrl.protocol}//${parsedUrl.hostname}/favicon.ico`
    : null;

  return {
    url,
    isWiki: false,
    sitename,
    favicon,
  };
}

export default function LinkBlockContextMenu({ editor }: Props) {
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

      const cardElement = targetElement?.closest<HTMLElement>(
        '[data-wiki-block="link-block"][data-wiki-mode="edit"]',
      );
      const editable = cardElement?.closest('.editor-slate-content');

      if (!cardElement || !editable) {
        setMenu(null);
        return;
      }

      try {
        const node = ReactEditor.toSlateNode(editor, cardElement);
        if (!isLinkBlockElement(node)) {
          setMenu(null);
          return;
        }

        const path = ReactEditor.findPath(editor, node);
        const group = getLinkBlockGroup(editor, path);
        const position = resolveMenuPosition(
          event.clientX,
          event.clientY,
        );

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        setMenu({
          ...position,
          path: clonePath(path),
          url: String(node.url ?? ''),
          cardCount: group.cardCount,
          selection: cloneRange(editor.selection),
        });
      } catch {
        setMenu(null);
      }
    };

    document.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
    };
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

  const copyLinkBlock = async () => {
    if (!menu || !hasPath(menu.path)) {
      setMenu(null);
      return;
    }

    try {
      const node = SlateNode.get(editor, menu.path);
      if (!isLinkBlockElement(node)) {
        setMenu(null);
        return;
      }

      const copiedNode: LinkBlockElement = {
        ...cloneNode(node),
        size: 'large',
      };
      const plainText =
        SlateNode.string(node).trim() ||
        node.wikiTitle ||
        node.sitename ||
        node.url ||
        '링크';
      const encoded = encodeSlateFragment([copiedNode]);
      const data = new DataTransfer();

      data.setData('application/x-slate-fragment', encoded);
      data.setData('text/x-slate-fragment', encoded);
      data.setData('text/plain', plainText);
      data.setData(
        'text/html',
        `<a href="${escapeHtml(node.url)}">${escapeHtml(plainText)}</a>`,
      );

      await writeFormattedData(data);
    } catch (error) {
      console.error('링크카드 복사 실패', error);
      alert('링크카드 복사에 실패했습니다.');
    } finally {
      setMenu(null);
    }
  };

  const deleteOne = () => {
    if (!menu) return;

    deleteLinkBlockAt(editor, menu.path, 'one');
    setMenu(null);
  };

  const deleteRow = () => {
    if (!menu) return;

    deleteLinkBlockAt(editor, menu.path, 'row');
    setMenu(null);
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
          aria-label="링크카드 메뉴"
          onContextMenu={event => event.preventDefault()}
        >
          <LinkBlockMenuItem onClick={openEditModal}>
            링크 수정
          </LinkBlockMenuItem>

          <LinkBlockMenuItem onClick={() => void copyLinkBlock()}>
            링크블럭 복사
          </LinkBlockMenuItem>

          <div className="editor-link-context-divider" />

          {menu.cardCount > 1 ? (
            <>
              <LinkBlockMenuItem onClick={deleteOne} danger>
                하나 삭제
              </LinkBlockMenuItem>

              <LinkBlockMenuItem onClick={deleteRow} danger>
                모두 삭제
              </LinkBlockMenuItem>
            </>
          ) : (
            <LinkBlockMenuItem onClick={deleteOne} danger>
              삭제
            </LinkBlockMenuItem>
          )}
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
            if (!isLinkBlockElement(node)) return;

            Editor.withoutNormalizing(editor, () => {
              Transforms.unsetNodes(
                editor,
                [
                  'url',
                  'isWiki',
                  'sitename',
                  'favicon',
                  'wikiTitle',
                  'wikiPath',
                  'docIcon',
                ],
                { at: editTarget.path },
              );
              Transforms.setNodes(
                editor,
                buildLinkTargetPatch(url),
                { at: editTarget.path },
              );
            });
          } catch (error) {
            console.error('링크카드 수정 실패', error);
          }
        }}
      />
    </>
  );
}

function LinkBlockMenuItem({
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

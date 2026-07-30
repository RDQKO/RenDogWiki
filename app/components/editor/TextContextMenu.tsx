// =============================================
// File: app/components/editor/TextContextMenu.tsx
// =============================================
/**
 * 에디터 텍스트 선택 컨텍스트 메뉴
 * - 선택된 텍스트의 단일 글자색/배경색을 클립보드에 복사
 * - 선택 범위를 Slate 서식과 함께 복사
 * - 선택된 텍스트의 인라인 서식만 제거
 * - 색상이 없거나 여러 색상이 섞인 경우 해당 색상 복사 비활성화
 */

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Editor,
  Element as SlateElement,
  Path,
  Range as SlateRange,
  Text,
  Transforms,
  type BaseRange,
} from 'slate';
import { ReactEditor } from 'slate-react';
import {
  buildTableRangeClipboardPayload,
  writeTableClipboardData,
} from './helpers/tableClipboard';

type Props = {
  editor: Editor & ReactEditor;
};

type ColorResult =
  | { status: 'uniform'; value: string }
  | { status: 'mixed'; value: null }
  | { status: 'none'; value: null };

type MenuState = {
  x: number;
  y: number;
  selection: BaseRange;
  textColor: ColorResult;
  backgroundColor: ColorResult;
};

type SelectedTextLeaf = Text & {
  color?: unknown;
  backgroundColor?: unknown;
};

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

const MENU_WIDTH = 276;
const MENU_HEIGHT = 194;
const VIEWPORT_GAP = 8;

function cloneRange(range: BaseRange): BaseRange {
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
  const maxX = Math.max(VIEWPORT_GAP, window.innerWidth - MENU_WIDTH - VIEWPORT_GAP);
  const maxY = Math.max(VIEWPORT_GAP, window.innerHeight - MENU_HEIGHT - VIEWPORT_GAP);

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

function isSelectionInsideSlateElement(
  editor: Editor,
  selection: BaseRange,
  element: HTMLElement,
) {
  try {
    const node = ReactEditor.toSlateNode(editor, element);
    if (!SlateElement.isElement(node)) return false;

    const path = ReactEditor.findPath(editor, node);
    return (
      Path.isAncestor(path, selection.anchor.path) &&
      Path.isAncestor(path, selection.focus.path)
    );
  } catch {
    return false;
  }
}

function isSlateElementIncludedInSelection(
  editor: Editor,
  selection: BaseRange,
  element: HTMLElement,
) {
  try {
    const node =
      ReactEditor.toSlateNode(
        editor,
        element,
      );
    if (!SlateElement.isElement(node)) {
      return false;
    }

    const path =
      ReactEditor.findPath(
        editor,
        node,
      );
    const point =
      Editor.start(editor, path);

    return SlateRange.includes(
      selection,
      point,
    );
  } catch {
    return false;
  }
}

function getCaretPointAt(
  documentRef: Document,
  x: number,
  y: number,
): { node: Node; offset: number } | null {
  const documentWithCaret = documentRef as Document & {
    caretRangeFromPoint?: (clientX: number, clientY: number) => globalThis.Range | null;
    caretPositionFromPoint?: (
      clientX: number,
      clientY: number,
    ) => { offsetNode: Node; offset: number } | null;
  };

  const caretRange = documentWithCaret.caretRangeFromPoint?.(x, y);
  if (caretRange) {
    return {
      node: caretRange.startContainer,
      offset: caretRange.startOffset,
    };
  }

  const caretPosition = documentWithCaret.caretPositionFromPoint?.(x, y);
  if (caretPosition) {
    return {
      node: caretPosition.offsetNode,
      offset: caretPosition.offset,
    };
  }

  return null;
}

function isContextPointInsideDomSelection(event: MouseEvent) {
  const targetElement = getEventElement(event.target);
  const editable = targetElement?.closest('.editor-slate-content');
  if (!targetElement || !editable) return false;

  const domSelection = editable.ownerDocument.defaultView?.getSelection();
  if (!domSelection || domSelection.isCollapsed || domSelection.rangeCount === 0) {
    return false;
  }

  const selectedRange = domSelection.getRangeAt(0);
  const caretPoint = getCaretPointAt(
    editable.ownerDocument,
    event.clientX,
    event.clientY,
  );

  if (caretPoint) {
    try {
      return selectedRange.isPointInRange(caretPoint.node, caretPoint.offset);
    } catch {
      // 브라우저가 서로 다른 DOM 트리의 위치 비교를 거부하면 leaf 교차 여부로 판정한다.
    }
  }

  const leafElement = targetElement.closest('[data-wiki-leaf="true"]');
  return !!leafElement && domSelection.containsNode(leafElement, true);
}

function getSelectedTextLeaves(
  editor: Editor,
  selection: BaseRange,
): Array<[SelectedTextLeaf, Path]> {
  const leaves: Array<[SelectedTextLeaf, Path]> = [];

  try {
    const safeRange = Editor.unhangRange(editor, selection);
    const entries = Editor.nodes(editor, {
      at: safeRange,
      match: Text.isText,
      universal: true,
    });

    for (const [node, path] of entries) {
      const intersection = SlateRange.intersection(
        safeRange,
        Editor.range(editor, path),
      );

      if (!intersection || SlateRange.isCollapsed(intersection)) continue;
      leaves.push([node as SelectedTextLeaf, path]);
    }
  } catch {
    return [];
  }

  return leaves;
}

function normalizeColorForComparison(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return '';

  if (typeof document === 'undefined') return trimmed.toLowerCase();

  const probe = document.createElement('span');
  probe.style.color = '';
  probe.style.color = trimmed;

  return (probe.style.color || trimmed)
    .toLowerCase()
    .replace(/\s+/g, '');
}

function inspectColor(
  leaves: Array<[SelectedTextLeaf, Path]>,
  key: 'color' | 'backgroundColor',
): ColorResult {
  if (leaves.length === 0) {
    return { status: 'none', value: null };
  }

  const values = leaves.map(([leaf]) => {
    const rawValue = leaf[key];
    if (typeof rawValue !== 'string' || !rawValue.trim()) return null;

    return {
      raw: rawValue.trim(),
      comparable: normalizeColorForComparison(rawValue),
    };
  });

  if (values.some(value => value === null)) {
    const hasExplicitColor = values.some(value => value !== null);
    return hasExplicitColor
      ? { status: 'mixed', value: null }
      : { status: 'none', value: null };
  }

  const explicitValues = values as Array<{ raw: string; comparable: string }>;
  const uniqueValues = new Set(explicitValues.map(value => value.comparable));

  if (uniqueValues.size !== 1) {
    return { status: 'mixed', value: null };
  }

  return {
    status: 'uniform',
    value: explicitValues[0].raw,
  };
}

function getColorStatusLabel(result: ColorResult) {
  if (result.status === 'uniform') return result.value;
  if (result.status === 'mixed') return '여러 색상';
  return '색상 없음';
}

function getColorDisabledTitle(
  result: ColorResult,
  kind: '글자색' | '배경색',
) {
  if (result.status === 'mixed') {
    return `선택 범위에 여러 ${kind}이 있어 복사할 수 없습니다.`;
  }

  if (result.status === 'none') {
    return `선택 범위에 명시된 ${kind}이 없습니다.`;
  }

  return `${kind} ${result.value} 복사`;
}

async function writePlainText(value: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // 권한 또는 보안 정책으로 실패하면 execCommand 방식으로 다시 시도한다.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';

  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand('copy')) {
      throw new Error('clipboard copy failed');
    }
  } finally {
    document.body.removeChild(textarea);
  }
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
        // 일부 브라우저가 사용자 정의 MIME을 거부해도 HTML과 일반 텍스트는 유지한다.
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

export default function TextContextMenu({ editor }: Props) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const restoreSelection = useCallback(
    (selection: BaseRange) => {
      try {
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
      if (menuRef.current && targetElement && menuRef.current.contains(targetElement)) {
        event.preventDefault();
        return;
      }

      const { selection } = editor;
      const inlineImageElement =
        targetElement?.closest<HTMLElement>(
          '[data-wiki-inline="inline-image"][data-wiki-mode="edit"]',
        );
      if (
        !selection ||
        !SlateRange.isExpanded(selection) ||
        (!ReactEditor.hasEditableTarget(
          editor,
          event.target,
        ) &&
          !inlineImageElement)
      ) {
        setMenu(null);
        return;
      }

      const safeSelection = cloneRange(Editor.unhangRange(editor, selection));
      const inlineImageIsSelected =
        !!inlineImageElement &&
        isSlateElementIncludedInSelection(
          editor,
          safeSelection,
          inlineImageElement,
        );

      if (
        !isContextPointInsideDomSelection(event) &&
        !inlineImageIsSelected
      ) {
        setMenu(null);
        return;
      }

      const linkBlockElement = targetElement?.closest<HTMLElement>(
        '[data-wiki-block="link-block"][data-wiki-mode="edit"]',
      );
      const linkElement = targetElement?.closest<HTMLElement>(
        '[data-wiki-inline="link"][data-wiki-mode="edit"]',
      );
      const headingElement = targetElement?.closest<HTMLElement>(
        '[data-rdwiki-heading="true"][data-wiki-mode="edit"]',
      );
      const dividerElement = targetElement?.closest<HTMLElement>(
        '.wiki-divider-edit',
      );
      const infoBoxElement = targetElement?.closest<HTMLElement>(
        '[data-info-box-mode="edit"]',
      );
      const priceTableElement = targetElement?.closest<HTMLElement>(
        '[data-price-table-mode="edit"]',
      );

      if (
        dividerElement ||
        infoBoxElement ||
        priceTableElement ||
        linkBlockElement ||
        (linkElement &&
          isSelectionInsideSlateElement(editor, safeSelection, linkElement)) ||
        (headingElement &&
          isSelectionInsideSlateElement(editor, safeSelection, headingElement))
      ) {
        setMenu(null);
        return;
      }

      const leaves = getSelectedTextLeaves(editor, safeSelection);
      if (leaves.length === 0) {
        setMenu(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();

      const position = resolveMenuPosition(event.clientX, event.clientY);
      setMenu({
        ...position,
        selection: safeSelection,
        textColor: inspectColor(leaves, 'color'),
        backgroundColor: inspectColor(leaves, 'backgroundColor'),
      });
    };

    document.addEventListener('contextmenu', onContextMenu, true);
    return () => document.removeEventListener('contextmenu', onContextMenu, true);
  }, [editor]);

  useEffect(() => {
    if (!menu) return;

    const closeOnPointerDown = (event: MouseEvent) => {
      const targetElement = getEventElement(event.target);
      if (menuRef.current && targetElement && menuRef.current.contains(targetElement)) {
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

  if (!menu) return null;

  const copyColor = async (result: ColorResult) => {
    if (result.status !== 'uniform') return;

    try {
      await writePlainText(result.value);
      restoreSelection(menu.selection);
      setMenu(null);
    } catch (error) {
      console.error('텍스트 색상 복사 실패', error);
      alert('클립보드 복사에 실패했습니다.');
    }
  };

  const copyWithFormatting = async () => {
    if (!restoreSelection(menu.selection)) {
      setMenu(null);
      return;
    }

    try {
      const tablePayload =
        buildTableRangeClipboardPayload(
          editor,
          menu.selection,
        );

      if (tablePayload) {
        await writeTableClipboardData(
          tablePayload,
        );
      } else {
        const data = new DataTransfer();
        ReactEditor.setFragmentData(editor, data, 'copy');
        await writeFormattedData(data);
      }

      restoreSelection(menu.selection);
      setMenu(null);
    } catch (error) {
      console.error('서식 포함 텍스트 복사 실패', error);
      alert('서식이 포함된 텍스트 복사에 실패했습니다.');
    }
  };

  const clearFormatting = () => {
    if (!restoreSelection(menu.selection)) {
      setMenu(null);
      return;
    }

    try {
      Transforms.unsetNodes(editor, TEXT_MARKS, {
        at: menu.selection,
        match: Text.isText,
        split: true,
      });
      ReactEditor.focus(editor);
    } catch (error) {
      console.error('텍스트 속성 제거 실패', error);
    } finally {
      setMenu(null);
    }
  };

  return (
    <div
      ref={menuRef}
      className="editor-text-context-menu"
      style={{
        top: menu.y,
        left: menu.x,
      }}
      role="menu"
      aria-label="텍스트 선택 메뉴"
      onContextMenu={event => event.preventDefault()}
    >
      <TextMenuItem
        onClick={() => void copyColor(menu.textColor)}
        disabled={menu.textColor.status !== 'uniform'}
        title={getColorDisabledTitle(menu.textColor, '글자색')}
        trailing={
          <ColorValue
            result={menu.textColor}
            kind="text"
          />
        }
      >
        글자색 복사
      </TextMenuItem>

      <TextMenuItem
        onClick={() => void copyColor(menu.backgroundColor)}
        disabled={menu.backgroundColor.status !== 'uniform'}
        title={getColorDisabledTitle(menu.backgroundColor, '배경색')}
        trailing={
          <ColorValue
            result={menu.backgroundColor}
            kind="background"
          />
        }
      >
        배경색 복사
      </TextMenuItem>

      <div className="editor-text-context-divider" />

      <TextMenuItem onClick={() => void copyWithFormatting()}>
        속성과 함께 글자 복사
      </TextMenuItem>

      <TextMenuItem onClick={clearFormatting} danger>
        텍스트 속성 제거
      </TextMenuItem>
    </div>
  );
}

function ColorValue({
  result,
  kind,
}: {
  result: ColorResult;
  kind: 'text' | 'background';
}) {
  return (
    <span className="editor-text-context-color-value">
      {result.status === 'uniform' && (
        <span
          className={[
            'editor-text-context-swatch',
            kind === 'background' ? 'is-background' : '',
          ].filter(Boolean).join(' ')}
          style={{ backgroundColor: result.value }}
          aria-hidden="true"
        />
      )}
      <span>{getColorStatusLabel(result)}</span>
    </span>
  );
}

function TextMenuItem({
  children,
  onClick,
  trailing,
  disabled = false,
  danger = false,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  trailing?: React.ReactNode;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={[
        'editor-text-context-item',
        danger ? 'is-danger' : '',
      ].filter(Boolean).join(' ')}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
      disabled={disabled}
      title={title}
      role="menuitem"
    >
      <span>{children}</span>
      {trailing}
    </button>
  );
}

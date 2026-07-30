'use client';

import {
  Editor,
  Element as SlateElement,
  Node as SlateNode,
  Path,
  Transforms,
} from 'slate';
import { ReactEditor } from 'slate-react';

import type { LinkBlockElement } from '@/types/slate';

export type LinkBlockDeleteScope = 'one' | 'row';

export type LinkBlockGroup = {
  cardPath: Path;
  rowPath: Path | null;
  cardCount: number;
};

type LinkBlockRowNode = {
  type: 'link-block-row';
  children: LinkBlockElement[];
};

export function isLinkBlockElement(
  node: unknown,
): node is LinkBlockElement {
  return (
    SlateElement.isElement(node) &&
    (node as { type?: unknown }).type === 'link-block'
  );
}

function isLinkBlockRowElement(
  node: unknown,
): node is LinkBlockRowNode {
  return (
    SlateElement.isElement(node) &&
    (node as { type?: unknown }).type === 'link-block-row'
  );
}

function cloneNode<T>(node: T): T {
  return JSON.parse(JSON.stringify(node)) as T;
}

function hasPath(editor: Editor, path: Path) {
  try {
    return Editor.hasPath(editor, path);
  } catch {
    return false;
  }
}

export function getLinkBlockGroup(
  editor: Editor,
  cardPath: Path,
): LinkBlockGroup {
  if (cardPath.length === 0 || !hasPath(editor, cardPath)) {
    return {
      cardPath: [...cardPath],
      rowPath: null,
      cardCount: 1,
    };
  }

  try {
    const parentPath = Path.parent(cardPath);
    const parent = SlateNode.get(editor, parentPath);

    if (!isLinkBlockRowElement(parent)) {
      return {
        cardPath: [...cardPath],
        rowPath: null,
        cardCount: 1,
      };
    }

    return {
      cardPath: [...cardPath],
      rowPath: [...parentPath],
      cardCount: parent.children.filter(isLinkBlockElement).length,
    };
  } catch {
    return {
      cardPath: [...cardPath],
      rowPath: null,
      cardCount: 1,
    };
  }
}

function ensureDocumentBlock(editor: Editor) {
  if (editor.children.length > 0) return;

  Transforms.insertNodes(
    editor,
    {
      type: 'paragraph',
      children: [{ text: '' }],
    } as any,
    { at: [0] },
  );
}

function focusNearPath(editor: Editor & ReactEditor, targetPath: Path) {
  const previousPath =
    targetPath.length > 0 &&
    targetPath[targetPath.length - 1] > 0
      ? Path.previous(targetPath)
      : null;

  const focusPath = hasPath(editor, targetPath)
    ? targetPath
    : previousPath && hasPath(editor, previousPath)
      ? previousPath
      : [0];

  try {
    Transforms.select(editor, Editor.start(editor, focusPath));
    ReactEditor.focus(editor);
  } catch {
    // 삭제 직후 정규화로 경로가 달라진 경우에는 선택 복구만 생략한다.
  }
}

/**
 * 링크카드 삭제를 한 곳에서 처리한다.
 *
 * - 단일 카드: 카드 블록 삭제
 * - 두 칸 행에서 하나 삭제: 남은 카드를 large 단일 블록으로 승격
 * - 행 전체 삭제: 같은 행의 카드 모두 삭제
 */
export function deleteLinkBlockAt(
  editor: Editor & ReactEditor,
  cardPath: Path,
  scope: LinkBlockDeleteScope = 'one',
) {
  if (!hasPath(editor, cardPath)) return false;

  let targetPath = [...cardPath];

  try {
    const cardNode = SlateNode.get(editor, cardPath);
    if (!isLinkBlockElement(cardNode)) return false;

    const group = getLinkBlockGroup(editor, cardPath);

    Editor.withoutNormalizing(editor, () => {
      if (!group.rowPath) {
        Transforms.removeNodes(editor, { at: cardPath });
        return;
      }

      targetPath = [...group.rowPath];
      const rowNode = SlateNode.get(editor, group.rowPath);
      if (!isLinkBlockRowElement(rowNode)) return;

      if (scope === 'row') {
        Transforms.removeNodes(editor, { at: group.rowPath });
        return;
      }

      const cardIndex = cardPath[cardPath.length - 1];
      const remainingChildren = rowNode.children
        .filter((_, index) => index !== cardIndex)
        .map(child => cloneNode(child));

      Transforms.removeNodes(editor, { at: group.rowPath });

      if (remainingChildren.length === 1) {
        const remainingCard = remainingChildren[0];

        if (isLinkBlockElement(remainingCard)) {
          Transforms.insertNodes(
            editor,
            {
              ...remainingCard,
              size: 'large',
            } as LinkBlockElement,
            { at: group.rowPath },
          );
        }
        return;
      }

      if (remainingChildren.length > 1) {
        Transforms.insertNodes(
          editor,
          {
            ...cloneNode(rowNode),
            children: remainingChildren,
          } as any,
          { at: group.rowPath },
        );
      }
    });

    ensureDocumentBlock(editor);
    focusNearPath(editor, targetPath);
    return true;
  } catch (error) {
    console.error('링크카드 삭제 실패', error);
    return false;
  }
}

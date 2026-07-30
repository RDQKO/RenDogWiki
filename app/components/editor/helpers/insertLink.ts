/**
 * 에디터에서 인라인/블록 링크 삽입 및 해제 유틸리티
 * - 선택 영역 드래그: 하이퍼링크(<a>)로 래핑
 * - 커서만 있을 때: 해당 위치에 url 자체 삽입
 * - 블록(링크카드): 현재 줄에 링크 카드 삽입, 이후 빈 단락 자동 추가
 */

import { Editor, Transforms, Range, Path, Element as SlateElement, Node } from 'slate';
import { ReactEditor } from 'slate-react';
import type { LinkElement, LinkBlockElement, ParagraphElement } from '@/types/slate';

// =============== 공통 유틸 ===============
/**
 * 현재 선택 범위가 기존 인라인 링크와 조금이라도 겹치는지 확인한다.
 * - 링크 내부 커서
 * - 링크 일부 또는 전체 선택
 * - 링크와 일반 텍스트를 함께 선택
 * 위 경우를 모두 true로 처리해 링크 중첩이나 의도치 않은 분할을 막는다.
 */
export function selectionIntersectsInlineLink(
  editor: Editor,
  at: Range | null = editor.selection,
) {
  if (!at) return false;

  try {
    const [match] = Editor.nodes(editor, {
      at,
      match: n =>
        SlateElement.isElement(n) &&
        (n as LinkElement).type === 'link',
    });

    return !!match;
  } catch {
    return false;
  }
}

function moveCaretOutOfLink(editor: Editor) {
  const linkEntry = Editor.above(editor, {
    match: n => SlateElement.isElement(n) && (n as any).type === 'link',
  });
  if (!linkEntry) return;

  const [, linkPath] = linkEntry;

  // 1) 링크 내부 끝으로 접고
  Transforms.collapse(editor, { edge: 'end' });

  // 2) 링크 바로 다음 포인트로 이동 시도
  const after = Editor.after(editor, linkPath);
  if (after) {
    Transforms.select(editor, after);
    ReactEditor.focus(editor);
    return;
  }

  // 3) fallback: 링크 다음 위치에 빈 텍스트 삽입 후 이동
  const afterPath = Path.next(linkPath);
  Transforms.insertNodes(editor, { text: '' }, { at: afterPath, select: true });
  ReactEditor.focus(editor);
}

function parseExternal(url: string): { sitename: string; favicon: string } {
  try {
    const u = new URL(url);
    const sitename = u.hostname.replace(/^www\./, '');
    const favicon = `${u.protocol}//${u.hostname}/favicon.ico`;
    return { sitename, favicon };
  } catch {
    return { sitename: '', favicon: '' };
  }
}

function buildLinkBlock(
  url: string,
  size: 'large' | 'small',
  opts?: Partial<LinkBlockElement>
): LinkBlockElement {
  const trimmed = (url ?? '').trim();

  if (opts?.isWiki) {
    return {
      type: 'link-block',
      url: trimmed,
      size,
      sitename: opts.sitename || opts.wikiTitle || '',
      favicon: undefined,
      isWiki: true,
      wikiTitle: opts.wikiTitle,
      wikiPath: opts.wikiPath,
      // 내부 문서 아이콘(있으면)
      docIcon: (opts as any)?.docIcon,
      children: [{ text: '' }],
    } as any;
  }

  const { sitename, favicon } = parseExternal(trimmed);
  return {
    type: 'link-block',
    url: trimmed,
    size,
    sitename,
    favicon,
    isWiki: false,
    children: [{ text: '' }],
  } as LinkBlockElement;
}

// =============== 인라인 링크 ===============
/**
 * [인라인 링크 삽입]
 * - 선택 영역 있으면: 해당 부분만 하이퍼링크(<a>)로 래핑
 * - 선택이 없으면: 커서 위치에 url을 텍스트로 삽입
 */
export const insertLink = (editor: Editor, url: string, text?: string) => {
  if (!editor.selection) return;

  const trimmed = (url ?? '').trim();
  if (!trimmed) return;
  if (selectionIntersectsInlineLink(editor, editor.selection)) return;

  const isCollapsed = Range.isCollapsed(editor.selection);
  const linkEl: LinkElement = {
    type: 'link',
    url: trimmed,
    children: isCollapsed ? [{ text: text ?? trimmed }] : [],
  };

  if (isCollapsed) {
    Transforms.insertNodes(editor, linkEl as any);
    setTimeout(() => moveCaretOutOfLink(editor), 0);
  } else {
    Transforms.wrapNodes(editor, linkEl as any, { split: true });
    setTimeout(() => moveCaretOutOfLink(editor), 0);
  }
};

// =============== 블록 링크(큰 카드) ===============
/**
 * [링크 블록(카드) 삽입]
 * - 내부 위키/외부 URL 구분하여 sitename, favicon 자동 세팅
 * - 링크 카드 뒤에 빈 단락 추가(입력 UX 개선)
 *
 * ✅ opts.size가 'small' | 'half' 인 경우에는 명시적으로 반띵 로직(insertHalfLinkBlock)으로 라우팅
 *    → 연속 삽입 시 자동으로 link-block-row로 묶이는 건 "half 버튼"에서만 발생.
 *    → 일반 링크 블럭 버튼은 항상 독립된 link-block 한 개만 삽입.
 */
export const insertLinkBlock = (
  editor: Editor,
  url: string,
  opts?: Partial<LinkBlockElement>
) => {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return;

  // half/small 명시되면 반띵 로직으로 위임 (명시적인 경우만)
  if (opts?.size === 'small' || (opts as any)?.size === 'half') {
    insertHalfLinkBlock(editor, trimmed, { ...opts, size: 'small' } as any);
    return;
  }

  // selection이 없으면 문서 끝으로 포커스 이동
  if (!editor.selection) {
    ReactEditor.focus(editor);
    const insertPoint = Editor.end(editor, []);
    Transforms.select(editor, insertPoint);
  }

  // ✅ 이제는 위/아래 링크 블럭을 자동 병합하지 않고
  //    항상 "단일 large 링크 블럭 + 빈 문단"만 삽입
  const linkBlock = buildLinkBlock(trimmed, 'large', opts);
  const afterBlock: ParagraphElement = { type: 'paragraph', children: [{ text: '' }] };
  Transforms.insertNodes(editor, [linkBlock as any, afterBlock as any], { select: true });
};

// =============== 블록 링크(작은 카드, 반띵) ===============
/**
 * [작은 링크 블록(반띵) 삽입]
 * - 부모가 link-block-row이고 자식이 1개면 같은 줄에 넣음
 * - 같은 줄/바로 위에 단일 small link-block만 있는 경우 → 둘을 묶어 link-block-row로 변환
 * - 아니면 새 link-block-row를 만들어 한 줄 아래에 삽입
 * - 내부 문서/외부 URL 모두 지원(opts.isWiki 등으로 구분)
 *
 * ⚠️ 이 함수는 "반띵/2개짜리" 용도로만 사용.
 *    일반 링크 블럭 버튼은 insertLinkBlock만 사용하므로
 *    사용자가 명시적으로 half/small을 선택한 경우에만
 *    자동 병합/row 로직이 동작함.
 */
export function insertHalfLinkBlock(
  editor: Editor,
  url: string,
  opts: Partial<LinkBlockElement> = {}
) {
  const trimmed = (url ?? '').trim();
  if (!trimmed) return;

  if (!editor.selection) {
    ReactEditor.focus(editor);
    const end = Editor.end(editor, []);
    Transforms.select(editor, end);
  }

  const nodeToInsert = buildLinkBlock(trimmed, 'small', opts);

  const blockEntry = Editor.above(editor, {
    at: editor.selection ?? undefined,
    match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n),
  });

  if (!blockEntry) {
    const row = { type: 'link-block-row', children: [nodeToInsert] } as any;
    Transforms.insertNodes(editor, [row, { type: 'paragraph', children: [{ text: '' }] } as any], { select: true });
    ReactEditor.focus(editor);
    return;
  }

  const [blockNode, blockPath] = blockEntry;

  // 1) 현재 부모가 row
  if (SlateElement.isElement(blockNode) && (blockNode as any).type === 'link-block-row') {
    const children = (blockNode.children || []).filter(SlateElement.isElement);
    if (children.length === 0) {
      Transforms.insertNodes(editor, nodeToInsert as any, { at: blockPath.concat(0) });
    } else if (children.length === 1) {
      Transforms.insertNodes(editor, nodeToInsert as any, { at: blockPath.concat(1) });

      // row 다음에 빈 문단 보장
      const afterRow = Path.next(blockPath);
      try {
        const nextNode = Node.get(editor, afterRow) as any;
        if (!(SlateElement.isElement(nextNode) && nextNode.type === 'paragraph')) {
          Transforms.insertNodes(
            editor,
            { type: 'paragraph', children: [{ text: '' }] } as any,
            { at: afterRow }
          );
        }
      } catch {
        Transforms.insertNodes(
          editor,
          { type: 'paragraph', children: [{ text: '' }] } as any,
          { at: afterRow }
        );
      }
    } else {
      const insertPath = Path.next(blockPath);
      const row = { type: 'link-block-row', children: [nodeToInsert] } as any;
      Transforms.insertNodes(editor, [row, { type: 'paragraph', children: [{ text: '' }] } as any], {
        at: insertPath,
        select: true,
      });
    }
    ReactEditor.focus(editor);
    return;
  }

  // 2) 일반 블록(문단 등)일 때 – 같은 블록 내부에 1개만 있으면 row로 감싸기
  if (SlateElement.isElement(blockNode)) {
    const children = (blockNode.children || []).filter(SlateElement.isElement);
    if (
      children.length === 1 &&
      (children[0] as any).type === 'link-block' &&
      (children[0] as any).size === 'small'
    ) {
      const first = children[0] as any;
      const firstPath = blockPath.concat(0);

      Transforms.removeNodes(editor, { at: firstPath });
      const row = { type: 'link-block-row', children: [first, nodeToInsert] } as any;
      Transforms.insertNodes(editor, [row, { type: 'paragraph', children: [{ text: '' }] } as any], {
        at: blockPath,
        select: true,
      });
      ReactEditor.focus(editor);
      return;
    }

    // 바로 위 형제가 "단일 link-block(large/small 무관)"이면 강제로 row로 병합
    try {
      const prevPath = Path.previous(blockPath);
      const prevNode = Node.get(editor, prevPath) as any;

      if (SlateElement.isElement(prevNode) && prevNode.type === 'link-block') {
        const leftSmall = { ...prevNode, size: 'small' as const };

        // 위 단일 블럭 제거
        Transforms.removeNodes(editor, { at: prevPath });

        // 현재 블록이 빈 문단이면 제거
        if (
          SlateElement.isElement(blockNode) &&
          blockNode.type === 'paragraph' &&
          Editor.isEmpty(editor, blockNode as any)
        ) {
          Transforms.removeNodes(editor, { at: blockPath });
        }

        const row = { type: 'link-block-row', children: [leftSmall, nodeToInsert] } as any;
        Transforms.insertNodes(editor, [row, { type: 'paragraph', children: [{ text: '' }] } as any], {
          at: prevPath,
          select: true,
        });
        ReactEditor.focus(editor);
        return;
      }
    } catch {}

    // 그 외: 현재 블록 다음에 새 row 생성
    const insertPath = Path.next(blockPath);
    const row = { type: 'link-block-row', children: [nodeToInsert] } as any;
    Transforms.insertNodes(editor, [row, { type: 'paragraph', children: [{ text: '' }] } as any], {
      at: insertPath,
      select: true,
    });
    ReactEditor.focus(editor);
  }
}

// =============== 2개(절반) 한 번에 삽입 ===============
// 내부/외부 공용. 두 카드 모두 small로 만들어 한 번에 row 삽입.
export function insertLinkBlockRow(
  editor: Editor,
  items: Array<{ url: string; opts?: Partial<LinkBlockElement> }>
) {
  const pair = (items || []).slice(0, 2).filter(v => v?.url?.trim());
  if (pair.length === 0) return;

  if (!editor.selection) {
    ReactEditor.focus(editor);
    const end = Editor.end(editor, []);
    Transforms.select(editor, end);
  }

  if (pair.length === 1) {
    // 1개만 오면 반띵 1개 로직으로 위임
    insertHalfLinkBlock(editor, pair[0].url, { ...(pair[0].opts || {}), size: 'small' as any });
    return;
  }

  const children = pair.map(p => buildLinkBlock(p.url, 'small', p.opts));
  const row = { type: 'link-block-row', children } as any;
  const afterPara: ParagraphElement = { type: 'paragraph', children: [{ text: '' }] };
  Transforms.insertNodes(editor, [row as any, afterPara as any], { select: true });
  ReactEditor.focus(editor);
}

// =============== 링크 해제/상태 체크 ===============
/**
 * [인라인 링크 해제]
 * - 현재 커서/선택이 <a> 내부라면 unwrapNodes로 <a> 해제
 * - 블록 노드가 link면 type을 paragraph로 초기화
 */
export const unwrapLink = (editor: Editor) => {
  Transforms.unwrapNodes(editor, {
    match: n => SlateElement.isElement(n) && (n as any).type === 'link',
    split: true,
  });

  const { selection } = editor;
  if (selection) {
    const after = Editor.after(editor, selection.focus);
    if (after) Transforms.select(editor, after);
  }

  if (selection) {
    const [blockEntry] = Editor.nodes(editor, {
      match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n),
    });
    if (blockEntry) {
      const [blockNode, path] = blockEntry;
      if (SlateElement.isElement(blockNode) && (blockNode as any).type === 'link') {
        Transforms.setNodes(
          editor,
          { type: 'paragraph' } as Partial<ParagraphElement>,
          { at: path }
        );
      }
    }
  }
};

/**
 * [커서가 링크 내부인지 판별]
 * - 현재 선택 또는 커서 위치가 <a> 내부면 true
 */
export const isLinkActive = (editor: Editor) => {
  const [match] = Editor.nodes(editor, {
    match: n => SlateElement.isElement(n) && (n as any).type === 'link',
  });
  return !!match;
};

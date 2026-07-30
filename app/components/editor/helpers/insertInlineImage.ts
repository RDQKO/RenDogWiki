// =============================================
// File: app/components/editor/helpers/insertInlineImage.ts
// =============================================
'use client';

/**
 * 에디터 내에 인라인 이미지(inline-image) 노드를 삽입하는 유틸 함수
 * - 사용 예: 본문 문장 사이에 작은 아이콘/이미지를 끼워 넣을 때
 * - InlineImageElement 타입/렌더링 규칙은 @/types/slate 및 에디터 설정을 따른다.
 * - Slate 요구사항에 따라 children에는 빈 텍스트 노드를 포함한다.
 */

import { Transforms, Editor } from 'slate';
import { ReactEditor } from 'slate-react';
import type { InlineImageElement } from '@/types/slate';

/**
 * insertInlineImage
 * @param editor Slate Editor 인스턴스
 * @param url    삽입할 이미지 URL
 *
 * - 현재 커서(selection) 위치에 인라인 이미지 노드를 삽입한다.
 * - selection이 없거나 url이 비어 있으면 아무 것도 하지 않는다(조용히 반환).
 */
export function insertInlineImage(editor: Editor, url: string) {
  // URL/선택 영역 가드
  const trimmed = (url ?? '').trim();
  if (!trimmed) return;
  if (!editor.selection) return;

  // 인라인 이미지 노드 (children에 빈 텍스트 노드가 반드시 필요)
  const inlineImage: InlineImageElement = {
    type: 'inline-image',
    url: trimmed,
    children: [{ text: '' }],
  };

  // 현재 커서 위치에 삽입한 뒤 void 인라인 노드 바깥으로 선택점을 이동한다.
  // 선택점이 이미지의 숨은 텍스트 자식에 남으면 특히 표 셀 안에서
  // 키 입력이 에디터 전체에서 막힌 것처럼 보일 수 있다.
  Transforms.insertNodes(editor, inlineImage);
  Transforms.move(editor, {
    distance: 1,
    unit: 'offset',
  });

  // 이미지 선택 모달이 닫힌 다음 프레임에 실제 contentEditable로 포커스를
  // 되돌려, 표 안팎 모두 즉시 이어서 입력할 수 있게 한다.
  window.requestAnimationFrame(() => {
    try {
      ReactEditor.focus(editor as Editor & ReactEditor);
    } catch {
      // 모달 종료 사이에 에디터가 언마운트된 경우는 무시한다.
    }
  });
}

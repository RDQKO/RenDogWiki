// File: app/components/editor/helpers/insertImage.ts
// =============================================
// insertImage
// - 현재 커서 위치에 이미지 블록(image node)을 삽입하고
//   그 바로 다음에 빈 단락(paragraph)을 추가해 커서가 곧바로 이어질 수 있게 한다.
// - 삽입 후 커서를 새 단락 시작 지점으로 이동하고, 에디터 포커스를 명확히 준다.
// - 이미지 크기는 강제로 지정하지 않고 원본 크기를 사용한다.
// 사용처: 에디터 툴바/컨텍스트 메뉴의 "이미지" 삽입 액션
// =============================================
import {
  Editor,
  Transforms,
  Range,
  Element as SlateElement,
  Path,
} from 'slate';
import { ReactEditor } from 'slate-react';
import type { ImageElement, ParagraphElement } from '@/types/slate';

/**
 * insertImage
 * @param editor Slate Editor 인스턴스
 * @param url    삽입할 이미지 URL
 */
export function insertImage(editor: Editor, url: string) {
  // 이미지 노드에는 크기를 넣지 않는다.
  // 렌더러가 원본 크기로 표시하되 편집 영역보다 큰 경우에만 축소한다.
  const imageNode: ImageElement = {
    type: 'image',
    url,
    children: [{ text: '' }],
  };

  Transforms.insertNodes<ImageElement>(editor, imageNode);

  // 이미지 바로 다음에 빈 단락을 만들고 커서를 이동한다.
  if (editor.selection) {
    const iter = Editor.nodes<SlateElement>(editor, {
      at: editor.selection as Range,
      mode: 'lowest',
      match: (node) =>
        SlateElement.isElement(node) &&
        (node as SlateElement).type === 'image',
    });
    const first = iter.next();

    if (!first.done) {
      const [, imagePath] = first.value;
      const nextPath = Path.next(imagePath);
      const paragraphNode: ParagraphElement = {
        type: 'paragraph',
        children: [{ text: '' }],
      };

      Transforms.insertNodes<ParagraphElement>(editor, paragraphNode, {
        at: nextPath,
      });
      Transforms.select(editor, Editor.start(editor, nextPath));

      try {
        ReactEditor.focus(editor as any);
      } catch {
        // 에디터가 언마운트되는 순간에는 포커스 실패를 무시한다.
      }
    }
  }
}

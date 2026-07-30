// =============================================
// File: app/components/editor/index.tsx
// =============================================

/**
 * Slate 에디터 메인 컴포넌트
 * - 에디터 인스턴스, 툴바, 본문, 목차, heading 아이콘 선택 모달 등 전체 레이아웃
 * - value/selection 관리, 단축키 처리, heading 아이콘 변경 처리
 * - link-block/divider를 void로 지정해 블록 편집 UX 보강
 */

'use client';

import React, {
  useMemo,
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  createEditor,
  Descendant,
  Editor,
  Transforms,
  Range,
  Point,
  Element as SlateElement,
  Path,
} from 'slate';
import {
  Slate,
  Editable,
  withReact,
  ReactEditor,
  RenderLeafProps,
  RenderElementProps,
} from 'slate-react';
import { withHistory } from 'slate-history';
import isHotkey from 'is-hotkey';

import { Toolbar } from './Toolbar';
import Leaf from './Leaf';
import Element from './Element';
import TableOfContents from './TableOfContents';
import HeadingIconSelectModal from './HeadingIconSelectModal';
import { extractHeadings } from './helpers/extractHeadings';

import type { CustomElement } from '@/types/slate';

export default function SlateEditor() {
  // 에디터 인스턴스 생성: link-block / divider를 void 처리
  const editor = useMemo(() => {
    const e = withHistory(withReact(createEditor()));
    const originalIsVoid = e.isVoid;
    e.isVoid = element =>
      element.type === 'link-block' || element.type === 'divider'
        ? true
        : originalIsVoid(element);
    return e;
  }, []);

  // selection 보존용 ref (툴바 드롭다운에서 사용)
  const selectionRef = useRef<Range | null>(null);
  // 인라인 이미지 선택 모달 단축키 연결용 ref
  const openInlineImageModalRef = useRef<(() => void) | null>(null);

  // 본문 값, heading 아이콘 모달 상태
  const [value, setValue] = useState<Descendant[]>([
    { type: 'paragraph', children: [{ text: '' }] },
  ]);
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);
  const [iconEditTarget, setIconEditTarget] = useState<CustomElement | null>(null);

  // 입력 포커스가 아닌 상태에서 Backspace가 브라우저 뒤로가기로 동작하는 것 방지
  useEffect(() => {
    const preventBackspaceNavigation = (e: KeyboardEvent) => {
      const target = (e.target as HTMLElement);
      const isEditable =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;
      if (e.key === 'Backspace' && !isEditable) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', preventBackspaceNavigation);
    return () => window.removeEventListener('keydown', preventBackspaceNavigation);
  }, []);

  // 목차용 heading 목록
  const headings = useMemo(() => extractHeadings(value), [value]);

  // heading 아이콘 클릭 → 선택 모달 오픈
  const handleIconClick = (element: CustomElement) => {
    setIconEditTarget(element);
    setIsIconModalOpen(true);
  };

  // leaf / element 렌더러
  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    []
  );
  const renderElement = useCallback(
    (props: RenderElementProps) => (
      <Element
        {...props}
        editor={editor}
        onIconClick={handleIconClick}
      />
    ),
    [editor]
  );

  // 텍스트 마크 토글 유틸 (bold/italic/underline/strikethrough)
  const toggleMark = (format: 'bold' | 'italic' | 'underline' | 'strikethrough') => {
    const marks = Editor.marks(editor) || {};
    if (marks[format]) {
      Editor.removeMark(editor, format);
    } else {
      Editor.addMark(editor, format, true);
    }
  };

  // 단축키 및 heading 전용 keydown 처리
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    // 텍스트 스타일 단축키
    if (isHotkey('mod+b', event)) { event.preventDefault(); toggleMark('bold'); }
    if (isHotkey('mod+i', event)) { event.preventDefault(); toggleMark('italic'); }
    if (isHotkey('mod+u', event)) { event.preventDefault(); toggleMark('underline'); }
    if (isHotkey('mod+shift+x', event)) { event.preventDefault(); toggleMark('strikethrough'); }
    if (isHotkey('mod+shift+e', event)) {
      event.preventDefault();
      openInlineImageModalRef.current?.();
      return;
    }

    // heading 블록에서 Backspace(맨 앞) → 해당 블록을 paragraph로 변환
    if (event.key === 'Backspace') {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        const [match] = Editor.nodes(editor, {
          match: n =>
            SlateElement.isElement(n) &&
            ['heading-one', 'heading-two', 'heading-three'].includes(n.type),
        });
        if (match) {
          const [, path] = match;
          const start = Editor.start(editor, path);
          if (Point.equals(selection.anchor, start)) {
            event.preventDefault();
            // 타입만 paragraph로 변경(내용 보존)
            Transforms.setNodes(editor, { type: 'paragraph' }, { at: path });
            // 헤딩에서 쓰던 아이콘 속성 제거(단락에는 필요 없음)
            Transforms.unsetNodes(editor, 'icon', { at: path });
            Transforms.select(editor, Editor.start(editor, path));
          }
        }
      }
    }

    // heading 블록에서 Enter → 아래에 단락 추가 후 커서 이동
    if (event.key === 'Enter') {
      const [match] = Editor.nodes(editor, {
        match: n =>
          SlateElement.isElement(n) &&
          ['heading-one', 'heading-two', 'heading-three'].includes(n.type),
      });
      if (match) {
        event.preventDefault();
        const [, path] = match;
        const insertPath = Path.next(path);
        Transforms.insertNodes(
          editor,
          { type: 'paragraph', children: [{ text: '' }] },
          { at: insertPath }
        );
        Transforms.select(editor, Editor.start(editor, insertPath));
      }
    }
  };

  return (
    <div style={{ display: 'flex' }}>
      <div style={{ flex: 1 }}>
        <Slate editor={editor} value={value} onChange={setValue}>
          <Toolbar
            selectionRef={selectionRef}
            openInlineImageModalRef={openInlineImageModalRef}
          />
          <Editable
            renderLeaf={renderLeaf}
            renderElement={renderElement}
            onKeyDown={onKeyDown}
            placeholder="문서를 작성하세요..."
            spellCheck={false}
            style={{
              border: '1px solid #ccc',
              padding: '12px',
              borderRadius: '6px',
              minHeight: '300px',
            }}
            onBlur={() => {
              selectionRef.current = editor.selection;
            }}
          />
        </Slate>
      </div>

      {/* 우측 목차 */}
      <TableOfContents headings={headings} />

      {/* Heading 아이콘 선택 모달 */}
      <HeadingIconSelectModal
        open={isIconModalOpen && !!iconEditTarget}
        onClose={() => {
          setIsIconModalOpen(false);
          setIconEditTarget(null);
        }}
        onSubmit={(icon) => {
          if (iconEditTarget && SlateElement.isElement(iconEditTarget)) {
            const path = ReactEditor.findPath(editor, iconEditTarget);
            Transforms.setNodes(editor, { icon }, { at: path });
          }
        }}
      />
    </div>
  );
}

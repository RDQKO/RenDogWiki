'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Editor, Node, Path, Range, Transforms } from 'slate';
import { ReactEditor, type RenderElementProps } from 'slate-react';
import type { CollapsibleElement } from '@/types/slate';
import CollapsibleSettingsModal from '../../CollapsibleSettingsModal';
import { unwrapCollapsible } from '../../helpers/collapsible';
import styles from '@/components/wiki-render/collapsible/Collapsible.module.css';

export default function CollapsibleEditorAdapter({ attributes, children, element, editor }: RenderElementProps & {
  element: CollapsibleElement; editor: Editor;
}) {
  const [expanded, setExpanded] = useState(true);
  const [settings, setSettings] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const path = () => ReactEditor.findPath(editor, element);
  const toggle = () => {
    // Move Slate's selection out of a region before hiding its editable descendants.
    if (expanded && editor.selection) {
      const at = path();
      const selection = editor.selection;
      if (Range.includes(Editor.range(editor, at), selection.anchor) || Range.includes(Editor.range(editor, at), selection.focus)) Transforms.deselect(editor);
    }
    setExpanded(!expanded);
  };
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const outside = (event: MouseEvent) => { if (!menuRef.current?.contains(event.target as globalThis.Node)) close(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const buttons = Array.from(menuRef.current?.querySelectorAll('button') ?? []);
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (event.key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    };
    document.addEventListener('mousedown', outside, true);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', outside, true);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', key);
    };
  }, [menu]);
  const openMenu = (x: number, y: number) => setMenu({ x: Math.max(8, Math.min(x, window.innerWidth - 250)), y: Math.max(8, Math.min(y, window.innerHeight - 285)) });
  const act = (action: () => void) => { action(); setMenu(null); };
  const insertAfter = () => {
    const at = Path.next(path());
    Transforms.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] }, { at });
    Transforms.select(editor, Editor.start(editor, at));
    ReactEditor.focus(editor);
  };
  return <div {...attributes} className={styles.region} data-wiki-collapsible="edit"
    onContextMenu={event => {
      if (event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation(); openMenu(event.clientX, event.clientY);
    }}>
    <div className={styles.editorHeader} contentEditable={false}
      onContextMenu={event => { event.preventDefault(); event.stopPropagation(); openMenu(event.clientX, event.clientY); }}>
      <button type="button" onMouseDown={event => event.preventDefault()} onClick={toggle} aria-expanded={expanded} aria-label={expanded ? '편집 영역 접기' : '편집 영역 펼치기'}>{expanded ? '▾' : '▸'}</button>
      <span className={styles.label}>{element.title || '펼침·접힘'}</span>
      <span className={styles.hint}>기본 {element.defaultOpen !== false ? '펼침' : '접힘'}</span>
      <button type="button" aria-label="펼침·접힘 영역 메뉴" aria-haspopup="menu" onMouseDown={event => event.preventDefault()}
        onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); openMenu(rect.left, rect.bottom); }}>⋯</button>
    </div>
    <div className={styles.body} hidden={!expanded}>{children}</div>
    {menu && createPortal(<div ref={menuRef} className={styles.menu} role="menu" aria-label="펼침·접힘 영역 관리" style={{ left: menu.x, top: menu.y }}
      onContextMenu={event => event.preventDefault()}>
      <button type="button" role="menuitem" autoFocus onClick={() => act(() => setSettings(true))}>제목·기본 상태 변경</button>
      <button type="button" role="menuitem" onClick={() => act(toggle)}>{expanded ? '편집 영역 접기' : '편집 영역 펼치기'}</button>
      <button type="button" role="menuitem" onClick={() => act(() => Transforms.setNodes(editor, { defaultOpen: element.defaultOpen === false }, { at: path() }))}>기본 상태를 {element.defaultOpen === false ? '펼침' : '접힘'}으로</button>
      <button type="button" role="menuitem" onClick={() => act(insertAfter)}>아래에 빈 문단 생성</button>
      <button type="button" role="menuitem" onClick={() => act(() => unwrapCollapsible(editor, path()))}>영역 해제 (내용 유지)</button>
      <button type="button" role="menuitem" className={styles.danger} onClick={() => act(() => {
        Editor.withoutNormalizing(editor, () => {
          Transforms.removeNodes(editor, { at: path() });
          if (!editor.children.length) Transforms.insertNodes(editor, { type: 'paragraph', children: [{ text: '' }] }, { at: [0] });
        });
      })}>영역과 내용 삭제</button>
    </div>, document.body)}
    <CollapsibleSettingsModal open={settings} initial={element} onClose={() => setSettings(false)} onSave={options => {
      const at = path();
      if (Node.has(editor, at)) Transforms.setNodes(editor, options, { at });
      setSettings(false);
    }} />
  </div>;
}

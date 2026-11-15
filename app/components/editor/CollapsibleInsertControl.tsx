'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Editor, Range } from 'slate';
import { ReactEditor } from 'slate-react';
import CollapsibleSettingsModal from './CollapsibleSettingsModal';
import { wrapInCollapsible } from './helpers/collapsible';

export default function CollapsibleInsertControl({ editor, selectionRef }: {
  editor: Editor; selectionRef: React.MutableRefObject<Range | null>;
}) {
  const [open, setOpen] = useState(false);
  const rangeRef = useRef<ReturnType<typeof Editor.rangeRef> | null>(null);
  useEffect(() => () => { rangeRef.current?.unref(); }, []);
  const close = () => { rangeRef.current?.unref(); rangeRef.current = null; setOpen(false); };
  return <>
    <button type="button" className="editor-toolbar-btn" title="선택 영역을 펼침·접힘으로 묶기" aria-label="펼침·접힘 영역 추가"
      onMouseDown={event => event.preventDefault()} onClick={() => {
        const selection = editor.selection ?? selectionRef.current;
        rangeRef.current?.unref();
        rangeRef.current = selection ? Editor.rangeRef(editor, selection) : null;
        setOpen(true);
      }}>▸ 접기</button>
    <CollapsibleSettingsModal open={open} onClose={close} onSave={options => {
      const selection = rangeRef.current?.unref() ?? null;
      rangeRef.current = null;
      wrapInCollapsible(editor, selection, options);
      setOpen(false);
      ReactEditor.focus(editor);
    }} />
  </>;
}

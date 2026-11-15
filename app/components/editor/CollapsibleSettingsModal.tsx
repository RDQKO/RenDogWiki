'use client';

import React, { useEffect, useState } from 'react';
import { ModalCard } from '@/components/common/Modal';
import { DEFAULT_COLLAPSIBLE, type CollapsibleOptions } from './helpers/collapsible';

export default function CollapsibleSettingsModal({ open, initial = DEFAULT_COLLAPSIBLE, onClose, onSave }: {
  open: boolean; initial?: CollapsibleOptions; onClose: () => void; onSave: (value: CollapsibleOptions) => void;
}) {
  const [title, setTitle] = useState(initial.title);
  const [defaultOpen, setDefaultOpen] = useState(initial.defaultOpen);
  useEffect(() => {
    if (open) { setTitle(initial.title); setDefaultOpen(initial.defaultOpen); }
  }, [open, initial.title, initial.defaultOpen]);
  const save = () => onSave({ title: title.trim() || DEFAULT_COLLAPSIBLE.title, defaultOpen });
  return <ModalCard open={open} title="펼침·접힘 영역 설정" onClose={onClose}
    actions={<><button type="button" className="rd-btn secondary" onClick={onClose}>취소</button><button type="button" className="rd-btn primary" onClick={save}>확인</button></>}>
    <label>영역 제목<input className="rd-input" value={title} maxLength={200} onChange={event => setTitle(event.target.value)} /></label>
    <label>문서를 열었을 때<select className="rd-input" value={defaultOpen ? 'open' : 'closed'} onChange={event => setDefaultOpen(event.target.value === 'open')}>
      <option value="open">펼침</option><option value="closed">접힘</option>
    </select></label>
    <p>선택한 본문을 한 영역으로 묶습니다. 제목을 누르면 내용을 펼치거나 접을 수 있습니다.</p>
  </ModalCard>;
}

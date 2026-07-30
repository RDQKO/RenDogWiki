'use client';

import React from 'react';
import type { RenderElementProps } from 'slate-react';

type EmbedPlaceholderEditorAdapterProps = {
  attributes: RenderElementProps['attributes'];
  children: React.ReactNode;
  element: any;
};

function getEmbedInfo(element: any) {
  if (element.type === 'quest-embed') {
    return {
      label: '퀘스트',
      id: element.questId,
    };
  }

  if (element.type === 'npc-embed') {
    return {
      label: 'NPC',
      id: element.npcId,
    };
  }

  return {
    label: 'QNA',
    id: element.qnaId,
  };
}

export default function EmbedPlaceholderEditorAdapter({
  attributes,
  children,
  element,
}: EmbedPlaceholderEditorAdapterProps) {
  const { label, id } = getEmbedInfo(element);

  return (
    <div
      {...attributes}
      contentEditable={false}
      className="wiki-embed-placeholder"
    >
      <strong>{label} 삽입</strong>
      <div>ID: {String(id ?? '-')}</div>
      <div>나중에 id로 데이터 로드</div>
      {children}
    </div>
  );
}

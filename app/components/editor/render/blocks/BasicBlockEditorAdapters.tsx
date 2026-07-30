'use client';

import React from 'react';
import type {
  RenderElementProps,
} from 'slate-react';
import {
  ReactEditor,
  useSlateStatic,
} from 'slate-react';

import {
  DividerBlock,
  InfoBoxBlock,
} from '@/components/wiki-render';
import {
  resolveDividerStyle,
  resolveInfoBoxNoIcon,
  resolveInfoBoxTone,
} from '@/components/wiki-render/blocks/blockNodeUtils';

type EditorBlockAdapterProps = {
  attributes:
    RenderElementProps['attributes'];
  children: React.ReactNode;
  element: any;
};

export function DividerEditorAdapter({
  attributes,
  children,
  element,
}: EditorBlockAdapterProps) {
  const editor = useSlateStatic();

  const handleContextMenu = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    try {
      const path = ReactEditor.findPath(
        editor as ReactEditor,
        element,
      );

      window.dispatchEvent(
        new CustomEvent('editor:divider-menu', {
          detail: {
            x: event.clientX,
            y: event.clientY,
            path: [...path],
          },
        }),
      );
    } catch (error) {
      console.error('구분선 메뉴 경로 확인 실패', error);
    }
  };

  return (
    <DividerBlock
      mode="edit"
      styleType={
        resolveDividerStyle(element)
      }
      attributes={
        {
          ...attributes,
          onContextMenu: handleContextMenu,
        } as any
      }
    >
      {children}
    </DividerBlock>
  );
}

export function InfoBoxEditorAdapter({
  attributes,
  children,
  element,
}: EditorBlockAdapterProps) {
  const editor = useSlateStatic();

  const handleContextMenu = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    try {
      const path = ReactEditor.findPath(
        editor as ReactEditor,
        element,
      );

      window.dispatchEvent(
        new CustomEvent('editor:info-box-menu', {
          detail: {
            x: event.clientX,
            y: event.clientY,
            path: [...path],
          },
        }),
      );
    } catch (error) {
      console.error(
        '정보박스 메뉴 경로 확인 실패',
        error,
      );
    }
  };

  return (
    <InfoBoxBlock
      mode="edit"
      tone={
        resolveInfoBoxTone(element)
      }
      noIcon={
        resolveInfoBoxNoIcon(element)
      }
      attributes={
        {
          ...attributes,
          onContextMenu: handleContextMenu,
        } as any
      }
    >
      {children}
    </InfoBoxBlock>
  );
}

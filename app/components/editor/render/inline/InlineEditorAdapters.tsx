'use client';

import React from 'react';

import type {
  RenderElementProps,
} from 'slate-react';
import {
  ReactEditor,
  useSlateStatic,
} from 'slate-react';

import type {
  InlineImageElement,
  InlineMarkElement,
} from '@/types/slate';

import {
  InlineImage,
  InlineMark,
  WikiRefInline,
} from '@/components/wiki-render';
import {
  resolveInlineImageNode,
  resolveInlineMarkNode,
  resolveWikiRefNode,
} from '@/components/wiki-render/inline/inlineNodeUtils';
import type {
  WikiRefKind,
} from '@/components/wiki-render/types';

import { toProxyUrl } from '@lib/cdn';

type InlineAdapterProps<E> = {
  attributes: RenderElementProps['attributes'];
  children: React.ReactNode;
  element: E;
};

export function InlineImageEditorAdapter({
  attributes,
  children,
  element,
}: InlineAdapterProps<InlineImageElement>) {
  const editor = useSlateStatic();
  const {
    rawSrc,
    width,
    height,
  } = resolveInlineImageNode(element as any);

  const src = rawSrc.startsWith('http')
    ? toProxyUrl(rawSrc)
    : rawSrc;

  const handleContextMenu = (
    event: React.MouseEvent<HTMLSpanElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    try {
      const path =
        ReactEditor.findPath(
          editor as ReactEditor,
          element,
        );

      window.dispatchEvent(
        new CustomEvent('editor:image-menu', {
          detail: {
            x: event.clientX,
            y: event.clientY,
            kind: 'inline',
            path: [...path],
          },
        }),
      );
    } catch (error) {
      console.error(
        '인라인 이미지 메뉴 경로 확인 실패',
        error,
      );
    }
  };

  return (
    <InlineImage
      mode="edit"
      src={src}
      width={width}
      height={height}
      attributes={
        {
          ...attributes,
          onContextMenu:
            handleContextMenu,
        } as React.HTMLAttributes<HTMLSpanElement>
      }
    >
      {children}
    </InlineImage>
  );
}

export function InlineMarkEditorAdapter({
  attributes,
  children,
  element,
}: InlineAdapterProps<InlineMarkElement>) {
  const {
    icon,
    color,
  } = resolveInlineMarkNode(element as any);

  return (
    <InlineMark
      mode="edit"
      icon={icon}
      color={color}
      attributes={
        attributes as React.HTMLAttributes<HTMLSpanElement>
      }
    >
      {children}
    </InlineMark>
  );
}

type WikiRefEditorAdapterProps = {
  attributes: RenderElementProps['attributes'];
  children: React.ReactNode;
  element: any;
  readOnly?: boolean;
  onWikiRefClick?: (
    kind: WikiRefKind,
    id: number,
  ) => void;
  onOpenWikiRef?: (
    kind: WikiRefKind,
    id: number,
  ) => void;
};

export function WikiRefEditorAdapter({
  attributes,
  children,
  element,
  readOnly,
  onWikiRefClick,
  onOpenWikiRef,
}: WikiRefEditorAdapterProps) {
  const {
    kind,
    id: refId,
  } = resolveWikiRefNode(element);

  const open =
    onWikiRefClick ?? onOpenWikiRef;

  return (
    <WikiRefInline
      mode="edit"
      attributes={
        attributes as React.HTMLAttributes<HTMLSpanElement>
      }
      contentEditable={!readOnly}
      clickable={Boolean(
        readOnly &&
        open &&
        Number.isFinite(refId),
      )}
      onOpen={() => {
        if (!readOnly) return;
        if (!open) return;

        open(kind, refId);
      }}
    >
      {children}
    </WikiRefInline>
  );
}

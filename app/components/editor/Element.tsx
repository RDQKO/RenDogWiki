'use client';

import React from 'react';
import { RenderElementProps, useSlate } from 'slate-react';

import type {
  InlineMarkElement,
  InlineImageElement,
  FootnoteElement,
  PriceTableCardElement,
  CustomElement,
  LinkBlockElement,
  HeadingOneElement,
  HeadingTwoElement,
  HeadingThreeElement,
  ParagraphElement,
  TableElement,
  VideoElement,
  WeaponCardElement,
} from '@/types/slate';

import type { ElementRenderProps } from './render/types';

import {
  InlineLinkRenderer,
} from '@/components/wiki-render';

import ParagraphEditorAdapter from './render/blocks/ParagraphEditorAdapter';
import HeadingEditorAdapter from './render/blocks/HeadingEditorAdapter';
import {
  DividerEditorAdapter,
  InfoBoxEditorAdapter,
} from './render/blocks/BasicBlockEditorAdapters';

import LinkBlockEditorAdapter from './render/link/LinkBlockEditorAdapter';
import LinkBlockRowEditorAdapter from './render/link/LinkBlockRowEditorAdapter';

import { ImageBlock, VideoBlock } from './render/media/MediaEditorBlocks';

import FootnoteEditorAdapter from './render/inline/FootnoteEditorAdapter';
import {
  InlineImageEditorAdapter,
  InlineMarkEditorAdapter,
  WikiRefEditorAdapter,
} from './render/inline/InlineEditorAdapters';

import PriceTableEditorAdapter from './render/price-table/PriceTableEditorAdapter';
import {
  TableEditorAdapter,
  TableRowEditorAdapter,
  TableCellEditorAdapter,
} from './render/table/TableEditorAdapter';
import WeaponEditorAdapter from './render/weapon/WeaponEditorAdapter';

import EmbedPlaceholderEditorAdapter from './render/embed/EmbedPlaceholderEditorAdapter';

export type ElementProps = RenderElementProps & {
  editor: any;
  onIconClick: (element: CustomElement) => void;
};

const Element: React.FC<ElementRenderProps> = ({
  attributes,
  children,
  element,
  editor,
  onIconClick,
  openFootnoteEditor,
  readOnly,
  onWikiRefClick,
  onOpenWikiRef,
}) => {
  const slateEditor = useSlate();

  switch (element.type) {
    case 'link': {
      return (
        <InlineLinkRenderer
          mode="edit"
          href={(element as any).url}
          attributes={
            attributes as React.AnchorHTMLAttributes<HTMLAnchorElement>
          }
        >
          {children}
        </InlineLinkRenderer>
      );
    }

    case 'link-block': {
      return (
        <LinkBlockEditorAdapter
          attributes={attributes}
          element={element as LinkBlockElement}
          editor={editor}
        >
          {children}
        </LinkBlockEditorAdapter>
      );
    }

    case 'heading-one':
    case 'heading-two':
    case 'heading-three': {
      return (
        <HeadingEditorAdapter
          attributes={attributes}
          element={
            element as
              | HeadingOneElement
              | HeadingTwoElement
              | HeadingThreeElement
          }
          onIconClick={onIconClick}
        >
          {children}
        </HeadingEditorAdapter>
      );
    }

    case 'paragraph': {
      return (
        <ParagraphEditorAdapter
          attributes={attributes}
          element={element as ParagraphElement}
          editor={slateEditor}
        >
          {children}
        </ParagraphEditorAdapter>
      );
    }

    case 'divider': {
      return (
        <DividerEditorAdapter attributes={attributes} element={element}>
          {children}
        </DividerEditorAdapter>
      );
    }

    case 'info-box': {
      return (
        <InfoBoxEditorAdapter attributes={attributes} element={element}>
          {children}
        </InfoBoxEditorAdapter>
      );
    }

    case 'image': {
      return (
        <ImageBlock
          attributes={attributes}
          element={element as any}
          editor={editor}
        >
          {children}
        </ImageBlock>
      );
    }

    case 'inline-image': {
      return (
        <InlineImageEditorAdapter
          attributes={attributes}
          element={element as InlineImageElement}
        >
          {children}
        </InlineImageEditorAdapter>
      );
    }

    case 'inline-mark': {
      return (
        <InlineMarkEditorAdapter
          attributes={attributes}
          element={element as InlineMarkElement}
        >
          {children}
        </InlineMarkEditorAdapter>
      );
    }

    case 'footnote': {
      return (
        <FootnoteEditorAdapter
          attributes={attributes}
          element={element as FootnoteElement}
          editor={editor}
          openFootnoteEditor={openFootnoteEditor}
        >
          {children}
        </FootnoteEditorAdapter>
      );
    }

    case 'price-table-card': {
      return (
        <PriceTableEditorAdapter
          attributes={attributes}
          element={element as PriceTableCardElement}
        >
          {children}
        </PriceTableEditorAdapter>
      );
    }

    case 'link-block-row': {
      return (
        <LinkBlockRowEditorAdapter attributes={attributes}>
          {children}
        </LinkBlockRowEditorAdapter>
      );
    }

    case 'table': {
      return (
        <TableEditorAdapter
          attributes={attributes}
          element={element as TableElement}
          editor={editor}
        >
          {children}
        </TableEditorAdapter>
      );
    }

    case 'table-row': {
      return (
        <TableRowEditorAdapter
          attributes={attributes}
          element={element as any}
        >
          {children}
        </TableRowEditorAdapter>
      );
    }

    case 'table-cell': {
      return (
        <TableCellEditorAdapter
          attributes={attributes}
          element={element as any}
          editor={editor}
        >
          {children}
        </TableCellEditorAdapter>
      );
    }

    case 'video': {
      return (
        <VideoBlock
          attributes={attributes}
          element={element as VideoElement}
          editor={editor}
        >
          {children}
        </VideoBlock>
      );
    }

    case 'quest-embed':
    case 'npc-embed':
    case 'qna-embed': {
      return (
        <EmbedPlaceholderEditorAdapter
          attributes={attributes}
          element={element}
        >
          {children}
        </EmbedPlaceholderEditorAdapter>
      );
    }

    case 'weapon-card': {
      return (
        <WeaponEditorAdapter
          attributes={attributes}
          element={element as WeaponCardElement}
          editor={editor}
        >
          {children}
        </WeaponEditorAdapter>
      );
    }

    case 'wiki-ref': {
      return (
        <WikiRefEditorAdapter
          attributes={attributes}
          element={element}
          readOnly={readOnly}
          onWikiRefClick={onWikiRefClick}
          onOpenWikiRef={onOpenWikiRef}
        >
          {children}
        </WikiRefEditorAdapter>
      );
    }

    default: {
      const el = element as any;
      const textAlign = 'textAlign' in el ? el.textAlign : 'left';

      if (
        Array.isArray(children) &&
        children.length === 1 &&
        typeof children[0] === 'string'
      ) {
        return <span {...attributes}>{children}</span>;
      }

      return React.createElement(
        'p',
        {
          ...attributes,
          style: { textAlign },
        },
        children,
      );
    }
  }
};

export default Element;

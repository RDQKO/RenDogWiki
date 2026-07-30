'use client';

import React, { useState } from 'react';
import {
  ReactEditor,
  useSlateStatic,
} from 'slate-react';
import type {
  RenderElementProps,
} from 'slate-react';
import {
  Editor,
  Transforms,
} from 'slate';

import ImageSelectModal from '@/components/image/ImageSelectModal';
import {
  PriceTableRenderer,
  WikiBlockFrame,
} from '@/components/wiki-render';

import {
  toProxyUrl,
} from '@lib/cdn';

import type {
  PriceTableCardElement,
} from '@/types/slate';

import {
  useLivePriceTableItems,
} from '@/components/wiki-render/price-table/useLivePriceTableItems';
import {
  usePriceTableStageState,
} from '@/components/wiki-render/price-table/usePriceTableStageState';

import PriceItemSelectModal from '../../PriceItemSelectModal';

import {
  usePriceTableBlockGuard,
} from './usePriceTableBlockGuard';
import {
  usePriceTableEditorActions,
} from './usePriceTableEditorActions';

export interface PriceTableEditorAdapterProps {
  attributes:
    RenderElementProps['attributes'];
  children: React.ReactNode;
  element: PriceTableCardElement;
}

export default function PriceTableEditorAdapter({
  attributes,
  children,
  element,
}: PriceTableEditorAdapterProps) {
  const editor =
    useSlateStatic();

  const el =
    element as PriceTableCardElement;

  usePriceTableBlockGuard(editor);

  const sourceItems =
    Array.isArray(el.items)
      ? el.items
      : [];

  const [
    imageEditIndex,
    setImageEditIndex,
  ] = useState<number | null>(null);

  const [
    selectEditIndex,
    setSelectEditIndex,
  ] = useState<number | null>(null);

  const {
    handleImageSelected,
    handlePickItem,
    removeBlock,
  } = usePriceTableEditorActions({
    editor,
    element: el,
    imageEditIndex,
    setImageEditIndex,
    selectEditIndex,
    setSelectEditIndex,
  });

  const viewItems =
    useLivePriceTableItems(
      sourceItems as any[],
    );

  const {
    hoveredIndex: hovered,
    setHoveredIndex: setHovered,
    stageIndexes: stageIdxArr,
    onPrevStage: handlePrev,
    onNextStage: handleNext,
  } = usePriceTableStageState(
    sourceItems,
  );

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
        new CustomEvent('editor:price-table-menu', {
          detail: {
            x: event.clientX,
            y: event.clientY,
            path: [...path],
          },
        }),
      );
    } catch (error) {
      console.error(
        '시세표 메뉴 경로 확인 실패',
        error,
      );
    }
  };

  const handleMouseDown = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) return;

    const target =
      event.target instanceof Element
        ? event.target
        : null;
    const interactiveTarget = target?.closest(
      [
        'button',
        'a',
        'input',
        'textarea',
        'select',
        '[role="button"]',
        '.price-table-card__image--editable',
        '.price-table-card__name--editable',
      ].join(','),
    );

    if (interactiveTarget) return;

    event.preventDefault();
    event.stopPropagation();

    try {
      const path = ReactEditor.findPath(
        editor as ReactEditor,
        element,
      );

      Transforms.select(
        editor,
        Editor.start(editor, path),
      );
      ReactEditor.focus(editor as ReactEditor);
    } catch (error) {
      console.error(
        '시세표 선택 위치 복원 실패',
        error,
      );
    }
  };

  const deleteButton = (
    <button
      type="button"
      aria-label="시세표 블럭 삭제"
      title="시세표 블럭 삭제"
      tabIndex={-1}
      onMouseDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        removeBlock();
      }}
      className="wiki-editor-floating-action wiki-editor-floating-action--small wiki-editor-floating-action--danger"
    >
      ×
    </button>
  );

  const content = (
    <>
      <PriceTableRenderer
        mode="edit"
        items={viewItems}
        stageIndexes={stageIdxArr}
        hoveredIndex={hovered}
        onHoverIndexChange={
          setHovered
        }
        onPrevStage={handlePrev}
        onNextStage={handleNext}
        resolveImageSrc={(src) =>
          src.startsWith('http')
            ? toProxyUrl(src)
            : src
        }
        onImageClick={(
          _,
          index,
          event,
        ) => {
          event.stopPropagation();
          setImageEditIndex(index);
        }}
        onNameClick={(
          _,
          index,
          event,
        ) => {
          event.stopPropagation();

          try {
            Transforms.deselect(editor);
          } catch {}

          setSelectEditIndex(index);
        }}
      >
        {children}
      </PriceTableRenderer>

      <ImageSelectModal
        open={
          imageEditIndex != null
        }
        onClose={() =>
          setImageEditIndex(null)
        }
        onSelectImage={
          handleImageSelected
        }
      />

      <PriceItemSelectModal
        open={
          selectEditIndex != null
        }
        onClose={() =>
          setSelectEditIndex(null)
        }
        onSelect={handlePickItem}
      />
    </>
  );

  return (
    <WikiBlockFrame
      mode="edit"
      editClassName="wiki-price-table-edit"
      readClassName="wiki-price-table-read"
      attributes={
        {
          ...attributes,
          onContextMenu:
            handleContextMenu,
          onMouseDown:
            handleMouseDown,
        } as React.HTMLAttributes<HTMLDivElement>
      }
      content={content}
      editControls={deleteButton}
    />
  );
}

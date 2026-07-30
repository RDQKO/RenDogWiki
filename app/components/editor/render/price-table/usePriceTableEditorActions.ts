'use client';

import React from 'react';
import { ReactEditor } from 'slate-react';
import { Editor, Transforms } from 'slate';

import type { PriceTableCardElement } from '@/types/slate';

import {
  normalizePickedPrices,
  type PickedPriceItem,
} from '@/components/wiki-render/price-table/priceTableLiveService';

type UsePriceTableEditorActionsArgs = {
  editor: any;
  element: PriceTableCardElement;

  imageEditIndex: number | null;
  setImageEditIndex: React.Dispatch<React.SetStateAction<number | null>>;

  selectEditIndex: number | null;
  setSelectEditIndex: React.Dispatch<React.SetStateAction<number | null>>;
};

export function usePriceTableEditorActions({
  editor,
  element,
  imageEditIndex,
  setImageEditIndex,
  selectEditIndex,
  setSelectEditIndex,
}: UsePriceTableEditorActionsArgs) {
  const path = ReactEditor.findPath(editor, element);

  const patchItemAt = React.useCallback(
    (idx: number, patch: Record<string, any>) => {
      const current = Editor.node(editor, path)[0] as PriceTableCardElement;
      const currentItems = Array.isArray(current.items) ? current.items : [];

      const nextItems = currentItems.map((item: any, i: number) =>
        i === idx ? { ...item, ...patch } : item,
      );

      Transforms.setNodes(
        editor,
        {
          items: nextItems,
        } as Partial<PriceTableCardElement>,
        { at: path },
      );
    },
    [editor, path],
  );

  const handleImageSelected = React.useCallback(
    (url: string) => {
      if (imageEditIndex == null) return;

      patchItemAt(imageEditIndex, { image: url });
      setImageEditIndex(null);
    },
    [imageEditIndex, patchItemAt, setImageEditIndex],
  );

  const handlePickItem = React.useCallback(
    (picked: PickedPriceItem) => {
      if (selectEditIndex == null) return;

      const normalized = normalizePickedPrices(picked);

      patchItemAt(selectEditIndex, {
        id: picked.id,
        name: picked.name,
        name_key: picked.name_key,
        mode: picked.mode,
        stages: normalized.stages,
        prices: normalized.prices,
      });

      setSelectEditIndex(null);
    },
    [selectEditIndex, patchItemAt, setSelectEditIndex],
  );

  const removeBlock = React.useCallback(() => {
    const pathToRemove = ReactEditor.findPath(editor, element);

    Editor.withoutNormalizing(editor, () => {
      Transforms.removeNodes(editor, { at: pathToRemove });

      if (editor.children.length === 0) {
        Transforms.insertNodes(
          editor,
          {
            type: 'paragraph',
            children: [{ text: '' }],
          } as any,
          { at: [0] },
        );
      }
    });
  }, [editor, element]);

  return {
    path,
    patchItemAt,
    handleImageSelected,
    handlePickItem,
    removeBlock,
  };
}

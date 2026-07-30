'use client';

import React, {
  useRef,
  useState,
} from 'react';
import type {
  RenderElementProps,
} from 'slate-react';
import {
  ReactEditor,
  useFocused,
  useSelected,
} from 'slate-react';
import {
  Transforms,
} from 'slate';

import ImageSizeModal from '../../ImageSizeModal';

import {
  MediaBlock,
} from '@/components/wiki-render';
import {
  resolveMediaNode,
} from '@/components/wiki-render/blocks/mediaNodeUtils';

import type {
  VideoElement,
} from '@/types/slate';

type BlockComponentProps<E = any> = {
  attributes: RenderElementProps['attributes'];
  children: React.ReactNode;
  element: E;
  editor: any;
};

function EditIcon({
  size = 18,
  color = 'currentColor',
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4 20h4.2L19.3 8.9a1.5 1.5 0 0 0 0-2.1l-2.1-2.1a1.5 1.5 0 0 0-2.1 0L4 15.8V20Z"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path
        d="M13.8 6L18 10.2"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ImageBlock({
  attributes,
  children,
  element,
  editor,
}: BlockComponentProps<any>) {
  const selected = useSelected();
  const focused = useFocused();

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);

  const imgRef =
    useRef<HTMLImageElement | null>(null);

  const [
    initSize,
    setInitSize,
  ] = useState<{
    w?: number;
    h?: number;
  }>({});

  const media =
    resolveMediaNode(element);

  // 에디터에서도 저장된 원본 URL을 그대로 사용한다.
  // 프록시 변환 과정에서 저해상도 응답이 선택되는 문제를 피한다.
  const imgSrc = media.rawSrc;

  const handleContextMenu = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    event.nativeEvent.stopImmediatePropagation();

    try {
      const path =
        ReactEditor.findPath(
          editor,
          element,
        );
      window.dispatchEvent(
        new CustomEvent('editor:image-menu', {
          detail: {
            x: event.clientX,
            y: event.clientY,
            kind: 'block',
            path: [...path],
          },
        }),
      );
    } catch (error) {
      console.error(
        '사진 메뉴 경로 확인 실패',
        error,
      );
    }
  };

  const handleSaveSize = (
    width: number,
    height: number,
  ) => {
    const path =
      ReactEditor.findPath(
        editor,
        element,
      );

    Transforms.setNodes(
      editor,
      {
        width,
        height,
      },
      {
        at: path,
      },
    );

    setModalOpen(false);
  };

  const openSizeModal = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const image = imgRef.current;
    const renderedWidth = Math.round(
      image
        ?.getBoundingClientRect()
        .width ?? 0,
    );

    const renderedHeight = Math.round(
      image
        ?.getBoundingClientRect()
        .height ?? 0,
    );

    const naturalWidth =
      image?.naturalWidth ?? 0;

    const naturalHeight =
      image?.naturalHeight ?? 0;

    setInitSize({
      w:
        media.width ??
        (
          renderedWidth ||
          naturalWidth ||
          256
        ),
      h:
        media.height ??
        (
          renderedHeight ||
          naturalHeight ||
          256
        ),
    });

    setModalOpen(true);
  };

  return (
    <>
      <MediaBlock
        mode="edit"
        kind="image"
        src={imgSrc}
        alt={media.alt}
        textAlign={media.textAlign}
        width={media.width}
        height={media.height}
        selected={selected}
        focused={focused}
        attributes={
          {
            ...attributes,
            onContextMenu:
              handleContextMenu,
          } as React.HTMLAttributes<HTMLDivElement>
        }
        imageRef={imgRef}
        editControls={
          selected ? (
            <button
              type="button"
              onMouseDown={openSizeModal}
              className="wiki-editor-floating-action wiki-editor-media-size-action"
              tabIndex={-1}
              title="이미지 크기 편집"
              contentEditable={false}
            >
              <EditIcon />
            </button>
          ) : null
        }
      >
        {children}
      </MediaBlock>
      <ImageSizeModal
        open={modalOpen}
        width={initSize.w}
        height={initSize.h}
        onSave={handleSaveSize}
        onClose={() => {
          setModalOpen(false);
        }}
      />
    </>
  );
}

export function VideoBlock({
  attributes,
  children,
  element,
  editor,
}: BlockComponentProps<VideoElement>) {
  const selected = useSelected();
  const focused = useFocused();

  const [
    modalOpen,
    setModalOpen,
  ] = useState(false);
  const media =
    resolveMediaNode(
      element as unknown as Record<
        string,
        unknown
      >,
    );

  const src = media.rawSrc;

  const handleSaveSize = (
    width: number,
    height: number,
  ) => {
    const path =
      ReactEditor.findPath(
        editor,
        element,
      );
    Transforms.setNodes(
      editor,
      {
        width,
        height,
      },
      {
        at: path,
      },
    );

    setModalOpen(false);
  };

  const openSizeModal = (
    event: React.MouseEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setModalOpen(true);
  };

  return (
    <>
      <MediaBlock
        mode="edit"
        kind="video"
        src={src}
        textAlign={media.textAlign}
        width={media.width}
        height={media.height}
        selected={selected}
        focused={focused}
        attributes={attributes}
        editControls={
          selected ? (
            <button
              type="button"
              onMouseDown={openSizeModal}
              className="wiki-editor-floating-action"
              tabIndex={-1}
              title="영상 크기 편집"
              contentEditable={false}
            >
              ⚙️
            </button>
          ) : null
        }
      >
        {children}
      </MediaBlock>
      <ImageSizeModal
        open={modalOpen}
        width={media.width}
        height={media.height}
        onSave={handleSaveSize}
        onClose={() => {
          setModalOpen(false);
        }}
      />
    </>
  );
}

'use client';

import React from 'react';
import {
  Editor,
  Node as SlateNode,
  Path,
  Transforms,
} from 'slate';
import {
  ReactEditor,
} from 'slate-react';
import type {
  RenderElementProps,
} from 'slate-react';

import {
  toProxyUrl,
} from '@lib/cdn';

import ImageSelectModal from '@/components/image/ImageSelectModal';
import {
  WeaponCardRenderer,
  WikiBlockFrame,
} from '@/components/wiki-render';
import {
  supportsWeaponVideo,
} from '@/components/wiki-render/weapon/weaponMeta';
import {
  resolveWeaponNode,
} from '@/components/wiki-render/weapon/weaponNodeUtils';
import type {
  WeaponImageRenderArgs,
} from '@/components/wiki-render/weapon/types';
import {
  useWeaponLevelSelection,
} from '@/components/wiki-render/weapon/weaponLevelSelection';

import type {
  WeaponCardElement,
  WeaponStatConfig,
  WeaponStatKey,
  WeaponType,
} from '@/types/slate';

import {
  WeaponNameEditModal,
  WeaponStatEditModal,
  WeaponStatSelectModal,
  WeaponTypeSelectModal,
  WeaponVideoModal,
} from './WeaponModals';
import {
  ensureWeaponStats,
  getWeaponLevelLabels,
  normalizeStatsForWeaponType,
  WEAPON_TYPES_META,
} from './weaponStatUtils';

export interface WeaponEditorAdapterProps {
  attributes:
    RenderElementProps['attributes'];
  children: React.ReactNode;
  element: WeaponCardElement;
  editor: any;
}

function cloneNode<T>(node: T): T {
  return JSON.parse(
    JSON.stringify(node),
  ) as T;
}

function encodeSlateFragment(
  fragment: WeaponCardElement[],
) {
  return window.btoa(
    encodeURIComponent(
      JSON.stringify(fragment),
    ),
  );
}

function escapeHtml(
  value: string,
) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function writeFormattedData(
  data: DataTransfer,
) {
  let copiedByEvent = false;

  const onCopy = (
    event: ClipboardEvent,
  ) => {
    if (!event.clipboardData) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();

    const types = [
      'text/plain',
      'text/html',
      'application/x-slate-fragment',
      'text/x-slate-fragment',
    ];

    for (const type of types) {
      const value =
        data.getData(type);

      if (!value) {
        continue;
      }

      try {
        event.clipboardData.setData(
          type,
          value,
        );
      } catch {
        // 사용자 정의 MIME을 지원하지 않는 브라우저에서도
        // HTML/일반 텍스트 복사는 유지한다.
      }
    }

    copiedByEvent = true;
  };

  document.addEventListener(
    'copy',
    onCopy,
    true,
  );

  try {
    document.execCommand('copy');
  } finally {
    document.removeEventListener(
      'copy',
      onCopy,
      true,
    );
  }

  if (copiedByEvent) {
    return;
  }

  const ClipboardItemConstructor =
    window.ClipboardItem;

  if (
    navigator.clipboard?.write &&
    ClipboardItemConstructor
  ) {
    const plain =
      data.getData('text/plain');
    const html =
      data.getData('text/html');
    const clipboardData: Record<
      string,
      Blob
    > = {
      'text/plain': new Blob(
        [plain],
        {
          type: 'text/plain',
        },
      ),
    };

    if (html) {
      clipboardData['text/html'] =
        new Blob(
          [html],
          {
            type: 'text/html',
          },
        );
    }

    await navigator.clipboard.write([
      new ClipboardItemConstructor(
        clipboardData,
      ),
    ]);
    return;
  }

  throw new Error(
    'formatted clipboard copy failed',
  );
}

function isWeaponCardElement(
  node: SlateNode,
): node is WeaponCardElement {
  return (
    'type' in node &&
    node.type === 'weapon-card'
  );
}

export default function WeaponEditorAdapter({
  attributes,
  children,
  element,
  editor,
}: WeaponEditorAdapterProps) {
  const el =
    element as WeaponCardElement;

  const path =
    ReactEditor.findPath(
      editor,
      element,
    );

  const isReadOnly =
    ReactEditor.isReadOnly(editor);

  const resolvedWeapon =
    resolveWeaponNode(
      el as unknown as Record<
        string,
        unknown
      >,
    );

  const weaponType: WeaponType =
    resolvedWeapon.weaponType;

  const supportsVideo =
    resolvedWeapon.supportsVideo;

  const meta =
    WEAPON_TYPES_META[weaponType] ??
    WEAPON_TYPES_META.epic;

  const stats =
    ensureWeaponStats(
      el.stats,
      weaponType,
    );

  const visibleStats =
    stats.filter(
      (stat) => stat.enabled,
    );

  const levelLabels =
    React.useMemo(
      () =>
        getWeaponLevelLabels(
          weaponType,
        ),
      [weaponType],
    );

  const {
    selectedLevelIndex,
    setSelectedLevelIndex,
  } = useWeaponLevelSelection(
    levelLabels,
    weaponType,
  );

  const [
    typeModalOpen,
    setTypeModalOpen,
  ] = React.useState(false);

  const [
    nameModalOpen,
    setNameModalOpen,
  ] = React.useState(false);

  const [
    imageModalOpen,
    setImageModalOpen,
  ] = React.useState(false);

  const [
    videoSelectOpen,
    setVideoSelectOpen,
  ] = React.useState(false);

  const [
    videoModalOpen,
    setVideoModalOpen,
  ] = React.useState(false);

  const [
    statEditKey,
    setStatEditKey,
  ] = React.useState<
    WeaponStatKey | null
  >(null);

  const [
    statSelectOpen,
    setStatSelectOpen,
  ] = React.useState(false);

  const [
    contextMenuPos,
    setContextMenuPos,
  ] = React.useState<{
    x: number;
    y: number;
  } | null>(null);

  const updateElement =
    React.useCallback(
      (
        patch:
          Partial<WeaponCardElement>,
      ) => {
        Transforms.setNodes(
          editor,
          patch,
          {
            at: path,
          },
        );
      },
      [
        editor,
        path,
      ],
    );

  const handleWeaponTypeChange =
    React.useCallback(
      (
        next: WeaponType,
      ) => {
        if (
          next === weaponType
        ) {
          return;
        }

        const nextStats =
          normalizeStatsForWeaponType(
            stats,
            next,
          );

        const nextSupportsVideo =
          supportsWeaponVideo(next);

        updateElement({
          weaponType: next,
          stats: nextStats,
          ...(
            nextSupportsVideo
              ? {}
              : {
                  videoUrl: null,
                }
          ),
        });

        if (
          !nextSupportsVideo
        ) {
          setVideoSelectOpen(false);
          setVideoModalOpen(false);
        }
      },
      [
        stats,
        updateElement,
        weaponType,
      ],
    );

  const handleSaveStat =
    React.useCallback(
      (
        updated:
          WeaponStatConfig,
      ) => {
        const nextStats =
          stats.map(
            (stat) =>
              stat.key ===
              updated.key
                ? updated
                : stat,
          );

        updateElement({
          stats: nextStats,
        });
      },
      [
        stats,
        updateElement,
      ],
    );

  const handleSaveStatsSelection =
    React.useCallback(
      (
        nextStats:
          WeaponStatConfig[],
      ) => {
        updateElement({
          stats:
            normalizeStatsForWeaponType(
              nextStats,
              weaponType,
            ),
        });
      },
      [
        updateElement,
        weaponType,
      ],
    );

  const handleImageSelected =
    React.useCallback(
      (
        url: string,
      ) => {
        updateElement({
          imageUrl: url,
        });

        setImageModalOpen(false);
      },
      [updateElement],
    );

  const handleVideoSelected =
    React.useCallback(
      (
        url: string,
      ) => {
        if (
          !supportsVideo
        ) {
          return;
        }

        updateElement({
          videoUrl: url,
        });

        setVideoSelectOpen(false);
      },
      [
        supportsVideo,
        updateElement,
      ],
    );

  const rawVideoUrl =
    resolvedWeapon.rawVideo;

  const rawImageUrl =
    resolvedWeapon.rawImage;

  const videoSrc =
    supportsVideo &&
    rawVideoUrl
      ? rawVideoUrl.startsWith(
          'http',
        )
        ? toProxyUrl(
            rawVideoUrl,
          )
        : rawVideoUrl
      : '';

  const imageSrc =
    rawImageUrl
      ? rawImageUrl.startsWith(
          'http',
        )
        ? toProxyUrl(
            rawImageUrl,
          )
        : rawImageUrl
      : '';

  const showConfigButtons =
    !isReadOnly;

  const handleOpenContextMenu =
    React.useCallback(
      (
        event:
          React.MouseEvent,
      ) => {
        if (isReadOnly) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        setContextMenuPos({
          x: event.clientX,
          y: event.clientY,
        });
      },
      [isReadOnly],
    );

  const copyWeaponCard =
    React.useCallback(
      async () => {
        try {
          if (
            !Editor.hasPath(
              editor,
              path,
            )
          ) {
            return;
          }

          const node =
            SlateNode.get(
              editor,
              path,
            );

          if (
            !isWeaponCardElement(
              node,
            )
          ) {
            return;
          }

          const copiedNode =
            cloneNode(node);
          const encoded =
            encodeSlateFragment([
              copiedNode,
            ]);
          const plainText =
            String(
              copiedNode.name ??
                '',
            ).trim() ||
            '무기 카드';
          const data =
            new DataTransfer();

          data.setData(
            'application/x-slate-fragment',
            encoded,
          );
          data.setData(
            'text/x-slate-fragment',
            encoded,
          );
          data.setData(
            'text/plain',
            plainText,
          );
          data.setData(
            'text/html',
            `<div data-slate-fragment="${encoded}">${escapeHtml(
              plainText,
            )}</div>`,
          );

          await writeFormattedData(
            data,
          );
        } catch (error) {
          console.error(
            '무기 카드 복사 실패',
            error,
          );
          alert(
            '무기 카드 복사에 실패했습니다.',
          );
        } finally {
          setContextMenuPos(
            null,
          );
        }
      },
      [
        editor,
        path,
      ],
    );

  const insertParagraphAfterWeaponCard =
    React.useCallback(
      () => {
        try {
          if (
            !Editor.hasPath(
              editor,
              path,
            )
          ) {
            return;
          }

          const node =
            SlateNode.get(
              editor,
              path,
            );

          if (
            !isWeaponCardElement(
              node,
            )
          ) {
            return;
          }

          const insertPath =
            Path.next(path);

          Transforms.insertNodes(
            editor,
            {
              type: 'paragraph',
              children: [
                { text: '' },
              ],
            } as any,
            {
              at: insertPath,
            },
          );
          Transforms.select(
            editor,
            Editor.start(
              editor,
              insertPath,
            ),
          );
          ReactEditor.focus(
            editor,
          );
        } catch (error) {
          console.error(
            '무기 카드 아래 빈 문단 생성 실패',
            error,
          );
        } finally {
          setContextMenuPos(
            null,
          );
        }
      },
      [
        editor,
        path,
      ],
    );

  const deleteWeaponCard =
    React.useCallback(
      () => {
        try {
          if (
            !Editor.hasPath(
              editor,
              path,
            )
          ) {
            return;
          }

          const node =
            SlateNode.get(
              editor,
              path,
            );

          if (
            !isWeaponCardElement(
              node,
            )
          ) {
            return;
          }

          Editor.withoutNormalizing(
            editor,
            () => {
              Transforms.removeNodes(
                editor,
                {
                  at: path,
                },
              );

              if (
                editor.children
                  .length === 0
              ) {
                Transforms.insertNodes(
                  editor,
                  {
                    type: 'paragraph',
                    children: [
                      { text: '' },
                    ],
                  } as any,
                  {
                    at: [0],
                  },
                );
              }
            },
          );

          const nextPath =
            Editor.hasPath(
              editor,
              path,
            )
              ? path
              : null;
          const previousPath =
            path[
              path.length - 1
            ] > 0
              ? Path.previous(
                  path,
                )
              : null;
          const focusPath =
            nextPath ??
            (
              previousPath &&
              Editor.hasPath(
                editor,
                previousPath,
              )
                ? previousPath
                : []
            );

          Transforms.select(
            editor,
            Editor.start(
              editor,
              focusPath,
            ),
          );
          ReactEditor.focus(
            editor,
          );
        } catch (error) {
          console.error(
            '무기 카드 삭제 실패',
            error,
          );
        } finally {
          setContextMenuPos(
            null,
          );
        }
      },
      [
        editor,
        path,
      ],
    );

  const content = (
    <>
      <WeaponCardRenderer
        mode="edit"
        weapon={{
          ...el,
          weaponType,
          name:
            el.name || '',
          imageUrl:
            rawImageUrl,
          videoUrl:
            rawVideoUrl,
        }}
        meta={meta}
        stats={visibleStats}
        imageSrc={imageSrc}
        videoSrc={videoSrc}
        supportsVideo={
          supportsVideo
        }
        selectedLevelIndex={
          selectedLevelIndex
        }
        levelLabels={
          levelLabels
        }
        onLevelChange={
          setSelectedLevelIndex
        }
        onContextMenu={
          handleOpenContextMenu
        }
        onTypeClick={
          showConfigButtons
            ? () => {
                setTypeModalOpen(
                  true,
                );
              }
            : undefined
        }
        onNameClick={
          showConfigButtons
            ? () => {
                setNameModalOpen(
                  true,
                );
              }
            : undefined
        }
        onImageClick={
          showConfigButtons
            ? () => {
                setImageModalOpen(
                  true,
                );
              }
            : undefined
        }
        onStatClick={
          showConfigButtons
            ? (stat) => {
                if (
                  !stat.key
                ) {
                  return;
                }

                setStatEditKey(
                  stat.key as
                    WeaponStatKey,
                );
              }
            : undefined
        }
        onVideoClick={() => {
          if (videoSrc) {
            setVideoModalOpen(
              true,
            );
          }
        }}
        onVideoSettingClick={
          showConfigButtons &&
          supportsVideo
            ? () => {
                setVideoSelectOpen(
                  true,
                );
              }
            : undefined
        }
        onStatSettingClick={
          showConfigButtons
            ? () => {
                setStatSelectOpen(
                  true,
                );
              }
            : undefined
        }
        renderImage={({
          src,
          alt,
          width,
          height,
          style,
        }: WeaponImageRenderArgs) => (
          <img
            src={src}
            alt={alt}
            width={width}
            height={height}
            loading="lazy"
            decoding="async"
            draggable={false}
            style={style}
          />
        )}
      >
        {children}
      </WeaponCardRenderer>

      {!isReadOnly &&
      contextMenuPos ? (
        <div
          contentEditable={false}
          suppressContentEditableWarning
          onClick={() =>
            setContextMenuPos(
              null,
            )
          }
          onContextMenu={(
            event,
          ) => {
            event.preventDefault();

            setContextMenuPos(
              null,
            );
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9998,
          }}
        >
          <div
            onClick={(
              event,
            ) =>
              event.stopPropagation()
            }
            style={{
              position: 'fixed',
              left:
                contextMenuPos.x,
              top:
                contextMenuPos.y,
              minWidth: 150,
              padding: 6,
              borderRadius: 10,
              border:
                '1px solid #334155',
              background:
                '#020617',
              boxShadow:
                '0 18px 40px rgba(0,0,0,.45)',
              color:
                '#e5e7eb',
              zIndex: 9999,
            }}
          >
            <button
              type="button"
              onMouseDown={(
                event,
              ) => {
                event.preventDefault();
              }}
              onClick={(
                event,
              ) => {
                event.stopPropagation();

                void copyWeaponCard(
                );
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding:
                  '6px 12px',
                border: 'none',
                borderRadius: 8,
                background:
                  'transparent',
                color: '#e5e7eb',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              무기 카드 복사
            </button>

            <button
              type="button"
              onMouseDown={(
                event,
              ) => {
                event.preventDefault();
              }}
              onClick={(
                event,
              ) => {
                event.stopPropagation();

                insertParagraphAfterWeaponCard();
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding:
                  '6px 12px',
                border: 'none',
                borderRadius: 8,
                background:
                  'transparent',
                color: '#e5e7eb',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              아래에 빈 문단 생성
            </button>

            <div
              style={{
                height: 1,
                margin: '4px 6px',
                background:
                  '#334155',
              }}
            />

            <button
              type="button"
              onMouseDown={(
                event,
              ) => {
                event.preventDefault();
              }}
              onClick={(
                event,
              ) => {
                event.stopPropagation();

                deleteWeaponCard();
              }}
              style={{
                width: '100%',
                textAlign: 'left',
                padding:
                  '6px 12px',
                border: 'none',
                borderRadius: 8,
                background:
                  'transparent',
                color: '#fca5a5',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              무기 카드 삭제
            </button>
          </div>
        </div>
      ) : null}

      <WeaponTypeSelectModal
        open={typeModalOpen}
        currentType={
          weaponType
        }
        onClose={() =>
          setTypeModalOpen(
            false,
          )
        }
        onSelect={(type) => {
          handleWeaponTypeChange(
            type,
          );

          setTypeModalOpen(
            false,
          );
        }}
      />

      <WeaponNameEditModal
        open={nameModalOpen}
        initialName={
          el.name || ''
        }
        onClose={() =>
          setNameModalOpen(
            false,
          )
        }
        onSave={(name) => {
          updateElement({
            name,
          });

          setNameModalOpen(
            false,
          );
        }}
      />

      <ImageSelectModal
        open={imageModalOpen}
        onClose={() =>
          setImageModalOpen(
            false,
          )
        }
        onSelectImage={
          handleImageSelected
        }
      />

      {supportsVideo ? (
        <ImageSelectModal
          open={
            videoSelectOpen
          }
          onClose={() =>
            setVideoSelectOpen(
              false,
            )
          }
          onSelectImage={
            handleVideoSelected
          }
        />
      ) : null}

      <WeaponStatEditModal
        open={
          statEditKey != null
        }
        weaponType={
          weaponType
        }
        stats={stats}
        statKey={
          statEditKey
        }
        readOnly={
          isReadOnly
        }
        onClose={() =>
          setStatEditKey(
            null,
          )
        }
        onSave={(
          updated,
        ) => {
          handleSaveStat(
            updated,
          );

          setStatEditKey(
            null,
          );
        }}
      />

      <WeaponStatSelectModal
        open={
          statSelectOpen
        }
        weaponType={
          weaponType
        }
        stats={stats}
        onClose={() =>
          setStatSelectOpen(
            false,
          )
        }
        onSave={(
          nextStats,
        ) => {
          handleSaveStatsSelection(
            nextStats,
          );

          setStatSelectOpen(
            false,
          );
        }}
      />

      {supportsVideo ? (
        <WeaponVideoModal
          open={
            videoModalOpen
          }
          url={videoSrc}
          onClose={() =>
            setVideoModalOpen(
              false,
            )
          }
        />
      ) : null}
    </>
  );

  return (
    <WikiBlockFrame
      mode="edit"
      editClassName=
        "wiki-weapon-card-edit"
      readClassName=
        "wiki-weapon-card-read"
      attributes={
        attributes as
          React.HTMLAttributes<
            HTMLDivElement
          >
      }
      content={content}
    />
  );
}

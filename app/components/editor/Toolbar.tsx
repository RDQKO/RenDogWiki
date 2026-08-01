// =============================================
// File: app/components/editor/Toolbar.tsx
// =============================================

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSlate, ReactEditor } from 'slate-react';
import { Editor, Range, Transforms, Element as SlateElement } from 'slate';

import MarkButton from './MarkButton';
import DropdownButton from './DropdownButton';
import InfoBoxDropdown from './InfoBoxDropdown';
import {
  insertLink,
  insertLinkBlock,
  selectionIntersectsInlineLink,
} from './helpers/insertLink';
import { insertHeading } from './helpers/insertHeading';
import { insertDivider } from './helpers/insertDivider';
import { insertFootnote } from './helpers/insertFootnote';
import { toggleMark } from './helpers/toggleMark';
import '@/wiki/css/editor-toolbar.css';
import ImageSelectModal from '@/components/image/ImageSelectModal';
import { insertImage } from './helpers/insertImage';
import { insertMedia } from './helpers/insertMedia';
import { setImageAlignment } from './helpers/setImageAlignment';
import { InlineMarkElement } from '@/types/slate';
import LinkInputModal from './LinkInputModal';
import CustomColorDropdown from './CustomColorDropdown';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHeading, faFillDrip, faPalette, faTextHeight, faLink,
  faImage, faDollarSign, faFont, faTable,
  faAlignLeft, faMinus, faBold, faItalic, faUnderline, faStrikethrough,
  faGripLinesVertical, faIcons, faPhotoFilm,
} from '@fortawesome/free-solid-svg-icons';
import HeadingIconSelectModal from './HeadingIconSelectModal';
import { insertInlineImage } from './helpers/insertInlineImage';
import ImageUrlInputModal from './ImageUrlInputModal';
import PriceTableInsertModal from './PriceTableInsertModal';
import { insertWeaponInfo } from './helpers/insertWeaponInfo';
import TablePicker from './TablePicker';
import { insertTable } from './helpers/insertTable';

type ToolbarProps = {
  selectionRef: React.MutableRefObject<Range | null>;
  openInlineImageModalRef: React.MutableRefObject<(() => void) | null>;
};

const FONT_SIZES = ['11px', '13px', '15px', '16px', '19px', '24px', '28px', '30px', '34px', '38px'];

const FONT_FAMILIES = [
  { label: '기본서체',         value: 'inherit' },
  { label: '나눔고딕',         value: 'NanumGothic' },
  { label: '나눔스퀘어 네오',   value: 'NanumSquareNeo' },
  { label: '나눔스퀘어 라운딩', value: 'NanumSquareRound' },
  { label: '나눔바른고딕',     value: 'NanumBarunGothic' },
  { label: '나눔휴먼',         value: 'NanumHuman' },
  { label: '나눔손글씨 바른히피',  value: 'BareunHippy' },
  { label: '나눔손글씨 중학생',    value: 'NanumHandwritingMiddleSchool' },
];

const HEADINGS = [
  { label: '제목 1 추가', value: 'heading-one' },
  { label: '제목 2 추가', value: 'heading-two' },
  { label: '제목 3 추가', value: 'heading-three' },
];

const ALIGNMENTS = [
  { label: '왼쪽 정렬', value: 'left' },
  { label: '가운데 정렬', value: 'center' },
  { label: '오른쪽 정렬', value: 'right' },
  { label: '양쪽 정렬', value: 'justify' },
];

const IMAGE_ALIGNMENTS = [
  { label: '왼쪽', value: 'left' },
  { label: '가운데', value: 'center' },
  { label: '오른쪽', value: 'right' },
];

const DIVIDER_STYLES = [
  { label: '기본', value: 'default' },
  { label: '굵은선', value: 'bold' },
  { label: '짧은굵은선', value: 'shortbold' },
  { label: '점선', value: 'dotted' },
  { label: '다이아', value: 'diamond' },
  { label: '다이아 점선', value: 'diamonddot' },
  { label: '점 7개', value: 'dotdot' },
  { label: '슬래시', value: 'slash' },
  { label: '바', value: 'bar' },
];

const INLINE_MARKS = [
  { label: '중점', icon: '·', color: '#888' },
  { label: '대시', icon: '-', color: '#888' },
  { label: '화살표', icon: '→', color: '#888' },
  { label: '채운 삼각', icon: '▶', color: '#888' },
  { label: '주의', icon: '⚠️', color: '#e87e21' },
];

const INLINE_IMAGE_OPTIONS = ['업로드/선택', '링크 삽입'];

type MediaRow = {
  id: number;
  name: string;
  url: string;
  folder_id: number;
  mime_type?: string | null;
};

const isProbablyVideo = (url: string, mime?: string | null) => {
  if (mime && mime.startsWith('video/')) return true;
  const clean = url.split('?')[0].split('#')[0];
  const ext = clean.substring(clean.lastIndexOf('.') + 1).toLowerCase();
  return ['mp4', 'webm', 'ogg', 'mov', 'm4v', 'avi', 'mkv'].includes(ext);
};

const insertVideoNode = (editor: any, url: string) => {
  Transforms.insertNodes(editor, {
    type: 'video',
    url,
    width: 720,
    children: [{ text: '' }],
  } as any);
  try {
    ReactEditor.focus(editor);
  } catch {}
};

export const Toolbar: React.FC<ToolbarProps> = ({
  selectionRef,
  openInlineImageModalRef,
}) => {
  const editor = useSlate();

  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [imgModalOpen, setImgModalOpen] = useState(false);
  const [blockImgModalOpen, setBlockImgModalOpen] = useState(false);
  const [blockImgLinkModalOpen, setBlockImgLinkModalOpen] = useState(false);
  const [inlineImgModalOpen, setInlineImgModalOpen] = useState(false);
  const [inlineImgLinkModalOpen, setInlineImgLinkModalOpen] = useState(false);
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [colorValue, setColorValue] = useState('#000000');
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const colorBtnRef = useRef<HTMLDivElement>(null);
  const [showBgColorDropdown, setShowBgColorDropdown] = useState(false);
  const [bgColorValue, setBgColorValue] = useState('#FFFF00');
  const [recentBgColors, setRecentBgColors] = useState<string[]>([]);
  const bgColorBtnRef = useRef<HTMLDivElement>(null);
  const [linkModalOpen, setLinkModalOpen] = useState(false);

  const [headingModalOpen, setHeadingModalOpen] =
    useState<false | 'heading-one' | 'heading-two' | 'heading-three'>(false);

  const [showPriceTableInsertModal, setShowPriceTableInsertModal] = useState(false);
  const [tablePickerOpen, setTablePickerOpen] = useState(false);
  const tableBtnRef = useRef<HTMLButtonElement | null>(null);

  const linkSelectionBlocked = selectionIntersectsInlineLink(
    editor,
    editor.selection,
  );

  useEffect(() => {
    openInlineImageModalRef.current = () => setInlineImgModalOpen(true);

    return () => {
      openInlineImageModalRef.current = null;
    };
  }, [openInlineImageModalRef]);

  const closeAllDropdowns = () => {
    setOpenDropdown(null);
    setShowColorDropdown(false);
    setShowBgColorDropdown(false);
  };

  useEffect(() => {
    const handler = () => closeAllDropdowns();
    window.addEventListener('editor:close-dropdowns', handler);
    return () => window.removeEventListener('editor:close-dropdowns', handler);
  }, []);

  useEffect(() => {
    if (openDropdown) {
      setShowColorDropdown(false);
      setShowBgColorDropdown(false);
    }
  }, [openDropdown]);

  useEffect(() => {
    if (showColorDropdown) {
      setOpenDropdown(null);
      setShowBgColorDropdown(false);
    }
  }, [showColorDropdown]);

  useEffect(() => {
    if (showBgColorDropdown) {
      setOpenDropdown(null);
      setShowColorDropdown(false);
    }
  }, [showBgColorDropdown]);

  const anyToolbarModalOpen =
    imgModalOpen ||
    blockImgModalOpen ||
    blockImgLinkModalOpen ||
    inlineImgModalOpen ||
    inlineImgLinkModalOpen ||
    linkModalOpen ||
    !!headingModalOpen ||
    showPriceTableInsertModal;

  useEffect(() => {
    if (anyToolbarModalOpen) closeAllDropdowns();
  }, [anyToolbarModalOpen]);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const toolbar = document.getElementById('editor-toolbar');
      if (!toolbar) return;
      if (!toolbar.contains(e.target as Node)) closeAllDropdowns();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  useEffect(() => {
    if (!showColorDropdown) return;
    const handle = (e: MouseEvent) => {
      if (colorBtnRef.current && !colorBtnRef.current.contains(e.target as Node)) {
        setShowColorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showColorDropdown]);

  useEffect(() => {
    if (!showBgColorDropdown) return;
    const handle = (e: MouseEvent) => {
      if (bgColorBtnRef.current && !bgColorBtnRef.current.contains(e.target as Node)) {
        setShowBgColorDropdown(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [showBgColorDropdown]);

  function insertInlineMark(editor: Editor, { icon, color }: { icon: string; color: string }) {
    const mark: InlineMarkElement = {
      type: 'inline-mark',
      icon,
      color,
      children: [{ text: '' }],
    };
    Transforms.insertNodes(editor, mark);
  }

  const handleSelectInlineImage = (
    item: { url: string; mime_type?: string | null } | string,
  ) => {
    const url = typeof item === 'string' ? item : item.url;
    const mime = typeof item === 'string' ? undefined : item.mime_type;

    if (mime?.startsWith?.('video/')) {
      insertMedia(editor, { url, mime });
      return;
    }

    insertInlineImage(editor, url);
    setInlineImgModalOpen(false);
  };

  const handleInlineImgLinkInsert = (url: string) => {
    insertInlineImage(editor, url);
    setInlineImgLinkModalOpen(false);
  };

  const setAlignment = (
    alignment: 'left' | 'center' | 'right' | 'justify',
  ) => {
    const { selection } = editor;
    if (!selection) return;

    const blocks = Array.from(
      Editor.nodes(editor, {
        at: selection,
        match: (n) => {
          if (!SlateElement.isElement(n) || !Editor.isBlock(editor, n)) {
            return false;
          }

          const type = (n as any).type;

          if (
            type === 'table' ||
            type === 'table-row' ||
            type === 'table-cell'
          ) {
            return false;
          }

          return (
            type === 'paragraph' ||
            type === 'heading-one' ||
            type === 'heading-two' ||
            type === 'heading-three'
          );
        },
      }),
    );

    for (const [, path] of blocks) {
      Transforms.setNodes(
        editor,
        { textAlign: alignment } as any,
        { at: path },
      );
    }
  };

  return (
    <div id="editor-toolbar" className="editor-toolbar">
      <MarkButton
        format="bold"
        icon={<FontAwesomeIcon icon={faBold} />}
        selectionRef={selectionRef}
      />
      <MarkButton
        format="italic"
        icon={<FontAwesomeIcon icon={faItalic} />}
        selectionRef={selectionRef}
      />
      <MarkButton
        format="underline"
        icon={<FontAwesomeIcon icon={faUnderline} />}
        selectionRef={selectionRef}
      />
      <MarkButton
        format="strikethrough"
        icon={<FontAwesomeIcon icon={faStrikethrough} />}
        selectionRef={selectionRef}
      />

      <DropdownButton
        label={<FontAwesomeIcon icon={faTextHeight} />}
        items={FONT_SIZES}
        selectionRef={selectionRef}
        dropdownId="fontSize"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(value) => toggleMark(editor, 'fontSize', value)}
      />

      <DropdownButton
        label={<FontAwesomeIcon icon={faFont} />}
        items={FONT_FAMILIES.map((font) => font.label)}
        itemsMap={Object.fromEntries(
          FONT_FAMILIES.map((font) => [font.label, font.value]),
        )}
        selectionRef={selectionRef}
        dropdownId="fontFamily"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(cssValue) => toggleMark(editor, 'fontFamily', cssValue)}
      />

      <div
        ref={colorBtnRef}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        <button
          className="editor-toolbar-btn"
          onClick={(e) => {
            e.preventDefault();
            setOpenDropdown(null);
            setShowBgColorDropdown(false);
            setShowColorDropdown((value) => !value);
          }}
          title="글자색"
        >
          <FontAwesomeIcon icon={faPalette} />
        </button>

        {showColorDropdown && (
          <CustomColorDropdown
            value={colorValue}
            onChange={(color) => {
              setColorValue(color);
              toggleMark(editor, 'color', color);
            }}
            onClose={() => setShowColorDropdown(false)}
            recentColors={recentColors}
            setRecentColors={setRecentColors}
          />
        )}
      </div>

      <div
        ref={bgColorBtnRef}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        <button
          className="editor-toolbar-btn"
          onClick={(e) => {
            e.preventDefault();
            setOpenDropdown(null);
            setShowColorDropdown(false);
            setShowBgColorDropdown((value) => !value);
          }}
          title="배경색"
        >
          <FontAwesomeIcon icon={faFillDrip} />
        </button>

        {showBgColorDropdown && (
          <CustomColorDropdown
            value={bgColorValue}
            onChange={(color) => {
              setBgColorValue(color);
              toggleMark(editor, 'backgroundColor', color);
            }}
            onClose={() => setShowBgColorDropdown(false)}
            recentColors={recentBgColors}
            setRecentColors={setRecentBgColors}
            kind="background"
          />
        )}
      </div>

      <button
        className="editor-toolbar-btn"
        disabled={linkSelectionBlocked}
        onMouseDown={(e) => {
          e.preventDefault();
          if (linkSelectionBlocked) return;
          selectionRef.current = editor.selection ?? null;
          setLinkModalOpen(true);
        }}
        title={
          linkSelectionBlocked
            ? '기존 링크와 겹친 선택에는 새 링크를 적용할 수 없습니다.'
            : '링크'
        }
      >
        <FontAwesomeIcon icon={faLink} />
      </button>

      <LinkInputModal
        open={linkModalOpen}
        onClose={() => setLinkModalOpen(false)}
        onSubmit={(items) => {
          setLinkModalOpen(false);
          if (!items || items.length === 0) return;

          if (selectionRef.current) {
            try {
              Transforms.select(editor, selectionRef.current);
            } catch {}
          }

          const hasSelection =
            !!editor.selection && !Range.isCollapsed(editor.selection);

          if (hasSelection) {
            if (selectionIntersectsInlineLink(editor, editor.selection)) {
              return;
            }

            const url = (items[0]?.url || '').trim();
            if (url) insertLink(editor, url);
            return;
          }

          if (items.length === 1) {
            insertLinkBlock(editor, items[0].url, { size: 'large' });
          } else if (items.length === 2) {
            Transforms.insertNodes(
              editor,
              {
                type: 'link-block-row',
                children: [
                  {
                    type: 'link-block',
                    url: items[0].url,
                    size: 'small',
                    sitename: items[0].url,
                    favicon: null,
                    children: [{ text: '' }],
                  },
                  {
                    type: 'link-block',
                    url: items[1].url,
                    size: 'small',
                    sitename: items[1].url,
                    favicon: null,
                    children: [{ text: '' }],
                  },
                ],
              } as any,
              { select: false },
            );

            const lastPath = [editor.children.length];

            Transforms.insertNodes(
              editor,
              { type: 'paragraph', children: [{ text: '' }] } as any,
              { at: lastPath, select: true },
            );
          }
        }}
      />

      <DropdownButton
        label={<FontAwesomeIcon icon={faHeading} />}
        items={HEADINGS.map((heading) => heading.label)}
        selectionRef={selectionRef}
        dropdownId="heading"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(label) => {
          const match = HEADINGS.find((heading) => heading.label === label);
          if (match) setHeadingModalOpen(match.value as any);
        }}
      />

      <DropdownButton
        label={<FontAwesomeIcon icon={faAlignLeft} />}
        items={ALIGNMENTS.map((alignment) => alignment.label)}
        selectionRef={selectionRef}
        dropdownId="align"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(label) => {
          const match = ALIGNMENTS.find(
            (alignment) => alignment.label === label,
          );
          if (match) setAlignment(match.value as any);
        }}
      />

      {(() => {
        const { selection } = editor;
        if (!selection) return null;

        const [match] = Editor.nodes(editor, {
          at: selection,
          match: (node) =>
            SlateElement.isElement(node) &&
            ((node as any).type === 'image' ||
              (node as any).type === 'video'),
        });

        if (!match) return null;

        return (
          <DropdownButton
            label={<FontAwesomeIcon icon={faImage} />}
            items={IMAGE_ALIGNMENTS.map((alignment) => alignment.label)}
            selectionRef={selectionRef}
            dropdownId="image-align"
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            onSelect={(label: string) => {
              const match = IMAGE_ALIGNMENTS.find(
                (alignment) => alignment.label === label,
              );
              if (match) setImageAlignment(editor, match.value as any);
            }}
          />
        );
      })()}

      <DropdownButton
        label={<FontAwesomeIcon icon={faMinus} />}
        items={DIVIDER_STYLES.map((style) => style.label)}
        selectionRef={selectionRef}
        dropdownId="divider"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(label) => {
          const found = DIVIDER_STYLES.find((style) => style.label === label);
          if (found) insertDivider(editor, found.value as any);
        }}
      />

      <InfoBoxDropdown
        selectionRef={selectionRef}
        dropdownId="info"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
      />

      <DropdownButton
        label={<FontAwesomeIcon icon={faPhotoFilm} />}
        items={['업로드/선택', '링크로 삽입']}
        selectionRef={selectionRef}
        dropdownId="block-image"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(option) => {
          if (option === '업로드/선택') {
            setBlockImgModalOpen(true);
          } else if (option === '링크로 삽입') {
            setBlockImgLinkModalOpen(true);
          }
        }}
      />

      <ImageSelectModal
        open={blockImgModalOpen}
        onClose={() => setBlockImgModalOpen(false)}
        onSelectImage={(url: string, _name?: string, row?: MediaRow) => {
          const mediaUrl = row?.url ?? url;

          if (isProbablyVideo(mediaUrl, row?.mime_type)) {
            insertVideoNode(editor, mediaUrl);
          } else {
            insertImage(editor, mediaUrl);
          }

          setBlockImgModalOpen(false);
        }}
      />

      <ImageUrlInputModal
        open={blockImgLinkModalOpen}
        onClose={() => setBlockImgLinkModalOpen(false)}
        onSubmit={(url: string) => {
          if (isProbablyVideo(url)) {
            insertVideoNode(editor, url);
          } else {
            insertImage(editor, url);
          }

          setBlockImgLinkModalOpen(false);
        }}
      />

      <DropdownButton
        label={<FontAwesomeIcon icon={faImage} />}
        items={INLINE_IMAGE_OPTIONS}
        selectionRef={selectionRef}
        dropdownId="insert-inline-image"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(option) => {
          if (option === '업로드/선택') {
            setInlineImgModalOpen(true);
          } else if (option === '링크 삽입') {
            setInlineImgLinkModalOpen(true);
          }
        }}
      />

      <ImageSelectModal
        open={inlineImgModalOpen}
        onClose={() => setInlineImgModalOpen(false)}
        onSelectImage={handleSelectInlineImage}
      />

      <ImageUrlInputModal
        open={inlineImgLinkModalOpen}
        onClose={() => setInlineImgLinkModalOpen(false)}
        onSubmit={handleInlineImgLinkInsert}
      />

      <button
        className="editor-toolbar-btn"
        onMouseDown={(e) => {
          e.preventDefault();

          const { selection } = editor;
          if (!selection) return;

          for (const [node, path] of Editor.nodes(editor, {
            at: selection,
            match: (item) =>
              SlateElement.isElement(item) && Editor.isBlock(editor, item),
          })) {
            const previous = (node as any).indentLine;

            Transforms.setNodes(
              editor,
              { indentLine: !previous },
              { at: path },
            );
          }
        }}
        title="왼쪽 라인 들여쓰기 토글"
      >
        <FontAwesomeIcon icon={faGripLinesVertical} />
      </button>

      <DropdownButton
        label={<FontAwesomeIcon icon={faIcons} />}
        items={INLINE_MARKS.map((mark) => mark.icon)}
        selectionRef={selectionRef}
        dropdownId="inline-mark"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(icon) => {
          const mark = INLINE_MARKS.find((item) => item.icon === icon);
          if (mark) insertInlineMark(editor, mark);
        }}
      />

      <button
        type="button"
        className="editor-toolbar-btn"
        title="각주 삽입"
        aria-label="각주 삽입"
        onMouseDown={(e) => {
          e.preventDefault();
          insertFootnote(editor);

          try {
            ReactEditor.focus(editor);
          } catch {}
        }}
      >
        <span
          aria-hidden="true"
          style={{ fontWeight: 800, lineHeight: 1 }}
        >
          ¹
        </span>
      </button>

      <HeadingIconSelectModal
        open={!!headingModalOpen}
        onClose={() => setHeadingModalOpen(false)}
        onSubmit={(icon) => {
          if (headingModalOpen) {
            insertHeading(editor, headingModalOpen, icon);
            setHeadingModalOpen(false);
          }
        }}
      />

      <button
        className="editor-toolbar-btn"
        title="시세표 카드 삽입"
        onMouseDown={(e) => {
          e.preventDefault();
          setShowPriceTableInsertModal(true);
        }}
      >
        <FontAwesomeIcon icon={faDollarSign} />
      </button>

      <PriceTableInsertModal
        open={showPriceTableInsertModal}
        onClose={() => setShowPriceTableInsertModal(false)}
        onInsert={(cardsPerRow) => {
          const element = {
            type: 'price-table-card',
            items: Array(cardsPerRow)
              .fill(null)
              .map(() => ({
                name: '',
                image: '',
                prices: [],
                stages: [],
              })),
            cardsPerRow,
            children: [{ text: '' }],
          };

          Transforms.insertNodes(editor, element as any);
          Transforms.insertNodes(
            editor,
            { type: 'paragraph', children: [{ text: '' }] } as any,
          );
          setShowPriceTableInsertModal(false);
        }}
      />

      <button
        className="editor-toolbar-btn"
        ref={tableBtnRef}
        title="표 삽입"
        onMouseDown={(e) => {
          e.preventDefault();
          closeAllDropdowns();
          selectionRef.current = editor.selection ?? null;
          setTablePickerOpen(true);
        }}
      >
        <FontAwesomeIcon icon={faTable} />
      </button>

      <button
        className="editor-toolbar-btn"
        title="무기 정보 박스 삽입"
        onMouseDown={(e) => {
          e.preventDefault();
          insertWeaponInfo(editor);
        }}
      >
        <FontAwesomeIcon icon={faFont} />
      </button>

      <TablePicker
        anchor={tableBtnRef.current}
        open={tablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        maxRows={10}
        maxCols={10}
        onPick={(rows, cols) => {
          setTablePickerOpen(false);

          if (selectionRef.current) {
            try {
              Transforms.select(editor, selectionRef.current);
            } catch {}
          }

          insertTable(editor, {
            rows,
            cols,
          });
        }}
      />
    </div>
  );
};

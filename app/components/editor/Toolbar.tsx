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

  // ===== 상태 =====
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

  // ===== 유틸: 모두 닫기 =====
  const closeAllDropdowns = () => {
    setOpenDropdown(null);
    setShowColorDropdown(false);
    setShowBgColorDropdown(false);
  };

  // 전역 이벤트로 닫기
  useEffect(() => {
    const handler = () => closeAllDropdowns();
    window.addEventListener('editor:close-dropdowns', handler);
    return () => window.removeEventListener('editor:close-dropdowns', handler);
  }, []);

  // 같은 종류/다른 종류 간 상호배타 처리
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

  // 툴바 내부 모달이 열릴 때는 자동으로 모두 닫기
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

  // 외부 클릭(색상/배경 닫기)
  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const toolbar = document.getElementById('editor-toolbar');
      if (!toolbar) return;
      if (!toolbar.contains(e.target as Node)) closeAllDropdowns();
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // 색상 팔레트 외부 클릭 감지
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

  // 배경 팔레트 외부 클릭 감지
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

  // ------------------------------ helpers ------------------------------
  function insertInlineMark(editor: Editor, { icon, color }: { icon: string; color: string }) {
    const mark: InlineMarkElement = { type: 'inline-mark', icon, color, children: [{ text: '' }] };
    Transforms.insertNodes(editor, mark);
  }

  const handleSelectInlineImage = (item: { url: string; mime_type?: string | null } | string) => {
    const url = typeof item === 'string' ? item : item.url;
    const mime = typeof item === 'string' ? undefined : item.mime_type;
    // 인라인은 이미지에만 허용(영상은 블록으로 처리)
    if (mime?.startsWith?.('video/')) {
      insertMedia(editor, { url, mime }); // 영상이면 블록 video
      return;
    }
    insertInlineImage(editor, url);
    setInlineImgModalOpen(false);
  };

  const handleInlineImgLinkInsert = (url: string) => {
    insertInlineImage(editor, url);
    setInlineImgLinkModalOpen(false);
  };

  const setAlignment = (alignment: 'left' | 'center' | 'right' | 'justify') => {
    const { selection } = editor;
    if (!selection) return;

    const blocks = Array.from(
      Editor.nodes(editor, {
        at: selection,
        match: (n) => {
          if (!SlateElement.isElement(n) || !Editor.isBlock(editor, n)) return false;

          const t = (n as any).type;

          // 표 자체 / 행 / 셀은 제외
          if (t === 'table' || t === 'table-row' || t === 'table-cell') return false;

          // 텍스트 블록만 정렬
          return (
            t === 'paragraph' ||
            t === 'heading-one' ||
            t === 'heading-two' ||
            t === 'heading-three'
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

  // ------------------------------ Render ------------------------------
  return (
    <div id="editor-toolbar" className="editor-toolbar">
      {/* 마크 */}
      <MarkButton format="bold"          icon={<FontAwesomeIcon icon={faBold} />}           selectionRef={selectionRef} />
      <MarkButton format="italic"        icon={<FontAwesomeIcon icon={faItalic} />}         selectionRef={selectionRef} />
      <MarkButton format="underline"     icon={<FontAwesomeIcon icon={faUnderline} />}      selectionRef={selectionRef} />
      <MarkButton format="strikethrough" icon={<FontAwesomeIcon icon={faStrikethrough} />}  selectionRef={selectionRef} />

      {/* 폰트 크기 */}
      <DropdownButton
        label={<FontAwesomeIcon icon={faTextHeight} />}
        items={FONT_SIZES}
        selectionRef={selectionRef}
        dropdownId="fontSize"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(value) => toggleMark(editor, 'fontSize', value)}
      />

      {/* 폰트 종류 */}
      <DropdownButton
        label={<FontAwesomeIcon icon={faFont} />}
        items={FONT_FAMILIES.map(f => f.label)}
        itemsMap={Object.fromEntries(FONT_FAMILIES.map(f => [f.label, f.value]))}
        selectionRef={selectionRef}
        dropdownId="fontFamily"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(cssValue) => toggleMark(editor, 'fontFamily', cssValue)}
      />

      {/* 글자색 */}
      <div ref={colorBtnRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          className="editor-toolbar-btn"
          onClick={(e) => {
            e.preventDefault();
            setOpenDropdown(null);
            setShowBgColorDropdown(false);
            setShowColorDropdown(v => !v);
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

      {/* 배경색 */}
      <div ref={bgColorBtnRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          className="editor-toolbar-btn"
          onClick={(e) => {
            e.preventDefault();
            setOpenDropdown(null);
            setShowColorDropdown(false);
            setShowBgColorDropdown(v => !v);
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

      {/* 🔗 링크 (내부/외부 전부 여기서 처리) */}
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

          // 링크 삽입 시 모달 열기 직전 selection 복원
          if (selectionRef.current) {
            try { Transforms.select(editor, selectionRef.current); } catch {}
          }

          const hasSelection = !!editor.selection && !Range.isCollapsed(editor.selection);

          // 드래그된 텍스트가 있으면 인라인 링크로
          if (hasSelection) {
            if (selectionIntersectsInlineLink(editor, editor.selection)) return;

            const url = (items[0]?.url || '').trim();
            if (url) insertLink(editor, url);
            return;
          }

          // 커서만 있을 때는 링크 카드(블록)
          if (items.length === 1) {
            insertLinkBlock(editor, items[0].url, { size: 'large' });
          } else if (items.length === 2) {
            Transforms.insertNodes(editor, {
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
            } as any, { select: false });

            const lastPath = [editor.children.length];
            Transforms.insertNodes(
              editor,
              { type: 'paragraph', children: [{ text: '' }] } as any,
              { at: lastPath, select: true },
            );
          }
        }}
      />

      {/* Heading */}
      <DropdownButton
        label={<FontAwesomeIcon icon={faHeading} />}
        items={HEADINGS.map(h => h.label)}
        selectionRef={selectionRef}
        dropdownId="heading"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(label) => {
          const match = HEADINGS.find(h => h.label === label);
          if (match) setHeadingModalOpen(match.value as any);
        }}
      />

      {/* 정렬 */}
      <DropdownButton
        label={<FontAwesomeIcon icon={faAlignLeft} />}
        items={ALIGNMENTS.map(a => a.label)}
        selectionRef={selectionRef}
        dropdownId="align"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(label) => {
          const match = ALIGNMENTS.find(a => a.label === label);
          if (match) setAlignment(match.value as any);
        }}
      />

      {/* 이미지/영상 정렬 (선택 시만) */}
      {(() => {
        const { selection } = editor;
        if (!selection) return null;
        const [match] = Editor.nodes(editor, {
          at: selection,
          match: n =>
            SlateElement.isElement(n) &&
            ((n as any).type === 'image' || (n as any).type === 'video'),
        });
        if (!match) return null;
        return (
          <DropdownButton
            label={<FontAwesomeIcon icon={faImage} />}
            items={IMAGE_ALIGNMENTS.map(a => a.label)}
            selectionRef={selectionRef}
            dropdownId="image-align"
            openDropdown={openDropdown}
            setOpenDropdown={setOpenDropdown}
            onSelect={(label: string) => {
              const m = IMAGE_ALIGNMENTS.find(a => a.label === label);
              if (m) setImageAlignment(editor, m.value as any);
            }}
          />
        );
      })()}

      {/* 구분선 */}
      <DropdownButton
        label={<FontAwesomeIcon icon={faMinus} />}
        items={DIVIDER_STYLES.map(s => s.label)}
        selectionRef={selectionRef}
        dropdownId="divider"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(label) => {
          const found = DIVIDER_STYLES.find(s => s.label === label);
          if (found) insertDivider(editor, found.value as any);
        }}
      />

      {/* InfoBox */}
      <InfoBoxDropdown
        selectionRef={selectionRef}
        dropdownId="info"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
      />

      {/* 블록 이미지/영상 (선택 또는 링크) */}
      <DropdownButton
        label={<FontAwesomeIcon icon={faPhotoFilm} />}
        items={['업로드/선택', '링크로 삽입']}
        selectionRef={selectionRef}
        dropdownId="block-image"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(option) => {
          if (option === '업로드/선택') setBlockImgModalOpen(true);
          else if (option === '링크로 삽입') setBlockImgLinkModalOpen(true);
        }}
      />
      <ImageSelectModal
        open={blockImgModalOpen}
        onClose={() => setBlockImgModalOpen(false)}
        onSelectImage={(url: string, _name?: string, row?: MediaRow) => {
          const v = row?.url ?? url;
          if (isProbablyVideo(v, row?.mime_type)) {
            insertVideoNode(editor, v);
          } else {
            insertImage(editor, v);
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

      {/* 인라인 이미지 */}
      <DropdownButton
        label={<FontAwesomeIcon icon={faImage} />}
        items={INLINE_IMAGE_OPTIONS}
        selectionRef={selectionRef}
        dropdownId="insert-inline-image"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(option) => {
          if (option === '업로드/선택') setInlineImgModalOpen(true);
          else if (option === '링크 삽입') setInlineImgLinkModalOpen(true);
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
        onSubmit={(url) => {
          handleSelectInlineImage(url);
        }}
      />

      {/* 들여쓰기 라인 토글 */}
      <button
        className="editor-toolbar-btn"
        onMouseDown={(e) => {
          e.preventDefault();
          const { selection } = editor;
          if (!selection) return;
          for (const [node, path] of Editor.nodes(editor, {
            at: selection,
            match: n => SlateElement.isElement(n) && Editor.isBlock(editor, n),
          })) {
            const prev = (node as any).indentLine;
            Transforms.setNodes(editor, { indentLine: !prev }, { at: path });
          }
        }}
        title="왼쪽 라인 들여쓰기 토글"
      >
        <FontAwesomeIcon icon={faGripLinesVertical} />
      </button>

      {/* 인라인 기호 */}
      <DropdownButton
        label={<FontAwesomeIcon icon={faIcons} />}
        items={INLINE_MARKS.map(m => m.icon)}
        selectionRef={selectionRef}
        dropdownId="inline-mark"
        openDropdown={openDropdown}
        setOpenDropdown={setOpenDropdown}
        onSelect={(icon) => {
          const mark = INLINE_MARKS.find(m => m.icon === icon);
          if (mark) insertInlineMark(editor, mark);
        }}
      />

      {/* Heading 아이콘 선택 모달 */}
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

      {/* 시세표 카드 삽입 */}
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
            items: Array(cardsPerRow).fill(null).map(() => ({
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

      {/* 표 삽입 버튼 + TablePicker */}
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

      {/* 무기 정보 박스 삽입 */}
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

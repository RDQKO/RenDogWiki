'use client';

import React, {
  useMemo, useState, useCallback, useEffect, useRef
} from 'react';
import {
  createEditor, Descendant, Editor, Transforms, Range, Point,
  Element as SlateElement, Node, Path
} from 'slate';
import {
  Slate, Editable, withReact, ReactEditor,
  type RenderLeafProps, type RenderElementProps
} from 'slate-react';
import { withHistory } from 'slate-history';
import isHotkey from 'is-hotkey';

import { Toolbar } from './Toolbar';
import Leaf from './Leaf';
import ElementRenderer from './Element';
import TableOfContents from './TableOfContents';
import { extractHeadings } from './helpers/extractHeadings';
import type { CustomElement } from '@/types/slate';
import ImageSelectModal from '@/components/image/ImageSelectModal';
import '@/wiki/css/editor.css';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage } from '@fortawesome/free-solid-svg-icons';
import TableContextMenu from './TableContextMenu';
import TextContextMenu from './TextContextMenu';
import HeadingContextMenu from './HeadingContextMenu';
import LinkContextMenu from './LinkContextMenu';
import LinkBlockContextMenu from './LinkBlockContextMenu';
import DividerContextMenu from './DividerContextMenu';
import InfoBoxContextMenu from './InfoBoxContextMenu';
import ImageContextMenu from './ImageContextMenu';
import PriceTableContextMenu from './PriceTableContextMenu';
import type { WikiRefKind } from './render/types';
import { toProxyUrl } from '@lib/cdn';
import { getDragRect } from './helpers/tableDrag';
import {
  buildTableRangeClipboardPayload,
  buildTableRectClipboardPayload,
  setTableClipboardData,
} from './helpers/tableClipboard';
import FootnoteEditModal from './FootnoteEditModal';
import type { FootnoteElement } from '@/types/slate';

type DocState = {
  id?: number;
  title: string;
  path: string;
  icon: string;
  tags: string[];
  content: Descendant[];
};

const EMPTY_INITIAL_VALUE: Descendant[] = [{ type: 'paragraph', children: [{ text: '' }] }];

type Props = {
  initialDoc: DocState | null;
  isMain?: boolean;
};

type FootnoteEditState = {
  path: Path | null;
  item: FootnoteElement | null;
};

type DraftSlot = {
  slot: number;
  savedAt: number;
  snapshot: Descendant[];
};

const DRAFT_SLOT_COUNT = 3;
const AUTO_DRAFT_DELAY_MS = 2500;

// 커서 진입 불가 블럭
const VOID_BLOCK_TYPES = new Set([
  'image',
  'divider',
  'price-table-card',
  'weapon-card',
  'quest-embed',
  'npc-embed',
  'qna-embed',
]);

// 특수 카드 내부에서 Enter를 눌렀을 때 블럭이 복제되지 않고,
// 블럭 또는 카드 행 뒤에 새 paragraph를 만들도록 하는 플러그인
function withWeaponBlocks(editor: Editor): Editor {
  const e = editor;
  const { insertBreak } = e;

  e.insertBreak = () => {
    const { selection } = e;

    // 선택이 없거나 드래그 선택이면 기존 동작 그대로
    if (!selection || !Range.isCollapsed(selection)) {
      return insertBreak();
    }

    // 커서가 줄바꿈으로 분리되면 안 되는 카드 안에 있는지 확인
    const [match] = Editor.nodes(e, {
      match: (n) =>
        SlateElement.isElement(n) &&
        ((n as any).type === 'weapon-card' ||
          (n as any).type === 'price-table-card' ||
          (n as any).type === 'quest-embed' ||
          (n as any).type === 'npc-embed' ||
          (n as any).type === 'qna-embed' ||
          (n as any).type === 'link-block'),
    });

    if (match) {
      const [matchedNode, path] = match;
      let containerPath = path;

      // 두 링크 카드가 link-block-row 안에 있으면 카드 사이가 아니라
      // 행 전체의 다음 위치에 일반 문단을 만든다.
      if ((matchedNode as any).type === 'link-block' && path.length > 1) {
        const parentPath = Path.parent(path);

        try {
          const parentNode = Node.get(e, parentPath);

          if (
            SlateElement.isElement(parentNode) &&
            (parentNode as any).type === 'link-block-row'
          ) {
            containerPath = parentPath;
          }
        } catch {
          // 부모 경로를 확인할 수 없으면 현재 카드 뒤에 삽입한다.
        }
      }

      const insertPath = Path.next(containerPath);

      // 새 paragraph 블럭 하나 삽입
      const paragraph: Node = {
        type: 'paragraph',
        children: [{ text: '' }],
      } as any;

      Transforms.insertNodes(e, paragraph, { at: insertPath });

      // 커서를 새 paragraph 의 첫 텍스트로 이동
      const textPath = [...insertPath, 0];
      Transforms.select(e, {
        anchor: { path: textPath, offset: 0 },
        focus: { path: textPath, offset: 0 },
      });

      try {
        ReactEditor.focus(e as any);
      } catch {
        /* ignore */
      }

      return;
    }

    // 나머지는 원래 Enter 동작
    return insertBreak();
  };

  return e;
}

export default function SlateEditor({
  initialDoc,
  isMain = false,
}: Props) {
  if (!initialDoc) return <div>잘못된 접근입니다.</div>;

  return (
    <SlateEditorContent
      initialDoc={initialDoc}
      isMain={isMain}
    />
  );
}

function SlateEditorContent({
  initialDoc,
  isMain = false,
}: {
  initialDoc: DocState;
  isMain?: boolean;
}) {
  // ── 개발 중 스크롤 로깅(원하면 삭제) ──────────────────────────
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;

    const errStack = () => (new Error().stack ?? '').split('\n').slice(0, 4).join('\n');

    const origScrollTo = window.scrollTo.bind(window);
    (window as any).scrollTo = (...args: any[]) => {
      console.log('[SCROLL] window.scrollTo', args, errStack());
      return origScrollTo(...(args as Parameters<typeof window.scrollTo>));
    };

    const DOMElementCtor: any = (globalThis as any).Element;
    const proto: any = DOMElementCtor?.prototype;
    if (!proto) {
      console.warn('[SCROLL] Element.prototype not available; skip scrollIntoView patch');
      return () => { (window as any).scrollTo = origScrollTo; };
    }

    const origSIV = proto.scrollIntoView;
    proto.scrollIntoView = function (this: Element, ...args: any[]) {
      const el = this as any as HTMLElement;
      const mark = el?.id ? `#${el.id}` : (typeof el?.className === 'string' ? el.className : '') || el?.tagName;
      console.log('[SCROLL] scrollIntoView on', mark, args, errStack());
      if (typeof origSIV === 'function') return origSIV.apply(this, args);
      return undefined;
    };

    return () => {
      (window as any).scrollTo = origScrollTo;
      proto.scrollIntoView = origSIV;
    };
  }, []);
  // ────────────────────────────────────────────────────────────

  const withCustomInline = (editor: Editor) => {
    const { insertText, isInline, isVoid } = editor;

    editor.isInline = el =>
      el.type === 'link' ||
      el.type === 'inline-mark' ||
      el.type === 'inline-image' ||
      el.type === 'footnote' ||
      (el as any).type === 'wiki-ref'
        ? true
        : isInline(el);

    editor.isVoid = el =>
      (el as any).type === 'inline-image' ||
      (el as any).type === 'footnote' ||
      VOID_BLOCK_TYPES.has((el as any).type)
        ? true
        : isVoid(el);

    editor.insertText = text => {
      const { selection } = editor;

      if (selection && Range.isCollapsed(selection)) {
        const linkEntry = Editor.above(editor, {
          at: selection,
          match: node =>
            SlateElement.isElement(node) &&
            (node as any).type === 'link',
        });

        if (linkEntry) {
          const [, linkPath] = linkEntry;
          const linkEnd = Editor.end(editor, linkPath);

          if (Point.equals(selection.anchor, linkEnd)) {
            const pointAfterLink = Editor.after(editor, linkPath);

            if (pointAfterLink) {
              Transforms.select(editor, pointAfterLink);
            } else {
              const textPath = Path.next(linkPath);
              Transforms.insertNodes(
                editor,
                { text: '' },
                { at: textPath },
              );
              Transforms.select(editor, {
                path: textPath,
                offset: 0,
              });
            }
          }
        }
      }

      insertText(text);
    };

    return editor;
  };

  const editor = useMemo(() => {
    // ✅ 커스텀 플러그인 묶는 순서: React → History → inline/void → weapon-card 플러그인
    const e = withWeaponBlocks(
      withCustomInline(withHistory(withReact(createEditor())))
    );

    const { normalizeNode } = e;
    e.normalizeNode = ([node, path]) => {
      if (SlateElement.isElement(node) && node.type === 'info-box') {
        // 1) children이 비어있으면 최소 텍스트 1개 보장
        if (!node.children || node.children.length === 0) {
          Transforms.insertNodes(e, { text: '' } as any, { at: [...path, 0] });
          return;
        }

        // 2) ✅ info-box 안에 element(예: inline-image)가 있으면 "합치기(merge)" 금지
        const hasElementChild = node.children.some((ch: any) =>
          SlateElement.isElement(ch)
        );

        // 3) 텍스트만 있을 때에만 기존처럼 여러 텍스트를 1개로 합침
        if (!hasElementChild) {
          const text = Node.string(node);
          if (text === '') return;

          if (node.children.length > 1) {
            const merged = { ...node, children: [{ text }] };
            Transforms.removeNodes(e, { at: path });
            Transforms.insertNodes(e, merged as any, { at: path });
            return;
          }
        }
      }

      normalizeNode([node, path]);
    };

    return e;
  }, []);

  // ✅ FIX: 안전한 Path 체크/셀렉트 헬퍼 (드래그 삭제로 path가 날아가면 여기서 방어)
  const safeHasPath = useCallback((p: Path | null) => {
    if (!p) return false;
    try {
      return Editor.hasPath(editor, p);
    } catch {
      return false;
    }
  }, [editor]);

  const safeSelectPoint = useCallback((at: any) => {
    try {
      Transforms.select(editor, at);
      ReactEditor.focus(editor);
      return true;
    } catch {
      return false;
    }
  }, [editor]);

  // 상태
  const selectionRef = useRef<Range | null>(null);    // 최근 커서(에디터 onChange에서 갱신)
  const [editorKey] = useState(0);
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);
  const [iconEditTarget, setIconEditTarget] = useState<CustomElement | null>(null);
  const [moveCursorPending, setMoveCursorPending] = useState(false);
  const [lastLinkPath, setLastLinkPath] = useState<Path | null>(null);
  const [iconModalOpen, setIconModalOpen] = useState(false);

  const [doc, setDoc] = useState<DocState>(() => ({
    id: initialDoc?.id ?? undefined,
    title: initialDoc?.title ?? '',
    path: initialDoc?.path ?? '',
    icon: initialDoc?.icon ?? '',
    tags: Array.isArray(initialDoc?.tags) ? initialDoc.tags : [],
    content: Array.isArray(initialDoc.content) && initialDoc.content.length > 0
      ? initialDoc.content
      : EMPTY_INITIAL_VALUE,
  }));

  const [iconImgError, setIconImgError] = useState(false);

  useEffect(() => {
    // 아이콘 URL이 바뀌면 에러 상태 리셋
    setIconImgError(false);
  }, [doc.icon]);

  const isImageUrl = (v: string) => {
    const s = (v ?? '').trim();
    if (!s) return false;
    // http/https 뿐 아니라 / (내부 경로), data: 도 이미지로 취급
    return /^https?:\/\//i.test(s) || s.startsWith('/') || s.startsWith('data:');
  };

  const getIconSrc = (v: string) => {
    const s = (v ?? '').trim();
    if (!s) return '';
    // ✅ 외부 URL은 프록시 적용 (네 원칙)
    if (/^https?:\/\//i.test(s)) return toProxyUrl(s);
    // 내부 경로(/...)나 data:는 그대로
    return s;
  };

  const [footnoteEdit, setFootnoteEdit] = useState<FootnoteEditState>({
    path: null,
    item: null,
  });

  const [tagInput, setTagInput] = useState(doc.tags.join(', '));
  const normalizeContentForDraft = useCallback((value: Descendant[] | null | undefined): Descendant[] => {
    return Array.isArray(value) && value.length > 0
      ? (value as Descendant[])
      : EMPTY_INITIAL_VALUE;
  }, []);

  const serializeContentForDraft = useCallback(
    (value: Descendant[] | null | undefined) => JSON.stringify(normalizeContentForDraft(value)),
    [normalizeContentForDraft],
  );

  const formatDraftSavedAt = useCallback((savedAt: number) => {
    const d = new Date(savedAt);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}.${mm}.${dd} ${hh}:${mi}:${ss}`;
  }, []);

  const draftSessionKey = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `rdwiki:auto-draft:session:${window.location.pathname}${window.location.search}`;
  }, []);

  const draftDocKey = useMemo(() => {
    if (typeof window === 'undefined') return '';
    const resolvedId = initialDoc?.id ?? doc.id;
    if (resolvedId == null) return '';
    return `rdwiki:auto-draft:doc:${resolvedId}`;
  }, [initialDoc?.id, doc.id]);

  const draftStorageKey = draftDocKey || draftSessionKey;

  const [draftSlots, setDraftSlots] = useState<DraftSlot[]>([]);
  const draftSlotsRef = useRef<DraftSlot[]>([]);
  const autoDraftTimeoutRef = useRef<number | null>(null);
  const serverContentJsonRef = useRef(serializeContentForDraft(initialDoc?.content));
  const draftBaselineReadyRef = useRef(false);

  useEffect(() => {
    draftSlotsRef.current = draftSlots;
  }, [draftSlots]);

  const writeDraftSlots = useCallback((next: DraftSlot[]) => {
    setDraftSlots(next);

    if (typeof window === 'undefined') return;

    const keys = [draftStorageKey, draftSessionKey, draftDocKey].filter(
      (key, idx, arr): key is string => !!key && arr.indexOf(key) === idx,
    );

    if (next.length === 0) {
      keys.forEach((key) => window.localStorage.removeItem(key));
      return;
    }

    const raw = JSON.stringify(next);
    keys.forEach((key) => window.localStorage.setItem(key, raw));
  }, [draftStorageKey, draftSessionKey, draftDocKey]);

  const replaceEditorContent = useCallback((nextContent: Descendant[] | null | undefined) => {
    const normalized = normalizeContentForDraft(nextContent);

    try { Transforms.deselect(editor); } catch {}
    selectionRef.current = null;
    setMoveCursorPending(false);
    setLastLinkPath(null);

    Editor.withoutNormalizing(editor, () => {
      const currentCount = editor.children.length;
      for (let i = currentCount - 1; i >= 0; i -= 1) {
        Transforms.removeNodes(editor, { at: [i] });
      }
      Transforms.insertNodes(editor, normalized as any, { at: [0] });
    });

    setDoc((prev) => ({
      ...prev,
      content: normalized,
    }));
  }, [editor, normalizeContentForDraft]);

  const handleRestoreDraftSlot = useCallback((slotNumber: number) => {
    const target = draftSlotsRef.current.find((item) => item.slot === slotNumber);
    if (!target) return;

    replaceEditorContent(target.snapshot);
    alert(`${slotNumber}번 임시 저장 슬롯의 본문을 불러왔습니다.`);
  }, [replaceEditorContent]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const keysToRead = [draftDocKey, draftSessionKey, draftStorageKey].filter(
      (key, idx, arr): key is string => !!key && arr.indexOf(key) === idx,
    );

    if (keysToRead.length === 0) {
      setDraftSlots([]);
      return;
    }

    let raw = '';
    for (const key of keysToRead) {
      const value = window.localStorage.getItem(key);
      if (value) {
        raw = value;
        break;
      }
    }

    if (!raw) {
      setDraftSlots([]);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        setDraftSlots([]);
        return;
      }

      const next: DraftSlot[] = parsed
        .map((item: any) => {
          const slot = Number(item?.slot);
          const savedAt = Number(item?.savedAt);
          if (!Number.isFinite(slot) || slot < 1 || slot > DRAFT_SLOT_COUNT) return null;
          if (!Number.isFinite(savedAt) || savedAt <= 0) return null;

          return {
            slot,
            savedAt,
            snapshot: normalizeContentForDraft(item?.snapshot),
          };
        })
        .filter((item): item is DraftSlot => item !== null)
        .sort((a, b) => a.slot - b.slot)
        .slice(0, DRAFT_SLOT_COUNT);

      setDraftSlots(next);
    } catch {
      setDraftSlots([]);
    }
  }, [draftDocKey, draftSessionKey, draftStorageKey, normalizeContentForDraft]);

  useEffect(() => {
    if (!draftBaselineReadyRef.current) return;
    if (typeof window === 'undefined' || !draftStorageKey) return;

    const currentContentJson = serializeContentForDraft(doc.content);
    if (currentContentJson === serverContentJsonRef.current) return;

    const latestSlot = draftSlotsRef.current.find((item) => item.slot === 1);
    if (latestSlot && serializeContentForDraft(latestSlot.snapshot) === currentContentJson) return;

    if (autoDraftTimeoutRef.current != null) {
      window.clearTimeout(autoDraftTimeoutRef.current);
    }

    autoDraftTimeoutRef.current = window.setTimeout(() => {
      const snapshot = normalizeContentForDraft(doc.content);
      const snapshotJson = serializeContentForDraft(snapshot);

      const deduped = draftSlotsRef.current
        .filter((item) => serializeContentForDraft(item.snapshot) !== snapshotJson)
        .slice(0, DRAFT_SLOT_COUNT - 1);

      const next: DraftSlot[] = [{ slot: 1, savedAt: Date.now(), snapshot }, ...deduped]
        .slice(0, DRAFT_SLOT_COUNT)
        .map((item, idx) => ({
          ...item,
          slot: idx + 1,
        }));

      writeDraftSlots(next);
    }, AUTO_DRAFT_DELAY_MS);

    return () => {
      if (autoDraftTimeoutRef.current != null) {
        window.clearTimeout(autoDraftTimeoutRef.current);
        autoDraftTimeoutRef.current = null;
      }
    };
  }, [doc.content, draftStorageKey, normalizeContentForDraft, serializeContentForDraft, writeDraftSlots]);

  useEffect(() => {
    return () => {
      if (autoDraftTimeoutRef.current != null) {
        window.clearTimeout(autoDraftTimeoutRef.current);
        autoDraftTimeoutRef.current = null;
      }
    };
  }, []);

  // ✳️ 에디터 스크롤 타겟(정확히 가운데 편집 영역)
  const scrollRef = useRef<HTMLDivElement>(null);

  // 문서 초기값 반영
  useEffect(() => {
    const nextDoc = {
      id: initialDoc?.id ?? undefined,
      title: initialDoc?.title ?? '',
      path: initialDoc?.path ?? '',
      icon: initialDoc?.icon ?? '',
      tags: Array.isArray(initialDoc?.tags) ? initialDoc.tags : [],
      content: Array.isArray(initialDoc?.content) && initialDoc.content.length > 0
        ? initialDoc.content
        : EMPTY_INITIAL_VALUE,
    };

    setDoc(nextDoc);
    setTagInput(Array.isArray(nextDoc.tags) ? nextDoc.tags.join(', ') : '');
    serverContentJsonRef.current = serializeContentForDraft(nextDoc.content);
    draftBaselineReadyRef.current = true;
  }, [initialDoc, serializeContentForDraft]);

  // Backspace 뒤로가기 방지
  useEffect(() => {
    const preventBackspaceNavigation = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const isEditable = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if (e.key === 'Backspace' && !isEditable) e.preventDefault();
    };
    window.addEventListener('keydown', preventBackspaceNavigation);
    return () => window.removeEventListener('keydown', preventBackspaceNavigation);
  }, []);

  // (기존) 링크 포커스 복원은 유지
  useEffect(() => {
    if (moveCursorPending && lastLinkPath) {
      // ✅ FIX: 드래그 삭제로 lastLinkPath가 사라졌을 수 있음 → hasPath + try/catch 방어
      if (!safeHasPath(lastLinkPath)) {
        setMoveCursorPending(false);
        setLastLinkPath(null);
        return;
      }

      try {
        const after = Editor.after(editor, lastLinkPath);
        if (after) {
          safeSelectPoint(after);
        }
      } catch {
        // path/point 계산 중 예외 → 상태 정리
      } finally {
        setMoveCursorPending(false);
        setLastLinkPath(null);
      }
    }
  }, [doc.content, moveCursorPending, lastLinkPath, editor, safeHasPath, safeSelectPoint]);

  const headings = useMemo(() => extractHeadings(doc.content), [doc.content]);
  const handleIconClick = (element: CustomElement) => {
    setIconEditTarget(element);
    setIsIconModalOpen(true);
  };

  const handleFootnoteEditOpen = useCallback((path: Path, item: FootnoteElement) => {
    setFootnoteEdit({
      path,
      item,
    });
  }, []);

  const handleFootnoteModalClose = useCallback(() => {
    setFootnoteEdit({
      path: null,
      item: null,
    });
  }, []);

  const handleFootnoteModalSave = useCallback(
    (next: { label: string; content: string }) => {
      const path = footnoteEdit.path;
      if (!path) {
        handleFootnoteModalClose();
        return;
      }

      if (!safeHasPath(path)) {
        handleFootnoteModalClose();
        return;
      }

      try {
        Transforms.setNodes(
          editor,
          {
            label: next.label.trim() || '각주',
            content: next.content,
          } as Partial<FootnoteElement>,
          { at: path }
        );
        ReactEditor.focus(editor);
      } catch {
        // ignore
      } finally {
        handleFootnoteModalClose();
      }
    },
    [editor, footnoteEdit.path, handleFootnoteModalClose, safeHasPath]
  );

  const handleFootnoteModalDelete = useCallback(() => {
    const path = footnoteEdit.path;
    if (!path) {
      handleFootnoteModalClose();
      return;
    }

    if (!safeHasPath(path)) {
      handleFootnoteModalClose();
      return;
    }

    try {
      Transforms.removeNodes(editor, { at: path });
      ReactEditor.focus(editor);
    } catch {
      // ignore
    } finally {
      handleFootnoteModalClose();
    }
  }, [editor, footnoteEdit.path, handleFootnoteModalClose, safeHasPath]);

  const renderLeaf = useCallback((p: RenderLeafProps) => <Leaf {...p} />, []);
  const renderElement = useCallback(
    (p: RenderElementProps) => (
      <ElementRenderer
        {...p}
        editor={editor}
        onIconClick={handleIconClick}
        openFootnoteEditor={handleFootnoteEditOpen}
        readOnly={false}
        onWikiRefClick={(refType: WikiRefKind, refId: number) => {

        }}
      />
    ),
    [editor, handleFootnoteEditOpen]
  );

  const handleSave = async () => {
    const pathStr = String(doc.path ?? '0');
    const titleTrim = String(doc.title ?? '').trim();

    let samePathDocs: any[] = [];
    try {
      const resList = await fetch(`/api/documents?list=1&path=${encodeURIComponent(pathStr)}`, { cache: 'no-store' });
      if (resList.ok) {
        const data = await resList.json();
        samePathDocs = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      } else {
        const resAll = await fetch(`/api/documents?all=1`, { cache: 'no-store' });
        const data = resAll.ok ? await resAll.json() : [];
        samePathDocs = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      }
    } catch { samePathDocs = []; }

    const isDuplicate = samePathDocs.some(d =>
      String(d.path) === pathStr &&
      String(d.title ?? '').trim() === titleTrim &&
      (doc.id == null || d.id !== doc.id)
    );

    if (isDuplicate) {
      let label = pathStr === '0' ? '루트 카테고리' : '해당 카테고리';
      try {
        const catsRes = await fetch('/api/categories', { cache: 'no-store' });
        if (catsRes.ok) {
          const cats = await catsRes.json();
          const cat = Array.isArray(cats)
            ? cats.find((c: any) => String(c.id) === pathStr || String(c.name) === pathStr)
            : null;
          if (cat?.name) label = cat.name;
        }
      } catch {}
      alert(`${label}에 동일한 제목의 문서가 이미 있어요.`);
      return;
    }

    try {
      const res = await fetch('/api/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...doc, title: titleTrim }),
      });
      if (!res.ok) { alert('저장 실패'); return; }

      let saved: any = null;
      try { saved = await res.json(); } catch {}
      const documentId = saved?.id ?? doc.id;

      if (isMain && doc.path != null) {
        try {
          const catsRes = await fetch('/api/categories', { cache: 'no-store' });
          if (catsRes.ok) {
            const cats = await catsRes.json();
            const category = Array.isArray(cats)
              ? cats.find((c: any) => String(c.id) === pathStr || String(c.name) === pathStr)
              : null;

            if (category) {
              await fetch(`/api/categories/${category.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  document_id: documentId,
                  name: category.name,
                  parent_id: category.parent_id ?? null,
                  order: category.order ?? 0,
                  icon: category.icon ?? null,
                }),
              });
            } else if (pathStr !== '0') {
              alert('카테고리 정보를 찾을 수 없습니다.');
            }
          }
        } catch {}
      }

      serverContentJsonRef.current = serializeContentForDraft(doc.content);
      draftBaselineReadyRef.current = true;

      alert('저장 완료!');
    } catch { alert('문서 저장 실패'); }
  };

  const isSelectionInsideTable = useCallback(() => {
    const { selection } = editor;
    if (!selection) return false;
    const cell = Editor.above(editor, {
      at: selection,
      match: n => SlateElement.isElement(n) && (n as any).type === 'table-cell',
    });
    return !!cell;
  }, [editor]);

  const onCopyTableSafe = useCallback((e: React.ClipboardEvent) => {
    // 1) Shift 드래그 셀 선택: 셀 태그는 제외하고 내용만 복사한다.
    // text/plain에는 실제 문자만, Slate 조각에는 인라인 이미지와 서식을 담는다.
    const rect = getDragRect();
    const rectPayload = rect
      ? buildTableRectClipboardPayload(
          editor,
          rect,
        )
      : null;

    if (rectPayload) {
      e.preventDefault();
      e.stopPropagation();
      setTableClipboardData(
        e.clipboardData,
        rectPayload,
      );
      return;
    }

    // 2) 한 셀 안의 일반 드래그 선택도 table-cell 블록을 제외한다.
    if (!isSelectionInsideTable()) return;

    const { selection } = editor;
    if (!selection) return;

    const rangePayload =
      buildTableRangeClipboardPayload(
        editor,
        selection,
      );
    if (!rangePayload) return;

    e.preventDefault();
    e.stopPropagation();
    setTableClipboardData(
      e.clipboardData,
      rangePayload,
    );
  }, [editor, isSelectionInsideTable]);

  const onPasteTableSafe = useCallback((e: React.ClipboardEvent) => {
    if (!isSelectionInsideTable()) return;

    // ✅ 1) Slate fragment가 있으면 "그대로 통과" (inline-image 포함 복원됨)
    //    - 우리 컨텍스트 메뉴 복사도 이걸 사용
    const slateFrag =
      e.clipboardData.getData('application/x-slate-fragment') ||
      e.clipboardData.getData('text/x-slate-fragment'); // 호환용

    if (slateFrag && slateFrag.length > 0) {
      return; // preventDefault 하지 않음 → Slate가 fragment paste 처리
    }

    // ✅ 2) 표/td HTML이 들어오는 "외부 표 복붙"만 차단하고 text/plain만 넣기
    const html = e.clipboardData.getData('text/html') || '';
    const hasTableHtml = /<(table|tbody|tr|td|th)\b/i.test(html);

    if (hasTableHtml) {
      const text = e.clipboardData.getData('text/plain') || '';
      e.preventDefault();
      e.stopPropagation();
      Transforms.insertText(editor, text);
    }
  }, [editor, isSelectionInsideTable]);

  const openInlineImageModalRef = useRef<(() => void) | null>(null);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const HOTKEYS: Record<string, string> = {
      'mod+b': 'bold',
      'mod+i': 'italic',
      'mod+u': 'underline',
      'mod+shift+x': 'strikethrough',
    };
    for (const hotkey in HOTKEYS) {
      if (isHotkey(hotkey, event)) {
        event.preventDefault();
        const format = HOTKEYS[hotkey];
        Transforms.setNodes(editor, { [format]: true } as any, {
          match: n => SlateElement.isElement(n) && Editor.isInline(editor, n),
        });
      }

      if (isHotkey('mod+shift+e', event)) {
        event.preventDefault();
        openInlineImageModalRef.current?.();
        return;
      }
    }

    // heading에서 Enter → 아래에 paragraph (기존)
    if (event.key === 'Enter') {
      const [matchH] = Editor.nodes(editor, {
        match: n =>
          SlateElement.isElement(n) &&
          ['heading-one', 'heading-two', 'heading-three'].includes(n.type),
      });
      if (matchH) {
        event.preventDefault();
        Transforms.insertNodes(
          editor,
          { type: 'paragraph', children: [{ text: '' }] } as any,
        );
        return;
      }
    }

    // info-box 안에서는 Enter → 같은 박스 안에서 줄바꿈(개행) 처리
    // - 기본 Enter: \n 삽입 (박스 내부 여러 줄)
    // - (선택) Ctrl/Cmd+Enter: 박스 바깥으로 빠져나와 새 paragraph 생성
    if (event.key === 'Enter') {
      const ibEntry = Editor.above(editor, {
        match: n => SlateElement.isElement(n) && (n as any).type === 'info-box',
      });

      if (ibEntry) {
        event.preventDefault();

        // Ctrl/Cmd+Enter: 박스 밖으로 나가기 (원하면 유지)
        if (event.ctrlKey || event.metaKey) {
          const [, ibPath] = ibEntry;
          const insertPath = Path.next(ibPath);

          Transforms.insertNodes(
            editor,
            { type: 'paragraph', children: [{ text: '' }] } as any,
            { at: insertPath },
          );

          Transforms.select(editor, Editor.start(editor, insertPath));
          ReactEditor.focus(editor);
          return;
        }

        // 기본 Enter: 박스 내부에서 줄바꿈
        Transforms.insertText(editor, '\n');
        return;
      }
    }

    // ⭐ 무기 카드 / 시세표 카드 뒤 "빈 단락"에서 Enter 처리
    //    → 카드 복사하지 않고, 그 아래에 새 paragraph 하나 추가
    if (event.key === 'Enter' && !event.shiftKey) {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        try {
          const [block, blockPath] = Editor.node(editor, selection, {
            depth: 1,
          });

          const isEmptyParagraph =
            SlateElement.isElement(block) &&
            (block as any).type === 'paragraph' &&
            Node.string(block) === '';

          if (isEmptyParagraph && blockPath[0] > 0) {
            const prevPath: Path = [blockPath[0] - 1];

            let prevNode: Node | null = null;
            try {
              prevNode = Node.get(editor, prevPath);
            } catch {
              prevNode = null;
            }

            if (
              prevNode &&
              SlateElement.isElement(prevNode) &&
              ['weapon-card', 'price-table-card', 'quest-embed', 'npc-embed', 'qna-embed'].includes(
                (prevNode as any).type,
              )
            ) {
              event.preventDefault();

              const insertPath = Path.next(blockPath);
              const paragraph: any = {
                type: 'paragraph',
                children: [{ text: '' }],
              };

              Transforms.insertNodes(editor, paragraph, { at: insertPath });
              Transforms.select(editor, Editor.start(editor, insertPath));
              ReactEditor.focus(editor);
              return;
            }
          }
        } catch {
          // 실패 시엔 그냥 기본 동작으로 넘어가도록 둠
        }
      }
    }

    if (event.key === 'Backspace') {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        const [match] = Editor.nodes(editor, {
          match: n =>
            SlateElement.isElement(n) &&
            ['heading-one', 'heading-two', 'heading-three'].includes(n.type),
        });
        if (match) {
          const [, path] = match;
          const start = Editor.start(editor, path);
          if (Point.equals(selection.anchor, start)) {
            event.preventDefault();
            Transforms.removeNodes(editor, { at: path });
            Transforms.insertNodes(
              editor,
              { type: 'paragraph', children: [{ text: '' }] } as any,
            );
            const point = Editor.start(editor, [0]);
            Transforms.select(editor, point);
          }
        }
      }
    }

    if (event.key === 'Backspace') {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        const [currentBlock] = Editor.nodes(editor, {
          match: n =>
            SlateElement.isElement(n) && Editor.isBlock(editor, n),
        });
        if (!currentBlock) return;
        const [, currentPath] = currentBlock;
        if (currentPath[0] === 0) return;
        const prevPath = Path.previous(currentPath);
        try {
          const prevNode = Node.get(editor, prevPath);
          if (
            SlateElement.isElement(prevNode) &&
            prevNode.type === 'info-box'
          ) {
            const isEmpty =
              Node.string(currentBlock[0]).length === 0;
            if (isEmpty) {
              event.preventDefault();
              Transforms.removeNodes(editor, { at: currentPath });
              Transforms.removeNodes(editor, { at: prevPath });
              const newPath = prevPath[0] > 0 ? [prevPath[0] - 1] : [0];
              const point = Editor.end(editor, newPath);
              Transforms.select(editor, point);
              ReactEditor.focus(editor);
              return;
            }
          }
        } catch {}
      }
    }

    if (event.key === 'Backspace') {
      const { selection } = editor;
      if (selection && Range.isCollapsed(selection)) {
        const [node, path] = Editor.node(editor, selection, {
          depth: 1,
        });
        const isEmpty =
          SlateElement.isElement(node) &&
          node.type === 'paragraph' &&
          Node.string(node) === '';
        if (isEmpty && path[0] > 0) {
          const prevPath = [path[0] - 1];
          const prevNode = Node.get(editor, prevPath);
          if (
            SlateElement.isElement(prevNode) &&
            prevNode.type === 'price-table-card'
          ) {
            event.preventDefault();
            return;
          }
        }
      }
    }

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      Transforms.splitNodes(editor, { always: true });
      const marks = Editor.marks(editor) || {};
      Object.keys(marks).forEach(m =>
        Editor.removeMark(editor, m as any),
      );
      const { selection } = editor;
      if (selection) {
        const [block, path] = Editor.node(editor, selection, {
          depth: 1,
        });
        if (SlateElement.isElement(block)) {
          const patch: any = {};
          if ('indentLine' in block) patch.indentLine = false;
          if ('textAlign' in block) patch.textAlign = undefined;
          if (Object.keys(patch).length > 0)
            Transforms.setNodes(editor, patch, { at: path });
        }
      }
      return;
    }

    const { selection } = editor;
    if (
      selection &&
      Range.isCollapsed(selection) &&
      ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
        event.key,
      )
    ) {
      const backward =
        event.key === 'ArrowLeft' || event.key === 'ArrowUp';
      const neighborPoint = backward
        ? Editor.before(editor, selection, { unit: 'block' })
        : Editor.after(editor, selection, { unit: 'block' });
      if (neighborPoint) {
        const entry = Editor.above(editor, {
          at: neighborPoint,
          match: n =>
            SlateElement.isElement(n) && Editor.isBlock(editor, n),
        });
        if (entry) {
          const [node, path] = entry;
          const type = (node as any).type;
          if (type === 'link-block-row' || VOID_BLOCK_TYPES.has(type)) {
            event.preventDefault();
            const target = backward
              ? Editor.before(editor, path)
              : Editor.after(editor, path);
            if (target) {
              Transforms.select(editor, target);
              ReactEditor.focus(editor);
            }
            return;
          }
        }
      }
    }
  };

  return (
    <>
      <div className="editor-layout">
        <div className="editor-left">
          <div className="meta-card">
            <div className="meta-title">문서 정보</div>

            {/* 문서 제목 */}
            <div className="meta-field">
              <label className="meta-label">문서 제목</label>
              <input
                type="text"
                className="meta-input"
                placeholder="문서 제목을 입력하세요"
                value={doc.title}
                onChange={e => setDoc(prev => ({ ...prev, title: e.target.value }))}
                required
              />
            </div>

            {/* 태그 */}
            <div className="meta-field">
              <label className="meta-label">태그</label>
              <input
                type="text"
                className="meta-input"
                placeholder="#태그1 #태그2"
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onBlur={() => {
                  const tags = tagInput.split('#').map(t => t.trim()).filter(Boolean).map(t => '#' + t);
                  setDoc(prev => ({ ...prev, tags }));
                }}
              />
            </div>

            {/* 문서 아이콘 */}
            <div className="meta-field">
              <label className="meta-label">문서 아이콘</label>
              <div className="meta-icon-row">
                <input
                  type="text"
                  className="meta-input meta-icon-input"
                  maxLength={100}
                  placeholder=""
                  value={doc.icon}
                  onChange={e => setDoc(prev => ({ ...prev, icon: e.target.value }))}
                />
                <button
                  type="button"
                  onClick={() => setIconModalOpen(true)}
                  className="editor-toolbar-btn-plain meta-icon-action"
                  title="이미지 선택"
                >
                  <FontAwesomeIcon icon={faImage} />
                </button>

                {doc.icon?.trim() && (
                  isImageUrl(doc.icon) ? (
                    iconImgError ? (
                      // 이미지 로딩 실패 시: 텍스트로 fallback (깨진 아이콘 방지)
                      <span className="meta-icon-fallback">🖼️</span>
                    ) : (
                      <img
                        src={getIconSrc(doc.icon)}
                        alt="문서 아이콘"
                        width={36}
                        height={36}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        onError={() => setIconImgError(true)}
                        className="meta-icon-preview"
                      />
                    )
                  ) : (
                    <span className="meta-icon-emoji">{doc.icon}</span>
                  )
                )}

                <ImageSelectModal
                  open={iconModalOpen}
                  onClose={() => setIconModalOpen(false)}
                  onSelectImage={(url) => {
                    setDoc(prev => ({ ...prev, icon: url }));
                    setIconModalOpen(false);
                  }}
                />

                {doc.icon && (
                  <button
                    type="button"
                    onClick={() => setDoc(prev => ({ ...prev, icon: '' }))}
                    className="editor-toolbar-btn-plain meta-icon-action"
                    title="아이콘 삭제"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* 저장 */}
            <button className="meta-save" onClick={handleSave}>저장</button>

            <div className="meta-drafts">
              <div className="meta-drafts-title">
                자동 임시 저장
              </div>

              <div className="meta-drafts-list">
                {[1, 2, 3].map((slotNumber) => {
                  const slot = draftSlots.find((item) => item.slot === slotNumber);
                  const enabled = !!slot;

                  return (
                    <button
                      key={slotNumber}
                      type="button"
                      onClick={() => handleRestoreDraftSlot(slotNumber)}
                      disabled={!enabled}
                      title={slot ? formatDraftSavedAt(slot.savedAt) : ''}
                      className={[
                        'meta-draft-slot',
                        enabled ? 'is-active' : '',
                      ].filter(Boolean).join(' ')}
                    >
                      {slotNumber}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="editor-center">
          <div
            className="editor-content-scroll"
            ref={scrollRef}
            style={{
              position: 'relative',
              overscrollBehavior: 'contain' as any,
              overflowAnchor: 'none' as any, // ✅ 앵커링 끔
            }}
          >
            <Slate
              key={editorKey}
              editor={editor}
              value={doc.content.length > 0 ? doc.content : EMPTY_INITIAL_VALUE}
              onChange={newValue => {
                setDoc(prev => ({ ...prev, content: newValue }));

                // ✅ (미세 방어) selection이 존재해도 예외 케이스에서 깨지는 라이브러리 버전이 있어서 방어
                try {
                  if (editor.selection) selectionRef.current = editor.selection;
                  else selectionRef.current = null;
                } catch {
                  selectionRef.current = null;
                }
              }}
            >
              <div className="editor-toolbar-wrapper">
                <Toolbar
                  selectionRef={selectionRef}
                  openInlineImageModalRef={openInlineImageModalRef}
                />
              </div>
              <Editable
                renderLeaf={renderLeaf}
                renderElement={renderElement}
                readOnly={false}
                style={{
                  fontFamily: "'NanumSquareRound', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                  fontSize: '19px',
                }}
                onKeyDown={onKeyDown}
                placeholder="문서를 작성하세요..."
                spellCheck={false}
                className="editor-slate-content"
                onBlur={() => { selectionRef.current = editor.selection; }}
                onCopy={onCopyTableSafe}
                onCut={onCopyTableSafe}   // 잘라내기도 동일하게 처리 (원하면 분리 가능)
                onPaste={onPasteTableSafe}
              />
            </Slate>
          </div>
        </div>

        <div className="editor-right">
          <TableOfContents headings={headings} />
        </div>
      </div>

      {footnoteEdit.path && footnoteEdit.item && (
        <FootnoteEditModal
          open={true}
          item={footnoteEdit.item}
          onClose={handleFootnoteModalClose}
          onSave={handleFootnoteModalSave}
          onDelete={handleFootnoteModalDelete}
        />
      )}
      
      <PriceTableContextMenu editor={editor} />
      <InfoBoxContextMenu editor={editor} />
      <DividerContextMenu editor={editor} />
      <ImageContextMenu editor={editor} />
      <LinkBlockContextMenu editor={editor} />
      <TableContextMenu editor={editor} />
      <TextContextMenu editor={editor} />
      <HeadingContextMenu editor={editor} />
      <LinkContextMenu editor={editor} />
    </>
  );
}

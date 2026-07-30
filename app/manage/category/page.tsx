// app/manage/category/page.tsx
'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type ReactElement,
  type MouseEvent as ReactMouseEvent,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBook, faList } from '@fortawesome/free-solid-svg-icons';
import Image, { type StaticImageData } from 'next/image';
import WikiHeader from '@/components/common/Header';
import ImageSelectModal from '@/components/image/ImageSelectModal';
import '@/wiki/css/manage-category.css';
import logo from '../../image/logo.png';
import { toProxyUrl } from '@lib/cdn';

type Role = 'guest' | 'writer' | 'admin';

type Category = {
  id: number;
  name: string;
  parent_id: number | null;
  order: number;
  document_id?: number | null;
  document_path?: string;
  icon?: string | StaticImageData;
  children: Category[];
  mode_tags?: string[];
  uploader?: string;
};

type Document = {
  id: number;
  title: string;
  path: string;
  order: number;
  created_at: string;
  updated_at: string;
  icon?: string;
  tags?: string[] | string;
  is_featured: boolean;
  fullPath?: number[];
  uploader?: string;
};

type RecentDocument = Pick<Document, 'id' | 'title' | 'path' | 'icon'> & {
  attemptedAt: number;
};

type DeleteTarget = 'document' | 'category' | null;

type ReorderItem = {
  id: number;
  order: number;
};

const MODE_OPTIONS: Array<{ key: string; label: string }> = [
  { key: 'RPG', label: 'RPG' },
  { key: '렌독런', label: '렌독런' },
  { key: '마인팜', label: '마인팜' },
  { key: '부엉이타운', label: '부엉이타운' },
];

const RECENT_DOCUMENTS_KEY = 'rdwiki:manage-category:recent-edit-documents';
const MAX_RECENT_DOCUMENTS = 5;
const MAX_CHIPS = 2;

function BareModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div
      className="rd-overlay"
      role="presentation"
      onMouseDown={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {children}
    </div>
  );
}

function EntityIcon({
  icon,
  size = 24,
  fallback = '📄',
  className,
}: {
  icon?: string | StaticImageData;
  size?: number;
  fallback?: string;
  className?: string;
}) {
  if (typeof icon === 'object' && icon && 'src' in icon) {
    return (
      <Image
        src={icon}
        alt=""
        width={size}
        height={size}
        className={className}
      />
    );
  }

  if (typeof icon === 'string' && icon.startsWith('http')) {
    return (
      <img
        src={toProxyUrl(icon)}
        alt=""
        width={size}
        height={size}
        className={className}
        loading="lazy"
        decoding="async"
      />
    );
  }

  return <span className={className}>{typeof icon === 'string' && icon ? icon : fallback}</span>;
}

function SortableCategoryItem({
  node,
  selected,
  open,
  onClick,
  onToggleOpen,
  hoverId,
  shiftMode,
  children,
  appliedTags,
  disabled,
}: {
  node: Category;
  selected: Category | null;
  open: Set<number>;
  onClick: () => void;
  onToggleOpen: (id: number) => void;
  hoverId: number | null;
  shiftMode: boolean;
  children?: ReactNode;
  appliedTags: string[];
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `cat-${node.id}`,
    disabled,
  });

  const isOpen = open.has(node.id);
  const highlighted = shiftMode && hoverId === node.id;
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.42 : 1,
  };

  return (
    <li ref={setNodeRef} className="sortable-category-item" style={style} {...attributes}>
      <div
        className={`category-row${selected?.id === node.id ? ' active' : ''}${disabled ? ' drag-disabled' : ''}${highlighted ? ' shift-drop-target' : ''}`}
      >
        <span
          className="grab-handle"
          {...listeners}
          aria-label={disabled ? '순서 변경 권한 없음' : '드래그로 순서 변경'}
        >
          ⠿
        </span>
        <button
          type="button"
          className="category-label"
          onClick={onClick}
          aria-current={selected?.id === node.id ? 'true' : undefined}
        >
          <EntityIcon icon={node.icon} size={20} fallback="📁" className="tree-icon-image" />
          <span>{node.name}</span>
        </button>

        {appliedTags.length > 0 && (
          <div className="category-tags">
            {appliedTags.slice(0, MAX_CHIPS).map((tag) => (
              <span key={`chip-${node.id}-${tag}`} className="category-mode-chip">
                ✓&nbsp;#{tag}
              </span>
            ))}
            {appliedTags.length > MAX_CHIPS && (
              <span className="category-mode-more">+{appliedTags.length - MAX_CHIPS}</span>
            )}
          </div>
        )}

        {node.children.length > 0 && (
          <button
            type="button"
            onClick={(event: ReactMouseEvent<HTMLButtonElement>) => {
              event.stopPropagation();
              onToggleOpen(node.id);
            }}
            className="category-toggle-btn"
            tabIndex={-1}
            aria-expanded={isOpen}
            aria-label={isOpen ? '하위 닫기' : '하위 열기'}
          >
            {isOpen ? '▼' : '▶'}
          </button>
        )}
      </div>
      {children}
    </li>
  );
}

function SortableDocItem({
  doc,
  onClick,
  isSelected,
  disabled,
}: {
  doc: Document;
  onClick: () => void;
  isSelected: boolean;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `doc-${doc.id}`,
    disabled,
  });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.42 : 1,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`category-doc-item${isSelected ? ' selected' : ''}${disabled ? ' drag-disabled' : ''}`}
      {...attributes}
      onClick={onClick}
    >
      <span
        className="grab-handle"
        {...listeners}
        aria-label={disabled ? '순서 변경 권한 없음' : '드래그로 순서 변경'}
      >
        ⠿
      </span>
      <span className="doc-icon">
        <EntityIcon icon={doc.icon} size={22} fallback="📄" className="doc-img-icon" />
      </span>
      <span className="doc-title-text">{doc.title}</span>
      {doc.is_featured ? <span className="doc-featured-label">대표 문서</span> : null}
    </li>
  );
}

async function postJson(url: string, body: unknown) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (response.ok) return;

  const payload = await response.json().catch(() => null);
  throw new Error(payload?.error || `요청에 실패했습니다. (${response.status})`);
}

export default function CategoryManager() {
  const [user, setUser] = useState<any>(null);
  const [tree, setTree] = useState<Category[]>([]);
  const [open, setOpen] = useState<Set<number>>(new Set([0]));
  const [selected, setSelected] = useState<Category | null>(null);
  const [selectedCategoryPath, setSelectedCategoryPath] = useState<number[]>([]);
  const [allDocuments, setAllDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [categoryIdToPathMap, setCategoryIdToPathMap] = useState<Record<number, number[]>>({});
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>([]);

  const [showImageModal, setShowImageModal] = useState(false);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [loadingCreate, setLoadingCreate] = useState(false);

  const [catDeleteOpen, setCatDeleteOpen] = useState(false);
  const [docDeleteOpen, setDocDeleteOpen] = useState(false);
  const [passwordDeleteOpen, setPasswordDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [loadingDelete, setLoadingDelete] = useState(false);

  const [hoverId, setHoverId] = useState<number | null>(null);
  const hoverTimerRef = useRef<number | null>(null);
  const shiftRef = useRef(false);
  const [isShift, setIsShift] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  const role: Role =
    user?.role === 'admin' ? 'admin' : user?.role === 'writer' ? 'writer' : 'guest';
  const isAdmin = role === 'admin';
  const canManage = isAdmin || role === 'writer';

  useEffect(() => {
    fetch('/api/auth/me')
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setUser(data?.user ?? null))
      .catch(() => setUser(null));

    try {
      const stored = localStorage.getItem(RECENT_DOCUMENTS_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed)) return;
      const normalized = parsed
        .filter((item) => Number.isFinite(Number(item?.id)) && typeof item?.title === 'string')
        .slice(0, MAX_RECENT_DOCUMENTS)
        .map((item) => ({
          id: Number(item.id),
          title: String(item.title),
          path: String(item.path ?? ''),
          icon: typeof item.icon === 'string' ? item.icon : undefined,
          attemptedAt: Number(item.attemptedAt ?? Date.now()),
        }));
      setRecentDocs(normalized);
    } catch {
      localStorage.removeItem(RECENT_DOCUMENTS_KEY);
    }
  }, []);

  useEffect(() => {
    fetchCategories();

    const handleToggleOpen = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail;
      if (detail !== undefined) toggleOpen(detail);
    };

    window.addEventListener('toggleOpen', handleToggleOpen);
    return () => window.removeEventListener('toggleOpen', handleToggleOpen);
  }, []);

  useEffect(() => {
    refreshDocuments();
  }, [categoryIdToPathMap]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        shiftRef.current = true;
        setIsShift(true);
      }
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Shift') {
        shiftRef.current = false;
        setIsShift(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const filteredDocs = useMemo(() => {
    if (!selectedCategoryPath.length) return [];
    const categoryId = selectedCategoryPath.at(-1)!;
    return allDocuments.filter((doc) => String(doc.path) === String(categoryId));
  }, [allDocuments, selectedCategoryPath]);

  const docsSorted = useMemo(
    () => [...filteredDocs].sort((a, b) => a.order - b.order),
    [filteredDocs]
  );

  const appliedTagsMap = useMemo(() => {
    const map = new Map<number, string[]>();
    const roots = tree.length === 1 && tree[0]?.id === 0 ? tree[0].children : tree;

    const visit = (node: Category, inherited: Set<string>) => {
      const merged = new Set(inherited);
      const ownTags =
        selected?.id === node.id ? selected.mode_tags ?? [] : node.mode_tags ?? [];
      ownTags.map(String).map((tag) => tag.trim()).filter(Boolean).forEach((tag) => merged.add(tag));
      map.set(node.id, [...merged]);
      node.children.forEach((child) => visit(child, merged));
    };

    roots.forEach((node) => visit(node, new Set()));
    map.set(0, []);
    return map;
  }, [tree, selected]);

  function buildTree(list: Category[]) {
    const map = new Map<number, Category>();
    list.forEach((item) => map.set(item.id, { ...item, children: [] }));

    const roots: Category[] = [];
    list.forEach((item) => {
      const node = map.get(item.id)!;
      if (item.parent_id === null || item.parent_id === 0) roots.push(node);
      else map.get(item.parent_id)?.children.push(node);
    });

    for (const node of map.values()) node.children.sort((a, b) => a.order - b.order);
    return roots.sort((a, b) => a.order - b.order);
  }

  function findCategoryById(nodes: Category[], id: number): Category | null {
    for (const node of nodes) {
      if (node.id === id) return node;
      const found = findCategoryById(node.children, id);
      if (found) return found;
    }
    return null;
  }

  function findParent(nodes: Category[], childId: number): Category | null {
    for (const node of nodes) {
      if (node.children.some((child) => child.id === childId)) return node;
      const found = findParent(node.children, childId);
      if (found) return found;
    }
    return null;
  }

  function isDescendant(nodes: Category[], ancestorId: number, childId: number) {
    const ancestor = findCategoryById(nodes, ancestorId);
    if (!ancestor) return false;
    const stack = [...ancestor.children];

    while (stack.length) {
      const node = stack.pop()!;
      if (node.id === childId) return true;
      stack.push(...node.children);
    }
    return false;
  }

  function removeFromOldParent(nodes: Category[], id: number) {
    const parent = findParent(nodes, id);
    if (!parent) return { parent: null, removed: null as Category | null };
    const index = parent.children.findIndex((child) => child.id === id);
    const [removed] = parent.children.splice(index, 1);
    return { parent, removed };
  }

  async function fetchCategories(preferredCategoryId?: number | null) {
    try {
      const response = await fetch(`/api/categories?ts=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('카테고리 조회 실패');

      const flat: Category[] = await response.json();
      const built = buildTree(flat);
      const root: Category = {
        id: 0,
        name: 'RenDog Wiki',
        parent_id: null,
        order: 0,
        icon: logo,
        document_path: '',
        children: built,
      };
      const nextTree = [root];
      const idToPathMap: Record<number, number[]> = {};

      const buildMap = (nodes: Category[], path: number[] = []) => {
        nodes.forEach((node) => {
          const currentPath = [...path, node.id];
          idToPathMap[node.id] = currentPath;
          buildMap(node.children, currentPath);
        });
      };
      buildMap(built);

      setTree(nextTree);
      setCategoryIdToPathMap(idToPathMap);

      const keepId = preferredCategoryId ?? selected?.id ?? null;
      if (keepId === 0) {
        setSelected(root);
        setSelectedCategoryPath([0]);
      } else if (keepId) {
        const nextSelected = findCategoryById(nextTree, keepId);
        if (nextSelected) {
          setSelected(nextSelected);
          setSelectedCategoryPath(idToPathMap[keepId] ?? [keepId]);
        }
      }
    } catch {
      setTree([]);
      setCategoryIdToPathMap({});
    }
  }

  async function refreshDocuments() {
    try {
      const response = await fetch(`/api/documents?all=1&ts=${Date.now()}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!Array.isArray(data)) {
        setAllDocuments([]);
        return;
      }

      setAllDocuments(
        data.map((doc: Document & { path: number | string }) => ({
          ...doc,
          path: String(doc.path),
          order: Number(doc.order ?? 0),
          fullPath: categoryIdToPathMap[Number(doc.path)] ?? [Number(doc.path)],
        }))
      );
    } catch {
      setAllDocuments([]);
    }
  }

  function toggleOpen(id: number) {
    setOpen((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleCategorySelect(node: Category, currentPath: number[]) {
    setSelected(node);
    setSelectedDoc(null);
    setSelectedCategoryPath(currentPath);
  }

  function persistRecentDocuments(items: RecentDocument[]) {
    setRecentDocs(items);
    try {
      localStorage.setItem(RECENT_DOCUMENTS_KEY, JSON.stringify(items));
    } catch {
      // 저장소를 사용할 수 없는 환경에서도 문서 이동은 계속 진행한다.
    }
  }

  function rememberRecentDocument(doc: Document) {
    const nextItem: RecentDocument = {
      id: doc.id,
      title: doc.title,
      path: String(doc.path),
      icon: doc.icon,
      attemptedAt: Date.now(),
    };
    const next = [nextItem, ...recentDocs.filter((item) => item.id !== doc.id)].slice(
      0,
      MAX_RECENT_DOCUMENTS
    );
    persistRecentDocuments(next);
  }

  function removeRecentDocument(documentId: number) {
    persistRecentDocuments(recentDocs.filter((item) => item.id !== documentId));
  }

  function selectRecentDocument(recent: RecentDocument) {
    const liveDocument = allDocuments.find((doc) => doc.id === recent.id);
    if (!liveDocument) {
      removeRecentDocument(recent.id);
      alert('삭제되었거나 더 이상 조회할 수 없는 문서입니다.');
      return;
    }

    const categoryId = Number(liveDocument.path);
    const categoryPath = categoryIdToPathMap[categoryId] ?? [categoryId];
    const category = findCategoryById(tree, categoryId);
    if (!category) {
      alert('문서가 속한 카테고리를 찾을 수 없습니다.');
      return;
    }

    setOpen((previous) => new Set([...previous, 0, ...categoryPath.slice(0, -1)]));
    setSelected(category);
    setSelectedCategoryPath(categoryPath);
    setSelectedDoc(liveDocument);
  }

  function openDocumentEditor(doc: Document) {
    rememberRecentDocument(doc);
    location.href = `/wiki/write?path=${encodeURIComponent(doc.path)}&title=${encodeURIComponent(
      doc.title
    )}&id=${doc.id}`;
  }

  async function createCategory() {
    if (!selected || !canManage) return;
    const name = newCatName.trim();
    if (!name) return;

    try {
      setLoadingCreate(true);
      const response = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          parent_id: selected.id === 0 ? null : selected.id,
          order: 0,
          icon: '',
        }),
      });
      if (!response.ok) throw new Error();

      setNewCatOpen(false);
      setNewCatName('');
      setOpen((previous) => new Set(previous).add(selected.id));
      await fetchCategories(selected.id);
    } catch {
      alert('카테고리 생성에 실패했습니다.');
    } finally {
      setLoadingCreate(false);
    }
  }

  async function handleSaveCategory() {
    if (!selected || selected.id === 0 || !canManage) return;

    const modeTags = Array.from(
      new Set((selected.mode_tags ?? []).map(String).map((tag) => tag.trim()).filter(Boolean))
    );
    const response = await fetch(`/api/categories/${selected.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: selected.name,
        parent_id: selected.parent_id,
        order: selected.order,
        document_id: selected.document_id ?? null,
        icon: typeof selected.icon === 'string' ? selected.icon : null,
        mode_tags: modeTags,
      }),
    });

    if (!response.ok) {
      alert('카테고리 저장에 실패했습니다.');
      return;
    }
    await fetchCategories(selected.id);
  }

  function openPasswordStep(target: Exclude<DeleteTarget, null>) {
    setDocDeleteOpen(false);
    setCatDeleteOpen(false);
    setDeleteTarget(target);
    setDeletePassword('');
    setDeleteError('');
    setPasswordDeleteOpen(true);
  }

  function closePasswordDelete() {
    if (loadingDelete) return;
    setPasswordDeleteOpen(false);
    setDeleteTarget(null);
    setDeletePassword('');
    setDeleteError('');
  }

  async function deleteDocument(password: string) {
    if (!selectedDoc || !isAdmin) return;

    const response = await fetch(`/api/documents?id=${selectedDoc.id}`, {
      method: 'DELETE',
      headers: { 'x-rd-delete-password': password },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || '문서 삭제에 실패했습니다.');
    }

    removeRecentDocument(selectedDoc.id);
    setSelectedDoc(null);
    await refreshDocuments();
  }

  async function deleteCategory(password: string) {
    if (!selected || selected.id === 0 || !isAdmin) return;

    const response = await fetch(`/api/categories/${selected.id}`, {
      method: 'DELETE',
      headers: { 'x-rd-delete-password': password },
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      throw new Error(payload?.error || '카테고리 삭제에 실패했습니다.');
    }

    setSelected(null);
    setSelectedDoc(null);
    setSelectedCategoryPath([]);
    await fetchCategories(null);
    await refreshDocuments();
  }

  async function confirmPasswordDelete() {
    if (!deleteTarget || !deletePassword || !isAdmin) return;

    try {
      setLoadingDelete(true);
      setDeleteError('');
      if (deleteTarget === 'document') await deleteDocument(deletePassword);
      else await deleteCategory(deletePassword);
      setPasswordDeleteOpen(false);
      setDeleteTarget(null);
      setDeletePassword('');
      setDeleteError('');
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : '삭제에 실패했습니다.');
    } finally {
      setLoadingDelete(false);
    }
  }

  async function moveCategoryToParent(dragId: number, targetParentId: number) {
    if (
      targetParentId === dragId ||
      isDescendant(tree, dragId, targetParentId) ||
      !canManage
    ) {
      return;
    }

    const nextTree: Category[] = structuredClone(tree);
    const { parent: oldParent, removed } = removeFromOldParent(nextTree, dragId);
    const newParent = findCategoryById(nextTree, targetParentId);
    if (!removed || !newParent) return;

    removed.parent_id = targetParentId === 0 ? null : targetParentId;
    removed.order = newParent.children.length;
    newParent.children.push(removed);
    setTree(nextTree);

    const items: ReorderItem[] = [];
    oldParent?.children.forEach((item, order) => items.push({ id: item.id, order }));
    newParent.children.forEach((item, order) => items.push({ id: item.id, order }));

    try {
      await postJson('/api/categories/reorder', {
        items,
        moved: {
          id: dragId,
          parent_id: targetParentId === 0 ? null : targetParentId,
        },
      });
      await fetchCategories(dragId);
    } catch (error) {
      alert(error instanceof Error ? error.message : '카테고리 이동에 실패했습니다.');
      await fetchCategories(selected?.id);
    }
  }

  function onDragOver(event: any) {
    if (!shiftRef.current) {
      setHoverId(null);
      return;
    }

    const overId = String(event.over?.id ?? '');
    if (!overId.startsWith('cat-')) {
      setHoverId(null);
      return;
    }

    const id = Number(overId.slice(4));
    if (!Number.isFinite(id)) return;
    setHoverId(id);

    if (!open.has(id)) {
      if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = window.setTimeout(() => toggleOpen(id), 350);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverId(null);

    if (!over || !canManage) return;
    const activeId = String(active.id);
    const overId = String(over.id);

    if (activeId.startsWith('doc-')) {
      const documentId = Number(activeId.slice(4));

      if (shiftRef.current && overId.startsWith('cat-')) {
        const targetCategoryId = Number(overId.slice(4));
        if (!Number.isFinite(targetCategoryId)) return;

        try {
          await postJson('/api/documents/reorder', {
            move: { id: documentId, path: String(targetCategoryId) },
          });
          setSelectedDoc(null);
          await refreshDocuments();
        } catch (error) {
          alert(error instanceof Error ? error.message : '문서 이동에 실패했습니다.');
        }
        return;
      }

      if (!overId.startsWith('doc-')) return;
      const overDocumentId = Number(overId.slice(4));
      const oldIndex = docsSorted.findIndex((doc) => doc.id === documentId);
      const newIndex = docsSorted.findIndex((doc) => doc.id === overDocumentId);
      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

      const reordered = arrayMove(docsSorted, oldIndex, newIndex);
      setAllDocuments((previous) => {
        const next = [...previous];
        reordered.forEach((doc, order) => {
          const index = next.findIndex((item) => item.id === doc.id);
          if (index >= 0) next[index] = { ...next[index], order };
        });
        return next;
      });

      try {
        await postJson('/api/documents/reorder', {
          items: reordered.map((doc, order) => ({ id: doc.id, order })),
        });
      } catch (error) {
        alert(error instanceof Error ? error.message : '문서 순서 변경에 실패했습니다.');
        await refreshDocuments();
      }
      return;
    }

    if (!(activeId.startsWith('cat-') && overId.startsWith('cat-'))) return;
    const categoryId = Number(activeId.slice(4));
    const overCategoryId = Number(overId.slice(4));
    if (
      !Number.isFinite(categoryId) ||
      !Number.isFinite(overCategoryId) ||
      categoryId === overCategoryId ||
      categoryId === 0
    ) {
      return;
    }

    if (shiftRef.current) {
      await moveCategoryToParent(categoryId, overCategoryId);
      return;
    }

    const nextTree: Category[] = structuredClone(tree);
    const activeParent = findParent(nextTree, categoryId);
    const overParent = findParent(nextTree, overCategoryId);
    if (!activeParent || !overParent || activeParent.id !== overParent.id) return;

    const oldIndex = activeParent.children.findIndex((item) => item.id === categoryId);
    const newIndex = activeParent.children.findIndex((item) => item.id === overCategoryId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;

    activeParent.children = arrayMove(activeParent.children, oldIndex, newIndex);
    setTree(nextTree);
    const updatedSelected = selected ? findCategoryById(nextTree, selected.id) : null;
    if (updatedSelected) setSelected(updatedSelected);

    try {
      await postJson('/api/categories/reorder', {
        items: activeParent.children.map((item, order) => ({ id: item.id, order })),
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : '카테고리 순서 변경에 실패했습니다.');
      await fetchCategories(selected?.id);
    }
  }

  const renderTree = (
    nodes: Category[],
    currentPath: number[] = [],
    depth = 0
  ): ReactElement => (
    <SortableContext
      items={nodes.map((node) => `cat-${node.id}`)}
      strategy={verticalListSortingStrategy}
    >
      <ul className="category-tree-list" role={depth === 0 ? 'tree' : 'group'}>
        {nodes.map((node) => {
          const path = [...currentPath, node.id];
          return (
            <SortableCategoryItem
              key={node.id}
              node={node}
              selected={selected}
              open={open}
              onClick={() => handleCategorySelect(node, path)}
              onToggleOpen={toggleOpen}
              hoverId={hoverId}
              shiftMode={isShift}
              appliedTags={appliedTagsMap.get(node.id) ?? []}
              disabled={!canManage || node.id === 0}
            >
              {open.has(node.id) && node.children.length > 0 && (
                <div className="category-tree-children">
                  {renderTree(node.children, path, depth + 1)}
                </div>
              )}
            </SortableCategoryItem>
          );
        })}
      </ul>
    </SortableContext>
  );

  const canOpenCreateModal = Boolean(selected && canManage);
  const categoryIcon = typeof selected?.icon === 'string' ? selected.icon : '';
  const emojiValue = categoryIcon && !categoryIcon.startsWith('http') ? categoryIcon : '';

  return (
    <div className="category-manager-container">
      <WikiHeader user={user} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragOver={onDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={() => {
          if (hoverTimerRef.current) {
            window.clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
          }
          setHoverId(null);
        }}
      >
        <aside className="recent-doc-rail" aria-label="최근 수정 시도 문서">
          <div className="recent-doc-rail-title" title="최근 수정 시도 문서">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 7v5l3 2" />
              <path d="M4.9 5.1A9 9 0 1 1 3 12" />
              <path d="M3 5v4h4" />
            </svg>
            <span>최근</span>
          </div>
          <div className="recent-doc-badges">
            {recentDocs.map((doc, index) => (
              <button
                key={doc.id}
                type="button"
                className={`recent-doc-badge${selectedDoc?.id === doc.id ? ' active' : ''}`}
                onClick={() => selectRecentDocument(doc)}
                title={`${index + 1}. ${doc.title}`}
                aria-label={`최근 수정 시도 문서 ${doc.title}`}
              >
                <EntityIcon icon={doc.icon} size={28} fallback="📄" className="recent-doc-icon" />
                <span className="recent-doc-index">{index + 1}</span>
              </button>
            ))}
            {Array.from({ length: Math.max(0, MAX_RECENT_DOCUMENTS - recentDocs.length) }).map(
              (_, index) => (
                <span key={`empty-${index}`} className="recent-doc-badge empty" aria-hidden="true">
                  ·
                </span>
              )
            )}
          </div>
        </aside>

        <div className="category-sidebar">
          <h2 className="category-tree-title">
            <FontAwesomeIcon icon={faList} />
            <span>카테고리</span>
          </h2>
          {renderTree(tree)}
        </div>

        <div className="category-doclist">
          <h2 className="category-doclist-title">
            <FontAwesomeIcon icon={faBook} />
            <span>문서 목록</span>
          </h2>
          {docsSorted.length > 0 ? (
            <SortableContext
              items={docsSorted.map((doc) => `doc-${doc.id}`)}
              strategy={verticalListSortingStrategy}
            >
              <ul>
                {docsSorted.map((doc) => (
                  <SortableDocItem
                    key={doc.id}
                    doc={doc}
                    isSelected={selectedDoc?.id === doc.id}
                    onClick={() => setSelectedDoc(doc)}
                    disabled={!canManage}
                  />
                ))}
              </ul>
            </SortableContext>
          ) : (
            <p className="text-gray-500">문서가 없습니다.</p>
          )}
        </div>

        <div className="category-detail-panel">
          {selectedDoc ? (
            <div>
              <div className="cat-detail-header compact-document-header">
                <div className="cat-title-wrap">
                  <div className="cat-avatar">
                    <EntityIcon icon={selectedDoc.icon} size={32} fallback="📄" />
                  </div>
                  <h2 className="cat-detail-title">{selectedDoc.title}</h2>
                </div>
                <div className="toolbar-seg">
                  <button
                    type="button"
                    className="seg-btn"
                    onClick={() => openDocumentEditor(selectedDoc)}
                    title="수정"
                  >
                    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M16.5 3.75l3.75 3.75M4.5 19.5l3.75-.938L19.5 7.875l-3.75-3.75L4.5 15.75V19.5Z" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="seg-label">수정</span>
                  </button>
                  <button
                    type="button"
                    className="seg-btn danger"
                    onClick={() => isAdmin && setDocDeleteOpen(true)}
                    disabled={!isAdmin}
                    title={isAdmin ? '삭제' : '관리자만 삭제할 수 있습니다'}
                  >
                    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" />
                      <rect x="5" y="6" width="14" height="14" rx="2" />
                      <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                    </svg>
                    <span className="seg-label">삭제</span>
                  </button>
                </div>
              </div>

              <div className="document-summary-grid">
                <p><strong>제목</strong><span>{selectedDoc.title}</span></p>
                <p>
                  <strong>태그</strong>
                  <span>
                    {(() => {
                      const tags = Array.isArray(selectedDoc.tags)
                        ? selectedDoc.tags
                        : String(selectedDoc.tags ?? '')
                            .split(',')
                            .map((tag) => tag.trim())
                            .filter(Boolean);
                      return tags.length > 0
                        ? tags.map((tag) => <span key={tag} className="doc-tag">#{tag}</span>)
                        : <span className="empty-value">태그 없음</span>;
                    })()}
                  </span>
                </p>
              </div>
            </div>
          ) : selected ? (
            <div>
              <div className="cat-detail-header">
                <div className="cat-title-wrap">
                  <div className="cat-avatar">
                    <EntityIcon icon={selected.icon} size={32} fallback="📁" />
                  </div>
                  <h2 className="cat-detail-title">{selected.name}</h2>
                </div>

                <div className="toolbar-seg category-toolbar">
                  <button
                    type="button"
                    className="seg-btn"
                    onClick={handleSaveCategory}
                    disabled={selected.id === 0 || !canManage}
                    title="저장"
                  >
                    <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M8.5 12.5l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <span className="seg-label">저장</span>
                  </button>

                  {selected.id !== 0 && (
                    <button
                      type="button"
                      className="seg-btn danger"
                      onClick={() => isAdmin && setCatDeleteOpen(true)}
                      disabled={!isAdmin}
                      title={isAdmin ? '삭제' : '관리자만 삭제할 수 있습니다'}
                    >
                      <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" strokeLinecap="round" />
                        <rect x="5" y="6" width="14" height="14" rx="2" />
                        <path d="M10 11v6M14 11v6" strokeLinecap="round" />
                      </svg>
                      <span className="seg-label">삭제</span>
                    </button>
                  )}

                  <button
                    type="button"
                    className="seg-btn"
                    onClick={() => {
                      if (!canOpenCreateModal) return;
                      setNewCatName('');
                      setNewCatOpen(true);
                    }}
                    disabled={!canOpenCreateModal}
                    title="카테고리 추가"
                  >
                    <span className="seg-plus">＋</span>
                    <span className="seg-label">카테고리</span>
                  </button>

                  <button
                    type="button"
                    className="seg-btn"
                    onClick={() => {
                      if (!canOpenCreateModal) return;
                      location.href = `/wiki/write?path=${encodeURIComponent(selected.id)}&main=1`;
                    }}
                    disabled={!canOpenCreateModal}
                    title="대표 문서 추가"
                  >
                    <span className="seg-label">대표 문서</span>
                  </button>

                  <button
                    type="button"
                    className="seg-btn"
                    onClick={() => {
                      if (!canManage) return;
                      location.href = `/wiki/write?path=${encodeURIComponent(selected.id)}`;
                    }}
                    disabled={!canManage}
                    title="문서 추가"
                  >
                    <span className="seg-plus">＋</span>
                    <span className="seg-label">문서</span>
                  </button>
                </div>
              </div>

              <div className="rd-form compact-category-form">
                <div className="rd-field">
                  <label className="rd-label" htmlFor="category-name">카테고리 이름</label>
                  <input
                    id="category-name"
                    className="rd-input rd-input-lg"
                    value={selected.name}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSelected({ ...selected, name: event.target.value })}
                    disabled={selected.id === 0 || !canManage}
                    placeholder="예) 게임 공략"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                  />
                </div>

                <div className="rd-field">
                  <label className="rd-label" htmlFor="category-emoji">이모지 / 이미지</label>
                  <div className="compact-icon-picker">
                    <div className="compact-icon-preview" aria-hidden="true">
                      <EntityIcon icon={selected.icon} size={30} fallback="📁" />
                    </div>
                    <input
                      id="category-emoji"
                      className="rd-input emoji-only-input"
                      value={emojiValue}
                      onChange={(event: ChangeEvent<HTMLInputElement>) => setSelected({ ...selected, icon: event.target.value })}
                      disabled={selected.id === 0 || !canManage}
                      placeholder="이모지"
                      maxLength={12}
                      spellCheck={false}
                    />
                    <button
                      className="chip-btn image-select-text"
                      type="button"
                      onClick={() => setShowImageModal(true)}
                      disabled={selected.id === 0 || !canManage}
                    >
                      🖼️ 이미지 선택
                    </button>
                    <button
                      className="chip-btn icon-clear-btn"
                      type="button"
                      onClick={() => setSelected({ ...selected, icon: '' })}
                      disabled={selected.id === 0 || !canManage || !selected.icon}
                    >
                      지우기
                    </button>
                  </div>
                  <small className="help">이미지 주소는 표시하지 않고 이미지 선택 창에서만 지정합니다.</small>
                </div>

                <div className="rd-field">
                  <label className="rd-label">모드 태그</label>
                  <div className="mode-tag-buttons">
                    {MODE_OPTIONS.map((option) => {
                      const active = (selected.mode_tags ?? []).includes(option.key);
                      return (
                        <button
                          key={option.key}
                          type="button"
                          className={`mode-tag-btn${active ? ' active' : ''}`}
                          aria-pressed={active}
                          disabled={selected.id === 0 || !canManage}
                          onClick={() => {
                            const next = new Set(selected.mode_tags ?? []);
                            next.has(option.key) ? next.delete(option.key) : next.add(option.key);
                            setSelected({ ...selected, mode_tags: [...next] });
                          }}
                        >
                          {active ? '✓ ' : ''}#{option.label}
                        </button>
                      );
                    })}
                  </div>
                  <small className="help">
                    상위 카테고리에 태그를 지정하면 하위 카테고리는 태그 유무와 관계없이 포함됩니다.
                  </small>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-gray-500">좌측에서 카테고리를 선택해주세요.</p>
          )}
        </div>
      </DndContext>

      <ImageSelectModal
        open={showImageModal}
        onClose={() => setShowImageModal(false)}
        onSelectImage={(url: string) => {
          if (!selected) return;
          setSelected({ ...selected, icon: url });
          setShowImageModal(false);
        }}
      />

      <BareModal open={newCatOpen} onClose={() => setNewCatOpen(false)}>
        <div className="rd-card" role="dialog" aria-labelledby="rd-newcat-title">
          <button className="rd-exit-btn" onClick={() => setNewCatOpen(false)} aria-label="닫기">×</button>
          <div className="rd-card-content">
            <p className="rd-card-heading" id="rd-newcat-title">새 카테고리</p>
            <p className="rd-card-description">추가할 카테고리 이름을 입력하세요.</p>
            <input
              className="rd-input"
              value={newCatName}
              onChange={(event: ChangeEvent<HTMLInputElement>) => setNewCatName(event.target.value)}
              autoFocus
              onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter' && newCatName.trim() && !loadingCreate) createCategory();
                if (event.key === 'Escape') setNewCatOpen(false);
              }}
              placeholder="예) 공략 모음"
            />
          </div>
          <div className="rd-card-button-wrapper">
            <button className="rd-btn secondary" onClick={() => setNewCatOpen(false)}>취소</button>
            <button className="rd-btn primary" onClick={createCategory} disabled={!newCatName.trim() || loadingCreate}>
              {loadingCreate ? '생성 중…' : '생성'}
            </button>
          </div>
        </div>
      </BareModal>

      <BareModal open={docDeleteOpen} onClose={() => setDocDeleteOpen(false)}>
        <div className="rd-card" role="dialog" aria-labelledby="rd-deldoc-title">
          <button className="rd-exit-btn" onClick={() => setDocDeleteOpen(false)} aria-label="닫기">×</button>
          <div className="rd-card-content">
            <p className="rd-card-heading" id="rd-deldoc-title">문서 삭제 확인</p>
            <p className="rd-card-description">
              <b>{selectedDoc?.title}</b> 문서를 삭제하려면 다음 단계에서 비밀번호를 입력해야 합니다.
            </p>
          </div>
          <div className="rd-card-button-wrapper">
            <button className="rd-btn secondary" onClick={() => setDocDeleteOpen(false)}>취소</button>
            <button className="rd-btn danger" onClick={() => openPasswordStep('document')}>비밀번호 입력</button>
          </div>
        </div>
      </BareModal>

      <BareModal open={catDeleteOpen} onClose={() => setCatDeleteOpen(false)}>
        <div className="rd-card" role="dialog" aria-labelledby="rd-delcat-title">
          <button className="rd-exit-btn" onClick={() => setCatDeleteOpen(false)} aria-label="닫기">×</button>
          <div className="rd-card-content">
            <p className="rd-card-heading" id="rd-delcat-title">카테고리 삭제 확인</p>
            <p className="rd-card-description">
              <b>{selected?.name}</b> 카테고리와 하위 항목을 삭제하려면 다음 단계에서 비밀번호를 입력해야 합니다.
            </p>
          </div>
          <div className="rd-card-button-wrapper">
            <button className="rd-btn secondary" onClick={() => setCatDeleteOpen(false)}>취소</button>
            <button className="rd-btn danger" onClick={() => openPasswordStep('category')}>비밀번호 입력</button>
          </div>
        </div>
      </BareModal>

      <BareModal open={passwordDeleteOpen} onClose={closePasswordDelete}>
        <div className="rd-card delete-password-card" role="dialog" aria-labelledby="rd-delete-password-title">
          <button className="rd-exit-btn" onClick={closePasswordDelete} aria-label="닫기">×</button>
          <div className="rd-card-content">
            <p className="rd-card-heading" id="rd-delete-password-title">삭제 비밀번호</p>
            <p className="rd-card-description">관리자 삭제 비밀번호를 입력하세요.</p>
            <input
              className={`rd-input${deleteError ? ' input-error' : ''}`}
              type="password"
              value={deletePassword}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setDeletePassword(event.target.value);
                setDeleteError('');
              }}
              autoFocus
              inputMode="numeric"
              autoComplete="off"
              placeholder="비밀번호"
              onKeyDown={(event: ReactKeyboardEvent<HTMLInputElement>) => {
                if (event.key === 'Enter' && deletePassword && !loadingDelete) confirmPasswordDelete();
                if (event.key === 'Escape') closePasswordDelete();
              }}
            />
            {deleteError && <p className="delete-password-error">{deleteError}</p>}
          </div>
          <div className="rd-card-button-wrapper">
            <button className="rd-btn secondary" onClick={closePasswordDelete} disabled={loadingDelete}>취소</button>
            <button className="rd-btn danger" onClick={confirmPasswordDelete} disabled={!deletePassword || loadingDelete}>
              {loadingDelete ? '삭제 중…' : '최종 삭제'}
            </button>
          </div>
        </div>
      </BareModal>
    </div>
  );
}

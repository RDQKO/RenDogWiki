// =============================================
// File: app/manage/image/page.tsx
// 전체 교체용 코드
//
// - 기존 이미지/폴더 조회·생성·수정·삭제·이동·업로드 기능 유지
// - 홈 디자인과 어울리는 관리 페이지 구조 적용
// - 폴더 모두 펼치기 / 모두 접기
// - 로컬 즐겨찾기 폴더 뱃지 레일
// - 폴더 우클릭 즐겨찾기 추가/해제
// - 컨텍스트 메뉴 디자인 및 위치 보정
// =============================================
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type Dispatch,
  type MouseEvent as ReactMouseEvent,
  type SetStateAction,
} from 'react';

import WikiHeader from '@/components/common/Header';
import { ModalCard } from '@/components/common/Modal';
import ImageUploadModal from '@/components/image/ImageUploadModal';
import { toProxyUrl } from '@lib/cdn';
import '@/wiki/css/image.css';

type Role = 'guest' | 'writer' | 'admin';

type Folder = {
  id: number;
  name: string;
  parent_id: number | null;
  uploader?: string;
};

type MediaItem = {
  id: number;
  name: string;
  url: string;
  folder_id: number;
  mime_type?: string | null;
  uploader?: string;
};

type SelectedItem = MediaItem & {
  type: 'image';
};

type EditingTarget = {
  type: 'folder' | 'image';
  id: number;
} | null;

type ContextTarget = {
  type: 'folder' | 'image';
  id: number;
} | null;

type ContextMenuState = {
  visible: boolean;
  x: number;
  y: number;
  target: ContextTarget;
};

const TREE_STORAGE_KEY = 'imgmgr.treeState';
const SELECTED_FOLDER_STORAGE_KEY = 'imgmgr.selectedFolder';
const FAVORITE_FOLDER_STORAGE_KEY = 'imgmgr.favoriteFolders.v1';

function saveTreeState(next: Record<number, boolean>) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TREE_STORAGE_KEY, JSON.stringify(next));
}

function readFavoriteFolderIds(): number[] {
  if (typeof window === 'undefined') return [];

  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(FAVORITE_FOLDER_STORAGE_KEY) ?? '[]',
    );

    if (!Array.isArray(parsed)) return [];

    return Array.from(
      new Set(
        parsed
          .map((value) => Number(value))
          .filter((value) => Number.isInteger(value) && value > 0),
      ),
    );
  } catch {
    return [];
  }
}

function writeFavoriteFolderIds(ids: number[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(
    FAVORITE_FOLDER_STORAGE_KEY,
    JSON.stringify(ids),
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      className="folder-chevron-icon"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }}
    >
      <path d="m7 4 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderGlyph({ open = false }: { open?: boolean }) {
  return (
    <span className="folder-glyph" aria-hidden="true">
      {open ? '📂' : '📁'}
    </span>
  );
}

function closeFolderSubtree(
  rootId: number,
  folders: Folder[],
  previous: Record<number, boolean>,
) {
  const next = { ...previous, [rootId]: false };
  const childrenMap = new Map<number, number[]>();

  for (const folder of folders) {
    if (folder.parent_id == null) continue;
    const children = childrenMap.get(folder.parent_id) ?? [];
    children.push(folder.id);
    childrenMap.set(folder.parent_id, children);
  }

  const stack = [...(childrenMap.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id == null) continue;
    next[id] = false;
    stack.push(...(childrenMap.get(id) ?? []));
  }

  return next;
}

type FolderTreeProps = {
  folders: Folder[];
  parentId: number | null;
  activeId: number | null;
  selectedIds: number[];
  favoriteIds: number[];
  onSelect: (id: number, event: ReactMouseEvent) => void;
  editingTarget: EditingTarget;
  setEditingTarget: Dispatch<SetStateAction<EditingTarget>>;
  onRename: (id: number, newName: string) => Promise<void>;
  depth?: number;
  treeState: Record<number, boolean>;
  setTreeState: Dispatch<SetStateAction<Record<number, boolean>>>;
  openContextMenu: (
    event: ReactMouseEvent,
    target: Exclude<ContextTarget, null>,
  ) => void;
  draggingFolderId: number | null;
  dragOverFolderId: number | null;
  setDraggingFolderId: Dispatch<SetStateAction<number | null>>;
  setDragOverFolderId: Dispatch<SetStateAction<number | null>>;
  onMoveFolder: (dragId: number, newParentId: number | null) => Promise<void>;
  draggingImageIds: number[] | null;
  onMoveImages: (ids: number[], newFolderId: number | null) => Promise<void>;
};

function FolderTree({
  folders,
  parentId,
  activeId,
  selectedIds,
  favoriteIds,
  onSelect,
  editingTarget,
  setEditingTarget,
  onRename,
  depth = 0,
  treeState,
  setTreeState,
  openContextMenu,
  draggingFolderId,
  dragOverFolderId,
  setDraggingFolderId,
  setDragOverFolderId,
  onMoveFolder,
  draggingImageIds,
  onMoveImages,
}: FolderTreeProps) {
  const [editName, setEditName] = useState('');

  useEffect(() => {
    if (editingTarget?.type !== 'folder') return;
    const target = folders.find((folder) => folder.id === editingTarget.id);
    setEditName(target?.name ?? '');
  }, [editingTarget, folders]);

  const list = folders.filter((folder) =>
    parentId == null
      ? folder.parent_id == null
      : Number(folder.parent_id) === Number(parentId),
  );

  if (list.length === 0) return null;

  return (
    <ul
      className="folder-list"
      style={{ '--folder-depth': depth } as CSSProperties}
    >
      {list.map((folder) => {
        const hasChildren = folders.some(
          (candidate) => Number(candidate.parent_id) === Number(folder.id),
        );
        const isOpen = Boolean(treeState[folder.id]);
        const isEditing =
          editingTarget?.type === 'folder' && editingTarget.id === folder.id;
        const isDropTarget = dragOverFolderId === folder.id;
        const isSelected = selectedIds.includes(folder.id);
        const isActive = activeId === folder.id;
        const isFavorite = favoriteIds.includes(folder.id);

        const commitRename = async () => {
          const nextName = editName.trim();
          if (!nextName) {
            setEditingTarget(null);
            return;
          }

          if (nextName !== folder.name) {
            await onRename(folder.id, nextName);
          }

          setEditingTarget(null);
        };

        return (
          <li key={folder.id} className="folder-item">
            <div
              className={
                'folder-row' +
                (isDropTarget ? ' is-drop-target' : '') +
                (isFavorite ? ' is-favorite' : '')
              }
            >
              {isEditing ? (
                <input
                  type="text"
                  className="folder-edit-input"
                  autoFocus
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onBlur={() => void commitRename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      void commitRename();
                    }
                    if (event.key === 'Escape') {
                      setEditingTarget(null);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={
                    'folder-btn' +
                    (isActive || isSelected ? ' active' : '')
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelect(folder.id, event);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelect(folder.id, event);
                    openContextMenu(event, {
                      type: 'folder',
                      id: folder.id,
                    });
                  }}
                  draggable
                  onDragStart={(event) => {
                    setDraggingFolderId(folder.id);
                    event.dataTransfer.setData('text/plain', String(folder.id));
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(event) => {
                    const acceptsFolder =
                      draggingFolderId == null || draggingFolderId !== folder.id;
                    const acceptsImages =
                      draggingImageIds == null || draggingImageIds.length > 0;

                    if (!acceptsFolder || !acceptsImages) return;
                    event.preventDefault();
                    setDragOverFolderId(folder.id);
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderId === folder.id) {
                      setDragOverFolderId(null);
                    }
                  }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    event.stopPropagation();

                    const imagesJson = event.dataTransfer.getData(
                      'application/rdwiki-images',
                    );
                    const folderDragId =
                      draggingFolderId ??
                      Number(event.dataTransfer.getData('text/plain'));

                    setDragOverFolderId(null);

                    if (imagesJson) {
                      try {
                        const ids = JSON.parse(imagesJson) as number[];
                        if (Array.isArray(ids) && ids.length > 0) {
                          await onMoveImages(ids, folder.id);
                        }
                      } catch {
                        // 잘못된 드래그 데이터는 무시한다.
                      }
                      return;
                    }

                    if (
                      Number.isFinite(folderDragId) &&
                      folderDragId !== folder.id
                    ) {
                      await onMoveFolder(folderDragId, folder.id);
                    }
                  }}
                  onDragEnd={() => {
                    setDraggingFolderId(null);
                    setDragOverFolderId(null);
                  }}
                >
                  <FolderGlyph open={isOpen && hasChildren} />
                  <span className="folder-name">{folder.name}</span>
                  {isFavorite ? (
                    <span className="folder-favorite-mark" aria-label="즐겨찾기">
                      ★
                    </span>
                  ) : null}
                </button>
              )}

              {hasChildren ? (
                <button
                  type="button"
                  className="folder-tree-arrowbtn"
                  aria-label={isOpen ? '하위 폴더 접기' : '하위 폴더 펼치기'}
                  title={isOpen ? '접기' : '펼치기'}
                  onClick={(event) => {
                    event.stopPropagation();
                    setTreeState((previous) => {
                      const next = isOpen
                        ? closeFolderSubtree(folder.id, folders, previous)
                        : { ...previous, [folder.id]: true };
                      saveTreeState(next);
                      return next;
                    });
                  }}
                >
                  <ChevronIcon open={isOpen} />
                </button>
              ) : (
                <span className="folder-tree-arrow-spacer" aria-hidden="true" />
              )}
            </div>

            {hasChildren && isOpen ? (
              <FolderTree
                folders={folders}
                parentId={folder.id}
                activeId={activeId}
                selectedIds={selectedIds}
                favoriteIds={favoriteIds}
                onSelect={onSelect}
                editingTarget={editingTarget}
                setEditingTarget={setEditingTarget}
                onRename={onRename}
                depth={depth + 1}
                treeState={treeState}
                setTreeState={setTreeState}
                openContextMenu={openContextMenu}
                draggingFolderId={draggingFolderId}
                dragOverFolderId={dragOverFolderId}
                setDraggingFolderId={setDraggingFolderId}
                setDragOverFolderId={setDragOverFolderId}
                onMoveFolder={onMoveFolder}
                draggingImageIds={draggingImageIds}
                onMoveImages={onMoveImages}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

type FileListProps = {
  images: MediaItem[];
  currentFolderId: number | null;
  onSelect: (item: SelectedItem, event: ReactMouseEvent) => void;
  onContextMenuImage: (item: SelectedItem, event: ReactMouseEvent) => void;
  selectedItems: SelectedItem[];
  searchQuery: string;
  setDraggingImageIds: Dispatch<SetStateAction<number[] | null>>;
};

function FileList({
  images,
  currentFolderId,
  onSelect,
  onContextMenuImage,
  selectedItems,
  searchQuery,
  setDraggingImageIds,
}: FileListProps) {
  const query = searchQuery.trim().toLowerCase();

  const visibleImages = useMemo(
    () =>
      images
        .filter(
          (image) => Number(image.folder_id) === Number(currentFolderId),
        )
        .filter(
          (image) => !query || image.name.toLowerCase().includes(query),
        ),
    [currentFolderId, images, query],
  );

  const selectedIds = useMemo(
    () => new Set(selectedItems.map((item) => item.id)),
    [selectedItems],
  );

  if (visibleImages.length === 0) {
    return (
      <div className="image-explorer-empty">
        <span className="image-explorer-empty-icon" aria-hidden="true">
          🖼️
        </span>
        <strong>
          {query ? '검색 결과가 없습니다.' : '이 폴더에는 미디어가 없습니다.'}
        </strong>
        <span>
          {query
            ? '다른 파일명으로 다시 검색해보세요.'
            : '업로드 버튼을 눌러 이미지나 영상을 추가하세요.'}
        </span>
      </div>
    );
  }

  return (
    <div className="image-explorer-filelist">
      {visibleImages.map((image) => {
        const isVideo = (image.mime_type ?? '').startsWith('video/');
        const selected = selectedIds.has(image.id);
        const item: SelectedItem = { ...image, type: 'image' };
        const extensionIndex = image.name.lastIndexOf('.');
        const label =
          extensionIndex >= 0
            ? image.name.slice(0, extensionIndex)
            : image.name;

        return (
          <button
            type="button"
            key={image.id}
            className={
              'image-explorer-thumbnail' + (selected ? ' selected' : '')
            }
            draggable
            onDragStart={(event) => {
              const ids = selected
                ? selectedItems.map((selectedItem) => selectedItem.id)
                : [image.id];
              setDraggingImageIds(ids);
              event.dataTransfer.setData(
                'application/rdwiki-images',
                JSON.stringify(ids),
              );
              event.dataTransfer.effectAllowed = 'move';
            }}
            onDragEnd={() => setDraggingImageIds(null)}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(item, event);
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onContextMenuImage(item, event);
            }}
            title={image.name}
          >
            <span className="image-explorer-thumbbox">
              {isVideo ? (
                <span className="video-thumb">
                  <video
                    src={toProxyUrl(image.url)}
                    preload="metadata"
                    playsInline
                    muted
                    className="image-explorer-thumbimg"
                  />
                  <span className="video-badge">▶ 영상</span>
                </span>
              ) : (
                <img
                  src={toProxyUrl(image.url)}
                  alt={image.name}
                  className="image-explorer-thumbimg"
                  loading="lazy"
                  decoding="async"
                  onError={(event) => {
                    event.currentTarget.src = '/default-thumbnail.png';
                  }}
                />
              )}
            </span>
            <span className="thumbnail-label">
              {label.length > 18 ? `${label.slice(0, 18)}…` : label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function ImageManagePage() {
  const [user, setUser] = useState<any>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [images, setImages] = useState<MediaItem[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<number[]>([]);
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null);
  const [imageEditName, setImageEditName] = useState('');
  const [treeState, setTreeState] = useState<Record<number, boolean>>({});
  const [favoriteFolderIds, setFavoriteFolderIds] = useState<number[]>([]);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    target: null,
  });
  const [deletingType, setDeletingType] = useState<'folder' | 'image' | null>(
    null,
  );
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [draggingFolderId, setDraggingFolderId] = useState<number | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<number | null>(null);
  const [draggingImageIds, setDraggingImageIds] = useState<number[] | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const createFolderLockRef = useRef(false);

  useEffect(() => {
    void fetch('/api/auth/me', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        setUser(
          data?.user
            ? {
                ...data.user,
                role: data?.user?.role ?? data?.role ?? 'guest',
              }
            : null,
        );
      });

    setFavoriteFolderIds(readFavoriteFolderIds());
  }, []);

  const role: Role =
    user?.role === 'admin' || user?.role === 'writer'
      ? user.role
      : 'guest';
  const isAdmin = role === 'admin';
  const isWriter = role === 'writer';
  const myName = String(user?.minecraft_name ?? '').toLowerCase();

  const normalizeFolders = useCallback(
    (data: any[]): Folder[] =>
      (Array.isArray(data) ? data : []).map((folder) => ({
        id: Number(folder.id),
        name: String(folder.name),
        parent_id:
          folder.parent_id == null ? null : Number(folder.parent_id),
        uploader: folder.uploader ? String(folder.uploader) : undefined,
      })),
    [],
  );

  const normalizeImages = useCallback(
    (data: any[]): MediaItem[] =>
      (Array.isArray(data) ? data : []).map((image) => ({
        id: Number(image.id),
        name: String(image.name),
        url: String(image.url),
        folder_id: Number(image.folder_id),
        mime_type: image.mime_type ? String(image.mime_type) : null,
        uploader: image.uploader ? String(image.uploader) : undefined,
      })),
    [],
  );

  const reloadFolders = useCallback(
    async ({ restoreSelection = false }: { restoreSelection?: boolean } = {}) => {
      const response = await fetch(
        `/api/image/folder/list?ts=${Date.now()}`,
        { cache: 'no-store' },
      );
      const raw = await response.json();
      const data = normalizeFolders(raw);
      setFolders(data);

      if (typeof window === 'undefined') return;

      const savedTree = window.localStorage.getItem(TREE_STORAGE_KEY);
      if (savedTree) {
        try {
          const parsed = JSON.parse(savedTree) as Record<string, boolean>;
          const restored: Record<number, boolean> = {};
          for (const [key, value] of Object.entries(parsed)) {
            restored[Number(key)] = Boolean(value);
          }
          setTreeState((previous) =>
            Object.keys(previous).length > 0 ? previous : restored,
          );
        } catch {
          const initial: Record<number, boolean> = {};
          data.forEach((folder) => {
            if (folder.parent_id == null) initial[folder.id] = true;
          });
          setTreeState(initial);
        }
      } else {
        const initial: Record<number, boolean> = {};
        data.forEach((folder) => {
          if (folder.parent_id == null) initial[folder.id] = true;
        });
        setTreeState(initial);
      }

      if (!restoreSelection) return;

      const savedSelection = window.localStorage.getItem(
        SELECTED_FOLDER_STORAGE_KEY,
      );
      if (!savedSelection || savedSelection === 'null') {
        setSelectedFolder(null);
        setSelectedFolderIds([]);
        return;
      }

      const id = Number(savedSelection);
      const valid = data.some((folder) => folder.id === id) ? id : null;
      setSelectedFolder(valid);
      setSelectedFolderIds(valid == null ? [] : [valid]);
    },
    [normalizeFolders],
  );

  const refreshImages = useCallback(async () => {
    if (selectedFolder == null) {
      setImages([]);
      return;
    }

    const response = await fetch(
      `/api/image/view?folder_id=${selectedFolder}&ts=${Date.now()}`,
      { cache: 'no-store' },
    );
    const raw = await response.json();
    setImages(normalizeImages(raw));
  }, [normalizeImages, selectedFolder]);

  useEffect(() => {
    void reloadFolders({ restoreSelection: true });
  }, [reloadFolders]);

  useEffect(() => {
    setSelectedItems([]);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(
        SELECTED_FOLDER_STORAGE_KEY,
        selectedFolder == null ? 'null' : String(selectedFolder),
      );
    }
    void refreshImages();
  }, [refreshImages, selectedFolder]);

  useEffect(() => {
    if (folders.length === 0) return;
    const existingIds = new Set(folders.map((folder) => folder.id));
    setFavoriteFolderIds((previous) => {
      const next = previous.filter((id) => existingIds.has(id));
      if (next.length !== previous.length) writeFavoriteFolderIds(next);
      return next;
    });
  }, [folders]);

  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  );

  const favoriteFolders = useMemo(
    () =>
      favoriteFolderIds
        .map((id) => folderById.get(id))
        .filter((folder): folder is Folder => Boolean(folder)),
    [favoriteFolderIds, folderById],
  );

  const currentFolder =
    selectedFolder == null ? null : folderById.get(selectedFolder) ?? null;

  const setTreeStatePersisted = useCallback(
    (updater: SetStateAction<Record<number, boolean>>) => {
      setTreeState((previous) => {
        const next =
          typeof updater === 'function' ? updater(previous) : updater;
        saveTreeState(next);
        return next;
      });
    },
    [],
  );

  const getAncestorIds = useCallback(
    (folderId: number) => {
      const ancestors: number[] = [];
      const visited = new Set<number>();
      let cursor = folderById.get(folderId);

      while (cursor?.parent_id != null && !visited.has(cursor.parent_id)) {
        visited.add(cursor.parent_id);
        ancestors.unshift(cursor.parent_id);
        cursor = folderById.get(cursor.parent_id);
      }

      return ancestors;
    },
    [folderById],
  );

  const openFolder = useCallback(
    (folderId: number) => {
      if (!folderById.has(folderId)) return;
      const ancestors = getAncestorIds(folderId);
      setTreeStatePersisted((previous) => {
        const next = { ...previous };
        ancestors.forEach((id) => {
          next[id] = true;
        });
        return next;
      });
      setSelectedFolder(folderId);
      setSelectedFolderIds([folderId]);
      setSelectedItems([]);
    },
    [folderById, getAncestorIds, setTreeStatePersisted],
  );

  const toggleFavoriteFolder = useCallback((folderId: number) => {
    setFavoriteFolderIds((previous) => {
      const next = previous.includes(folderId)
        ? previous.filter((id) => id !== folderId)
        : [...previous, folderId];
      writeFavoriteFolderIds(next);
      return next;
    });
  }, []);

  const expandAllFolders = useCallback(() => {
    const next: Record<number, boolean> = {};
    folders.forEach((folder) => {
      if (
        folders.some(
          (candidate) => Number(candidate.parent_id) === Number(folder.id),
        )
      ) {
        next[folder.id] = true;
      }
    });
    setTreeState(next);
    saveTreeState(next);
  }, [folders]);

  const collapseAllFolders = useCallback(() => {
    const next: Record<number, boolean> = {};
    folders.forEach((folder) => {
      next[folder.id] = false;
    });
    setTreeState(next);
    saveTreeState(next);
  }, [folders]);

  const openContextMenu = useCallback(
    (event: ReactMouseEvent, target: ContextTarget) => {
      const menuWidth = 220;
      const menuHeight = target?.type === 'folder' ? 176 : 168;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const x = Math.min(event.clientX, viewportWidth - menuWidth - 12);
      const y = Math.min(event.clientY, viewportHeight - menuHeight - 12);

      setContextMenu({
        visible: true,
        x: Math.max(12, x),
        y: Math.max(12, y),
        target,
      });
    },
    [],
  );

  const closeContextMenu = useCallback(() => {
    setContextMenu((previous) => ({ ...previous, visible: false }));
  }, []);

  useEffect(() => {
    if (!contextMenu.visible) return;

    const close = () => closeContextMenu();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [closeContextMenu, contextMenu.visible]);

  const clearImageSelection = useCallback(() => {
    setSelectedItems([]);
    setEditingTarget((target) =>
      target?.type === 'image' ? null : target,
    );
  }, []);

  const onFolderSelect = useCallback(
    (id: number, event: ReactMouseEvent) => {
      const multi = event.ctrlKey || event.metaKey;
      setSelectedFolder(id);
      setSelectedFolderIds((previous) => {
        if (!multi) return [id];
        return previous.includes(id)
          ? previous.filter((value) => value !== id)
          : [...previous, id];
      });
      clearImageSelection();
    },
    [clearImageSelection],
  );

  const moveImages = useCallback(
    async (ids: number[], newFolderId: number | null) => {
      if (ids.length === 0) return;

      const response = await fetch('/api/image/move', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, new_folder_id: newFolderId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload?.error || '이미지 이동 실패');
        return;
      }

      await refreshImages();
      setSelectedItems([]);
    },
    [refreshImages],
  );

  const getDescendantIds = useCallback(
    (rootId: number) => {
      const childrenMap = new Map<number, number[]>();
      folders.forEach((folder) => {
        if (folder.parent_id == null) return;
        const children = childrenMap.get(folder.parent_id) ?? [];
        children.push(folder.id);
        childrenMap.set(folder.parent_id, children);
      });

      const descendants = new Set<number>();
      const stack = [...(childrenMap.get(rootId) ?? [])];

      while (stack.length > 0) {
        const id = stack.pop();
        if (id == null || descendants.has(id)) continue;
        descendants.add(id);
        stack.push(...(childrenMap.get(id) ?? []));
      }

      return descendants;
    },
    [folders],
  );

  const moveFolder = useCallback(
    async (dragId: number, newParentId: number | null) => {
      if (dragId === newParentId) return;

      if (
        newParentId != null &&
        getDescendantIds(dragId).has(newParentId)
      ) {
        alert('하위 폴더로는 이동할 수 없습니다.');
        return;
      }

      const movingFolder = folderById.get(dragId);
      if (movingFolder) {
        const duplicated = folders.some(
          (folder) =>
            folder.id !== dragId &&
            folder.parent_id === newParentId &&
            folder.name === movingFolder.name,
        );
        if (duplicated) {
          alert('해당 위치에 같은 이름의 폴더가 있습니다.');
          return;
        }
      }

      const response = await fetch('/api/image/folder/move', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: dragId, new_parent_id: newParentId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload?.error || '폴더 이동 실패');
        return;
      }

      if (newParentId != null) {
        setTreeStatePersisted((previous) => ({
          ...previous,
          [newParentId]: true,
        }));
      }

      await reloadFolders();
      setDraggingFolderId(null);
      setDragOverFolderId(null);
    },
    [
      folderById,
      folders,
      getDescendantIds,
      reloadFolders,
      setTreeStatePersisted,
    ],
  );

  const createFolderRequest = async (
    name: string,
    parentId: number | null,
    idempotencyKey: string,
  ) => {
    const response = await fetch('/api/image/folder/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ name, parent_id: parentId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(payload, { status: response.status });
    }
    return payload.folder;
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name || createFolderLockRef.current || creatingFolder) return;

    createFolderLockRef.current = true;
    setCreatingFolder(true);

    try {
      const parentId = selectedFolder;
      const idempotencyKey =
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now()}-${Math.random()}`;
      const folder = await createFolderRequest(
        name,
        parentId,
        idempotencyKey,
      );

      setNewFolderName('');
      setNewFolderOpen(false);

      if (parentId != null) {
        setTreeStatePersisted((previous) => ({
          ...previous,
          [parentId]: true,
        }));
      }

      await reloadFolders();
      if (folder?.id) openFolder(Number(folder.id));
    } catch (error: any) {
      if (error?.status === 409) {
        alert('같은 이름의 폴더가 이미 있거나 중복 제출이 감지되었습니다.');
      } else {
        alert(error?.error || '폴더 생성 실패');
      }
    } finally {
      createFolderLockRef.current = false;
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = useCallback(
    async (id: number, newName: string) => {
      const response = await fetch('/api/image/folder/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, name: newName }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload?.error || '이름 변경 실패');
        return;
      }

      await reloadFolders();
    },
    [reloadFolders],
  );

  const handleImageRename = async () => {
    if (editingTarget?.type !== 'image') return;
    const name = imageEditName.trim();
    if (!name) return;

    const response = await fetch('/api/image/rename', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingTarget.id, name }),
    });

    if (!response.ok) {
      alert('이름 변경 실패');
      return;
    }

    await refreshImages();
    setEditingTarget(null);
  };

  const folderOwnedByMe = useCallback(
    (id: number | null) => {
      if (id == null) return false;
      const folder = folderById.get(id);
      return folder?.uploader?.toLowerCase() === myName;
    },
    [folderById, myName],
  );

  const deleteFolder = useCallback(
    async (id: number) => {
      const response = await fetch('/api/image/folder/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload?.error || '삭제 실패');
      }
    },
    [],
  );

  const handleDeleteFolders = async () => {
    const ids =
      selectedFolderIds.length > 0
        ? selectedFolderIds
        : selectedFolder == null
          ? []
          : [selectedFolder];

    if (ids.length === 0) return;

    if (!isAdmin) {
      const allMine = isWriter && ids.every((id) => folderOwnedByMe(id));
      if (!allMine) {
        alert('본인이 생성한 폴더만 삭제할 수 있습니다.');
        return;
      }
    }

    const nestedSelected = new Set<number>();
    ids.forEach((id) => {
      getDescendantIds(id).forEach((descendant) => {
        if (ids.includes(descendant)) nestedSelected.add(descendant);
      });
    });
    const roots = ids.filter((id) => !nestedSelected.has(id));

    try {
      for (const id of roots) await deleteFolder(id);
      await reloadFolders();
      setSelectedFolder(null);
      setSelectedFolderIds([]);
      setSelectedItems([]);
      setImages([]);
      setShowDeleteModal(false);
      setDeletingType(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '삭제 실패');
    }
  };

  const handleDeleteImages = async () => {
    if (selectedItems.length === 0) return;

    if (!isAdmin) {
      const allMine =
        isWriter &&
        selectedItems.every(
          (item) => item.uploader?.toLowerCase() === myName,
        );
      if (!allMine) {
        alert('본인이 업로드한 이미지만 삭제할 수 있습니다.');
        return;
      }
    }

    const response = await fetch('/api/image/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: selectedItems.map((item) => item.id) }),
    });

    if (!response.ok) {
      alert('삭제 실패');
      return;
    }

    await refreshImages();
    setSelectedItems([]);
    setShowDeleteModal(false);
    setDeletingType(null);
  };

  const handleFileListSelect = useCallback(
    (item: SelectedItem, event: ReactMouseEvent) => {
      if (event.ctrlKey || event.metaKey) {
        setSelectedItems((previous) =>
          previous.some((selected) => selected.id === item.id)
            ? previous.filter((selected) => selected.id !== item.id)
            : [...previous, item],
        );
        return;
      }
      setSelectedItems([item]);
    },
    [],
  );

  const handleThumbContextMenu = useCallback(
    (item: SelectedItem, event: ReactMouseEvent) => {
      setSelectedItems([item]);
      openContextMenu(event, { type: 'image', id: item.id });
    },
    [openContextMenu],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && ['INPUT', 'TEXTAREA'].includes(active.tagName)) return;

      if (event.key === 'Delete' || event.key === 'Del') {
        if (selectedItems.length > 0) {
          setDeletingType('image');
          setShowDeleteModal(true);
          event.preventDefault();
        } else if (selectedFolderIds.length > 0 || selectedFolder != null) {
          setDeletingType('folder');
          setShowDeleteModal(true);
          event.preventDefault();
        }
      }

      if (event.key === 'F2') {
        if (selectedItems.length === 1) {
          setEditingTarget({ type: 'image', id: selectedItems[0].id });
          setImageEditName(selectedItems[0].name);
          event.preventDefault();
        } else if (
          selectedItems.length === 0 &&
          selectedFolder != null &&
          selectedFolderIds.length <= 1
        ) {
          setEditingTarget({ type: 'folder', id: selectedFolder });
          event.preventDefault();
        }
      }

      if (event.key === 'Escape' && selectedItems.length > 0) {
        clearImageSelection();
        event.preventDefault();
      }
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () =>
      window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [
    clearImageSelection,
    selectedFolder,
    selectedFolderIds.length,
    selectedItems,
  ]);

  const allSelectedImagesMine =
    selectedItems.length > 0 &&
    selectedItems.every(
      (item) => item.uploader?.toLowerCase() === myName,
    );
  const allSelectedFoldersMine =
    (selectedFolderIds.length > 0
      ? selectedFolderIds
      : selectedFolder == null
        ? []
        : [selectedFolder]
    ).every((id) => folderOwnedByMe(id));

  const canDeleteImages = isAdmin || (isWriter && allSelectedImagesMine);
  const canDeleteFolders = isAdmin || (isWriter && allSelectedFoldersMine);
  const somethingSelected =
    selectedItems.length > 0 ||
    selectedFolderIds.length > 0 ||
    selectedFolder != null;
  const deleteButtonDisabled =
    !somethingSelected ||
    (selectedItems.length > 0 && !canDeleteImages) ||
    (selectedItems.length === 0 && !canDeleteFolders);
  const canRenameImage = selectedItems.length === 1;
  const isMultiSelecting =
    selectedItems.length > 1 || selectedFolderIds.length > 1;

  const closeDeleteModal = useCallback(() => {
    setShowDeleteModal(false);
    setDeletingType(null);
  }, []);

  const contextFolder =
    contextMenu.target?.type === 'folder'
      ? folderById.get(contextMenu.target.id) ?? null
      : null;
  const contextImage =
    contextMenu.target?.type === 'image'
      ? images.find((image) => image.id === contextMenu.target?.id) ?? null
      : null;
  const contextFolderFavorite =
    contextFolder != null && favoriteFolderIds.includes(contextFolder.id);

  return (
    <div className="wiki-container image-manager-page">
      <WikiHeader user={user} />

      <div className="image-explorer-viewport">
        <div className="image-explorer-layout">
          <aside className="favorite-folder-rail" aria-label="즐겨찾기 폴더">
            <div className="favorite-folder-rail-title" title="즐겨찾기 폴더">
              ★
            </div>
            <div className="favorite-folder-badges">
              {favoriteFolders.map((folder) => (
                <button
                  type="button"
                  key={folder.id}
                  className={
                    'favorite-folder-badge' +
                    (selectedFolder === folder.id ? ' active' : '')
                  }
                  onClick={() => openFolder(folder.id)}
                  title={folder.name}
                  aria-label={`${folder.name} 폴더 열기`}
                >
                  <span aria-hidden="true">📁</span>
                  <small>{folder.name.slice(0, 2)}</small>
                </button>
              ))}

              {favoriteFolders.length === 0 ? (
                <div
                  className="favorite-folder-empty"
                  title="폴더를 우클릭해 즐겨찾기에 추가하세요."
                >
                  <span aria-hidden="true">☆</span>
                  <small>비어 있음</small>
                </div>
              ) : null}
            </div>
          </aside>

          <aside
            className="image-explorer-sidebar"
            onMouseDown={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest('.folder-edit-input')) return;
              clearImageSelection();
            }}
          >
            <div className="folder-sidebar-header">
              <div>
                <span className="folder-sidebar-kicker">MEDIA LIBRARY</span>
                <h2>폴더</h2>
              </div>
              <div className="folder-tree-tools">
                <button
                  type="button"
                  onClick={expandAllFolders}
                  title="모든 폴더 펼치기"
                  aria-label="모든 폴더 펼치기"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M5 7l5-5 5 5M5 13l5 5 5-5" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={collapseAllFolders}
                  title="모든 폴더 접기"
                  aria-label="모든 폴더 접기"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M5 4l5 5 5-5M5 16l5-5 5 5" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="folder-tree-scroll">
              <div
                className={
                  'folder-row folder-root-row' +
                  (dragOverFolderId === -1 ? ' is-drop-target' : '')
                }
              >
                <button
                  type="button"
                  className={
                    'folder-btn folder-root-btn' +
                    (selectedFolder == null ? ' active' : '')
                  }
                  onClick={() => {
                    setSelectedFolder(null);
                    setSelectedFolderIds([]);
                    setSelectedItems([]);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    openContextMenu(event, null);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setDragOverFolderId(-1);
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDragLeave={() => {
                    if (dragOverFolderId === -1) setDragOverFolderId(null);
                  }}
                  onDrop={async (event) => {
                    event.preventDefault();
                    const imagesJson = event.dataTransfer.getData(
                      'application/rdwiki-images',
                    );
                    const folderDragId =
                      draggingFolderId ??
                      Number(event.dataTransfer.getData('text/plain'));
                    setDragOverFolderId(null);

                    if (imagesJson) {
                      try {
                        const ids = JSON.parse(imagesJson) as number[];
                        if (Array.isArray(ids) && ids.length > 0) {
                          await moveImages(ids, null);
                        }
                      } catch {
                        // 잘못된 드래그 데이터는 무시한다.
                      }
                      return;
                    }

                    if (Number.isFinite(folderDragId)) {
                      await moveFolder(folderDragId, null);
                    }
                  }}
                >
                  <FolderGlyph open />
                  <span className="folder-name">RDWIKI</span>
                </button>
                <span className="folder-tree-arrow-spacer" aria-hidden="true" />
              </div>

              <FolderTree
                folders={folders}
                parentId={null}
                activeId={selectedFolder}
                selectedIds={selectedFolderIds}
                favoriteIds={favoriteFolderIds}
                onSelect={onFolderSelect}
                editingTarget={editingTarget}
                setEditingTarget={setEditingTarget}
                onRename={handleRenameFolder}
                treeState={treeState}
                setTreeState={setTreeState}
                openContextMenu={openContextMenu}
                draggingFolderId={draggingFolderId}
                dragOverFolderId={dragOverFolderId}
                setDraggingFolderId={setDraggingFolderId}
                setDragOverFolderId={setDragOverFolderId}
                onMoveFolder={moveFolder}
                draggingImageIds={draggingImageIds}
                onMoveImages={moveImages}
              />
            </div>
          </aside>

          <section
            className="image-explorer-content"
            onMouseDown={(event) => {
              const target = event.target as HTMLElement;
              if (
                target.closest(
                  '.seg-input, .seg-btn, .rd-context-menu, .rd-btn, .folder-edit-input, .image-explorer-thumbnail',
                )
              ) {
                return;
              }
              clearImageSelection();
            }}
          >
            <header className="image-explorer-header-bar">
              <div className="image-explorer-heading">
                <span className="image-explorer-heading-icon" aria-hidden="true">
                  🖼️
                </span>
                <div>
                  <span className="image-explorer-kicker">IMAGE MANAGER</span>
                  <h1 className="image-explorer-title">이미지 업로드/관리</h1>
                  <p>
                    {currentFolder
                      ? `${currentFolder.name} 폴더 · ${images.length}개 미디어`
                      : '폴더를 선택해 미디어를 관리하세요.'}
                  </p>
                </div>
              </div>

              <div className="image-explorer-toolbar">
                <div className="toolbar-search">
                  <div className="seg-input">
                    <svg
                      className="ico"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      aria-hidden="true"
                    >
                      <circle cx="11" cy="11" r="7" />
                      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
                    </svg>
                    <input
                      className="seg-input-field"
                      placeholder="파일명 검색"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      aria-label="파일명 검색"
                    />
                    {searchQuery ? (
                      <button
                        type="button"
                        className="seg-input-clear"
                        onClick={() => setSearchQuery('')}
                        aria-label="검색어 지우기"
                        title="검색어 지우기"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="image-explorer-header-btns">
                  <button
                    type="button"
                    className="seg-btn primary"
                    onClick={() => setNewFolderOpen(true)}
                  >
                    <span aria-hidden="true">＋</span>
                    <span className="seg-label">새 폴더</span>
                  </button>
                  <button
                    type="button"
                    className="seg-btn"
                    onClick={() => setUploadOpen(true)}
                    disabled={selectedFolder == null || isMultiSelecting}
                    title={
                      isMultiSelecting
                        ? '다중 선택 중에는 업로드할 수 없습니다.'
                        : '업로드'
                    }
                  >
                    <span aria-hidden="true">⇧</span>
                    <span className="seg-label">업로드</span>
                  </button>
                  <button
                    type="button"
                    className="seg-btn danger"
                    disabled={deleteButtonDisabled}
                    onClick={() => {
                      setDeletingType(
                        selectedItems.length > 0 ? 'image' : 'folder',
                      );
                      setShowDeleteModal(true);
                    }}
                  >
                    <span aria-hidden="true">♲</span>
                    <span className="seg-label">삭제</span>
                  </button>
                  <button
                    type="button"
                    className="seg-btn"
                    disabled={
                      isMultiSelecting ||
                      !(
                        canRenameImage ||
                        (selectedItems.length === 0 && selectedFolder != null)
                      )
                    }
                    onClick={() => {
                      if (canRenameImage) {
                        setEditingTarget({
                          type: 'image',
                          id: selectedItems[0].id,
                        });
                        setImageEditName(selectedItems[0].name);
                      } else if (selectedFolder != null) {
                        setEditingTarget({
                          type: 'folder',
                          id: selectedFolder,
                        });
                      }
                    }}
                  >
                    <span aria-hidden="true">✎</span>
                    <span className="seg-label">이름변경</span>
                  </button>
                </div>
              </div>
            </header>

            <div
              className="image-explorer-filelist-outer"
              onMouseDown={(event) => {
                event.stopPropagation();
                const target = event.target as HTMLElement;
                if (target.closest('.image-explorer-thumbnail')) return;
                clearImageSelection();
              }}
              onDragEnter={(event) => {
                event.preventDefault();
                event.currentTarget.classList.add('dragover');
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node)) {
                  event.currentTarget.classList.remove('dragover');
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                event.currentTarget.classList.remove('dragover');
                if (selectedFolder != null) setUploadOpen(true);
              }}
            >
              <FileList
                images={images}
                currentFolderId={selectedFolder}
                onSelect={handleFileListSelect}
                onContextMenuImage={handleThumbContextMenu}
                selectedItems={selectedItems}
                searchQuery={searchQuery}
                setDraggingImageIds={setDraggingImageIds}
              />
            </div>
          </section>
        </div>
      </div>

      {contextMenu.visible ? (
        <div
          className="rd-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
          role="menu"
          onMouseDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="rd-context-menu-header">
            <span aria-hidden="true">
              {contextFolder ? '📁' : contextImage ? '🖼️' : '📂'}
            </span>
            <div>
              <strong>
                {contextFolder?.name ?? contextImage?.name ?? 'RDWIKI'}
              </strong>
              <small>
                {contextFolder
                  ? '폴더 메뉴'
                  : contextImage
                    ? '미디어 메뉴'
                    : '루트 폴더'}
              </small>
            </div>
          </div>

          <div className="rd-context-menu-list">
            {contextFolder ? (
              <>
                <button
                  type="button"
                  className="rd-context-menu-item favorite"
                  role="menuitem"
                  onClick={() => {
                    toggleFavoriteFolder(contextFolder.id);
                    closeContextMenu();
                  }}
                >
                  <span aria-hidden="true">
                    {contextFolderFavorite ? '★' : '☆'}
                  </span>
                  <span>
                    {contextFolderFavorite
                      ? '즐겨찾기에서 제거'
                      : '즐겨찾기에 추가'}
                  </span>
                </button>
                <button
                  type="button"
                  className="rd-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setSelectedFolder(contextFolder.id);
                    setSelectedFolderIds([contextFolder.id]);
                    setEditingTarget({
                      type: 'folder',
                      id: contextFolder.id,
                    });
                    closeContextMenu();
                  }}
                >
                  <span aria-hidden="true">✎</span>
                  <span>이름 변경</span>
                </button>
                <div className="rd-context-menu-separator" />
                <button
                  type="button"
                  className="rd-context-menu-item danger"
                  role="menuitem"
                  onClick={() => {
                    setSelectedFolder(contextFolder.id);
                    setSelectedFolderIds([contextFolder.id]);
                    setDeletingType('folder');
                    setShowDeleteModal(true);
                    closeContextMenu();
                  }}
                >
                  <span aria-hidden="true">♲</span>
                  <span>삭제</span>
                </button>
              </>
            ) : contextImage ? (
              <>
                <button
                  type="button"
                  className="rd-context-menu-item"
                  role="menuitem"
                  onClick={() => {
                    setSelectedItems([{ ...contextImage, type: 'image' }]);
                    setEditingTarget({ type: 'image', id: contextImage.id });
                    setImageEditName(contextImage.name);
                    closeContextMenu();
                  }}
                >
                  <span aria-hidden="true">✎</span>
                  <span>이름 변경</span>
                </button>
                <button
                  type="button"
                  className="rd-context-menu-item"
                  role="menuitem"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        toProxyUrl(contextImage.url),
                      );
                      closeContextMenu();
                    } catch {
                      alert('클립보드 복사 실패');
                    }
                  }}
                >
                  <span aria-hidden="true">🔗</span>
                  <span>URL 복사</span>
                </button>
                <div className="rd-context-menu-separator" />
                <button
                  type="button"
                  className="rd-context-menu-item danger"
                  role="menuitem"
                  onClick={() => {
                    setSelectedItems([{ ...contextImage, type: 'image' }]);
                    setDeletingType('image');
                    setShowDeleteModal(true);
                    closeContextMenu();
                  }}
                >
                  <span aria-hidden="true">♲</span>
                  <span>삭제</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="rd-context-menu-item"
                role="menuitem"
                onClick={() => {
                  setSelectedFolder(null);
                  setSelectedFolderIds([]);
                  setNewFolderOpen(true);
                  closeContextMenu();
                }}
              >
                <span aria-hidden="true">＋</span>
                <span>최상위 폴더 만들기</span>
              </button>
            )}
          </div>
        </div>
      ) : null}

      <ModalCard
        open={newFolderOpen}
        onClose={() => setNewFolderOpen(false)}
        title="새 폴더"
        actions={
          <>
            <button
              className="rd-btn secondary"
              onClick={() => setNewFolderOpen(false)}
              disabled={creatingFolder}
            >
              취소
            </button>
            <button
              className="rd-btn primary"
              onClick={() => void handleCreateFolder()}
              disabled={!newFolderName.trim() || creatingFolder}
              aria-busy={creatingFolder}
            >
              {creatingFolder ? '생성 중…' : '생성'}
            </button>
          </>
        }
      >
        <p className="rd-card-description">
          {selectedFolder == null
            ? '최상위 위치에 새 폴더를 만듭니다.'
            : `${currentFolder?.name ?? '선택 폴더'} 안에 새 폴더를 만듭니다.`}
        </p>
        <input
          className="rd-input"
          value={newFolderName}
          onChange={(event) => setNewFolderName(event.target.value)}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              void handleCreateFolder();
            }
            if (event.key === 'Escape') setNewFolderOpen(false);
          }}
          placeholder="예) 스크린샷"
        />
      </ModalCard>

      <ModalCard
        open={editingTarget?.type === 'image'}
        onClose={() => setEditingTarget(null)}
        title="이름 변경"
        actions={
          <>
            <button
              className="rd-btn secondary"
              onClick={() => setEditingTarget(null)}
            >
              취소
            </button>
            <button
              className="rd-btn primary"
              onClick={() => void handleImageRename()}
              disabled={!imageEditName.trim()}
            >
              저장
            </button>
          </>
        }
      >
        <p className="rd-card-description">새 파일명을 입력하세요.</p>
        <input
          className="rd-input"
          value={imageEditName}
          onChange={(event) => setImageEditName(event.target.value)}
          autoFocus
          onKeyDown={(event) => {
            if (event.key === 'Enter') void handleImageRename();
            if (event.key === 'Escape') setEditingTarget(null);
          }}
        />
      </ModalCard>

      <ModalCard
        open={showDeleteModal}
        onClose={closeDeleteModal}
        title={deletingType === 'folder' ? '폴더 삭제' : '이미지 삭제'}
        actions={
          <>
            <button className="rd-btn secondary" onClick={closeDeleteModal}>
              취소
            </button>
            <button
              className="rd-btn danger"
              onClick={() =>
                void (deletingType === 'folder'
                  ? handleDeleteFolders()
                  : handleDeleteImages())
              }
            >
              삭제
            </button>
          </>
        }
      >
        <p className="rd-card-description">
          {deletingType === 'folder' ? (
            selectedFolderIds.length > 1 ? (
              <>
                선택한 <b>{selectedFolderIds.length}</b>개 폴더와 모든 하위
                항목이 삭제됩니다. 계속하시겠습니까?
              </>
            ) : (
              <>
                <b>{currentFolder?.name ?? '선택 폴더'}</b>와 모든 하위 항목이
                삭제됩니다. 계속하시겠습니까?
              </>
            )
          ) : selectedItems.length > 1 ? (
            <>
              선택한 <b>{selectedItems.length}</b>개 미디어를 삭제하시겠습니까?
            </>
          ) : (
            <>
              <b>{selectedItems[0]?.name ?? '선택 미디어'}</b>를 삭제하시겠습니까?
            </>
          )}
        </p>
      </ModalCard>

      <ImageUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        folderId={selectedFolder}
        onUploaded={() => void refreshImages()}
      />
    </div>
  );
}

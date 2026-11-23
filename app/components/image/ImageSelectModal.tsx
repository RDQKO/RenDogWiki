// =============================================
// File: app/components/image/ImageSelectModal.tsx
// =============================================
'use client';
import ManagedImage from '@/components/common/ManagedImage';


/**
 * 이미지·영상 선택 모달
 * - 좌측 폴더 트리 / 우측 썸네일 그리드
 * - 단일 선택, 더블클릭 또는 "삽입" 버튼으로 콜백 호출
 * - 검색 시 서버 검색 결과를 표시
 * - onSelectImage는 (url) 1인자 방식과 (url, name, row) 3인자 방식을 모두 지원(하위 호환)
 *
 * ✅ 추가:
 * - 모달 열릴 때 검색 input 자동 포커스
 * - Enter 키: 선택된 이미지가 있으면 즉시 삽입
 */

import React, { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import Modal from '@/components/common/Modal';
import { toProxyUrl } from '@lib/cdn';

type Folder = { id: number; name: string; parent_id: number | null };
type MediaFile = { id: number; name: string; url: string; folder_id: number; mime_type?: string | null };

type FolderTreeProps = {
  folders: Folder[];
  parentId: number | null;
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  treeState: Record<number, boolean>;
  setTreeState: Dispatch<SetStateAction<Record<number, boolean>>>;
  depth?: number;
};

function FolderTree({
  folders,
  parentId,
  selectedId,
  onSelect,
  treeState,
  setTreeState,
  depth = 0,
}: FolderTreeProps) {
  const list = folders.filter((f) =>
    parentId === null ? f.parent_id == null : Number(f.parent_id) === Number(parentId)
  );
  if (!list.length) return null;

  return (
    <ul style={{ margin: 0, paddingLeft: depth === 0 ? 0 : 12, listStyle: 'none' }}>
      {list.map((folder) => {
        const hasChildren = folders.some((f) => Number(f.parent_id) === Number(folder.id));
        const isOpen = treeState[folder.id] ?? false;
        const isSelected = selectedId === folder.id;

        return (
          <li key={folder.id} style={{ margin: '2px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
              <button
                type="button"
                onClick={() => onSelect(folder.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  width: '100%',
                  borderRadius: 10,
                  padding: '6px 8px',
                  border: '1px solid',
                  borderColor: isSelected ? '#cfe0ff' : 'transparent',
                  background: isSelected ? '#eef5ff' : 'transparent',
                  color: isSelected ? '#1e40af' : '#1f2937',
                  fontWeight: isSelected ? 700 : 500,
                  cursor: 'pointer',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span role="img" aria-label="folder" style={{ fontSize: 18 }}>
                    📁
                  </span>
                  <span style={{ fontSize: 14.5 }}>{folder.name}</span>
                </span>

                {hasChildren && (
                  <span
                    role="button"
                    aria-label={isOpen ? '접기' : '펼치기'}
                    aria-expanded={isOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setTreeState((prev) => ({ ...prev, [folder.id]: !isOpen }));
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 22,
                      height: 22,
                      borderRadius: 6,
                      color: '#9aa1ad',
                    }}
                  >
                    <span
                      style={{
                        display: 'inline-block',
                        transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform .13s',
                        fontSize: 16,
                        lineHeight: 1,
                      }}
                    >
                      ▶
                    </span>
                  </span>
                )}
              </button>
            </div>

            {hasChildren && isOpen && (
              <FolderTree
                folders={folders}
                parentId={folder.id}
                selectedId={selectedId}
                onSelect={onSelect}
                treeState={treeState}
                setTreeState={setTreeState}
                depth={depth + 1}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

export default function ImageSelectModal({
  open,
  onClose,
  onSelectImage,
}: {
  open: boolean;
  onClose: () => void;
  /** 하위 호환: (url) 또는 (url, name, row) 모두 허용 */
  onSelectImage: (url: string, name?: string, row?: MediaFile) => void;
}) {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [images, setImages] = useState<MediaFile[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<number | null>(null);
  const [treeState, setTreeState] = useState<Record<number, boolean>>({});
  const [selectedImg, setSelectedImg] = useState<MediaFile | null>(null);
  const [search, setSearch] = useState('');
  const [searchRows, setSearchRows] = useState<MediaFile[]>([]);
  const searching = search.trim().length > 0;

  // ✅ 검색 input 자동 포커스
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const normalizeFolders = (data: any[]): Folder[] =>
    data.map((f: any) => ({
      id: Number(f.id),
      name: String(f.name),
      parent_id: f.parent_id === null || f.parent_id === undefined ? null : Number(f.parent_id),
    }));

  const normalizeMedia = (data: any[]): MediaFile[] =>
    data.map((i: any) => ({
      id: Number(i.id),
      name: String(i.name),
      url: String(i.url),
      folder_id: Number(i.folder_id),
      mime_type: i.mime_type ? String(i.mime_type) : null,
    }));

  const handleInsert = () => {
    if (!selectedImg) return;
    // 저장은 원본 URL을 넘김(렌더링 시에만 프록시 사용)
    onSelectImage(selectedImg.url, selectedImg.name, selectedImg);
    onClose();
  };

  // ✅ Enter: 선택된 이미지가 있으면 삽입
  const handleKeyDownCapture = (e: React.KeyboardEvent) => {
    if (!open) return;

    // IME 조합중 Enter는 무시
    if ((e as any).isComposing) return;

    if (e.key === 'Enter') {
      // modifier 키 조합은 무시
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return;

      if (selectedImg) {
        e.preventDefault();
        e.stopPropagation();
        handleInsert();
      }
    }
  };

  // 모달 열릴 때 폴더 목록 초기화
  useEffect(() => {
    if (!open) return;

    setSelectedFolder(null);
    setSelectedImg(null);
    setSearch('');
    setSearchRows([]);
    setTreeState({}); // 모두 닫힘

    // ✅ 모달 열릴 때 검색칸 포커스 (DOM 렌더 이후 안정적으로)
    requestAnimationFrame(() => {
      setTimeout(() => {
        searchInputRef.current?.focus({ preventScroll: true } as any);
        // 선택된 상태로 바로 타이핑 가능하게
        searchInputRef.current?.select?.();
      }, 0);
    });

    (async () => {
      try {
        const res = await fetch('/api/image/folder/list', { cache: 'no-store' });
        const raw = await res.json();
        setFolders(normalizeFolders(raw));
        setImages([]); // 폴더 선택 전까지 비움
      } catch {
        setFolders([]);
        setImages([]);
      }
    })();
  }, [open]);

  // 폴더 선택 시 목록 조회
  useEffect(() => {
    if (!open || searching) return;
    if (selectedFolder) {
      (async () => {
        try {
          const r = await fetch(`/api/image/view?folder_id=${selectedFolder}&ts=${Date.now()}`, {
            cache: 'no-store',
          });
          const raw = await r.json();
          setImages(normalizeMedia(raw));
        } catch {
          setImages([]);
        }
      })();
    } else {
      setImages([]);
    }
    setSelectedImg(null);
  }, [open, selectedFolder, searching]);

  // 검색
  useEffect(() => {
    if (!open) return;
    const q = search.trim();
    if (!q) {
      setSearchRows([]);
      return;
    }
    const ctrl = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/image/search?q=${encodeURIComponent(q)}&limit=200&ts=${Date.now()}`,
          { cache: 'no-store', signal: ctrl.signal }
        );
        const rows = await res.json();
        setSearchRows(normalizeMedia(rows));
        setSelectedImg(null);
      } catch {
        if (!ctrl.signal.aborted) setSearchRows([]);
      }
    })();
    return () => ctrl.abort();
  }, [open, search]);

  const listToShow = searching ? searchRows : images;

  if (!open) return null;

  return (
    <Modal open={open} onClose={onClose}>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          display: 'grid',
          placeItems: 'center',
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="이미지·영상 선택"
          style={{
            pointerEvents: 'auto',
            width: 780,
            maxWidth: 'calc(100vw - 40px)',
            maxHeight: 'calc(100vh - 80px)',
            overflow: 'hidden',
            background: '#fff',
            borderRadius: 20,
            boxShadow: '0 24px 40px rgba(0,0,0,.12)',
            display: 'grid',
            gridTemplateRows: 'auto 1fr auto',
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDownCapture={handleKeyDownCapture} // ✅ Enter 삽입
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '16px 18px',
              borderBottom: '1px solid #f0f2f6',
            }}
          >
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#111827' }}>이미지·영상 선택</h3>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <input
                  ref={searchInputRef}
                  placeholder="이미지/영상 이름 검색"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    width: 240,
                    height: 34,
                    padding: '0 28px 0 10px',
                    borderRadius: 8,
                    border: '1px solid #e6eaf0',
                    background: '#fbfcfd',
                    fontSize: 14,
                  }}
                />
                {search && (
                  <button
                    onClick={() => {
                      setSearch('');
                      // 지운 뒤에도 바로 다시 입력되게 포커스 유지
                      requestAnimationFrame(() => {
                        searchInputRef.current?.focus({ preventScroll: true } as any);
                      });
                    }}
                    aria-label="검색어 지우기"
                    style={{
                      position: 'absolute',
                      right: 4,
                      top: 4,
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      border: 'none',
                      background: '#f3f4f6',
                      cursor: 'pointer',
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <svg height="18" viewBox="0 0 384 512">
                  <path
                    d="M342.6 150.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192 210.7 86.6 105.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L146.7 256 41.4 361.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192 301.3 297.4 406.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.3 256 342.6 150.6z"
                    fill="#9aa4b2"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              width: '100%',
              height: 420,
              maxHeight: 'calc(100vh - 180px)',
            }}
          >
            <aside
              style={{
                width: 230,
                borderRight: '1px solid #edf0f5',
                padding: 10,
                overflowY: 'auto',
              }}
            >
              <FolderTree
                folders={folders}
                parentId={null}
                selectedId={selectedFolder}
                onSelect={(id) => setSelectedFolder(id)}
                treeState={treeState}
                setTreeState={setTreeState}
              />
            </aside>

            <section
              style={{
                flex: 1,
                padding: 12,
                overflowY: 'auto',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
                gridAutoRows: '110px',
                gap: 12,
                alignContent: 'start',
                background: '#fff',
              }}
            >
              {listToShow.length === 0 && (
                <div style={{ color: '#9aa1ad', margin: '40px auto' }}>
                  {searching ? '검색 결과가 없습니다.' : '이 폴더에 미디어 없음'}
                </div>
              )}

              {listToShow.map((img) => {
                const selected = selectedImg?.id === img.id;
                const isVideo = (img.mime_type || '').startsWith('video/');
                return (
                  <button
                    key={img.id}
                    onClick={() => setSelectedImg(img)}
                    onDoubleClick={handleInsert}
                    title={img.name}
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: '100%',
                      aspectRatio: '1 / 1',
                      borderRadius: 12,
                      border: selected ? '2px solid #4a90e2' : '1px solid #e6eaf0',
                      background: selected ? '#f6faff' : '#fbfcfd',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: selected ? '0 2px 10px rgba(74,144,226,.15)' : '0 1px 2px rgba(16,24,40,.05)',
                      overflow: 'hidden',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    {isVideo ? (
                      <div style={{ position: 'relative' }}>
                        <video
                          src={toProxyUrl(img.url)}
                          preload="metadata"
                          playsInline
                          muted
                          width={88}
                          height={88}
                          style={{ width: 88, height: 88, borderRadius: 8, background: '#000' }}
                        />
                        <span
                          style={{
                            position: 'absolute',
                            right: 4,
                            bottom: 4,
                            background: '#0008',
                            color: '#fff',
                            fontWeight: 800,
                            fontSize: 12,
                            padding: '2px 6px',
                            borderRadius: 6,
                          }}
                        >
                          ▶
                        </span>
                      </div>
                    ) : (
                      <ManagedImage
                        src={toProxyUrl(img.url)}
                        alt={img.name}
                        width={88}
                        height={88}
                        loading="lazy"
                        decoding="async"
                        draggable={false}
                        style={{ width: 88, height: 88, borderRadius: 8, objectFit: 'contain', background: '#fff' }}
                      />
                    )}
                    {selected && (
                      <span
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          width: 22,
                          height: 22,
                          borderRadius: 999,
                          background: '#4a90e2',
                          color: '#fff',
                          fontSize: 14,
                          fontWeight: 800,
                          display: 'grid',
                          placeItems: 'center',
                          boxShadow: '0 1px 4px rgba(0,0,0,.18)',
                        }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </section>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 16px 16px',
              borderTop: '1px solid #f0f2f6',
              background: '#fff',
            }}
          >
            <div style={{ flex: 1, minHeight: 38 }}>
              {selectedImg && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {(selectedImg.mime_type || '').startsWith('video/') ? (
                    <video
                      src={toProxyUrl(selectedImg.url)}
                      preload="metadata"
                      playsInline
                      muted
                      width={38}
                      height={38}
                      style={{
                        height: 38,
                        width: 38,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid #e6eaf0',
                        background: '#000',
                      }}
                    />
                  ) : (
                    <ManagedImage
                      src={toProxyUrl(selectedImg.url)}
                      alt={selectedImg.name}
                      width={38}
                      height={38}
                      loading="lazy"
                      decoding="async"
                      draggable={false}
                      style={{
                        height: 38,
                        width: 38,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid #e6eaf0',
                        background: '#fafafa',
                      }}
                    />
                  )}
                  <span style={{ color: '#374151', fontSize: 14, fontWeight: 600 }}>{selectedImg.name}</span>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleInsert}
              disabled={!selectedImg}
              style={{
                minWidth: 100,
                height: 40,
                padding: '0 16px',
                borderRadius: 10,
                border: '1px solid transparent',
                fontWeight: 800,
                background: selectedImg ? '#2357b2' : '#e9eef6',
                color: selectedImg ? '#fff' : '#90a3bf',
                cursor: selectedImg ? 'pointer' : 'not-allowed',
              }}
            >
              삽입
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

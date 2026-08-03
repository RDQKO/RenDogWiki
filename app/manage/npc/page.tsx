// File: app/manage/npc/page.tsx
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import WikiHeader from '@/components/common/Header';
import { ModalCard } from '@/components/common/RdModal';
import ImageSelectModal from '@/components/image/ImageSelectModal';
import { toProxyUrl } from '@lib/cdn';

import {
  SectionHeader,
  EmptyState,
  IconCell,
  SortableList,
  DetailTitle,
} from '@/components/manager';
import '@/wiki/css/image.css';
import '@/wiki/css/manager-common.css';
import '@/wiki/css/npc-manager.css';

type Role = 'guest' | 'writer' | 'admin';

type Village = {
  id: number;
  name: string;
  icon: string;
  order: number;
  head_icon?: string | null;
  uploader?: string | null;
};
type Npc = {
  id: number;
  name: string;
  village_id: number;
  icon: string;
  order: number;
  reward: string | null;
  reward_icon: string | null;
  requirement: string | null;
  line: string | null;
  location_x: number;
  location_y: number;
  location_z: number;
  quest: string;
  npc_type: string;
  pictures?: string[];
  uploader?: string | null;
};
export default function NpcManager() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then(d =>
        setUser(
          d?.user
            ? { ...d.user, role: d?.user?.role ?? d?.role ?? 'guest' }
            : null
        )
      );
  }, []);
  const role: Role =
    user?.role === 'admin' ? 'admin' : user?.role === 'writer' ? 'writer' : 'guest';
  const isAdmin = role === 'admin';
  const isWriter = role === 'writer';
  const myName = (user?.minecraft_name ?? '').toLowerCase();

  const canDeleteVillage = (v: Village | null) =>
    !!v && (isAdmin || (isWriter && v.uploader?.toLowerCase?.() === myName));
  const canDeleteNpc = (n: Npc | null) =>
    !!n && (isAdmin || (isWriter && n.uploader?.toLowerCase?.() === myName));
  const [villages, setVillages] = useState<Village[]>([]);
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);

  const [npcList, setNpcList] = useState<Npc[]>([]);
  const [selectedNpc, setSelectedNpc] = useState<Npc | null>(null);

  const [villageModalOpen, setVillageModalOpen] = useState(false);
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editIconOpen, setEditIconOpen] = useState(false);
  const [editLocOpen, setEditLocOpen] = useState(false);
  const [editLineOpen, setEditLineOpen] = useState(false);
  const [picturesModalOpen, setPicturesModalOpen] = useState(false);
  const [addPictureModalOpen, setAddPictureModalOpen] = useState(false);
  const [villageName, setVillageName] = useState('');
  const [villageIcon, setVillageIcon] = useState('');
  const [npcName, setNpcName] = useState('');

  const [tmpName, setTmpName] = useState('');
  const [tmpLoc, setTmpLoc] = useState<[number, number, number]>([0, 0, 0]);
  const [tmpLine, setTmpLine] = useState('');
  const [npcPictures, setNpcPictures] = useState<string[]>([]);
  const [editVillageOpen, setEditVillageOpen] = useState(false);
  const [editingVillage, setEditingVillage] = useState<Village | null>(null);
  const [editVillageName, setEditVillageName] = useState('');
  const [editVillageIcon, setEditVillageIcon] = useState('');
  const [editVillageHeadIcon, setEditVillageHeadIcon] = useState<string>('');
  const [editImageModalOpen, setEditImageModalOpen] = useState(false);
  const [editHeadIconModalOpen, setEditHeadIconModalOpen] = useState(false);
  const normalizePictures = (pics: any): string[] => {
    if (Array.isArray(pics)) return [...pics];
    if (pics == null) return [];
    if (typeof pics === 'string') {
      try {
        const v = JSON.parse(pics);
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  useEffect(() => {
    fetch('/api/villages')
      .then(r => r.json())
      .then(rows => setVillages(Array.isArray(rows) ? rows : []));
  }, []);
  const reloadNpcList = useCallback(async (villageId: number) => {
    const params = new URLSearchParams({
      village_id: String(villageId),
      npc_type: 'normal',
      nocache: '1',
    });

    const response = await fetch(`/api/npcs?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('NPC 목록을 불러오지 못했습니다.');
    }

    const rows = await response.json();
    setNpcList(Array.isArray(rows) ? rows : []);
    return Array.isArray(rows) ? rows : [];
  }, []);
  useEffect(() => {
    if (!selectedVillage) {
      setNpcList([]);
      setSelectedNpc(null);
      return;
    }
    reloadNpcList(selectedVillage.id).then(() => setSelectedNpc(null));
  }, [selectedVillage, reloadNpcList]);
  useEffect(() => {
    if (!selectedNpc) return;
    setTmpName(selectedNpc.name);
    setTmpLoc([selectedNpc.location_x, selectedNpc.location_y, selectedNpc.location_z]);
    setTmpLine(selectedNpc.line || '');
    setNpcPictures(normalizePictures(selectedNpc.pictures));
  }, [selectedNpc]);
  const handleAddVillage = useCallback(async () => {
    const maxOrder = villages.length ? Math.max(...villages.map(v => v.order)) : 0;
    await fetch('/api/villages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: villageName,
        icon: villageIcon,
        order: maxOrder + 1,
        uploader: user?.minecraft_name ?? undefined,
      }),
    });
    const rows = await fetch('/api/villages').then(r => r.json());
    setVillages(Array.isArray(rows) ? rows : []);
    setVillageModalOpen(false);
    setVillageName('');
    setVillageIcon('');
  }, [villageIcon, villageName, villages, user?.minecraft_name]);
  const handleAddNpc = useCallback(async () => {
    if (!selectedVillage) return;
    const maxOrder = npcList.length ? Math.max(...npcList.map(n => n.order)) : 0;
    const response = await fetch('/api/npcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: npcName,
        village_id: selectedVillage.id,
        icon: '😀',
        order: maxOrder + 1,
        reward: null,
        reward_icon: null,
        requirement: null,
        line: null,
        location_x: 0,
        location_y: 0,
        location_z: 0,
        quest: '',
        npc_type: 'normal',
        uploader: user?.minecraft_name ?? undefined,
      }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      alert(data?.error || 'NPC 추가에 실패했습니다.');
      return;
    }

    await reloadNpcList(selectedVillage.id);
    setNpcModalOpen(false);
    setNpcName('');
  }, [npcList, npcName, selectedVillage, reloadNpcList, user?.minecraft_name]);
  const patchNpc = useCallback(
    async (fields: Partial<Npc>) => {
      if (!selectedNpc) return;
      await fetch(`/api/npcs/${selectedNpc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...selectedNpc, ...fields, npc_type: 'normal' }),
      });
      if (!selectedVillage) return;
      const rows = await reloadNpcList(selectedVillage.id);
      setSelectedNpc(rows.find((n: Npc) => n.id === selectedNpc.id) ?? null);
    },
    [selectedNpc, selectedVillage, reloadNpcList]
  );
  const openEditVillage = (v: Village) => {
    setEditingVillage(v);
    setEditVillageName(v.name);
    setEditVillageIcon(v.icon);
    setEditVillageHeadIcon(v.head_icon || '');
    setEditVillageOpen(true);
  };
  const handleEditVillage = useCallback(async () => {
    if (!editingVillage) return;
    await fetch(`/api/villages/${editingVillage.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: editVillageName,
        icon: editVillageIcon,
        head_icon: editVillageHeadIcon || null,
      }),
    });
    const rows = await fetch('/api/villages').then(r => r.json());
    setVillages(Array.isArray(rows) ? rows : []);
    if (selectedVillage && selectedVillage.id === editingVillage.id) {
      setSelectedVillage({
        ...selectedVillage,
        name: editVillageName,
        icon: editVillageIcon,
        head_icon: editVillageHeadIcon || null,
      });
    }
    setEditVillageOpen(false);
    setEditingVillage(null);
    setEditVillageName('');
    setEditVillageIcon('');
    setEditVillageHeadIcon('');
  }, [
    editingVillage,
    editVillageIcon,
    editVillageName,
    editVillageHeadIcon,
    selectedVillage,
  ]);
  const handleDeleteVillage = useCallback(async () => {
    if (!editingVillage) return;
    if (!canDeleteVillage(editingVillage)) {
      alert('본인이 만든 마을만 삭제할 수 있습니다.');
      return;
    }
    if (!window.confirm('정말 이 마을을 삭제하시겠습니까?')) return;
    await fetch(`/api/villages/${editingVillage.id}`, { method: 'DELETE' });
    const rows = await fetch('/api/villages').then(r => r.json());
    setVillages(Array.isArray(rows) ? rows : []);
    if (selectedVillage && selectedVillage.id === editingVillage.id) setSelectedVillage(null);
    setEditVillageOpen(false);
    setEditingVillage(null);
    setEditVillageName('');
    setEditVillageIcon('');
    setEditVillageHeadIcon('');
  }, [editingVillage, selectedVillage]);
  const sortedVillages = useMemo(
    () => [...villages].sort((a, b) => a.order - b.order),
    [villages]
  );
  const sortedNpcList = useMemo(
    () => [...npcList].sort((a, b) => a.order - b.order),
    [npcList]
  );
  const handleReorder = useCallback(
    async (reordered: Npc[]) => {
      setNpcList(reordered);
      const prev = new Map(npcList.map(n => [n.id, n.order]));
      const changed = reordered
        .filter(n => prev.get(n.id) !== n.order)
        .map(n => ({ id: n.id, order: n.order }));
      if (!selectedVillage || changed.length === 0) return;
      try {
        const res = await fetch('/api/npcs/order', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            village_id: selectedVillage.id,
            npc_type: 'normal',
            orders: changed,
          }),
        });
        if (!res.ok) throw new Error('bulk-order-failed');
      } catch {
        await reloadNpcList(selectedVillage.id);
      }
    },
    [npcList, selectedVillage, reloadNpcList]
  );
  const onKeyActivate =
    (fn: () => void) =>
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fn();
      }
    };

  return (
    <>
      <WikiHeader user={user} />
      {/* 마을 추가 */}
      <ModalCard
        open={villageModalOpen}
        onClose={() => setVillageModalOpen(false)}
        title="마을 추가"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setVillageModalOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              disabled={!villageName.trim() || !villageIcon.trim()}
              onClick={handleAddVillage}
              aria-label="마을 추가"
              title="마을 추가"
            >
              추가
            </button>
          </>
        }
      >
        <div className="rd-field">
          <label className="rd-label">마을 이름</label>
          <input
            className="rd-input"
            placeholder="마을 이름"
            maxLength={40}
            value={villageName}
            onChange={e => setVillageName(e.target.value)}
            aria-label="마을 이름 입력"
          />
        </div>
        <div className="rd-field">
          <label className="rd-label">마을 아이콘</label>
          <div className="mgr-icon-field">
            <div className="mgr-icon-inputs">
              <input
                className="rd-input rd-emoji-input"
                maxLength={2}
                value={villageIcon && !villageIcon.startsWith('http') ? villageIcon : ''}
                onChange={e => setVillageIcon(e.target.value)}
                aria-label="마을 아이콘 입력(이모지)"
              />
              <button
                type="button"
                className="rd-btn secondary"
                onClick={() => setImageModalOpen(true)}
                aria-label="이미지 선택"
                title="이미지 선택"
              >
                이미지 선택
              </button>
            </div>
            <div className="mgr-icon-preview">
              {villageIcon?.startsWith('http') ? (
                <img
                  src={toProxyUrl(villageIcon)}
                  className="rd-preview"
                  alt="icon"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="mgr-icon-placeholder">미리보기</span>
              )}
            </div>
          </div>
        </div>
        <ImageSelectModal
          open={imageModalOpen}
          onClose={() => setImageModalOpen(false)}
          onSelectImage={url => {
            setVillageIcon(url);
            setImageModalOpen(false);
          }}
        />
      </ModalCard>
      {/* NPC 추가 */}
      <ModalCard
        open={npcModalOpen}
        onClose={() => setNpcModalOpen(false)}
        title="NPC 추가"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setNpcModalOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              disabled={!npcName.trim()}
              onClick={handleAddNpc}
              aria-label="NPC 추가"
              title="NPC 추가"
            >
              추가
            </button>
          </>
        }
      >
        <div className="rd-field">
          <label className="rd-label">NPC 이름</label>
          <input
            className="rd-input"
            placeholder="NPC 이름"
            maxLength={40}
            value={npcName}
            onChange={e => setNpcName(e.target.value)}
            aria-label="NPC 이름 입력"
          />
        </div>
      </ModalCard>
      {/* 3단 레이아웃 */}
      <div className="mgr-container">
        {/* 사이드바: 마을 */}
        <div className="mgr-sidebar">
          <SectionHeader
            title="마을 목록"
            right={
              <button
                className="mgr-add-btn"
                onClick={() => setVillageModalOpen(true)}
                aria-label="마을 추가"
                title="마을 추가"
              >
                + 마을 추가
              </button>
            }
          />
          <ul className="npc-village-list">
            {sortedVillages.map(v => (
              <li
                key={v.id}
                className={`npc-village-item${selectedVillage?.id === v.id ? ' selected' : ''}`}
                onClick={() => setSelectedVillage(v)}
              >
                <span className="npc-village-icon">
                  <IconCell icon={v.icon} />
                </span>
                {v.name}
                <button
                  className="mgr-village-menu-btn"
                  onClick={e => {
                    e.stopPropagation();
                    openEditVillage(v);
                  }}
                  aria-label="마을 편집"
                  title="마을 정보 수정/삭제"
                >
                  ⋮
                </button>
              </li>
            ))}
          </ul>
        </div>
        {/* 리스트: NPC */}
        <div className="mgr-list-area">
          <SectionHeader
            title={selectedVillage ? `${selectedVillage.name} NPC` : 'NPC 목록'}
            right={
              <button
                className="mgr-add-btn"
                disabled={!selectedVillage}
                onClick={() => setNpcModalOpen(true)}
                title={selectedVillage ? 'NPC 추가' : '마을을 먼저 선택하세요'}
                aria-label="NPC 추가"
              >
                + NPC 추가
              </button>
            }
          />
          {!selectedVillage ? (
            <EmptyState>마을을 먼저 선택하세요.</EmptyState>
          ) : sortedNpcList.length === 0 ? (
            <EmptyState>등록된 NPC가 없습니다.</EmptyState>
          ) : (
            <SortableList<Npc>
              className="mgr-list"
              itemClassName="mgr-list-item"
              items={sortedNpcList}
              selectedId={selectedNpc?.id}
              onSelect={it => setSelectedNpc(it)}
              onReorder={handleReorder}
              useOverlay={false}
              renderItem={n => (
                <>
                  <span className="mgr-order">{n.order}.</span>
                  <IconCell icon={n.icon} className="mgr-icon-img" size={22} rounded={5} />
                  <span className="mgr-name">{n.name}</span>
                </>
              )}
            />
          )}
        </div>
        {/* 상세 */}
        <div className="mgr-detail-area">
          {selectedNpc ? (
            <div>
              <div className="toolbar-seg mgr-detail-actions">
                <button
                  type="button"
                  className="seg-btn danger"
                  onClick={async () => {
                    if (!selectedNpc) return;
                    if (!canDeleteNpc(selectedNpc)) {
                      alert('본인이 만든 NPC만 삭제할 수 있습니다.');
                      return;
                    }
                    if (!window.confirm('이 NPC를 삭제할까요?')) return;
                    const res = await fetch(`/api/npcs/${selectedNpc.id}`, { method: 'DELETE' });
                    if (!res.ok) {
                      const d = await res.json().catch(() => ({}));
                      alert(d?.error || '삭제 실패');
                      return;
                    }
                    if (selectedVillage) {
                      await reloadNpcList(selectedVillage.id);
                    }
                    setSelectedNpc(null);
                  }}
                  disabled={!canDeleteNpc(selectedNpc)}
                  title="삭제"
                  aria-label="NPC 삭제"
                >
                  <svg
                    className="ico"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path
                      d="M9.75 9.75v6.75M14.25 9.75v6.75M4.5 7.5h15M9 4.5h6m-8.25 3L7.5 19.5a2.25 2.25 0 002.25 2.25h4.5A2.25 2.25 0 0016.5 19.5L18.75 7.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="seg-label">삭제</span>
                </button>
              </div>
              <DetailTitle
                icon={
                  <IconCell icon={selectedNpc.icon} className="npc-detail-img" size={44} rounded={8} />
                }
                title={<span className="npc-detail-name">{selectedNpc.name}</span>}
                showEditButtons={false}
                onTitleClick={() => setEditNameOpen(true)}
                onIconClick={() => setEditIconOpen(true)}
              />
              <div
                className="mgr-pill-row"
                role="button"
                tabIndex={0}
                onClick={() => setEditLocOpen(true)}
                onKeyDown={onKeyActivate(() => setEditLocOpen(true))}
                aria-label="위치 편집"
              >
                <span className="mgr-pill-label">위치</span>
                <span className="mgr-pill-value">
                  <span className="npc-detail-loc">
                    ( {selectedNpc.location_x}, {selectedNpc.location_y},{' '}
                    {selectedNpc.location_z} )
                  </span>
                </span>
              </div>
              <div
                className="mgr-pill-row mgr-pill-row--multi"
                role="button"
                tabIndex={0}
                onClick={() => setEditLineOpen(true)}
                onKeyDown={onKeyActivate(() => setEditLineOpen(true))}
                aria-label="대사 편집"
              >
                <span className="mgr-pill-label">대사</span>
                <span className="mgr-pill-value">
                  {selectedNpc.line?.trim() ? (
                    selectedNpc.line
                  ) : (
                    <span className="mgr-placeholder">- 대사 없음 -</span>
                  )}
                </span>
              </div>
              <div
                className="mgr-pill-row"
                role="button"
                tabIndex={0}
                onClick={() => setPicturesModalOpen(true)}
                onKeyDown={onKeyActivate(() => setPicturesModalOpen(true))}
                aria-label="사진 관리"
              >
                <span className="mgr-pill-label">사진</span>
                <span className="mgr-pill-value">
                  {npcPictures.length ? (
                    npcPictures.slice(0, 6).map((url, i) => (
                      <img
                        key={url + i}
                        src={toProxyUrl(url)}
                        alt=""
                        className="mgr-pill-pic"
                        loading="lazy"
                        decoding="async"
                      />
                    ))
                  ) : (
                    <span className="mgr-placeholder">사진 없음</span>
                  )}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState>NPC를 선택하세요.</EmptyState>
          )}
        </div>
      </div>
      {/* 이름 수정 */}
      <ModalCard
        open={editNameOpen}
        onClose={() => setEditNameOpen(false)}
        title="이름 수정"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setEditNameOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              disabled={!tmpName.trim()}
              onClick={async () => {
                await patchNpc({ name: tmpName });
                setEditNameOpen(false);
              }}
              aria-label="이름 수정 저장"
            >
              수정
            </button>
          </>
        }
      >
        <input
          className="rd-input"
          maxLength={40}
          value={tmpName}
          onChange={e => setTmpName(e.target.value)}
          aria-label="NPC 이름 입력"
        />
      </ModalCard>
      {/* 아이콘 선택 */}
      <ImageSelectModal
        open={editIconOpen}
        onClose={() => setEditIconOpen(false)}
        onSelectImage={async url => {
          await patchNpc({ icon: url });
          setEditIconOpen(false);
        }}
      />
      {/* 위치 수정 */}
      <ModalCard
        open={editLocOpen}
        onClose={() => setEditLocOpen(false)}
        title="위치 수정"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setEditLocOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              disabled={tmpLoc.some(v => Number.isNaN(v))}
              onClick={async () => {
                await patchNpc({
                  location_x: tmpLoc[0],
                  location_y: tmpLoc[1],
                  location_z: tmpLoc[2],
                });
                setEditLocOpen(false);
              }}
              aria-label="위치 수정 저장"
            >
              수정
            </button>
          </>
        }
      >
        <div className="rd-field">
          <div className="rd-coord-row" role="group" aria-label="좌표 입력">
            {(['X', 'Y', 'Z'] as const).map((label, i) => (
              <div key={label} className="rd-coord-item">
                <span className="rd-chip-label">{label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  className="rd-input rd-num"
                  value={Number.isNaN(tmpLoc[i]) ? '' : tmpLoc[i]}
                  onChange={e => {
                    const n =
                      e.currentTarget.value === ''
                        ? Number.NaN
                        : e.currentTarget.valueAsNumber;
                    setTmpLoc(v => {
                      const a = [...v] as [number, number, number];
                      a[i] = n;
                      return a;
                    });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </ModalCard>
      {/* 대사 수정 */}
      <ModalCard
        open={editLineOpen}
        onClose={() => setEditLineOpen(false)}
        title="대사 수정"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setEditLineOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              onClick={async () => {
                await patchNpc({ line: tmpLine });
                setEditLineOpen(false);
              }}
              aria-label="대사 수정 저장"
            >
              수정
            </button>
          </>
        }
      >
        <textarea
          className="rd-textarea"
          value={tmpLine}
          onChange={e => setTmpLine(e.target.value)}
          maxLength={600}
          aria-label="대사 입력"
        />
      </ModalCard>
      {/* 사진 관리 */}
      <ModalCard
        open={picturesModalOpen}
        onClose={() => setPicturesModalOpen(false)}
        title="NPC 사진 관리"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setPicturesModalOpen(false)}>
              닫기
            </button>
            <button
              className="rd-btn primary"
              disabled={!selectedNpc}
              onClick={async () => {
                await patchNpc({ pictures: npcPictures });
                setPicturesModalOpen(false);
              }}
              aria-label="사진 저장"
            >
              저장
            </button>
          </>
        }
      >
        <div className="rd-thumb-grid">
          {npcPictures.length === 0 && <span className="rd-muted">등록된 사진이 없습니다.</span>}
          {npcPictures.map((url, idx) => (
            <div key={url + idx} className="rd-thumb">
              <img
                src={toProxyUrl(url)}
                alt={`npc-pic-${idx}`}
                loading="lazy"
                decoding="async"
              />
              <button
                className="rd-thumb-x"
                onClick={() => setNpcPictures(npcPictures.filter((_, i) => i !== idx))}
                title="삭제"
                aria-label={`사진 ${idx + 1} 삭제`}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            type="button"
            className="rd-btn secondary"
            onClick={() => setAddPictureModalOpen(true)}
            aria-label="사진 추가"
            title="사진 추가"
          >
            + 사진 추가
          </button>
        </div>
        <ImageSelectModal
          open={addPictureModalOpen}
          onClose={() => setAddPictureModalOpen(false)}
          onSelectImage={url => {
            if (!npcPictures.includes(url)) setNpcPictures([...npcPictures, url]);
            setAddPictureModalOpen(false);
          }}
        />
      </ModalCard>
      {/* 마을 정보 수정 */}
      <ModalCard
        open={editVillageOpen}
        onClose={() => {
          setEditVillageOpen(false);
          setEditingVillage(null);
          setEditVillageName('');
          setEditVillageIcon('');
          setEditVillageHeadIcon('');
        }}
        title="마을 정보 수정"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setEditVillageOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              disabled={!editVillageName.trim() || !editVillageIcon.trim()}
              onClick={handleEditVillage}
              aria-label="마을 정보 저장"
            >
              저장
            </button>
            <button
              className="rd-btn danger"
              onClick={handleDeleteVillage}
              aria-label="마을 삭제"
              title={canDeleteVillage(editingVillage) ? '마을 삭제' : '본인이 만든 항목만 삭제 가능'}
              disabled={!canDeleteVillage(editingVillage)}
            >
              삭제
            </button>
          </>
        }
      >
        <div className="rd-field">
          <label className="rd-label">마을 이름</label>
          <input
            className="rd-input"
            maxLength={40}
            value={editVillageName}
            onChange={e => setEditVillageName(e.target.value)}
            aria-label="마을 이름 입력"
          />
        </div>
        <div className="rd-field">
          <label className="rd-label">마을 아이콘</label>
          <div className="mgr-icon-field">
            <div className="mgr-icon-inputs">
              <input
                className="rd-input rd-emoji-input"
                maxLength={2}
                value={
                  editVillageIcon && !editVillageIcon.startsWith('http')
                    ? editVillageIcon
                    : ''
                }
                onChange={e => setEditVillageIcon(e.target.value)}
                aria-label="마을 아이콘 입력(이모지)"
              />
              <button
                type="button"
                className="rd-btn secondary"
                onClick={() => setEditImageModalOpen(true)}
                aria-label="아이콘 이미지 선택"
                title="아이콘 이미지 선택"
              >
                이미지 선택
              </button>
            </div>
            <div className="mgr-icon-preview">
              {editVillageIcon?.startsWith('http') ? (
                <img
                  src={toProxyUrl(editVillageIcon)}
                  alt="icon"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="mgr-icon-placeholder">미리보기</span>
              )}
            </div>
          </div>
        </div>
        <div className="rd-field">
          <label className="rd-label">머리 아이콘</label>
          <div className="mgr-icon-field">
            <div className="mgr-icon-inputs">
              <button
                type="button"
                className="rd-btn secondary"
                onClick={() => setEditHeadIconModalOpen(true)}
                aria-label="머리 아이콘 이미지 선택"
                title="머리 아이콘 이미지 선택"
              >
                이미지 선택
              </button>
            </div>
            <div className="mgr-icon-preview">
              {editVillageHeadIcon?.startsWith('http') ? (
                <img
                  src={toProxyUrl(editVillageHeadIcon)}
                  alt="head_icon"
                  loading="lazy"
                  decoding="async"
                />
              ) : (
                <span className="mgr-icon-placeholder">미리보기</span>
              )}
            </div>
          </div>
        </div>
        <ImageSelectModal
          open={editImageModalOpen}
          onClose={() => setEditImageModalOpen(false)}
          onSelectImage={url => {
            setEditVillageIcon(url);
            setEditImageModalOpen(false);
          }}
        />
        <ImageSelectModal
          open={editHeadIconModalOpen}
          onClose={() => setEditHeadIconModalOpen(false)}
          onSelectImage={url => {
            setEditVillageHeadIcon(url);
            setEditHeadIconModalOpen(false);
          }}
        />
      </ModalCard>
    </>
  );
}

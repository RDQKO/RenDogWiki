// =============================================
// File: app/manage/head/page.tsx
// (삭제 권한) 본인이 만든 항목만 삭제 가능: minecraft_name 기준
// - Village/Head 생성 시 uploader 저장
// - 삭제 버튼은 관리자이거나(항상 허용) uploader===user.minecraft_name 일 때만 활성화
//
// + FIX: 머리 선택(리스트 클릭) 시 가운데 리스트 스크롤이 0으로 초기화되는 문제 방지
//   - 선택 직전 scrollTop 저장 → selectedHead 변경 직후 useLayoutEffect로 복원
// =============================================

'use client';
import ManagedImage from '@/components/common/ManagedImage';


import { useCallback, useEffect, useMemo, useState, useRef, useLayoutEffect } from 'react';
import WikiHeader from '@/components/common/Header';
import { ModalCard } from '@/components/common/RdModal';
import ImageSelectModal from '@/components/image/ImageSelectModal';
import { toProxyUrl } from '@lib/cdn';

import { SectionHeader, EmptyState, IconCell, SortableList, DetailTitle } from '@/components/manager';

import '@/wiki/css/image.css';
import '@/wiki/css/manager-common.css';
import '@/wiki/css/head-manager.css';

type Role = 'guest' | 'writer' | 'admin';

type Village = {
  id: number;
  name: string;
  icon: string;
  order: number;
  head_icon?: string | null;
  uploader?: string | null;     // ← 추가
};

type Head = {
  id: number;
  village_id: number;
  order: number;
  location_x: number;
  location_y: number;
  location_z: number;
  pictures: any;                // 서버가 문자열(JSON)로 줄 수 있어 any로
  uploader?: string | null;     // ← 추가
};

export default function HeadManager() {
  /** 유저 */
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

  // 권한/비교용
  const role: Role = user?.role === 'admin' ? 'admin' : user?.role === 'writer' ? 'writer' : 'guest';
  const isAdmin = role === 'admin';
  const isWriter = role === 'writer';
  const myName = (user?.minecraft_name ?? '').toLowerCase();

  const canDeleteVillage = (v: Village | null) =>
    !!v && (isAdmin || (isWriter && v.uploader?.toLowerCase?.() === myName));

  const canDeleteHead = (h: Head | null, v: Village | null) => {
    // head.uploader 우선, 없으면 같은 마을의 업로더와도 매칭 허용(구데이터 호환)
    const headUploader = h?.uploader?.toLowerCase?.();
    const villageUploader = v?.uploader?.toLowerCase?.();
    return !!h && (isAdmin || (isWriter && (headUploader === myName || villageUploader === myName)));
  };

  /** 상태 */
  const [villages, setVillages] = useState<Village[]>([]);
  const [selectedVillage, setSelectedVillage] = useState<Village | null>(null);

  const [headList, setHeadList] = useState<Head[]>([]);
  const [selectedHead, setSelectedHead] = useState<Head | null>(null);

  // 마을 추가
  const [villageModalOpen, setVillageModalOpen] = useState(false);
  const [villageName, setVillageName] = useState('');
  const [villageIcon, setVillageIcon] = useState('');
  const [villageHeadIcon, setVillageHeadIcon] = useState<string>('');
  const [imageModalOpen, setImageModalOpen] = useState(false);
  const [headIconModalOpen, setHeadIconModalOpen] = useState(false);

  // 마을 수정
  const [editVillageOpen, setEditVillageOpen] = useState(false);
  const [editingVillage, setEditingVillage] = useState<Village | null>(null);
  const [editVillageName, setEditVillageName] = useState('');
  const [editVillageIcon, setEditVillageIcon] = useState('');
  const [editVillageHeadIcon, setEditVillageHeadIcon] = useState<string>('');
  const [editImageModalOpen, setEditImageModalOpen] = useState(false);
  const [editHeadIconModalOpen, setEditHeadIconModalOpen] = useState(false);

  // 머리 추가/편집
  const [headModalOpen, setHeadModalOpen] = useState(false);
  const [tmpLoc, setTmpLoc] = useState<[number, number, number]>([0, 0, 0]);
  const [tmpPictures, setTmpPictures] = useState<string[]>([]);
  const [editLocOpen, setEditLocOpen] = useState(false);
  const [editPicOpen, setEditPicOpen] = useState(false);
  const [editLoc, setEditLoc] = useState<[number, number, number]>([0, 0, 0]);
  const [editPics, setEditPics] = useState<string[]>([]);

  // -----------------------------
  // FIX: 머리 리스트 스크롤 위치 유지
  // -----------------------------
  const listAreaRef = useRef<HTMLDivElement | null>(null);
  const pendingScrollTopRef = useRef<number | null>(null);

  const getHeadScrollEl = () => {
    // SortableList에 className="mgr-list"가 적용됨 (스크롤 컨테이너가 이 요소인 케이스가 대부분)
    const root = listAreaRef.current;
    if (!root) return null;

    // 1) 가장 우선: mgr-list 자체
    const list = root.querySelector('.mgr-list') as HTMLElement | null;
    if (list) return list;

    // 2) 혹시 스크롤이 list-area에 걸린 경우 대비
    return root as unknown as HTMLElement;
  };

  useLayoutEffect(() => {
    // selectedHead 변경 직후 저장해둔 scrollTop 복원
    const pending = pendingScrollTopRef.current;
    if (pending == null) return;

    const el = getHeadScrollEl();
    if (el) el.scrollTop = pending;

    pendingScrollTopRef.current = null;
  }, [selectedHead?.id]);

  /** 사진 배열 정규화: 배열 | JSON 문자열 | null 모두 처리 */
  const normalizePics = (pics: any): string[] => {
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

  /** 로딩 */
  useEffect(() => {
    fetch('/api/villages').then(r => r.json()).then(rows => setVillages(Array.isArray(rows) ? rows : []));
  }, []);

  useEffect(() => {
    if (!selectedVillage) {
      setHeadList([]); setSelectedHead(null);
      return;
    }
    fetch(`/api/head?village_id=${selectedVillage.id}`)
      .then(r => r.json())
      .then(rows => setHeadList(Array.isArray(rows) ? rows : []));
    setSelectedHead(null);
  }, [selectedVillage]);

  useEffect(() => {
    if (!selectedHead) return;
    setTmpLoc([selectedHead.location_x, selectedHead.location_y, selectedHead.location_z]);
    setTmpPictures(normalizePics(selectedHead.pictures));
  }, [selectedHead]);

  /** 메모 */
  const sortedVillages = useMemo(() => [...villages].sort((a, b) => a.order - b.order), [villages]);
  const sortedHeads = useMemo(() => [...headList].sort((a, b) => a.order - b.order), [headList]);

  /** 액션: 마을 */
  const handleAddVillage = useCallback(async () => {
    const maxOrder = villages.length ? Math.max(...villages.map(v => v.order)) : 0;
    await fetch('/api/villages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: villageName,
        icon: villageIcon,
        order: maxOrder + 1,
        head_icon: villageHeadIcon || null,
        uploader: user?.minecraft_name ?? undefined,   // ← 생성 시 업로더 저장
      }),
    });
    const rows = await fetch('/api/villages').then(r => r.json());
    setVillages(Array.isArray(rows) ? rows : []);
    setVillageModalOpen(false);
    setVillageName(''); setVillageIcon(''); setVillageHeadIcon('');
  }, [villages, villageIcon, villageName, villageHeadIcon, user?.minecraft_name]);

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
        head_icon: editVillageHeadIcon,
      });
    }
    setEditVillageOpen(false);
    setEditingVillage(null);
    setEditVillageName(''); setEditVillageIcon(''); setEditVillageHeadIcon('');
  }, [editingVillage, editVillageIcon, editVillageName, editVillageHeadIcon, selectedVillage]);

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
    setEditVillageName(''); setEditVillageIcon(''); setEditVillageHeadIcon('');
  }, [editingVillage, selectedVillage]);

  /** 액션: 머리 */
  const handleAddHead = useCallback(async () => {
    if (!selectedVillage) return;
    const maxOrder = headList.length ? Math.max(...headList.map(h => h.order)) : 0;
    await fetch('/api/head', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        village_id: selectedVillage.id,
        order: maxOrder + 1,
        location_x: tmpLoc[0],
        location_y: tmpLoc[1],
        location_z: tmpLoc[2],
        pictures: tmpPictures,
        uploader: user?.minecraft_name ?? undefined,   // ← 생성 시 업로더 저장
      }),
    });
    const rows = await fetch(`/api/head?village_id=${selectedVillage.id}`).then(r => r.json());
    setHeadList(Array.isArray(rows) ? rows : []);
    setHeadModalOpen(false);
    setTmpLoc([0, 0, 0]); setTmpPictures([]);
  }, [headList, selectedVillage, tmpLoc, tmpPictures, user?.minecraft_name]);

  const handleEditLoc = useCallback(async () => {
    if (!selectedHead) return;
    await fetch(`/api/head/${selectedHead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        village_id: selectedHead.village_id,
        order: selectedHead.order,
        location_x: editLoc[0],
        location_y: editLoc[1],
        location_z: editLoc[2],
        pictures: normalizePics(selectedHead.pictures),
      }),
    });
    const rows = await fetch(`/api/head?village_id=${selectedHead.village_id}`).then(r => r.json());
    setHeadList(Array.isArray(rows) ? rows : []);
    setSelectedHead((Array.isArray(rows) ? rows : []).find((h: Head) => h.id === selectedHead.id) ?? null);
    setEditLocOpen(false);
  }, [editLoc, selectedHead]);

  const handleEditPics = useCallback(async () => {
    if (!selectedHead) return;
    await fetch(`/api/head/${selectedHead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        village_id: selectedHead.village_id,
        order: selectedHead.order,
        location_x: selectedHead.location_x,
        location_y: selectedHead.location_y,
        location_z: selectedHead.location_z,
        pictures: editPics,
      }),
    });
    const rows = await fetch(`/api/head?village_id=${selectedHead.village_id}`).then(r => r.json());
    setHeadList(Array.isArray(rows) ? rows : []);
    setSelectedHead((Array.isArray(rows) ? rows : []).find((h: Head) => h.id === selectedHead.id) ?? null);
    setEditPicOpen(false);
  }, [editPics, selectedHead]);

  /** 정렬 저장 */
  const handleReorder = useCallback(async (reordered: Head[]) => {
    setHeadList(reordered);
    const prev = new Map(headList.map(h => [h.id, h.order]));
    const changed = reordered.filter(h => prev.get(h.id) !== h.order).map(h => ({ id: h.id, order: h.order }));
    if (!selectedVillage || changed.length === 0) return;

    try {
      const bulk = await fetch('/api/head/order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ village_id: selectedVillage.id, orders: changed }),
      });
      if (!bulk.ok) throw new Error('bulk-order-failed');
    } catch {
      const fresh = await fetch(`/api/head?village_id=${selectedVillage.id}`).then(r => r.json());
      setHeadList(Array.isArray(fresh) ? fresh : []);
    }
  }, [headList, selectedVillage]);

  /** 키보드 액세스 */
  const onKeyActivate =
    (fn: () => void) =>
      (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
      };

  /** 모달 열기: 사진 편집(열 때 즉시 동기화) */
  const openEditPics = useCallback(() => {
    if (!selectedHead) return;
    setEditPics(normalizePics(selectedHead.pictures));
    setEditPicOpen(true);
  }, [selectedHead]);

  /** 렌더 */
  return (
    <>
      <WikiHeader user={user} />

      {/* ───────── 마을 추가 ───────── */}
      <ModalCard
        open={villageModalOpen}
        onClose={() => setVillageModalOpen(false)}
        title="마을 추가"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setVillageModalOpen(false)}>취소</button>
            <button className="rd-btn primary" disabled={!villageName.trim() || !villageIcon.trim()} onClick={handleAddVillage}>추가</button>
          </>
        }
      >
        <div className="rd-field">
          <label className="rd-label">마을 이름</label>
          <input className="rd-input" placeholder="마을 이름" maxLength={40}
            value={villageName} onChange={(e) => setVillageName(e.target.value)} />
        </div>
        <div className="rd-field">
          <label className="rd-label">마을 아이콘</label>
          {/* 공통: 작은 입력 + 오른쪽 미리보기 */}
          <div className="mgr-icon-field">
            <div className="mgr-icon-inputs">
              <input
                className="rd-input rd-emoji-input"
                maxLength={2}
                value={villageIcon && !villageIcon.startsWith('http') ? villageIcon : ''}
                onChange={(e) => setVillageIcon(e.target.value)}
              />
              <button type="button" className="rd-btn secondary" onClick={() => setImageModalOpen(true)}>
                이미지 선택
              </button>
            </div>
            <div className="mgr-icon-preview">
              {villageIcon?.startsWith('http')
                ? <ManagedImage src={toProxyUrl(villageIcon)} alt="icon" loading="lazy" decoding="async" />
                : <span className="mgr-icon-placeholder">미리보기</span>}
            </div>
          </div>
        </div>
        <div className="rd-field">
          <label className="rd-label">머리 아이콘</label>
          <div className="mgr-icon-field">
            <div className="mgr-icon-inputs">
              <button type="button" className="rd-btn secondary" onClick={() => setHeadIconModalOpen(true)}>
                이미지 선택
              </button>
            </div>
            <div className="mgr-icon-preview">
              {villageHeadIcon?.startsWith('http')
                ? <ManagedImage src={toProxyUrl(villageHeadIcon)} alt="head_icon" loading="lazy" decoding="async" />
                : <span className="mgr-icon-placeholder">미리보기</span>}
            </div>
          </div>
        </div>

        <ImageSelectModal
          open={imageModalOpen}
          onClose={() => setImageModalOpen(false)}
          onSelectImage={(url) => { setVillageIcon(url); setImageModalOpen(false); }}
        />
        <ImageSelectModal
          open={headIconModalOpen}
          onClose={() => setHeadIconModalOpen(false)}
          onSelectImage={(url) => { setVillageHeadIcon(url); setHeadIconModalOpen(false); }}
        />
      </ModalCard>

      {/* ───────── 마을 정보 수정 ───────── */}
      <ModalCard
        open={editVillageOpen}
        onClose={() => {
          setEditVillageOpen(false);
          setEditingVillage(null);
          setEditVillageName(''); setEditVillageIcon(''); setEditVillageHeadIcon('');
        }}
        title="마을 정보 수정"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setEditVillageOpen(false)}>취소</button>
            <button className="rd-btn primary" disabled={!editVillageName.trim() || !editVillageIcon.trim()} onClick={handleEditVillage}>저장</button>
            <button
              className="rd-btn danger"
              onClick={handleDeleteVillage}
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
          <input className="rd-input" maxLength={40}
            value={editVillageName} onChange={(e) => setEditVillageName(e.target.value)} />
        </div>
        <div className="rd-field">
          <label className="rd-label">마을 아이콘</label>
          <div className="mgr-icon-field">
            <div className="mgr-icon-inputs">
              <input
                className="rd-input rd-emoji-input"
                maxLength={2}
                value={editVillageIcon && !editVillageIcon.startsWith('http') ? editVillageIcon : ''}
                onChange={(e) => setEditVillageIcon(e.target.value)}
              />
              <button type="button" className="rd-btn secondary" onClick={() => setEditImageModalOpen(true)}>
                이미지 선택
              </button>
            </div>
            <div className="mgr-icon-preview">
              {editVillageIcon?.startsWith('http')
                ? <ManagedImage src={toProxyUrl(editVillageIcon)} alt="icon" loading="lazy" decoding="async" />
                : <span className="mgr-icon-placeholder">미리보기</span>}
            </div>
          </div>
        </div>
        <div className="rd-field">
          <label className="rd-label">머리 아이콘</label>
          <div className="mgr-icon-field">
            <div className="mgr-icon-inputs">
              <button type="button" className="rd-btn secondary" onClick={() => setEditHeadIconModalOpen(true)}>
                이미지 선택
              </button>
            </div>
            <div className="mgr-icon-preview">
              {editVillageHeadIcon?.startsWith('http')
                ? <ManagedImage src={toProxyUrl(editVillageHeadIcon)} alt="head_icon" loading="lazy" decoding="async" />
                : <span className="mgr-icon-placeholder">미리보기</span>}
            </div>
          </div>
        </div>

        <ImageSelectModal
          open={editImageModalOpen}
          onClose={() => setEditImageModalOpen(false)}
          onSelectImage={(url) => { setEditVillageIcon(url); setEditImageModalOpen(false); }}
        />
        <ImageSelectModal
          open={editHeadIconModalOpen}
          onClose={() => setEditHeadIconModalOpen(false)}
          onSelectImage={(url) => { setEditVillageHeadIcon(url); setEditHeadIconModalOpen(false); }}
        />
      </ModalCard>

      {/* ───────── 머리 추가 ───────── */}
      <ModalCard
        open={headModalOpen}
        onClose={() => { setHeadModalOpen(false); setTmpLoc([0, 0, 0]); setTmpPictures([]); }}
        title="머리찾기 추가"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setHeadModalOpen(false)}>취소</button>
            <button className="rd-btn primary" disabled={tmpLoc.some(v => Number.isNaN(v))} onClick={handleAddHead}>추가</button>
          </>
        }
      >
        <div className="rd-field">
          <label className="rd-label">좌표</label>
          <div className="rd-coord-row">
            {(['X', 'Y', 'Z'] as const).map((label, i) => (
              <div key={label} className="rd-coord-item">
                <span className="rd-chip-label">{label}</span>
                <input
                  type="number"
                  inputMode="numeric"
                  className="rd-input rd-num"
                  value={Number.isNaN(tmpLoc[i]) ? '' : tmpLoc[i]}
                  onChange={(e) => {
                    const n = e.currentTarget.value === '' ? Number.NaN : e.currentTarget.valueAsNumber;
                    setTmpLoc(v => { const a = [...v] as [number, number, number]; a[i] = n; return a; });
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rd-field">
          <label className="mgr-modal-label">사진</label>
          <div className="rd-thumb-grid">
            {tmpPictures.length === 0 && <span className="rd-muted">등록된 사진이 없습니다.</span>}
            {tmpPictures.map((url, idx) => (
              <div key={url + idx} className="rd-thumb">
                <ManagedImage
                  src={toProxyUrl(url)}
                  alt={`head-tmp-${idx}`}
                  loading="lazy"
                  decoding="async"
                />
                <button
                  className="rd-thumb-x"
                  onClick={() => setTmpPictures(tmpPictures.filter((_, i) => i !== idx))}
                  title="삭제"
                >✕</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="rd-btn secondary" onClick={() => setImageModalOpen(true)}>
              + 사진 추가
            </button>
          </div>

          <ImageSelectModal
            open={imageModalOpen}
            onClose={() => setImageModalOpen(false)}
            onSelectImage={(url) => { setTmpPictures(arr => [...arr, url]); setImageModalOpen(false); }}
          />
        </div>
      </ModalCard>

      {/* ===== 3단 레이아웃 ===== */}
      <div className="mgr-container">
        {/* 좌: 마을 */}
        <div className="mgr-sidebar">
          <SectionHeader
            title="마을 목록"
            right={<button className="mgr-add-btn" onClick={() => setVillageModalOpen(true)}>+ 마을 추가</button>}
          />
          <ul className="head-village-list">
            {sortedVillages.map(v => (
              <li
                key={v.id}
                className={`head-village-item${selectedVillage?.id === v.id ? ' selected' : ''}`}
                onClick={() => setSelectedVillage(v)}
              >
                <span className="head-village-info">
                  <span className="head-village-icon"><IconCell icon={v.icon} /></span>
                  <span className="head-village-name">{v.name}</span>
                </span>
                <button
                  className="head-village-menu-btn"
                  onClick={(e) => { e.stopPropagation(); openEditVillage(v); }}
                  tabIndex={-1}
                  aria-label="마을 편집"
                  title="마을 정보 수정/삭제"
                >
                  ⋮
                </button>
              </li>
            ))}
          </ul>
        </div>

        {/* 중: 리스트 */}
        <div className="mgr-list-area" ref={listAreaRef}>
          <SectionHeader
            title={selectedVillage ? `${selectedVillage.name} 머리찾기` : '머리찾기 목록'}
            right={
              <button
                className="mgr-add-btn"
                disabled={!selectedVillage}
                onClick={() => setHeadModalOpen(true)}
                title={selectedVillage ? '' : '마을을 먼저 선택하세요'}
              >
                + 머리 추가
              </button>
            }
          />

          {!selectedVillage ? (
            <EmptyState>마을을 먼저 선택하세요.</EmptyState>
          ) : sortedHeads.length === 0 ? (
            <EmptyState>등록된 머리찾기가 없습니다.</EmptyState>
          ) : (
            <SortableList<Head>
              className="mgr-list"
              itemClassName="mgr-list-item"
              items={sortedHeads}
              selectedId={selectedHead?.id}
              onSelect={(it) => {
                // ✅ 선택 직전 현재 스크롤 위치를 저장
                const el = getHeadScrollEl();
                pendingScrollTopRef.current = el ? el.scrollTop : null;

                setSelectedHead(it);
              }}
              onReorder={handleReorder}
              useOverlay={false}
              renderItem={(h) => (
                <>
                  {selectedVillage?.head_icon
                    ? <IconCell icon={selectedVillage.head_icon} className="mgr-icon-img" size={22} rounded={5} />
                    : <span className="mgr-w-22" />}
                  <span className="mgr-order">{h.order}.</span>
                  <span className="head-list-coord">( {h.location_x}, {h.location_y}, {h.location_z} )</span>
                </>
              )}
            />
          )}
        </div>

        {/* 우: 상세 */}
        <div className="mgr-detail-area">
          {selectedHead ? (
            <div>
              {/* 우측 상단 툴바: 삭제 버튼(권한 반영) */}
              <div className="toolbar-seg mgr-detail-actions">
                <button
                  type="button"
                  className="seg-btn danger"
                  onClick={async () => {
                    if (!selectedHead) return;
                    if (!canDeleteHead(selectedHead, selectedVillage)) {
                      alert('본인이 만든 항목만 삭제할 수 있습니다.');
                      return;
                    }
                    if (!window.confirm('이 항목을 삭제할까요?')) return;
                    const res = await fetch(`/api/head/${selectedHead.id}`, { method: 'DELETE' });
                    if (!res.ok) {
                      const d = await res.json().catch(() => ({}));
                      alert(d?.error || '삭제 실패');
                      return;
                    }
                    if (selectedVillage) {
                      const rows = await fetch(`/api/head?village_id=${selectedVillage.id}`).then(r => r.json());
                      setHeadList(Array.isArray(rows) ? rows : []);
                    }
                    setSelectedHead(null);
                  }}
                  title={canDeleteHead(selectedHead, selectedVillage) ? '삭제' : '본인이 만든 항목만 삭제 가능'}
                  aria-label="머리찾기 삭제"
                  disabled={!canDeleteHead(selectedHead, selectedVillage)}
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
                  selectedVillage?.head_icon
                    ? <IconCell icon={selectedVillage.head_icon} size={40} rounded={8} />
                    : <span className="head-fallback-icon">🧭</span>
                }
                title={<span className="head-detail-title">{selectedHead.order}번 머리</span>}
                showEditButtons={false}
              />

              {/* 좌표 */}
              <div
                className="mgr-pill-row"
                role="button"
                tabIndex={0}
                onClick={() => setEditLocOpen(true)}
                onKeyDown={onKeyActivate(() => setEditLocOpen(true))}
              >
                <span className="mgr-pill-label">좌표</span>
                <span className="mgr-pill-value">
                  <span className="head-detail-coord">
                    ( {selectedHead.location_x}, {selectedHead.location_y}, {selectedHead.location_z} )
                  </span>
                </span>
              </div>

              {/* 사진 */}
              <div
                className="mgr-pill-row"
                role="button"
                tabIndex={0}
                onClick={openEditPics}
                onKeyDown={onKeyActivate(openEditPics)}
              >
                <span className="mgr-pill-label">사진</span>
                <span className="mgr-pill-value">
                  {normalizePics(selectedHead.pictures).length ? (
                    normalizePics(selectedHead.pictures).slice(0, 6).map((url, i) => (
                      <ManagedImage
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
            <EmptyState>머리찾기 대상을 선택하세요.</EmptyState>
          )}
        </div>
      </div>

      {/* ───────── 좌표 수정 ───────── */}
      <ModalCard
        open={editLocOpen}
        onClose={() => setEditLocOpen(false)}
        title="좌표 수정"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setEditLocOpen(false)}>취소</button>
            <button className="rd-btn primary" disabled={editLoc.some(v => Number.isNaN(v))} onClick={handleEditLoc}>저장</button>
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
                  className="rd-input rd-num"
                  value={Number.isNaN(editLoc[i]) ? '' : editLoc[i]}
                  onChange={(e) => {
                    const n = e.currentTarget.value === '' ? Number.NaN : e.currentTarget.valueAsNumber;
                    setEditLoc(v => { const a = [...v] as [number, number, number]; a[i] = n; return a; });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      </ModalCard>

      {/* ───────── 사진 수정 ───────── */}
      <ModalCard open={editPicOpen} onClose={() => setEditPicOpen(false)} title="사진 수정" width={420}>
        <div className="mgr-modal-body">
          <div className="rd-thumb-grid">
            {editPics.length === 0 && <span className="rd-muted">등록된 사진이 없습니다.</span>}
            {editPics.map((url, idx) => (
              <div key={url + idx} className="rd-thumb">
                <ManagedImage
                  src={toProxyUrl(url)}
                  alt={`head-pic-${idx}`}
                  loading="lazy"
                  decoding="async"
                />
                <button
                  className="rd-thumb-x"
                  onClick={() => setEditPics(editPics.filter((_, i) => i !== idx))}
                  title="삭제"
                >✕</button>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="button" className="rd-btn secondary" onClick={() => setImageModalOpen(true)}>
              + 사진 추가
            </button>
          </div>

          <div className="mgr-btn-row">
            <button className="mgr-btn mgr-btn-secondary" onClick={() => setEditPicOpen(false)}>취소</button>
            <button className="mgr-btn mgr-btn-primary" onClick={handleEditPics}>저장</button>
          </div>

          <ImageSelectModal
            open={imageModalOpen}
            onClose={() => setImageModalOpen(false)}
            onSelectImage={(url) => { setEditPics(arr => [...arr, url]); setImageModalOpen(false); }}
          />
        </div>
      </ModalCard>
    </>
  );
}
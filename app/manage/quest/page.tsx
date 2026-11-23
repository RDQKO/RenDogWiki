// File: app/manage/quest/page.tsx
'use client';
import ManagedImage from '@/components/common/ManagedImage';


import { useEffect, useMemo, useState, useCallback } from 'react';
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
import '@/wiki/css/quest-manager.css';

type Role = 'guest' | 'writer' | 'admin';

const ALLOWED_TAGS = [
  '추천','필수','완정','보스','타임어택','기사단','극난퀘','혼의 시련','6차',
] as const;
type TagKey = typeof ALLOWED_TAGS[number];

type Village = {
  id: number;
  name: string;
  icon: string;
  order: number;
  head_icon?: string | null;
  uploader?: string | null;
};

type QuestReward = { icon: string; text: string };

type Npc = {
  id: number;
  name: string;
  village_id: number;
  icon: string;
  order: number;
  rewards?: QuestReward[];
  requirement: string | null;
  line: string | null;
  location_x: number;
  location_y: number;
  location_z: number;
  quest: string;
  npc_type: string;
  pictures?: string[];
  uploader?: string | null;
  tag?: string | null;
};

export default function QuestNpcManager() {
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    fetch('/api/auth/me')
    .then((r) => (r.ok ? r.json() : null))
    .then((d) =>
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
  const [villageName, setVillageName] = useState('');
  const [villageIcon, setVillageIcon] = useState<string>('');
  const [imageModalOpen, setImageModalOpen] = useState(false);

  const [npcModalOpen, setNpcModalOpen] = useState(false);
  const [npcName, setNpcName] = useState('');

  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editIconOpen, setEditIconOpen] = useState(false);
  const [editLocOpen, setEditLocOpen] = useState(false);
  const [editLineOpen, setEditLineOpen] = useState(false);
  const [editQuestOpen, setEditQuestOpen] = useState(false);
  const [editRewardOpen, setEditRewardOpen] = useState(false);
  const [editRequirementOpen, setEditRequirementOpen] = useState(false);

  const [tmpName, setTmpName] = useState('');
  const [tmpLoc, setTmpLoc] = useState<[number, number, number]>([0, 0, 0]);
  const [tmpLine, setTmpLine] = useState('');
  const [tmpQuest, setTmpQuest] = useState('');
  const [tmpRewards, setTmpRewards] = useState<QuestReward[]>([]);
  const [editRewardImgModalIdx, setEditRewardImgModalIdx] = useState<number | null>(null);
  const [tmpRequirement, setTmpRequirement] = useState('');
  const [npcPictures, setNpcPictures] = useState<string[]>([]);
  const [picturesModalOpen, setPicturesModalOpen] = useState(false);
  const [addPictureModalOpen, setAddPictureModalOpen] = useState(false);

  const [editVillageOpen, setEditVillageOpen] = useState(false);
  const [editingVillage, setEditingVillage] = useState<Village | null>(null);
  const [editVillageName, setEditVillageName] = useState('');
  const [editVillageIcon, setEditVillageIcon] = useState('');
  const [editVillageHeadIcon, setEditVillageHeadIcon] = useState<string>('');
  const [editImageModalOpen, setEditImageModalOpen] = useState(false);
  const [editHeadIconModalOpen, setEditHeadIconModalOpen] = useState(false);

  const [tmpTag, setTmpTag] = useState<TagKey | null>(null);

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
  const normalizeRewards = (rw: any): QuestReward[] => {
    if (Array.isArray(rw)) return [...rw];
    if (rw == null) return [];
    if (typeof rw === 'string') {
      try {
        const v = JSON.parse(rw);
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    }
    return [];
  };

  useEffect(() => {
    fetch('/api/villages')
      .then((r) => r.json())
      .then((rows) => setVillages(Array.isArray(rows) ? rows : []));
  }, []);

  const reloadQuestList = useCallback(async (villageId: number) => {
    const rows = await fetch(
      `/api/npcs?village_id=${villageId}&npc_type=quest&nocache=1`
    ).then((r) => r.json());

    setNpcList(Array.isArray(rows) ? rows : []);
    return Array.isArray(rows) ? rows : [];
  }, []);

  useEffect(() => {
    if (!selectedVillage) {
      setNpcList([]);
      setSelectedNpc(null);
      return;
    }
    reloadQuestList(selectedVillage.id).then(() => setSelectedNpc(null));
  }, [selectedVillage, reloadQuestList]);

  useEffect(() => {
    if (!selectedNpc) return;
    setTmpName(selectedNpc.name);
    setTmpLoc([selectedNpc.location_x, selectedNpc.location_y, selectedNpc.location_z]);
    setTmpLine(selectedNpc.line || '');
    setTmpQuest(selectedNpc.quest || '');
    setTmpRewards(normalizeRewards(selectedNpc.rewards));
    setTmpRequirement(selectedNpc.requirement || '');
    setNpcPictures(normalizePictures(selectedNpc.pictures));
    const t = (selectedNpc as any).tag ?? null;
    setTmpTag((ALLOWED_TAGS as readonly string[]).includes(t) ? (t as TagKey) : null);
  }, [selectedNpc]);

  const handleAddVillage = useCallback(async () => {
    const maxOrder = villages.length ? Math.max(...villages.map((v) => v.order)) : 0;
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
    const rows = await fetch('/api/villages').then((r) => r.json());
    setVillages(Array.isArray(rows) ? rows : []);
    setVillageModalOpen(false);
    setVillageName('');
    setVillageIcon('');
  }, [villageIcon, villageName, villages, user?.minecraft_name]);

  const handleAddNpc = useCallback(async () => {
    if (!selectedVillage) return;
    const maxOrder = npcList.length ? Math.max(...npcList.map((n) => n.order)) : 0;
    await fetch('/api/npcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: npcName,
        village_id: selectedVillage.id,
        icon: '📜',
        order: maxOrder + 1,
        reward: null,
        reward_icon: null,
        requirement: null,
        line: null,
        location_x: 0,
        location_y: 0,
        location_z: 0,
        quest: '',
        npc_type: 'quest',
        uploader: user?.minecraft_name ?? undefined,
      }),
    });
    await reloadQuestList(selectedVillage.id);
    setNpcModalOpen(false);
    setNpcName('');
  }, [npcList, npcName, selectedVillage, reloadQuestList, user?.minecraft_name]);

  const patchNpc = useCallback(
    async (fields: Partial<Npc>) => {
      if (!selectedNpc) return;

      const res = await fetch(`/api/npcs/${selectedNpc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...fields, npc_type: 'quest' }),
      });

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d?.error || 'PATCH failed');
      }

      // ✅ 서버가 반환한 "최신 row"로 로컬 상태를 직접 갱신
      const updated = (await res.json()) as Npc;

      setSelectedNpc(updated);
      setNpcList((prev) => prev.map((n) => (n.id === updated.id ? { ...n, ...updated } : n)));
    },
    [selectedNpc]
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
    const rows = await fetch('/api/villages').then((r) => r.json());
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
  }, [editingVillage, editVillageIcon, editVillageName, editVillageHeadIcon, selectedVillage]);

  const handleDeleteVillage = useCallback(async () => {
    if (!editingVillage) return;
    if (!canDeleteVillage(editingVillage)) {
      alert('본인이 만든 마을만 삭제할 수 있습니다.');
      return;
    }
    if (!window.confirm('정말 이 마을을 삭제하시겠습니까?')) return;
    await fetch(`/api/villages/${editingVillage.id}`, { method: 'DELETE' });
    const rows = await fetch('/api/villages').then((r) => r.json());
    setVillages(Array.isArray(rows) ? rows : []);
    if (selectedVillage && selectedVillage.id === editingVillage.id) setSelectedVillage(null);
    setEditVillageOpen(false);
    setEditingVillage(null);
    setEditVillageName('');
    setEditVillageIcon('');
    setEditVillageHeadIcon('');
  }, [editingVillage, selectedVillage]);

  const handleDeleteNpc = useCallback(async () => {
    if (!selectedNpc) return;
    if (!canDeleteNpc(selectedNpc)) {
      alert('본인이 만든 퀘스트만 삭제할 수 있습니다.');
      return;
    }
    if (!window.confirm(`'${selectedNpc.name}' 퀘스트를 삭제할까요?`)) return;
    const res = await fetch(`/api/npcs/${selectedNpc.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d?.error || '삭제 실패');
      return;
    }
    if (selectedVillage) await reloadQuestList(selectedVillage.id);
    setSelectedNpc(null);
  }, [selectedNpc, selectedVillage, reloadQuestList]);

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
      const prev = new Map(npcList.map((n) => [n.id, n.order]));
      const changed = reordered
        .filter((n) => prev.get(n.id) !== n.order)
        .map((n) => ({ id: n.id, order: n.order }));
      if (!selectedVillage || changed.length === 0) return;
      try {
        const res = await fetch('/api/npcs/order', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            village_id: selectedVillage.id,
            npc_type: 'quest',
            orders: changed,
          }),
        });
        if (!res.ok) throw new Error('bulk-order-failed');
      } catch {
        await reloadQuestList(selectedVillage.id);
      }
    },
    [npcList, selectedVillage, reloadQuestList]
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
            onChange={(e) => setVillageName(e.target.value)}
            aria-label="마을 이름 입력"
          />
        </div>

        <div className="rd-field">
          <label className="rd-label">마을 아이콘</label>
          <div className="mgr-icon-field">
            <div className="mgr-icon-inputs">
              <input
                className="rd-input rd-emoji-input"
                placeholder=""
                maxLength={2}
                value={villageIcon && !villageIcon.startsWith('http') ? villageIcon : ''}
                onChange={(e) => setVillageIcon(e.target.value)}
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
                <ManagedImage
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
          onSelectImage={(url) => {
            setVillageIcon(url);
            setImageModalOpen(false);
          }}
        />
      </ModalCard>

      <ModalCard
        open={npcModalOpen}
        onClose={() => setNpcModalOpen(false)}
        title="퀘스트 NPC 추가"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setNpcModalOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              disabled={!npcName.trim()}
              onClick={handleAddNpc}
              aria-label="퀘스트 추가"
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
            onChange={(e) => setNpcName(e.target.value)}
            aria-label="NPC 이름 입력"
          />
        </div>
      </ModalCard>

      <div className="mgr-container">
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
            {sortedVillages.map((v) => (
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
                  onClick={(e) => {
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

        <div className="mgr-list-area">
          <SectionHeader
            title={
              selectedVillage ? (
                <span className="mgr-title-inline">
                  <IconCell icon={selectedVillage.icon} size={18} rounded={4} />
                  <span>{selectedVillage.name}</span>
                </span>
              ) : (
                '퀘스트 목록'
              )
            }
            right={
              <button
                className="mgr-add-btn"
                disabled={!selectedVillage}
                onClick={() => setNpcModalOpen(true)}
                title={selectedVillage ? '' : '마을을 먼저 선택하세요'}
                aria-label="퀘스트 추가"
              >
                + 퀘스트 추가
              </button>
            }
          />
          {!selectedVillage ? (
            <EmptyState>마을을 먼저 선택하세요.</EmptyState>
          ) : sortedNpcList.length === 0 ? (
            <EmptyState>해당 마을에 등록된 퀘스트가 없습니다.</EmptyState>
          ) : (
            <SortableList<Npc>
              className="mgr-list"
              itemClassName="mgr-list-item"
              items={sortedNpcList}
              selectedId={selectedNpc?.id}
              onSelect={(it) => setSelectedNpc(it)}
              onReorder={handleReorder}
              useOverlay={false}
              renderItem={(n) => (
                <>
                  <span className="mgr-order">{n.order}.</span>
                  <IconCell icon={n.icon} className="mgr-icon-img" size={22} rounded={5} />
                  <span className="mgr-name">{n.name}</span>
                </>
              )}
            />
          )}
        </div>

        <div className="mgr-detail-area">
          {selectedNpc ? (
            <div>
              <div className="toolbar-seg mgr-detail-actions">
                <button
                  type="button"
                  className="seg-btn danger"
                  onClick={handleDeleteNpc}
                  title={canDeleteNpc(selectedNpc) ? '삭제' : '본인이 만든 항목만 삭제 가능'}
                  aria-label="퀘스트 삭제"
                  disabled={!canDeleteNpc(selectedNpc)}
                >
                  <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9.75 9.75v6.75M14.25 9.75v6.75M4.5 7.5h15M9 4.5h6m-8.25 3L7.5 19.5a2.25 2.25 0 002.25 2.25h4.5A2.25 2.25 0 0016.5 19.5L18.75 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <span className="seg-label">삭제</span>
                </button>
              </div>

              <DetailTitle
                icon={
                  selectedNpc.icon?.startsWith('http') ? (
                    <IconCell icon={selectedNpc.icon} className="quest-detail-img" size={48} rounded={10} />
                  ) : (
                    <span className="quest-detail-icon">{selectedNpc.icon || '📜'}</span>
                  )
                }
                title={<span className="quest-detail-title">{selectedNpc.name}</span>}
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
                title="위치 수정"
                aria-label="위치 수정"
              >
                <span className="mgr-pill-label">위치</span>
                <span className="mgr-pill-value">
                  <span className="quest-detail-loc">
                    ( {selectedNpc.location_x}, {selectedNpc.location_y}, {selectedNpc.location_z} )
                  </span>
                </span>
              </div>

              <div
                className="mgr-pill-row"
                role="button"
                tabIndex={0}
                onClick={() => setEditQuestOpen(true)}
                onKeyDown={onKeyActivate(() => setEditQuestOpen(true))}
                title="퀘스트 내용 수정"
                aria-label="퀘스트 내용 수정"
              >
                <span className="mgr-pill-label">퀘스트</span>
                <span className="mgr-pill-value">
                  {selectedNpc.quest?.trim() ? selectedNpc.quest : <span className="mgr-placeholder">-</span>}
                </span>
              </div>

              <div
                className="mgr-pill-row"
                role="button"
                tabIndex={0}
                onClick={() => setEditRewardOpen(true)}
                onKeyDown={onKeyActivate(() => setEditRewardOpen(true))}
                title="보상 수정"
                aria-label="보상 수정"
              >
                <span className="mgr-pill-label">보상</span>
                <span className="mgr-pill-value">
                  {Array.isArray(selectedNpc.rewards) && selectedNpc.rewards.length > 0 ? (
                    selectedNpc.rewards.map((rw, i) => (
                      <span key={i} className="mgr-chip">
                        {rw.icon ? (
                          rw.icon.startsWith('http') ? (
                            <ManagedImage src={toProxyUrl(rw.icon)} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className="mgr-chip-emoji">{rw.icon}</span>
                          )
                        ) : null}
                        <span>{rw.text}</span>
                      </span>
                    ))
                  ) : (
                    <span className="mgr-placeholder">-</span>
                  )}
                </span>
              </div>

              <div
                className="mgr-pill-row"
                role="button"
                tabIndex={0}
                onClick={() => setEditRequirementOpen(true)}
                onKeyDown={onKeyActivate(() => setEditRequirementOpen(true))}
                title="선행퀘스트 수정"
                aria-label="선행퀘스트 수정"
              >
                <span className="mgr-pill-label">선행퀘스트</span>
                <span className="mgr-pill-value">
                  {selectedNpc.requirement?.trim() ? selectedNpc.requirement : <span className="mgr-placeholder">-</span>}
                </span>
              </div>

              <div
                className="mgr-pill-row"
                role="button"
                tabIndex={0}
                onClick={() => setPicturesModalOpen(true)}
                onKeyDown={onKeyActivate(() => setPicturesModalOpen(true))}
                title="사진 관리"
                aria-label="사진 관리"
              >
                <span className="mgr-pill-label">사진</span>
                <span className="mgr-pill-value">
                  {npcPictures && npcPictures.length > 0 ? (
                    npcPictures.slice(0, 6).map((url, idx) => (
                      <ManagedImage
                        key={url + idx}
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

              <div
                className="mgr-pill-row mgr-pill-row--multi"
                role="button"
                tabIndex={0}
                onClick={() => setEditLineOpen(true)}
                onKeyDown={onKeyActivate(() => setEditLineOpen(true))}
                title="대사 수정"
                aria-label="대사 수정"
              >
                <span className="mgr-pill-label">대사</span>
                <span className="mgr-pill-value">
                  {selectedNpc.line?.trim() ? selectedNpc.line : <span className="mgr-placeholder">- 대사 없음 -</span>}
                </span>
              </div>

              {/* ✅ 태그 스위치 (즉시 저장) */}
              <div className="mgr-pill-row" role="radiogroup" aria-label="태그 선택">
                <span className="mgr-pill-label">태그</span>
                <span className="mgr-pill-value tag-seg">
                  {[null, ...ALLOWED_TAGS].map((key) => {
                    const label = key ?? '없음';
                    const active = tmpTag === key;
                    return (
                      <button
                        key={label}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        className={`seg-choice${active ? ' active' : ''}`}
                        onClick={async () => {
                          const next = key as TagKey | null;
                          const prev = tmpTag;

                          // ✅ 먼저 UI 반영
                          setTmpTag(next);

                          try {
                            await patchNpc({ tag: next ?? null });
                          } catch (e) {
                            // ✅ 실패하면 원복 + 알림
                            setTmpTag(prev);
                            alert('태그 저장 실패: 서버 반영이 되지 않았습니다.');
                          }
                        }}
                      >
                        {label}
                      </button>
                    );
                  })}
                </span>
              </div>
            </div>
          ) : (
            <EmptyState>퀘스트를 선택하세요.</EmptyState>
          )}
        </div>
      </div>

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
          onChange={(e) => setTmpName(e.target.value)}
          aria-label="NPC 이름 입력"
        />
      </ModalCard>

      <ImageSelectModal
        open={editIconOpen}
        onClose={() => setEditIconOpen(false)}
        onSelectImage={async (url) => {
          await patchNpc({ icon: url });
          setEditIconOpen(false);
        }}
      />

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
              disabled={tmpLoc.some((v) => Number.isNaN(v))}
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
            <div className="rd-coord-item">
              <span className="rd-chip-label">X</span>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                className="rd-input rd-num"
                value={Number.isNaN(tmpLoc[0]) ? '' : tmpLoc[0]}
                onChange={(e) => {
                  const n = e.currentTarget.value === '' ? Number.NaN : e.currentTarget.valueAsNumber;
                  setTmpLoc(([_, y, z]) => [n, y, z]);
                }}
              />
            </div>
            <div className="rd-coord-item">
              <span className="rd-chip-label">Y</span>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                className="rd-input rd-num"
                value={Number.isNaN(tmpLoc[1]) ? '' : tmpLoc[1]}
                onChange={(e) => {
                  const n = e.currentTarget.value === '' ? Number.NaN : e.currentTarget.valueAsNumber;
                  setTmpLoc(([x, _, z]) => [x, n, z]);
                }}
              />
            </div>
            <div className="rd-coord-item">
              <span className="rd-chip-label">Z</span>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                className="rd-input rd-num"
                value={Number.isNaN(tmpLoc[2]) ? '' : tmpLoc[2]}
                onChange={(e) => {
                  const n = e.currentTarget.value === '' ? Number.NaN : e.currentTarget.valueAsNumber;
                  setTmpLoc(([x, y, _]) => [x, y, n]);
                }}
              />
            </div>
          </div>
        </div>
      </ModalCard>

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
          onChange={(e) => setTmpLine(e.target.value)}
          maxLength={600}
          aria-label="대사 입력"
        />
      </ModalCard>

      <ModalCard
        open={editQuestOpen}
        onClose={() => setEditQuestOpen(false)}
        title="퀘스트 내용 수정"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setEditQuestOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              onClick={async () => {
                await patchNpc({ quest: tmpQuest });
                setEditQuestOpen(false);
              }}
              aria-label="퀘스트 저장"
            >
              저장
            </button>
          </>
        }
      >
        <div className="rd-field">
          <label className="rd-label">퀘스트 내용</label>
          <div className="rd-textarea-wrap">
            <textarea
              className="rd-textarea"
              value={tmpQuest}
              onChange={(e) => setTmpQuest(e.target.value)}
              maxLength={400}
              rows={6}
              placeholder="예) 슬라임볼 50개 획득"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  (async () => {
                    await patchNpc({ quest: tmpQuest });
                    setEditQuestOpen(false);
                  })();
                }
              }}
              aria-label="퀘스트 내용 입력"
            />
          </div>
        </div>
      </ModalCard>

      <ModalCard open={editRewardOpen} onClose={() => setEditRewardOpen(false)} title="보상 수정">
        <div className="mgr-modal-body">
          <label className="mgr-modal-label">보상 목록</label>
          <div className="rw-list">
            {tmpRewards.map((reward, idx) => (
              <div key={idx} className="rw-row">
                <button
                  type="button"
                  className="rw-icon-btn"
                  onClick={() => setEditRewardImgModalIdx(idx)}
                  title="아이콘 선택"
                  aria-label={`보상 ${idx + 1} 아이콘 선택`}
                >
                  {reward.icon ? (
                    reward.icon.startsWith('http') ? (
                      <ManagedImage
                        src=  {toProxyUrl(reward.icon)}
                        alt=""
                        className="rw-icon-img"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="rw-icon-emoji">{reward.icon}</span>
                    )
                  ) : (
                    <svg className="rw-icon-placeholder" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="5" width="18" height="14" rx="2" />
                      <path d="M3 15l4-4 3 3 5-5 6 6" />
                      <path d="M12 8v4M10 10h4" />
                    </svg>
                  )}
                </button>
                <input
                  className="mgr-input rw-input"
                  placeholder="보상 내용"
                  maxLength={60}
                  value={reward.text}
                  onChange={(e) => {
                    const copy = tmpRewards.slice();
                    copy[idx].text = e.target.value;
                    setTmpRewards(copy);
                  }}
                />
                <button
                  type="button"
                  className="rw-del-btn"
                  onClick={() => setTmpRewards(tmpRewards.filter((_, i) => i !== idx))}
                  aria-label="보상 삭제"
                  title="삭제"
                >
                  <svg className="ico-trash" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M3 6h18" />
                    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                    <path d="M10 11v6M14 11v6" />
                    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          <button type="button" className="rw-add-btn" onClick={() => setTmpRewards([...tmpRewards, { icon: '', text: '' }])}>
            보상 추가
            <span className="rw-add-iconwrap" aria-hidden="true">
              <svg className="rw-plus" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
          </button>
          <div className="mgr-btn-row">
            <button className="mgr-btn mgr-btn-secondary" onClick={() => setEditRewardOpen(false)}>
              취소
            </button>
            <button
              className="mgr-btn mgr-btn-primary"
              onClick={async () => {
                await patchNpc({ rewards: tmpRewards });
                setEditRewardOpen(false);
              }}
            >
              수정
            </button>
          </div>
          <ImageSelectModal
            open={editRewardImgModalIdx !== null}
            onClose={() => setEditRewardImgModalIdx(null)}
            onSelectImage={(url) => {
              if (editRewardImgModalIdx === null) return;
              const idx = editRewardImgModalIdx;
              const copy = tmpRewards.slice();
              copy[idx].icon = url;
              setTmpRewards(copy);
              setEditRewardImgModalIdx(null);
            }}
          />
        </div>
      </ModalCard>

      <ModalCard
        open={editRequirementOpen}
        onClose={() => setEditRequirementOpen(false)}
        title="선행퀘스트 수정"
        actions={
          <>
            <button className="rd-btn secondary" onClick={() => setEditRequirementOpen(false)}>
              취소
            </button>
            <button
              className="rd-btn primary"
              onClick={async () => {
                await patchNpc({ requirement: tmpRequirement });
                setEditRequirementOpen(false);
              }}
              aria-label="선행퀘스트 수정 저장"
            >
              수정
            </button>
          </>
        }
      >
        <input
          className="rd-input"
          value={tmpRequirement}
          maxLength={200}
          onChange={(e) => setTmpRequirement(e.target.value)}
          aria-label="선행퀘스트 입력"
        />
      </ModalCard>

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
              <ManagedImage
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
          onSelectImage={(url) => {
            if (!npcPictures.includes(url)) setNpcPictures([...npcPictures, url]);
            setAddPictureModalOpen(false);
          }}
        />
      </ModalCard>

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
            onChange={(e) => setEditVillageName(e.target.value)}
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
                value={editVillageIcon && !editVillageIcon.startsWith('http') ? editVillageIcon : ''}
                onChange={(e) => setEditVillageIcon(e.target.value)}
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
                <ManagedImage
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
                <ManagedImage
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
          onSelectImage={(url) => {
            setEditVillageIcon(url);
            setEditImageModalOpen(false);
          }}
        />
        <ImageSelectModal
          open={editHeadIconModalOpen}
          onClose={() => setEditHeadIconModalOpen(false)}
          onSelectImage={(url) => {
            setEditVillageHeadIcon(url);
            setEditHeadIconModalOpen(false);
          }}
        />
      </ModalCard>
    </>
  );
}

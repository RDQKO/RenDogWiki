'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ModalCard } from '@/components/common/Modal';
import ManagedImage from '@/components/common/ManagedImage';
import { useRefreshImageReplacements } from './ImageReplacementProvider';
import { cdn } from '@lib/cdn';
import styles from './ImageReplaceModal.module.css';

type ImageRow = { id: number; name: string; url: string; s3_key: string; revision: number };
type Version = { id: number; name: string; url: string; s3_key: string; created_at: string };
type Data = { image: ImageRow; versions: Version[] };

export default function ImageReplaceModal({ imageId, onClose, onChanged }: {
  imageId: number | null; onClose: () => void; onChanged: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [version, setVersion] = useState<Version | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputId = useId();
  const loadController = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const refresh = useRefreshImageReplacements();
  const lock = useRef(false);

  useEffect(() => () => { mounted.current = false; loadController.current?.abort(); }, []);
  const load = useCallback(async () => {
    if (!imageId) return;
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/image/replace?id=${imageId}`, { cache: 'no-store', signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status === 401 ? '다시 로그인한 후 이용해 주세요.' : result.error || '이미지를 불러오지 못했습니다.');
      if (!controller.signal.aborted) { setData(result); setConflict(false); setConfirmed(false); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '이미지를 불러오지 못했습니다.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [imageId]);
  useEffect(() => {
    mounted.current = true;
    setData(null); setFile(null); setVersion(null); setConfirmed(false); setConflict(false); setError('');
    void load();
    return () => loadController.current?.abort();
  }, [load]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const select = (files: File[]) => {
    if (busy || loading) return;
    if (files.length !== 1) { setError('이미지 파일 하나를 선택해 주세요.'); return; }
    const next = files[0];
    if (!next.size || next.size > 3.9 * 1024 * 1024) { setError('3.9MB 이하의 이미지 파일을 선택해 주세요.'); return; }
    setFile(next); setVersion(null); setConfirmed(false); setError('');
  };

  const submit = async () => {
    if (!data || (!file && !version) || !confirmed || conflict || loading || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const body = new FormData();
      body.set('id', String(data.image.id)); body.set('expectedRevision', String(data.image.revision));
      if (file) body.set('file', file);
      const response = await fetch('/api/image/replace', version ? {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: data.image.id, expectedRevision: data.image.revision, versionId: version.id }),
      } : { method: 'POST', body });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 409) setConflict(true);
        throw new Error(response.status === 401 ? '다시 로그인한 후 이용해 주세요.' : result.error || '이미지 변경에 실패했습니다.');
      }
      await refresh(true);
      if (mounted.current) { onChanged(); onClose(); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : '이미지 변경에 실패했습니다.'); }
    finally { lock.current = false; if (mounted.current) setBusy(false); }
  };

  return <ModalCard open={imageId !== null} onClose={() => { if (!lock.current) onClose(); }} title="이미지 교체" width={680}
    actions={<>
      <button type="button" className="rd-btn" disabled={busy} onClick={onClose}>취소</button>
      <button type="button" className="rd-btn primary" disabled={busy || loading || conflict || !data || (!file && !version) || !confirmed} onClick={() => void submit()}>
        {busy ? '변경 중…' : version ? '선택 버전으로 복원' : '이미지 교체'}
      </button>
    </>}>
    <div className={styles.content} aria-busy={busy || loading}>
      <p>이 이미지를 사용하는 모든 문서와 아이콘에 적용됩니다. 문서의 크기·정렬 설정은 유지됩니다.</p>
      {loading ? <p role="status">현재 이미지와 변경 이력을 불러오는 중…</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {conflict || (!loading && !data) ? <button type="button" className="rd-btn" disabled={busy} onClick={() => void load()}>최신 상태 다시 불러오기</button> : null}
      {data ? <>
        <p><strong>{data.image.name}</strong></p>
        <div className={styles.previews}>
          <figure><figcaption>현재 이미지</figcaption><ManagedImage resolveReplacements={false} src={cdn(data.image.url)} alt="현재 이미지" /></figure>
          <figure><figcaption>{version ? '복원할 이미지' : '교체할 이미지'}</figcaption>
            {preview || version ? <ManagedImage resolveReplacements={false} src={preview || cdn(version!.url)} alt="교체할 이미지 미리보기" /> : <span>새 파일을 선택해 주세요.</span>}
          </figure>
        </div>
        <label htmlFor={inputId} className={`${styles.drop} ${dragOver ? styles.dragOver : ''}`}
          onDragOver={event => { event.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={event => { event.preventDefault(); event.stopPropagation(); setDragOver(false); select(Array.from(event.dataTransfer.files)); }}>
          파일 선택 또는 이미지 한 개 끌어놓기 · 최대 3.9MB
          <input id={inputId} type="file" accept="image/*" disabled={busy || loading} onChange={event => {
            select(Array.from(event.currentTarget.files || [])); event.currentTarget.value = '';
          }} />
        </label>
        {file ? <p>{file.name} · {(file.size / 1024).toFixed(1)}KB</p> : null}
        <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={busy || conflict} onChange={event => setConfirmed(event.target.checked)} /> 모든 사용 위치에 적용하는 것을 확인했습니다.</label>
        {data.versions.length ? <details><summary>이전 이미지 보기·복원 (최근 100개)</summary>
          <ul className={styles.history}>{data.versions.map(item => <li key={item.id}>
            <ManagedImage resolveReplacements={false} src={cdn(item.url)} alt={item.name} width={48} height={48} />
            <span>{item.name}<small>{new Date(item.created_at).toLocaleString('ko-KR')}</small></span>
            {item.s3_key === data.image.s3_key ? <span>현재 사용 중</span> : <button type="button" className="rd-btn" disabled={busy} onClick={() => {
              setVersion(item); setFile(null); setConfirmed(false); setError('');
            }}>복원 선택</button>}
          </li>)}</ul>
        </details> : null}
      </> : null}
    </div>
  </ModalCard>;
}

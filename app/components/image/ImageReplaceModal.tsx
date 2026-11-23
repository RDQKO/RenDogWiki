'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { ModalCard } from '@/components/common/Modal';
import ManagedImage from '@/components/common/ManagedImage';
import { useRefreshImageReplacements } from './ImageReplacementProvider';
import { cdn } from '@lib/cdn';
import { IMAGE_STYLES, IMAGE_STYLE_LABELS, type ImageStyle } from '@lib/imageReplacements';
import styles from './ImageReplaceModal.module.css';

type ImageRow = { id: number; name: string; url: string; s3_key: string; revision: number };
type Variant = { style: ImageStyle; name: string; url: string; s3_key: string };
type Data = { image: ImageRow; variants: Variant[] };

export default function ImageReplaceModal({ imageId, mode = 'replace', onClose, onChanged }: {
  imageId: number | null; mode?: 'replace' | 'assign'; onClose: () => void; onChanged: () => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState('');
  const [style, setStyle] = useState<ImageStyle>(mode === 'assign' ? 'vanilla' : '2d');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
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
      if (!controller.signal.aborted) { setData(result); setConflict(false); }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '이미지를 불러오지 못했습니다.');
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [imageId]);
  useEffect(() => {
    mounted.current = true;
    setData(null); setFile(null); setStyle(mode === 'assign' ? 'vanilla' : '2d'); setConflict(false); setError('');
    void load();
    return () => loadController.current?.abort();
  }, [load, mode]);
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
    setFile(next); setError('');
  };

  const submit = async () => {
    if (!data || !file || conflict || loading || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const body = new FormData();
      body.set('id', String(data.image.id)); body.set('expectedRevision', String(data.image.revision));
      body.set('style', style);
      body.set('file', file!);
      const response = await fetch('/api/image/replace', { method: 'POST', body });
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

  const currentImage = style === '2d' ? data?.image : data?.variants?.find(item => item.style === style);
  const styleLabel = IMAGE_STYLE_LABELS[style];

  return <ModalCard open={imageId !== null} onClose={() => { if (!lock.current) onClose(); }} title={mode === 'assign' ? '추가 이미지 할당' : '이미지 교체'} width={520}
    actions={<>
      <button type="button" className="rd-btn secondary" disabled={busy} onClick={onClose}>취소</button>
      <button type="button" className="rd-btn primary" disabled={busy || loading || conflict || !data || !file} onClick={() => void submit()}>
        {busy ? '변경 중…' : mode === 'assign' ? '이미지 할당' : '이미지 교체'}
      </button>
    </>}>
    <div className={styles.content} aria-busy={busy || loading}>
      <p>이 이미지를 사용하는 모든 문서와 아이콘에 적용됩니다.<br />문서의 크기·정렬 설정은 유지됩니다.</p>
      {mode === 'assign' ? <p className={styles.hint}>선택한 종류의 이미지를 연결합니다.<br />할당하지 않은 종류는 기본 2D 이미지로 표시됩니다.</p> : null}
      {loading ? <p role="status">현재 이미지를 불러오는 중…</p> : null}
      {error ? <p role="alert" className={styles.error}>{error}</p> : null}
      {conflict || (!loading && !data) ? <button type="button" className="rd-btn" disabled={busy} onClick={() => void load()}>최신 상태 다시 불러오기</button> : null}
      {data ? <>
        <p><strong>{data.image.name}</strong></p>
        <div className={styles.tabs} role="group" aria-label="변경할 이미지 종류">
          {IMAGE_STYLES.filter(value => mode !== 'assign' || value !== '2d').map(value => <button type="button" key={value}
            className="rd-btn" aria-pressed={style === value} disabled={busy || loading} onClick={() => { setStyle(value); setFile(null); setError(''); }}>
            {IMAGE_STYLE_LABELS[value]}{value === '2d' || data.variants?.some(item => item.style === value) ? ' · 할당됨' : ' · 미할당'}
          </button>)}
        </div>
        <label htmlFor={inputId} className={`custum-file-upload ${dragOver ? 'dragover' : ''}`}
          role="button" tabIndex={busy || loading ? -1 : 0} aria-disabled={busy || loading}
          onKeyDown={event => {
            if (event.target !== event.currentTarget || busy || loading) return;
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inputRef.current?.click(); }
          }}
          onDragOver={event => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; if (!busy) setDragOver(true); }}
          onDragEnter={event => { event.preventDefault(); if (!busy) setDragOver(true); }}
          onDragLeave={event => {
            event.preventDefault();
            if (!event.relatedTarget || !event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false);
          }}
          onDrop={event => { event.preventDefault(); event.stopPropagation(); setDragOver(false); select(Array.from(event.dataTransfer.files)); }}>
          <div className="icon" aria-hidden="true">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
              <path d="M10 1c-.265 0-.52.105-.707.293L3.293 7.293A1 1 0 003 8v12a3 3 0 003 3h1a1 1 0 100-2H6a1 1 0 01-1-1V9h5a1 1 0 001-1V3h7a1 1 0 011 1v5a1 1 0 102 0V4a3 3 0 00-3-3h-8zM9 7H6.414L9 4.414V7zm5 8.5A2.5 2.5 0 0116.5 13 2.5 2.5 0 0119 15.5V17h1a2 2 0 110 4h-7a2 2 0 110-4h1v-1.5zM16.5 11a4.5 4.5 0 00-4.484 4.122C10.283 15.56 9 17.13 9 19a4 4 0 004 4h7a4 4 0 000-8h-.016A4.5 4.5 0 0016.5 11z" />
            </svg>
          </div>
          <div className="text"><span>{`클릭 또는 드래그하여 ${styleLabel} 이미지 선택`}</span></div>
          <input id={inputId} ref={inputRef} type="file" accept="image/*" disabled={busy || loading} onChange={event => {
            select(Array.from(event.currentTarget.files || [])); event.currentTarget.value = '';
          }} />
        </label>
        {file ? <div className="rd-upload-filelist">
          <div className="rd-upload-file">
            <div className="name" title={file.name}>{file.name}</div>
            <div className="size">{file.size < 1024 ? `${file.size} B` : `${(file.size / 1024).toFixed(1)} KB`}</div>
            <button type="button" className="remove" aria-label="선택 파일 제거" disabled={busy} onClick={() => { setFile(null); setError(''); }}>✕</button>
          </div>
        </div> : null}
        <div className={styles.previews}>
          <figure><figcaption>현재 {styleLabel} 이미지</figcaption>{currentImage ? <ManagedImage resolveReplacements={false} src={cdn(currentImage.url)} alt="현재 이미지" /> : <span>아직 할당되지 않았습니다.</span>}</figure>
          <figure><figcaption>새 {styleLabel} 이미지</figcaption>
            {preview ? <ManagedImage resolveReplacements={false} src={preview} alt="교체할 이미지 미리보기" /> : <span>새 파일을 선택해 주세요.</span>}
          </figure>
        </div>
        <p className={styles.hint}>이미지 한 개 · 최대 3.9MB</p>

      </> : null}
    </div>
  </ModalCard>;
}

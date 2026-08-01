// =============================================
// File: app/components/image/ImageUploadModal.tsx
// 전체 교체용 코드
//
// 수정 목적:
// - 업로드 모달에서 파일을 선택하거나 드롭해도 파일 목록이 갱신되지 않고
//   업로드 버튼이 활성화되지 않는 문제 수정
// - 공용 Modal.tsx 및 이미지 관리 페이지는 변경하지 않음
// =============================================
'use client';

import {
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from 'react';

import { ModalCard } from '@/components/common/Modal';

type ImageFile = {
  id: number;
  name: string;
  url: string;
  folder_id: number;
  mime_type?: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
  folderId: number | null;
  onUploaded: (images: ImageFile[]) => void;
};

const MAX_BATCH_BYTES = 3.5 * 1024 * 1024;
const SINGLE_FILE_LIMIT_BYTES = 3.9 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  'apng',
  'avif',
  'bmp',
  'gif',
  'heic',
  'heif',
  'ico',
  'jfif',
  'jpeg',
  'jpg',
  'png',
  'svg',
  'tif',
  'tiff',
  'webp',
  'm4v',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'ogg',
  'ogv',
  'webm',
]);

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;

  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function getExtension(fileName: string) {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex < 0) return '';

  return fileName.slice(dotIndex + 1).toLowerCase();
}

/**
 * 일부 브라우저·운영체제 조합에서는 로컬 파일의 MIME 타입이 빈 문자열로
 * 전달될 수 있으므로 MIME 타입과 확장자를 함께 검사한다.
 */
function isAcceptedFile(file: File) {
  if (
    file.type.startsWith('image/') ||
    file.type.startsWith('video/')
  ) {
    return true;
  }

  return ALLOWED_EXTENSIONS.has(getExtension(file.name));
}

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export default function ImageUploadModal({
  open,
  onClose,
  folderId,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [selectionError, setSelectionError] = useState('');

  const addFiles = (incoming: File[]) => {
    const accepted = incoming.filter(isAcceptedFile);

    if (accepted.length === 0) {
      setSelectionError(
        '선택한 파일을 이미지 또는 영상으로 인식하지 못했습니다.',
      );
      return;
    }

    setSelectionError('');

    setFiles((previous) => {
      const previousKeys = new Set(previous.map(fileKey));
      const additions: File[] = [];

      for (const file of accepted) {
        const key = fileKey(file);
        if (previousKeys.has(key)) continue;

        previousKeys.add(key);
        additions.push(file);
      }

      if (additions.length === 0) return previous;

      return [...previous, ...additions];
    });
  };

  /**
   * 파일 선택창에서 선택한 파일을 즉시 상태에 반영한다.
   * input 값을 바로 비워 같은 파일을 다시 골라도 이벤트가 발생하게 한다.
   */
  const consumeInputFiles = (
    event:
      | ChangeEvent<HTMLInputElement>
      | FormEvent<HTMLInputElement>,
  ) => {
    const input = event.currentTarget;
    const selected = Array.from(input.files ?? []);

    input.value = '';

    if (selected.length === 0) return;
    addFiles(selected);
  };

  const openFilePicker = () => {
    if (loading) return;

    inputRef.current?.click();
  };

  const handleDropZoneKeyDown = (
    event: KeyboardEvent<HTMLDivElement>,
  ) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    event.preventDefault();
    openFilePicker();
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    setDragOver(false);

    const dropped = Array.from(event.dataTransfer.files ?? []);
    if (dropped.length === 0) return;

    addFiles(dropped);
  };

  const handleDragEnter = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(true);
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    event.dataTransfer.dropEffect = 'copy';
    setDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const relatedTarget = event.relatedTarget as Node | null;

    if (
      relatedTarget == null ||
      !event.currentTarget.contains(relatedTarget)
    ) {
      setDragOver(false);
    }
  };

  const handleRemove = (target: File) => {
    const targetKey = fileKey(target);

    setFiles((previous) =>
      previous.filter((file) => fileKey(file) !== targetKey),
    );
  };

  const handleClear = () => {
    setFiles([]);
    setSelectionError('');

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleClose = () => {
    if (loading) return;

    handleClear();
    setDragOver(false);
    setProgressText('');
    onClose();
  };

  const buildBatches = (list: File[]) => {
    const batches: File[][] = [];
    let currentBatch: File[] = [];
    let currentBytes = 0;

    for (const file of list) {
      if (file.size > SINGLE_FILE_LIMIT_BYTES) {
        if (currentBatch.length > 0) {
          batches.push(currentBatch);
          currentBatch = [];
          currentBytes = 0;
        }

        batches.push([file]);
        continue;
      }

      if (
        currentBatch.length > 0 &&
        currentBytes + file.size > MAX_BATCH_BYTES
      ) {
        batches.push(currentBatch);
        currentBatch = [file];
        currentBytes = file.size;
        continue;
      }

      currentBatch.push(file);
      currentBytes += file.size;
    }

    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  };

  const uploadBatch = async (
    batch: File[],
    batchIndex: number,
    batchCount: number,
  ) => {
    if (folderId == null) {
      throw new Error('업로드할 폴더를 선택하세요.');
    }

    if (
      batch.length === 1 &&
      batch[0].size > SINGLE_FILE_LIMIT_BYTES
    ) {
      throw new Error(
        `파일이 너무 큽니다: ${batch[0].name} (${formatSize(batch[0].size)})\n` +
          '현재 환경에서 요청 크기 제한(약 4MB) 때문에 업로드가 막힐 수 있습니다.\n' +
          '파일을 4MB 미만으로 줄인 뒤 다시 시도하세요.',
      );
    }

    setProgressText(
      `업로드 중... (${batchIndex + 1}/${batchCount})`,
    );

    const form = new FormData();
    batch.forEach((file) => form.append('files', file));
    form.append('folder_id', String(folderId));

    const response = await fetch('/api/image/upload', {
      method: 'POST',
      body: form,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || '업로드 실패');
    }

    return (data.images as ImageFile[]) || [];
  };

  const handleUpload = async () => {
    if (files.length === 0) return;

    if (folderId == null) {
      alert('업로드할 폴더를 선택하세요.');
      return;
    }

    setLoading(true);
    setProgressText('');

    try {
      const batches = buildBatches(files);
      const allUploaded: ImageFile[] = [];

      for (let index = 0; index < batches.length; index += 1) {
        const uploaded = await uploadBatch(
          batches[index],
          index,
          batches.length,
        );

        allUploaded.push(...uploaded);
      }

      handleClear();
      setProgressText('');

      if (allUploaded.length > 0) {
        onUploaded(allUploaded);
      }

      onClose();
    } catch (error: unknown) {
      setProgressText('');

      alert(
        error instanceof Error
          ? error.message
          : '네트워크 오류로 업로드에 실패했습니다.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalCard
      open={open}
      onClose={handleClose}
      title="이미지·영상 업로드"
      width={520}
    >
      <div
        className={`custum-file-upload ${
          dragOver ? 'dragover' : ''
        }`}
        role="button"
        tabIndex={loading ? -1 : 0}
        aria-disabled={loading}
        onClick={openFilePicker}
        onKeyDown={handleDropZoneKeyDown}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="icon" aria-hidden="true">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path d="M10 1c-.265 0-.52.105-.707.293L3.293 7.293A1 1 0 003 8v12a3 3 0 003 3h1a1 1 0 100-2H6a1 1 0 01-1-1V9h5a1 1 0 001-1V3h7a1 1 0 011 1v5a1 1 0 102 0V4a3 3 0 00-3-3h-8zM9 7H6.414L9 4.414V7zm5 8.5A2.5 2.5 0 0116.5 13 2.5 2.5 0 0119 15.5V17h1a2 2 0 110 4h-7a2 2 0 110-4h1v-1.5zM16.5 11a4.5 4.5 0 00-4.484 4.122C10.283 15.56 9 17.13 9 19a4 4 0 004 4h7a4 4 0 000-8h-.016A4.5 4.5 0 0016.5 11z" />
          </svg>
        </div>

        <div className="text">
          <span>클릭 또는 드래그하여 이미지/영상 업로드</span>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onInput={consumeInputFiles}
          onChange={consumeInputFiles}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {selectionError ? (
        <p
          role="alert"
          style={{
            margin: '10px 0 0',
            fontSize: 13,
            color: '#c2410c',
          }}
        >
          {selectionError}
        </p>
      ) : null}

      {files.length > 0 ? (
        <div className="rd-upload-filelist">
          {files.map((file) => (
            <div
              key={fileKey(file)}
              className="rd-upload-file"
            >
              <div className="name" title={file.name}>
                {file.name}
              </div>
              <div className="size">
                {formatSize(file.size)}
              </div>
              <button
                type="button"
                className="remove"
                onClick={() => handleRemove(file)}
                aria-label={`${file.name} 제거`}
                disabled={loading}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="rd-upload-tools">
            <button
              type="button"
              className="rd-btn secondary"
              onClick={handleClear}
              disabled={loading}
            >
              전체 비우기
            </button>
          </div>
        </div>
      ) : null}

      {progressText ? (
        <div
          role="status"
          aria-live="polite"
          style={{
            marginTop: 10,
            fontSize: 13,
            opacity: 0.9,
          }}
        >
          {progressText}
        </div>
      ) : null}

      <div
        className="rd-card-button-wrapper"
        style={{ justifyContent: 'flex-end' }}
      >
        <button
          type="button"
          className="rd-btn secondary"
          onClick={handleClose}
          disabled={loading}
        >
          취소
        </button>

        <button
          type="button"
          className="rd-btn primary"
          onClick={() => void handleUpload()}
          disabled={
            loading ||
            files.length === 0 ||
            folderId == null
          }
        >
          {loading ? '업로드 중...' : '업로드'}
        </button>
      </div>
    </ModalCard>
  );
}

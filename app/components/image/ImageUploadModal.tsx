// =============================================
// File: app/components/image/ImageUploadModal.tsx
// 전체 교체용 코드
//
// 기존 업로드 모달 UI와 업로드 API 흐름은 유지하고,
// 파일 선택·드롭 후 목록과 업로드 버튼이 갱신되지 않는 문제 수정
//
// 핵심:
// - 선택된 File 객체를 MIME 판정으로 조용히 폐기하지 않음
// - 모달 인스턴스마다 고유한 file input id 사용
// - 같은 이름·크기의 서로 다른 파일도 lastModified로 구분
// - 여러 파일은 파일당 독립 요청으로 업로드
// - 최대 2개 요청만 동시에 처리
// - 성공한 파일은 제거하고 실패한 파일만 재시도 목록에 유지
// =============================================
'use client';

import { useId, useRef, useState } from "react";
import { ModalCard } from "@/components/common/Modal";

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

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * Vercel 요청 바디 제한을 고려한 단일 파일 제한
 */
const SINGLE_FILE_LIMIT_BYTES =
  3.9 * 1024 * 1024;

/**
 * 파일별 독립 요청을 동시에 너무 많이 실행하지 않도록 제한
 */
const UPLOAD_CONCURRENCY = 2;

function fileKey(file: File) {
  return [
    file.name,
    file.size,
    file.lastModified,
    file.type,
  ].join(":");
}

export default function ImageUploadModal({
  open,
  onClose,
  folderId,
  onUploaded,
}: Props) {
  const inputId = useId();
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [progressText, setProgressText] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * 파일 배열 병합
   *
   * input의 accept 속성은 탐색기 필터 역할만 한다.
   * 브라우저·운영체제가 MIME을 빈 문자열이나 예상 밖 값으로 넘겨도
   * 실제로 전달된 File 객체는 상태에서 조용히 버리지 않는다.
   */
  const addFiles = (incoming: File[]) => {
    if (incoming.length === 0) return;

    setFiles((previousFiles) => {
      const existingKeys = new Set(
        previousFiles.map(fileKey),
      );
      const additions: File[] = [];

      for (const file of incoming) {
        const key = fileKey(file);

        if (existingKeys.has(key)) {
          continue;
        }

        existingKeys.add(key);
        additions.push(file);
      }

      if (additions.length === 0) {
        return previousFiles;
      }

      return [
        ...previousFiles,
        ...additions,
      ];
    });
  };

  /**
   * 파일 선택창에서 선택한 파일 처리
   */
  const handleSelect = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const selectedFiles = Array.from(
      event.currentTarget.files ?? [],
    );

    if (selectedFiles.length > 0) {
      addFiles(selectedFiles);
    }

    /**
     * 같은 파일을 다시 선택해도 change 이벤트가 발생하도록 초기화
     */
    event.currentTarget.value = "";
  };

  /**
   * 드래그 앤 드롭 파일 처리
   */
  const handleDrop = (
    event: React.DragEvent<HTMLLabelElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);

    const droppedFiles = Array.from(
      event.dataTransfer.files ?? [],
    );

    if (droppedFiles.length > 0) {
      addFiles(droppedFiles);
    }
  };

  const handleRemove = (file: File) => {
    const targetKey = fileKey(file);

    setFiles((previousFiles) =>
      previousFiles.filter(
        (previousFile) =>
          fileKey(previousFile) !== targetKey,
      ),
    );
  };

  const handleClear = () => {
    setFiles([]);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleClose = () => {
    if (loading) return;

    handleClear();
    setDragOver(false);
    setProgressText("");
    onClose();
  };

  const uploadSingleFile = async (
    file: File,
  ): Promise<ImageFile[]> => {
    if (folderId == null) {
      throw new Error(
        "업로드할 폴더를 선택하세요.",
      );
    }

    if (
      file.size >
      SINGLE_FILE_LIMIT_BYTES
    ) {
      throw new Error(
        `파일이 너무 큽니다: ${file.name} (${formatSize(file.size)})\n` +
          "현재 환경에서 요청 크기 제한(약 4MB) 때문에 업로드할 수 없습니다.\n" +
          "파일을 4MB 미만으로 줄인 뒤 다시 시도하세요.",
      );
    }

    const form =
      new FormData();

    form.append(
      "files",
      file,
    );

    form.append(
      "folder_id",
      String(folderId),
    );

    const response =
      await fetch(
        "/api/image/upload",
        {
          method: "POST",
          body: form,
        },
      );

    const data =
      await response
        .json()
        .catch(
          () => ({}),
        );

    if (!response.ok) {
      throw new Error(
        data?.error ||
          `업로드 실패 (${response.status})`,
      );
    }

    const images =
      Array.isArray(
        data?.images,
      )
        ? data.images as ImageFile[]
        : [];

    if (
      images.length === 0
    ) {
      throw new Error(
        "서버가 업로드 결과를 반환하지 않았습니다.",
      );
    }

    return images;
  };

  const handleUpload = async () => {
    if (!files.length) {
      return;
    }

    if (folderId == null) {
      alert(
        "업로드할 폴더를 선택하세요.",
      );
      return;
    }

    const oversized =
      files.filter(
        (file) =>
          file.size >
          SINGLE_FILE_LIMIT_BYTES,
      );

    if (
      oversized.length > 0
    ) {
      const names =
        oversized
          .slice(0, 5)
          .map(
            (file) =>
              `${file.name} (${formatSize(file.size)})`,
          )
          .join("\n");

      alert(
        "4MB를 넘는 파일이 포함되어 있습니다.\n\n" +
          names +
          (
            oversized.length > 5
              ? `\n외 ${oversized.length - 5}개`
              : ""
          ) +
          "\n\n해당 파일의 크기를 줄인 뒤 다시 시도하세요.",
      );
      return;
    }

    setLoading(true);
    setProgressText(
      `업로드 준비 중... (0/${files.length})`,
    );

    const uploadTargets =
      [...files];

    const uploadedRows:
      ImageFile[] = [];

    const successfulKeys =
      new Set<string>();

    const failures: {
      file: File;
      message: string;
    }[] = [];

    let cursor = 0;
    let completed = 0;

    const runWorker =
      async () => {
        while (true) {
          const targetIndex =
            cursor;

          cursor += 1;

          if (
            targetIndex >=
            uploadTargets.length
          ) {
            return;
          }

          const file =
            uploadTargets[
              targetIndex
            ];

          try {
            const rows =
              await uploadSingleFile(
                file,
              );

            uploadedRows.push(
              ...rows,
            );

            successfulKeys.add(
              fileKey(file),
            );
          } catch (
            error: unknown
          ) {
            failures.push({
              file,
              message:
                error instanceof
                Error
                  ? error.message
                  : "네트워크 오류",
            });
          } finally {
            completed += 1;

            setProgressText(
              `업로드 중... (${completed}/${uploadTargets.length})`,
            );
          }
        }
      };

    try {
      const workerCount =
        Math.min(
          UPLOAD_CONCURRENCY,
          uploadTargets.length,
        );

      await Promise.all(
        Array.from(
          {
            length:
              workerCount,
          },
          () =>
            runWorker(),
        ),
      );

      if (
        uploadedRows.length >
        0
      ) {
        onUploaded(
          uploadedRows,
        );
      }

      if (
        failures.length === 0
      ) {
        handleClear();
        setProgressText("");
        onClose();
        return;
      }

      /*
       * 이미 성공한 파일은 목록에서 제거하고,
       * 실패한 파일만 남겨 다시 업로드할 수 있게 한다.
       */
      setFiles(
        uploadTargets.filter(
          (file) =>
            !successfulKeys.has(
              fileKey(file),
            ),
        ),
      );

      setProgressText(
        `${uploadedRows.length}개 성공, ${failures.length}개 실패`,
      );

      const failureLines =
        failures
          .slice(0, 8)
          .map(
            ({ file, message }) =>
              `• ${file.name}: ${message}`,
          )
          .join("\n");

      alert(
        `${uploadedRows.length}개는 정상적으로 업로드되었습니다.\n` +
          `${failures.length}개는 실패하여 목록에 남겨두었습니다.\n\n` +
          failureLines +
          (
            failures.length > 8
              ? `\n외 ${failures.length - 8}개`
              : ""
          ),
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
      <label
        htmlFor={inputId}
        className={`custum-file-upload ${
          dragOver ? "dragover" : ""
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();

          const nextTarget =
            event.relatedTarget as Node | null;

          if (
            nextTarget == null ||
            !event.currentTarget.contains(
              nextTarget,
            )
          ) {
            setDragOver(false);
          }
        }}
        onDrop={handleDrop}
      >
        <div className="icon" aria-hidden>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
          >
            <path d="M10 1c-.265 0-.52.105-.707.293L3.293 7.293A1 1 0 003 8v12a3 3 0 003 3h1a1 1 0 100-2H6a1 1 0 01-1-1V9h5a1 1 0 001-1V3h7a1 1 0 011 1v5a1 1 0 102 0V4a3 3 0 00-3-3h-8zM9 7H6.414L9 4.414V7zm5 8.5A2.5 2.5 0 0116.5 13 2.5 2.5 0 0119 15.5V17h1a2 2 0 110 4h-7a2 2 0 110-4h1v-1.5zM16.5 11a4.5 4.5 0 00-4.484 4.122C10.283 15.56 9 17.13 9 19a4 4 0 004 4h7a4 4 0 000-8h-.016A4.5 4.5 0 0016.5 11z" />
          </svg>
        </div>

        <div className="text">
          <span>
            클릭 또는 드래그하여 이미지/영상 업로드
          </span>
        </div>

        <input
          id={inputId}
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          onChange={handleSelect}
        />
      </label>

      {!!files.length && (
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
                aria-label="제거"
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
      )}

      {!!progressText && (
        <div
          style={{
            marginTop: 10,
            fontSize: 13,
            opacity: 0.9,
          }}
        >
          {progressText}
        </div>
      )}

      <div
        className="rd-card-button-wrapper"
        style={{ justifyContent: "flex-end" }}
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
            !files.length ||
            folderId == null
          }
        >
          {loading ? "업로드 중..." : "업로드"}
        </button>
      </div>
    </ModalCard>
  );
}

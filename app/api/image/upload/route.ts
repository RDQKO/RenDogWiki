// =============================================
// File: app/api/image/upload/route.ts
//
// 이미지·영상 업로드 API
//
// 다중 업로드 안정화:
// - Vercel Hobby 함수 실행 시간을 최대 60초로 설정
// - 클라이언트는 파일당 독립 요청을 사용
// - 기존 다중 files 요청도 최대 2개씩 처리
// - DB 저장 실패 시 S3 객체를 정리
// - 활동 로그 실패가 업로드 성공을 취소하지 않음
// =============================================

import {
  NextRequest,
  NextResponse,
} from 'next/server';

import {
  sql,
} from '@/wiki/lib/db';

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

import {
  getAuthUser,
} from '@/wiki/lib/auth';

import {
  logActivity,
  resolveFolderName,
} from '@wiki/lib/activity';

import {
  requireRole,
} from '@/wiki/lib/requireRole';

import sharp from 'sharp';
import crypto from 'crypto';

// @ts-ignore
import ffmpeg from 'fluent-ffmpeg';

// @ts-ignore
import ffmpegStatic from 'ffmpeg-static';

// @ts-ignore
import ffprobeStatic from 'ffprobe-static';

import os from 'os';
import path from 'path';

import {
  promises as fs,
} from 'fs';

(ffmpeg as any).setFfmpegPath(
  ffmpegStatic as unknown as string,
);

(ffmpeg as any).setFfprobePath(
  (ffprobeStatic as any).path as string,
);

export const runtime =
  'nodejs';

export const revalidate = 0;

export const dynamic =
  'force-dynamic';

/**
 * Vercel Hobby 기본값은 10초이므로
 * 이미지 변환과 S3 업로드가 완료될 시간을 확보한다.
 */
export const maxDuration = 60;

const MAX_DIM = Number(
  process.env
    .WIKI_IMAGE_MAX_DIM ||
    1600,
);

const QUALITY = Number(
  process.env
    .WIKI_IMAGE_QUALITY ||
    80,
);

const TARGET_MB = Number(
  process.env
    .WIKI_VIDEO_TARGET_MB ||
    4,
);

const MAX_WIDTH = Number(
  process.env
    .WIKI_VIDEO_MAX_WIDTH ||
    720,
);

const AUDIO_K = Number(
  process.env
    .WIKI_VIDEO_AUDIO_K ||
    64,
);

const CACHE_CONTROL =
  'public, max-age=31536000, immutable';

const SERVER_CONCURRENCY = 2;

const IMAGE_EXTENSIONS =
  new Set([
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
  ]);

const VIDEO_EXTENSIONS =
  new Set([
    'avi',
    'm4v',
    'mkv',
    'mov',
    'mp4',
    'mpeg',
    'mpg',
    'ogg',
    'ogv',
    'webm',
  ]);

type ProcessedFile = {
  buffer: Buffer;
  mime: string;
  ext: string;
  usedOriginal: boolean;
};

type UploadedRow = {
  id: number;
  name: string;
  folder_id: number;
  uploader?: string | null;
  s3_key?: string | null;
  url: string;
  mime_type?: string | null;
  [key: string]: unknown;
};

type UploadFailure = {
  name: string;
  error: string;
};

function getSafeExt(
  filename: string,
) {
  const dot =
    filename.lastIndexOf('.');

  const ext =
    dot >= 0
      ? filename.slice(
          dot + 1,
        )
      : '';

  return ext
    .replace(
      /[^a-zA-Z0-9]/g,
      '',
    )
    .slice(0, 10)
    .toLowerCase();
}

function isImageFile(
  file: File,
) {
  const type =
    (
      file.type ||
      ''
    ).toLowerCase();

  return (
    type.startsWith(
      'image/',
    ) ||
    IMAGE_EXTENSIONS.has(
      getSafeExt(
        file.name,
      ),
    )
  );
}

function isVideoFile(
  file: File,
) {
  const type =
    (
      file.type ||
      ''
    ).toLowerCase();

  return (
    type.startsWith(
      'video/',
    ) ||
    VIDEO_EXTENSIONS.has(
      getSafeExt(
        file.name,
      ),
    )
  );
}

function sha1Short(
  buffer: Buffer,
) {
  return crypto
    .createHash('sha1')
    .update(buffer)
    .digest('hex')
    .slice(0, 10);
}

function buildKey(
  folderId: number,
  ext: string,
  hint?: string,
) {
  const now =
    Date.now();

  const random =
    Math.random()
      .toString(36)
      .slice(2, 9);

  const suffix =
    hint
      ? `${hint}_${random}`
      : random;

  return (
    `images/${folderId}/` +
    `${now}_${suffix}.${ext}`
  );
}

function buildS3PublicUrl(
  bucket: string,
  key: string,
) {
  const encodedKey =
    key
      .split('/')
      .map(
        encodeURIComponent,
      )
      .join('/');

  const publicBaseUrl =
    process.env
      .S3_PUBLIC_BASE_URL
      ?.replace(
        /\/+$/,
        '',
      );

  if (publicBaseUrl) {
    return (
      `${publicBaseUrl}/` +
      encodedKey
    );
  }

  const region =
    process.env
      .AWS_REGION ||
    'us-east-1';

  if (
    region ===
    'us-east-1'
  ) {
    return (
      `https://${bucket}.s3.amazonaws.com/` +
      encodedKey
    );
  }

  return (
    `https://${bucket}.s3.${region}.amazonaws.com/` +
    encodedKey
  );
}

async function processImageIfNeeded(
  file: File,
): Promise<ProcessedFile> {
  const originalBuffer =
    Buffer.from(
      await file.arrayBuffer(),
    );

  const originalMime =
    file.type ||
    'application/octet-stream';

  const originalExt =
    getSafeExt(
      file.name,
    ) ||
    'bin';

  if (
    !isImageFile(file)
  ) {
    return {
      buffer:
        originalBuffer,
      mime:
        originalMime,
      ext:
        originalExt,
      usedOriginal:
        true,
    };
  }

  if (
    originalMime ===
      'image/svg+xml' ||
    originalExt ===
      'svg'
  ) {
    return {
      buffer:
        originalBuffer,
      mime:
        'image/svg+xml',
      ext:
        'svg',
      usedOriginal:
        true,
    };
  }

  let metadata:
    sharp.Metadata | null =
    null;

  try {
    metadata =
      await sharp(
        originalBuffer,
        {
          animated: true,
        },
      ).metadata();
  } catch {
    return {
      buffer:
        originalBuffer,
      mime:
        originalMime,
      ext:
        originalExt,
      usedOriginal:
        true,
    };
  }

  if (
    metadata.format ===
      'gif' &&
    (
      metadata.pages ||
      0
    ) > 1
  ) {
    return {
      buffer:
        originalBuffer,
      mime:
        'image/gif',
      ext:
        'gif',
      usedOriginal:
        true,
    };
  }

  if (
    originalBuffer
      .byteLength <
    40 * 1024
  ) {
    return {
      buffer:
        originalBuffer,
      mime:
        originalMime,
      ext:
        originalExt,
      usedOriginal:
        true,
    };
  }

  try {
    const webpBuffer =
      await sharp(
        originalBuffer,
        {
          animated: false,
        },
      )
        .rotate()
        .resize({
          width:
            MAX_DIM,
          height:
            MAX_DIM,
          fit:
            'inside',
          withoutEnlargement:
            true,
        })
        .webp({
          quality:
            QUALITY,
          effort: 4,
        })
        .toBuffer();

    if (
      webpBuffer
        .byteLength >=
      originalBuffer
        .byteLength
    ) {
      return {
        buffer:
          originalBuffer,
        mime:
          originalMime,
        ext:
          originalExt,
        usedOriginal:
          true,
      };
    }

    return {
      buffer:
        webpBuffer,
      mime:
        'image/webp',
      ext:
        'webp',
      usedOriginal:
        false,
    };
  } catch {
    return {
      buffer:
        originalBuffer,
      mime:
        originalMime,
      ext:
        originalExt,
      usedOriginal:
        true,
    };
  }
}

async function getDurationSec(
  filePath: string,
): Promise<number> {
  return new Promise(
    (resolve) => {
      (
        ffmpeg as any
      ).ffprobe(
        filePath,
        (
          error: unknown,
          data: any,
        ) => {
          if (error) {
            resolve(0);
            return;
          }

          resolve(
            Number(
              data?.format
                ?.duration ||
                0,
            ) || 0,
          );
        },
      );
    },
  );
}

async function transcodeToTargetMP4(
  inputPath: string,
  targetMB: number,
  maxWidth: number,
  audioKbps: number,
) {
  const targetBytes =
    targetMB *
    1024 *
    1024;

  const duration =
    await getDurationSec(
      inputPath,
    );

  const totalKbps =
    duration > 0
      ? Math.max(
          200,
          Math.floor(
            (
              targetBytes *
              8
            ) /
              duration /
              1000,
          ),
        )
      : 600;

  const videoKbps =
    Math.max(
      100,
      totalKbps -
        audioKbps,
    );

  const outputPath =
    path.join(
      os.tmpdir(),
      (
        `out_${Date.now()}_` +
        `${Math.random()
          .toString(36)
          .slice(2)}.mp4`
      ),
    );

  try {
    await new Promise<void>(
      (
        resolve,
        reject,
      ) => {
        (
          ffmpeg as any
        )(inputPath)
          .outputOptions([
            '-c:v libx264',
            '-preset veryfast',
            `-b:v ${videoKbps}k`,
            `-maxrate ${videoKbps}k`,
            `-bufsize ${videoKbps * 2}k`,
            `-vf scale='min(${maxWidth},iw)':'-2'`,
            '-c:a aac',
            `-b:a ${audioKbps}k`,
            '-movflags +faststart',
          ])
          .on(
            'end',
            () =>
              resolve(),
          )
          .on(
            'error',
            (
              error: unknown,
            ) =>
              reject(error),
          )
          .save(
            outputPath,
          );
      },
    );

    return await fs.readFile(
      outputPath,
    );
  } finally {
    await fs
      .unlink(
        outputPath,
      )
      .catch(
        () => {},
      );
  }
}

async function processVideoIfNeeded(
  file: File,
): Promise<ProcessedFile> {
  const originalBuffer =
    Buffer.from(
      await file.arrayBuffer(),
    );

  const originalExt =
    getSafeExt(
      file.name,
    ) ||
    'bin';

  const originalMime =
    file.type ||
    'application/octet-stream';

  if (
    !isVideoFile(file)
  ) {
    return {
      buffer:
        originalBuffer,
      mime:
        originalMime,
      ext:
        originalExt,
      usedOriginal:
        true,
    };
  }

  const inputPath =
    path.join(
      os.tmpdir(),
      (
        `in_${Date.now()}_` +
        `${Math.random()
          .toString(36)
          .slice(2)}.` +
        originalExt
      ),
    );

  await fs.writeFile(
    inputPath,
    originalBuffer,
  );

  try {
    const outputBuffer =
      await transcodeToTargetMP4(
        inputPath,
        TARGET_MB,
        MAX_WIDTH,
        AUDIO_K,
      );

    const targetBytes =
      TARGET_MB *
      1024 *
      1024;

    const pickOriginal =
      originalBuffer
        .byteLength <=
        targetBytes &&
      originalBuffer
        .byteLength <=
        outputBuffer
          .byteLength;

    if (pickOriginal) {
      return {
        buffer:
          originalBuffer,
        mime:
          originalMime,
        ext:
          originalExt,
        usedOriginal:
          true,
      };
    }

    return {
      buffer:
        outputBuffer,
      mime:
        'video/mp4',
      ext:
        'mp4',
      usedOriginal:
        false,
    };
  } catch {
    return {
      buffer:
        originalBuffer,
      mime:
        originalMime,
      ext:
        originalExt,
      usedOriginal:
        true,
    };
  } finally {
    await fs
      .unlink(
        inputPath,
      )
      .catch(
        () => {},
      );
  }
}

const s3 =
  new S3Client({
    region:
      process.env
        .AWS_REGION,
  });

async function processUpload(
  file: File,
  folderId: number,
  uploader: string,
  bucket: string,
): Promise<UploadedRow> {
  let processed:
    ProcessedFile;

  if (
    isImageFile(file)
  ) {
    processed =
      await processImageIfNeeded(
        file,
      );
  } else if (
    isVideoFile(file)
  ) {
    processed =
      await processVideoIfNeeded(
        file,
      );
  } else {
    const buffer =
      Buffer.from(
        await file.arrayBuffer(),
      );

    processed = {
      buffer,
      mime:
        file.type ||
        'application/octet-stream',
      ext:
        getSafeExt(
          file.name,
        ) ||
        'bin',
      usedOriginal:
        true,
    };
  }

  const hash =
    sha1Short(
      processed.buffer,
    );

  const key =
    buildKey(
      folderId,
      processed.ext,
      hash,
    );

  const location =
    buildS3PublicUrl(
      bucket,
      key,
    );

  await s3.send(
    new PutObjectCommand({
      Bucket:
        bucket,
      Key:
        key,
      Body:
        processed.buffer,
      ContentType:
        processed.mime,
      CacheControl:
        CACHE_CONTROL,
      ContentDisposition:
        'inline',
    }),
  );

  try {
    const rows =
      (
        await sql`
          INSERT INTO images (
            name,
            folder_id,
            uploader,
            s3_key,
            url,
            mime_type
          )
          VALUES (
            ${file.name},
            ${folderId},
            ${uploader},
            ${key},
            ${location},
            ${processed.mime || null}
          )
          RETURNING *
        `
      ) as unknown as
        UploadedRow[];

    const row =
      rows[0];

    if (!row) {
      throw new Error(
        'DB가 저장 결과를 반환하지 않았습니다.',
      );
    }

    return row;
  } catch (error) {
    /*
     * DB 저장이 실패하면 이미 업로드된 S3 객체를 정리한다.
     */
    await s3
      .send(
        new DeleteObjectCommand({
          Bucket:
            bucket,
          Key:
            key,
        }),
      )
      .catch(
        (
          cleanupError,
        ) => {
          console.error(
            '[image/upload] S3 정리 실패:',
            cleanupError,
          );
        },
      );

    throw error;
  }
}

export async function POST(
  req: NextRequest,
) {
  const gate =
    await requireRole([
      'writer',
      'admin',
    ]);

  if (!gate.ok) {
    return NextResponse.json(
      {
        error:
          gate.error,
      },
      {
        status:
          gate.status,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }

  try {
    const formData =
      await req.formData();

    const files =
      formData
        .getAll('files')
        .filter(
          (
            value,
          ): value is File =>
            (
              typeof value !==
              'string'
            ) &&
            value instanceof
              File,
        );

    const folderId =
      Number(
        formData.get(
          'folder_id',
        ),
      );

    const authUser =
      getAuthUser();

    const headerName =
      req.headers.get(
        'x-wiki-username',
      );

    const uploader =
      authUser
        ?.minecraft_name ??
      headerName ??
      'admin';

    if (
      !Number.isFinite(
        folderId,
      ) ||
      folderId <= 0
    ) {
      return NextResponse.json(
        {
          error:
            '폴더 ID 누락 또는 형식 오류',
        },
        {
          status: 400,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    if (
      files.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            '파일 없음',
        },
        {
          status: 400,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const bucket =
      process.env
        .S3_BUCKET_NAME;

    if (!bucket) {
      return NextResponse.json(
        {
          error:
            'S3_BUCKET_NAME 누락',
        },
        {
          status: 500,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    const uploaded:
      UploadedRow[] = [];

    const failures:
      UploadFailure[] = [];

    let cursor = 0;

    const worker =
      async () => {
        while (true) {
          const index =
            cursor;

          cursor += 1;

          if (
            index >=
            files.length
          ) {
            return;
          }

          const file =
            files[index];

          try {
            const row =
              await processUpload(
                file,
                folderId,
                uploader,
                bucket,
              );

            uploaded.push(
              row,
            );
          } catch (
            error: unknown
          ) {
            console.error(
              `[image/upload] ${file.name} 실패:`,
              error,
            );

            failures.push({
              name:
                file.name,
              error:
                error instanceof
                  Error
                  ? error.message
                  : String(
                      error,
                    ),
            });
          }
        }
      };

    const workerCount =
      Math.min(
        SERVER_CONCURRENCY,
        files.length,
      );

    await Promise.all(
      Array.from(
        {
          length:
            workerCount,
        },
        () => worker(),
      ),
    );

    if (
      uploaded.length >
      0
    ) {
      try {
        const folderLabel =
          await resolveFolderName(
            folderId,
          );

        const names =
          uploaded.map(
            (row) =>
              row.name,
          );

        const targetName =
          names.length === 1
            ? names[0]
            : (
                `${names[0]} 외 ` +
                `${names.length - 1}개`
              );

        await logActivity({
          action:
            'image.upload',
          username:
            uploader,
          targetType:
            'image',
          targetId:
            null,
          targetName,
          targetPath:
            folderLabel ??
            String(
              folderId,
            ),
          meta: {
            folder_id:
              folderId,
            folder_name:
              folderLabel ??
              null,
            count:
              uploaded.length,
            ids:
              uploaded.map(
                (row) =>
                  row.id,
              ),
            names,
          },
        });
      } catch (
        logError
      ) {
        /*
         * 파일과 DB 저장이 이미 끝났다면
         * 활동 로그 실패로 업로드를 실패 처리하지 않는다.
         */
        console.error(
          '[image/upload] 활동 로그 저장 실패:',
          logError,
        );
      }
    }

    if (
      uploaded.length ===
      0
    ) {
      return NextResponse.json(
        {
          error:
            failures[0]
              ?.error ||
            '업로드에 실패했습니다.',
          images: [],
          failures,
        },
        {
          status: 500,
          headers: {
            'Cache-Control':
              'no-store',
          },
        },
      );
    }

    return NextResponse.json(
      {
        images:
          uploaded,
        failures,
      },
      {
        status:
          failures.length >
          0
            ? 207
            : 200,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  } catch (
    error: unknown
  ) {
    console.error(
      '[image/upload POST] unexpected error:',
      error,
    );

    return NextResponse.json(
      {
        error:
          error instanceof
            Error
            ? error.message
            : 'Server error',
      },
      {
        status: 500,
        headers: {
          'Cache-Control':
            'no-store',
        },
      },
    );
  }
}

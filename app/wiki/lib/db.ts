// =============================================
// File: app/wiki/lib/db.ts
// 전체 교체용 코드
// - postgres singleton
// - pooled(기본) / direct(테스트용) 연결 분기
// - serverless 환경 보수 설정
// - 읽기 쿼리 재시도 유틸 제공
// - Supabase 세션 풀 포화 오류 재시도 지원
// - 기존 코드 호환용 runDbRead export 포함
// =============================================

import postgres, {
  type Sql,
} from 'postgres';

function getRequiredEnv(
  name: string,
): string {
  const value =
    process.env[name];

  if (!value) {
    throw new Error(
      `${name} is not set`,
    );
  }

  return value;
}

function getDbConfig() {
  const mode = (
    process.env
      .DB_CONNECTION_MODE ??
    'pooled'
  ).toLowerCase();

  if (mode === 'direct') {
    return {
      mode: 'direct' as const,
      url: getRequiredEnv(
        'DIRECT_DB_URL',
      ),
    };
  }

  return {
    mode: 'pooled' as const,
    url: getRequiredEnv(
      'DATABASE_URL',
    ),
  };
}

function getIdleTimeoutSeconds() {
  const raw =
    Number(
      process.env
        .DB_IDLE_TIMEOUT_SECONDS ??
        60,
    );

  if (
    !Number.isFinite(raw)
  ) {
    return 60;
  }

  return Math.min(
    300,
    Math.max(
      10,
      Math.trunc(raw),
    ),
  );
}

const DB =
  getDbConfig();

export type SQL = Sql;

declare global {
  // eslint-disable-next-line no-var
  var __wiki_sql__:
    | SQL
    | undefined;

  // eslint-disable-next-line no-var
  var __wiki_db_mode__:
    | 'pooled'
    | 'direct'
    | undefined;
}

function createSql(): SQL {
  return postgres(
    DB.url,
    {
      prepare: false,
      ssl: 'require',

      /*
       * 기존 동시 연결 상한은 그대로 유지합니다.
       * 유휴 연결 종료만 10초 -> 기본 60초로 늘려
       * postgres.js 타입 초기화와 Pooler 인증 반복을 줄입니다.
       */
      max: 1,
      connect_timeout: 5,
      idle_timeout:
        getIdleTimeoutSeconds(),
      onnotice: () => {},
    },
  );
}

export const sql: SQL =
  global.__wiki_sql__ &&
  global.__wiki_db_mode__ ===
    DB.mode
    ? global.__wiki_sql__
    : createSql();

global.__wiki_sql__ =
  sql;

global.__wiki_db_mode__ =
  DB.mode;

/**
 * 트랜잭션 유틸
 * postgres 타입과 충돌하지 않게 내부 tx는 unknown -> SQL로 단언
 */
export async function withTx<T>(
  fn: (
    tx: SQL,
  ) => Promise<T>,
): Promise<T> {
  return sql.begin(
    async (tx) => {
      return fn(
        tx as unknown as SQL,
      );
    },
  ) as Promise<T>;
}

/**
 * 단일 행 유틸
 * RowList -> unknown -> T[] 로 명시 변환
 */
export async function one<T>(
  strings:
    TemplateStringsArray,
  ...values: any[]
): Promise<T | null> {
  const rows = (
    await sql(
      strings,
      ...values
    )
  ) as unknown as T[];

  return rows[0] ?? null;
}

type DbErrorLike = {
  code?: string;
  errno?: string;
  message?: string;
};

export function isTransientDbError(
  errorValue: unknown,
): boolean {
  const error =
    (errorValue ??
      {}) as DbErrorLike;

  const code =
    String(
      error.code ??
      error.errno ??
      '',
    ).toUpperCase();

  const message =
    String(
      error.message ?? '',
    ).toLowerCase();

  return (
    code ===
      'CONNECT_TIMEOUT' ||
    code ===
      'ECONNRESET' ||
    code ===
      'ECONNREFUSED' ||
    code ===
      'ETIMEDOUT' ||
    code ===
      'EPIPE' ||
    code ===
      'EMAXCONNSESSION' ||
    code ===
      '53300' ||
    code ===
      '57P03' ||
    message.includes(
      'connect_timeout',
    ) ||
    message.includes(
      'terminating connection',
    ) ||
    message.includes(
      'connection refused',
    ) ||
    message.includes(
      'connection terminated unexpectedly',
    ) ||
    message.includes(
      'max clients reached',
    ) ||
    message.includes(
      'too many clients',
    ) ||
    message.includes(
      'remaining connection slots are reserved',
    ) ||
    message.includes(
      'cannot connect now',
    )
  );
}

function sleep(
  milliseconds: number,
) {
  return new Promise(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds,
      );
    },
  );
}

export async function withDbRetry<T>(
  label: string,
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 250,
): Promise<T> {
  let attempt = 0;
  let lastError:
    unknown;

  while (
    attempt <= retries
  ) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const retryable =
        isTransientDbError(
          error,
        );

      const hasNext =
        attempt < retries;

      if (
        !retryable ||
        !hasNext
      ) {
        throw error;
      }

      const errorLike =
        (error ??
          {}) as DbErrorLike;

      console.warn(
        `[db] ${label} failed with ${
          errorLike.code ??
          errorLike.errno ??
          'UNKNOWN'
        }, retrying (${attempt + 1}/${retries})`,
      );

      await sleep(
        delayMs *
          (attempt + 1),
      );

      attempt += 1;
    }
  }

  throw lastError;
}

/**
 * 기존 코드 호환용 별칭
 */
export async function runDbRead<T>(
  label: string,
  fn: () => Promise<T>,
  retries = 1,
  delayMs = 250,
): Promise<T> {
  return withDbRetry(
    label,
    fn,
    retries,
    delayMs,
  );
}

export function getDbMode():
  | 'pooled'
  | 'direct' {
  return DB.mode;
}

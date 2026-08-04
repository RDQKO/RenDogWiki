import {
  Element as SlateElement,
  Node,
  type Descendant,
} from 'slate';

import { extractHeadings } from '@/wiki/lib/extractHeadings';
import {
  sql,
  type SQL,
  withTx,
} from '@/wiki/lib/db';

export type DocumentSearchSection = {
  sectionOrder: number;
  headingText: string;
  headingCompact: string;
  domId: string;
  level: 0 | 1 | 2 | 3;
  plainText: string;
  compactText: string;
};

type SearchIndexSource = {
  documentId: number;
  content: unknown;
};

type SearchableRecord = Record<string, unknown>;

/**
 * 화면에 표시되는 문서 내용이 아니라 검색에 불필요한 구조·스타일·파일 주소 값입니다.
 *
 * children은 Node.string()으로 별도 처리하므로 여기서는 중복 수집하지 않습니다.
 * 그 외 등록되지 않은 새로운 커스텀 속성은 기본적으로 검색 대상으로 포함합니다.
 */
const IGNORED_CUSTOM_PROPERTY_KEYS = new Set([
  'children',
  'type',

  // 내부 식별자
  'id',
  'documentid',
  'document_id',
  'questid',
  'npcid',
  'qnaid',
  'refid',
  'wikipath',
  'path',

  // 파일·외부 주소
  'url',
  'src',
  'href',
  'image',
  'imageurl',
  'video',
  'videourl',
  'favicon',
  'docicon',
  'icon',

  // 레이아웃·스타일
  'width',
  'height',
  'textalign',
  'align',
  'size',
  'style',
  'styletype',
  'classname',
  'color',
  'colortype',
  'backgroundcolor',
  'fontsize',
  'fontfamily',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'rowspan',
  'colspan',
  'cardsperrow',

  // 렌더링 옵션
  'noicon',
  'enabled',
  'iswiki',
  'boxtype',
  'variant',
  'tone',
  'infotype',
  'weapontype',
  'mode',
  'key',

  // 캐시 버전·갱신 시각
  'updatedat',
  'version',
  'imageupdatedat',
  'imageversion',
  'videoupdatedat',
  'videoversion',
]);

function cleanText(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactText(value: unknown): string {
  return cleanText(value)
    .toLowerCase()
    .replace(/\s+/g, '');
}

function toDescendants(value: unknown): Descendant[] {
  if (Array.isArray(value)) {
    return value as Descendant[];
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);

      return Array.isArray(parsed)
        ? (parsed as Descendant[])
        : [];
    } catch {
      return [];
    }
  }

  return [];
}

function isRecord(
  value: unknown,
): value is SearchableRecord {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizePropertyKey(key: string) {
  return key
    .replace(/[-_\s]/g, '')
    .toLowerCase();
}

function shouldIgnoreCustomProperty(key: string) {
  return IGNORED_CUSTOM_PROPERTY_KEYS.has(
    normalizePropertyKey(key),
  );
}

function addUniqueText(
  parts: string[],
  seen: Set<string>,
  value: unknown,
) {
  const text = cleanText(value);

  if (!text) {
    return;
  }

  const dedupeKey = text.toLowerCase();

  if (seen.has(dedupeKey)) {
    return;
  }

  seen.add(dedupeKey);
  parts.push(text);
}

/**
 * Slate children 밖에 저장된 커스텀 요소 데이터를 재귀적으로 수집합니다.
 *
 * 예:
 * - 무기 카드: name, stats.label, stats.summary, stats.levels[].value
 * - 시세표 카드: items[].name, items[].prices
 * - 각주: label, content
 * - 링크 카드: sitename, wikiTitle
 *
 * 새 커스텀 요소가 추가되더라도 구조·스타일 키가 아닌 문자열/숫자 속성은
 * 기본적으로 검색 대상에 포함됩니다.
 */
function collectCustomPropertyText(
  value: unknown,
  parts: string[],
  seenText: Set<string>,
  seenObjects: WeakSet<object>,
  depth = 0,
) {
  if (value == null || depth > 10) {
    return;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number'
  ) {
    addUniqueText(parts, seenText, value);
    return;
  }

  if (typeof value === 'boolean') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectCustomPropertyText(
        item,
        parts,
        seenText,
        seenObjects,
        depth + 1,
      );
    }

    return;
  }

  if (!isRecord(value)) {
    return;
  }

  if (seenObjects.has(value)) {
    return;
  }

  seenObjects.add(value);

  for (const [key, nestedValue] of Object.entries(value)) {
    if (shouldIgnoreCustomProperty(key)) {
      continue;
    }

    collectCustomPropertyText(
      nestedValue,
      parts,
      seenText,
      seenObjects,
      depth + 1,
    );
  }
}

/**
 * 한 Slate 노드에서 사용자가 검색할 수 있어야 하는 텍스트를 추출합니다.
 *
 * Node.string()으로 일반 문단·정보 박스·표 등의 children 텍스트를 수집하고,
 * 커스텀 void 요소의 별도 속성값도 함께 추가합니다.
 */
function getNodeSearchText(node: Descendant): string {
  const parts: string[] = [];
  const seenText = new Set<string>();

  try {
    addUniqueText(
      parts,
      seenText,
      Node.string(node),
    );
  } catch {
    // 잘못된 구형 노드가 있어도 나머지 커스텀 속성은 계속 수집합니다.
  }

  if (SlateElement.isElement(node)) {
    collectCustomPropertyText(
      node as unknown as SearchableRecord,
      parts,
      seenText,
      new WeakSet<object>(),
    );
  }

  return cleanText(parts.join(' '));
}

/**
 * Slate 본문을 검색용 문단 단위 데이터로 변환합니다.
 *
 * 원본 JSON은 검색 테이블에 저장하지 않습니다.
 * 각 제목 사이의 일반 텍스트와 커스텀 요소 표시값을 함께 저장해
 * 기존 검색 범위와 문단 이동 UX를 유지합니다.
 */
export function buildDocumentSearchSections(
  value: unknown,
): DocumentSearchSection[] {
  const descendants = toDescendants(value);

  if (descendants.length === 0) {
    return [];
  }

  const headings = extractHeadings(descendants);
  const sections: DocumentSearchSection[] = [];

  let headingCursor = 0;
  let currentHeadingText = '';
  let currentDomId = '';
  let currentLevel: 0 | 1 | 2 | 3 = 0;
  let bodyParts: string[] = [];

  const pushCurrent = () => {
    const plainText = cleanText(bodyParts.join(' '));
    const headingText = cleanText(currentHeadingText);

    // 본문이 없는 제목도 제목 검색 결과에 노출되도록 보존합니다.
    if (!headingText && !plainText) {
      bodyParts = [];
      return;
    }

    sections.push({
      sectionOrder: sections.length,
      headingText,
      headingCompact: compactText(headingText),
      domId: currentDomId,
      level: currentLevel,
      plainText,
      compactText: compactText(plainText),
    });

    bodyParts = [];
  };

  for (const node of descendants) {
    if (!SlateElement.isElement(node)) {
      continue;
    }

    const isHeading =
      node.type === 'heading-one' ||
      node.type === 'heading-two' ||
      node.type === 'heading-three';

    if (isHeading) {
      pushCurrent();

      const heading = headings[headingCursor++];

      currentHeadingText = cleanText(
        heading?.text ?? getNodeSearchText(node),
      );
      currentDomId = heading?.domId ?? '';
      currentLevel = heading?.level ?? 0;
      continue;
    }

    const text = getNodeSearchText(node);

    if (text) {
      bodyParts.push(text);
    }
  }

  pushCurrent();
  return sections;
}

async function replaceUsing(
  db: SQL,
  documentId: number,
  content: unknown,
) {
  const builtSections =
    buildDocumentSearchSections(content);

  const sections =
    builtSections.length > 0
      ? builtSections
      : [
          {
            sectionOrder: 0,
            headingText: '',
            headingCompact: '',
            domId: '',
            level: 0 as const,
            plainText: '',
            compactText: '',
          },
        ];

  await db`
    DELETE FROM document_search_sections
    WHERE document_id = ${documentId}
  `;

  for (const section of sections) {
    await db`
      INSERT INTO document_search_sections (
        document_id,
        section_order,
        heading_text,
        heading_compact,
        dom_id,
        level,
        plain_text,
        compact_text,
        updated_at
      )
      VALUES (
        ${documentId},
        ${section.sectionOrder},
        ${section.headingText},
        ${section.headingCompact},
        ${section.domId},
        ${section.level},
        ${section.plainText},
        ${section.compactText},
        NOW()
      )
    `;
  }
}

/** 문서 한 건의 검색 인덱스를 원자적으로 교체합니다. */
export async function replaceDocumentSearchSections(
  documentId: number,
  content: unknown,
) {
  await withTx(async (tx) => {
    await replaceUsing(
      tx,
      documentId,
      content,
    );
  });
}

/** 기존 문서 backfill용 배치 교체 함수입니다. */
export async function replaceDocumentSearchSectionsBatch(
  sources: SearchIndexSource[],
) {
  if (sources.length === 0) {
    return;
  }

  await withTx(async (tx) => {
    for (const source of sources) {
      await replaceUsing(
        tx,
        source.documentId,
        source.content,
      );
    }
  });
}

/** 테스트나 관리 도구에서 검색 인덱스 행 수를 확인할 때 사용합니다. */
export async function countDocumentSearchSections() {
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM document_search_sections
  `) as unknown as Array<{ count: number }>;

  return Number(rows[0]?.count ?? 0);
}

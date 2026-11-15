import { flattenCollapsibleBlocks } from './collapsible';
import type { Descendant } from "slate";
import { Element as SlateElement, Node } from "slate";
import { extractHeadings } from "@/wiki/lib/extractHeadings";

export type SearchSection = {
  headingText: string;
  domId: string;
  level: 0 | 1 | 2 | 3;
  plainText: string;
};

export type SearchSectionMatch = {
  sectionHeading: string;
  sectionDomId: string;
  sectionLevel: 1 | 2 | 3 | null;
  sectionSnippet: string;
  score: number;
};

function compactSearchText(v: string) {
  return String(v ?? "").toLowerCase().replace(/\s+/g, "").trim();
}

function normalizeSearchText(v: string) {
  return String(v ?? "").toLowerCase().trim();
}

function isStrictHeadingMatch(headingText: string, query: string) {
  const heading = normalizeSearchText(headingText);
  const keyword = normalizeSearchText(query);

  if (!heading || !keyword) return false;
  return heading.includes(keyword);
}

function cleanText(v: string) {
  return String(v ?? "").replace(/\s+/g, " ").trim();
}

function escapeRegexChar(ch: string) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildLooseRegex(raw: string) {
  const compact = compactSearchText(raw);
  if (!compact) return null;
  try {
    return new RegExp(compact.split("").map(escapeRegexChar).join(".*"), "i");
  } catch {
    return null;
  }
}

function buildCompactIndexMap(text: string) {
  const compactChars: string[] = [];
  const indexMap: number[] = [];

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (/\s/.test(ch)) continue;
    compactChars.push(ch.toLowerCase());
    indexMap.push(i);
  }

  return {
    compact: compactChars.join(""),
    indexMap,
  };
}

function findLooseMatchRange(
  text: string,
  keyword: string,
): { start: number; end: number } | null {
  if (!text || !keyword) return null;

  const normalizedKeyword = compactSearchText(keyword);
  if (!normalizedKeyword) return null;

  const { compact, indexMap } = buildCompactIndexMap(text);
  const idx = compact.indexOf(normalizedKeyword);
  if (idx < 0) return null;

  const start = indexMap[idx];
  const endCompactIdx = idx + normalizedKeyword.length - 1;
  const end = (indexMap[endCompactIdx] ?? start) + 1;

  return { start, end };
}

function makeSnippetFromText(text: string, keyword: string, radius = 40) {
  const range = findLooseMatchRange(text, keyword);
  if (!range) return null;

  const start = Math.max(0, range.start - radius);
  const end = Math.min(text.length, range.end + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < text.length ? "…" : "";

  return `${prefix}${text.slice(start, end)}${suffix}`;
}

function scoreText(text: string, query: string, headingBonus = 0) {
  const source = cleanText(text);
  const normalizedSource = normalizeSearchText(source);
  const compactSource = compactSearchText(source);
  const normalizedQuery = normalizeSearchText(query);
  const compactQuery = compactSearchText(query);

  if (!source || !compactQuery) return 0;

  if (normalizedSource.includes(normalizedQuery)) {
    return 48 + headingBonus;
  }

  if (compactSource.includes(compactQuery)) {
    return 40 + headingBonus;
  }

  const loose = buildLooseRegex(query);
  if (loose && loose.test(compactSource)) {
    return 28 + headingBonus;
  }

  return 0;
}

export function extractSearchSections(value: Descendant[]): SearchSection[] {
  const headings = extractHeadings(value);
  const sections: SearchSection[] = [];

  let headingCursor = 0;
  let current: SearchSection = {
    headingText: "",
    domId: "",
    level: 0,
    plainText: "",
  };

  const pushCurrent = () => {
    const plainText = cleanText(current.plainText);
    if (!plainText) return;

    sections.push({
      ...current,
      plainText,
    });
  };

  for (const node of flattenCollapsibleBlocks(value)) {
    if (!SlateElement.isElement(node)) continue;

    const isHeading =
      node.type === "heading-one" ||
      node.type === "heading-two" ||
      node.type === "heading-three";

    if (isHeading) {
      pushCurrent();

      const meta = headings[headingCursor++];
      current = {
        headingText: cleanText(meta?.text ?? Node.string(node)),
        domId: meta?.domId ?? "",
        level: meta?.level ?? 0,
        plainText: "",
      };
      continue;
    }

    const text = cleanText(Node.string(node));
    if (!text) continue;

    current.plainText = current.plainText
      ? `${current.plainText} ${text}`
      : text;
  }

  pushCurrent();
  return sections;
}

export function findBestSectionMatch(
  value: Descendant[] | null | undefined,
  query: string,
): SearchSectionMatch | null {
  if (!Array.isArray(value)) return null;

  const sections = extractSearchSections(value);
  if (sections.length === 0) return null;

  let best: SearchSectionMatch | null = null;

  for (const section of sections) {
    // 목차 타겟은 "목차 문자열 직접 포함"일 때만 허용
    if (!isStrictHeadingMatch(section.headingText, query)) {
      continue;
    }

    const score = 1000; // strict heading match는 최우선
    const snippetSource = cleanText(`${section.headingText} ${section.plainText}`);
    const snippet =
      makeSnippetFromText(snippetSource, query, 40) ??
      makeSnippetFromText(section.plainText, query, 40) ??
      snippetSource.slice(0, 120);

    const candidate: SearchSectionMatch = {
      sectionHeading: section.headingText,
      sectionDomId: section.domId,
      sectionLevel:
        section.level === 1 || section.level === 2 || section.level === 3
          ? section.level
          : null,
      sectionSnippet: snippet,
      score,
    };

    if (!best) {
      best = candidate;
      continue;
    }

    // 같은 strict match면 heading이 더 짧은 쪽 우선 정도만 주면 충분
    if (candidate.sectionHeading.length < best.sectionHeading.length) {
      best = candidate;
    }
  }

  return best;
}
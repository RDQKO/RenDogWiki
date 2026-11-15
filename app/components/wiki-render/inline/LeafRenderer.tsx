import React from 'react';

type LeafEnv = {
  isMobile?: boolean;
  isDarkMode?: boolean;
  inDarkTableCell?: boolean;
  inTableCell?: boolean;
};

type LeafRendererProps = {
  mode: 'read' | 'edit';
  leaf: any;
  children?: React.ReactNode;
  env?: LeafEnv;
  attributes?: React.HTMLAttributes<HTMLSpanElement>;

  /**
   * read 렌더러는 기존 WikiReadRenderer처럼 기본 폰트 패밀리를 명시하고,
   * editor 렌더러는 기존 Leaf.tsx처럼 fontFamily가 있을 때만 적용한다.
   */
  useDefaultFontFamily?: boolean;
};

function normalizeFontSize(v: unknown): string | number | undefined {
  if (v == null) return undefined;

  if (typeof v === 'number') {
    return Math.max(1, v);
  }

  if (typeof v === 'string') {
    const s = v.trim();

    if (!s) return undefined;
    if (/(px|rem|em|%|vh|vw)$/i.test(s)) return s;
    if (/^\d+(\.\d+)?$/.test(s)) return `${s}px`;

    return s;
  }

  return undefined;
}

function toPxNumber(v: string | number | undefined): number | undefined {
  if (v == null) return undefined;
  if (typeof v === 'number') return v;

  const m = /^(-?\d+(?:\.\d+)?)px$/i.exec(v);

  return m ? parseFloat(m[1]) : undefined;
}

/**
 * 배경색(#rgb, #rrggbb, rgb()/rgba())의 상대 휘도를 계산해
 * 그 위에서 읽을 수 있는 글자색을 돌려준다.
 * 해석할 수 없는 값이거나 반투명한 배경이면 undefined를 반환해 기존 글자색을 유지한다.
 */
function readableTextColorFor(background: string): string | undefined {
  const value = background.trim().toLowerCase();
  let rgb: [number, number, number] | undefined;

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (hex) {
    const h =
      hex[1].length === 3
        ? hex[1].split('').map((c) => c + c).join('')
        : hex[1];
    rgb = [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  } else {
    const fn =
      /^rgba?\(\s*(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)[\s,]+(\d+(?:\.\d+)?)(?:[\s,/]+(\d*\.?\d+%?))?\s*\)$/.exec(
        value,
      );
    if (fn) {
      const alphaRaw = fn[4];
      const alpha =
        alphaRaw == null
          ? 1
          : alphaRaw.endsWith('%')
            ? parseFloat(alphaRaw) / 100
            : parseFloat(alphaRaw);
      if (alpha < 0.6) return undefined;
      rgb = [Number(fn[1]), Number(fn[2]), Number(fn[3])];
    }
  }

  if (!rgb) return undefined;

  const [r, g, b] = rgb.map((channel) => {
    const c = Math.min(255, Math.max(0, channel)) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return luminance > 0.36 ? '#1b1f1c' : '#ffffff';
}

const HANDWRITING_SCALE: Record<string, number> = {
  BareunHippy: 1.18,
  NanumHandwritingMiddleSchool: 1.14,
};

export default function LeafRenderer({
  mode,
  leaf,
  children,
  env,
  attributes,
  useDefaultFontFamily,
}: LeafRendererProps) {
  let renderedChildren = children ?? String(leaf?.text ?? '');

  if (leaf?.bold) {
    renderedChildren = <strong>{renderedChildren}</strong>;
  }

  if (leaf?.italic) {
    renderedChildren = <em>{renderedChildren}</em>;
  }

  if (leaf?.underline) {
    renderedChildren = <u>{renderedChildren}</u>;
  }

  if (leaf?.strikethrough) {
    renderedChildren = <s>{renderedChildren}</s>;
  }

  const style: React.CSSProperties & Record<string, string | number> = {};

  if (leaf?.color) {
    style.color = String(leaf.color);
  }

  const shouldIgnoreBgInDarkTable =
    env?.isDarkMode && env?.inDarkTableCell;

  if (!shouldIgnoreBgInDarkTable && leaf?.backgroundColor) {
    style.backgroundColor = String(leaf.backgroundColor);

    // 글자색을 따로 지정하지 않은 형광펜은 테마 기본 글자색을 그대로 쓰면
    // 다크 모드에서 밝은 배경 위 흰 글자가 되어 읽을 수 없다.
    // 배경 밝기에 맞는 글자색을 함께 지정한다.
    if (!leaf?.color) {
      const readable = readableTextColorFor(style.backgroundColor);
      if (readable) style.color = readable;
    }
  }

  const rawFamily = leaf?.fontFamily;
  const hasFamily = typeof rawFamily === 'string' && rawFamily.trim();

  const shouldApplyDefaultFamily =
    useDefaultFontFamily ?? mode === 'read';

  let familyKey: string | undefined;

  if (hasFamily) {
    familyKey = String(rawFamily).trim();
    style.fontFamily = familyKey;
  } else if (shouldApplyDefaultFamily) {
    familyKey = 'NanumSquareRound';
    style.fontFamily =
      "'NanumSquareRound', -apple-system, BlinkMacSystemFont, system-ui, sans-serif";
  }

  const hasCustomFontSize =
    leaf?.fontSize != null && String(leaf.fontSize).trim() !== '';

  const normalized = normalizeFontSize(leaf?.fontSize);
  const basePx = toPxNumber(normalized);
  const scale = familyKey ? HANDWRITING_SCALE[familyKey] ?? 1 : 1;

  let finalFontPx: number | undefined;

  if (scale !== 1) {
    if (typeof basePx === 'number') {
      finalFontPx = Math.round(basePx * scale);
      style.fontSize = `${finalFontPx}px`;
    } else if (normalized !== undefined) {
      style.fontSize = normalized;
    } else {
      style.fontSize = `${scale}em`;
    }

    style.lineHeight = style.lineHeight ?? 1.35;
  } else if (normalized !== undefined) {
    style.fontSize = normalized;

    if (typeof basePx === 'number') {
      finalFontPx = basePx;
    }
  }

  const extraProps: Record<string, string> = {};

  if (hasCustomFontSize) {
    extraProps['data-wiki-inline-font'] = 'custom';

    if (typeof finalFontPx === 'number' && Number.isFinite(finalFontPx)) {
      style['--wiki-inline-font-px'] = finalFontPx;
    }
  }

  return (
    <span
      {...attributes}
      {...extraProps}
      data-wiki-leaf="true"
      data-wiki-mode={mode}
      style={{
        ...style,
        ...(attributes?.style ?? {}),
      }}
    >
      {renderedChildren}
    </span>
  );
}
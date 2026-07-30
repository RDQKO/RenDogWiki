import React from 'react';

import type { WikiRenderMode } from '../types';

type ParagraphBlockProps = {
  mode: WikiRenderMode;
  textAlign?: string | null;
  indentLine?: boolean;
  indentClassName?: string;
  attributes?: React.HTMLAttributes<HTMLParagraphElement>;
  children?: React.ReactNode;

  /**
   * 문서 렌더러에서 이미 계산해서 넘길 수 있는 텍스트.
   * 없으면 children에서 최대한 추출한다.
   */
  plainText?: string;

  /**
   * 문서 렌더러에서 빈 문단 여부를 직접 넘길 수 있음.
   */
  isEmpty?: boolean;

  /**
   * 모바일 표 셀 안 문단이면 글자/줄간격을 줄인다.
   */
  isMobileTableText?: boolean;
};

function textFromReact(
  node: React.ReactNode,
): string {
  if (
    node == null ||
    typeof node === 'boolean'
  ) {
    return '';
  }

  if (
    typeof node === 'string' ||
    typeof node === 'number'
  ) {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node
      .map(textFromReact)
      .join('');
  }

  if (React.isValidElement(node)) {
    return textFromReact(
      (
        node.props as {
          children?: React.ReactNode;
        }
      ).children,
    );
  }

  return '';
}

function autoFont(
  base: number,
  text: string,
  steps?: Array<
    [number, number]
  >,
) {
  const len =
    Array.from(
      text ?? '',
    ).length;

  const rules:
    Array<
      [number, number]
    > =
    steps ?? [
      [8, base],
      [12, base - 2],
      [16, base - 4],
      [22, base - 6],
      [30, base - 8],
      [40, base - 9],
    ];

  for (
    const [
      threshold,
      size,
    ] of rules
  ) {
    if (len <= threshold) {
      return size;
    }
  }

  return Math.max(
    11,
    (
      rules.at(-1)?.[1] ??
      base
    ) - 2,
  );
}

function normalizeTextAlign(
  textAlign?: string | null,
): React.CSSProperties['textAlign'] {
  if (textAlign === 'center') {
    return 'center';
  }

  if (textAlign === 'right') {
    return 'right';
  }

  return 'left';
}

export default function ParagraphBlock({
  mode,
  textAlign,
  indentLine,
  indentClassName,
  attributes,
  children,
  plainText:
    plainTextProp,
  isEmpty:
    isEmptyProp,
  isMobileTableText,
}: ParagraphBlockProps) {
  const normalizedAlign =
    normalizeTextAlign(
      textAlign,
    );

  /**
   * 에디터 모드:
   * 원본 Element.tsx처럼 paragraph 자체 디자인을 새로 만들지 않는다.
   * Slate attributes + textAlign + indent-line class만 유지한다.
   */
  if (mode === 'edit') {
    const className = [
      attributes?.className ||
        '',
      indentLine
        ? 'indent-line'
        : '',
      indentLine
        ? indentClassName ||
          ''
        : '',
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    const isStart =
      indentClassName?.includes(
        'start',
      );

    const isEnd =
      indentClassName?.includes(
        'end',
      );

    return (
      <p
        {...attributes}
        className={
          className ||
          undefined
        }
        style={{
          ...(
            attributes?.style ||
            {}
          ),
          textAlign:
            normalizedAlign,
          ...(indentLine
            ? {
                borderLeft:
                  '2px solid var(--border-strong)',
                paddingLeft: 16,
                marginTop:
                  isStart
                    ? 12
                    : 0,
                marginBottom:
                  isEnd
                    ? 12
                    : 0,
                color:
                  'inherit',
              }
            : null),
        }}
      >
        {children}
      </p>
    );
  }

  /**
   * 문서 렌더 모드:
   * 원본 WikiReadRenderer.tsx의 paragraph case 기준.
   */
  const plainText = (
    plainTextProp ??
    textFromReact(children)
  )
    .replace(
      /\u200B/g,
      '',
    )
    .trim();

  const isEmpty =
    typeof isEmptyProp ===
    'boolean'
      ? isEmptyProp
      : plainText.length === 0;

  const mobileTable =
    Boolean(
      isMobileTableText,
    );

  const baseFont =
    mobileTable
      ? 13
      : 19;

  const paragraphFontPx =
    mobileTable
      ? 13
      : isEmpty
        ? baseFont
        : autoFont(
            baseFont,
            plainText,
            [
              [
                40,
                baseFont,
              ],
              [
                80,
                baseFont - 1,
              ],
              [
                120,
                baseFont - 2,
              ],
              [
                170,
                baseFont - 3,
              ],
              [
                230,
                baseFont - 4,
              ],
              [
                320,
                baseFont - 5,
              ],
              [
                450,
                baseFont - 6,
              ],
            ],
          );

  const readStyle:
    React.CSSProperties = {
    ...(
      attributes?.style ||
      {}
    ),
    textAlign:
      normalizedAlign,
    margin: 0,
    lineHeight:
      mobileTable
        ? 1.45
        : 1.6,
    minHeight:
      isEmpty
        ? mobileTable
          ? '1.45em'
          : '1.6em'
        : undefined,
    fontSize:
      `${paragraphFontPx}px`,

    /*
     * 기존 본문은 별도의 굵기 없이 기본 400으로 렌더링됐다.
     * 일반 문단은 700으로 올려 가독성을 강화하고,
     * 모바일 표 셀은 공간을 고려해 600으로 제한한다.
     *
     * strong 요소는 브라우저의 bolder 규칙으로
     * 본문보다 한 단계 더 굵게 유지된다.
     */
    fontWeight:
      mobileTable
        ? 600
        : 700,
    letterSpacing:
      mobileTable
        ? '-0.008em'
        : '-0.012em',

    whiteSpace:
      'pre-wrap',
    color:
      'var(--foreground)',
  };

  if (indentLine) {
    readStyle.borderLeft =
      '2px solid var(--border-strong)';

    readStyle.paddingLeft =
      16;
  }

  return (
    <p
      {...attributes}
      className={
        attributes?.className
      }
      style={readStyle}
    >
      {children}
    </p>
  );
}

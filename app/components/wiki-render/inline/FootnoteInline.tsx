import React from 'react';

import '../../../wiki/css/document-components/footnote.css';

type FootnoteInlineProps = {
  mode: 'read' | 'edit';
  label?: string | null;
  content?: string | null;
  children?: React.ReactNode;
  attributes?: React.HTMLAttributes<HTMLSpanElement>;
  title?: string;
  onContextMenu?: React.MouseEventHandler<HTMLSpanElement>;
  className?: string;
  style?: React.CSSProperties;
  tabIndex?: number;
  ariaLabel?: string;
  onMouseEnter?: React.MouseEventHandler<HTMLSpanElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLSpanElement>;
  onFocus?: React.FocusEventHandler<HTMLSpanElement>;
  onBlur?: React.FocusEventHandler<HTMLSpanElement>;
  onClick?: React.MouseEventHandler<HTMLSpanElement>;
};

const FootnoteInline = React.forwardRef<
  HTMLSpanElement,
  FootnoteInlineProps
>(function FootnoteInline(
  {
    mode,
    label,
    content,
    children,
    attributes,
    title,
    onContextMenu,
    className,
    style,
    tabIndex,
    ariaLabel,
    onMouseEnter,
    onMouseLeave,
    onFocus,
    onBlur,
    onClick,
  },
  ref,
) {
  const safeLabel = String(label ?? '').trim() || '각주';
  const hasContent = Boolean(String(content ?? '').trim());

  const {
    className: attributeClassName,
    style: attributeStyle,
    ...restAttributes
  } = attributes ?? {};

  return (
    <span
      {...restAttributes}
      ref={ref}
      contentEditable={
        mode === 'edit'
          ? false
          : attributes?.contentEditable
      }
      suppressContentEditableWarning
      data-footnote="true"
      data-wiki-inline="footnote"
      data-wiki-mode={mode}
      data-footnote-has-content={
        hasContent ? 'true' : 'false'
      }
      title={title ?? attributes?.title}
      className={[
        'wiki-footnote-inline',
        mode === 'edit'
          ? 'wiki-footnote-inline--edit'
          : 'wiki-footnote-inline--read',
        attributeClassName || '',
        className || '',
      ]
        .filter(Boolean)
        .join(' ')}
      tabIndex={tabIndex ?? attributes?.tabIndex}
      aria-label={
        ariaLabel ?? attributes?.['aria-label']
      }
      onContextMenu={
        onContextMenu ?? attributes?.onContextMenu
      }
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={onClick}
      style={{
        ...(attributeStyle ?? {}),
        ...style,
      }}
    >
      <span
        className="wiki-footnote-inline-label"
        contentEditable={false}
        suppressContentEditableWarning
      >
        [{safeLabel}]
      </span>

      {children}
    </span>
  );
});

export default FootnoteInline;

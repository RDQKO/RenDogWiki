import React from 'react';

type InlineLinkAnchorAttributes =
  React.AnchorHTMLAttributes<HTMLAnchorElement> & {
    ref?: React.Ref<HTMLAnchorElement>;
  };

type InlineLinkRendererProps = {
  mode: 'read' | 'edit';

  href?: string | null;
  children?: React.ReactNode;

  anchorRef?: React.Ref<HTMLAnchorElement>;

  attributes?: InlineLinkAnchorAttributes;

  className?: string;
  style?: React.CSSProperties;

  onClick?: React.MouseEventHandler<HTMLAnchorElement>;

  onMouseEnter?: React.MouseEventHandler<HTMLAnchorElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLAnchorElement>;

  onFocus?: React.FocusEventHandler<HTMLAnchorElement>;
  onBlur?: React.FocusEventHandler<HTMLAnchorElement>;

  ariaDescribedBy?: string;
};

export default function InlineLinkRenderer({
  mode,
  href,
  children,
  anchorRef,
  attributes,
  className,
  style,
  onClick,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ariaDescribedBy,
}: InlineLinkRendererProps) {
  const safeHref = String(href ?? '#');
  const attributesRef = attributes?.ref;
  const mergedRef = React.useCallback(
    (node: HTMLAnchorElement | null) => {
      const assignRef = (ref: React.Ref<HTMLAnchorElement> | undefined) => {
        if (!ref) return;

        if (typeof ref === 'function') {
          ref(node);
          return;
        }

        (ref as React.MutableRefObject<HTMLAnchorElement | null>).current = node;
      };

      assignRef(attributesRef);

      if (anchorRef !== attributesRef) {
        assignRef(anchorRef);
      }
    },
    [anchorRef, attributesRef],
  );

  const mergedClassName = [
    attributes?.className,
    className,
  ]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <a
      {...attributes}
      ref={mergedRef}
      href={safeHref}
      data-wiki-inline="link"
      data-wiki-mode={mode}
      className={mergedClassName}
      onClick={onClick ?? attributes?.onClick}
      onMouseEnter={onMouseEnter ?? attributes?.onMouseEnter}
      onMouseLeave={onMouseLeave ?? attributes?.onMouseLeave}
      onFocus={onFocus ?? attributes?.onFocus}
      onBlur={onBlur ?? attributes?.onBlur}
      aria-describedby={
        ariaDescribedBy ??
        attributes?.['aria-describedby']
      }
      target={
        mode === 'read'
          ? attributes?.target
          : undefined
      }
      rel={
        mode === 'read'
          ? attributes?.rel
          : undefined
      }
      style={{
        color: 'var(--accent, #2676ff)',
        textDecoration: 'none',
        cursor: mode === 'edit' ? 'text' : 'pointer',
        ...(attributes?.style ?? {}),
        ...style,
      }}
    >
      {children}
    </a>
  );
}

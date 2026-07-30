import React from 'react';

type WikiRefInlineProps = {
  mode: 'read' | 'edit';
  children?: React.ReactNode;

  clickable?: boolean;
  onOpen?: () => void;

  attributes?: React.HTMLAttributes<HTMLSpanElement>;
  contentEditable?: boolean;
};

export default function WikiRefInline({
  mode,
  children,
  clickable = false,
  onOpen,
  attributes,
  contentEditable,
}: WikiRefInlineProps) {
  const handleClick: React.MouseEventHandler<HTMLSpanElement> | undefined =
    mode === 'read' && clickable && onOpen
      ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          onOpen();
        }
      : undefined;

  const handleKeyDown: React.KeyboardEventHandler<HTMLSpanElement> | undefined =
    mode === 'read' && clickable && onOpen
      ? (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;

          e.preventDefault();
          e.stopPropagation();
          onOpen();
        }
      : undefined;

  return (
    <span
      {...attributes}
      role={mode === 'read' && clickable ? 'button' : attributes?.role}
      tabIndex={mode === 'read' && clickable ? 0 : attributes?.tabIndex}
      contentEditable={
        contentEditable ??
        (mode === 'edit' ? false : attributes?.contentEditable)
      }
      suppressContentEditableWarning
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      data-wiki-inline="wiki-ref"
      data-wiki-mode={mode}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        borderRadius: 999,
        padding: '1px 7px',
        border:
          '1px solid color-mix(in srgb, var(--editor-accent, var(--accent, #6d28d9)) 28%, transparent)',
        background:
          'color-mix(in srgb, var(--editor-accent, var(--accent, #6d28d9)) 10%, transparent)',
        color:
          mode === 'edit'
            ? 'var(--editor-accent-strong, var(--accent, #6d28d9))'
            : 'var(--accent, #6d28d9)',
        fontWeight: 700,
        lineHeight: 1.35,
        whiteSpace: 'nowrap',
        cursor: mode === 'read' && clickable ? 'pointer' : 'default',
        verticalAlign: 'baseline',
        ...(attributes?.style ?? {}),
      }}
    >
      {children}
    </span>
  );
}

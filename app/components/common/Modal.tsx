'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';
import '@/wiki/css/image.css';

const modalStack: string[] = [];
let savedOverflow = '';

type BaseProps = { open: boolean; onClose: () => void; children: React.ReactNode };

function ModalSurface({ open, onClose, children, title, actions, width, card = false }: BaseProps & {
  title?: string;
  actions?: React.ReactNode;
  width?: number;
  card?: boolean;
}) {
  const id = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !mounted) return;
    const panel = panelRef.current;
    if (!panel) return;
    const previous = document.activeElement as HTMLElement | null;
    if (modalStack.length === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    modalStack.push(id);
    const isTop = () => modalStack[modalStack.length - 1] === id;
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )).filter(el => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none');
    (focusables()[0] ?? panel).focus({ preventScroll: true });
    const keydown = (event: KeyboardEvent) => {
      if (!isTop()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      } else if (event.key === 'Tab') {
        const items = focusables();
        const first = items[0] ?? panel;
        const last = items[items.length - 1] ?? panel;
        if (!panel.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last) || !items.length) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus({ preventScroll: true });
        }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      const wasTop = isTop();
      const index = modalStack.indexOf(id);
      if (index >= 0) modalStack.splice(index, 1);
      if (!modalStack.length) document.body.style.overflow = savedOverflow;
      if (wasTop && previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, [open, mounted, id]);

  if (!open || !mounted) return null;
  return createPortal(
    <div className={styles.overlay} data-rdwiki-modal onMouseDown={event => {
      if (event.target === event.currentTarget && modalStack[modalStack.length - 1] === id) onCloseRef.current();
    }}>
      <div ref={panelRef} className={card ? styles.card : styles.bare} role="dialog" aria-modal="true"
        aria-labelledby={title ? `${id}-title` : undefined} tabIndex={-1}
        style={width ? { width } : undefined}>
        {card && <div className={styles.header}>
          <h2 id={`${id}-title`} className={styles.title}>{title}</h2>
          <button className={styles.close} type="button" aria-label="닫기" onClick={() => onCloseRef.current()}>×</button>
        </div>}
        <div className={card ? styles.content : undefined}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>, document.body,
  );
}

export default function Modal(props: BaseProps) {
  return <ModalSurface {...props} />;
}

export function ModalCard(props: {
  open: boolean;
  onClose: () => void;
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  width?: number;
}) {
  return <ModalSurface {...props} width={props.width ?? 420} card>{props.children}</ModalSurface>;
}

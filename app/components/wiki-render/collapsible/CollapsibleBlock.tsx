'use client';

import React, { useEffect, useRef } from 'react';
import styles from './Collapsible.module.css';

export default function CollapsibleBlock({ title, defaultOpen = true, children }: {
  title?: string; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  // Native details keeps the reader's choice through unrelated React renders.
  useEffect(() => { if (ref.current) ref.current.open = defaultOpen; }, [defaultOpen]);
  return <details ref={ref} className={styles.region} data-wiki-collapsible open={defaultOpen}>
    <summary className={styles.summary}>{String(title ?? '').trim() || '펼침·접힘'}</summary>
    <div className={styles.body}>{children}</div>
  </details>;
}

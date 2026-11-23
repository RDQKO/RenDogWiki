'use client';

import { useState } from 'react';
import { ModalCard } from './Modal';
import { useImageStyle } from '@/components/image/ImageReplacementProvider';
import { IMAGE_STYLES, IMAGE_STYLE_LABELS, IMAGE_STYLE_SWITCHING_ENABLED } from '@lib/imageReplacements';
import styles from './ImageStyleSelector.module.css';

export default function ImageStyleSelector() {
  const { style, setStyle } = useImageStyle();
  const [preparing, setPreparing] = useState(false);
  const cube = <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
    <path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z" /><path d="m3 7 9 5 9-5M12 12v10" />
  </svg>;
  const options = IMAGE_STYLES.map(value => <button key={value} type="button" aria-label={`${IMAGE_STYLE_LABELS[value]} 이미지`}
      aria-pressed={style === value} aria-haspopup={IMAGE_STYLE_SWITCHING_ENABLED ? undefined : 'dialog'}
      title={IMAGE_STYLE_SWITCHING_ENABLED ? `${IMAGE_STYLE_LABELS[value]} 이미지로 보기 (미할당 시 2D)` : '이미지 모드 전환 준비중'}
      onClick={event => {
        if (!IMAGE_STYLE_SWITCHING_ENABLED) { setPreparing(true); return; }
        setStyle(value);
        const menu = event.currentTarget.closest('details');
        if (menu) menu.open = false;
      }}>{value === 'vanilla' ? cube : IMAGE_STYLE_LABELS[value]}</button>);
  return <><div className={styles.selector}>
    <div className={styles.desktop} role="group" aria-label="이미지 종류">{options}</div>
    <details className={styles.mobile}>
      <summary aria-label={`이미지 종류 선택: ${IMAGE_STYLE_LABELS[style]}`} title="이미지 종류 선택"
        aria-haspopup={IMAGE_STYLE_SWITCHING_ENABLED ? undefined : 'dialog'} onClick={event => {
          if (!IMAGE_STYLE_SWITCHING_ENABLED) { event.preventDefault(); setPreparing(true); }
        }}>{style === 'vanilla' ? cube : IMAGE_STYLE_LABELS[style]}</summary>
      <div className={styles.menu} role="group" aria-label="이미지 종류">{options}</div>
    </details>
  </div>
    <ModalCard open={preparing} onClose={() => setPreparing(false)} title="준비중" width={360}
      actions={<button type="button" className="rd-btn primary" onClick={() => setPreparing(false)}>확인</button>}>
      <p>이미지 모드 전환 기능은 준비중입니다.</p>
    </ModalCard>
  </>;
}

'use client';

import { useEffect, useState } from 'react';
import { readLocalStorage, writeLocalStorage } from '@lib/browserStorage';

type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'rdwiki-theme';

function getPreferredTheme(): Theme {
  if (typeof window === 'undefined') return 'light';

  const saved = readLocalStorage(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;

  return 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const next = getPreferredTheme();
    setTheme(next);
    applyTheme(next);
    setMounted(true);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    writeLocalStorage(THEME_STORAGE_KEY, next);
    applyTheme(next);
  };

  return (
    <>
      <label
        className="wiki-theme-switch"
        aria-label={theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환'}
        title={theme === 'dark' ? '라이트 모드' : '다크 모드'}
      >
        <input
          type="checkbox"
          checked={theme === 'dark'}
          onChange={toggleTheme}
          disabled={!mounted}
        />
        <span className="wiki-theme-slider" />
      </label>

      <style jsx>{`
        .wiki-theme-switch {
          display: block;
          --width-of-switch: 3.5em;
          --height-of-switch: 2em;
          --size-of-icon: 1.4em;
          --slider-offset: 0.3em;
          position: relative;
          width: var(--width-of-switch);
          height: var(--height-of-switch);
          flex-shrink: 0;
          user-select: none;
        }

        .wiki-theme-switch input {
          opacity: 0;
          width: 0;
          height: 0;
          position: absolute;
        }

        .wiki-theme-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: #f4f4f5;
          transition: 0.4s;
          border-radius: 999px;
          box-shadow:
            inset 0 0 0 1px rgba(15, 23, 42, 0.06),
            0 2px 8px rgba(15, 23, 42, 0.08);
        }

        .wiki-theme-slider::before {
          position: absolute;
          content: '';
          height: var(--size-of-icon);
          width: var(--size-of-icon);
          border-radius: 999px;
          left: var(--slider-offset);
          top: 50%;
          transform: translateY(-50%);
          background: linear-gradient(40deg, #ff0080, #ff8c00 70%);
          transition: 0.4s;
        }

        .wiki-theme-switch input:checked + .wiki-theme-slider {
          background-color: #303136;
        }

        .wiki-theme-switch input:checked + .wiki-theme-slider::before {
          left: calc(
            100% - (var(--size-of-icon) + var(--slider-offset))
          );
          background: #303136;
          box-shadow:
            inset -3px -2px 5px -2px #8983f7,
            inset -10px -4px 0 0 #a3dafb;
        }

        .wiki-theme-switch input:focus-visible + .wiki-theme-slider {
          outline: 2px solid #6f4cff;
          outline-offset: 2px;
        }

        .wiki-theme-switch input:disabled + .wiki-theme-slider {
          cursor: default;
          opacity: 0.9;
        }
      `}</style>
    </>
  );
}

// C:\next\rdwiki\app\components\editor\DropdownButton.tsx
'use client';

/**
 * 에디터 툴바 드롭다운 버튼
 * - label(표시명) + items(옵션 문자열 배열) 렌더링
 * - 드롭다운이 열릴 때 selectionRef에 현재 selection 저장
 * - 항목 클릭(또는 Enter/Space) 시 selectionRef로 커서 복원 → 포커스 → 해당 마크/동작 수행
 * - 열림/닫힘은 부모의 openDropdown 상태로 제어(동일 툴바 내 상호 배타 열림)
 * - (옵션) itemsMap으로 표시 라벨 → 실제 값 매핑 가능
 * - ✅ 드롭다운이 오른쪽/컨테이너에 의해 잘리지 않도록 필요 시 position:fixed 로 전환
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSlate, ReactEditor } from 'slate-react';
import { Editor, Range, Transforms } from 'slate';

type DropdownButtonProps = {
  label: React.ReactNode;
  items: string[];
  /** 표시 라벨 → 실제 값 매핑(없으면 라벨 그대로 값 사용) */
  itemsMap?: Record<string, string>;
  /** 선택 시 외부 동작 처리(없으면 기본: mark 추가) */
  onSelect?: (appliedValue: string) => void;
  selectionRef: React.MutableRefObject<Range | null>;
  dropdownId: string;
  openDropdown: string | null;
  setOpenDropdown: (id: string | null) => void;
  /** 이 드롭다운 메뉴의 최소 너비(px) – 표 생성 메뉴만 260~280 정도로 키워서 사용 */
  menuMinWidth?: number;
  disabled?: boolean;
};

type ToolbarActionMeta = {
  action: 'symbol' | 'wiki-reference';
  title: string;
  glyph: string;
};

const TOOLBAR_ACTION_META: Record<string, ToolbarActionMeta> = {
  'inline-mark': {
    action: 'symbol',
    title: '기호 삽입',
    glyph: 'Ω',
  },
  'wiki-ref': {
    action: 'wiki-reference',
    title: '퀘스트·NPC·FAQ 할당',
    glyph: 'Q+',
  },
  'wiki-reference': {
    action: 'wiki-reference',
    title: '퀘스트·NPC·FAQ 할당',
    glyph: 'Q+',
  },
  'wiki-assignment': {
    action: 'wiki-reference',
    title: '퀘스트·NPC·FAQ 할당',
    glyph: 'Q+',
  },
  'wiki-db': {
    action: 'wiki-reference',
    title: '퀘스트·NPC·FAQ 할당',
    glyph: 'Q+',
  },
};

const DEFAULT_MENU_EST_WIDTH = 260; // 오른쪽 오버플로우 감지용 기본 값

const DropdownButton = ({
  label,
  items,
  itemsMap,
  onSelect,
  selectionRef,
  dropdownId,
  openDropdown,
  setOpenDropdown,
  menuMinWidth,
  disabled,
}: DropdownButtonProps) => {
  const editor = useSlate();
  const isOpen = openDropdown === dropdownId;
  const toolbarAction = TOOLBAR_ACTION_META[dropdownId];

  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [fixedPos, setFixedPos] =
    useState<null | { top: number; left: number; alignRight: boolean }>(null);

  const menuWidth = menuMinWidth ?? 180;
  const estWidth = menuMinWidth ?? DEFAULT_MENU_EST_WIDTH;

  // 열릴 때 selection 저장 + 메뉴 위치 계산
  const openMenu = useCallback(() => {
    selectionRef.current = editor.selection ?? null;
    setOpenDropdown(dropdownId);

    requestAnimationFrame(() => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) {
        setFixedPos(null);
        return;
      }
      const rightSpace = window.innerWidth - r.left;
      const needFixed = rightSpace < estWidth + 16;
      if (!needFixed) {
        setFixedPos(null);
        return;
      }
      setFixedPos({
        top: Math.round(r.bottom + 6),
        left: Math.round(r.right),
        alignRight: true,
      });
    });
  }, [dropdownId, editor.selection, estWidth, selectionRef, setOpenDropdown]);

  const closeMenu = useCallback(() => {
    setOpenDropdown(null);
    setFixedPos(null);
  }, [setOpenDropdown]);

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!isOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      closeMenu();
    };
    window.addEventListener('mousedown', onDown, { capture: true });
    return () => window.removeEventListener('mousedown', onDown, { capture: true } as any);
  }, [isOpen, closeMenu]);

  // 스크롤/리사이즈 시 fixed 위치 재계산
  useEffect(() => {
    if (!isOpen || !fixedPos) return;
    const recalc = () => {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setFixedPos((prev) =>
        prev
          ? { top: Math.round(r.bottom + 6), left: Math.round(r.right), alignRight: true }
          : null,
      );
    };
    window.addEventListener('scroll', recalc, true);
    window.addEventListener('resize', recalc);
    return () => {
      window.removeEventListener('scroll', recalc, true);
      window.removeEventListener('resize', recalc);
    };
  }, [isOpen, fixedPos]);

  const handleSelect = useCallback(
    (itemLabel: string) => {
      const applied = itemsMap?.[itemLabel] ?? itemLabel;

      setTimeout(() => {
        try {
          if (selectionRef.current) {
            Transforms.select(editor, selectionRef.current);
          }
          ReactEditor.focus(editor);
          if (onSelect) {
            onSelect(applied);
          } else {
            Editor.addMark(editor, dropdownId, applied);
          }
        } catch {
          /* no-op */
        }
      }, 0);

      closeMenu();
    },
    [dropdownId, editor, itemsMap, onSelect, selectionRef, closeMenu],
  );

  const onItemKeyDown: React.KeyboardEventHandler<HTMLLIElement> = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const label = (e.currentTarget.getAttribute('data-value') ?? '') as string;
      handleSelect(label);
    }
  };

  const onMenuKeyDown: React.KeyboardEventHandler<HTMLUListElement> = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
      setTimeout(() => ReactEditor.focus(editor), 0);
    }
  };

  return (
    <div className="editor-dropdown" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={btnRef}
        type="button"
        title={toolbarAction?.title}
        aria-label={toolbarAction?.title}
        data-toolbar-action={toolbarAction?.action}
        disabled={!!disabled}
        onMouseDown={(e) => {
          e.preventDefault();
          if (disabled) return;
          isOpen ? closeMenu() : openMenu();
        }}
        className="editor-toolbar-btn"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? `${dropdownId}-menu` : undefined}
        style={{
          opacity: disabled ? 0.45 : 1,       // ✅ 선택: 비활성 느낌
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
      >
        {toolbarAction ? (
          <span
            className={`editor-toolbar-action-icon editor-toolbar-action-icon--${toolbarAction.action}`}
            aria-hidden="true"
          >
            {toolbarAction.glyph}
          </span>
        ) : (
          label
        )}
      </button>

      {/* 일반(absolute) 메뉴 */}
      {isOpen && !fixedPos && items.length > 0 && (
        <ul
          ref={menuRef}
          id={`${dropdownId}-menu`}
          className="editor-dropdown-menu"
          role="menu"
          aria-label={typeof label === 'string' ? label : undefined}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            minWidth: menuWidth,
            background: 'var(--editor-panel-elevated)',
            border: '1px solid var(--editor-border)',
            borderRadius: 10,
            boxShadow: 'var(--editor-shadow)',
            padding: 6,
            zIndex: 1000,
          }}
        >
          {items.map((itemLabel, idx) => (
            <li
              key={idx}
              role="menuitem"
              tabIndex={0}
              data-value={itemLabel}
              onMouseDown={() => handleSelect(itemLabel)}
              onKeyDown={onItemKeyDown}
              style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}
              onMouseEnter={(e) => (
                e.currentTarget.style.background = 'var(--editor-accent-softer)'
              )}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {itemLabel}
            </li>
          ))}
        </ul>
      )}

      {/* 오른쪽 잘림 방지: 화면 고정 메뉴 */}
      {isOpen && fixedPos && items.length > 0 && (
        <ul
          ref={menuRef}
          id={`${dropdownId}-menu`}
          className="editor-dropdown-menu editor-dropdown-menu--fixed"
          role="menu"
          aria-label={typeof label === 'string' ? label : undefined}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'fixed',
            top: fixedPos.top,
            left: fixedPos.left,
            transform: fixedPos.alignRight ? 'translateX(-100%)' : undefined,
            minWidth: menuWidth,
            background: 'var(--editor-panel-elevated)',
            border: '1px solid var(--editor-border)',
            borderRadius: 10,
            boxShadow: 'var(--editor-shadow)',
            padding: 6,
            zIndex: 10000,
          }}
        >
          {items.map((itemLabel, idx) => (
            <li
              key={idx}
              role="menuitem"
              tabIndex={0}
              data-value={itemLabel}
              onMouseDown={() => handleSelect(itemLabel)}
              onKeyDown={onItemKeyDown}
              style={{ padding: '8px 12px', borderRadius: 8, cursor: 'pointer' }}
              onMouseEnter={(e) => (
                e.currentTarget.style.background = 'var(--editor-accent-softer)'
              )}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              {itemLabel}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default React.memo(DropdownButton);

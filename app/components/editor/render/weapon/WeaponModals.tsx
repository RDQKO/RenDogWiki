// app/components/editor/render/weapon/WeaponModals.tsx
import React from 'react';
import ReactDOM from 'react-dom';

import type {
  WeaponStatConfig,
  WeaponStatKey,
  WeaponType,
} from '@/types/slate';

import {
  WEAPON_TYPES_META,
  createEmptyWeaponStat,
  ensureWeaponStats,
  getWeaponLevelLabels,
  normalizeStatLevels,
} from './weaponStatUtils';

// -------------------- 공통 Portal 래퍼 --------------------

const ModalPortal: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  // SSR 환경에서는 document가 없으므로 방어
  if (typeof document === 'undefined') return null;

  return ReactDOM.createPortal(children, document.body);
};

// -------------------- 공통: 모달 키보드 핫키 --------------------
// - Enter: 확인/저장
// - Escape: 닫기
// - Slate/에디터가 이벤트를 먹는 경우가 있어 capture=true로 먼저 잡음
// - 한글 IME 조합 중 Enter 오작동 방지
// - textarea/contentEditable에서는 Enter를 뺏지 않음
const useModalHotkeys = (params: {
  open: boolean;
  onEnter?: () => void;
  onEscape?: () => void;
  disabled?: boolean;
}) => {
  const {
    open,
    onEnter,
    onEscape,
    disabled,
  } = params;

  React.useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (disabled) return;
      // A nested picker/dialog owns its keyboard events.
      if ((event.target as HTMLElement | null)?.closest('[data-rdwiki-modal]')) return;

      const composingEvent = event as KeyboardEvent & {
        isComposing?: boolean;
        keyCode?: number;
      };

      // IME(한글 조합) 중 Enter 트리거 방지
      // 일부 환경에서는 keyCode=229로도 들어옴
      if (
        composingEvent.isComposing ||
        composingEvent.keyCode === 229
      ) {
        return;
      }

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      const isTextArea = tagName === 'textarea';
      const isContentEditable = Boolean(
        target && target.isContentEditable,
      );

      if (event.key === 'Escape') {
        if (!onEscape) return;

        event.preventDefault();
        event.stopPropagation();
        onEscape();
        return;
      }

      if (event.key === 'Enter') {
        if (!onEnter) return;
        if (isTextArea || isContentEditable) return;

        event.preventDefault();
        event.stopPropagation();
        onEnter();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);

    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [
    open,
    onEnter,
    onEscape,
    disabled,
  ]);
};

// -------------------- Weapon Type Select Modal --------------------

export type WeaponTypeSelectModalProps = {
  open: boolean;
  currentType: WeaponType;
  onClose: () => void;
  onSelect: (type: WeaponType) => void;
};

export const WeaponTypeSelectModal: React.FC<
  WeaponTypeSelectModalProps
> = ({
  open,
  currentType,
  onClose,
  onSelect,
}) => {
  const types: WeaponType[] = [
    'block',
    'epic',
    'unique',
    'legendary',
    'divine',
    'superior',
    'class',
    'hidden',
    'limited',
    'ancient',
    'boss',
    'mini-boss',
    'monster',
    'rune',
    'fishing-rod',
    'transcend-epic',
    'transcend-unique',
    'transcend-legend',
    'transcend-divine',
    'transcend-superior',
    'armor',
    'weapon',
    'spirit',
  ];

  // 선택 모달은 Enter로 확정할 대상이 명확하지 않으므로
  // 기존 선택 방식은 유지하고 Esc 닫기만 제공한다.
  useModalHotkeys({
    open,
    onEscape: onClose,
  });

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        contentEditable={false}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
        onMouseDown={onClose}
      >
        <div
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            width: 360,
            maxWidth: '90%',
            maxHeight: 'calc(100dvh - 40px)',
            overflowY: 'auto',
            borderRadius: 14,
            background: '#020617',
            padding: '16px 18px 14px',
            boxShadow: '0 18px 40px rgba(0,0,0,.55)',
            color: '#e5e7eb',
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 10,
            }}
          >
            무기 유형 선택
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
              gap: 8,
              marginBottom: 14,
            }}
          >
            {types.map((type) => {
              const meta = WEAPON_TYPES_META[type];
              const active = type === currentType;

              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    onSelect(type);
                  }}
                  style={{
                    borderRadius: 999,
                    border: active
                      ? 'none'
                      : '1px solid #1f2937',
                    padding: '6px 0',
                    background: active
                      ? meta.headerBg
                      : 'linear-gradient(90deg,#020617,#020617)',
                    color: active
                      ? '#f9fafb'
                      : '#9ca3af',
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: 1,
                    cursor: 'pointer',
                  }}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>

          <div style={{ textAlign: 'right' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 999,
                border: '1px solid #4b5563',
                padding: '5px 14px',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

// -------------------- Weapon Name Edit Modal --------------------

export type WeaponNameEditModalProps = {
  open: boolean;
  initialName: string;
  onClose: () => void;
  onSave: (name: string) => void;
};

export const WeaponNameEditModal: React.FC<
  WeaponNameEditModalProps
> = ({
  open,
  initialName,
  onClose,
  onSave,
}) => {
  const [name, setName] = React.useState(
    initialName || '',
  );

  React.useEffect(() => {
    if (!open) return;

    setName(initialName || '');
  }, [
    open,
    initialName,
  ]);

  const handleSave = React.useCallback(() => {
    onSave(name.trim() || '새 무기 이름');
  }, [
    name,
    onSave,
  ]);

  useModalHotkeys({
    open,
    onEnter: handleSave,
    onEscape: onClose,
  });

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        contentEditable={false}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
        onMouseDown={onClose}
      >
        <div
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            width: 420,
            maxWidth: '90%',
            maxHeight: 'calc(100dvh - 40px)',
            overflowY: 'auto',
            borderRadius: 14,
            background: '#020617',
            padding: '18px 20px 16px',
            boxShadow: '0 18px 40px rgba(0,0,0,.55)',
            color: '#e5e7eb',
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            무기 이름 수정
          </div>

          <input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
            placeholder="무기 이름"
            autoFocus
            style={{
              width: '100%',
              borderRadius: 8,
              border: '1px solid #4b5563',
              background: '#020617',
              padding: '8px 10px',
              color: '#e5e7eb',
              fontSize: 14,
              outline: 'none',
            }}
          />

          <div
            style={{
              marginTop: 14,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 999,
                border: '1px solid #4b5563',
                padding: '6px 14px',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              닫기
            </button>

            <button
              type="button"
              onClick={handleSave}
              style={{
                borderRadius: 999,
                border: 'none',
                padding: '6px 16px',
                background: '#2563eb',
                color: '#f9fafb',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

// -------------------- Weapon Stat Edit Modal --------------------

export type WeaponStatEditModalProps = {
  open: boolean;
  weaponType: WeaponType;
  stats: WeaponStatConfig[];
  statKey: WeaponStatKey | null;
  readOnly: boolean;
  onClose: () => void;
  onSave: (nextStat: WeaponStatConfig) => void;
};

export const WeaponStatEditModal: React.FC<
  WeaponStatEditModalProps
> = ({
  open,
  weaponType,
  stats,
  statKey,
  readOnly,
  onClose,
  onSave,
}) => {
  // Hook은 모든 렌더에서 같은 순서로 호출해야 하므로
  // statKey가 없을 때도 유효한 임시 키로 초기 상태를 만든다.
  const activeStatKey: WeaponStatKey =
    statKey ?? 'damage';

  const original =
    stats.find(
      (stat) => stat.key === activeStatKey,
    ) ||
    createEmptyWeaponStat(
      activeStatKey,
      weaponType,
      true,
    );

  const [local, setLocal] =
    React.useState<WeaponStatConfig>({
      ...original,
      levels: normalizeStatLevels(
        original.levels,
        weaponType,
      ),
    });

  React.useEffect(() => {
    if (!open || !statKey) return;

    const base =
      stats.find(
        (stat) => stat.key === statKey,
      ) ||
      createEmptyWeaponStat(
        statKey,
        weaponType,
        true,
      );

    setLocal({
      ...base,
      levels: normalizeStatLevels(
        base.levels,
        weaponType,
      ),
    });
  }, [
    open,
    statKey,
    stats,
    weaponType,
  ]);

  const levels = getWeaponLevelLabels(
    weaponType,
  );

  const handleLevelChange = (
    index: number,
    value: string,
  ) => {
    setLocal((previous) => ({
      ...previous,
      levels: previous.levels.map(
        (level, levelIndex) =>
          levelIndex === index
            ? {
                ...level,
                value,
              }
            : level,
      ),
    }));
  };

  const handleSave = React.useCallback(() => {
    onSave({
      ...local,
      levels: normalizeStatLevels(
        local.levels,
        weaponType,
      ),
    });
  }, [
    local,
    onSave,
    weaponType,
  ]);

  useModalHotkeys({
    open: open && Boolean(statKey),
    onEnter: readOnly
      ? undefined
      : handleSave,
    onEscape: onClose,
  });

  if (!open || !statKey) return null;

  return (
    <ModalPortal>
      <div
        contentEditable={false}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
        onMouseDown={onClose}
      >
        <div
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            width: 420,
            maxWidth: '95%',
            maxHeight: '90vh',
            overflow: 'auto',
            borderRadius: 14,
            background: '#020617',
            padding: '18px 20px 16px',
            boxShadow: '0 18px 40px rgba(0,0,0,.55)',
            color: '#e5e7eb',
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 12,
            }}
          >
            무기 정보 편집
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 2fr 1fr',
              gap: 8,
              marginBottom: 10,
              fontSize: 12,
              color: '#9ca3af',
            }}
          >
            <span>표시 이름</span>
            <span>요약 값</span>
            <span>단위</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2fr 2fr 1fr',
              gap: 8,
              marginBottom: 14,
            }}
          >
            <input
              value={local.label}
              readOnly={readOnly}
              onChange={(event) => {
                setLocal((previous) => ({
                  ...previous,
                  label: event.target.value,
                }));
              }}
              style={{
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#020617',
                padding: '7px 8px',
                color: '#e5e7eb',
                fontSize: 14,
                width: 100,
                outline: 'none',
              }}
            />

            <input
              value={local.summary}
              readOnly={readOnly}
              onChange={(event) => {
                setLocal((previous) => ({
                  ...previous,
                  summary: event.target.value,
                }));
              }}
              style={{
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#020617',
                padding: '7px 8px',
                color: '#e5e7eb',
                fontSize: 14,
                width: 100,
                outline: 'none',
              }}
            />

            <input
              value={local.unit ?? ''}
              readOnly={readOnly}
              onChange={(event) => {
                setLocal((previous) => ({
                  ...previous,
                  unit: event.target.value,
                }));
              }}
              style={{
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#020617',
                padding: '7px 8px',
                color: '#e5e7eb',
                fontSize: 14,
                width: 100,
                outline: 'none',
              }}
            />
          </div>

          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            강화별 상세 값
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 3fr',
              gap: 6,
            }}
          >
            {levels.map((label, index) => (
              <React.Fragment key={label}>
                <div
                  style={{
                    fontSize: 12,
                    color: '#9ca3af',
                    paddingTop: 4,
                  }}
                >
                  {label}
                </div>

                <input
                  value={
                    local.levels[index]?.value ??
                    ''
                  }
                  readOnly={readOnly}
                  onChange={(event) => {
                    handleLevelChange(
                      index,
                      event.target.value,
                    );
                  }}
                  style={{
                    borderRadius: 8,
                    border: '1px solid #4b5563',
                    background: '#020617',
                    padding: '6px 8px',
                    color: '#e5e7eb',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
              </React.Fragment>
            ))}
          </div>

          <div
            style={{
              marginTop: 16,
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 999,
                border: '1px solid #4b5563',
                padding: '6px 14px',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              닫기
            </button>

            {!readOnly ? (
              <button
                type="button"
                onClick={handleSave}
                style={{
                  borderRadius: 999,
                  border: 'none',
                  padding: '6px 16px',
                  background: '#2563eb',
                  color: '#f9fafb',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                저장
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

// -------------------- Weapon Stat Select Modal --------------------

export type WeaponStatSelectModalProps = {
  open: boolean;
  weaponType: WeaponType;
  stats: WeaponStatConfig[];
  onClose: () => void;
  onSave: (
    nextStats: WeaponStatConfig[],
  ) => void;
};

export const WeaponStatSelectModal: React.FC<
  WeaponStatSelectModalProps
> = ({
  open,
  weaponType,
  stats,
  onClose,
  onSave,
}) => {
  const base = React.useMemo(
    () =>
      ensureWeaponStats(
        stats,
        weaponType,
      ),
    [
      stats,
      weaponType,
    ],
  );

  const maxCount = base.length;

  const getEnabledCount =
    React.useCallback(
      () =>
        base.filter(
          (stat) => stat.enabled,
        ).length,
      [base],
    );

  const [count, setCount] =
    React.useState<number>(
      () => getEnabledCount(),
    );

  // 모달을 다시 열거나 실제 스탯 구성이 바뀌면
  // 현재 enabled 상태를 기준으로 입력값을 초기화한다.
  React.useEffect(() => {
    if (!open) return;

    setCount(getEnabledCount());
  }, [
    open,
    getEnabledCount,
  ]);

  const clamp = React.useCallback(
    (value: number) => {
      if (Number.isNaN(value)) return 0;
      if (value < 0) return 0;
      if (value > maxCount) {
        return maxCount;
      }

      return value;
    },
    [maxCount],
  );

  const handleChange = (
    nextCount: number,
  ) => {
    setCount(clamp(nextCount));
  };

  const handleSave = React.useCallback(() => {
    const originalEnabledIndices:
      number[] = [];

    base.forEach((stat, index) => {
      if (stat.enabled) {
        originalEnabledIndices.push(
          index,
        );
      }
    });

    const oldCount =
      originalEnabledIndices.length;

    const target = clamp(count);

    // 깊은 복사로 기존 데이터의 불변성을 유지한다.
    const nextStats = base.map(
      (stat) => ({
        ...stat,
      }),
    );

    if (target === oldCount) {
      onSave(nextStats);
      return;
    }

    if (target < oldCount) {
      // 현재 활성화된 항목 중 뒤쪽부터 비활성화한다.
      const toDisable =
        originalEnabledIndices.slice(
          target,
        );

      toDisable.forEach((index) => {
        nextStats[index] = {
          ...nextStats[index],
          enabled: false,
        };
      });
    } else {
      // 비활성 항목 중 앞쪽부터 필요한 수만큼 활성화한다.
      let remaining =
        target - oldCount;

      for (
        let index = 0;
        index < nextStats.length &&
        remaining > 0;
        index += 1
      ) {
        if (!nextStats[index].enabled) {
          nextStats[index] = {
            ...nextStats[index],
            enabled: true,
          };

          remaining -= 1;
        }
      }
    }

    onSave(nextStats);
  }, [
    base,
    clamp,
    count,
    onSave,
  ]);

  useModalHotkeys({
    open,
    onEnter: handleSave,
    onEscape: onClose,
  });

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        contentEditable={false}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2000,
        }}
        onMouseDown={onClose}
      >
        <div
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            width: 380,
            maxWidth: '90%',
            maxHeight: 'calc(100dvh - 40px)',
            overflowY: 'auto',
            borderRadius: 14,
            background: '#020617',
            padding: '16px 18px 14px',
            boxShadow: '0 18px 40px rgba(0,0,0,.55)',
            color: '#e5e7eb',
          }}
        >
          <div
            style={{
              fontSize: 16,
              fontWeight: 700,
              marginBottom: 8,
            }}
          >
            정보 항목 개수 설정
          </div>

          <div
            style={{
              fontSize: 12,
              color: '#9ca3af',
              marginBottom: 12,
              lineHeight: 1.5,
            }}
          >
            무기 카드에 표시할{' '}
            <b>정보 항목의 개수</b>를
            설정합니다.
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 10,
            }}
          >
            <button
              type="button"
              onClick={() => {
                handleChange(count - 1);
              }}
              style={{
                borderRadius: 999,
                border: '1px solid #4b5563',
                padding: '4px 10px',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              −
            </button>

            <input
              type="number"
              value={count}
              min={0}
              max={maxCount}
              onChange={(event) => {
                handleChange(
                  Number(event.target.value),
                );
              }}
              style={{
                width: 80,
                textAlign: 'center',
                borderRadius: 8,
                border: '1px solid #4b5563',
                background: '#020617',
                padding: '6px 8px',
                color: '#e5e7eb',
                fontSize: 14,
                outline: 'none',
              }}
            />

            <button
              type="button"
              onClick={() => {
                handleChange(count + 1);
              }}
              style={{
                borderRadius: 999,
                border: '1px solid #4b5563',
                padding: '4px 10px',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              +
            </button>

            <span
              style={{
                fontSize: 11,
                color: '#9ca3af',
              }}
            >
              최대 {maxCount}개
            </span>
          </div>

          <div
            style={{
              fontSize: 11,
              color: '#6b7280',
              marginBottom: 12,
            }}
          >
            현재 설정된 개수:{' '}
            <b>{count}개</b>
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 999,
                border: '1px solid #4b5563',
                padding: '5px 14px',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              닫기
            </button>

            <button
              type="button"
              onClick={handleSave}
              style={{
                borderRadius: 999,
                border: 'none',
                padding: '5px 16px',
                background: '#2563eb',
                color: '#f9fafb',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};

// -------------------- Weapon Video Modal --------------------

export type WeaponVideoModalProps = {
  open: boolean;
  url: string;
  onClose: () => void;
};

export const WeaponVideoModal: React.FC<
  WeaponVideoModalProps
> = ({
  open,
  url,
  onClose,
}) => {
  // 영상 모달에는 Enter 동작이 없으므로 Esc 닫기만 사용한다.
  useModalHotkeys({
    open,
    onEscape: onClose,
  });

  if (!open) return null;

  return (
    <ModalPortal>
      <div
        contentEditable={false}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,.75)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 2100,
        }}
        onMouseDown={onClose}
      >
        <div
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          style={{
            width: 'min(960px, 90vw)',
            maxHeight: '80vh',
            background: '#020617',
            borderRadius: 14,
            boxShadow: '0 20px 50px rgba(0,0,0,.75)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              borderBottom:
                '1px solid #111827',
              display: 'flex',
              justifyContent:
                'space-between',
              alignItems: 'center',
              color: '#e5e7eb',
              fontSize: 14,
            }}
          >
            <span>공격 영상</span>

            <button
              type="button"
              onClick={onClose}
              style={{
                borderRadius: 999,
                border: '1px solid #4b5563',
                padding: '3px 10px',
                background: '#020617',
                color: '#e5e7eb',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              닫기
            </button>
          </div>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              background: '#000',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 8,
            }}
          >
            <video
              src={url}
              controls
              controlsList="nodownload"
              playsInline
              style={{
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                background: '#000',
              }}
            />
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
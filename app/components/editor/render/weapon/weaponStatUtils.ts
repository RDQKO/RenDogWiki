import type {
  WeaponStatConfig,
  WeaponStatKey,
  WeaponType,
} from '@/types/slate';

import {
  WEAPON_TYPES_META as SHARED_WEAPON_TYPES_META,
} from '@/components/wiki-render/weapon/weaponMeta';

/**
 * 무기 유형 메타데이터의 단일 원본은
 * app/components/wiki-render/weapon/weaponMeta.ts 이다.
 *
 * 기존 호출부 호환을 위해 같은 이름으로 다시 export한다.
 */
export const WEAPON_TYPES_META =
  SHARED_WEAPON_TYPES_META as Record<
    WeaponType,
    {
      label: string;
      headerBg: string;
      border: string;
      badgeBg: string;
    }
  >;

export const ALL_WEAPON_STAT_KEYS: WeaponStatKey[] = [
  'damage',
  'cooldown',
  'hitCount',
  'range',
  'duration',
  'heal',
  'custom-1',
  'custom-2',
  'custom-3',
  'custom-4',
  'custom-5',
  'custom-6',
  'custom-7',
  'custom-8',
  'custom-9',
];

export const WEAPON_STAT_PRESET: Record<
  WeaponStatKey,
  {
    label: string;
    defaultUnit?: string;
  }
> = {
  damage: {
    label: '데미지',
  },
  cooldown: {
    label: '쿨타임',
    defaultUnit: '초',
  },
  hitCount: {
    label: '타수',
    defaultUnit: '타',
  },
  range: {
    label: '범위',
  },
  duration: {
    label: '지속시간',
    defaultUnit: '초',
  },
  heal: {
    label: '회복량',
  },
  'custom-1': { label: '정보 7' },
  'custom-2': { label: '정보 8' },
  'custom-3': { label: '정보 9' },
  'custom-4': { label: '정보 10' },
  'custom-5': { label: '정보 11' },
  'custom-6': { label: '정보 12' },
  'custom-7': { label: '정보 13' },
  'custom-8': { label: '정보 14' },
  'custom-9': { label: '정보 15' },

};

export function getWeaponLevelLabels(
  type: WeaponType,
): string[] {
  switch (type) {
    case 'epic':
    case 'unique':
    case 'legendary':
    case 'divine':
    case 'superior':
      return [
        '1강',
        '2강',
        '3강',
        '4강',
        'MAX',
      ];

    case 'class':
      return [
        '1강',
        '2강',
        '3강',
        '4강',
        '5강',
        '6강',
        '7강',
        '8강',
        'MAX',
      ];

    case 'spirit':
      return [
        '1강',
        '2강',
        '3강',
        '4강',
        '5강',
        '6강',
        '7강',
        '8강',
        '9강',
        '10강',
        '11강',
        '12강',
        '13강',
        '14강',
        '15강',
      ];

    case 'block':
    case 'hidden':
    case 'limited':
    case 'ancient':
    case 'transcend-epic':
    case 'transcend-unique':
    case 'transcend-legend':
    case 'transcend-divine':
    case 'transcend-superior':
    default:
      return ['기본'];
  }
}

function hasWeaponStatValue(
  value: unknown,
) {
  const text = String(
    value ?? '',
  ).trim();

  return (
    text !== '' &&
    text !== '-'
  );
}

function pickSingleLevelValue(
  levels:
    | WeaponStatConfig['levels']
    | undefined,
) {
  const list =
    Array.isArray(levels)
      ? levels
      : [];

  const basic = list.find(
    (level) => {
      const label = String(
        level?.levelLabel ?? '',
      ).trim();

      return (
        label === '기본' &&
        hasWeaponStatValue(
          level?.value,
        )
      );
    },
  );

  if (basic) {
    return basic.value ?? '';
  }

  const max = [
    ...list,
  ]
    .reverse()
    .find((level) => {
      const label = String(
        level?.levelLabel ?? '',
      )
        .trim()
        .toUpperCase();

      return (
        (
          label === 'MAX' ||
          label === 'M'
        ) &&
        hasWeaponStatValue(
          level?.value,
        )
      );
    });

  if (max) {
    return max.value ?? '';
  }

  const lastFilled = [
    ...list,
  ]
    .reverse()
    .find((level) =>
      hasWeaponStatValue(
        level?.value,
      ),
    );

  if (lastFilled) {
    return (
      lastFilled.value ?? ''
    );
  }

  return list[0]?.value ?? '';
}

export function normalizeStatLevels(
  levels:
    | WeaponStatConfig['levels']
    | undefined,
  type: WeaponType,
): WeaponStatConfig['levels'] {
  const labels =
    getWeaponLevelLabels(type);

  const list =
    levels ?? [];

  if (labels.length === 1) {
    return [
      {
        levelLabel:
          labels[0],
        value:
          pickSingleLevelValue(
            list,
          ),
      },
    ];
  }

  return labels.map(
    (
      label,
      index,
    ) => {
      const exact =
        list.find(
          (level) =>
            String(
              level?.levelLabel ??
                '',
            ).trim() ===
            label,
        );

      return {
        levelLabel: label,
        value:
          exact?.value ??
          list[index]?.value ??
          '',
      };
    },
  );
}

export function createEmptyWeaponStat(
  key: WeaponStatKey,
  type: WeaponType,
  enabled: boolean,
): WeaponStatConfig {
  return {
    key,
    label: '',
    summary: '',
    unit: '',
    enabled,
    levels:
      normalizeStatLevels(
        [],
        type,
      ),
  };
}

/**
 * 현재 stats 배열을 기준으로:
 * - 모든 stat 키가 존재하도록 보충
 * - 무기 유형에 맞게 강화 단계 정규화
 * - 레거시 기본값만 남은 비활성 스탯 초기화
 */
export function ensureWeaponStats(
  stats:
    | WeaponStatConfig[]
    | undefined,
  type: WeaponType,
): WeaponStatConfig[] {
  const map =
    new Map<
      WeaponStatKey,
      WeaponStatConfig
    >();

  (stats ?? []).forEach(
    (stat) => {
      map.set(
        stat.key,
        stat,
      );
    },
  );

  return ALL_WEAPON_STAT_KEYS.map(
    (key) => {
      const existing =
        map.get(key);

      if (!existing) {
        return createEmptyWeaponStat(
          key,
          type,
          false,
        );
      }

      if (!existing.enabled) {
        const preset =
          WEAPON_STAT_PRESET[key];

        const levels =
          existing.levels ?? [];

        const allLevelEmpty =
          !levels.length ||
          levels.every(
            (level) =>
              !level.value ||
              String(
                level.value,
              ).trim() === '',
          );

        const looksLikeLegacyPreset =
          (
            !existing.label ||
            existing.label ===
              preset.label
          ) &&
          (
            !existing.unit ||
            existing.unit ===
              preset.defaultUnit
          ) &&
          (
            !existing.summary ||
            existing.summary.trim() ===
              ''
          ) &&
          allLevelEmpty;

        if (
          looksLikeLegacyPreset
        ) {
          return createEmptyWeaponStat(
            key,
            type,
            false,
          );
        }
      }

      return {
        ...existing,
        levels:
          normalizeStatLevels(
            existing.levels,
            type,
          ),
      };
    },
  );
}

export function normalizeStatsForWeaponType(
  stats:
    | WeaponStatConfig[]
    | undefined,
  type: WeaponType,
): WeaponStatConfig[] {
  return ensureWeaponStats(
    stats,
    type,
  ).map((stat) => ({
    ...stat,
    levels:
      normalizeStatLevels(
        stat.levels,
        type,
      ),
  }));
}
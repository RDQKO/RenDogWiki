/** Parse bounded integers without treating a missing query parameter as zero. */
export function boundedInteger(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value == null || (typeof value === 'string' && !value.trim())) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.trunc(parsed)))
    : fallback;
}

export function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

/** SQL parameters prevent injection; escaping also makes % and _ literal search text. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

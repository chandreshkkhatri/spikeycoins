/**
 * Safely converts a value to a valid number
 * Returns fallback if value is NaN, null, undefined, or Infinity
 */
export function toSafeNumber(
  value: unknown,
  fallback: number = 0
): number {
  if (value === null || value === undefined) return fallback;

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (!Number.isFinite(num)) return fallback;

  return num;
}

/**
 * Type guard to check if value is a valid finite number
 */
export function isValidNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

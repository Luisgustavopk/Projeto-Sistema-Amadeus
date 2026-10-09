export interface Preferences {
  subtitles: boolean;
  tracking: boolean;
  effects: boolean;
  zoom: number;
}
export const STORAGE_KEY = 'amadeus.web.preferences.v1';
export const DEFAULTS = Object.freeze({
  subtitles: true,
  tracking: true,
  effects: true,
  zoom: 100,
});

export function sanitizePreferences(value: unknown): Preferences {
  const result: Preferences = { ...DEFAULTS };
  if (!value || typeof value !== 'object') return result;
  const input = value as Record<string, unknown>;
  for (const key of ['subtitles', 'tracking', 'effects'] as const) {
    if (typeof input[key] === 'boolean') result[key] = input[key];
  }
  if (typeof input.zoom === 'number' && Number.isFinite(input.zoom))
    result.zoom = Math.min(140, Math.max(80, input.zoom));
  return result;
}

export function loadPreferences(
  storage: Pick<Storage, 'getItem'>,
): Preferences {
  try {
    return sanitizePreferences(
      JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null'),
    );
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePreferences(
  storage: Pick<Storage, 'setItem'>,
  value: Preferences,
): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(sanitizePreferences(value)));
    return true;
  } catch {
    return false;
  }
}

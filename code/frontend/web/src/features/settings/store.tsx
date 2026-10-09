import { createContext, useContext, type PropsWithChildren } from 'react';
import type { Preferences } from './preferences';
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULTS,
  loadPreferences,
  savePreferences,
  sanitizePreferences,
} from './preferences';

export function useCreateSettingsStore() {
  const [preferences, setPreferences] = useState(() => {
    try {
      return loadPreferences(localStorage);
    } catch {
      return { ...DEFAULTS };
    }
  });
  useEffect(() => {
    document.body.dataset.effects = String(preferences.effects);
    return () => {
      delete document.body.dataset.effects;
    };
  }, [preferences.effects]);
  const change = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) =>
      setPreferences((previous) =>
        previous[key] === value
          ? previous
          : sanitizePreferences({ ...previous, [key]: value }),
      ),
    [],
  );
  const reset = useCallback(() => setPreferences({ ...DEFAULTS }), []);
  const save = () => {
    try {
      return savePreferences(localStorage, preferences);
    } catch {
      return false;
    }
  };
  return { preferences, change, reset, save };
}

export type SettingsStore = ReturnType<typeof useCreateSettingsStore>;
const Context = createContext<SettingsStore | null>(null);
export function SettingsProvider({ children }: PropsWithChildren) {
  const value = useCreateSettingsStore();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useSettings() {
  const value = useContext(Context);
  if (!value) throw new Error('SettingsProvider ausente.');
  return value;
}

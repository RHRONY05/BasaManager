/** Locales every build ships. `en-XA` (pseudo-locale for layout tests) is dev/test only. */
export function knownLocales(mode: string): readonly string[] {
  return mode === 'production' ? ['en'] : ['en', 'en-XA'];
}

interface LngStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * Picks the UI locale: a known `?lng=` wins (and is remembered), else a known saved value, else `en`.
 * Unknown values are ignored so a shared link cannot flip a visitor into a test locale.
 */
export function resolveInitialLng(search: string, mode: string, storage: LngStorage | null): string {
  const known = knownLocales(mode);
  const urlLng = new URLSearchParams(search).get('lng');
  if (urlLng && known.includes(urlLng)) {
    try {
      storage?.setItem('bm.lng', urlLng);
    } catch {
      // Ignore storage errors
    }
    return urlLng;
  }
  try {
    const saved = storage?.getItem('bm.lng');
    if (saved && known.includes(saved)) return saved;
  } catch {
    // Ignore storage errors
  }
  return 'en';
}

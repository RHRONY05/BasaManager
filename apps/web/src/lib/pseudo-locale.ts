const ACCENT_MAP: Record<string, string> = {
  a: 'å',
  A: 'Å',
  b: 'ƀ',
  B: 'Ɓ',
  c: 'ç',
  C: 'Ç',
  d: 'ð',
  D: 'Ð',
  e: 'é',
  E: 'É',
  f: 'ƒ',
  F: 'Ƒ',
  g: 'ĝ',
  G: 'Ĝ',
  h: 'ĥ',
  H: 'Ĥ',
  i: 'î',
  I: 'Î',
  j: 'ĵ',
  J: 'Ĵ',
  k: 'ķ',
  K: 'Ķ',
  l: 'ļ',
  L: 'Ļ',
  m: 'm',
  M: 'M',
  n: 'ñ',
  N: 'Ñ',
  o: 'ő',
  O: 'Ő',
  p: 'þ',
  P: 'Þ',
  q: 'q',
  Q: 'Q',
  r: 'ŕ',
  R: 'Ŕ',
  s: 'š',
  S: 'Š',
  t: 'ţ',
  T: 'Ţ',
  u: 'û',
  U: 'Û',
  v: 'v',
  V: 'V',
  w: 'ŵ',
  W: 'Ŵ',
  x: 'x',
  X: 'X',
  y: 'ý',
  Y: 'Ý',
  z: 'ž',
  Z: 'Ž',
};

/**
 * Transforms an English string into pseudo-locale (en-XA):
 * - Replaces Latin characters with accented counterparts
 * - Preserves {{interpolation}} placeholders untouched
 * - Pads +40% with middle-dots (·) in breakable groups of 5
 * - Wraps in square brackets [ ... ]
 */
export function transformToPseudo(str: string): string {
  if (!str) return str;

  // Split around {{interpolation}} tokens
  const parts = str.split(/(\{\{[^{}]+\}\})/g);

  const transformed = parts
    .map((part) => {
      if (part.startsWith('{{') && part.endsWith('}}')) {
        return part;
      }
      let res = '';
      for (const char of part) {
        res += ACCENT_MAP[char] ?? char;
      }
      return res;
    })
    .join('');

  const padCount = Math.max(1, Math.floor(str.length * 0.4));
  // Group the padding in runs of 5 separated by spaces: a single unbroken run of 40+ dots is wider than
  // a 320px screen and can never wrap, which would flag false layout violations (real Bangla text wraps).
  const dots = Array.from({ length: Math.ceil(padCount / 5) }, (_, i) =>
    '·'.repeat(Math.min(5, padCount - i * 5)),
  ).join(' ');

  return `[${transformed}${dots}]`;
}

/**
 * Deeply transforms an object of translation strings into en-XA.
 */
export function generatePseudoLocale<T>(source: T): T {
  if (typeof source === 'string') {
    return transformToPseudo(source) as unknown as T;
  }
  if (Array.isArray(source)) {
    return source.map((item) => generatePseudoLocale(item)) as unknown as T;
  }
  if (source !== null && typeof source === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      result[key] = generatePseudoLocale(value);
    }
    return result as unknown as T;
  }
  return source;
}

import { describe, it, expect } from 'vitest';
import { transformToPseudo, generatePseudoLocale } from './pseudo-locale';

describe('transformToPseudo', () => {
  it('accents Latin characters, adds 40% dot padding, and wraps in brackets', () => {
    const input = 'Record payment';
    const result = transformToPseudo(input);

    expect(result).toBe('[Ŕéçőŕð þåýméñţ·····]');
    expect(result.startsWith('[')).toBe(true);
    expect(result.endsWith(']')).toBe(true);
    // Contains accented characters
    expect(result).toContain('Ŕ');
    expect(result).toContain('é');
    expect(result).toContain('ç');
    // Contains middle-dot padding
    expect(result).toContain('·');
  });

  it('preserves {{interpolation}} placeholders intact', () => {
    const input = 'Environment: {{env}}';
    const result = transformToPseudo(input);

    expect(result).toContain('{{env}}');
    expect(result.startsWith('[')).toBe(true);
    expect(result.endsWith(']')).toBe(true);
  });

  it('keeps the padding breakable: no unbroken run of more than 5 dots', () => {
    const result = transformToPseudo('x'.repeat(200));
    expect(result.match(/·+/g)!.every((run) => run.length <= 5)).toBe(true);
    expect(result.match(/·/g)!.length).toBe(80);
    expect(result.endsWith(']')).toBe(true);
  });

  it('handles empty strings gracefully', () => {
    expect(transformToPseudo('')).toBe('');
  });
});

describe('generatePseudoLocale', () => {
  it('recursively transforms nested translation objects', () => {
    const en = {
      nav: {
        home: 'Home',
      },
      status: {
        env: 'Environment: {{env}}',
      },
    };

    const pseudo = generatePseudoLocale(en);

    expect(pseudo.nav.home).toMatch(/^\[.+·+\]$/);
    expect(pseudo.status.env).toContain('{{env}}');
  });
});

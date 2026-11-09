import { describe, it, expect } from 'vitest';
import { encryptOAuthState, decryptOAuthState, getGoogleClient } from './google';
import type { Env } from '../../config/env';

describe('google oauth helpers', () => {
  const secret = 'super-secret-key-32-chars-minimum-123';
  const mockEnv = {
    GOOGLE_OAUTH_CLIENT_ID: 'client-id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
    APP_URL: 'http://localhost:5173',
  } as unknown as Env;

  it('initializes Google client with client credentials', () => {
    const client = getGoogleClient(mockEnv);
    expect(client).toBeDefined();
  });

  it('encrypts and decrypts state with secret', () => {
    const state = 'state-abc-123';
    const codeVerifier = 'verifier-xyz-789';

    const encrypted = encryptOAuthState({ state, codeVerifier }, secret);
    expect(typeof encrypted).toBe('string');

    const decrypted = decryptOAuthState(encrypted, secret);
    expect(decrypted).not.toBeNull();
    expect(decrypted?.state).toBe(state);
    expect(decrypted?.codeVerifier).toBe(codeVerifier);
  });

  it('returns null on invalid or tampered ciphertext', () => {
    expect(decryptOAuthState('bad:tampered:text', secret)).toBeNull();
  });
});

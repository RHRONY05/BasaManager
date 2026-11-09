import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Google } from 'arctic';
import type { Env } from '../../config/env';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

export interface GoogleClient {
  authorizationUrl: (options: { state: string; codeVerifier: string }) => URL;
  fetchProfile: (options: { code: string; codeVerifier: string }) => Promise<GoogleProfile>;
}

let testClient: GoogleClient | null = null;

export function setGoogleClientForTests(client: GoogleClient | null): void {
  testClient = client;
}

export function getGoogleClient(env: Env): GoogleClient {
  if (testClient) {
    return testClient;
  }

  const clientId = env.GOOGLE_OAUTH_CLIENT_ID || '';
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET || '';
  const redirectURI = `${env.APP_URL}/api/auth/google/callback`;
  const google = new Google(clientId, clientSecret, redirectURI);

  return {
    authorizationUrl: ({ state, codeVerifier }) => {
      return google.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email']);
    },
    fetchProfile: async ({ code, codeVerifier }) => {
      const tokens = await google.validateAuthorizationCode(code, codeVerifier);
      const accessToken = tokens.accessToken();
      const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Google userinfo request failed with status ${res.status}`);
      }
      const data = (await res.json()) as {
        sub: string;
        email: string;
        email_verified?: boolean;
        name?: string;
      };
      return {
        sub: data.sub,
        email: data.email,
        emailVerified: Boolean(data.email_verified),
        name: data.name || data.email.split('@')[0] || 'User',
      };
    },
  };
}

export interface OAuthStateData {
  state: string;
  codeVerifier: string;
  invite?: string;
}

/**
 * Encrypts OAuth state and PKCE verifier into a secure string for the cookie.
 */
export function encryptOAuthState(data: OAuthStateData, secret: string): string {
  const key = createHash('sha256').update(secret).digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('base64url')}.${encrypted.toString('base64url')}.${tag.toString('base64url')}`;
}

/**
 * Decrypts and verifies the OAuth state cookie.
 */
export function decryptOAuthState(token: string, secret: string): OAuthStateData | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [ivB64, encB64, tagB64] = parts;
    if (!ivB64 || !encB64 || !tagB64) return null;

    const key = createHash('sha256').update(secret).digest();
    const iv = Buffer.from(ivB64, 'base64url');
    const enc = Buffer.from(encB64, 'base64url');
    const tag = Buffer.from(tagB64, 'base64url');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(enc), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as OAuthStateData;
  } catch {
    return null;
  }
}

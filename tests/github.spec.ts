import axios from 'axios';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createAppJwt, getInstallationToken } from '../src/helpers/github';

// Mock axios default export (the helper calls axios(cfg))
vi.mock('axios', () => ({ default: vi.fn() }));

// Mock crypto.createSign to avoid requiring a real PEM for signing during tests
vi.mock('crypto', () => ({
  default: {
    createSign: () => ({
      update: () => void 0,
      end: () => void 0,
      sign: () => Buffer.from('dummy-signature'),
    }),
  },
}));

describe('helpers/github.ts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('createAppJwt returns a JWT with three Base64URL sections', () => {
    const dummyPem = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDg1eU5c2lq4RkK',
      'ZGF0YV9ub3RfcmVhbF9rZXk=',
      '-----END PRIVATE KEY-----',
    ].join('\n');

    const jwt = createAppJwt(1234, dummyPem);
    const parts = jwt.split('.');
    expect(parts.length).toBe(3);
    for (const p of parts) {
      expect(p).toMatch(/^[A-Za-z0-9\-_]+$/);
    }
  });

  it('getInstallationToken resolves token and expiry on 200', async () => {
    const token = 'ghs_test_token';
    const expires_at = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    (axios as unknown as { mockResolvedValueOnce: Function }).mockResolvedValueOnce({
      status: 200,
      data: { token, expires_at },
    });

    const res = await getInstallationToken({
      baseUrl: 'https://api.github.com',
      appId: 123,
      installationId: 456,
      privateKeyPem: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----',
    });

    expect(res).toEqual({ token, expires_at });
  });

  it('getInstallationToken throws on >= 400 responses', async () => {
    (axios as unknown as { mockResolvedValueOnce: Function }).mockResolvedValueOnce({
      status: 401,
      statusText: 'Unauthorized',
      data: { message: 'Bad credentials' },
    });

    await expect(
      getInstallationToken({
        baseUrl: 'https://api.github.com',
        appId: 123,
        installationId: 456,
        privateKeyPem: '-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----',
      }),
    ).rejects.toThrow(/GitHub token exchange failed: 401/);
  });
});
import { updateGithubCredentialById } from '../src/helpers/n8n-api';
import axios from 'axios';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

vi.mock('axios');

describe('helpers/n8n-api.ts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns UPDATED on 200', async () => {
    (axios as any).put = vi.fn().mockResolvedValue({
      status: 200,
      data: {}
    });

    const out = await updateGithubCredentialById({
      baseUrl: 'http://localhost:5678',
      apiKey: 'test',
      credentialId: '42',
      newAccessToken: 'ghs_xxx'
    });

    expect(out).toEqual({ updated: true });
  });

  it('returns NOT_SUPPORTED on 405', async () => {
    (axios as any).put = vi.fn().mockResolvedValue({
      status: 405,
      statusText: 'Method Not Allowed',
      data: {}
    });

    const out = await updateGithubCredentialById({
      baseUrl: 'http://localhost:5678',
      apiKey: 'test',
      credentialId: '42',
      newAccessToken: 'ghs_xxx'
    });

    expect(out).toEqual({ updated: false, reason: 'METHOD_NOT_ALLOWED' });
  });

  it('throws on other >= 400 statuses', async () => {
    (axios as any).put = vi.fn().mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      data: { error: 'boom' }
    });

    await expect(
      updateGithubCredentialById({
        baseUrl: 'http://localhost:5678',
        apiKey: 'test',
        credentialId: '42',
        newAccessToken: 'ghs_xxx'
      })
    ).rejects.toThrow(/Credential update failed: 500/);
  });
});
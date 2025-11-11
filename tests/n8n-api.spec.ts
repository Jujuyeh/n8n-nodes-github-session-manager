import axios from 'axios';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  listCredentials,
  createGithubApiCredential,
  listWorkflows,
  readWorkflow,
  updateWorkflow,
  rewireWorkflowsGithubCredential,
} from '../src/helpers/n8n-api';

// Mock axios with explicit get/post/put methods (the helpers call axios.get/post/put)
vi.mock('axios', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

const ax = axios as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

describe('helpers/n8n-api.ts', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('listCredentials returns array on 200', async () => {
    ax.get.mockResolvedValueOnce({
      status: 200,
      data: [
        { id: '1', name: 'GitHub Main', type: 'githubApi' },
        { id: '2', name: 'Other', type: 'httpBasicAuth' },
      ],
    });

    const creds = await listCredentials({ baseUrl: 'http://localhost:5678', apiKey: 'k' });
    expect(creds).toEqual([
      { id: '1', name: 'GitHub Main', type: 'githubApi' },
      { id: '2', name: 'Other', type: 'httpBasicAuth' },
    ]);
    expect(ax.get).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/credentials'),
      expect.objectContaining({ headers: expect.any(Object) }),
    );
  });

  it('createGithubApiCredential creates and returns summary on 201', async () => {
    ax.post.mockResolvedValueOnce({
      status: 201,
      data: { id: '99', name: 'GitHub Session (Rotated)', type: 'githubApi' },
    });

    const created = await createGithubApiCredential(
      { baseUrl: 'http://localhost:5678', apiKey: 'k' },
      { name: 'GitHub Session (Rotated)', accessToken: 'ghs_xxx' },
    );

    expect(created).toEqual({ id: '99', name: 'GitHub Session (Rotated)', type: 'githubApi' });
    expect(ax.post).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/credentials'),
      expect.objectContaining({
        name: 'GitHub Session (Rotated)',
        type: 'githubApi',
        data: { accessToken: 'ghs_xxx' },
      }),
      expect.any(Object),
    );
  });

  it('rewireWorkflowsGithubCredential updates only workflows referencing old credential id', async () => {
    // Page 1 of workflows
    const page1 = [
      { id: 1, name: 'WF A' },
      { id: 2, name: 'WF B' },
    ];
    // Page 2 empty (end)
    const page2: any[] = [];

    // Full workflow payloads
    const wf1 = {
      id: 1,
      name: 'WF A',
      nodes: [
        {
          id: 'n1',
          name: 'GitHub Node 1',
          type: 'n8n-nodes-base.github',
          credentials: { githubApi: { id: 'old-cred' } },
        },
        {
          id: 'n2',
          name: 'Other Node',
          type: 'n8n-nodes-base.httpRequest',
        },
      ],
    };

    const wf2 = {
      id: 2,
      name: 'WF B',
      nodes: [
        {
          id: 'n3',
          name: 'GitHub Node 2',
          type: 'n8n-nodes-base.github',
          credentials: { githubApi: { id: 'some-other' } },
        },
      ],
    };

    // GET routing based on URL
    ax.get.mockImplementation(async (url: string) => {
      if (url.includes('/api/v1/workflows?') && url.includes('offset=0')) {
        return { status: 200, data: page1 };
      }
      if (url.includes('/api/v1/workflows?') && url.includes('offset=2')) {
        return { status: 200, data: page2 };
      }
      if (url.endsWith('/api/v1/workflows/1')) {
        return { status: 200, data: wf1 };
      }
      if (url.endsWith('/api/v1/workflows/2')) {
        return { status: 200, data: wf2 };
      }
      // credentials listing not used here
      return { status: 404, data: {} };
    });

    // PUT to update workflow
    ax.put.mockResolvedValue({ status: 200, data: {} });

    // Sanity check: listWorkflows/readWorkflow helpers still behave
    const listed = await listWorkflows({ baseUrl: 'http://localhost:5678', apiKey: 'k' });
    expect(listed).toEqual(page1);
    const read1 = await readWorkflow({ baseUrl: 'http://localhost:5678', apiKey: 'k' }, 1);
    const read2 = await readWorkflow({ baseUrl: 'http://localhost:5678', apiKey: 'k' }, 2);
    expect(read1.name).toBe('WF A');
    expect(read2.name).toBe('WF B');

    // Run rewire: replace old-cred -> new-cred
    const updatedCount = await rewireWorkflowsGithubCredential(
      { baseUrl: 'http://localhost:5678', apiKey: 'k' },
      { oldCredentialId: 'old-cred', newCredentialId: 'new-cred' },
    );

    expect(updatedCount).toBe(1); // only WF A should be updated
    // Ensure PUT was called once, with wf1 modified
    expect(ax.put).toHaveBeenCalledTimes(1);
    const [, payload] = ax.put.mock.calls[0];
    // payload should now have new id in node n1
    const n1 = (payload as any).nodes.find((n: any) => n.id === 'n1');
    expect(n1.credentials.githubApi.id).toBe('new-cred');

    // updateWorkflow direct helper still fine
    await expect(updateWorkflow({ baseUrl: 'http://localhost:5678', apiKey: 'k' }, wf2 as any)).resolves.not.toThrow();
  });
});
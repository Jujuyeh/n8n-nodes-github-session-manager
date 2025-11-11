import axios from 'axios';

type N8nApiAuth = {
	baseUrl: string; // e.g., http://localhost:5678
	apiKey: string;  // X-N8N-API-KEY
};

type CredentialSummary = {
	id: string;
	name: string;
	type: string;
	createdAt?: string;
	updatedAt?: string;
};

type Workflow = {
	id: number;
	name: string;
	nodes: Array<{
		id: string;
		name: string;
		type: string;
		credentials?: Record<string, { id?: string; name?: string }>;
		[key: string]: unknown;
	}>;
	[key: string]: unknown;
};

/** List credentials (best-effort; if endpoint not supported it will throw) */
export async function listCredentials(auth: N8nApiAuth): Promise<CredentialSummary[]> {
	const url = new URL('/api/v1/credentials', auth.baseUrl).toString();
	const res = await axios.get(url, {
		headers: { 'X-N8N-API-KEY': auth.apiKey },
		validateStatus: () => true,
	});
	if (res.status >= 400) {
		throw new Error(`listCredentials failed: ${res.status} ${res.statusText}`);
	}
	return res.data as CredentialSummary[];
}

/** Create a new githubApi credential with the provided token (and optional name) */
export async function createGithubApiCredential(auth: N8nApiAuth, params: {
	name: string;
	accessToken: string;
}): Promise<CredentialSummary> {
	const url = new URL('/api/v1/credentials', auth.baseUrl).toString();
	const body = {
		name: params.name,
		type: 'githubApi',
		data: { accessToken: params.accessToken },
	};
	const res = await axios.post(url, body, {
		headers: { 'X-N8N-API-KEY': auth.apiKey, 'Content-Type': 'application/json' },
		validateStatus: () => true,
	});
	if (res.status >= 400) {
		throw new Error(`createGithubApiCredential failed: ${res.status} ${res.statusText} - ${JSON.stringify(res.data)}`);
	}
	return res.data as CredentialSummary;
}

/** List workflows (paged) */
export async function listWorkflows(auth: N8nApiAuth, limit = 250, offset = 0): Promise<Workflow[]> {
	const url = new URL(`/api/v1/workflows?limit=${limit}&offset=${offset}`, auth.baseUrl).toString();
	const res = await axios.get(url, {
		headers: { 'X-N8N-API-KEY': auth.apiKey },
		validateStatus: () => true,
	});
	if (res.status >= 400) {
		throw new Error(`listWorkflows failed: ${res.status} ${res.statusText}`);
	}
	return res.data as Workflow[];
}

/** Read a workflow by id */
export async function readWorkflow(auth: N8nApiAuth, id: number): Promise<Workflow> {
	const url = new URL(`/api/v1/workflows/${id}`, auth.baseUrl).toString();
	const res = await axios.get(url, {
		headers: { 'X-N8N-API-KEY': auth.apiKey },
		validateStatus: () => true,
	});
	if (res.status >= 400) {
		throw new Error(`readWorkflow failed: ${res.status} ${res.statusText}`);
	}
	return res.data as Workflow;
}

/** Update a workflow (full payload) */
export async function updateWorkflow(auth: N8nApiAuth, wf: Workflow): Promise<void> {
	const url = new URL(`/api/v1/workflows/${wf.id}`, auth.baseUrl).toString();
	const res = await axios.put(url, wf, {
		headers: { 'X-N8N-API-KEY': auth.apiKey, 'Content-Type': 'application/json' },
		validateStatus: () => true,
	});
	if (res.status >= 400) {
		throw new Error(`updateWorkflow failed: ${res.status} ${res.statusText} - ${JSON.stringify(res.data)}`);
	}
}

/**
 * Rewire: replace all node credentials that reference oldCredentialId (for a given typeKey, e.g. "githubApi")
 * with newCredentialId. Returns the number of workflows updated.
 */
export async function rewireWorkflowsGithubCredential(auth: N8nApiAuth, params: {
	oldCredentialId: string;
	newCredentialId: string;
	typeKey?: string; // default githubApi
}): Promise<number> {
	const typeKey = params.typeKey ?? 'githubApi';
	let updatedCount = 0;

	// Fetch workflows in pages
	let offset = 0;
	const limit = 250;
	while (true) {
		const page = await listWorkflows(auth, limit, offset);
		if (!page.length) break;

		for (const summary of page) {
			const wf = await readWorkflow(auth, summary.id);
			let touched = false;

			for (const n of wf.nodes ?? []) {
				const creds = n.credentials ?? {};
				if (creds[typeKey]?.id === params.oldCredentialId) {
					creds[typeKey] = { id: params.newCredentialId };
					n.credentials = creds;
					touched = true;
				}
			}
			if (touched) {
				await updateWorkflow(auth, wf);
				updatedCount++;
			}
		}
		offset += page.length;
	}

	return updatedCount;
}
import axios from 'axios';

/**
 * Update one specific githubApi credential by ID, if your n8n supports PUT /api/v1/credentials/{id}.
 * - Returns { updated: false, reason: 'METHOD_NOT_ALLOWED' } if the endpoint returns 405.
 * - Throws on other >= 400 responses.
 */
export async function updateGithubCredentialById(opts: {
	baseUrl: string;        // e.g., http://localhost:5678
	apiKey: string;         // X-N8N-API-KEY
	credentialId: string;   // credential id to update (must be of type githubApi)
	newAccessToken: string; // new value for data.accessToken
	nameFallback?: string;  // optional name to include in the request body
}) {
	const { baseUrl, apiKey, credentialId, newAccessToken, nameFallback } = opts;

	const url = new URL(`/api/v1/credentials/${encodeURIComponent(credentialId)}`, baseUrl).toString();

	const body: Record<string, unknown> = {
		data: { accessToken: newAccessToken }
	};
	if (nameFallback) body.name = nameFallback;

	const res = await axios.put(url, body, {
		headers: {
			'X-N8N-API-KEY': apiKey,
			'Content-Type': 'application/json'
		},
		validateStatus: () => true
	});

	if (res.status === 405) {
		return { updated: false as const, reason: 'METHOD_NOT_ALLOWED' as const };
	}
	if (res.status >= 400) {
		throw new Error(`Credential update failed: ${res.status} ${res.statusText} - ${JSON.stringify(res.data)}`);
	}
	return { updated: true as const };
}
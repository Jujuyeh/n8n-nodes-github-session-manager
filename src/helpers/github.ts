import crypto from 'crypto';
import axios from 'axios';
import type { AxiosRequestConfig } from 'axios';

function b64url(buf: Buffer) {
	return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function signJwtRS256(header: object, payload: object, pem: string) {
	const h = b64url(Buffer.from(JSON.stringify(header)));
	const p = b64url(Buffer.from(JSON.stringify(payload)));
	const data = `${h}.${p}`;
	const signer = crypto.createSign('RSA-SHA256');
	signer.update(data);
	signer.end();
	const sig = signer.sign(pem);
	return `${data}.${b64url(sig)}`;
}

export function createAppJwt(appId: string | number, pem: string) {
	const now = Math.floor(Date.now() / 1000);
	const header = { alg: 'RS256', typ: 'JWT' };
	const payload = { iat: now - 60, exp: now + 9 * 60, iss: String(appId) };
	return signJwtRS256(header, payload, pem);
}

export async function getInstallationToken(args: {
	baseUrl: string;
	appId: string | number;
	installationId: string | number;
	privateKeyPem: string;
	permissions?: Record<string, 'read' | 'write'>;
	repositories?: string[];
}) {
	const jwt = createAppJwt(args.appId, args.privateKeyPem);
	const url = new URL(`/app/installations/${args.installationId}/access_tokens`, args.baseUrl).toString();
	const cfg: AxiosRequestConfig = {
		method: 'POST',
		url,
		headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json' },
		data: { permissions: args.permissions, repositories: args.repositories },
		validateStatus: () => true
	};
	const res = await axios(cfg);
	if (res.status >= 400) {
		throw new Error(`GitHub token exchange failed: ${res.status} ${res.statusText} - ${JSON.stringify(res.data)}`);
	}
	return res.data as { token: string; expires_at: string };
}
import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { getInstallationToken } from '../../helpers/github';
import {
	listCredentials,
	createGithubApiCredential,
	rewireWorkflowsGithubCredential,
} from '../../helpers/n8n-api';

export class GithubSessionManager implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'GitHub Session Manager',
		name: 'githubSessionManager',
		icon: { light: 'file:github.png', dark: 'file:github.png' },
		group: ['transform'],
		version: 2,
		description:
			'Issue a GitHub App installation access token and optionally rewire workflows to a fresh githubApi credential.',
		defaults: { name: 'GitHub Session Manager' },
		inputs: ['main'],
		outputs: ['main'],

		// Credentials dropdowns:
		credentials: [
			// Custom: where App ID, Installation ID, PEM are stored
			{ name: 'githubAppJwt', required: true },

			// OOB: n8n API credential (used when rewire is enabled)
			{ name: 'n8nApi', required: false, testedBy: 'n8nApiCredentialTest' },

			// OOB: GitHub credential (the one to rotate/rewire FROM)
			{ name: 'githubApi', required: false },
		],

		methods: {
			loadOptions: {
				// Populate dropdown with existing githubApi credentials using the selected n8nApi credential
				async githubCredentials(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
					// Read n8nApi credential to call the API
					const n8n = (await this.getCredentials('n8nApi')) as any;
					if (!n8n) return [];

					// Heuristic: common fields in n8nApi credential
					const baseUrl: string = n8n?.baseUrl || n8n?.url || n8n?.apiUrl || 'http://localhost:5678';
					const apiKey: string = n8n?.apiKey || n8n?.token || '';

					if (!apiKey) return [];

					const list = await listCredentials({ baseUrl, apiKey });
					return list
						.filter((c) => c.type === 'githubApi')
						.map((c) => ({ name: `${c.name} (id:${c.id})`, value: c.id }));
				},
			},
		},

		properties: [
			// Behavior: emit token always
			{
				displayName: 'Decorate headers for HTTP Request',
				name: 'decorateHeader',
				type: 'boolean',
				default: true,
				description: 'Adds Authorization/Accept into item.json.headers for chaining into an HTTP Request node.',
			},

			// Optional rewire
			{
				displayName: 'Rotate by rewire (create new githubApi and reassign workflows)',
				name: 'doRewire',
				type: 'boolean',
				default: false,
				description:
					'If enabled, creates a new githubApi credential with the fresh token and rewires workflows from the selected githubApi credential to the new one.',
			},
			{
				displayName: 'n8n API Credential',
				name: 'n8nApiCredentialNotice',
				type: 'notice',
				default: 'Select an existing n8n API credential in the Credentials section above.',
				displayOptions: { show: { doRewire: [true] } },
			},
			{
				displayName: 'Target GitHub Credential (githubApi)',
				name: 'targetGithubCredentialId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'githubCredentials' },
				default: '',
				required: true,
				displayOptions: { show: { doRewire: [true] } },
				description: 'The existing githubApi credential to rewire from.',
			},
			{
				displayName: 'New Credential Name',
				name: 'newCredentialName',
				type: 'string',
				default: 'GitHub Session (Rotated)',
				displayOptions: { show: { doRewire: [true] } },
				description: 'Name for the new githubApi credential that holds the fresh token.',
			},

			// Optional token scoping
			{
				displayName: 'Permissions (optional)',
				name: 'permissions',
				type: 'fixedCollection',
				typeOptions: { multipleValues: true },
				default: {},
				options: [
					{
						name: 'permission',
						displayName: 'Permission',
						values: [
							{ displayName: 'Resource', name: 'resource', type: 'string', default: 'contents' },
							{
								displayName: 'Access',
								name: 'access',
								type: 'options',
								options: [
									{ name: 'Read', value: 'read' },
									{ name: 'Write', value: 'write' },
								],
								default: 'read',
							},
						],
					},
				],
				description: 'Optionally restrict permissions of the issued installation token.',
			},
			{
				displayName: 'Repositories (comma-separated)',
				name: 'repositories',
				type: 'string',
				default: '',
				description:
					'Limit the token to specific repositories if the installation is repo-scoped (owner/repo,owner/repo).',
			},
		],
	};

	// Dummy tester to satisfy typings when "testedBy" is present
	// n8n ignores body here; we simply declare it.
	n8nApiCredentialTest = async () => ({ status: 200, message: 'ok' });

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// App credentials
		const app = (await this.getCredentials('githubAppJwt')) as any;
		const baseUrl: string = app.baseUrl || 'https://api.github.com';
		const privateKeyPem = String(app.privateKey || '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

		// Node parameters
		const decorateHeader = this.getNodeParameter('decorateHeader', 0, true) as boolean;

		const permissionsColl = this.getNodeParameter('permissions', 0, {}) as {
			permission?: Array<{ resource: string; access: 'read' | 'write' }>;
		};
		const permissions =
			permissionsColl.permission?.reduce<Record<string, 'read' | 'write'>>((acc, p) => {
				if (p.resource) acc[p.resource] = p.access || 'read';
				return acc;
			}, {}) || undefined;

		const repositoriesStr = this.getNodeParameter('repositories', 0, '') as string;
		const repositories =
			repositoriesStr.split(',').map((s) => s.trim()).filter(Boolean) || undefined;

		// 1) Issue installation token
		const tokenData = await getInstallationToken({
			baseUrl,
			appId: app.appId,
			installationId: app.installationId,
			privateKeyPem,
			permissions,
			repositories,
		});

		// Prepare output items
		const out: INodeExecutionData[] = items.map((item) => {
			const json = { ...(item.json as object) } as any;
			json.githubToken = tokenData.token;
			json.githubTokenExpiresAt = tokenData.expires_at;
			if (decorateHeader) {
				json.headers = {
					...(json.headers || {}),
					Authorization: `Bearer ${tokenData.token}`,
					Accept: 'application/vnd.github+json',
				};
			}
			return { json };
		});

		// 2) Optional rewire flow
		const doRewire = this.getNodeParameter('doRewire', 0, false) as boolean;
		if (doRewire) {
			// Require n8nApi credential and target githubApi credential ID from dropdown
			const n8n = (await this.getCredentials('n8nApi')) as any;
			if (!n8n) throw new Error('n8n API credential is required when "Rotate by rewire" is enabled.');

			const apiBaseUrl: string = n8n?.baseUrl || n8n?.url || n8n?.apiUrl || 'http://localhost:5678';
			const apiKey: string = n8n?.apiKey || n8n?.token || '';
			if (!apiKey) throw new Error('n8n API credential is missing API key/token.');

			const targetGithubCredentialId = this.getNodeParameter('targetGithubCredentialId', 0, '') as string;
			if (!targetGithubCredentialId) throw new Error('Target GitHub Credential (githubApi) is required.');

			const newCredentialName = this.getNodeParameter('newCredentialName', 0, 'GitHub Session (Rotated)') as string;

			// 2a) Create new githubApi credential with fresh token
			const created = await createGithubApiCredential(
				{ baseUrl: apiBaseUrl, apiKey },
				{ name: newCredentialName, accessToken: tokenData.token },
			);

			// 2b) Rewire workflows that referenced the selected githubApi credential
			const rewiredCount = await rewireWorkflowsGithubCredential(
				{ baseUrl: apiBaseUrl, apiKey },
				{ oldCredentialId: targetGithubCredentialId, newCredentialId: created.id },
			);

			// annotate first item with rewire results (non-breaking)
			if (out.length > 0) {
				(out[0].json as any).rewire = {
					fromCredentialId: targetGithubCredentialId,
					toCredentialId: created.id,
					workflowsUpdated: rewiredCount,
				};
			}
		}

		return [out];
	}
}
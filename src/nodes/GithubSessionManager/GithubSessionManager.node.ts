import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { getInstallationToken } from '../../helpers/github';
import { updateGithubCredentialById } from '../../helpers/n8n-api';

export class GithubSessionManager implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'GitHub Session Manager',
		name: 'githubSessionManager',
		icon: { light: 'file:github.svg', dark: 'file:github.svg' },
		group: ['transform'],
		version: 1,
		description:
			'Issue a GitHub App installation access token and optionally update a specific githubApi credential by ID.',
		defaults: { name: 'GitHub Session Manager' },
		inputs: ['main'],
		outputs: ['main'],
		credentials: [{ name: 'githubAppJwt', required: true }],
		properties: [
			// Behavior
			{
				displayName: 'Update Specific githubApi Credential',
				name: 'doUpdateTargetCredential',
				type: 'boolean',
				default: false,
				description:
					'If enabled, will attempt to update the provided githubApi credential by ID. If your n8n does not support the endpoint, the node continues and only returns the token.',
			},
			{
				displayName: 'Target Credential ID',
				name: 'targetCredentialId',
				type: 'string',
				default: '',
				placeholder: 'e.g. 42',
				displayOptions: { show: { doUpdateTargetCredential: [true] } },
				description:
					'ID of the githubApi credential to update. It must exist and be of type githubApi.',
			},
			{
				displayName: 'n8n Base URL',
				name: 'n8nBaseUrl',
				type: 'string',
				default: 'http://localhost:5678',
				displayOptions: { show: { doUpdateTargetCredential: [true] } },
				description: 'URL of your n8n instance to call /api/v1/credentials/{id}.',
			},
			{
				displayName: 'n8n API Key',
				name: 'n8nApiKey',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				displayOptions: { show: { doUpdateTargetCredential: [true] } },
				description: 'API key used to authorize the credential update request.',
			},

			// Headers / permissions
			{
				displayName: 'Decorate headers for HTTP Request',
				name: 'decorateHeader',
				type: 'boolean',
				default: true,
				description:
					'Adds Authorization/Accept into item.json.headers for chaining into an HTTP Request node.',
			},
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

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();

		// App credentials
		const app = (await this.getCredentials('githubAppJwt')) as any;
		const baseUrl: string = app.baseUrl || 'https://api.github.com';
		const privateKeyPem = String(app.privateKey || '').replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

		// Node parameters
		const doUpdateTargetCredential = this.getNodeParameter('doUpdateTargetCredential', 0, false) as boolean;
		const targetCredentialId = this.getNodeParameter('targetCredentialId', 0, '') as string;
		const n8nBaseUrl = this.getNodeParameter('n8nBaseUrl', 0, 'http://localhost:5678') as string;
		const n8nApiKey = this.getNodeParameter('n8nApiKey', 0, '') as string;

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

		// 2) Optionally update ONE githubApi credential by ID
		let updateStatus: 'UPDATED' | 'SKIPPED' | 'NOT_SUPPORTED' = 'SKIPPED';
		if (doUpdateTargetCredential) {
			if (!targetCredentialId) {
				throw new Error('Target Credential ID is required when update is enabled.');
			}
			if (!n8nApiKey) {
				throw new Error('n8n API Key is required when update is enabled.');
			}
			const result = await updateGithubCredentialById({
				baseUrl: n8nBaseUrl,
				apiKey: n8nApiKey,
				credentialId: targetCredentialId,
				newAccessToken: tokenData.token,
			});
			updateStatus = result.updated ? 'UPDATED' : 'NOT_SUPPORTED';
		}

		// 3) Output (and optional headers)
		const out: INodeExecutionData[] = items.map((item) => {
			const json = { ...(item.json as object) } as any;
			json.githubToken = tokenData.token;
			json.githubTokenExpiresAt = tokenData.expires_at;
			json.updateStatus = updateStatus; // UPDATED | SKIPPED | NOT_SUPPORTED
			json.updatedCredentialId = doUpdateTargetCredential ? targetCredentialId : undefined;
			if (decorateHeader) {
				json.headers = {
					...(json.headers || {}),
					Authorization: `Bearer ${tokenData.token}`,
					Accept: 'application/vnd.github+json',
				};
			}
			return { json };
		});

		return [out];
	}
}
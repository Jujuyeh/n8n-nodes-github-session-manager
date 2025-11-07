import type { ICredentialType, INodeProperties, Icon } from 'n8n-workflow';

export class GithubAppJwt implements ICredentialType {
	name = 'githubAppJwt';
	displayName = 'GitHub App (JWT)';
	icon: Icon = { light: 'file:github.svg', dark: 'file:github.svg' };

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.github.com',
			description: 'Change this if you use GitHub Enterprise (e.g., https://ghe.example.com/api/v3).',
		},
		{
			displayName: 'App ID',
			name: 'appId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Installation ID',
			name: 'installationId',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Private Key (PEM)',
			name: 'privateKey',
			type: 'string',
			typeOptions: { rows: 8 },
			default: '',
			required: true,
			description: 'Paste the full PEM with BEGIN/END lines. If provided as a single line, use \\n.',
		},
	];
}
# n8n-nodes-github-session-manager

Community node for n8n that:
- Stores **App ID, Installation ID, and Private Key (PEM)** via a **GitHub App (JWT)** credential.
- Issues a **GitHub App installation access token**.
- **Optionally** updates **one** `githubApi` credential **by ID** (if your n8n supports `PUT /api/v1/credentials/{id}`).
- Always outputs the **token and its expiration**, and can **decorate headers** for a downstream HTTP Request node.

> If your n8n version does **not** support `PUT /api/v1/credentials/{id}`, the node will not update the credential (it will set `updateStatus: "NOT_SUPPORTED"`). Token issuance and outputs still work.

## Install

```bash
npm i n8n-nodes-github-session-manager
```


Docker (mounting from `node_modules`):

```yaml
environment:
  N8N_CUSTOM_EXTENSIONS: /home/node/node_modules/n8n-nodes-github-session-manager
```

Restart n8n.

## Usage

1. Create the **GitHub App (JWT)** credential with:

   * `Base URL` (default `https://api.github.com`)
   * `App ID`
   * `Installation ID`
   * `Private Key (PEM)` (use `\\n` if it is a single-line string)

2. Add the **GitHub Session Manager** node:

   * If you only need the **token**, leave **Update Specific githubApi Credential** disabled.
   * If you want to **update a specific** `githubApi` credential:

     * Enable **Update Specific githubApi Credential**,
     * Set `Target Credential ID`,
     * Provide `n8n Base URL` and `n8n API Key`.

3. Optionally enable **Decorate headers** to pipe the Authorization header into a downstream **HTTP Request** node:

   * In the HTTP Request node, set `Headers: ={{$json.headers}}`.

## Output

Each item returns:

```json
{
  "githubToken": "ghs_xxx",
  "githubTokenExpiresAt": "2025-11-07T10:10:00Z",
  "updateStatus": "UPDATED | SKIPPED | NOT_SUPPORTED",
  "updatedCredentialId": "42 (if applicable)",
  "headers": {
    "Authorization": "Bearer ghs_xxx",
    "Accept": "application/vnd.github+json"
  }
}
```

## Notes

* This package does **not** perform a global overwrite of all `githubApi` credentials. It only attempts to update **one** credential by ID when you enable it.
* Workflows already running usually keep using the token loaded at node start. For most workflows (less than one hour), token expiration is not an issue.

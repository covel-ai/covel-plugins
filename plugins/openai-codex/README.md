# @covel/plugin-openai-codex

**English** · [简体中文](README.zh-CN.md)

Connect **OpenAI ChatGPT Plus, Pro, or Team** subscriptions to Covel via the **OpenAI Codex** OAuth/Responses backend (`https://chatgpt.com/backend-api/codex`) using Covel's generic `provider.source@1` contract.

> **Host requirement**: `openai-codex` uses Plugin Platform v2 (`apiVersion: 2`, `scope: instance`, `provider.source@1`, declarative Config Flows, `SecretVault`, and `requestShape.endpointPath`). Use a Covel build that includes Plugin Platform v2 (`covel: ">=0.0.54"` with PR #555 / Covel `>=0.0.55`).

## Installation and approval

In **Settings → Plugins → Install & manage**, enter:

```text
https://github.com/covel-ai/covel-plugins/tree/main/plugins/openai-codex
```

Review the declared permissions, confirm installation, and restart the Covel backend.

### Declared permissions

- `secrets: true`: Stores OAuth access tokens and single-use refresh tokens strictly inside the host `SecretVault`. Non-secret account summaries (`id`, `label`, `email`, `plan`, `status`, `isDefault`, `expiresAt`) are mirrored to `instanceData` for UI display.
- `loopbackCallback` (`/auth/callback`, preferred port `1455`): Captures the `http://localhost:1455/auth/callback` redirect automatically during Browser OAuth sign-in.
- `authProxy: true`: Allows OAuth/model/usage metadata calls to use the configured host proxy in `personal` mode when permitted, falling back seamlessly to direct SSRF-guarded fetch if `net.authProxy` is not granted.
- `http`:
  - `POST https://auth.openai.com` (OAuth token exchange, refresh rotation, device-code flow)
  - `GET`, `POST https://chatgpt.com` (Codex model list and subscription usage windows; inference calls go through Covel's `openai-responses-v1` gateway locked to `https://chatgpt.com/backend-api/codex`)

Because hosted and `browser-private` deployments disable `plugin.providerSource` at L1, this plugin is intended for desktop and self-hosted `personal` Covel instances.

## Sign-in methods

After enabling the plugin and approving its permissions, open **Settings → OpenAI Codex** (or the `openai-codex/codex` source card in **Settings → Providers**):

1. **Sign in (Browser OAuth)** (`oauth-sign-in`):
   - Opens `https://auth.openai.com/oauth/authorize` with PKCE (`S256`).
   - Listens on `http://127.0.0.1:1455/auth/callback` (and best-effort IPv6 `[::1]:1455`).
   - **Always provides a fallback URL input box**: even when port `1455` is busy (e.g., Codex CLI / IDE daemon running) or when running over SSH / remote Web UI without localhost loopback, paste the redirected URL from your browser address bar (`http://localhost:1455/auth/callback?code=...&state=...`) and Covel parses `code` and `state` automatically.
2. **Sign in (Device Code)** (`device-sign-in`):
   - Requests a one-time user code from `https://auth.openai.com/api/accounts/deviceauth/usercode`, opens `https://auth.openai.com/codex/device`, and polls automatically until authorized.
3. **Import `auth.json`** (`import-auth-json`):
   - Upload or paste `~/.codex/auth.json` created by `codex login` (API-key-only configs are rejected with guidance).

You can connect multiple ChatGPT accounts (`accounts: many`), switch the default account, manually refresh credentials, or let Covel fail over automatically on `429` / auth errors.

## Configure model slots

### In Settings UI

Create or edit a model preset using Source **`openai-codex/codex`**, protocol **`openai-responses-v1`**, and model such as **`gpt-5.4`** or **`gpt-5.3-codex`**, then assign that preset to your `story` or utility slots.

### In `~/.covel/llm.toml`

```toml
[story]
source = "openai-codex/codex"
model = "gpt-5.4"
```

Optionally pin a specific connected account with `account = "<account-id>"` when multiple ChatGPT accounts are connected.

## Request shaping & token safety

- Routes `openai-responses-v1` requests verbatim to `https://chatgpt.com/backend-api/codex/responses` (`requestShape.endpointPath = "/responses"`).
- Lifts leading system/developer prompts into top-level `instructions` (defaulting to a safe fallback string when empty), converts late system messages, strips unsupported sampling/state parameters (`temperature`, `top_p`, `max_output_tokens`, `previous_response_id`, `service_tier`), and enforces `store: false` and `stream: true` (Covel's Responses adapter aggregates SSE transparently for non-streaming `generateText` and `generateObject` calls).
- Protects OpenAI's single-use refresh tokens with both host single-flight `401` retry and in-plugin single-flight proactive refresh locking.

## Package layout

```text
openai-codex/
├── PLUGIN.md                 # apiVersion 2, scope instance, permissions, contributes
├── package.json              # zero runtime dependencies (type: module)
├── server/index.js           # flows, appActions, and providerSources/codex registration
├── lib/
│   ├── constants.js          # OpenAI Auth & ChatGPT Codex URLs/constants
│   ├── jwt.js                # base64url JWT claim extraction (email, account_id, plan, exp)
│   ├── pkce.js               # PKCE S256 & forgiving callback URL parser
│   ├── vault.js              # SecretVault <-> sanitized instanceData state + auth.json parser
│   ├── oauth.js              # OAuth token exchange, refresh rotation & device code polling
│   └── codex-api.js          # CODEX_REQUEST_SHAPE, headers, models, usage & error mapping
├── ui/settings-section.json  # Settings -> OpenAI Codex declarative panel
├── locales/zh.yaml           # Simplified Chinese labels & UI messages
├── locales/lock.json         # i18n label lock
└── tests/                    # helper & entry unit tests (zero live network)
```

## Tests

From the `covel-plugins` root:

```bash
pnpm exec vitest run plugins/openai-codex/tests
COVEL_DIR=/path/to/covel pnpm check:covel
```

Source code is licensed under [MIT](LICENSE).

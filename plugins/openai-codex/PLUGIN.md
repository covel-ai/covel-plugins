---
version: 0.1.1
apiVersion: 2
scope: instance
covel: ">=0.0.54"
displayName: OpenAI Codex
description: >-
  Connects ChatGPT Plus, Pro, or Team subscriptions via OpenAI Codex OAuth,
  device code, or imported auth.json credentials with multi-account failover.
author:
  name: Covel Contributors
  url: https://github.com/covel-ai
license: MIT
homepage: https://github.com/covel-ai/covel-plugins/tree/main/plugins/openai-codex
tags:
  - tools
  - provider
  - openai
  - codex
activationEvents:
  - onFlow:oauth-sign-in
  - onFlow:device-sign-in
  - onFlow:import-auth-json
  - onAppAction:set-default-account
  - onAppAction:remove-account
  - onAppAction:refresh-account
  - onAppAction:list-accounts
permissions:
  secrets: true
  authProxy: true
  loopbackCallback:
    path: /auth/callback
    ports:
      - 1455
  http:
    - origin: https://auth.openai.com
      methods:
        - POST
    - origin: https://chatgpt.com
      methods:
        - GET
        - POST
contributes:
  appActions:
    - set-default-account
    - remove-account
    - refresh-account
    - list-accounts
  flows:
    - oauth-sign-in
    - device-sign-in
    - import-auth-json
  providerSources:
    - id: codex
      label: OpenAI Codex (ChatGPT Subscription)
      protocol: openai-responses-v1
      modes:
        - text
      baseUrl: https://chatgpt.com/backend-api/codex
      auth:
        flows:
          - oauth-sign-in
          - device-sign-in
          - import-auth-json
      accounts: many
  ui:
    settingsSection:
      - ./ui/settings-section.json
---

# OpenAI Codex Provider

An instance-scoped (`apiVersion: 2`) community provider plugin that connects
OpenAI ChatGPT subscription accounts through Covel's `provider.source@1`
gateway contract (`openai-codex/codex`).

- **Authentication flows (`contributes.flows`)**:
  - `oauth-sign-in`: Browser OAuth 2.0 + PKCE using `localhost:1455/auth/callback`
    with an automatic loopback listener and an always-available fallback box
    where players can paste the redirected callback URL.
  - `device-sign-in`: Headless / SSH / container-friendly OpenAI device code
    authorization (`https://auth.openai.com/codex/device`).
  - `import-auth-json`: Import existing `~/.codex/auth.json` or token JSON
    credentials directly.
- **Credential isolation**: All access tokens and single-use refresh tokens
  stay in the host `SecretVault`; non-secret account summaries are mirrored to
  `instanceData` (`accounts/summary`) for Settings UI rendering.
- **Codex Responses shaping**: Targets `https://chatgpt.com/backend-api/codex/responses`
  with forced SSE streaming aggregation, `instructions` lifting, stateless
  `store: false`, unsupported parameter stripping, single-flight generation-aware
  `401` refresh, and multi-account `429`/auth failover.

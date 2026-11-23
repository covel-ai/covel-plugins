import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import entry from "../server/index.js";

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

function createHarness() {
  const flows = new Map();
  const appActions = new Map();
  const sources = new Map();
  const secretMap = new Map();
  const instanceMap = new Map();
  const disposeCallbacks = [];

  entry({
    pluginId: "openai-codex",
    signal: new AbortController().signal,
    onDispose: (fn) => disposeCallbacks.push(fn),
    registerConfigFlow: (id, def) => flows.set(id, def),
    registerAppAction: (name, handler, options) =>
      appActions.set(name, { handler, options }),
    registerProviderSources: (list) => {
      for (const src of list) sources.set(src.id, src);
    },
  });

  const secrets = {
    async get(key) {
      return secretMap.has(key) ? { key, value: structuredClone(secretMap.get(key)) } : null;
    },
    async set(key, value) {
      secretMap.set(key, structuredClone(value));
    },
    async delete(key) {
      secretMap.delete(key);
    },
  };

  const instanceData = {
    async get(namespace, key) {
      return instanceMap.get(`${namespace}:${key}`) ?? null;
    },
    async set(namespace, key, value) {
      instanceMap.set(`${namespace}:${key}`, structuredClone(value));
    },
  };

  return {
    flows,
    appActions,
    source: sources.get("codex"),
    secrets,
    instanceData,
    secretMap,
    instanceMap,
    dispose: () => disposeCallbacks.forEach((fn) => fn()),
  };
}

function jsonResp(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("openai-codex entry", () => {
  it("matches PLUGIN.md declarations for flows, appActions, and providerSources", async () => {
    const harness = createHarness();
    const manifest = await readFile(new URL("../PLUGIN.md", import.meta.url), "utf8");
    for (const id of harness.flows.keys()) {
      expect(manifest).toContain(`- ${id}`);
    }
    for (const action of harness.appActions.keys()) {
      expect(manifest).toContain(`- ${action}`);
    }
    expect(harness.source?.id).toBe("codex");
    expect(manifest).toContain("id: codex");
  });

  it("completes Browser OAuth PKCE via automatic loopback or fallback pasted URL and protects against CSRF state mismatch", async () => {
    const harness = createHarness();
    const oauthFlow = harness.flows.get("oauth-sign-in");
    expect(oauthFlow.requiredCapabilities).toEqual(["secrets.own"]);

    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const accessToken = makeJwt({
      exp: futureExp,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-oauth-1",
        chatgpt_plan_type: "plus",
      },
    });
    const idToken = makeJwt({ email: "alice@example.com" });

    const httpCalls = [];
    const mockHttp = {
      async fetchWithRetry(url, init) {
        httpCalls.push({ url, init });
        if (init?.proxy === "instance-auth") {
          throw new Error('Capability "net.authProxy" is not allowed');
        }
        return jsonResp(200, {
          access_token: accessToken,
          refresh_token: "rt-oauth-1",
          id_token: idToken,
        });
      },
    };

    const startStep = await oauthFlow.start(
      {},
      {
        runId: "run-oauth-1",
        secrets: harness.secrets,
        instanceData: harness.instanceData,
        http: mockHttp,
        async startLoopbackCallback() {
          return {
            port: 1455,
            callbackUrl: "http://127.0.0.1:1455/auth/callback",
            async close() {},
          };
        },
      },
    );

    expect(startStep.kind).toBe("browser");
    expect(startStep.completion).toBe("loopback-or-paste");
    expect(startStep.callbackUrl).toBe("http://localhost:1455/auth/callback");
    const authUrl = new URL(startStep.authorizeUrl);
    const expectedState = authUrl.searchParams.get("state");
    expect(expectedState).toBeTruthy();

    // Verify CSRF state mismatch is rejected.
    const badStateStep = await oauthFlow.step(
      {
        stepId: startStep.stepId,
        callbackUrl: `http://localhost:1455/auth/callback?code=auth-code-1&state=wrong-state`,
      },
      {
        runId: "run-oauth-2-mismatch",
        secrets: harness.secrets,
        instanceData: harness.instanceData,
        http: mockHttp,
      },
    );
    expect(badStateStep).toMatchObject({ kind: "error", code: "flow_expired" });

    // Start a fresh run where port 1455 is busy -> verifies fallback to `paste` and closing ephemeral listener.
    let closedEphemeral = false;
    const pasteFallbackStart = await oauthFlow.start(
      {},
      {
        runId: "run-oauth-busy",
        secrets: harness.secrets,
        instanceData: harness.instanceData,
        http: mockHttp,
        async startLoopbackCallback() {
          return {
            port: 54321,
            callbackUrl: "http://127.0.0.1:54321/auth/callback",
            async close() {
              closedEphemeral = true;
            },
          };
        },
      },
    );
    expect(closedEphemeral).toBe(true);
    expect(pasteFallbackStart.completion).toBe("paste");
    expect(pasteFallbackStart.callbackUrl).toBe("http://localhost:1455/auth/callback");

    const mismatchResult = await oauthFlow.step(
      {
        stepId: pasteFallbackStart.stepId,
        callbackUrl: "localhost:1455/auth/callback?code=code-bad&state=tampered",
      },
      {
        runId: "run-oauth-busy",
        secrets: harness.secrets,
        instanceData: harness.instanceData,
        http: mockHttp,
      },
    );
    expect(mismatchResult).toMatchObject({ kind: "error", code: "state_mismatch" });

    // Even if startLoopbackCallback throws (e.g. capability denied on remote host), flow still shows paste input.
    const noLoopbackStart = await oauthFlow.start(
      {},
      {
        runId: "run-oauth-no-loopback",
        secrets: harness.secrets,
        instanceData: harness.instanceData,
        http: mockHttp,
        async startLoopbackCallback() {
          throw new Error("denied");
        },
      },
    );
    expect(noLoopbackStart.completion).toBe("paste");

    // Complete run-oauth-1 by pasting a schemeless callback URL!
    const done = await oauthFlow.step(
      {
        stepId: startStep.stepId,
        callbackUrl: `localhost:1455/auth/callback?code=code-ok&state=${expectedState}`,
      },
      {
        runId: "run-oauth-1",
        secrets: harness.secrets,
        instanceData: harness.instanceData,
        http: mockHttp,
      },
    );

    expect(done).toMatchObject({
      kind: "done",
      refreshSections: ["llm"],
      summary: { accountId: "acct-oauth-1", plan: "plus" },
    });
    // Verified authProxy fallback ran direct fetch after capability rejection.
    expect(httpCalls).toHaveLength(2);
    expect(httpCalls[0].init.proxy).toBe("instance-auth");
    expect(httpCalls[1].init.proxy).toBeUndefined();

    // Public instanceData contains no token secrets.
    const serializedPublic = JSON.stringify([...harness.instanceMap.values()]);
    expect(serializedPublic).toContain("alice@example.com (plus)");
    expect(serializedPublic).not.toContain(accessToken);
    expect(serializedPublic).not.toContain("rt-oauth-1");
  });

  it("handles device-sign-in polling, import-auth-json, multi-account actions, and single-flight/generation-aware refresh", async () => {
    const harness = createHarness();
    const deviceFlow = harness.flows.get("device-sign-in");
    const importFlow = harness.flows.get("import-auth-json");

    const tok1 = makeJwt({
      exp: Math.floor(Date.now() / 1000) + 10, // expiring within 60s skew
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-dev-1",
        chatgpt_plan_type: "pro",
      },
    });
    const tokRefreshed = makeJwt({
      exp: Math.floor(Date.now() / 1000) + 3600,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-dev-1",
        chatgpt_plan_type: "pro",
      },
    });
    const tokImported = makeJwt({
      exp: Math.floor(Date.now() / 1000) + 3600,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-imp-2",
        chatgpt_plan_type: "team",
      },
    });

    let pollCount = 0;
    let refreshCount = 0;
    const mockHttp = {
      async fetchWithRetry(url) {
        if (url.endsWith("/usercode")) {
          return jsonResp(200, {
            device_auth_id: "dev-auth-1",
            user_code: "ABCD-EFGH",
            interval: 2,
            expires_in: 600,
          });
        }
        if (url.endsWith("/deviceauth/token")) {
          pollCount += 1;
          if (pollCount === 1) return jsonResp(403, {});
          return jsonResp(200, {
            authorization_code: "dev-code-1",
            code_verifier: "dev-verifier-1",
          });
        }
        if (url.endsWith("/oauth/token")) {
          refreshCount += 1;
          if (refreshCount === 1) {
            return jsonResp(200, {
              access_token: tok1,
              refresh_token: "rt-dev-1",
              id_token: makeJwt({ email: "dev@example.com" }),
            });
          }
          return jsonResp(200, {
            access_token: tokRefreshed,
            refresh_token: "rt-dev-2",
          });
        }
        if (url.includes("/backend-api/codex/models")) {
          return jsonResp(200, { models: [{ slug: "gpt-5.4" }, { slug: "gpt-5.3-codex" }] });
        }
        if (url.includes("/backend-api/wham/usage")) {
          return jsonResp(200, {
            plan_type: "pro",
            rate_limit: { primary_window: { used_percent: 20, limit_window_seconds: 18000 } },
          });
        }
        throw new Error(`Unexpected URL ${url}`);
      },
    };

    const devCtx = {
      runId: "run-dev-1",
      secrets: harness.secrets,
      instanceData: harness.instanceData,
      http: mockHttp,
    };
    const started = await deviceFlow.start({}, devCtx);
    expect(started).toMatchObject({ kind: "device", userCode: "ABCD-EFGH" });
    expect(await deviceFlow.poll(devCtx)).toBeNull();
    const polledDone = await deviceFlow.poll(devCtx);
    expect(polledDone).toMatchObject({ kind: "done", summary: { accountId: "acct-dev-1" } });

    // Import second account via import-auth-json
    const impStart = await importFlow.start({}, devCtx);
    expect(impStart.kind).toBe("import");
    const impDone = await importFlow.step(
      {
        stepId: impStart.stepId,
        data: {
          content: JSON.stringify({
            auth_mode: "chatgpt",
            tokens: { access_token: tokImported, refresh_token: "rt-imp-1", account_id: "acct-imp-2" },
          }),
        },
      },
      devCtx,
    );
    expect(impDone).toMatchObject({ kind: "done", summary: { accountId: "acct-imp-2" } });

    // Switch default back to acct-dev-1
    await harness.appActions.get("set-default-account").handler({ accountId: "acct-dev-1" }, devCtx);
    const listed = await harness.source.listAccounts(devCtx);
    expect(listed.find((a) => a.id === "acct-dev-1")?.isDefault).toBe(true);

    // Proactive near-expiry refresh in resolve() should deduplicate two concurrent calls
    const [r1, r2] = await Promise.all([
      harness.source.resolve({ mode: "text", model: "gpt-5.4" }, devCtx),
      harness.source.resolve({ mode: "text", model: "gpt-5.4" }, devCtx),
    ]);
    expect(refreshCount).toBe(2); // 1 initial exchange + 1 single-flight refresh
    expect(r1.headers.authorization).toBe(`Bearer ${tokRefreshed}`);
    expect(r2.credentialGeneration).toBe(2);
    expect(r1.requestShape.endpointPath).toBe("/responses");

    // Generation-aware refresh skips hitting /oauth/token if failedGeneration < currentGen
    const deduped = await harness.source.refresh(
      { accountId: "acct-dev-1", failedGeneration: 1, statusCode: 401 },
      devCtx,
    );
    expect(deduped?.credentialGeneration).toBe(2);
    expect(refreshCount).toBe(2);

    // Live models and usage
    expect(await harness.source.listModels({}, devCtx)).toEqual(["gpt-5.4", "gpt-5.3-codex"]);
    expect(await harness.source.getUsage({}, devCtx)).toMatchObject({
      accountId: "acct-dev-1",
      remaining: 80,
    });

    // Removing default promotes remaining account
    await harness.appActions.get("remove-account").handler({ accountId: "acct-dev-1" }, devCtx);
    const remaining = await harness.source.listAccounts(devCtx);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ id: "acct-imp-2", isDefault: true });

    harness.dispose();
  });
});

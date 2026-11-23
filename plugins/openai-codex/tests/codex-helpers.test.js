import { describe, expect, it } from "vitest";
import {
  CODEX_REQUEST_SHAPE,
  buildCodexHeaders,
  classifyCodexError,
  extractCodexModels,
  formatCodexUsage,
} from "../lib/codex-api.js";
import {
  DEFAULT_CODEX_INSTRUCTIONS,
  FALLBACK_CODEX_MODELS,
  OPENAI_CLIENT_ID,
  OPENAI_REDIRECT_URI,
} from "../lib/constants.js";
import { decodeJwtPayload, extractCodexIdentity } from "../lib/jwt.js";
import {
  buildCodexAuthorizeUrl,
  deriveCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  parseOAuthCallbackInput,
} from "../lib/pkce.js";
import {
  buildPublicSummary,
  parseImportedAuthJson,
  summarizeAccounts,
  upsertAccount,
} from "../lib/vault.js";

function makeJwt(payload) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.sig`;
}

describe("openai-codex pure helpers", () => {
  it("decodes JWT claims safely and extracts accountId, email, plan, and expiry", () => {
    const exp = 1_800_000_000;
    const accessToken = makeJwt({
      exp,
      sub: "user-123",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_ws_001",
        chatgpt_plan_type: "Plus",
      },
    });
    const idToken = makeJwt({
      email: "player@example.com",
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct_ws_001",
        chatgpt_plan_type: "Plus",
      },
    });

    const identity = extractCodexIdentity({ accessToken, idToken });
    expect(identity.id).toBe("acct_ws_001");
    expect(identity.accountHeaderId).toBe("acct_ws_001");
    expect(identity.email).toBe("player@example.com");
    expect(identity.plan).toBe("plus");
    expect(identity.label).toBe("player@example.com (plus)");
    expect(identity.expiresAt).toBe(new Date(exp * 1000).toISOString());

    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.!!!.c")).toBeNull();
  });

  it("generates PKCE verifier/challenge and builds the Codex authorize URL", () => {
    const verifier = generateCodeVerifier();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(deriveCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );

    const state = generateOAuthState();
    const challenge = deriveCodeChallenge(verifier);
    const url = new URL(
      buildCodexAuthorizeUrl({ state, codeChallenge: challenge }),
    );
    expect(url.origin).toBe("https://auth.openai.com");
    expect(url.pathname).toBe("/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(OPENAI_CLIENT_ID);
    expect(url.searchParams.get("redirect_uri")).toBe(OPENAI_REDIRECT_URI);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe(challenge);
    expect(url.searchParams.get("state")).toBe(state);
    expect(url.searchParams.get("id_token_add_organizations")).toBe("true");
    expect(url.searchParams.get("codex_cli_simplified_flow")).toBe("true");
    expect(url.searchParams.get("originator")).toBe("codex_cli_rs");
  });

  it("parses pasted OAuth callback URLs in full, schemeless, relative, query, and fragment forms", () => {
    const validCases = [
      "http://localhost:1455/auth/callback?code=c1&state=s1&scope=openid",
      "\"http://127.0.0.1:1455/auth/callback?code=c1&state=s1\"",
      "<http://localhost:1455/auth/callback?code=c1&state=s1>",
      "localhost:1455/auth/callback?code=c1&state=s1",
      "127.0.0.1:1455/auth/callback?code=c1&state=s1",
      "/auth/callback?code=c1&state=s1",
      "?code=c1&state=s1",
      "code=c1&state=s1",
      "#code=c1&state=s1",
    ];
    for (const raw of validCases) {
      expect(parseOAuthCallbackInput(raw)).toEqual({
        ok: true,
        authCode: "c1",
        state: "s1",
      });
    }

    expect(
      parseOAuthCallbackInput(
        "http://localhost:1455/auth/callback?error=access_denied&error_description=Cancelled&state=s1",
      ),
    ).toEqual({
      ok: false,
      code: "oauth_error",
      error: "access_denied",
      errorDescription: "Cancelled",
      state: "s1",
    });

    expect(parseOAuthCallbackInput("")).toMatchObject({ ok: false, code: "invalid_callback" });
    expect(parseOAuthCallbackInput("not a callback")).toMatchObject({
      ok: false,
      code: "invalid_callback",
    });
    expect(
      parseOAuthCallbackInput("http://localhost:1455/auth/callback?state=s1"),
    ).toMatchObject({ ok: false, code: "missing_code", state: "s1" });
  });

  it("parses ~/.codex/auth.json and rejects apikey-only configs", () => {
    const accessToken = makeJwt({
      exp: Math.floor(Date.now() / 1000) + 3600,
      "https://api.openai.com/auth": {
        chatgpt_account_id: "acct-cli-1",
        chatgpt_plan_type: "pro",
      },
    });
    const idToken = makeJwt({ email: "cli@example.com" });

    const imported = parseImportedAuthJson(
      `\uFEFF${JSON.stringify({
        auth_mode: "chatgpt",
        OPENAI_API_KEY: null,
        tokens: {
          access_token: accessToken,
          refresh_token: "rt-1",
          id_token: idToken,
          account_id: "acct-cli-1",
        },
      })}`,
    );
    expect(imported).toEqual({
      ok: true,
      credentials: {
        accessToken,
        refreshToken: "rt-1",
        idToken,
        accountHeaderId: "acct-cli-1",
      },
    });

    const apiKeyOnly = parseImportedAuthJson(
      JSON.stringify({ auth_mode: "apikey", OPENAI_API_KEY: "sk-123" }),
    );
    expect(apiKeyOnly).toMatchObject({ ok: false, code: "apikey_not_supported" });

    const missingTok = parseImportedAuthJson(JSON.stringify({ tokens: {} }));
    expect(missingTok).toMatchObject({ ok: false, code: "missing_access_token" });
  });

  it("keeps secrets out of public summaries and detects expired unrefreshable accounts", () => {
    const vault = { activeAccountId: null, accounts: {} };
    upsertAccount(vault, {
      id: "acct-stale",
      accessToken: "secret-access-token",
      refreshToken: null,
      idToken: "secret-id-token",
      expiresAt: new Date(Date.now() - 10_000).toISOString(),
    });

    const summarized = summarizeAccounts(vault);
    expect(summarized[0]?.status).toBe("needs_reauth");
    expect(summarized[0]?.isDefault).toBe(true);

    const summary = buildPublicSummary(vault);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("secret-access-token");
    expect(serialized).not.toContain("secret-id-token");
  });

  it("shapes Codex requests, headers, models, usage windows, and error classes", () => {
    expect(CODEX_REQUEST_SHAPE.endpointPath).toBe("/responses");
    expect(CODEX_REQUEST_SHAPE.systemAs).toBe("instructions");
    expect(CODEX_REQUEST_SHAPE.force).toEqual({ store: false, stream: true });
    expect(CODEX_REQUEST_SHAPE.omit).toContain("temperature");

    expect(CODEX_REQUEST_SHAPE.transform({ model: "gpt-5.4" })).toEqual({
      model: "gpt-5.4",
      instructions: DEFAULT_CODEX_INSTRUCTIONS,
    });
    expect(
      CODEX_REQUEST_SHAPE.transform({
        model: "gpt-5.4",
        instructions: "Keep narrative tone.",
      }),
    ).toEqual({
      model: "gpt-5.4",
      instructions: "Keep narrative tone.",
    });

    expect(
      buildCodexHeaders({
        accessToken: "tok-1",
        accountHeaderId: "acct-hdr-1",
      }),
    ).toEqual({
      authorization: "Bearer tok-1",
      "OpenAI-Beta": "responses=experimental",
      originator: "codex_cli_rs",
      accept: "text/event-stream",
      "ChatGPT-Account-Id": "acct-hdr-1",
    });

    expect(
      extractCodexModels({
        models: [{ slug: "gpt-5.4" }, { id: "gpt-5.3-codex" }, { slug: "gpt-5.4" }],
      }),
    ).toEqual(["gpt-5.4", "gpt-5.3-codex"]);
    expect(FALLBACK_CODEX_MODELS).toContain("gpt-5.4");

    const usage = formatCodexUsage(
      { id: "acct-1", label: "a@b.c", plan: "plus" },
      {
        plan_type: "plus",
        rate_limit: {
          primary_window: {
            used_percent: 25,
            limit_window_seconds: 18_000,
            reset_at: 1_800_000_000,
          },
          secondary_window: {
            used_percent: 10,
            limit_window_seconds: 604_800,
            reset_at: 1_800_500_000,
          },
        },
      },
    );
    expect(usage).toMatchObject({
      accountId: "acct-1",
      remaining: 75,
      limit: 100,
      windows: [
        { name: "5h", usedPercent: 25, remainingPercent: 75 },
        { name: "Weekly", usedPercent: 10, remainingPercent: 90 },
      ],
    });

    expect(classifyCodexError({ statusCode: 401, message: "unauthorized" })?.kind).toBe("auth");
    expect(classifyCodexError({ statusCode: 429, message: "rate_limit" })?.kind).toBe("rate_limited");
    expect(classifyCodexError({ statusCode: 400, body: { error: { code: "usage_limit_reached" } }, message: "limit" })?.kind).toBe("quota");
  });
});

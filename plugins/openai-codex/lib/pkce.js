import { createHash, randomBytes } from "node:crypto";
import {
  OPENAI_CLIENT_ID,
  OPENAI_OAUTH_AUTHORIZE_URL,
  OPENAI_OAUTH_ORIGINATOR,
  OPENAI_OAUTH_SCOPE,
  OPENAI_REDIRECT_URI,
} from "./constants.js";

export function generateCodeVerifier() {
  return randomBytes(32).toString("base64url");
}

export function deriveCodeChallenge(codeVerifier) {
  return createHash("sha256").update(codeVerifier).digest("base64url");
}

export function generateOAuthState() {
  return randomBytes(24).toString("base64url");
}

export function buildCodexAuthorizeUrl({
  redirectUri = OPENAI_REDIRECT_URI,
  state,
  codeChallenge,
}) {
  const url = new URL(OPENAI_OAUTH_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", OPENAI_CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", OPENAI_OAUTH_SCOPE);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("id_token_add_organizations", "true");
  url.searchParams.set("codex_cli_simplified_flow", "true");
  url.searchParams.set("originator", OPENAI_OAUTH_ORIGINATOR);
  url.searchParams.set("state", state);
  return url.toString();
}

function stripOuterDelimiters(text) {
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("<") && trimmed.endsWith(">"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function paramsFromUrlCandidate(text) {
  let candidate = text;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(candidate)) {
    if (candidate.startsWith("/")) {
      candidate = `http://localhost:1455${candidate}`;
    } else if (/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:[/?#]|$)/i.test(candidate)) {
      candidate = `http://${candidate}`;
    } else {
      return null;
    }
  }
  try {
    const parsed = new URL(candidate);
    const merged = new URLSearchParams(parsed.search);
    if (parsed.hash && parsed.hash.length > 1) {
      const hashQuery = parsed.hash.startsWith("#?")
        ? parsed.hash.slice(2)
        : parsed.hash.slice(1);
      for (const [k, v] of new URLSearchParams(hashQuery).entries()) {
        if (!merged.has(k)) merged.set(k, v);
      }
    }
    return merged;
  } catch {
    return null;
  }
}

/**
 * Parses a pasted OAuth callback input from the browser address bar or loopback
 * handler:
 * - Full URL: `http://localhost:1455/auth/callback?code=...&state=...`
 * - Schemeless host URL: `localhost:1455/auth/callback?code=...&state=...`
 * - Relative callback path: `/auth/callback?code=...&state=...`
 * - Raw query or fragment string: `?code=...&state=...`, `code=...&state=...`, `#code=...`
 */
export function parseOAuthCallbackInput(rawInput) {
  if (typeof rawInput !== "string") {
    return { ok: false, code: "invalid_callback" };
  }
  const normalized = stripOuterDelimiters(rawInput);
  if (!normalized) {
    return { ok: false, code: "invalid_callback" };
  }

  let params = paramsFromUrlCandidate(normalized);
  if (!params) {
    const querySource = normalized.startsWith("?") || normalized.startsWith("#")
      ? normalized.slice(1)
      : normalized;
    if (!querySource.includes("=")) {
      return { ok: false, code: "invalid_callback" };
    }
    params = new URLSearchParams(querySource);
  }

  const error = params.get("error")?.trim() || null;
  const errorDescription = params.get("error_description")?.trim() || null;
  const authCode = params.get("code")?.trim() || null;
  const state = params.get("state")?.trim() || null;

  if (error) {
    return {
      ok: false,
      code: "oauth_error",
      error,
      errorDescription,
      state,
    };
  }
  if (!authCode) {
    return { ok: false, code: "missing_code", state };
  }
  return {
    ok: true,
    authCode,
    state,
  };
}

import {
  OPENAI_CLIENT_ID,
  OPENAI_DEVICE_REDIRECT_URI,
  OPENAI_DEVICE_TOKEN_URL,
  OPENAI_DEVICE_USERCODE_URL,
  OPENAI_OAUTH_TOKEN_URL,
  OPENAI_REDIRECT_URI,
} from "./constants.js";
import { extractCodexIdentity } from "./jwt.js";

function isProxyPermissionError(error) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /net\.authProxy/i.test(message);
}

export async function fetchWithAuthProxyFallback(http, url, init = {}) {
  try {
    return await http.fetchWithRetry(url, {
      ...init,
      proxy: "instance-auth",
    });
  } catch (error) {
    if (!isProxyPermissionError(error)) {
      throw error;
    }
    return await http.fetchWithRetry(url, init);
  }
}

export function sanitizeErrorDetail(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(
      /"(?:access_token|refresh_token|id_token)"\s*:\s*"[^"]*"/gi,
      '"[token]":"[redacted]"',
    )
    .slice(0, 240);
}

async function parseTokenResponse(resp, fallbackRefreshToken = null) {
  const rawText = await resp.text().catch(() => "");
  let payload = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = {};
    }
  }
  if (!resp.ok) {
    const err = new Error(
      `OAuth token request failed (HTTP ${resp.status})${rawText ? `: ${sanitizeErrorDetail(rawText)}` : ""}`,
    );
    err.statusCode = resp.status;
    err.oauthError =
      typeof payload?.error === "string"
        ? payload.error
        : typeof payload?.error?.code === "string"
          ? payload.error.code
          : undefined;
    throw err;
  }

  const accessToken =
    typeof payload.access_token === "string" ? payload.access_token.trim() : "";
  if (!accessToken) {
    throw new Error("OAuth token response omitted access_token");
  }
  const refreshToken =
    typeof payload.refresh_token === "string" && payload.refresh_token.trim()
      ? payload.refresh_token.trim()
      : fallbackRefreshToken;
  const idToken =
    typeof payload.id_token === "string" && payload.id_token.trim()
      ? payload.id_token.trim()
      : null;

  const identity = extractCodexIdentity({ accessToken, idToken });
  const expiresAt =
    identity.expiresAt ??
    (typeof payload.expires_in === "number" &&
    Number.isFinite(payload.expires_in) &&
    payload.expires_in > 0
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : null);

  return {
    accessToken,
    refreshToken,
    idToken,
    accountHeaderId: identity.accountHeaderId,
    expiresAt,
  };
}

export async function exchangeAuthorizationCode(
  http,
  { code, codeVerifier, redirectUri = OPENAI_REDIRECT_URI },
) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: OPENAI_CLIENT_ID,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri,
  });
  const resp = await fetchWithAuthProxyFallback(http, OPENAI_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return parseTokenResponse(resp);
}

export async function refreshOAuthToken(http, { refreshToken }) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: OPENAI_CLIENT_ID,
  });
  const resp = await fetchWithAuthProxyFallback(http, OPENAI_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  return parseTokenResponse(resp, refreshToken);
}

export async function requestDeviceUserCode(http) {
  const resp = await fetchWithAuthProxyFallback(
    http,
    OPENAI_DEVICE_USERCODE_URL,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ client_id: OPENAI_CLIENT_ID }),
    },
  );
  if (!resp.ok) {
    const rawText = await resp.text().catch(() => "");
    throw new Error(
      `Device authorization request failed (HTTP ${resp.status})${rawText ? `: ${sanitizeErrorDetail(rawText)}` : ""}`,
    );
  }
  const data = await resp.json();
  const deviceAuthId =
    typeof data?.device_auth_id === "string" ? data.device_auth_id.trim() : "";
  const userCode =
    typeof data?.user_code === "string"
      ? data.user_code.trim()
      : typeof data?.usercode === "string"
        ? data.usercode.trim()
        : "";
  if (!deviceAuthId || !userCode) {
    throw new Error(
      "Device authorization response omitted device_auth_id or user_code",
    );
  }
  const rawInterval = Number(data?.interval);
  const intervalSec =
    Number.isFinite(rawInterval) && rawInterval >= 1
      ? Math.min(60, Math.trunc(rawInterval))
      : 5;
  const rawExpiresIn = Number(data?.expires_in);
  const expiresInSec =
    Number.isFinite(rawExpiresIn) && rawExpiresIn >= 60
      ? Math.trunc(rawExpiresIn)
      : 900;

  return {
    deviceAuthId,
    userCode,
    intervalSec,
    expiresInSec,
  };
}

export async function pollDeviceAuthorization(http, { deviceAuthId, userCode }) {
  const resp = await fetchWithAuthProxyFallback(http, OPENAI_DEVICE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      device_auth_id: deviceAuthId,
      user_code: userCode,
    }),
  });

  if (resp.status === 403 || resp.status === 404) {
    return { status: "pending" };
  }

  const rawText = await resp.text().catch(() => "");
  let payload = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText);
    } catch {
      payload = {};
    }
  }

  if (resp.status === 429) {
    return { status: "pending", slowDown: true };
  }

  if (!resp.ok) {
    const code = typeof payload?.error === "string" ? payload.error : "";
    if (code === "authorization_pending" || code === "slow_down") {
      return { status: "pending", slowDown: code === "slow_down" };
    }
    return {
      status: "failed",
      code: code || `http_${resp.status}`,
      message: `Device authorization failed (HTTP ${resp.status})${rawText ? `: ${sanitizeErrorDetail(rawText)}` : ""}`,
    };
  }

  const code =
    typeof payload?.authorization_code === "string"
      ? payload.authorization_code.trim()
      : "";
  const codeVerifier =
    typeof payload?.code_verifier === "string"
      ? payload.code_verifier.trim()
      : "";
  if (!code || !codeVerifier) {
    return {
      status: "failed",
      code: "invalid_device_token",
      message:
        "Device authorization response omitted authorization_code or code_verifier",
    };
  }

  const tokens = await exchangeAuthorizationCode(http, {
    code,
    codeVerifier,
    redirectUri: OPENAI_DEVICE_REDIRECT_URI,
  });
  return { status: "authorized", tokens };
}

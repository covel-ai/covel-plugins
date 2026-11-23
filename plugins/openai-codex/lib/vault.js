import { SECRETS_KEY } from "./constants.js";
import { extractCodexIdentity } from "./jwt.js";

function emptyVault() {
  return { activeAccountId: null, accounts: {} };
}

export function isExpiringSoon(expiresAt, skewMs = 0, nowMs = Date.now()) {
  if (typeof expiresAt !== "string" || !expiresAt) return false;
  const parsed = Date.parse(expiresAt);
  if (!Number.isFinite(parsed)) return false;
  return parsed - skewMs <= nowMs;
}

export function effectiveAccountStatus(account, nowMs = Date.now()) {
  if (!account || typeof account !== "object") return "needs_reauth";
  const stored = account.status ?? "ready";
  if (stored === "disabled" || stored === "needs_reauth") {
    return stored;
  }
  if (
    isExpiringSoon(account.expiresAt, 0, nowMs) &&
    !account.refreshToken
  ) {
    return "needs_reauth";
  }
  return stored;
}

export async function readVault(ctx) {
  if (!ctx?.secrets) return emptyVault();
  const stored = await ctx.secrets.get(SECRETS_KEY);
  if (!stored || !stored.value || typeof stored.value !== "object") {
    return emptyVault();
  }
  const value = stored.value;
  return {
    activeAccountId:
      typeof value.activeAccountId === "string" ? value.activeAccountId : null,
    accounts:
      value.accounts &&
      typeof value.accounts === "object" &&
      !Array.isArray(value.accounts)
        ? { ...value.accounts }
        : {},
  };
}

function statusBadgeColor(status) {
  switch (status) {
    case "ready":
      return "green";
    case "rate_limited":
      return "amber";
    case "needs_reauth":
    case "disabled":
      return "red";
    default:
      return "amber";
  }
}

export function summarizeAccounts(vault, nowMs = Date.now()) {
  return Object.values(vault.accounts).map((acc) => {
    const status = effectiveAccountStatus(acc, nowMs);
    return {
      id: acc.id,
      label: acc.label ?? acc.id,
      status,
      isDefault: acc.id === vault.activeAccountId,
      ...(typeof acc.expiresAt === "string" ? { expiresAt: acc.expiresAt } : {}),
      ...(typeof acc.updatedAt === "string" ? { updatedAt: acc.updatedAt } : {}),
      ...(typeof acc.plan === "string" ? { plan: acc.plan } : {}),
    };
  });
}

export function buildPublicSummary(vault, nowMs = Date.now()) {
  const items = Object.values(vault.accounts).map((acc) => {
    const status = effectiveAccountStatus(acc, nowMs);
    return {
      id: acc.id,
      label: acc.label ?? acc.id,
      status,
      statusColor: statusBadgeColor(status),
      isDefault: acc.id === vault.activeAccountId,
      ...(typeof acc.email === "string" ? { email: acc.email } : {}),
      ...(typeof acc.plan === "string" ? { plan: acc.plan } : {}),
      ...(typeof acc.expiresAt === "string" ? { expiresAt: acc.expiresAt } : {}),
      ...(typeof acc.updatedAt === "string" ? { updatedAt: acc.updatedAt } : {}),
    };
  });
  return {
    activeAccountId: vault.activeAccountId,
    count: items.length,
    hasAccounts: items.length > 0,
    items,
  };
}

export async function syncPublicSummary(ctx, vault) {
  if (!ctx?.instanceData) return;
  await ctx.instanceData.set("accounts", "summary", buildPublicSummary(vault));
}

export async function writeVault(ctx, vault) {
  if (!ctx?.secrets) {
    throw new Error("Host secret storage is unavailable");
  }
  await ctx.secrets.set(SECRETS_KEY, vault);
  await syncPublicSummary(ctx, vault);
}

export function upsertAccount(
  vault,
  credentials,
  { makeDefault = false, nowIso = new Date().toISOString() } = {},
) {
  const identity = extractCodexIdentity({
    accessToken: credentials.accessToken,
    idToken: credentials.idToken,
    explicitAccountId: credentials.accountHeaderId ?? credentials.accountId,
  });
  const accountId = credentials.id ?? identity.id;
  const existing = vault.accounts[accountId];
  const generation = (existing?.generation ?? 0) + 1;
  const record = {
    id: accountId,
    accountHeaderId:
      identity.accountHeaderId ?? existing?.accountHeaderId ?? null,
    label: credentials.label ?? identity.label ?? existing?.label ?? accountId,
    email: identity.email ?? existing?.email ?? null,
    plan: identity.plan ?? existing?.plan ?? null,
    accessToken: credentials.accessToken,
    refreshToken: credentials.refreshToken ?? existing?.refreshToken ?? null,
    idToken: credentials.idToken ?? existing?.idToken ?? null,
    expiresAt: credentials.expiresAt ?? identity.expiresAt ?? null,
    updatedAt: nowIso,
    generation,
    status: "ready",
  };
  vault.accounts[accountId] = record;
  if (!vault.activeAccountId || makeDefault || !vault.accounts[vault.activeAccountId]) {
    vault.activeAccountId = accountId;
  }
  return record;
}

export function parseImportedAuthJson(rawText) {
  if (typeof rawText !== "string") {
    return { ok: false, code: "invalid_json", message: "Expected JSON text." };
  }
  const cleaned = rawText.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    return {
      ok: false,
      code: "invalid_json",
      message: "Credential JSON cannot be empty.",
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return {
      ok: false,
      code: "invalid_json",
      message: "Malformed JSON. Paste the contents of ~/.codex/auth.json.",
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      ok: false,
      code: "invalid_json",
      message: "Expected a JSON object from ~/.codex/auth.json.",
    };
  }

  const tokens =
    parsed.tokens &&
    typeof parsed.tokens === "object" &&
    !Array.isArray(parsed.tokens)
      ? parsed.tokens
      : parsed;

  if (
    parsed.auth_mode === "apikey" ||
    (!tokens.access_token &&
      typeof parsed.OPENAI_API_KEY === "string" &&
      parsed.OPENAI_API_KEY.trim().length > 0)
  ) {
    return {
      ok: false,
      code: "apikey_not_supported",
      message:
        "This auth.json uses an OPENAI_API_KEY rather than ChatGPT OAuth tokens. Configure API keys in Covel Settings instead.",
    };
  }

  const accessToken =
    typeof tokens.access_token === "string" ? tokens.access_token.trim() : "";
  if (!accessToken) {
    return {
      ok: false,
      code: "missing_access_token",
      message:
        "No valid tokens.access_token found. Run `codex login` first or sign in with Browser OAuth / Device Code.",
    };
  }

  const refreshToken =
    typeof tokens.refresh_token === "string" && tokens.refresh_token.trim()
      ? tokens.refresh_token.trim()
      : null;
  const idToken =
    typeof tokens.id_token === "string" && tokens.id_token.trim()
      ? tokens.id_token.trim()
      : null;
  const accountHeaderId =
    typeof tokens.account_id === "string" && tokens.account_id.trim()
      ? tokens.account_id.trim()
      : null;

  return {
    ok: true,
    credentials: {
      accessToken,
      refreshToken,
      idToken,
      accountHeaderId,
    },
  };
}

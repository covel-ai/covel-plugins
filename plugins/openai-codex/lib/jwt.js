import { createHash } from "node:crypto";

const OPENAI_AUTH_CLAIM = "https://api.openai.com/auth";
const OPENAI_PROFILE_CLAIM = "https://api.openai.com/profile";

function nonEmpty(value) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/**
 * Decode a JWT payload without throwing on malformed tokens.
 * Tokens are validated server-side by OpenAI; claims are used purely for
 * routing headers (`ChatGPT-Account-Id`), expiry estimation, and UI labels.
 */
export function decodeJwtPayload(token) {
  if (typeof token !== "string" || token.length === 0) return null;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const decoded = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(decoded);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function claimObject(claims, key) {
  const value = claims?.[key];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

export function extractCodexIdentity({
  accessToken,
  idToken,
  explicitAccountId,
} = {}) {
  const accessClaims = decodeJwtPayload(accessToken);
  const idClaims = decodeJwtPayload(idToken);
  const accessAuth = claimObject(accessClaims, OPENAI_AUTH_CLAIM);
  const idAuth = claimObject(idClaims, OPENAI_AUTH_CLAIM);
  const accessProfile = claimObject(accessClaims, OPENAI_PROFILE_CLAIM);
  const idProfile = claimObject(idClaims, OPENAI_PROFILE_CLAIM);

  const accountHeaderId =
    nonEmpty(explicitAccountId) ??
    nonEmpty(accessAuth?.chatgpt_account_id) ??
    nonEmpty(idAuth?.chatgpt_account_id) ??
    null;

  const userId =
    nonEmpty(accessAuth?.chatgpt_user_id) ??
    nonEmpty(idAuth?.chatgpt_user_id) ??
    nonEmpty(idClaims?.sub) ??
    nonEmpty(accessClaims?.sub) ??
    null;

  const email =
    nonEmpty(idClaims?.email) ??
    nonEmpty(idProfile?.email) ??
    nonEmpty(accessProfile?.email) ??
    nonEmpty(accessClaims?.email) ??
    null;

  const rawPlan =
    nonEmpty(accessAuth?.chatgpt_plan_type) ??
    nonEmpty(idAuth?.chatgpt_plan_type) ??
    null;
  const plan = rawPlan ? rawPlan.toLowerCase() : null;

  const expSeconds =
    typeof accessClaims?.exp === "number" &&
    Number.isFinite(accessClaims.exp) &&
    accessClaims.exp > 0
      ? accessClaims.exp
      : null;
  const expiresAt =
    expSeconds !== null ? new Date(expSeconds * 1000).toISOString() : null;

  const rawId =
    accountHeaderId ??
    userId ??
    email ??
    `imported-${createHash("sha256")
      .update(String(accessToken ?? ""))
      .digest("hex")
      .slice(0, 12)}`;

  const id = rawId.replace(/\s+/g, "-");
  const label = email
    ? plan
      ? `${email} (${plan})`
      : email
    : plan
      ? `Codex ${plan} (${id.slice(0, 8)})`
      : `Codex (${id.slice(0, 8)})`;

  return {
    id,
    accountHeaderId,
    email,
    plan,
    expiresAt,
    label,
  };
}

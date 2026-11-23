import {
  DEFAULT_CODEX_INSTRUCTIONS,
  FALLBACK_CODEX_MODELS,
  OPENAI_CODEX_MODELS_URL,
  OPENAI_CODEX_USAGE_URL,
  OPENAI_OAUTH_ORIGINATOR,
} from "./constants.js";
import { fetchWithAuthProxyFallback } from "./oauth.js";

export const CODEX_REQUEST_SHAPE = Object.freeze({
  endpointPath: "/responses",
  systemAs: "instructions",
  omit: Object.freeze([
    "temperature",
    "top_p",
    "max_output_tokens",
    "previous_response_id",
    "service_tier",
    "prompt_cache_retention",
    "safety_identifier",
  ]),
  force: Object.freeze({
    store: false,
    stream: true,
  }),
  transform(body) {
    if (
      typeof body.instructions !== "string" ||
      body.instructions.trim().length === 0
    ) {
      return { ...body, instructions: DEFAULT_CODEX_INSTRUCTIONS };
    }
    return body;
  },
});

export function buildCodexHeaders(account, accept = "text/event-stream") {
  return {
    authorization: `Bearer ${account.accessToken}`,
    "OpenAI-Beta": "responses=experimental",
    originator: OPENAI_OAUTH_ORIGINATOR,
    ...(accept ? { accept } : {}),
    ...(account.accountHeaderId
      ? { "ChatGPT-Account-Id": account.accountHeaderId }
      : {}),
  };
}

export function extractCodexModels(payload) {
  const candidates = [];
  if (Array.isArray(payload?.models)) {
    for (const entry of payload.models) {
      if (typeof entry === "string" && entry.trim()) {
        candidates.push(entry.trim());
      } else if (entry && typeof entry === "object") {
        const slug =
          typeof entry.slug === "string"
            ? entry.slug.trim()
            : typeof entry.id === "string"
              ? entry.id.trim()
              : "";
        if (slug) candidates.push(slug);
      }
    }
  }
  if (Array.isArray(payload?.data)) {
    for (const entry of payload.data) {
      if (entry && typeof entry === "object" && typeof entry.id === "string") {
        const id = entry.id.trim();
        if (id) candidates.push(id);
      }
    }
  }
  return [...new Set(candidates)];
}

export async function fetchCodexModels(http, account) {
  if (!account?.accessToken) {
    return [...FALLBACK_CODEX_MODELS];
  }
  try {
    const resp = await fetchWithAuthProxyFallback(http, OPENAI_CODEX_MODELS_URL, {
      method: "GET",
      headers: buildCodexHeaders(account, "application/json"),
    });
    if (!resp.ok) {
      return [...FALLBACK_CODEX_MODELS];
    }
    const payload = await resp.json();
    const models = extractCodexModels(payload);
    return models.length > 0 ? models : [...FALLBACK_CODEX_MODELS];
  } catch {
    return [...FALLBACK_CODEX_MODELS];
  }
}

function windowDisplayName(win, fallbackName) {
  const secs = Number(win?.limit_window_seconds);
  if (Number.isFinite(secs) && secs > 0) {
    if (secs >= 500_000) return "Weekly";
    if (secs >= 3_600) return `${Math.round(secs / 3_600)}h`;
    return `${Math.round(secs / 60)}m`;
  }
  return fallbackName;
}

function resolveResetAtIso(win) {
  if (typeof win?.reset_at === "number" && Number.isFinite(win.reset_at)) {
    return new Date(win.reset_at * 1000).toISOString();
  }
  if (
    typeof win?.reset_after_seconds === "number" &&
    Number.isFinite(win.reset_after_seconds)
  ) {
    return new Date(Date.now() + win.reset_after_seconds * 1000).toISOString();
  }
  return undefined;
}

function normalizeUsageWindow(win, fallbackName) {
  if (!win || typeof win !== "object") return null;
  const rawUsed = Number(win.used_percent);
  const usedPercent = Number.isFinite(rawUsed)
    ? Math.max(0, Math.min(100, rawUsed))
    : undefined;
  const remainingPercent =
    usedPercent !== undefined ? Math.max(0, 100 - usedPercent) : undefined;
  const resetAt = resolveResetAtIso(win);
  return {
    name: windowDisplayName(win, fallbackName),
    ...(usedPercent !== undefined ? { usedPercent } : {}),
    ...(remainingPercent !== undefined ? { remainingPercent } : {}),
    ...(resetAt ? { resetAt } : {}),
  };
}

export function formatCodexUsage(account, payload) {
  if (!payload || typeof payload !== "object") return null;
  const rate = payload.rate_limit ?? {};
  const windows = [
    normalizeUsageWindow(rate.primary_window, "Primary"),
    normalizeUsageWindow(rate.secondary_window, "Secondary"),
  ].filter(Boolean);

  const primary = windows[0];
  const plan =
    typeof payload.plan_type === "string" && payload.plan_type.trim()
      ? payload.plan_type.trim().toLowerCase()
      : account.plan;

  const summaryParts = [];
  if (plan) summaryParts.push(`Plan: ${plan}`);
  for (const w of windows) {
    if (w.remainingPercent !== undefined) {
      summaryParts.push(`${w.name}: ${w.remainingPercent}% left`);
    }
  }
  if (rate.limit_reached === true) {
    summaryParts.push("Limit reached");
  }

  return {
    accountId: account.id,
    label: account.label ?? account.id,
    ...(primary?.remainingPercent !== undefined
      ? { remaining: primary.remainingPercent, limit: 100 }
      : {}),
    ...(primary?.resetAt ? { resetAt: primary.resetAt } : {}),
    ...(summaryParts.length > 0 ? { summary: summaryParts.join(" · ") } : {}),
    ...(windows.length > 0 ? { windows } : {}),
  };
}

export async function fetchCodexUsage(http, account) {
  if (!account?.accessToken) return null;
  try {
    const resp = await fetchWithAuthProxyFallback(http, OPENAI_CODEX_USAGE_URL, {
      method: "GET",
      headers: buildCodexHeaders(account, "application/json"),
    });
    if (!resp.ok) return null;
    const payload = await resp.json();
    return formatCodexUsage(account, payload);
  } catch {
    return null;
  }
}

export function classifyCodexError(error) {
  const status = error?.statusCode;
  const message = typeof error?.message === "string" ? error.message : "";
  let bodyCode = "";
  let bodyDetail = "";
  if (error?.body && typeof error.body === "object") {
    const inner = error.body.error ?? error.body;
    if (typeof inner?.code === "string") bodyCode = inner.code;
    if (typeof inner?.type === "string" && !bodyCode) bodyCode = inner.type;
    if (typeof inner?.message === "string") bodyDetail = inner.message;
  } else if (typeof error?.body === "string") {
    bodyDetail = error.body;
  }
  const combined = `${bodyCode} ${bodyDetail} ${message}`;

  if (
    status === 401 ||
    /invalid_token|token_expired|invalid_oauth|unauthorized/i.test(combined)
  ) {
    return {
      kind: "auth",
      message:
        "ChatGPT session expired or unauthorized. Re-authenticate your OpenAI Codex account.",
    };
  }
  if (
    status === 402 ||
    /usage_limit|insufficient_quota|quota_exceeded/i.test(combined)
  ) {
    return {
      kind: "quota",
      message: "ChatGPT Codex subscription usage quota reached.",
    };
  }
  if (status === 429 || /rate_limit|too_many_requests/i.test(combined)) {
    return {
      kind: "rate_limited",
      message: "OpenAI Codex rate limit reached; failing over or waiting for reset.",
    };
  }
  if (
    status === 403 &&
    /subscription|plan|workspace|entitlement|deactivated/i.test(combined)
  ) {
    return {
      kind: "auth",
      message: "This ChatGPT account or workspace does not have Codex access.",
    };
  }
  if (status === 503 || /overloaded/i.test(combined)) {
    return {
      kind: "overloaded",
      message: "OpenAI Codex service is temporarily overloaded.",
    };
  }
  return null;
}

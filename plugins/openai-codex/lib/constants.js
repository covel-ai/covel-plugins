export const OPENAI_AUTH_ORIGIN = "https://auth.openai.com";
export const OPENAI_OAUTH_AUTHORIZE_URL = `${OPENAI_AUTH_ORIGIN}/oauth/authorize`;
export const OPENAI_OAUTH_TOKEN_URL = `${OPENAI_AUTH_ORIGIN}/oauth/token`;
export const OPENAI_DEVICE_USERCODE_URL = `${OPENAI_AUTH_ORIGIN}/api/accounts/deviceauth/usercode`;
export const OPENAI_DEVICE_TOKEN_URL = `${OPENAI_AUTH_ORIGIN}/api/accounts/deviceauth/token`;
export const OPENAI_DEVICE_REDIRECT_URI = `${OPENAI_AUTH_ORIGIN}/deviceauth/callback`;
export const OPENAI_DEVICE_VERIFY_URL = `${OPENAI_AUTH_ORIGIN}/codex/device`;

export const OPENAI_CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
export const OPENAI_CODEX_MODELS_URL = `${OPENAI_CODEX_BASE_URL}/models?client_version=0.101.0`;
export const OPENAI_CODEX_USAGE_URL = "https://chatgpt.com/backend-api/wham/usage";

export const OPENAI_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
export const OPENAI_OAUTH_SCOPE = "openid profile email offline_access";
export const OPENAI_OAUTH_ORIGINATOR = "codex_cli_rs";
export const OPENAI_REDIRECT_PORT = 1455;
export const OPENAI_REDIRECT_PATH = "/auth/callback";
export const OPENAI_REDIRECT_URI = `http://localhost:${OPENAI_REDIRECT_PORT}${OPENAI_REDIRECT_PATH}`;

export const DEFAULT_CODEX_INSTRUCTIONS = "You are a helpful assistant.";

export const FALLBACK_CODEX_MODELS = Object.freeze([
  "gpt-5.4",
  "gpt-5.3-codex",
  "gpt-5.2-codex",
  "gpt-5.1-codex",
  "gpt-5.1-codex-max",
  "gpt-5.1-codex-mini",
]);

export const SECRETS_KEY = "codex.accounts.v1";
export const TOKEN_REFRESH_SKEW_MS = 60_000;
export const FLOW_TTL_MS = 10 * 60_000;
export const IMPORT_MAX_BYTES = 65_536;
export const MAX_PENDING_FLOW_RUNS = 64;

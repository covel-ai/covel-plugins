import {
  FLOW_TTL_MS,
  IMPORT_MAX_BYTES,
  MAX_PENDING_FLOW_RUNS,
  OPENAI_DEVICE_VERIFY_URL,
  OPENAI_REDIRECT_PORT,
  OPENAI_REDIRECT_URI,
  TOKEN_REFRESH_SKEW_MS,
} from "../lib/constants.js";
import {
  CODEX_REQUEST_SHAPE,
  buildCodexHeaders,
  classifyCodexError,
  fetchCodexModels,
  fetchCodexUsage,
} from "../lib/codex-api.js";
import {
  exchangeAuthorizationCode,
  pollDeviceAuthorization,
  refreshOAuthToken,
  requestDeviceUserCode,
} from "../lib/oauth.js";
import {
  buildCodexAuthorizeUrl,
  deriveCodeChallenge,
  generateCodeVerifier,
  generateOAuthState,
  parseOAuthCallbackInput,
} from "../lib/pkce.js";
import {
  isExpiringSoon,
  parseImportedAuthJson,
  readVault,
  summarizeAccounts,
  syncPublicSummary,
  upsertAccount,
  writeVault,
} from "../lib/vault.js";

function prunePendingRuns(map, nowMs = Date.now()) {
  for (const [runId, entry] of map) {
    if (entry.expiresAtMs <= nowMs) {
      map.delete(runId);
    }
  }
  while (map.size >= MAX_PENDING_FLOW_RUNS) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
}

function buildResolvedCredential(account) {
  return {
    accountId: account.id,
    credentialGeneration: account.generation ?? 1,
    headers: buildCodexHeaders(account),
    requestShape: CODEX_REQUEST_SHAPE,
  };
}

export default function registerOpenAiCodexProvider(covel) {
  const pendingOAuthRuns = new Map();
  const pendingDeviceRuns = new Map();
  const inFlightAccountRefreshes = new Map();

  covel.onDispose(() => {
    pendingOAuthRuns.clear();
    pendingDeviceRuns.clear();
    inFlightAccountRefreshes.clear();
  });

  async function refreshStoredAccount(ctx, targetAccountId) {
    const lockKey = targetAccountId ?? "__default__";
    const existingRefresh = inFlightAccountRefreshes.get(lockKey);
    if (existingRefresh) {
      return existingRefresh;
    }

    const work = (async () => {
      const vault = await readVault(ctx);
      const effectiveId = targetAccountId ?? vault.activeAccountId;
      const account = effectiveId ? vault.accounts[effectiveId] : undefined;
      if (!account || !account.refreshToken) return null;

      try {
        const refreshed = await refreshOAuthToken(ctx.http, {
          refreshToken: account.refreshToken,
        });
        const updated = upsertAccount(vault, {
          id: account.id,
          accountHeaderId:
            refreshed.accountHeaderId ?? account.accountHeaderId ?? null,
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken ?? account.refreshToken,
          idToken: refreshed.idToken ?? account.idToken,
          expiresAt: refreshed.expiresAt,
        });
        await writeVault(ctx, vault);
        return updated;
      } catch (error) {
        if (error?.statusCode === 400 || error?.statusCode === 401) {
          account.status = "needs_reauth";
          account.updatedAt = new Date().toISOString();
          await writeVault(ctx, vault);
          return null;
        }
        throw error;
      }
    })();

    inFlightAccountRefreshes.set(lockKey, work);
    try {
      return await work;
    } finally {
      if (inFlightAccountRefreshes.get(lockKey) === work) {
        inFlightAccountRefreshes.delete(lockKey);
      }
    }
  }

  covel.registerConfigFlow("oauth-sign-in", {
    requiredCapabilities: ["secrets.own"],
    async start(_input, ctx) {
      const nowMs = Date.now();
      prunePendingRuns(pendingOAuthRuns, nowMs);

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = deriveCodeChallenge(codeVerifier);

      let loopbackActive = false;
      let loopbackState = null;
      let fallbackNoteEn =
        "After signing in, paste the redirected URL from your browser address bar below.";
      let fallbackNoteZh =
        "在浏览器完成登录后，请将地址栏跳转后的回调 URL 粘贴到下方输入框自动解析完成。";

      if (typeof ctx.startLoopbackCallback === "function") {
        try {
          const loopback = await ctx.startLoopbackCallback();
          if (loopback.port === OPENAI_REDIRECT_PORT) {
            loopbackActive = true;
            if (typeof loopback.state === "string" && loopback.state.length > 0) {
              loopbackState = loopback.state;
            }
          } else {
            await loopback.close().catch(() => {});
            fallbackNoteEn = `Local port ${OPENAI_REDIRECT_PORT} is busy. Complete sign-in in your browser, then paste the redirected URL below.`;
            fallbackNoteZh = `本地端口 ${OPENAI_REDIRECT_PORT} 已被占用。在浏览器完成登录后，请将跳转后的回调 URL 粘贴到下方输入框自动解析完成。`;
          }
        } catch {
          fallbackNoteEn =
            "Local loopback listener is unavailable here. Complete sign-in in your browser, then paste the redirected URL below.";
          fallbackNoteZh =
            "当前无法开启本地回调监听。在浏览器完成登录后，请将跳转后的回调 URL 粘贴到下方输入框自动解析完成。";
        }
      }

      const state = loopbackState ?? generateOAuthState();
      const authorizeUrl = buildCodexAuthorizeUrl({
        redirectUri: OPENAI_REDIRECT_URI,
        state,
        codeChallenge,
      });

      const expiresAtMs = nowMs + FLOW_TTL_MS;
      pendingOAuthRuns.set(ctx.runId, {
        state,
        codeVerifier,
        redirectUri: OPENAI_REDIRECT_URI,
        expiresAtMs,
      });

      return {
        kind: "browser",
        stepId: "await-callback",
        title: {
          "en-US": "Sign in with ChatGPT (OpenAI Codex)",
          "zh-CN": "使用 ChatGPT 登录（OpenAI Codex）",
        },
        description: {
          "en-US": loopbackActive
            ? "Open the authorization page and sign in with ChatGPT. Covel listens automatically on localhost:1455, or you can paste the redirected callback URL into the fallback box below."
            : `Open the authorization page and sign in with ChatGPT. ${fallbackNoteEn}`,
          "zh-CN": loopbackActive
            ? "点击打开授权页并使用 ChatGPT 登录。Covel 会自动监听 localhost:1455 回调；如果浏览器未自动跳回，也可以把回调 URL 粘贴到下方保底输入框中自动解析。"
            : `点击打开授权页并使用 ChatGPT 登录。${fallbackNoteZh}`,
        },
        authorizeUrl,
        completion: loopbackActive ? "loopback-or-paste" : "paste",
        callbackUrl: OPENAI_REDIRECT_URI,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    },

    async step(input, ctx) {
      if (input.cancelled) {
        pendingOAuthRuns.delete(ctx.runId);
        return {
          kind: "done",
          title: { "en-US": "Cancelled", "zh-CN": "已取消" },
        };
      }

      const pending = pendingOAuthRuns.get(ctx.runId);
      if (!pending || pending.expiresAtMs <= Date.now()) {
        pendingOAuthRuns.delete(ctx.runId);
        return {
          kind: "error",
          code: "flow_expired",
          title: { "en-US": "Session expired", "zh-CN": "授权会话已过期" },
          message: {
            "en-US": "The sign-in attempt expired. Please start Sign in again.",
            "zh-CN": "本次登录会话已过期，请重新发起登录。",
          },
          retryable: false,
        };
      }

      const rawCallback =
        typeof input.callbackUrl === "string"
          ? input.callbackUrl
          : typeof input.data?.callbackUrl === "string"
            ? input.data.callbackUrl
            : "";
      const parsed = parseOAuthCallbackInput(rawCallback);
      if (!parsed.ok) {
        pendingOAuthRuns.delete(ctx.runId);
        if (parsed.code === "oauth_error") {
          return {
            kind: "error",
            code: "oauth_error",
            title: {
              "en-US": "Authorization declined",
              "zh-CN": "授权被拒绝或失败",
            },
            message: {
              "en-US":
                parsed.errorDescription ??
                `Authorization server returned error "${parsed.error}".`,
              "zh-CN":
                parsed.errorDescription ??
                `授权服务器返回错误 "${parsed.error}"。`,
            },
            retryable: true,
          };
        }
        return {
          kind: "error",
          code: parsed.code,
          title: {
            "en-US": "Invalid callback URL",
            "zh-CN": "回调 URL 无效",
          },
          message: {
            "en-US":
              "Could not find an authorization code. Paste the full redirected URL from your browser address bar (containing ?code=...&state=...).",
            "zh-CN":
              "未能从输入中解析出授权码。请粘贴浏览器地址栏跳转后的完整回调 URL（需包含 ?code=...&state=...）。",
          },
          retryable: true,
        };
      }

      if (!parsed.state || parsed.state !== pending.state) {
        pendingOAuthRuns.delete(ctx.runId);
        return {
          kind: "error",
          code: "state_mismatch",
          title: {
            "en-US": "State verification failed",
            "zh-CN": "状态校验失败",
          },
          message: {
            "en-US":
              "The callback state did not match this sign-in session. Paste the full URL from the latest authorization attempt or start again.",
            "zh-CN":
              "回调里的 state 与当前登录会话不匹配。请确认粘贴的是最新一次授权跳转的完整 URL，或重新开始登录。",
          },
          retryable: true,
        };
      }

      let tokens;
      try {
        tokens = await exchangeAuthorizationCode(ctx.http, {
          code: parsed.authCode,
          codeVerifier: pending.codeVerifier,
          redirectUri: pending.redirectUri,
        });
      } catch (error) {
        pendingOAuthRuns.delete(ctx.runId);
        return {
          kind: "error",
          code: "token_exchange_failed",
          title: {
            "en-US": "Token exchange failed",
            "zh-CN": "令牌交换失败",
          },
          message:
            error instanceof Error
              ? error.message
              : "Failed to exchange authorization code for tokens.",
          retryable: true,
        };
      }

      pendingOAuthRuns.delete(ctx.runId);
      const vault = await readVault(ctx);
      const account = upsertAccount(vault, tokens);
      await writeVault(ctx, vault);

      return {
        kind: "done",
        title: {
          "en-US": "Connected to OpenAI Codex",
          "zh-CN": "已连接 OpenAI Codex",
        },
        description: {
          "en-US": `Signed in as ${account.label}.`,
          "zh-CN": `已登录账号：${account.label}。`,
        },
        summary: {
          accountId: account.id,
          label: account.label,
          ...(account.plan ? { plan: account.plan } : {}),
        },
        refreshSections: ["llm"],
      };
    },

    cancel(ctx) {
      pendingOAuthRuns.delete(ctx.runId);
    },
  });

  covel.registerConfigFlow("device-sign-in", {
    requiredCapabilities: ["secrets.own"],
    async start(_input, ctx) {
      const nowMs = Date.now();
      prunePendingRuns(pendingDeviceRuns, nowMs);

      const started = await requestDeviceUserCode(ctx.http);
      const expiresAtMs = nowMs + started.expiresInSec * 1000;
      pendingDeviceRuns.set(ctx.runId, {
        deviceAuthId: started.deviceAuthId,
        userCode: started.userCode,
        intervalSec: started.intervalSec,
        expiresAtMs,
      });

      return {
        kind: "device",
        stepId: "await-device",
        title: {
          "en-US": "Device Code Sign-In (OpenAI Codex)",
          "zh-CN": "设备码登录（OpenAI Codex）",
        },
        description: {
          "en-US":
            "Open the verification page, enter this one-time code, and sign in with your ChatGPT account.",
          "zh-CN": "打开验证页面，输入上方一次性验证码并登录你的 ChatGPT 账号。",
        },
        userCode: started.userCode,
        verificationUri: OPENAI_DEVICE_VERIFY_URL,
        intervalSec: started.intervalSec,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
    },

    async poll(ctx) {
      const pending = pendingDeviceRuns.get(ctx.runId);
      if (!pending) return null;
      if (pending.expiresAtMs <= Date.now()) {
        pendingDeviceRuns.delete(ctx.runId);
        return {
          kind: "error",
          code: "device_code_expired",
          title: { "en-US": "Device code expired", "zh-CN": "设备码已过期" },
          message: {
            "en-US": "The device code expired before authorization completed.",
            "zh-CN": "设备码在完成授权前已过期，请重试。",
          },
          retryable: true,
        };
      }

      const polled = await pollDeviceAuthorization(ctx.http, {
        deviceAuthId: pending.deviceAuthId,
        userCode: pending.userCode,
      });
      if (polled.status === "pending") {
        if (polled.slowDown) {
          pending.intervalSec = Math.min(60, pending.intervalSec + 2);
        }
        return null;
      }

      pendingDeviceRuns.delete(ctx.runId);
      if (polled.status === "failed") {
        return {
          kind: "error",
          code: polled.code ?? "device_auth_failed",
          title: {
            "en-US": "Device authorization failed",
            "zh-CN": "设备授权失败",
          },
          message: polled.message,
          retryable: true,
        };
      }

      const vault = await readVault(ctx);
      const account = upsertAccount(vault, polled.tokens);
      await writeVault(ctx, vault);

      return {
        kind: "done",
        title: {
          "en-US": "Connected to OpenAI Codex",
          "zh-CN": "已连接 OpenAI Codex",
        },
        description: {
          "en-US": `Signed in as ${account.label}.`,
          "zh-CN": `已登录账号：${account.label}。`,
        },
        summary: {
          accountId: account.id,
          label: account.label,
          ...(account.plan ? { plan: account.plan } : {}),
        },
        refreshSections: ["llm"],
      };
    },

    async step(input, ctx) {
      if (input.cancelled) {
        pendingDeviceRuns.delete(ctx.runId);
        return {
          kind: "done",
          title: { "en-US": "Cancelled", "zh-CN": "已取消" },
        };
      }
      return {
        kind: "error",
        code: "unexpected_step",
        title: { "en-US": "Waiting for approval", "zh-CN": "等待网页授权" },
        message: {
          "en-US": "Finish entering the device code in your browser.",
          "zh-CN": "请在浏览器中输入设备码完成授权。",
        },
        retryable: true,
      };
    },

    cancel(ctx) {
      pendingDeviceRuns.delete(ctx.runId);
    },
  });

  covel.registerConfigFlow("import-auth-json", {
    requiredCapabilities: ["secrets.own"],
    async start() {
      return {
        kind: "import",
        stepId: "paste-auth-json",
        title: {
          "en-US": "Import Codex auth.json",
          "zh-CN": "导入 Codex auth.json",
        },
        description: {
          "en-US":
            "Select or paste the contents of ~/.codex/auth.json (created by `codex login`).",
          "zh-CN":
            "选择或粘贴 ~/.codex/auth.json 的内容（由 `codex login` 生成）。",
        },
        accept: ".json,application/json",
        maxBytes: IMPORT_MAX_BYTES,
        placeholder:
          '{\n  "auth_mode": "chatgpt",\n  "tokens": {\n    "access_token": "...",\n    "refresh_token": "..."\n  }\n}',
      };
    },

    async step(input, ctx) {
      if (input.cancelled) {
        return {
          kind: "done",
          title: { "en-US": "Cancelled", "zh-CN": "已取消" },
        };
      }
      const rawContent =
        typeof input.data?.content === "string" ? input.data.content : "";
      const parsed = parseImportedAuthJson(rawContent);
      if (!parsed.ok) {
        return {
          kind: "error",
          code: parsed.code,
          title: {
            "en-US": "Invalid auth.json",
            "zh-CN": "无效的 auth.json",
          },
          message: parsed.message,
          retryable: true,
        };
      }

      const vault = await readVault(ctx);
      const account = upsertAccount(vault, parsed.credentials, {
        makeDefault: true,
      });
      await writeVault(ctx, vault);

      return {
        kind: "done",
        title: {
          "en-US": "Codex credentials imported",
          "zh-CN": "Codex 凭据已导入",
        },
        description: {
          "en-US": `Imported account ${account.label}.`,
          "zh-CN": `已导入账号：${account.label}。`,
        },
        summary: {
          accountId: account.id,
          label: account.label,
          ...(account.plan ? { plan: account.plan } : {}),
        },
        refreshSections: ["llm"],
      };
    },
  });

  covel.registerAppAction(
    "set-default-account",
    async (input, ctx) => {
      const accountId =
        input && typeof input.accountId === "string" ? input.accountId.trim() : "";
      const vault = await readVault(ctx);
      if (!accountId || !vault.accounts[accountId]) {
        throw new Error(`Codex account "${accountId}" does not exist`);
      }
      vault.activeAccountId = accountId;
      await writeVault(ctx, vault);
      return {
        ok: true,
        activeAccountId: accountId,
        accounts: summarizeAccounts(vault),
      };
    },
    { requiredCapabilities: ["secrets.own"] },
  );

  covel.registerAppAction(
    "remove-account",
    async (input, ctx) => {
      const accountId =
        input && typeof input.accountId === "string" ? input.accountId.trim() : "";
      const vault = await readVault(ctx);
      if (!accountId || !vault.accounts[accountId]) {
        return { ok: true, accounts: summarizeAccounts(vault) };
      }
      delete vault.accounts[accountId];
      if (vault.activeAccountId === accountId) {
        vault.activeAccountId = Object.keys(vault.accounts)[0] ?? null;
      }
      await writeVault(ctx, vault);
      return { ok: true, accounts: summarizeAccounts(vault) };
    },
    { requiredCapabilities: ["secrets.own"] },
  );

  covel.registerAppAction(
    "refresh-account",
    async (input, ctx) => {
      const accountId =
        input && typeof input.accountId === "string" ? input.accountId.trim() : undefined;
      const updated = await refreshStoredAccount(ctx, accountId);
      const vault = await readVault(ctx);
      if (!updated) {
        throw new Error(
          "Could not refresh Codex session; please sign in again.",
        );
      }
      return {
        ok: true,
        accountId: updated.id,
        status: updated.status,
        accounts: summarizeAccounts(vault),
      };
    },
    { requiredCapabilities: ["secrets.own"] },
  );

  covel.registerAppAction(
    "list-accounts",
    async (_input, ctx) => {
      const vault = await readVault(ctx);
      await syncPublicSummary(ctx, vault);
      return { accounts: summarizeAccounts(vault) };
    },
    { requiredCapabilities: ["secrets.own"] },
  );

  covel.registerProviderSources([
    {
      id: "codex",
      async listAccounts(ctx) {
        const vault = await readVault(ctx);
        await syncPublicSummary(ctx, vault);
        return summarizeAccounts(vault);
      },

      async listModels(req, ctx) {
        const vault = await readVault(ctx);
        const targetId = req?.accountId ?? vault.activeAccountId;
        const account = targetId ? vault.accounts[targetId] : undefined;
        return fetchCodexModels(ctx.http, account);
      },

      async getUsage(req, ctx) {
        const vault = await readVault(ctx);
        const targetId = req?.accountId ?? vault.activeAccountId;
        const account = targetId ? vault.accounts[targetId] : undefined;
        return fetchCodexUsage(ctx.http, account);
      },

      async resolve(req, ctx) {
        const vault = await readVault(ctx);
        const targetId = req?.accountId ?? vault.activeAccountId;
        const account = targetId ? vault.accounts[targetId] : undefined;
        if (!account) {
          throw new Error(
            "No OpenAI Codex account connected. Sign in from Settings first.",
          );
        }
        if (account.status === "disabled") {
          throw new Error(`OpenAI Codex account "${account.id}" is disabled.`);
        }

        const expiredNow = isExpiringSoon(account.expiresAt, 0);
        const expiringSoon = isExpiringSoon(
          account.expiresAt,
          TOKEN_REFRESH_SKEW_MS,
        );
        if (expiringSoon || account.status === "needs_reauth") {
          if (account.refreshToken) {
            try {
              const refreshed = await refreshStoredAccount(ctx, account.id);
              if (refreshed) {
                return buildResolvedCredential(refreshed);
              }
            } catch (error) {
              if (expiredNow || account.status === "needs_reauth") {
                throw error;
              }
            }
          }
          if (expiredNow || account.status === "needs_reauth") {
            throw new Error(
              `OpenAI Codex account "${account.id}" needs re-authentication.`,
            );
          }
        }

        return buildResolvedCredential(account);
      },

      async refresh(req, ctx) {
        const vault = await readVault(ctx);
        const targetId = req?.accountId ?? vault.activeAccountId;
        const account = targetId ? vault.accounts[targetId] : undefined;
        if (!account || !account.refreshToken) return null;

        const currentGen = account.generation ?? 1;
        if (
          req?.failedGeneration !== undefined &&
          currentGen > req.failedGeneration
        ) {
          return buildResolvedCredential(account);
        }

        const refreshed = await refreshStoredAccount(ctx, account.id);
        return refreshed ? buildResolvedCredential(refreshed) : null;
      },

      classifyError(error) {
        return classifyCodexError(error);
      },
    },
  ]);
}

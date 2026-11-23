# @covel/plugin-openai-codex

[English](README.md) · **简体中文**

通过 Covel 通用的 `provider.source@1` 契约，将 **ChatGPT Plus / Pro / Team** 订阅账号接入 **OpenAI Codex** 后端（`https://chatgpt.com/backend-api/codex`），直接在故事与工具用途中使用 Codex 系列模型。

> **宿主版本要求**：本插件基于 Plugin Platform v2（`apiVersion: 2`、`scope: instance`、`provider.source@1`、声明式 Config Flow、`SecretVault` 及 `requestShape.endpointPath`）。请使用包含 Plugin Platform v2 的 Covel 版本（`covel: ">=0.0.54"` 且包含 PR #555 / Covel `>=0.0.55`）。

## 安装与授权

在 Covel **设置 → 插件 → 安装与管理** 中输入以下地址：

```text
https://github.com/covel-ai/covel-plugins/tree/main/plugins/openai-codex
```

核对权限声明并确认安装，随后重启 Covel 后端并授权启用。

### 声明的权限

- `secrets: true`：OAuth `access_token` 与一次性轮换 `refresh_token` 仅保存在宿主加密 `SecretVault` 中；只有去敏后的账号摘要（ID、标签、邮箱、订阅档位、状态、过期时间）会同步到 `instanceData` 供设置界面展示。
- `loopbackCallback`（`/auth/callback`，优先端口 `1455`）：浏览器 OAuth 登录时自动监听 `http://localhost:1455/auth/callback`。
- `authProxy: true`：在本地 `personal` 部署下允许 OAuth / 模型 / 用量请求优先走宿主配置的网络代理（HTTP/HTTPS/SOCKS5）；未授予 `net.authProxy` 时自动回退到受 SSRF 保护的直连请求。
- `http`：
  - `POST https://auth.openai.com`（OAuth 换取令牌、刷新轮换与设备码授权）
  - `GET`、`POST https://chatgpt.com`（Codex 模型列表与额度用量查询；实际推理请求由 Covel 的 `openai-responses-v1` 适配器经同源锁定发往 `https://chatgpt.com/backend-api/codex/responses`）

`browser-private` 与托管模式会在 L1 策略下禁用 `plugin.providerSource`，本插件面向桌面端与自托管 `personal` 实例。

## 登录与接入方式

启用插件并完成授权后，打开 **设置 → OpenAI Codex**（或在 **设置 → 模型服务商** 中选择 `openai-codex/codex`）：

1. **浏览器 OAuth 登录**（`oauth-sign-in`）：
   - 通过 PKCE (`S256`) 打开 `https://auth.openai.com/oauth/authorize`。
   - 默认自动在 `127.0.0.1:1455`（以及尽可能同步在 `[::1]:1455`）接收回调。
   - **始终提供保底回调 URL 输入框**：即使 1455 端口被其它 Codex CLI / 守护进程占用，或运行在远程服务端 / 无本地回环环境下，只需把浏览器跳转后的完整回调 URL（如 `http://localhost:1455/auth/callback?code=...&state=...`）粘贴进保底输入框，插件即可自动解析 `code` 与 `state` 完成换取令牌。
2. **设备码登录**（`device-sign-in`）：
   - 请求一次性设备码并打开 `https://auth.openai.com/codex/device`，自动轮询完成授权，适合远程 / SSH / 无回调环境。
3. **导入 `auth.json`**（`import-auth-json`）：
   - 上传或粘贴本机 `codex login` 生成的 `~/.codex/auth.json` 内容即可直接使用（纯 `OPENAI_API_KEY` 配置会被识别并提示改走普通 API Key 设置）。

支持连接多个 ChatGPT 账号（`accounts: many`），可随时切换默认账号、手动刷新令牌或移除账号，并在 `429` / 认证失效时自动故障切换。

## 模型用途配置

### 界面配置

在设置中添加模型预设时，选择供应商源 **`openai-codex/codex`**、协议 **`openai-responses-v1`** 与模型（如 **`gpt-5.4`**、**`gpt-5.3-codex`**），并绑定到故事或辅助槽位。

### `~/.covel/llm.toml` 配置示例

```toml
[story]
source = "openai-codex/codex"
model = "gpt-5.4"
```

连接了多个账号时，还可用 `account = "<account-id>"` 指定该槽位优先使用的账号。

## 请求塑形与令牌保护

- 通过 `requestShape.endpointPath = "/responses"` 将请求精确发往 `https://chatgpt.com/backend-api/codex/responses`，不额外拼接 `/v1`。
- 将前置系统提示提升到顶层 `instructions`（为空时自动补充安全默认值），剔除 Codex 后端不接受的参数（`temperature`、`top_p`、`max_output_tokens`、`previous_response_id`、`service_tier` 等），并强制 `store: false` 与 `stream: true`（由 Covel 适配器对非流式调用透明聚合 SSE）。
- OpenAI OAuth `refresh_token` 为单次轮换令牌：插件结合宿主并发 `401` 单飞刷新与插件内部单飞锁，防止并发刷新导致令牌失效。

## 测试

在 `covel-plugins` 根目录运行：

```bash
pnpm exec vitest run plugins/openai-codex/tests
COVEL_DIR=/path/to/covel pnpm check:covel
```

源码基于 [MIT](LICENSE) 协议开源。

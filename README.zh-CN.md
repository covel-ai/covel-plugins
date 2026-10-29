# Covel Plugins

<!-- languages:start -->
[English](README.md) · **简体中文**
<!-- languages:end -->

Covel 官方维护的插件目录、官方可选扩展与开发示例。社区插件代码由作者自己的仓库托管；给公开仓库添加 `covel-plugin` 或 `covel-plugins` Topic 即可自动发现。

快速导航：[插件目录](https://plugins.covel.cc/) · [世界目录](https://worlds.covel.cc/) · [安装](#安装) · [投稿与开发](#投稿与开发)

## 插件分层

| 分组 | 用途 | 维护位置 |
| --- | --- | --- |
| 核心插件 | 默认游戏流程和框架契约的必要实现 | [Covel 主仓](https://github.com/ackness/covel) |
| 官方插件 | 官方维护的按需功能与开发示例 | 本仓 `plugins/` 和 `examples/` |
| 社区插件 | 第三方玩法、文风及工具 | 作者仓库，本仓仅收录索引 |

官方维护、功能分类、运行信任是三个独立概念。外部安装的官方扩展和社区插件都遵循 Covel 的社区代码授权规则。

## 插件目录

[网页目录](https://plugins.covel.cc/)提供搜索、官方／社区筛选、版本、仓库 Star 和统一 ZIP 下载，与[世界目录](https://worlds.covel.cc/)共用采集核心、界面与服务。正式发布需要配置共享服务；本地预览会明确标注尚不可用的实时功能。

每 6 小时、main 推送或手动触发采集。以当前 `PLUGIN.md`、`package.json` 为准，新包不需要新增 registry JSON 或申请收录 PR。`registry/plugins/` 仅保留迁移备注；官方身份由 `catalog/config.json` 指定，独立规则可以下架条目并停止平台下载。[架构与运维](docs/catalog.zh-CN.md)。

“待完善”表示元数据不完整；“已索引”不代表安全或兼容认证。归档条目可筛选查看，平台不提供安装推荐和下载。

## 安装

支持 GitHub 安装的 Covel 版本中，打开 **设置 → 插件 → 安装与管理**，粘贴目录里的安装来源链接，解析插件、核对版本和风险后确认安装。仓库包含多个插件时可选择子目录。安装完成后重启后端，再在会话中选择插件并授权。

多插件仓库可直接粘贴仓库根链接，预览 `plugins/`、`examples/` 等目录中的插件并逐个安装。使用 `/tree/main/plugins` 可限定发现范围；完整插件子目录链接直接预览一个包。每次安装仅提取选中插件，需分别确认风险，全部所需插件装好后可统一重启。

- 普通仓库链接固定为解析时的默认分支提交；`/tree/<tag-or-commit>/<path>` 可以选择版本和子目录。
- 分支名含 `/` 时，在链接的 ref 段写成 `%2F`，或使用提交 SHA。
- 首期支持公开 GitHub 源码仓库中可直接运行的插件；不自动执行依赖安装、构建或生命周期脚本。Release 附件可先下载为 ZIP，再通过本地导入安装。
- ZIP 顶层需要 `package.json` 和根 `PLUGIN.md`，不要额外包一层目录。多 runtime 包的 runtime 位于 `runtimes/<id>/RUNTIME.md`。
- 旧版 Covel 可将插件目录放到 `~/.covel/plugins/<id>`，然后重启。自定义插件目录以部署配置为准。
- GitHub 解析与下载遵循 Covel 设置中的网络代理，支持系统代理、HTTP(S) 和 SOCKS5。
- 桌面安装写入本机后端；连接远程服务器时写入远程后端，需管理员权限。

已安装插件可在设置中点击“检查更新”。分支安装跟踪对应分支；tag/commit 安装保持锁定，需指定其他版本链接。查看文件变化并确认后先暂存更新，下次重启后端时替换。本地修改过包文件会阻止替换，重启后执行代码需要重新授权。

## 信任与风险

**官方收录不代表安全审计，也不授予内置插件权限。** 插件的服务端 JavaScript 不运行在进程沙箱中，允许执行后可能访问后端进程可访问的文件、环境变量和网络。提示词插件也可能影响模型行为、发送到模型的数据与调用费用。仅安装信任的作者和版本。

采集和下载服务不执行投稿代码；可将经过布局校验的固定版本 ZIP 保存在私有缓存中供下载。在线 demo 只考虑由官方选择、独立部署的插件；目前采用说明、截图和录屏链接。

## 投稿与开发

参见 [投稿规范](CONTRIBUTING.zh-CN.md)、[安全说明](SECURITY.zh-CN.md)、[发布规范](docs/publishing.zh-CN.md)、[叙事便签示例](examples/story-note/README.zh-CN.md) 和 [Jev 复杂示例](examples/jev-choice-demo/README.zh-CN.md)。这些指南和[官方插件说明](plugins/README.zh-CN.md)均提供英文与简体中文，默认入口为英文。

使用 Node 26+ / pnpm 11.22：

```sh
pnpm install --frozen-lockfile
pnpm collect:local       # 真实本地清单，不伪造社区数据
pnpm test:catalog       # 公共契约、适配器、服务及故障测试
pnpm build:site
pnpm test:site          # 需要 Playwright Chromium
pnpm test              # 原有官方插件回归测试
```

采集／构建只有仓库只读权限。Pages 独立发布，必须先有完整快照被已配置的共享服务接受；失败保留旧站，持久检查点支持续跑。[部署与备份说明](docs/catalog.zh-CN.md)。

Agent 开发技能位于 [`.agents/skills/create-plugin/SKILL.md`](.agents/skills/create-plugin/SKILL.md)，支持发现该目录的 Agent 可直接使用 `$create-plugin`。

翻译文档或新增首页语言，请参见 [多语言维护](docs/localization.zh-CN.md)。页面语言与插件本身支持的语言独立。

注册表更新 API 定义可信安装锁与显式版本选择；Covel 客户端集成单独处理。下载离线 ZIP 保持本地／固定版本，不会自动建立更新追踪。当前不提供评分、账号或在线执行服务。

## License

本仓原创文档、工具和示例使用 [MIT](LICENSE)。被收录的第三方插件遵循作者自己的许可证；目录收录不改变其授权。

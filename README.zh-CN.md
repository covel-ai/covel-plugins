# Covel Plugins

<!-- languages:start -->
[English](README.md) · **简体中文**
<!-- languages:end -->

Covel 官方维护的插件目录、官方可选扩展与开发示例。社区插件代码由作者自己的仓库托管，欢迎通过 PR 提交收录。

快速导航：[官方插件](#官方插件) · [社区插件](#社区插件) · [安装](#安装) · [投稿与开发](#投稿与开发)

## 插件分层

| 分组 | 用途 | 维护位置 |
| --- | --- | --- |
| 核心插件 | 默认游戏流程和框架契约的必要实现 | [Covel 主仓](https://github.com/ackness/covel) |
| 官方插件 | 官方维护的按需功能与开发示例 | 本仓 `plugins/` 和 `examples/` |
| 社区插件 | 第三方玩法、文风及工具 | 作者仓库，本仓仅收录索引 |

官方维护、功能分类、运行信任是三个独立概念。外部安装的官方扩展和社区插件都遵循 Covel 的社区代码授权规则。

## 插件目录

官方插件优先展示，社区插件单独收录。各语言表格从 `registry/plugins/*.json` 生成，请修改条目而非直接编辑表格。

<!-- registry:start -->
### 官方插件

| 插件 | 功能 | 作者 | Covel 版本 | 状态 | 演示 | 安装来源 |
| --- | --- | --- | --- | --- | --- | --- |
| [DashScope 剧情生图](https://github.com/covel-ai/covel-plugins) | LLM 提示词、万相图像生成与持久化画廊的两段式流水线。 | covel-ai | 0.0.39 | 可用 | [演示](https://github.com/covel-ai/covel-plugins/blob/main/plugins/dashscope-image-gen/README.md) | [安装来源](https://github.com/covel-ai/covel-plugins/tree/main/plugins/dashscope-image-gen) |
| [Story Note / 叙事便签示例](https://github.com/covel-ai/covel-plugins) | 演示通过 PostContextAssembly 为 story 提示词追加一句叙事建议。 | covel-ai | 0.0.39 | 可用 | [演示](https://github.com/covel-ai/covel-plugins/blob/main/examples/story-note/README.md) | [安装来源](https://github.com/covel-ai/covel-plugins/tree/main/examples/story-note) |
| [Jev 选项推荐 Demo](https://github.com/covel-ai/covel-plugins) | 复杂开发示例：类型化输入、evaluation 模型、公共服务与舞台概率 UI。 | covel-ai | 0.0.39 | 可用 | [演示](https://github.com/covel-ai/covel-plugins/blob/main/examples/jev-choice-demo/README.md) | [安装来源](https://github.com/covel-ai/covel-plugins/tree/main/examples/jev-choice-demo) |
| [MiMo 旁白朗读](https://github.com/covel-ai/covel-plugins) | 自动或手动朗读剧情，演示自定义 speech wire、后台任务与音轨面板。 | covel-ai | 0.0.39 | 可用 | [演示](https://github.com/covel-ai/covel-plugins/blob/main/plugins/mimo-tts/README.md) | [安装来源](https://github.com/covel-ai/covel-plugins/tree/main/plugins/mimo-tts) |
| [OpenAI 兼容剧情生图](https://github.com/covel-ai/covel-plugins) | 通过 OpenAI 兼容图像管线生成剧情插图并展示画廊。 | covel-ai | 0.0.39 | 可用 | [演示](https://github.com/covel-ai/covel-plugins/blob/main/plugins/openai-image-gen/README.md) | [安装来源](https://github.com/covel-ai/covel-plugins/tree/main/plugins/openai-image-gen) |

### 社区插件

| 插件 | 功能 | 作者 | Covel 版本 | 状态 | 演示 | 安装来源 |
| --- | --- | --- | --- | --- | --- | --- |
| [Anti-AI-Flavor / 去 AI 味](https://github.com/charlesli1989/anti-ai-flavor) | 按中英文会话语言注入可配置的叙事文风约束。 | charlesli1989 | 待确认 | 待确认 | — | [来源](https://github.com/charlesli1989/anti-ai-flavor) |
<!-- registry:end -->

“待确认”条目用于跟踪投稿，不作为可安装推荐；“已归档”不再维护。

## 安装

支持 GitHub 安装的 Covel 版本中，打开 **设置 → 插件 → 安装与管理**，粘贴目录里的安装来源链接，解析插件、核对版本和风险后确认安装。仓库包含多个插件时可选择子目录。安装完成后重启后端，再在会话中选择插件并授权。

多插件仓库可直接粘贴仓库根链接，预览 `plugins/`、`examples/` 等目录中的插件并逐个安装。使用 `/tree/main/plugins` 可限定发现范围；完整插件子目录链接直接预览一个包。每次安装仅提取选中插件，需分别确认风险，全部所需插件装好后可统一重启。

- 普通仓库链接固定为解析时的默认分支提交；`/tree/<tag-or-commit>/<path>` 可以选择版本和子目录。
- 分支名含 `/` 时，在链接的 ref 段写成 `%2F`，或使用提交 SHA。
- 首期支持公开 GitHub 源码仓库中可直接运行的插件；不自动执行依赖安装、构建或生命周期脚本。Release 附件可先下载为 ZIP，再通过本地导入安装。
- ZIP 顶层需要 `package.json` 和 `PLUGIN.md`，或 `runtimes/<name>/PLUGIN.md`。不要额外包一层目录。
- 旧版 Covel 可将插件目录放到 `~/.covel/plugins/<id>`，然后重启。自定义插件目录以部署配置为准。
- GitHub 解析与下载遵循 Covel 设置中的网络代理，支持系统代理、HTTP(S) 和 SOCKS5。
- 桌面安装写入本机后端；连接远程服务器时写入远程后端，需管理员权限。

## 信任与风险

**官方收录不代表安全审计，也不授予内置插件权限。** 插件的服务端 JavaScript 不运行在进程沙箱中，允许执行后可能访问后端进程可访问的文件、环境变量和网络。提示词插件也可能影响模型行为、发送到模型的数据与调用费用。仅安装信任的作者和版本。

官方目录不托管或执行投稿代码。在线 demo 只考虑由官方选择、独立部署的插件；目前采用说明、截图和录屏链接。

## 投稿与开发

参见 [投稿规范](CONTRIBUTING.zh-CN.md)、[安全说明](SECURITY.md)、[发布规范](docs/publishing.md)、[叙事便签示例](examples/story-note/README.md) 和 [Jev 复杂示例](examples/jev-choice-demo/README.md)。

只检查目录无需安装依赖：

```sh
node scripts/registry.mjs          # Generate navigation and all README tables
node scripts/registry.mjs --check  # Validate entries and generated output
node --test scripts/registry.test.mjs
```

官方插件开发：Node 26+ / pnpm 11.22，运行 `pnpm install --frozen-lockfile` 和 `pnpm test`。Jev 随包包含 Zod，更新依赖后运行 `pnpm build:vendor` 并提交生成产物与许可证。静态目录 CI 不执行 PR 提供的插件代码；维护者审核后本地运行完整测试。

Agent 开发技能位于 [`.agents/skills/create-plugin/SKILL.md`](.agents/skills/create-plugin/SKILL.md)，支持发现该目录的 Agent 可直接使用 `$create-plugin`。

翻译首页或新增语言，请参见 [多语言维护](docs/localization.md)。页面语言与插件本身支持的语言独立。

JSON 条目是唯一索引来源；后续网页和应用内目录可直接复用。当前不提供自动更新、评分、账号或在线执行服务。

## License

本仓原创文档、工具和示例使用 [MIT](LICENSE)。被收录的第三方插件遵循作者自己的许可证；目录收录不改变其授权。

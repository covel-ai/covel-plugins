# Jev 选项推荐 Demo

[English](README.md) · **简体中文**

这个可选插件演示 evaluation 模型、插件公共服务、调度输入与自定义 UI 的组合。在当前场景快捷回复下显示模型给每个选项的推荐概率；界面与算法全部位于本插件，不会替玩家选择或发送行动。

## 安装与授权

这是官方维护的社区插件，适配 Covel `0.0.39` 当前开发契约，不再随主仓内置分发。在 **设置 → 插件 → 安装与管理** 输入：

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/jev-choice-demo
```

解析与下载使用 Covel 设置中的网络代理。确认来源和服务端代码风险后安装，重启后端，再在会话中启用并授权。官方维护不免除社区代码授权；模型调用可能产生费用。包内 JavaScript 可直接运行，无需安装依赖或构建。

从内置版本迁移时，插件 ID、runtime ID 和设置键保持不变；已有会话需安装后重新授权。迁移不会主动删除存档、配置或媒体，不会自动把旧的内置信任转成社区授权。

## 使用

1. 在模型设置中配置 TypeSafe 官方、OpenRouter、Vercel AI Gateway 或其他已支持 wire 的 provider，并添加一个 Evaluation 模型。具体配置可参考[Covel 的 llm.toml.example](https://github.com/ackness/covel/blob/main/llm.toml.example)。
2. 把该模型绑定到 `evaluation` 用途，或在插件的“评估模型用途”设置中选择其他已绑定用途。可选填“推荐目标”。协议、base URL 和模型名称都由配置决定，代码没有写死 Jev 或某个供应商。
3. 在会话中启用此插件及提供 `scene-prompts`、`narrative-engine` 能力的插件，完成一个新回合。右侧面板和舞台决策区都会显示插件 UI。

刚启用插件不会对旧回合补跑。未配置模型或供应商出错时显示不可用状态，普通选项继续可用。provider 只返回优胜选项而没有概率分布时，仅标识推荐项，不伪造百分比。概率是模型对给定候选的偏好分布，不能解释为行动成功率。

## 文件与通信

| 文件                       | 职责                                                                                            |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `PLUGIN.md` / `schemas/`   | 声明必需输入及校验；上游完成后才执行                                                            |
| `server.js`                | 注册 `recommend` 公共服务；协议契约 `demo/choice-recommendation@1`；调用 `ctx.gateway.evaluate` |
| `handler.js`               | 将当轮叙事、场景、玩家意图交给服务；通过 effects 写本插件的 `recommendations/current`           |
| `recommendation-schema.js` | 本插件的推荐记录结构，框架不引用它                                                              |
| `ui/recommendations.json`  | 声明数据 namespace、HTML 和 panel/stage 挂载                                                    |
| `ui/recommendations.html`  | 自由绘制概率条和本地化文本；检查回合，隐藏过期结果                                              |
| `tests/`                   | 验证概率、缺少分布、配置错误、取消和数据归属                                                    |

`scene-prompts` 通过自己的 `output.schema` 公开 `{ scene, recap, decision, prompts }`。本插件按 capability 消费，不读取上游内部 plugin-data，也不导入其代码。另一种快捷回复实现只要满足此契约即可替换。

其他 function 插件可以发现并调用本插件的服务，无须启用推荐 UI 或导入本插件源码：

```js
const providers = await ctx.services.discover("demo/choice-recommendation@1");
const provider = providers.find((item) => item.pluginId === configuredPluginId);
if (!provider)
  return { outcome: "skipped", skipReason: "No recommendation provider" };
const result = await ctx.services.call({
  ...provider,
  input: {
    presetId: "evaluation",
    goal: "Choose the action that best follows the player's intent.",
    state: { scene: "The library is closing." },
    options: [
      { id: "ask", text: "Ask the librarian for help" },
      { id: "leave", text: "Leave and return tomorrow" },
    ],
  },
});
```

服务只计算值，持久化与玩法效果由调用方决定。同一服务也可供 NPC 决策、候选排序等插件使用。扩展 Boolean/Score 或接入新协议时可在自己的插件里注册另一个服务和组件，详见 [插件扩展契约](https://github.com/ackness/covel/blob/main/docs/reference/plugin-extensions.md)。

## 测试与限制

以下 `pnpm exec vitest` 命令在本仓根目录执行，首次先运行 `pnpm install --frozen-lockfile`。

```bash
pnpm exec vitest run examples/jev-choice-demo/tests
```

单元测试使用合成模型响应，覆盖概率校验、服务调用、取消和数据归属，不评估线上模型的准确率、校准程度、价格或延迟。

演示对状态文本做长度限制，单次评估超时 10 秒，插件上限 15 秒；请按自己的样本与预算调整。

本插件默认关闭，需玩家手动启用或世界/组合包显式列出；`role:demo` 不参与标签、能力匹配或无策略世界的自动选择。舞台提供当前回合及已提交重试的归属、当前选项；插件同时核对回合、选项 ID 和文本，过期或不匹配的结果会隐藏。

## 数据、网络与许可

只向本插件声明的 namespace 写入业务数据；图像或音频通过框架 MediaStore 保存，模型调用沿用宿主已配置的用途和凭据。日志与错误可能包含提示词或供应商错误内容，请勿公开私人会话日志。源码采用 [MIT](LICENSE)。

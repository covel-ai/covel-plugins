# 记录工作台

[English](README.md) · **简体中文**

这是由官方维护、可独立安装的三插件组合教学示例。工作台提供 `/notes` 命令、英文与简体中文的 HTML 面板和两个手动 function runtime。用户可以原样保存记录，也可以选择一个格式化插件处理后保存。操作不调用模型、不访问外部网络、不推进故事回合。

## 安装与使用

从独立的 GitHub 目录安装工作台：

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/notes-workbench
```

如需试用两种处理方式，分别安装：

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-clean
https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-outline
```

这些 `main` 链接须待示例合并并发布后才能安装。每个链接只安装一个包，GitHub 安装器不会自动安装同仓库的其他包。安装后重启后端（开发服务器也可自动重载），在会话中启用工作台和需要的格式化插件，并在提示时批准服务端代码。官方维护不等于内置代码权限。只安装工作台也能原样保存记录。

输入 `/notes` 或打开插件侧栏面板。输入记录后可选“原样保存”；点击“刷新处理方式”后可选择格式化插件。只有格式化成功才会提交记录。选中的插件被禁用、失去授权、超时或返回无效结果时，草稿保留且不会创建记录；可以改选处理方式或明确选择原样保存。`/plugins notes-workbench` 可查看服务调用状态，诊断历史不记录正文。

草稿文字和所选处理方式通过宿主的临时 `uiState` 缓存，在当前会话侧栏内切换标签后保留。刷新页面或离开会话会清除缓存，只有“保存记录”会持久保存。返回选用了处理方式的草稿后，请刷新处理方式以重新确认可用性。

## 组合边界

工作台发现当前活跃的 `examples.note-format@1` 服务，再调用用户选择的 `format-note`。输入和输出均为 `{ "text": "..." }`；输入必须包含非空白文字且最多 4000 个 UTF-16 单元，输出必须包含非空白文字且最多 8000 个。下拉列表显示服务描述。其他插件实现同名同契约后，无须修改工作台即可加入。

工作台仅在保存成功后写入自己的会话级 `notes` 插件数据。每条记录含 ID、原文、保存后的文字、格式化插件 ID（原样保存时为 `null`）与时间。格式化插件只返回文字，不写工作台的数据。面板用 `textContent` 显示正文；HTML 会显示为普通文字。本示例无需模型配置，没有外部网络访问与模型费用，也不提供多人编辑、后台任务或富文本渲染。

## 包结构

```text
PLUGIN.md                      id、kind、version、covel、作者信息、entry、contributes
locales/zh.yaml                简体中文标签与 messages；lock.json 记录译文对应的英文原文
server/index.js                entry：注册 /notes 调用的 open-notes action
lib/                           服务契约名与 translate 辅助函数
runtimes/providers/RUNTIME.md  手动 function runtime：列出格式化服务
runtimes/save/RUNTIME.md       手动 function runtime：格式化并保存记录
runtimes/save/payload.schema.json   激活 payload 的 schema（io.payloadSchema）
schemas/note.schema.json       notes namespace 的记录 schema
ui/panel.json                  右侧面板 spec（英文，经 locales 翻译）
ui/workbench.html              沙箱 webview 面板
tests/                         node --test 测试
```

- `PLUGIN.md` 声明包级贡献：`actions: [open-notes]`、调用它的 `notes` 命令、`notes` 数据 namespace 和右侧面板。entry 的注册与这些声明必须双向一致，否则宿主拒绝加载。
- 两个 runtime 都是 `type: function` 的手动 runtime（`schedule.trigger.type: manual`、`schedule.manual.execution: sync`、`io.visibility: plugin`）。宿主先按 `io.payloadSchema` 校验 `save` 的 payload，handler 再校验一次。
- 清单、UI spec 和代码只写英文。中文标签写在 `locales/zh.yaml` 中对应清单文件的一节；代码文字和面板名写在 `messages`，以 `ctx.messages` 交给代码（经 `lib/text.js` 读取，它是 SDK `translate` 的无依赖副本）。
- 宿主不向沙箱 HTML 传译文，所以 `ui/workbench.html` 自带英文与简体中文文字，按桥接传来的 `locale` 选择；繁体中文和其他语言显示英文。面板用宿主的 `--covel-*` 主题变量配色。

## 兼容性与验证

需要 Covel **0.0.50 或更高版本**（`PLUGIN.md` 的 `covel: ">=0.0.50"`），更早的宿主不会安装或加载它。2.0.0 改用当前包结构（`runtimes/<id>/RUNTIME.md`、`contributes`、语言文件），并因契约 ID 不能含斜杠，把服务契约从 `examples/note-format@1` 改名为 `examples.note-format@1`。请与笔记清理、笔记大纲 2.0.0 及以上版本配合使用；1.x 保存的记录结构不变。

在本仓根目录运行 `pnpm test`。要用 Covel checkout 验证，先将 `COVEL_REPO` 设为其绝对路径，再运行：

```sh
for id in notes-workbench note-format-clean note-format-outline; do
  pnpm --dir "$COVEL_REPO" validate:plugin "$PWD/examples/$id"
done
pnpm --dir "$COVEL_REPO" test:runtime notes-workbench/save \
  --plugins-dir "$PWD/examples" \
  --with-plugin note-format-clean \
  --payload '{"text":"  First line  \n\n\nSecond line  ","providerPluginId":"note-format-clean"}' \
  --pretty
```

CLI 在模拟会话中执行 runtime 和所选提供者的 entry，不涵盖 GitHub 安装、会话授权或浏览器面板；确认已发布集成前仍需在 Covel 0.0.50 宿主中走通这些流程。本包采用 MIT 许可，见 [LICENSE](LICENSE)。

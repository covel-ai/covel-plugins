# 记录工作台

[English](README.md) · **简体中文**

这是由官方维护、可独立安装的三插件组合教学示例。工作台提供 `/notes` 命令、中英文 HTML 面板和两个手动 function runtime。用户可以原样保存记录，也可以选择一个格式化插件处理后保存。操作不调用模型、不访问外部网络、不推进故事回合。

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

这些 `main` 链接须待示例合并并发布后才能安装。每个链接只安装一个包，GitHub 安装器不会自动安装同仓库的其他包。安装后重启后端，在会话中启用工作台和需要的格式化插件，并在提示时批准服务端代码。官方维护不等于内置代码权限。只安装工作台也能原样保存记录。

输入 `/notes` 或打开插件侧栏面板。输入记录后可选“原样保存”；点击“刷新处理方式”后可选择格式化插件。只有格式化成功才会提交记录。选中的插件被禁用、失去授权、超时或返回无效结果时，草稿保留且不会创建记录；可以改选处理方式或明确选择原样保存。`/plugins notes-workbench` 可查看服务调用状态，诊断历史不记录正文。

## 组合边界

工作台发现当前活跃的 `examples/note-format@1` 服务，再调用用户选择的 `format-note`。输入和输出均为 `{ "text": "..." }`；输入必须包含非空白文字且最多 4000 个 UTF-16 单元，输出必须包含非空白文字且最多 8000 个。下拉列表显示服务描述。其他插件实现同名同契约后，无须修改工作台即可加入。

工作台仅在保存成功后写入自己的会话级 `notes` 插件数据。每条记录含 ID、原文、保存后的文字、格式化插件 ID（原样保存时为 `null`）与时间。格式化插件只返回文字，不写工作台的数据。面板用 `textContent` 显示正文；HTML 会显示为普通文字。本示例无需模型配置，没有外部网络访问与模型费用，也不提供多人编辑、后台任务或富文本渲染。

## 兼容性与验证

本示例针对 Covel **[PR #86](https://github.com/ackness/covel/pull/86) 开发分支**上的公共服务和手动 runtime 契约（开发时宿主包版本为 `0.0.40`）。尚未确认已发布宿主版本的兼容性，因此目录条目标记为待确认。仅凭包版本号不能证明宿主支持。

在本仓根目录运行 `pnpm test`。要用兼容的 Covel checkout 验证，先将 `COVEL_REPO` 设为其绝对路径，再运行：

```sh
pnpm --dir "$COVEL_REPO" validate:plugin "$PWD/examples/notes-workbench"
pnpm --dir "$COVEL_REPO" test:runtime notes-workbench/save \
  --plugins-dir "$PWD/examples" \
  --with-plugin note-format-clean \
  --payload '{"text":"  First line  \n\n\nSecond line  ","providerPluginId":"note-format-clean"}' \
  --pretty
```

CLI 验证不涵盖 GitHub 安装、会话授权或浏览器面板；确认已发布集成前仍需在兼容宿主中走通这些流程。本包采用 MIT 许可，见 [LICENSE](LICENSE)。

# 笔记清理

[English](README.md) · **简体中文**

这是官方维护的纯 entry 格式化插件，供[记录工作台](../notes-workbench/README.zh-CN.md)组合使用。从独立目录安装：

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-clean
```

示例合并并发布后，上述 `main` 链接才可安装。需要图形界面时请单独安装工作台。重启后端，在会话中启用两个包并批准服务端代码；打开 `/notes`，刷新处理方式并选择清理空白与多余空行的处理方式（列表显示英文服务描述）。其他遵循同一公共契约的插件也可调用此服务。

`format-note` 服务实现 `examples/note-format@1`，输入和输出均为 `{ "text": "..." }`。输入须含非空白文字，修剪前最多 4000 个 UTF-16 单元；输出须非空白且最多 8000 个 UTF-16 单元。它把 CRLF 和 CR 统一为 LF，去掉每行首尾空白，把连续多个空行缩成一个，同时保留段落。例如，`"  One  \r\n\r\n\r\n Two "` 会变成 `"One\n\nTwo"`。

服务以纯文本处理内容，不解析 HTML，也不写调用方数据。本包没有 runtime，不需要模型配置、网络、缓存、计时器或付费服务。宿主仍可能要求在会话中批准 entry 代码。

本示例针对 Covel **[PR #86](https://github.com/ackness/covel/pull/86) 的开发契约**（开发时宿主包版本为 `0.0.40`）；尚未确认已发布版本的兼容性。在本仓根目录运行 `pnpm test`，宿主验证命令见工作台说明。采用 MIT 许可，见 [LICENSE](LICENSE)。

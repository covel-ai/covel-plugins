# 笔记大纲

[English](README.md) · **简体中文**

这是官方维护的纯 entry 格式化插件，供[记录工作台](../notes-workbench/README.zh-CN.md)组合使用。从独立目录安装：

```text
https://github.com/covel-ai/covel-plugins/tree/main/examples/note-format-outline
```

示例合并并发布后，上述 `main` 链接才可安装。需要图形界面时请单独安装工作台。重启后端，在会话中启用两个包并批准服务端代码；打开 `/notes`，刷新处理方式并选择整理成项目列表的处理方式（列表显示英文服务描述）。其他遵循同一公共契约的插件也可调用此服务。

`format-note` 服务实现 `examples.note-format@1`，输入和输出均为 `{ "text": "..." }`。输入须含非空白文字，修剪前最多 4000 个 UTF-16 单元；输出须非空白且最多 8000 个 UTF-16 单元。每条非空行变成一个 `- ` 项目符号。已有的 `-`、`*`、`+`、`•`、`‣`、`◦`，或后接空白的编号前缀（`1.`、`1)`）会换成单个项目符号。例如，`"One\n* Two\n\n3. 三"` 会变成 `"- One\n- Two\n- 三"`。

服务以纯文本处理内容，不解析 HTML，也不写调用方数据。本包没有 runtime，不需要模型配置、网络、缓存、计时器或付费服务。宿主仍可能要求在会话中批准 entry 代码。

## 包结构

```text
PLUGIN.md          id、kind、version、covel、作者信息、contributes.services
locales/zh.yaml    简体中文名称与说明（locales/lock.json 记录译文对应的英文原文）
server/index.js    entry：注册 format-note 服务
server/format.js   纯格式化函数
tests/             node --test 测试
```

`PLUGIN.md` 只写英文，并在 `contributes.services` 中声明服务；entry 的注册与声明必须一致，否则宿主拒绝加载。服务契约 ID 用点号而不是斜杠（`examples.note-format@1`）。

## 兼容性与验证

需要 Covel **0.0.50 或更高版本**（`PLUGIN.md` 的 `covel: ">=0.0.50"`），更早的宿主不会安装或加载它。2.0.0 改用当前包格式，并把契约从 `examples/note-format@1` 改名为 `examples.note-format@1`，须与记录工作台 2.0.0 及以上版本配合使用。在本仓根目录运行 `pnpm test`。有 Covel checkout（路径设为 `$COVEL_REPO`）时：

```sh
pnpm --dir "$COVEL_REPO" validate:plugin "$PWD/examples/note-format-outline"
```

采用 MIT 许可，见 [LICENSE](LICENSE)。

# 插件目录的多语言维护

[English](localization.md) · **简体中文**

英文是默认首页（`README.md`）。已发布的译文使用 `README.<locale>.md`，例如 `README.zh-CN.md`。每个首页都链接到全部已发布语言，并先列出官方插件，再列出社区插件。

## 指南与插件 README

仓库指南与插件文档采用相同的英文优先约定：无语言后缀的文件使用英文，简体中文放在同目录的 `.zh-CN.md` 文件中。例如 `SECURITY.md` / `SECURITY.zh-CN.md`、`docs/publishing.md` / `docs/publishing.zh-CN.md`、`plugins/<id>/README.md` / `plugins/<id>/README.zh-CN.md`。

在标题下方添加语言切换，英文排在前面：

```md
**English** · [简体中文](README.zh-CN.md)
```

中文文件使用 `[English](README.md) · **简体中文**`。非 README 指南请调整对应文件名。链接到其他本地指南时，优先使用同语言版本；没有译文则使用默认英文文件。索引共用的演示 URL 仍打开默认英文 README，读者可在页面顶部切换语言。

完整翻译使用说明，包括安装配置、设置、权限、费用、限制和测试。标识符、配置键与值、命令和 API 结构保持不变；代码注释使用英文。行为或配置变更时同步更新两个版本。这些文档由人工成对维护；只有根 README 的语言导航和插件表格由脚本生成。

`PLUGIN.md` 和 runtime 的 `PLUGIN.md` 是可执行清单，正文可能包含 agent 提示词。不要仅为翻译 README 而创建翻译清单或改写提示词。清单中的显示名称与简介沿用已有的本地化字段提供双语；文档翻译不改变运行行为或插件支持的语言。

## 添加首页语言

1. 复制现有 README 为 `README.<locale>.md`，翻译正文和快速导航锚点。以下生成标记各保留一对：`<!-- languages:start -->` / `<!-- languages:end -->` 和 `<!-- registry:start -->` / `<!-- registry:end -->`。
2. 在 `registry/locales.json` 中复制现有条目并翻译标签，设置 `locale`、使用该语言自身文字的 `label`、对应的 `readme` 文件名。英文必须排在第一位。语言标识支持语言、可选文字系统、可选地区，例如 `ja`、`pt-BR`、`zh-Hant-TW`。
3. 在 `registry/plugins/*.json` 中按需添加条目译文：

```json
{
  "name": "Story Notes",
  "description": "Adds narrative guidance.",
  "translations": {
    "zh-CN": {
      "name": "故事便笺",
      "description": "添加叙事建议。"
    }
  }
}
```

这只是片段，不是完整的索引条目。`translations` 可包含 `name`、`description` 和 `notes`；每个缺失字段独立回退到英文基础字段。`notes` 仍作为审核者及后续消费者使用的元数据，目前不显示在 README 表格中。不要在 `translations` 中添加 `en-US`，请直接修改基础字段。插件 ID、路径、版本、作者和 URL 在各语言间共用。

4. 在仓库根目录运行：

```sh
node scripts/registry.mjs
node scripts/registry.mjs --check
node --test scripts/registry.test.mjs
```

将语言配置、翻译正文、条目译文和生成的 README 变更一起提交。只有在对应 README 已存在且正文已翻译时才添加语言导航；缺少的插件名称等字段可回退到英文。不要手工编辑生成区域。CI 会检查全部已配置 README 的导航和表格是否过期。

## 插件支持的语言独立维护

条目的 `locales` 字段表示插件本身支持的语言。添加首页或插件 README 译文不代表该插件支持对应语言。清单与提示词的本地化属于独立的运行时变更。

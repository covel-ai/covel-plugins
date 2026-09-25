# 提交插件

[English](CONTRIBUTING.md) · **简体中文**

1. 在自己的公开 GitHub 仓库发布可运行插件，并提供 README、明确许可证、支持的 Covel 版本和联系方式。
2. README 说明功能、使用方法、数据读写、网络访问、服务端代码、模型费用和已知限制；演示可用截图、视频或文档链接。
3. 在 `registry/plugins/<id>.json` 添加条目，字段见 `registry/schema.json`。`maintainer` 使用 `community`；`official` 仅由 Covel 维护者授予。
4. 优先用发布 tag 或完整 commit 固定收录版本；`main` 等分支允许用于早期开发，但用户安装时仍固定提交。`path` 是插件包目录，不是具体文件。
5. 运行 README 中的生成、校验和测试命令后提交 PR。

插件 ID 必须与清单身份一致且不能冒用内置 ID，建议加作者前缀。分类选 narrative、gameplay、world、media、tools、authoring；语言使用标准 locale。明确缺少许可证或适配版本的候选填写 null 并使用 pending，不能标为 active。

维护者检查身份、授权、功能说明、可安装布局和版本信息；合并不意味着逐行安全审计。作者维护代码和版本，官方维护目录与下架决定。仓库转移、作者变化、权限扩大及归档应更新条目并重新审核。

请勿在 PR 中提交密钥、用户存档或私人截图。不要把第三方完整源码复制进本仓。CI 只检查索引和生成内容，不拉取、安装或执行社区插件。运行本仓测试前，维护者应先审查脚本和示例变更。

索引的 `name`、`description` 和 `notes` 默认使用英语；可通过 `translations` 添加中文等译文，缺失字段回退到英语。首页语言导航和表格统一生成，添加语言请参考[本地化指南](docs/localization.md)。插件条目的 `locales` 表示插件支持的语言，与首页翻译无关。

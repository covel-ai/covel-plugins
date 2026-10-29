# 提交插件

[English](CONTRIBUTING.md) · **简体中文**

1. 在自己的公开 GitHub 仓库发布可运行插件，并提供 README、明确许可证、支持的 Covel 版本和联系方式。
2. README 说明功能、使用方法、数据读写、网络访问、服务端代码、模型费用和已知限制；演示可用截图、视频或文档链接。
3. 在仓库 About → Topics 添加 `covel-plugin` 或 `covel-plugins`，无需收录 PR 或新的 registry JSON。
4. 保持 `PLUGIN.md` 与 `package.json` 版本一致；子包用 `<id>/v<version>` tag，根单包可用 `v<version>`。不要移动已发布 tag。
5. 阅读[发布规范](docs/publishing.zh-CN.md)。下一次完整采集会发现仓库；无效或缺失的元数据保留为待完善。

插件 ID 必须与清单身份一致且不能冒用内置 ID，建议加作者前缀。清单 tags 可用 narrative、gameplay、world、media、tools、authoring 分类，语言使用标准 locale。许可证与 Covel 兼容范围由清单声明；未知值自动表示为 null，元数据不完整则保留为待完善。

维护者检查身份、授权、功能说明、可安装布局和版本信息；合并不意味着逐行安全审计。作者维护代码和版本，官方维护目录与下架决定。仓库转移、权限变化与归档会在采集／下载时复核；条目问题可通过 GitHub Issues 反馈，维护者可独立发布下架规则。

请勿在 PR 中提交密钥、用户存档或私人截图。不要把第三方完整源码复制进本仓。PR 离线检查 fixture 与本地清单；定时采集读取公开仓库元数据。打包读取文件，但不安装依赖或执行投稿代码。运行本仓测试前，维护者应先审查脚本和示例变更。

清单提供英文显示文本，`locales/<locale>.yaml` 的 `PLUGIN.md` 项提供翻译；缺失字段回退到基础文本。共享网页 UI 语言与包支持语言独立，参见[本地化指南](docs/localization.zh-CN.md)。旧 registry JSON 仅用于迁移历史，不应为新收录继续添加。

本仓维护的文档以英文文件为默认入口，并提供简体中文同级文件，例如 `README.md` 和 `README.zh-CN.md`，在顶部添加语言切换链接。安装、配置或行为说明变更时，请同步更新两个版本。

# 插件发布契约

插件包需要 `package.json`（name、version、type: module）和根 `PLUGIN.md`，或多 runtime 的 `runtimes/<name>/PLUGIN.md`。包名的 `plugin-` 前缀可省略；规范身份必须与清单 name 的根段相同。

发布目录的 JavaScript 必须直接可运行且自包含。开发工具放在 devDependencies；用于 GitHub 自动安装的 package.json 不保留 dependencies、optionalDependencies 或 peerDependencies。需要这些依赖的插件请在作者侧打包依赖并生成独立发布目录，再链接到该目录。不要依赖 Covel monorepo 的 workspace 解析。安装器不会执行脚本。

清单及语言变体只接受普通 YAML frontmatter，禁止可执行语言标记。GitHub 解析和下载使用 Covel 已配置的网络代理。

源码归档下载上限 20 MiB、解压上限 200 MiB、文件条目上限 2000；仓库整体过大时应提供精简的发布仓库或通过本地 ZIP 安装。拒绝符号链接、路径逃逸和重复路径。子目录内多 runtime 按一个包安装，不分别拆出。

安装预览固定 Git commit 和文件摘要，有效期 15 分钟。安装时重新获取该提交并核对摘要；目录变更或预览过期须重新确认。同 ID 不覆盖，首期更新需先卸载再安装；卸载不自动删除已有会话数据，安装新版本不保证旧数据兼容。

建议在清单中声明标准 capabilities、outputKind 和 relations。不要通过具体插件 ID 的条件分支扩展框架。支持版本由作者声明；当前安装器校验清单契约，不承诺仅凭版本文本能证明兼容。

## 官方插件维护

官方插件统一提供双语清单、README 安装与模型配置、数据和网络说明、MIT LICENSE、可独立执行的 JavaScript、回归测试与索引条目。复杂开发示例放在 `examples/`，按需功能放在 `plugins/`；框架原语保留在 Covel 主仓。更改依赖或打包产物时验证每个目录单独复制到临时目录后可导入，不依赖本仓或主仓的 node_modules。

迁移保持插件身份与设置键，包版本统一为 0.0.39，并保留原 Covel Contributors 许可证。安装前后的信任来源不同，旧会话必须重新授权。已安装旧开发副本时，先备份自行修改的源码，再通过设置卸载并重装；不要手工覆盖安装记录。

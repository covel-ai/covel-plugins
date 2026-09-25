# 插件发布契约

插件包需要 `package.json`（name、version、type: module）和根 `PLUGIN.md`，或多 runtime 的 `runtimes/<name>/PLUGIN.md`。包名的 `plugin-` 前缀可省略；规范身份必须与清单 name 的根段相同。

发布目录的 JavaScript 必须直接可运行且自包含。开发工具放在 devDependencies；用于 GitHub 自动安装的 package.json 不保留 dependencies、optionalDependencies 或 peerDependencies。需要这些依赖的插件请在作者侧打包依赖并生成独立发布目录，再链接到该目录。不要依赖 Covel monorepo 的 workspace 解析。安装器不会执行脚本。

清单及语言变体只接受普通 YAML frontmatter，禁止可执行语言标记。GitHub 解析和下载使用 Covel 已配置的网络代理。

源码归档下载上限 20 MiB、解压上限 200 MiB、文件条目上限 2000；仓库整体过大时应提供精简的发布仓库或通过本地 ZIP 安装。拒绝符号链接、路径逃逸和重复路径。子目录内多 runtime 按一个包安装，不分别拆出。

安装预览固定 Git commit 和文件摘要，有效期 15 分钟。安装时重新获取该提交并核对摘要；目录变更或预览过期须重新确认。普通安装不覆盖同 ID 插件。支持更新的 Covel 版本可检查已安装插件、预览文件变化并确认下载；更新暂存到下次后端启动时替换，失败恢复旧包。独立存储的会话设置、plugin-data 和媒体保留，但作者仍需说明新版本的数据兼容性。本地增删或修改过包文件会阻止更新，应先备份并处理改动。

建议在清单中声明标准 capabilities、outputKind 和 relations。不要通过具体插件 ID 的条件分支扩展框架。支持版本由作者声明；当前安装器校验清单契约，不承诺仅凭版本文本能证明兼容。

## 官方插件维护

官方插件统一提供双语清单、README 安装与模型配置、数据和网络说明、MIT LICENSE、可独立执行的 JavaScript、回归测试与索引条目。复杂开发示例放在 `examples/`，按需功能放在 `plugins/`；框架原语保留在 Covel 主仓。更改依赖或打包产物时验证每个目录单独复制到临时目录后可导入，不依赖本仓或主仓的 node_modules。

保留插件身份、设置键和原 Covel Contributors 许可证。各插件独立维护 `package.json` 的版本，索引中的 `covelVersion` 表示宿主兼容版本，不是插件发布版本。安装前后的信任来源不同，旧会话必须重新授权。已安装旧开发副本时，先备份自行修改的源码，再通过设置卸载并重装；不要手工覆盖安装记录。

## 版本与更新来源

分支安装跟踪该分支，仓库根链接跟踪默认分支；tag 或 commit 安装保持锁定，需要用户指定同仓库、同插件目录的新版本链接。安装器按插件包内容摘要发现变化，同仓库其他插件或根 README 的变更不会触发该插件更新。每次安装或更新仍固定到一个 commit。

建议为每个插件维护变更说明，并使用独立 tag，例如 `mimo-tts/v0.0.40`；不要移动已经发布的 tag。带 `/` 的 tag 在安装链接中编码为 `%2F`，例如 `/tree/mimo-tts%2Fv0.0.40/plugins/mimo-tts`。目前不会自动寻找下一枚 release tag，用户通过明确的版本链接选择升级。

README 面向使用者与开发者，介绍功能、安装配置、数据与网络行为、限制及可复现的测试命令。具体日期的手工验收记录、个人测试会话、测试服务商连接结果与耗时日志不放入插件介绍。

# 目录架构与运维

[English](catalog.md) · **简体中文**

插件与世界统一消费独立 [covel-catalog](https://github.com/covel-ai/covel-catalog) 的实现。本仓保留插件内容、采集配置和页面薄入口；API、适配器、公共 UI、协议与部署文件归公共仓维护。两端锁定完整 commit 和全文件 SHA256 清单，CI 拒绝修改、缺失或额外 vendor 文件。公共改动先在 covel-catalog 互审，再升级两端版本；Pages workflow 由同一锁定模板实例化并逐字校验。

## 发现与迁移

在公开仓库 About → Topics 添加 `covel-plugin` 或 `covel-plugins` 即可。采集查询两者并按仓库数字 ID 去重、复核当前状态，再从固定 commit 读取清单；不需要收录 PR 或新的 registry JSON。无有效清单的仓库保留为待完善，坏包不会隐藏同仓好包。官方身份仅来自 `catalog/config.json`。移除全部 Topics 后自动发现条目退出，已配置的迁移 seed 只在仍公开时保留；归档包默认隐藏且不可平台下载。

`registry/plugins/` 冻结为迁移输入。旧兼容声明和备注保存在 `legacyMetadata`，不覆盖当前清单；分类可采用旧条目回退值。新作者使用清单 tags 和包内翻译。README 不再生成插件表格。

网络、搜索不完整、tree 截断、配额耗尽均中止整轮发布。`.cache/round/` 保存仓库与 tag 队列进度，`.cache/github/` 加速请求；每 6 小时只是触发频率，不保证首次大规模抓取一轮完成。未完成结果不会发布。本地完整保存后会确认本轮结束；若之后服务入库失败，下次重新采集，旧站仍保留。

## 版本与下载

持久历史分开记录 ref／完整提交 SHA、包 revision、ZIP artifact。Git tree 指纹用于低成本变化检测，读取完整文件字节后才产生内容哈希；`covel-package-v1` 按 UTF-8 路径排序，保留字节和可执行位，不改换行。尚未声明它与 Covel 主仓安装器的摘要算法等价。

开发分支允许相同声明版本下有不同内容；正式版本同号异内容或 tag 被移动时记录冲突，保留原 revision。包内容不变的新 commit 只增加来源观察，不制造更新。SemVer 的 build metadata 不提高优先级，目录迁移产生新的包身份。

正式 tag 必须正向匹配：仓库根的单包用 `v<version>` 或 `<version>`，子包用 `<id>/v<version>` 或 `<path>/v<version>`。同仓其他包的 tag 不会把开发内容变成稳定版。tag 结果是观察集合，不宣称覆盖全部 Git 历史。没有包级发布证据时不借用仓库活动时间，而显示首次收录／内容更新时间。

统一下载的 ZIP 顶层就是选中包。网关验证实时公开仓库身份、固定 SHA、tree/blob 哈希、导入布局、路径和限额；拒绝符号链接和子模块，不执行第三方构建或代码。上限为 2,000 文件、解压 200 MiB、ZIP 20 MiB。缓存键包含仓库 ID、kind、路径、SHA 和打包器版本，文件不可变且保持私有，没有绕过规则的公开对象链接。

`downloadRequests` 只计包准备成功并签发票据的事务，幂等键防止重试重复统计；重复兑换、Range、HEAD 不增加计数。它不是独立访客、完成下载或安装次数。Star 属于整个仓库，未知值为 null。列表指标随快照固定，详情显示当前平台请求数。

安装锁与 `/v1/check-update` 是后续客户端集成协议。锁由 Covel 安装器维护，包内 provenance 不授予信任。离线 ZIP 保持 local/pinned，显式绑定来源时须验证内容。主机／契约上下文不明返回 `unknown`，本地修改、待完善和归档会阻止候选。主客户端仍须计算文件／权限差异并要求确认，再暂存至重启生效；文件回滚不等于世界存档和数据迁移回滚。

## 共享服务与接口

一个 Node 26 服务处理两个 kind，维护 SQLite 快照、历史、规则、计数，串行 GitHub 队列和私有 ZIP 缓存。CI 可使用同一公开仓库代理和小时请求预算。代理读取 blob/tree 前先验证父仓库公开性，拒绝私有搜索与任意 API 路径。每种目录独立事务发布，规则独立更新。

| 接口 | 用途 |
| --- | --- |
| `GET /v1/catalog?kind=plugins` | 服务端搜索、筛选、排序，每页 24 条 |
| `GET /v1/entries/:encodedKey` | 当前详情、规则状态与请求计数 |
| `GET /v1/entries/:encodedKey/versions` | 最近 200 个 revision、来源观察与 artifact 哈希 |
| `POST /v1/downloads` | `{key, revisionId, idempotencyKey}` 换取私有下载票据 |
| `GET` / `HEAD /v1/files/:ticket` | 当前规则门控的 ZIP，支持单段 Range |
| `POST /v1/check-update` | 可信锁与主机／契约上下文，返回明确更新状态 |
| `GET /v1/policy` | 当前独立版本下架规则 |
| `POST /admin/snapshots/:kind` | kind 独立凭据提交完整目录与 releases 侧载 |
| `POST /admin/github/:kind` | kind 独立凭据调用公开仓库只读代理 |
| `POST /admin/policy` | 独立规则凭据，sequence 必须递增 |

分页游标绑定数据、指标、查询版本与排序，30 分钟过期；规则变化会要求重新搜索。服务失败不会伪装为空结果。保留历史快照供当前游标使用；部署需监控磁盘并制定归档／保留策略，首版不会自动丢弃历史或 artifact。

## 站点域名

插件站使用 `https://plugins.covel.cc/`，并链接到 `https://worlds.covel.cc/`。`site/public/CNAME` 与根路径静态资源支持自定义域名。本地预览可用 `VITE_SITE_URL`、`VITE_SIBLING_URL` 覆盖互跳地址；`VITE_CATALOG_API` 则是共享 API 地址。前端构建不会配置 DNS 或部署服务。

## 消费端 CI 与部署

生产域名已配置在源码中；DNS、Pages 设置与服务部署是独立操作。共享服务当前采用一个 Node 进程、SQLite 与私有文件缓存。Docker Compose、独立规则发布和备份恢复见 [covel-catalog 运维文档](https://github.com/covel-ai/covel-catalog/blob/main/docs/operations.md)，从公共仓执行。Workers、Redis、S3 仅为后续选项，不是本仓的运行依赖。

本仓设置变量 `CATALOG_API_URL` 与仅适用于 plugins 的密钥 `CATALOG_INGEST_TOKEN`。密钥不能放进 Vite 变量或公开文件；规则凭据由 covel-catalog 管理。Pages 选择 GitHub Actions，首次发布前核查完整 CI artifact 和入库回执。

采集／构建只有 `contents: read`，独立 Pages job 才有 `pages: write` 与 `id-token: write`。没有 API URL 时只生成标明本地预览的验收文件，不部署。API 失败保留旧站；配额耗尽时也保存采集进度。已配置 API 却缺少入库凭据会明确失败，不会回退到另一套 GitHub 配额。

规则可针对数字仓库 ID、owner ID、包路径、commit、内容或 ZIP 哈希，附原因和时间。每次新下载／票据兑换使用最新规则；恢复条目也要新 sequence。已经传出的文件及上游 GitHub 直链无法追回；静态导出可保留观察，但不授予下载权限。

## 升级公共实现

`vendor/catalog-kit` 是生成的只读目录。`catalog-kit.lock.json` 记录来源仓库、完整 commit、kit 版本和每个文件的 SHA256。使用 `pnpm kit:sync --commit <完整SHA>` 获取已互审的上游版本，再刷新 `pnpm-lock.yaml` 中两处 file 依赖，执行干净的 frozen install。不能手改 vendor 或复制上游未提交目录。`pnpm kit:check` 校验完整文件清单；依赖安装使用独立副本，不污染 vendor。根包与 site 实际解析的公共包都会核对锁中全部源码哈希。安装包根 `node_modules` 依赖目录由 `pnpm-lock.yaml` 管理，不属于源码清单；vendor 源码本身没有这个豁免。

Plugins 与 Worlds 共用默认暗色主题。仅保存的 `covel-theme=light` 选择浅色；存储不可用时回退暗色，页面仍可使用。初始化不会保存偏好。两站 HTML 在外部资源之前内联 `node vendor/catalog-kit/tools/theme-bootstrap.mjs` 的完整同步输出，并以 `html.dark` 兜底。升级 kit 后替换对应 head 标记块，`pnpm check` 会与固定版本生成器逐字核对。两个域名分别保存浏览器偏好。

消费端的采集、包布局和浏览器测试都针对锁定版本运行。插件和世界应保持同一已互审版本。模板更新后运行 `node scripts/catalog/workflow.mjs --write` 重新生成 workflow，并审查权限与发布条件。

## 验证

`pnpm test:catalog` 覆盖发现契约、续跑、适配器、策略变更、游标、版本冲突、确定性打包、私有代理拒绝、幂等、Range 和源码锁完整性；备份恢复测试在 covel-catalog 执行。`pnpm test:site` 在生产构建上验证响应式、双语搜索、主题、1 万条分页、错误和浏览器返回。`pnpm test` 保留官方插件回归。真实 GitHub smoke 通过 `node scripts/catalog/smoke.mjs` 或手动 workflow 单独执行，不混入 PR 离线验证。

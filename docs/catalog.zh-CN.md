# 目录架构与运维

[English](catalog.md) · **简体中文**

插件与世界共用 [`packages/catalog-kit`](../packages/catalog-kit/SPEC.md) 中的协议、采集核心、界面和服务。Worlds 按固定 commit 导入源码并校验完整 SHA256 清单，CI 拒绝修改或新增 vendor 文件。公共改动先在 canonical 源码实现并互审，再升级消费端锁定版本。两仓 Pages workflow 由同一模板实例化并逐字校验。

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

## 部署边界

仓库不会创建主机或云资源。需要选择具备持久私有卷、HTTPS 反向代理和备份能力的主机。Compose 默认给容器 2 GiB 内存；域名与 TLS 终止仍需部署配置。

1. 将 `service/.env.example` 复制为 `service/.env`，配置 HTTPS 公共 origin、浏览器 origin 白名单、仅需公开仓库读取的 GitHub 凭据，以及由密钥管理器提供的三个不同、至少 32 字符的令牌。插件、世界、规则分别使用自己的凭据；不要放进 Vite 变量或公开文件。
2. 在选定主机运行 `docker compose -f service/compose.yaml up --build -d`；服务只绑定主机回环端口，另行配置 HTTPS 代理。本地检查可运行 `pnpm serve:catalog`，监听 `127.0.0.1:8787`。新实例在没有有效规则和完整快照时会明确返回 503。
3. 审阅 `catalog/policy.json`，更新签发／过期时间与递增 sequence，通过独立手动 workflow 或 `node scripts/catalog/publish-policy.mjs` 发布。仓库中的初始规则是审阅草案，不是永久有效生产配置；应在到期前续发，规则不可用或过期会停止平台查询和下载。
4. 两仓分别设置变量 `CATALOG_API_URL`、kind 对应密钥 `CATALOG_INGEST_TOKEN`。只有规则源仓库配置 `CATALOG_POLICY_TOKEN`。Pages 选择 GitHub Actions，并按组织需要设置发布环境保护。
5. 首次发布前检查完整 CI artifact 与入库回执。采集／构建只有 `contents: read`，独立 Pages job 才有 `pages: write` 与 `id-token: write`。未设置 API URL 时只生成标明本地预览的验收文件，不部署。

首版按 socket 地址限制每分钟 180 请求、同时 4 个下载处理。服务不信任转发 IP header，因此同一反向代理后的用户共享该限额；公开上线前应按实际流量设置部署限额。队列预算耗尽会保留采集进度，使用共享代理时两个 CI 无需各自的 GitHub 令牌。

规则可针对数字仓库 ID、owner ID、包路径、commit、内容或 ZIP 哈希，附原因和时间。每次新下载／票据兑换使用最新规则；恢复条目也要新 sequence。已经传出的文件及上游 GitHub 直链无法追回；静态导出可保留旧观察，但不授予下载权限。

## 备份与恢复

使用 SQLite 在线备份 API，不能在 WAL 写入时只复制主数据库文件：

```sh
node service/backup.mjs create service/data service/backups/2026-10-29
node service/backup.mjs verify service/backups/2026-10-29
```

目标目录必须是新的；备份含数据库和所有被引用的 artifact，并逐一校验。加密异地保存并监控验证结果。恢复时先停服务、验证备份，将 `catalog.sqlite` 与 `artifacts/` 复制到新的私有数据卷并赋予容器 node 用户权限，再启动。开放下载前检查规则 sequence／有效期，若是安全事件恢复应轮换密钥。HTTP cache 可丢弃，正式历史、规则、计数和不可变文件不可用 CI cache 替代。

## 验证

`pnpm test:catalog` 覆盖发现契约、续跑、适配器、策略变更、游标、版本冲突、确定性打包、私有代理拒绝、幂等、Range 和备份恢复。`pnpm test:site` 在生产构建上验证响应式、双语搜索、主题、1 万条分页、错误和浏览器返回。`pnpm test` 保留官方插件回归。真实 GitHub smoke 通过 `node scripts/catalog/smoke.mjs` 或手动 workflow 单独执行，不混入 PR 离线验证。

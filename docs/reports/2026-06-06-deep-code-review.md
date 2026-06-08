# Artifacta 深度代码评审 — 2026-06-06

全方位评审：**用户交互 / 使用方式 / 代码逻辑 / 结构**四个维度，覆盖前端页面、46 个
API 路由、`lib/server/**`、CLI、客户端 SDK、持久化层。

> 方法：按子系统分区深读源码，所有标注 `file:line` 的发现均经人工对照真实代码核验。
> 对自动评审中**夸大或误判的项已下调并注明**（见 §0）。本文件只记录结论与中间产物，
> 不在本轮直接改码——修复建议按优先级列在文末。

## 0. 评审校正说明（重要）

- **OIDC `id_token` 未验签 / 无 PKCE 被初判为 Critical「账户接管」——已下调为 Medium（加固项）。**
  原因：`app/api/v1/auth/oidc/callback/route.ts` 走的是**授权码流**，`id_token` 由服务端
  `exchangeCode` 通过 TLS 后台信道向 `token_endpoint` 换取（route.ts:67-82），**不经浏览器**，
  攻击者无法直接提交伪造 token。验签/校验 `iss`/`aud`/`exp` 仍是应做的纵深防御，但不构成
  可直接利用的接管路径。配置了 `OIDC_CLIENT_SECRET` 时为机密客户端，PKCE 缺失影响进一步降低。

## 1. 安全（最高优先）

### S1 — High：public 项目同步脚本 `source_config` 凭据匿名可读 ✅已核实
- 位置：`lib/server/access.ts:4`（public 无需登录即 `canViewProject`）+
  `lib/server/serializers.ts:142`（原样返回 `source_config`）+
  `app/api/v1/projects/[projectId]/sync-scripts/route.ts:19`（GET 仅需 view 权限）
- `source_config` 会被注入子进程作 `ARTIFACTA_SOURCE_CONFIG`（脚本放凭据/token 的地方）。
  把项目设为 public 后，**任意匿名访客** `GET /sync-scripts`（及 `[scriptId]`、`status`）即可
  读取其中明文配置。
- 修复：序列化时对 `source_config` 脱敏（仅返回键名/掩码），完整值仅在 `canEditProject` 下返回。

### S2 — High：API Key 路由不校验 scope，受限 key 可自我提权为全权 ✅已核实
- 位置：`app/api/v1/api-keys/route.ts:12,27`（GET/POST 用裸 `authenticateRequest`，无
  `requireRequestAuth(scope)`）+ `lib/server/api-key-scopes.ts:40-42`（`parseRequestedScopes`
  允许 `"*"`）
- 一个仅有 `projects:read` 的 API Key 可调用 `POST /api-keys` 创建 `scopes:["*"]` 的新 key，
  绕过整套 scope 限制。
- 修复：禁止 API Key 认证创建新 key（或要求 `admin` 角色），且不允许申请超过自身的 scope。

### S3 — Medium：空 `scopes` 被当作通配全权（fail-open 默认）✅已核实
- 位置：`lib/server/api-key-scopes.ts:15,17`（`normalizeApiKeyScopes([]) → ["*"]`）；
  `api-keys/route.ts:87` 序列化也把空 scope 显示为 `["*"]`
- 创建 key 时不传/传空 `scopes` → 静默获得全权，而非最小权限。
- 修复：空 scope 视为「无权限」或强制创建时显式指定。

### S4 — Medium：Embed Token 签名未受生产密钥保护 ✅已核实
- 位置：`lib/server/embed.ts:42-43`（`sign` 直接用 `authSecret`，从不调用
  `assertProductionSecrets()`），对比 `lib/server/auth.ts` 的 session 创建有该保护
- 若 `AUTH_SECRET` 仍是默认值，session 被拦但 embed token 不拦——知道公开默认密钥者可伪造
  embed token 访问任意（含私有/团队）看板。
- 修复：embed 签/验路径同样调用 `assertProductionSecrets()`，并对 embed 与 session 的 HMAC
  做域分隔（不同前缀）。

### S5 — Medium：脚本子进程继承全部 `process.env` 且无网络隔离 ✅已核实
- 位置：`lib/server/sync/script-runner.ts:182-183`（`env: {...process.env, ...}`）
- 同步脚本（由项目编辑者提供）可读取服务端全部环境变量（可能含 DB 连接串、密钥），并能
  访问元数据端点（169.254.169.254）/内网。注意：dataset URL 同步有完整 SSRF 防护
  (`source-policy.ts`)，但**脚本运行器完全没有**。
- 修复：只传白名单 env；为子进程加网络策略；明确信任边界（脚本作者==edit 权限者）。

### S6 — Medium：限流可被伪造头绕过且为单进程内存计数 ✅已核实
- 位置：`lib/server/rate-limit.ts:29-33`，`clientKey` 取 `x-forwarded-for` 首段（攻击者可控）
- 每请求轮换 XFF 即可无限尝试登录/建 key；多实例/serverless 下计数不共享。
- 修复：仅在可信代理后才信任 XFF，否则用真实 socket IP；多实例用共享存储（Redis）。

### S7 — Low：OIDC `next` 开放重定向；TOCTOU(DNS rebinding)；非常量时间比较
- `oidc/login/route.ts:13` + `callback:55`：`next` 可为 `//evil.com` 造成认证后开放重定向 →
  仅允许同源绝对路径（单 `/` 开头且非 `//`）。
- `source-policy.ts:162-169`：解析校验后 fetch 再次解析，存在 DNS 重绑定窗口（仅影响已废弃的
  dataset 路径）。
- `auth.ts:45`/`embed.ts:18`/`auth.ts:62-63`：session/embed/API key 比较用 `!==`/`===`，
  建议 `crypto.timingSafeEqual` 做纵深防御。

### 已核验为正确（非问题）
- ZIP zip-slip 防护扎实（`zip-security.ts`：拒绝绝对/盘符/`..`/反斜杠/`__MACOSX`），存储层
  `normalizeStorageKey` 二次校验 `..`。
- session 验签先验 HMAC 再解析、强制 `exp`，结构检查完整。

## 2. 代码逻辑 / 正确性

### L1 — High：上传会话在持有全局 DB 写锁期间做大文件 ZIP 解析与磁盘 I/O ✅已核实
- 位置：`app/api/v1/upload-sessions/route.ts:41-54`（`createUploadSession` 在
  `updateDatabase` 回调内 `arrayBuffer()` + 解析 + 写最多 100MB）；commit 路径同样
  (`app/api/v1/projects/route.ts:104-118`)
- `updateDatabase` 串行化**所有**写操作。一次大上传会阻塞全站所有 DB 写（改项目、同步、
  日志、其他上传）。
- 修复：把解析/解压/存储放到进入 `updateDatabase` **之前**，锁内只做内存改动+持久化。

### L2 — High：脚本子进程 stdout 管道从不读取 → 大量 stdout 死锁到超时；stderr 无上限；RSS 限额未生效 ✅已核实
- 位置：`script-runner.ts:189`(`stdio:["ignore","pipe","pipe"]` 但无 `stdout.on('data')`)、
  `:197-200`(stderr 无限拼接)、`:209`(`void SCRIPT_RSS_LIMIT_BYTES` 被丢弃)
- 脚本打印足够多到 stdout 会填满管道缓冲、阻塞至 SIGKILL，把成功跑成「超时失败」；恶意/吵闹
  脚本可经 stderr 拼接 OOM 服务端；文档宣称的内存上限根本未执行。
- 修复：挂 stdout 排空（或 `"ignore"`），限制 stderr 累积长度，真正执行 RSS/输出上限。

### L3 — High：无 stuck-job 恢复，worker 崩溃后 job 永久 `running`，该项目同步永久卡死 ✅已核实
- 位置：`sync/script-jobs.ts:15-19`（`running` 时拒绝入队）+ `sync/job-lifecycle.ts`（无任何把
  孤儿 `running` 重置的逻辑）
- worker/服务进程崩溃或 claim 第二段 `updateDatabase` 抛错，job 永留 `running`，此后该项目所有
  trigger 静默返回这个死 job，UI 无恢复手段。
- 修复：加 `startedAt`+租约超时；claim/入队时把超过 `SCRIPT_TIMEOUT_MS×slack` 的 `running`
  视为 failed/可重入队。

### L4 — Critical(功能)：`.htm` 文件绕过「单 HTML」与 entrypoint 校验 ✅需复核
- 位置：`lib/server/storage.ts:211`（仅 `.html` 进 `htmlFiles`）vs `artifacts/mime.ts:3`
  （`isBlockedHostedExtension` 同时拦 `.html`/`.htm`）
- 含 `index.htm`（+多个 `.htm`）的包：`MULTIPLE_HTML_FILES` 不触发；可能 `NO_ENTRYPOINT`
  误拒一个其实有入口的包；`.htm` 页在资源路由按 `html_sibling` 404。各模块扩展名集合不一致。
- 修复：统一一个 HTML 扩展名判定，`htmlFiles` 收集与 `pickDefaultIndex` 都覆盖 `.htm`。

### L5 — Medium：S3 部署下上传会话临时 ZIP 仍写本地磁盘（存储驱动不一致）✅已核实
- 位置：`artifacts/upload-session.ts:82-87,134`（裸 `fs` 写/读 `dataDir/tmp/...`）+
  `bundle-commit.ts:137`
- `STORAGE_DRIVER=s3`（本应无状态/多实例）时临时 ZIP 只在处理 create 的那个实例本地；commit
  若路由到另一实例则 `fs.readFile` 失败。也会让放弃的上传堆积本地磁盘（无后台清理，L6）。
- 修复：临时 ZIP 也走 `writeStorageObject`/`readStorageObject`（`tmp/` 前缀）。

### L6 — Medium：放弃的上传会话临时目录无后台清理；Zip-bomb 限额信任 header 声明大小
- `upload-session.ts`：`cleanExpiredSessions` 仅在后续上传请求到来时惰性触发，无定时清理 →
  低流量/ S3 部署下临时文件无限堆积。
- `zip-security.ts:49-57`：解压上限基于 `entry.header.size`（中央目录声明值，攻击者可伪造），
  而真正 `getData()` 解压不受这些上限约束 → zip-bomb 防护可被绕过。
- 修复：定时清理；按真实解压字节累计校验，或核对 header.size 与实际数据一致再放行。

### L7 — Medium：私有/经 embed token 访问的资源被 `private, max-age=300` 缓存 + `ACAO:*`
- 位置：`artifacts/cache-control.ts:5-8` + `[...assetPath]/route.ts:38,43`
- 缓存策略只看 `project.visibility`，不区分「经临时 embed token 授权」。token 过期/吊销后，
  浏览器仍可读已缓存的私有资源（最长 5 分钟），叠加 `ACAO:*` 扩大暴露面。
- 修复：经 token 授权或非 public 一律 `no-store`；非 public 收紧/去掉 `ACAO:*`。

### L8 — Medium：claim+执行分两段 `updateDatabase`，跨进程无 claim 锁 → 可双重执行
- 位置：`sync/script-jobs/claim/route.ts:19,22`
- `updateDatabase` 仅进程内串行；多实例（Postgres/SQLite 明确支持共享）下两进程可同时读到同一
  `queued` job 并都置 `running`，双执行 + 全量 blob 覆盖写互相覆盖。
- 修复：claim+run 用单次原子 CAS（`UPDATE ... WHERE status='queued'`），或强制单进程并写明。

### L9 — Medium：CLI `datasets sync set` 丢弃 `--source-type`/`--config-*`，请求体硬编码 ✅已核实
- 位置：`packages/cli/bin/artifacta.mjs:235-251`
- 解析了 `sourceType` 但请求体写死 `{source_type:"manual", source_config:{}, ...}`，
  `--config-file`/`--config-json` 完全无效，却回显「Sync config saved」误导用户。README:43-44
  仍举 `--source-type presto --config-file` 例子（服务端已只接受 `manual`）。
- 修复：要么按解析值发送让服务端自行拒绝，要么删 README 死例子并简化命令。

### 已核验为正确
- 资源路由/脚本输出路径遍历防护正确（`asset-routing`、`script-runner.ts:19-26 resolveBundlePath`）。
- PUT `outputs` 校验限制为已知 bundle 数据集（`sync-scripts/[scriptId]/route.ts`）。
- seed 在 json/sqlite/postgres 三驱动均幂等；迁移幂等（`artifacta_migrations` 事务包裹）。

## 3. 结构 / 一致性

### St1 — Medium：遗留 dataset 同步引擎整套是死代码但仍随包发布
- `lib/server/sync-runner.ts` 全文、`sync/jobs.ts`、`sync/cron.ts`、`app/api/v1/sync/jobs/claim`
  （恒返回 `{job:null}`）、dataset `sync/trigger`（恒 410）均无生产调用方（仅被测试引用）。
  其中 `sync/trigger/route.ts:19-27` 还为纯 no-op 包了 `updateDatabase`（白拿全局写锁、全量重写
  DB），`:35` 为不可达死代码。
- 修复：删除遗留引擎与路由，或明确特性开关隔离；至少 410 端点改用 `readDatabase`。

### St2 — Low：三个 DB 驱动行为一致但 SQLite 索引基本闲置
- `db.ts`：每次写都全量 `DELETE`+重插 18 张表（SQLite）/重写整块 JSONB（PG）；读除
  `getProjectById` 快路径外全是全表加载。SQLite/PG 相对 JSON 无真实扩展收益。属设计取舍，记录备查。

### St3 — Nit：重复/死代码
- `formatSize` 在 `app/upload/page.tsx:248` 与 `app/dashboards/page.tsx:772` 重复 → 提到 `lib/`。
- CLI `arrayOption`（:508-512）从未调用；`run-script` 的 `runtimeArgs` 三元两支相同（CLI 与
  script-runner 各一处）。
- 数据集扩展名清单两份（`upload-session.ts:9-14` vs `manifest.ts:113-122`）易漂移。

## 4. 用户交互 / UX

### U1 — High：多数数据页无独立 loading 态，首屏闪现错误的空/零内容
- 位置：`app/dashboards/page.tsx`、`app/page.tsx:86-89`、`settings/api|team|operations`
- 状态初始化为 `null`/`[]` 即渲染完整 UI，首个 fetch 在途时无 loading 指示：首页统计卡显示
  `0` 像真实零值，看板表先空再「弹入」。
- 修复：用显式 `isLoading` 标志，首个 fetch 完成前显示骨架/spinner。

### U2 — High：所有变更操作无防重复提交
- 位置：`dashboards`（建文件夹/移动/改可见性/删项目/删数据集）、`settings/api`（建/删 key）、
  `settings/team`（邀请/改角色）、`settings/operations`（建 webhook）、
  `projects/[projectId]`（建嵌入链接/回滚/触发同步）——均无 pending/disabled。
- 用户连点会产生重复文件夹/key/webhook/job。
- 修复：每个操作加 `isSubmitting` 并在请求期间禁用按钮。

### U3 — High：`view` 预览页任何错误都提示「登录后重试」
- 位置：`app/view/[projectId]/page.tsx:45-54`
- 404/403/500/网络错误统一渲染「看板不可访问」+ 唯一按钮跳 `/login`。已登录用户访问被删/私有
  看板被误导去登录且无出路。
- 修复：按状态码分支，仅 401 给登录 CTA，其余给「返回列表」/重试。

### U4 — Medium：设置页 Profile/Org/Appearance/Storage 表单整页未接线
- 位置：`app/settings/page.tsx`（保存更改/更换头像/删除账户/部门/简介/主题/存储数值全硬编码无
  handler）。尤其「删除账户」按钮看起来可用却静默无效，危险。
- 修复：接线或禁用/移除控件；「删除账户」绝不能呈现为可用却无效。

### U5 — Medium：数据集配置弹窗不查 HTTP 状态，把失败当「无数据」
- 位置：`app/dashboards/page.tsx:673-685`（`Promise.all` 直接 `.json()` 不查 `response.ok`）
- versions/sync-history 请求失败被吞，渲染成「暂无版本记录」如同真无。与全站其他 fetch 不一致。
- 修复：逐请求查 `response.ok`，把失败与空区分。

### U6 — Medium：导航/标签不一致
- header「新建数据集」指向 `app/datasets/page.tsx`（直接 `redirect("/dashboards")`），承诺了无法
  兑现的动作 → 移除或指向真实上传流。
- `view:70`、`projects/[projectId]:161` 直接渲染英文 `visibility`，其他页用中文映射（私有/团队/
  公开）→ 复用 `permissionConfig` 标签。
- 搜索框每键一次请求、无防抖无取消（`dashboards`、`settings/team`）→ 加 300ms 防抖+取消在途。

### U7 — Medium：Embed token 置于 URL query 并作可复制链接展示
- 位置：`embed/[projectId]/page.tsx:9`、`projects/[projectId]/page.tsx:184`
- token 进 iframe `src` query → 落入 referer/日志/历史；项目页还把含 token 的完整 URL 作可点链接
  呈现，无「机密/短时效」提示。
- 修复：改 POST/cookie 交换，或明确标注链接为机密且短时效。

### UX 正确之处（已核验）
- iframe `sandbox` 未含 `allow-same-origin`（对不可信用户 HTML 正确）；无 `dangerouslySetInnerHTML`；
  所有破坏性操作有 `AlertDialog` 二次确认；login 用 `Suspense` 包 `useSearchParams`。

## 5. API 路由层（46 路由）

整体结构较统一：每路由 `runtime="nodejs"`，读走 `readDatabase`、写走 `updateDatabase`、
响应走 `ok/created/noContent/apiError`、序列化一致 snake_case。两条系统性不一致驱动了大部分
问题：**(1)** scope 校验（`requireRequestAuth(scope)`）只覆盖约 12/46 个 handler；**(2)** 整库
为单一 JSON/JSONB blob，每次写全量重写，list 全是全表扫描，`updateDatabase` 是进程内全局锁。

### A1 — High：多数写路由不校验 API Key scope，scoped key 越权 ✅已核实
- 位置：`permissions/route.ts`、`permissions/[userId]/route.ts`、`versions/[versionId]/rollback`、
  `folders/route.ts`、`folders/[folderId]`、`projects/[projectId]/folder`、`webhooks/**`、`team/**`、
  `api-keys/**`、`embed-token`、`sync/script-jobs/claim`
- 仅 `projects`/`datasets` 顶层正确 `requireRequestAuth(...:write)`。其余写操作用裸
  `authenticateRequest` → 仅 `projects:read` 的 key 可改成员、回滚看板、增删文件夹、管理 webhook，
  admin 用户的只读意图 key 还能读全量审计日志、轮换 webhook、建新 key。`admin:read`/`team:*`
  scope 定义了却从未被强制。（与 §1 S2 同源，此处给出完整路由清单。）
- 修复：所有变更 handler 接 `requireRequestAuth` 配恰当 scope；审计读用 `admin:read`。

### A2 — High：权限 POST 用任意 email 创建真实用户，且不校验同组织 ✅已核实
- 位置：`app/api/v1/projects/[projectId]/permissions/route.ts:56-70`
- 任何 editor POST 任意 `user_email`：不存在则静默插入 active `member` 用户（绕过 admin-only 邀请
  流、污染用户表）；匹配到已有用户时**无组织校验**，可把**他组**用户加入本项目（该用户保留原
  `organizationId`）。
- 修复：仅允许授权给同组织的已存在用户，否则 404；新邀请走 admin team 流程。

### A3 — High：`updateDatabase` 跨进程非原子，Postgres 多实例下并发写丢数据 ✅已核实
- 位置：`lib/server/db.ts:883-899`
- 队列仅进程内串行；Postgres/SQLite 把整库当一个 blob 全量重写，多实例/serverless 下两进程并发
  写以「整行 last-writer-wins」互相覆盖，无跨进程锁。
- 修复：Postgres 用 `SELECT ... FOR UPDATE`/`updated_at` 乐观 CAS，或拆分实体行；至少文档声明
  Postgres 驱动仅限单实例。

### A4 — High：Webhook 投递 fire-and-forget，无重试/无死信，请求生命周期结束后才 fetch ✅已核实
- 位置：`lib/server/webhooks.ts:27-30,32-54`（`void deliverWebhook(...)`）
- 失败被吞；投递发生在发起它的 `updateDatabase` 事务返回**之后**，serverless 冻结/进程退出会整丢
  事件；`markDelivery` 又自起一次全量写可覆盖并发改动。
- 修复：持久化投递队列+退避重试，由 worker 投递而非请求内联。

### A5 — Medium：项目/数据集 DELETE 级联不完整，遗留孤儿记录 ✅已核实
- 位置：`projects/[projectId]/route.ts:76-79`（仅清 projects/datasets/projectMembers/syncHistory）；
  `datasets/[datasetId]/route.ts`（仅清 datasets/syncHistory）
- 遗留 `dashboardVersions`/`datasetVersions`/`projectSyncScripts`/`scriptSyncJobs`/
  `scriptSyncHistory`/`syncJobs` 无限堆积，`datasetVersions` 仍指向已删数据集。
- 修复：两处 DELETE 的 filter 扩展到全部子集合。

### A6 — Medium：Webhook PATCH 无法改 `events`，且非法 url 静默忽略
- 位置：`webhooks/[webhookId]/route.ts:22-28`
- PATCH 只改 `enabled`/`url`，订阅核心 `events` 创建后不可变；非法 url 不返回 400（POST 会）。
- 修复：PATCH 支持并校验 `events`，非法 url 返回 400。

### A7 — Medium：分页与查询参数手写校验，`NaN`/非数字被静默吞成空页
- 位置：`lib/server/responses.ts:28-32`（`Number("abc")→NaN`，`slice(NaN,NaN)→[]`）
- `page=abc` 返回空页而非 400；全站无 zod，校验全手写 `String()/Set.has`。
- 修复：`Number.isFinite` 守卫+取整，非法返回 400；查询参数可引入共享 zod schema。

### A8 — Medium：list 端点全表扫描 + 每项目重扫子集合（O(项目×数据集)）
- 位置：`responses.ts:34-49 paginate`、`serializers.ts:65-87`（每项目重扫 datasets/members/
  activities）、`stats/route.ts`
- demo 规模可接受，真实数据撑不住。修复：序列化时用 Map 记忆 owner/datasets；长期把过滤分页下推 SQL。

### A9 — Medium：embed-token POST 无 scope 无限流，改私有后旧 token 不吊销（与 §1 S4/L7 相关）
- 位置：`embed-token/route.ts:11-28`
- 任意 editor 可签发最长有效期的 token；项目改 private 后旧 token 仍可用（无吊销）。
- 修复：加 scope 与限流；view 时按当前可见性校验 token 有效性。

### A10 — Low：dataset 列表与单条 GET 访问模型不一致；preview 对损坏文件抛 500
- 单条 `datasets/[datasetId]` 允许匿名访问 public，列表却要求 auth+scope（`datasets/route.ts:24`
  的 `auth?.user` 可选链是死代码）。
- `preview/route.ts:43-58` 的 `JSON.parse` 未 try/catch，损坏文件 → 未处理 500，应返回 422
  `parsed:false`。

### 已核验为正确
- snake_case 序列化全站一致；`apiError` 形状统一、状态码合理。
- `canViewProject`/`canEditProject` 在每个项目级路由都有，且 sync/trigger 在 `updateDatabase` 内
  二次校验。
- 顶层 `datasets` 按 `organizationId` 过滤，无跨组织泄露；updater 内 `record!` 非空断言安全
  （存在性已在同一锁内先校验）。

## 6. 修复优先级建议

**P0（先修，安全/数据正确性）**
1. **scope 全面失守**：S2/S3 + A1 + A4(api-keys) — 把所有变更 handler 接 `requireRequestAuth`
   配恰当 scope，创建 key 要求高权限且禁止越权 scope，空 scope 不再通配。
2. S1 public 项目 `source_config` 匿名泄露 → 序列化脱敏 + edit 权限门控。
3. A2 权限 POST 任意 email 注入用户 / 跨组织授权 → 仅同组织已存在用户，否则 404。
4. L2 脚本 stdout 死锁 + 限额未生效；L3 stuck-job 永久卡死 → 排空 stdout、加租约超时恢复。
5. L4 `.htm` 绕过单 HTML 校验 → 统一扩展名判定。

**P1（稳定性/一致性）**
6. A3 `updateDatabase` Postgres 多实例丢数据 → 乐观 CAS 或声明单实例。
7. L1 大上传持有全局写锁 → 解析移出锁外。
8. S4 embed 签名加 `assertProductionSecrets`；S5 子进程最小化 env；A9 embed-token 加 scope/限流。
9. L5/L6 S3 临时文件走存储驱动 + 定时清理 + 真实解压字节校验。
10. A5 DELETE 级联补全；A4 webhook 投递加重试队列。
11. U1/U2/U3 前端 loading 态、防重复提交、预览页错误分支。

**P2（清理/一致性）**
12. St1 删除遗留 dataset 同步死代码与 410 端点的无谓写锁。
13. A6/A7/A10 webhook PATCH 改 events、分页 NaN 校验、preview try/catch。
14. L9 CLI `datasets sync set` 与 README 对齐；St3 去重/死代码。

# Artifacta

**在 AI 时代，还在用拖拉拽拼 BI 看板？**  
那是上一代的生产方式：慢、僵、难协作，也很难把「模型刚吐出来的洞察」直接变成可交付物。

Artifacta 相信另一件事：**让 AI 直接写 HTML 看板**——图表、叙事、交互一次成型，比拖控件快一个数量级。

---

但你也知道，HTML 看板今天长什么样：

- 一堆 **本地文件孤岛**，发邮件、丢网盘、截图进 PPT？
- 同事想 **在线看**，还得你本机开着、路径还得对？
- 数据写死在 CSV 里，**没法定时更新**，更谈不上团队统一口径？

**Artifacta 就是来填这个洞的：** 一个面向 AI 生成数据应用的 **开放协议 + 托管平台**。

上传你的 HTML / ZIP 看板包，设好谁能看、数据怎么更——特别适合：

- 团队 **HTML 周报 / 月报**
- **HTML 版演示稿**（比静态 PPT 活）
- 轻量 **BI 看板**、分析页、运营大屏
- 任何「本地 AI 先做出来，再要给团队线上用」的场景

本地用 Cursor / Claude Code 等 **Skill** 生成完，一条 CLI 就能打包上传；平台负责托管、权限、数据集绑定与同步更新，把「我电脑上能跑」变成「团队随时能看、数据还能跟着变」。

[English README](README-EN.md)

## 项目预览

![Artifacta 概览](public/demo/overview.png)

![托管看板预览](public/demo/dashboard-preview.png)

## 当前已经可用

- 上传单文件 `.html` 看板，或上传包含 CSS、JS、图片等资源的 `.zip` 看板包。
- 通过沙箱 iframe 预览看板，支持私有、团队、公开三种可见性。
- 上传 CSV/JSON 数据集，自动解析行数、列数和字段类型。
- 管理文件夹、团队成员、项目权限、API Key 和数据同步配置。
- Web 控制台使用签名 Cookie Session，coding agent、CI、CLI 使用 Bearer API Key。
- 默认使用本地 JSON 零门槛启动，也可以切到 SQLite 获得更接近生产的自托管体验。
- 内置 `artifacta` CLI、同步 Worker 和 API smoke test。
- Web 控制台支持中文 / 英文切换（顶部语言开关，默认中文，偏好存于浏览器 `localStorage`）。

## 快速开始

Artifacta 使用 Node `24.16.0` 和 `pnpm@11.1.3`。仓库已经包含 `packageManager`、`.node-version`、`.nvmrc`，方便 Corepack、`fnm`、`nvm` 等工具自动切换。

```bash
corepack enable
pnpm install
cp .env.example .env.local
pnpm dev
```

打开 `http://localhost:3000`，使用任一演示账号登录：

- `admin@artifacta.local`
- `lisi@artifacta.local`

第一次请求会自动初始化演示组织、用户、文件夹、数据集、精美示例看板和 `.artifacta` 本地运行数据。

若你仍保留旧版本的 `.datavision` 目录，可将其重命名为 `.artifacta`，或通过 `DATA_DIR`、`UPLOAD_DIR`、`SQLITE_PATH` 指向旧路径直至完成迁移。

## 使用 SQLite 运行

默认 JSON 存储适合第一次体验。如果要更接近真实自托管，可以切换到 SQLite：

```bash
DATA_DRIVER=sqlite \
SQLITE_PATH=.artifacta/artifacta.sqlite \
pnpm dev
```

SQLite adapter 带幂等迁移，仍然复用当前 API 和页面逻辑。

## CLI 工作流

在 `系统设置 -> API & CLI` 创建 API Key 后：

```bash
export ARTIFACTA_URL=http://localhost:3000
export ARTIFACTA_API_KEY=art_...

pnpm cli -- projects list
pnpm cli -- projects upload --file ./dashboard.zip --name "增长周报" --visibility team
pnpm cli -- projects update-html --project-id proj_123 --file ./dashboard-v2.zip
pnpm cli -- datasets upload --project-id proj_123 --file ./growth.csv --name "增长周报数据"
pnpm cli -- sync-scripts trigger --project-id proj_123 --script-id sscript_123
pnpm cli -- datasets list
pnpm cli -- doctor
pnpm cli -- --json projects list
```

独立 CLI 已发布到 npm（[`@artifacta/cli`](https://www.npmjs.com/package/@artifacta/cli)），外部用户无需克隆仓库即可安装：

```bash
npx @artifacta/cli@latest --help
```

或全局安装：

```bash
npm install -g @artifacta/cli
```

当前 CLI 已经可以让本地 skill 或 CI 直接创建项目、替换看板 HTML、上传/替换数据集，并提交数据同步配置 JSON。

零仓库用户接入流程见 [docs/ONBOARDING.zh-CN.md](docs/ONBOARDING.zh-CN.md)。维护者发新版本见 [docs/CLI-RELEASE.md](docs/CLI-RELEASE.md)。

## AI 编程助手 Skill

Artifacta 提供开源的 `artifacta-publisher` skill，支持 Claude Code、Cursor、Codex 等 [70+ 个 AI 编程助手](https://skills.sh)，帮助 agent 直接完成看板的打包、上传和同步配置。

```bash
npx skills add github:shl418/Artifacta --skill artifacta-publisher
```

或手动复制 [skills/artifacta-publisher/SKILL.md](skills/artifacta-publisher/SKILL.md)。

## REST API 示例

```bash
SESSION=$(curl -s -X POST http://localhost:3000/api/v1/upload-sessions \
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \
  -F "file=@./dashboard.zip" | jq -r .session_id)
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \
  -F "name=销售看板" \
  -F "visibility=team" \
  -F "upload_session_id=$SESSION"
```

完整路由、请求参数和响应格式见 [docs/API.md](docs/API.md)。稳定的 ZIP/Bundle 协议见 [docs/protocol/manifest-v1.md](docs/protocol/manifest-v1.md)。

## 示例

`examples/WALKTHROUGH.zh-CN.md` 提供走通示例：单 HTML、扁平 zip、带 `data/` 子目录的多数据集包、脚本同步；示例目录内**不含**预置的 `artifacta.json`（脚本示例需自建）。

```bash
cd examples/0-single-html && artifacta projects upload --file index.html --name "单文件"
# 更多见 examples/WALKTHROUGH.zh-CN.md
```

## 数据同步 Worker

数据集本身是静态数据；动态更新只通过项目级 `sync_scripts`（脚本运行在解包后的 bundle 目录里）。Worker 会领取排队中的脚本同步任务并执行，与用户在界面/API 手动触发的执行器一致。

```bash
export ARTIFACTA_API_KEY=art_...
pnpm worker:once
node scripts/sync-worker.mjs --interval 60
```

按数据集来源的 URL / COS / Presto 等外部动态同步已移除，统一改为手动触发的 bundle sync scripts。

## 常用脚本

```bash
pnpm dev          # 启动开发服务器
pnpm build        # 生产构建
pnpm start        # 运行生产构建
pnpm typecheck    # TypeScript 检查
pnpm lint         # ESLint
pnpm test         # 合同、客户端、安全与单元测试
pnpm test:api-contract # 路由 / OpenAPI 一致性检查
pnpm test:client   # @artifacta/client 测试
pnpm test:security # ZIP、同步来源、上传会话安全测试
pnpm test:unit    # 同步任务、manifest、CSV、限流、嵌入令牌、版本历史
pnpm test:smoke   # 对运行中的服务做 API 冒烟测试
pnpm worker:once  # 执行一次同步 Worker
```

## 配置项

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | 生成预览链接和 API 链接时使用的公开地址。 |
| `AUTH_SECRET` | development fallback | Session 签名密钥，共享环境必须替换为强随机值。 |
| `DATA_DRIVER` | `json` | 可选 `json`、`sqlite` 或 `postgres`。 |
| `DATA_DIR` | `.artifacta` | 本地元数据目录，也是默认 SQLite 父目录。 |
| `SQLITE_PATH` | `.artifacta/artifacta.sqlite` | `DATA_DRIVER=sqlite` 时的数据库路径。 |
| `POSTGRES_URL` / `DATABASE_URL` | 未设置 | `DATA_DRIVER=postgres` 时的连接串（当前为单行 JSONB blob，PoC 阶段）。 |
| `UPLOAD_DIR` | `.artifacta/uploads` | 上传的看板和数据集文件目录。 |
| `STORAGE_DRIVER` | `local` | 可选 `local` 或 `s3`。 |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT` | 未设置 | S3 兼容对象存储配置。 |
| `ARTIFACTA_MAX_ARTIFACT_BYTES` | `104857600` | 看板文件最大上传大小。 |
| `ARTIFACTA_MAX_DATASET_BYTES` | `52428800` | 数据集最大上传大小。 |
| `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` | 未设置 | 可选 OIDC 登录配置。 |

## 代码结构

- `app/`：Next.js App Router 页面、预览页和 REST API。
- `lib/server/`：认证、权限、数据库 adapter、文件存储、序列化、数据集解析和同步执行器。
- `packages/cli/`：对外发布的独立 CLI 包；`bin/artifacta.mjs` 保留为仓库内包装入口。
- `scripts/sync-worker.mjs`：基于 API Key 的同步 Worker。
- `.artifacta/`：本地运行数据，不提交到 Git。

当前路线图见 [docs/plans/2026-05-21-open-source-excellence-roadmap.md](docs/plans/2026-05-21-open-source-excellence-roadmap.md)，部署说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。`docs/PLAN.md` 已作为历史计划归档。

## 文档索引

| 分类 | 文档 | 说明 |
|------|------|------|
| **入门** | [docs/ONBOARDING.zh-CN.md](docs/ONBOARDING.zh-CN.md) | 零仓库用户接入流程 |
| | [docs/ONBOARDING.md](docs/ONBOARDING.md) | 同上（英文） |
| **API 与集成** | [docs/API.md](docs/API.md) | 人工可读 REST API 文档 |
| | [docs/openapi/artifacta.v1.yaml](docs/openapi/artifacta.v1.yaml) | 当前用于集成的部分 OpenAPI 契约 |
| | [skills/artifacta-publisher/SKILL.md](skills/artifacta-publisher/SKILL.md) | AI 编程助手 skill |
| **运维** | [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | 部署说明 |
| | [docs/CLI-RELEASE.md](docs/CLI-RELEASE.md) | 维护者发布新版 CLI |
| **产品** | [docs/PRODUCT.md](docs/PRODUCT.md) | MVP 已实现能力、路线图与企业扩展点 |
| | [docs/IMPLEMENTED-FEATURES.md](docs/IMPLEMENTED-FEATURES.md) | 代码和文档同步清单 |
| **开发** | [docs/DEVELOPMENT-ENVIRONMENT.md](docs/DEVELOPMENT-ENVIRONMENT.md) | 开发环境要求（fnm / Node / pnpm） |
| | [CONTRIBUTING.md](CONTRIBUTING.md) | 贡献指南 |
| | [SECURITY.md](SECURITY.md) | 漏洞报告 |
| | [CHANGELOG.md](CHANGELOG.md) | 变更记录 |

## 当前边界

- 配置后可使用 OIDC 登录；SAML 仍保留为扩展点。
- SQLite 适合自托管试用，相比 JSON driver 更接近真实持久化。
- **`DATA_DRIVER=postgres` 当前将整个数据库序列化为单行 JSONB blob**，与 JSON driver 等价，尚无行级索引，不建议用于生产环境。关系型 Postgres 支持列入路线图但尚未实现。
- 数据集更新目前统一为手动触发的 bundle sync scripts，外部 URL / S3 / Presto 同步已移除。

## License

MIT. See [LICENSE](LICENSE).

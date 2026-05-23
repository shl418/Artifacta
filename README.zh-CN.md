# Artifacta

Artifacta 是面向 AI 生成数据应用的开放协议与托管平台。它让本地 AI 工具、脚本和分析师可以发布 HTML/JS 产物，绑定数据源，并把可更新的数据应用共享给团队。

项目面向新的工作流：在本地用你熟悉的工具构建数据应用，再借助 Artifacta 完成协议化发布、托管、权限、数据集、API Key 和可重复的交付。

[English README](README.md)

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
pnpm cli -- projects upload --file ./dashboard.zip --name "增长周报" --data-file ./growth.csv --visibility team
pnpm cli -- projects update-html --project-id proj_123 --file ./dashboard-v2.zip
pnpm cli -- datasets upload --project-id proj_123 --file ./growth.csv --name "增长周报数据"
pnpm cli -- datasets sync set --project-id proj_123 --dataset-id ds_123 --source-type presto --config-file ./sync.json
pnpm cli -- datasets list
pnpm cli -- doctor
pnpm cli -- --json projects list
```

仓库里现在还包含了独立可发布的 CLI 包，位于 `packages/cli`。发布到 npm 后，外部用户无需克隆仓库，也可以直接使用：

```bash
npx @artifacta/cli@latest --help
```

当前 CLI 已经可以让本地 skill 或 CI 直接创建项目、替换看板 HTML、上传/替换数据集，并提交数据同步配置 JSON。

零仓库用户接入流程见 [docs/ONBOARDING.zh-CN.md](docs/ONBOARDING.zh-CN.md)。可复制的 Claude Code skill 模板见 [templates/claude-code-artifacta-publisher/SKILL.md](templates/claude-code-artifacta-publisher/SKILL.md)。维护者发布 CLI 的步骤见 [docs/CLI-RELEASE.md](docs/CLI-RELEASE.md)。

## REST API 示例

```bash
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $ARTIFACTA_API_KEY" \
  -F "name=销售看板" \
  -F "visibility=team" \
  -F "html_file=@./dashboard.zip" \
  -F "data_files=@./sales.csv"
```

完整路由、请求参数和响应格式见 [docs/API.md](docs/API.md)。稳定的 ZIP/Bundle 协议见 [docs/protocol/manifest-v1.md](docs/protocol/manifest-v1.md)。

## 示例

`examples/` 包含单文件 HTML 看板、带 CSS/JS/图片资源的 ZIP 看板、CSV/JSON 数据集、`mock_rows` 同步配置和 CLI 发布脚本：

```bash
export ARTIFACTA_URL=http://localhost:3000
export ARTIFACTA_API_KEY=art_live_...
bash examples/publish-example.sh
```

## 数据同步 Worker

Worker 会扫描开启了同步的数据集，判断是否到期，然后调用和 API 手动触发相同的同步执行器。

```bash
export ARTIFACTA_API_KEY=art_...
pnpm worker:once
node scripts/sync-worker.mjs --interval 60
```

当前同步执行器支持本地文件、上传目录文件、URL 拉取和 `mock_rows`。真实 COS/S3、Presto/Trino 客户端建议作为 connector adapter 加到同步执行器后面。

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
| `POSTGRES_URL` / `DATABASE_URL` | 未设置 | `DATA_DRIVER=postgres` 时的 Postgres 连接串。 |
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

- [docs/IMPLEMENTED-FEATURES.md](docs/IMPLEMENTED-FEATURES.md)：代码和文档同步清单，覆盖页面、API 路由、CLI、Worker、存储边界。
- [docs/DEVELOPMENT-ENVIRONMENT.md](docs/DEVELOPMENT-ENVIRONMENT.md)：记录 `fnm`、Node、`pnpm` 的开发环境要求，以及非交互 shell 没加载到环境时的处理方式。
- [docs/API.md](docs/API.md)：人工可读 API 文档；[docs/openapi/artifacta.v1.yaml](docs/openapi/artifacta.v1.yaml)：当前用于集成的部分 OpenAPI 契约。
- [docs/PRODUCT.md](docs/PRODUCT.md)：区分当前 MVP 已实现能力、路线图和企业扩展点。
- [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)、[CHANGELOG.md](CHANGELOG.md)：贡献、漏洞报告和变更记录要求。

## 当前边界

- 配置后可使用 OIDC 登录；SAML 仍保留为扩展点。
- SQLite 适合自托管试用；Postgres 元数据和 S3 兼容对象存储已经可作为生产化路径。
- Worker 支持本地文件、URL、`mock_rows`、S3/COS 对象和 Presto/Trino HTTP 同步分支。

## License

MIT. See [LICENSE](LICENSE).

# Artifacta

Artifacta 是一个面向企业团队的开源 BI 看板托管平台，核心场景是：你在本地用 coding agent、Python、SQL 或任意前端工具生成一个 HTML 看板，然后把它上传到 Artifacta，团队成员就可以通过权限受控的链接直接查看。

它不是想取代所有 BI 工具，而是补齐 AI 时代看板生产方式里的最后一公里：托管、分享、权限、数据集、API Key、CLI 和自动化更新。

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

```bash
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

完整路由、请求参数和响应格式见 [docs/API.md](docs/API.md)。

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
pnpm test:smoke   # 对运行中的服务做 API 冒烟测试
pnpm worker:once  # 执行一次同步 Worker
```

## 配置项

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | 生成预览链接和 API 链接时使用的公开地址。 |
| `AUTH_SECRET` | development fallback | Session 签名密钥，共享环境必须替换为强随机值。 |
| `DATA_DRIVER` | `json` | 可选 `json` 或 `sqlite`。 |
| `DATA_DIR` | `.artifacta` | 本地元数据目录，也是默认 SQLite 父目录。 |
| `SQLITE_PATH` | `.artifacta/artifacta.sqlite` | `DATA_DRIVER=sqlite` 时的数据库路径。 |
| `UPLOAD_DIR` | `.artifacta/uploads` | 上传的看板和数据集文件目录。 |

## 代码结构

- `app/`：Next.js App Router 页面、预览页和 REST API。
- `lib/server/`：认证、权限、数据库 adapter、文件存储、序列化、数据集解析和同步执行器。
- `packages/cli/`：对外发布的独立 CLI 包；`bin/artifacta.mjs` 保留为仓库内包装入口。
- `scripts/sync-worker.mjs`：基于 API Key 的同步 Worker。
- `.artifacta/`：本地运行数据，不提交到 Git。

更多实现计划见 [docs/PLAN.md](docs/PLAN.md)，部署说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 当前边界

- 企业 OIDC/SAML 仍是接入点；本地版本使用开发友好的邮箱登录。
- SQLite 适合自托管试用，下一步生产化应继续加入 Postgres 和对象存储 adapter。
- Worker 已具备执行框架，云对象存储和数仓连接器需要在 sync runner 后继续扩展。

## License

MIT. See [LICENSE](LICENSE).

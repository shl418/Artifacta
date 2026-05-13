# DataVision API 接口文档

## 概述

DataVision 提供 RESTful API 接口，支持通过编程方式管理项目、数据集和权限。Web 控制台使用 Cookie Session；外部自动化、CI/CD 和 Coding Agent 使用 API Key。

**Local Base URL:** `http://localhost:3000/api/v1`

**Production Base URL:** `https://<your-domain>/api/v1`

**认证方式:** Bearer Token
```
Authorization: Bearer <API_KEY>
```

### 当前开源 MVP 状态

- 已实现：登录、当前用户、项目 CRUD、HTML 上传/替换、HTML 预览渲染、文件夹、数据集上传/替换/删除、同步配置/触发/状态/历史、项目成员权限、团队成员、API Key。
- 已实现：ZIP 看板包解包、入口 HTML 渲染、CSS/JS/图片等静态资源托管。
- 已实现：`DATA_DRIVER=json|sqlite` 元数据持久化，SQLite adapter 带幂等迁移。
- 已实现：轻量 CLI、API-driven 同步 Worker、API smoke test。
- 已接入同步执行器：本地文件、上传目录文件、URL 拉取、`mock_rows`。COS/S3 和真实 Presto/Trino 客户端保留为 connector adapter。
- API 错误响应统一使用本文档底部的错误 envelope。

---

## 认证相关

### 获取当前用户信息

```
GET /auth/me
```

**响应示例:**
```json
{
  "id": "user_abc123",
  "email": "user@company.com",
  "name": "张三",
  "role": "admin",
  "organization_id": "org_xyz789",
  "created_at": "2024-01-15T08:00:00Z"
}
```

---

## 项目管理

### 创建项目

上传 HTML 看板及关联数据集，创建新项目。

```
POST /projects
```

**请求体 (multipart/form-data):**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| name | string | 是 | 项目名称 |
| description | string | 否 | 项目描述 |
| folder_id | string | 否 | 所属文件夹 ID |
| html_file | file | 是 | HTML 看板文件（单个 .html）或 ZIP 包 |
| data_files | file[] | 否 | 数据文件，支持多个。当前会对 CSV/JSON 做行列和字段解析，其他类型会按文件保存但不做结构化检查。 |
| visibility | string | 否 | 可见性: `private`, `team`, `public`，默认 `private` |

**支持的文件格式:**

- **单文件模式:** 直接上传 `.html` 文件
- **ZIP 包模式:** 上传包含以下内容的 `.zip` 文件：
  - `index.html` - 入口 HTML 文件（必需）
  - `*.js` - JavaScript 文件（可选，支持多个）
  - `*.css` - 样式文件（可选）
  - `assets/` - 静态资源目录（可选，如图片、字体等）

**请求示例:**

**示例 1: 单 HTML 文件**
```bash
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $API_KEY" \
  -F "name=销售月报" \
  -F "description=2024年1月销售数据看板" \
  -F "html_file=@dashboard.html" \
  -F "data_files=@sales.csv" \
  -F "visibility=team"
```

**示例 2: HTML + JS 资源包**
```bash
# 创建包含 HTML 和 JS 的 ZIP 包
zip -r dashboard.zip index.html chart.js utils.js styles.css assets/

# 上传 ZIP 包
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $API_KEY" \
  -F "name=交互式销售看板" \
  -F "html_file=@dashboard.zip" \
  -F "data_files=@sales.csv" \
  -F "data_files=@regions.csv" \
  -F "visibility=team" \
  -F "allowed_users[]=user_123" \
  -F "allowed_user_permissions[user_123]=edit"
```

**响应示例:**
```json
{
  "id": "proj_abc123",
  "name": "销售月报",
  "description": "2024年1月销售数据看板",
  "visibility": "team",
  "html_url": "https://cdn.datavision.io/projects/proj_abc123/index.html",
  "preview_url": "https://app.datavision.io/view/proj_abc123",
  "datasets": [
    {
      "id": "ds_001",
      "name": "sales.csv",
      "size": 245678,
      "rows": 1500
    },
    {
      "id": "ds_002", 
      "name": "regions.csv",
      "size": 12340,
      "rows": 50
    }
  ],
  "owner_id": "user_abc123",
  "created_at": "2024-01-20T10:30:00Z",
  "updated_at": "2024-01-20T10:30:00Z"
}
```

### 获取项目列表

```
GET /projects
```

**查询参数:**

| 参数 | 类型 | 描述 |
|------|------|------|
| page | number | 页码，默认 1 |
| per_page | number | 每页数量，默认 20，最大 100 |
| folder_id | string | 筛选文件夹，传 `null` 表示根目录 |
| visibility | string | 筛选可见性: `private`, `team`, `public` |
| owner_id | string | 筛选所有者 |
| search | string | 搜索项目名称和描述（全局搜索，包含文件夹内项目） |

**筛选逻辑说明:**

- `search` 和 `visibility` 为全局筛选，会应用于所有项目（包括文件夹内的）
- 当存在全局筛选时，返回的文件夹列表只包含有匹配项目的文件夹
- `folder_counts` 字段返回每个文件夹中匹配筛选条件的项目数量

**响应示例:**
```json
{
  "data": [
    {
      "id": "proj_abc123",
      "name": "销售月报",
      "description": "2024年1月销售数据看板",
      "visibility": "team",
      "folder_id": "folder_001",
      "preview_url": "https://app.datavision.io/view/proj_abc123",
      "owner": {
        "id": "user_abc123",
        "name": "张三",
        "initials": "张"
      },
      "datasets_count": 2,
      "views_count": 156,
      "created_at": "2024-01-15T08:00:00Z",
      "updated_at": "2024-01-20T10:30:00Z"
    }
  ],
  "folders": [
    {
      "id": "folder_001",
      "name": "销售分析",
      "project_count": 5
    },
    {
      "id": "folder_002", 
      "name": "用户增长",
      "project_count": 3
    }
  ],
  "folder_counts": {
    "folder_001": 5,
    "folder_002": 3,
    "root": 12
  },
  "pagination": {
    "page": 1,
    "per_page": 20,
    "total": 45,
    "total_pages": 3
  }
}
```

### 获取项目详情

```
GET /projects/:project_id
```

**响应示例:**
```json
{
  "id": "proj_abc123",
  "name": "销售月报",
  "description": "2024年1月销售数据看板",
  "visibility": "team",
  "html_url": "https://cdn.datavision.io/projects/proj_abc123/index.html",
  "preview_url": "https://app.datavision.io/view/proj_abc123",
  "datasets": [...],
  "permissions": [
    {
      "user_id": "user_123",
      "user_name": "李四",
      "permission": "edit"
    },
    {
      "user_id": "user_456",
      "user_name": "王五",
      "permission": "view"
    }
  ],
  "owner_id": "user_abc123",
  "created_at": "2024-01-20T10:30:00Z",
  "updated_at": "2024-01-20T10:30:00Z"
}
```

### 更新项目

```
PATCH /projects/:project_id
```

**请求体 (JSON):**
```json
{
  "name": "销售月报 - 更新版",
  "description": "2024年1月销售数据看板（修订）",
  "visibility": "public"
}
```

### 更新项目 HTML

替换项目的 HTML 看板文件。

```
PUT /projects/:project_id/html
```

**请求体 (multipart/form-data):**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| html_file | file | 是 | 新的 HTML 看板文件 |

### 渲染项目 HTML

用于 Web 端 iframe 预览。公开项目可匿名访问；私有/团队项目需要 Cookie Session 或 Bearer Token。

```
GET /projects/:project_id/html/render
```

**响应:** `text/html; charset=utf-8`

> 当前实现会对响应附加 CSP sandbox。单 HTML 文件直接渲染；ZIP 包会在上传时解包，入口 `index.html` 通过本接口渲染，相对路径 CSS/JS/图片资源会从 `/projects/:project_id/html/*` 受控路由加载。

### 删除项目

```
DELETE /projects/:project_id
```

**响应:** `204 No Content`

### 移动项目到文件夹

```
PATCH /projects/:project_id/folder
```

**请求体:**
```json
{
  "folder_id": "folder_001"
}
```

传 `null` 可将项目移出文件夹到根目录。

---

## 文件夹管理

### 获取文件夹列表

```
GET /folders
```

**响应示例:**
```json
{
  "data": [
    {
      "id": "folder_001",
      "name": "销售分析",
      "project_count": 5,
      "created_at": "2024-01-10T08:00:00Z"
    }
  ]
}
```

### 创建文件夹

```
POST /folders
```

**请求体:**
```json
{
  "name": "新文件夹"
}
```

### 重命名文件夹

```
PATCH /folders/:folder_id
```

**请求体:**
```json
{
  "name": "新名称"
}
```

### 删除文件夹

```
DELETE /folders/:folder_id
```

**查询参数:**

| 参数 | 类型 | 描述 |
|------|------|------|
| move_to | string | 文件夹内项目移动到的目标文件夹 ID，传 `root` 移动到根目录 |

> 如不指定 `move_to`，文件夹内的项目将被移动到根目录。

---

## 数据集管理

### 获取项目数据集列表

```
GET /projects/:project_id/datasets
```

### 上传/替换数据集

```
PUT /projects/:project_id/datasets/:dataset_id
```

**请求体 (multipart/form-data):**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| file | file | 是 | 数据文件 (CSV/Excel/JSON) |

### 添加数据集

```
POST /projects/:project_id/datasets
```

**请求体 (multipart/form-data):**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| file | file | 是 | 数据文件 |
| name | string | 否 | 数据集名称，默认使用文件名 |

### 删除数据集

```
DELETE /projects/:project_id/datasets/:dataset_id
```

---

## 数据同步配置

### 获取数据集同步配置

```
GET /projects/:project_id/datasets/:dataset_id/sync
```

**响应示例:**
```json
{
  "enabled": true,
  "source_type": "cos",
  "source_config": {
    "bucket": "my-bucket",
    "region": "ap-shanghai",
    "path": "/data/sales.csv"
  },
  "schedule": "0 8 * * *",
  "last_sync_at": "2024-01-20T08:00:00Z",
  "last_sync_status": "success",
  "next_sync_at": "2024-01-21T08:00:00Z"
}
```

### 配置数据集同步

```
PUT /projects/:project_id/datasets/:dataset_id/sync
```

**请求体 (JSON):**

当前 CLI 会把本地 JSON 文件直接传到 `source_config`，因此最适合和本地 skill / CI 一起使用。

**方式一：COS 对象存储**
```json
{
  "enabled": true,
  "source_type": "cos",
  "source_config": {
    "bucket": "my-bucket",
    "region": "ap-shanghai",
    "path": "/data/sales.csv",
    "secret_id": "AKIDxxxx",
    "secret_key": "xxxxxx"
  },
  "update_mode": "full",
  "schedule": "0 8 * * *"
}
```

**方式二：Presto SQL**
```json
{
  "enabled": true,
  "source_type": "presto",
  "source_config": {
    "host": "presto.company.com",
    "port": 8080,
    "catalog": "hive",
    "schema": "sales",
    "query": "SELECT * FROM daily_sales WHERE dt = current_date"
  },
  "update_mode": "incremental",
  "schedule": "0 9 * * *"
}
```

**方式三：手动上传 (禁用自动同步)**
```json
{
  "enabled": false,
  "source_type": "manual"
}
```

**update_mode 可选值:**
- `full` - 全量更新，每次同步完全替换现有数据
- `incremental` - 增量更新，每次同步追加新数据到现有数据集

**Schedule 格式:** Cron 表达式
- `0 8 * * *` - 每天 8:00
- `0 */6 * * *` - 每 6 小时
- `0 0 * * 1` - 每周一 0:00

### 手动触发同步

```
POST /projects/:project_id/datasets/:dataset_id/sync/trigger
```

**响应示例:**
```json
{
  "sync_id": "sync_abc123",
  "status": "pending",
  "started_at": "2024-01-20T14:30:00Z"
}
```

### 查询同步状态

```
GET /projects/:project_id/datasets/:dataset_id/sync/status
```

**响应示例:**
```json
{
  "sync_id": "sync_abc123",
  "status": "success",
  "started_at": "2024-01-20T14:30:00Z",
  "completed_at": "2024-01-20T14:30:45Z",
  "rows_synced": 1500,
  "error": null
}
```

### 获取同步历史

```
GET /projects/:project_id/datasets/:dataset_id/sync/history
```

**查询参数:**

| 参数 | 类型 | 描述 |
|------|------|------|
| page | number | 页码，默认 1 |
| per_page | number | 每页数量，默认 20 |

**响应示例:**
```json
{
  "data": [
    {
      "sync_id": "sync_abc123",
      "status": "success",
      "started_at": "2024-01-20T14:30:00Z",
      "completed_at": "2024-01-20T14:30:45Z",
      "rows_synced": 1500,
      "update_mode": "full",
      "error": null
    },
    {
      "sync_id": "sync_abc122",
      "status": "failed",
      "started_at": "2024-01-19T14:30:00Z",
      "completed_at": "2024-01-19T14:30:10Z",
      "rows_synced": 0,
      "update_mode": "full",
      "error": "Connection timeout: Unable to connect to COS bucket"
    }
  ],
  "pagination": {...}
}
```

---

## 权限管理

### 获取项目权限列表

```
GET /projects/:project_id/permissions
```

**响应示例:**
```json
{
  "visibility": "team",
  "owner": {
    "id": "user_abc123",
    "name": "张三",
    "email": "zhangsan@company.com"
  },
  "members": [
    {
      "user_id": "user_123",
      "user_name": "李四",
      "user_email": "lisi@company.com",
      "permission": "edit",
      "added_at": "2024-01-20T10:30:00Z"
    },
    {
      "user_id": "user_456",
      "user_name": "王五",
      "user_email": "wangwu@company.com", 
      "permission": "view",
      "added_at": "2024-01-20T11:00:00Z"
    }
  ]
}
```

### 添加项目成员

```
POST /projects/:project_id/permissions
```

**请求体:**
```json
{
  "user_email": "newuser@company.com",
  "permission": "view"
}
```

**permission 可选值:**
- `view` - 可查看
- `edit` - 可编辑（可更新数据集、触发同步）

### 更新成员权限

```
PATCH /projects/:project_id/permissions/:user_id
```

**请求体:**
```json
{
  "permission": "edit"
}
```

### 移除成员

```
DELETE /projects/:project_id/permissions/:user_id
```

---

## 团队管理

### 获取团队成员列表

```
GET /team/members
```

**响应示例:**
```json
{
  "data": [
    {
      "id": "user_abc123",
      "name": "张三",
      "email": "zhangsan@company.com",
      "role": "admin",
      "status": "active",
      "projects_count": 12,
      "joined_at": "2024-01-01T00:00:00Z"
    }
  ],
  "pagination": {...}
}
```

### 邀请成员

```
POST /team/invitations
```

**请求体:**
```json
{
  "email": "newuser@company.com",
  "role": "member"
}
```

**role 可选值:**
- `admin` - 管理员，可管理所有项目和成员
- `member` - 普通成员，可创建项目并管理自己的项目

### 更新成员角色

```
PATCH /team/members/:user_id
```

**请求体:**
```json
{
  "role": "admin"
}
```

### 移除成员

```
DELETE /team/members/:user_id
```

---

## API Key 管理

### 获取 API Key 列表

```
GET /api-keys
```

### 创建 API Key

```
POST /api-keys
```

**请求体:**
```json
{
  "name": "CI/CD Pipeline",
  "expires_at": "2025-01-01T00:00:00Z"
}
```

**响应示例:**
```json
{
  "id": "key_abc123",
  "name": "CI/CD Pipeline",
  "key": "dv_live_xxxxxxxxxxxxxxxxxxxx",
  "created_at": "2024-01-20T10:00:00Z",
  "expires_at": "2025-01-01T00:00:00Z"
}
```

> ⚠️ 注意: API Key 仅在创建时返回一次，请妥善保存。

### 删除 API Key

```
DELETE /api-keys/:key_id
```

---

## 错误响应

所有错误响应遵循以下格式：

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "请求参数错误",
    "details": {
      "field": "name",
      "reason": "名称不能为空"
    }
  }
}
```

**常见错误码:**

| HTTP 状态码 | 错误码 | 描述 |
|-------------|--------|------|
| 400 | INVALID_REQUEST | 请求参数错误 |
| 401 | UNAUTHORIZED | 未认证或 Token 无效 |
| 403 | FORBIDDEN | 无权限访问该资源 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 资源冲突（如名称重复） |
| 413 | PAYLOAD_TOO_LARGE | 上传文件过大 |
| 429 | RATE_LIMITED | 请求频率超限 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

---

## 速率限制

- 默认: 100 请求/分钟
- 上传接口: 10 请求/分钟
- 同步触发: 5 请求/分钟

超出限制后返回 `429 Too Many Requests`，响应头包含：
- `X-RateLimit-Limit`: 限制数量
- `X-RateLimit-Remaining`: 剩余数量
- `X-RateLimit-Reset`: 重置时间戳

---

## Webhook (可选)

支持配置 Webhook 接收事件通知。

### 配置 Webhook

```
POST /webhooks
```

**请求体:**
```json
{
  "url": "https://your-server.com/webhook",
  "events": ["project.created", "sync.completed", "sync.failed"],
  "secret": "your-webhook-secret"
}
```

### 事件类型

- `project.created` - 项目创建
- `project.updated` - 项目更新
- `project.deleted` - 项目删除
- `sync.started` - 同步开始
- `sync.completed` - 同步完成
- `sync.failed` - 同步失败

### Webhook 请求格式

```json
{
  "event": "sync.completed",
  "timestamp": "2024-01-20T14:30:45Z",
  "data": {
    "project_id": "proj_abc123",
    "dataset_id": "ds_001",
    "sync_id": "sync_abc123",
    "rows_synced": 1500
  }
}
```

请求头包含签名用于验证：
```
X-DataVision-Signature: sha256=xxxxxx
```

---

## CLI 工具

当前仓库有两种 CLI 使用方式：

- 仓库内开发：`pnpm cli -- ...`
- 对外发布包：`packages/cli`，发布后包名为 `@datavision/cli`

零仓库终端用户接入流程见 `docs/ONBOARDING.md` / `docs/ONBOARDING.zh-CN.md`。Claude Code skill 模板见 `templates/claude-code-datavision-publisher/SKILL.md`。

### 认证配置

```bash
export DATAVISION_URL=http://localhost:3000
export DATAVISION_API_KEY=dv_live_xxxxxxxxxxxx
```

发布到 npm 后，外部用户可以不克隆仓库，直接运行：

```bash
npx @datavision/cli@latest --help
```

### 常用命令

**列出项目**
```bash
pnpm cli -- projects list
pnpm cli -- projects list --search 销售
```

**创建或更新项目 HTML**
```bash
pnpm cli -- projects upload \
  --file ./dashboard.zip \
  --name "AI 生成的销售分析" \
  --description "由 coding agent 生成" \
  --data-file ./sales-data.csv \
  --visibility team

pnpm cli -- projects update-html \
  --project-id proj_abc123 \
  --file ./dashboard-v2.zip
```

**列出数据集**
```bash
pnpm cli -- datasets list
pnpm cli -- datasets list --source presto
```

**上传 / 替换数据集**
```bash
pnpm cli -- datasets upload \
  --project-id proj_abc123 \
  --file ./sales-data.csv \
  --name "销售明细"

pnpm cli -- datasets replace \
  --project-id proj_abc123 \
  --dataset-id ds_001 \
  --file ./sales-data-v2.csv
```

**提交同步配置**
```bash
pnpm cli -- datasets sync set \
  --project-id proj_abc123 \
  --dataset-id ds_001 \
  --source-type presto \
  --config-file ./sync.json
```

**触发数据同步**
```bash
pnpm cli -- sync trigger --project-id proj_abc123 --dataset-id ds_001
```

### 同步 Worker

Worker 使用相同 API Key，从 `/datasets` 读取启用同步的数据集，并调用 `/sync/trigger`。

```bash
export DATAVISION_API_KEY=dv_live_xxxxxxxxxxxx
pnpm worker:once
node scripts/sync-worker.mjs --interval 300
```

### API Smoke Test

对运行中的本地服务做端到端冒烟测试：

```bash
pnpm dev
pnpm test:smoke
```

该脚本会登录、创建 API Key、上传临时 ZIP 看板、验证 HTML 与静态资源渲染、配置 `mock_rows` 同步、触发同步，并清理临时项目。

### 在 Coding Agent 中使用

```bash
# 1. Agent 读取 CSV/JSON 并生成 dashboard.zip
# 2. Agent 上传到 DataVision
pnpm cli -- projects upload \
  --file ./dashboard.zip \
  --name "AI 生成的增长周报" \
  --data-file ./source.csv \
  --visibility team

# 3. Agent 给数据集写同步配置
pnpm cli -- datasets sync set \
  --project-id proj_abc123 \
  --dataset-id ds_001 \
  --source-type presto \
  --config-file ./sync.json
```

### CI/CD 集成示例

```yaml
- name: Deploy Dashboard
  env:
    DATAVISION_URL: https://datavision.example.com
    DATAVISION_API_KEY: ${{ secrets.DATAVISION_API_KEY }}
  run: |
    pnpm install --frozen-lockfile
    pnpm cli -- projects upload \
      --file ./dist/dashboard.zip \
      --name "Build Report #${{ github.run_number }}" \
      --data-file ./dist/data.csv \
      --visibility team
```

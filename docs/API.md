# Artifacta API 接口文档

## 概述

Artifacta 提供 RESTful API 接口，支持通过编程方式管理项目、数据集和权限。Web 控制台使用 Cookie Session；外部自动化、CI/CD 和 Coding Agent 使用 API Key。

**Local Base URL:** `http://localhost:3000/api/v1`

**Production Base URL:** `https://<your-domain>/api/v1`

**认证方式:** Bearer Token
```
Authorization: Bearer <API_KEY>
```

### 当前开源 MVP 状态

- 已实现：登录、当前用户、项目 CRUD、HTML 上传/替换、HTML 预览渲染、文件夹、数据集上传/替换/删除、数据集同步配置/状态/历史（数据集动态来源已移除，`test`/`trigger` 返回 410）、项目成员权限、团队成员、API Key。
- 已实现：ZIP 看板包解包、入口 HTML 渲染、CSS/JS/图片等静态资源托管；ZIP **创建/更新** 统一走上传会话（`upload_session_id`），不再接受 `POST /projects` 或 `PUT /html` 直接传 ZIP。
- 已实现：包内 `artifacta.json` 导入（`sync_scripts`、数据集绑定）；合法用户 manifest 在提交时**不会被服务端覆盖**。无 manifest 时按扩展名自动登记包内数据文件。
- 已实现：Bundle 脚本同步（`sync_scripts`）：平台在解包目录内执行 Python/Node 脚本，一次运行可更新多个 `outputs` 路径。
- 已实现：`DATA_DRIVER=json|sqlite|postgres` 元数据持久化，SQLite adapter 带幂等迁移；`postgres` 当前为单行 JSONB blob（PoC，无行级索引，不建议生产）。
- 已实现：`STORAGE_DRIVER=local|s3`，可使用 S3/COS/R2/MinIO 兼容对象存储保存看板和数据集文件。
- 已实现：轻量 CLI、`--json` 输出、`artifacta doctor`、API-driven 同步 Worker、API smoke test。
- 已接入同步执行器：项目级 `sync_scripts`（解包目录内运行 Python/Node 脚本，手动触发）。按数据集的 URL / S3 / Presto 外部同步已移除。
- 已实现：审计日志、Webhook、数据集预览、版本记录、嵌入 token 和 OIDC 登录入口。
- 已实现：桌面端入口 HTML 纯文字在线编辑、本地草稿、不可变 artifact revision、文字级版本记录和三方冲突合并。
- API 错误响应统一使用本文档底部的错误 envelope。

### OpenAPI

OpenAPI 3.1 描述文件位于 [`docs/openapi/artifacta.v1.yaml`](./openapi/artifacta.v1.yaml)，覆盖当前公开 API。`pnpm test:api-contract` 会检查实现清单中的公开路由是否出现在 OpenAPI 中。

---

## 认证相关

### 登录并创建 Web Session

```
POST /auth/login
```

**请求体:**
```json
{
  "email": "admin@artifacta.local",
  "name": "Admin"
}
```

当前开源版本使用开发友好的邮箱登录：若邮箱不存在，会在默认组织中创建用户；第一个用户为 `admin`，后续用户默认为 `member`。成功后响应会设置 `artifacta_session` HTTP-only Cookie。

**响应示例:**
```json
{
  "user": {
    "id": "user_abc123",
    "email": "admin@artifacta.local",
    "name": "Admin",
    "role": "admin",
    "status": "active",
    "organization_id": "org_xyz789"
  }
}
```

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

响应包含 `auth_type`，取值为 `session` 或 `api_key`。

### 退出登录

```
POST /auth/logout
```

清空 `artifacta_session` Cookie，响应 `{ "ok": true }`。

---

## 项目管理

### 创建项目

上传 HTML 看板或 ZIP 看板包，创建新项目。

```
POST /projects
```

**请求体 (multipart/form-data):**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| name | string | 是 | 项目名称 |
| description | string | 否 | 项目描述 |
| folder_id | string | 否 | 所属文件夹 ID |
| html_file | file | 条件 | 单个 `.html` 看板（与 `upload_session_id` 二选一） |
| upload_session_id | string | 条件 | 由 `POST /upload-sessions` 返回；**ZIP 看板包必须使用此字段** |
| visibility | string | 否 | 可见性: `private`, `team`, `public`，默认 `private` |

**支持的文件格式:**

- **单 HTML 模式:** `html_file` 为 `.html`（仅适合内联数据；若看板 `fetch()` 相对路径数据文件，请使用 ZIP）
- **ZIP 包模式（推荐）:** 必须先 `POST /upload-sessions`，再本接口传 `upload_session_id`（见「上传会话」）
  - 包内需有 `index.html`（或由 `artifacta.json` 的 `entrypoint` 指定）
  - 数据文件放在 ZIP 内；可选 `artifacta.json` 声明 `datasets`、`sync_scripts`（协议见 `docs/protocol/manifest-v1.md`）。无 manifest 时服务端按扩展名自动登记包内数据文件
  - 直接 `html_file=@bundle.zip` 会返回 `400 DEPRECATED`

**请求示例:**

**示例 1: 单 HTML 文件**
```bash
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $API_KEY" \
  -F "name=销售月报" \
  -F "description=2024年1月销售数据看板" \
  -F "html_file=@dashboard.html" \
  -F "visibility=team"
```

**示例 2: ZIP 看板包（上传会话 + manifest 自动导入）**
```bash
# 1. 创建上传会话
SESSION=$(curl -s -X POST http://localhost:3000/api/v1/upload-sessions \
  -H "Authorization: Bearer $API_KEY" \
  -F "file=@dashboard.zip" | jq -r .session_id)

# 2. 提交项目（包内数据由 artifacta.json 或自动发现登记）
curl -X POST http://localhost:3000/api/v1/projects \
  -H "Authorization: Bearer $API_KEY" \
  -F "name=交互式销售看板" \
  -F "upload_session_id=$SESSION" \
  -F "visibility=team"
```

**响应示例:**
```json
{
  "id": "proj_abc123",
  "name": "销售月报",
  "description": "2024年1月销售数据看板",
  "visibility": "team",
      "html_url": "http://localhost:3000/api/v1/projects/proj_abc123/html/render",
      "preview_url": "http://localhost:3000/view/proj_abc123",
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
      "preview_url": "http://localhost:3000/view/proj_abc123",
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
  "html_url": "http://localhost:3000/api/v1/projects/proj_abc123/html/render",
  "preview_url": "http://localhost:3000/view/proj_abc123",
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

替换项目的 **单个 HTML** 看板文件。ZIP 包更新请使用上传会话并在 `POST /upload-sessions` 中传入 `project_id`。

```
PUT /projects/:project_id/html
```

**请求体 (multipart/form-data):**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| html_file | file | 是 | 新的 `.html` 看板文件（**不支持 `.zip`**，ZIP 返回 `400 DEPRECATED`） |

### 渲染项目 HTML

用于 Web 端 iframe 预览。公开项目可匿名访问；私有/团队项目需要 Cookie Session 或 Bearer Token。

```
GET /projects/:project_id/html/render
```

**响应:** `text/html; charset=utf-8`

> 当前实现会对响应附加 CSP sandbox。单 HTML 文件直接渲染；ZIP 包会在上传时解包，入口 `index.html` 通过本接口渲染，相对路径 CSS/JS/图片资源会从 `/projects/:project_id/html/*` 受控路由加载。

### 在线编辑 HTML 文字

在线编辑只接受能够映射回入口 HTML 源码的纯文本节点。JavaScript 动态文字、SVG、Canvas、富文本结构和新增换行不在 V1 范围内。

先创建编辑会话：

```http
POST /projects/:project_id/text-editor/session
```

响应包含 `base_revision_id`、sandbox 编辑地址 `edit_url` 和浏览器草稿键 `draft_key`。提交文字修改：

```http
PUT /projects/:project_id/text-edits
Content-Type: application/json

{
  "base_revision_id": "artrev_...",
  "edits": [
    {
      "text_key": "a1b2c3...",
      "before": "季度销售概览",
      "after": "Q3 销售概览"
    }
  ],
  "notes": "更新季度标题"
}
```

如果当前 revision 已变化，接口返回 `409 MERGE_REQUIRED`，其中 `details` 包含 `latest_revision_id`、可自动合并的 `automatic_changes` 和需要人工处理的 `conflicts`。解决全部冲突后提交：

```http
POST /projects/:project_id/text-edits/merge
Content-Type: application/json

{
  "base_revision_id": "artrev_base",
  "latest_revision_id": "artrev_latest",
  "edits": [...],
  "resolutions": [
    {
      "conflict_id": "conflict_...",
      "choice": "yours"
    }
  ]
}
```

`choice` 支持 `latest`、`yours` 和 `manual`；`manual` 需同时提供最终纯文字 `value`。提交时若最新版再次变化，会再次返回 `409`，避免覆盖其他人的发布。

### 读取 ZIP 看板静态资源

```
GET /projects/:project_id/html/:asset_path
```

该接口为 ZIP 看板包中的 CSS、JS、图片、字体等静态资源提供受权限保护的访问。公开项目可匿名读取；私有/团队项目需要 Cookie Session 或 Bearer Token。响应会带原始资源的 `Content-Type` 和 `Cache-Control: public, max-age=300`。

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

### 获取当前组织可见数据集列表

```
GET /datasets
```

**查询参数:**

| 参数 | 类型 | 描述 |
|------|------|------|
| source | string | 按同步来源筛选：`manual` 或 `all`（动态来源已移除，数据集统一为 `manual`） |
| search | string | 搜索数据集名称和描述 |

**响应示例:**
```json
{
  "data": [
    {
      "id": "ds_001",
      "project_id": "proj_abc123",
      "name": "sales.csv",
      "file_type": "csv",
      "rows": 1500,
      "columns": 8,
      "origin": "upload",
      "sync_config": {
        "enabled": false,
        "source_type": "manual",
        "source_config": {},
        "update_mode": "full",
        "schedule": null
      },
      "project": {
        "id": "proj_abc123",
        "name": "销售月报"
      }
    }
  ]
}
```

### 获取项目数据集列表

```
GET /projects/:project_id/datasets
```

### 获取单个数据集

```
GET /projects/:project_id/datasets/:dataset_id
```

公开项目的数据集可匿名读取；私有/团队项目需要有查看权限。

### 上传/替换数据集

```
PUT /projects/:project_id/datasets/:dataset_id
```

**请求体 (multipart/form-data):**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| file | file | 是 | 数据文件。当前会解析 CSV/JSON 元数据，其他类型按文件保存。 |

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

## 上传会话

上传会话是 **ZIP 看板创建与更新的标准路径**：先上传 ZIP、读取文件树，再提交项目。单文件 HTML 仍可直接 `POST /projects` 传 `html_file`。

### 创建上传会话

```
POST /upload-sessions
```

**请求体 (multipart/form-data):**

| 字段 | 类型 | 必填 | 描述 |
|------|------|------|------|
| file | file | 是 | ZIP 看板包 |
| project_id | string | 否 | 更新已有项目时传入，用于标注已存在的数据集匹配关系 |

**响应示例:**
```json
{
  "session_id": "upload_abc123",
  "file_tree": [
    {
      "path": "index.html",
      "size": 1024,
      "extension": "html",
      "inferred_dataset": false
    },
    {
      "path": "data/sales.csv",
      "size": 2048,
      "extension": "csv",
      "inferred_dataset": true,
      "existing_dataset_id": "ds_001",
      "current_refresh": "manual"
    }
  ],
  "expires_at": "2026-05-21T12:30:00.000Z",
  "manifest_detected": true
}
```

`manifest_detected` 为 `true` 时表示 ZIP 根目录存在 `artifacta.json`；提交项目时服务端会按其 `datasets` / `sync_scripts` 登记，无需客户端再传数据集配置。

### 使用上传会话创建项目

```
POST /projects
```

传 `upload_session_id` 替代 `html_file`。

**表单字段（multipart）:** `name`, `description`, `visibility`, `folder_id`（与直接创建相同）。包内数据集由 `artifacta.json` 驱动，或按 `.csv` / `.json` 等扩展名自动发现。`refresh: "sync"` 须在 manifest 中声明，会在导入时启用同步并参与重传时的路径保护。

**更新已有 ZIP 项目:** `POST /upload-sessions` 时增加 `project_id=proj_xxx`，再 `POST /projects` 提交相同 `upload_session_id`。已启用同步的数据集路径与已启用脚本的 `outputs` 在解包时会被跳过，避免覆盖远端刷新结果。

---

## Bundle 同步脚本（sync_scripts）

当 ZIP 内 `artifacta.json` 声明 `sync_scripts` 时，服务端会为项目创建 `ProjectSyncScript` 记录。脚本在解包目录（`projects/:id/bundle`）内执行，是当前**唯一**的数据集动态更新方式（按数据集的 URL/COS/Presto 同步已移除）。

执行环境变量（子进程）:

| 变量 | 含义 |
|------|------|
| `ARTIFACTA_BUNDLE_ROOT` | 解包根目录绝对路径 |
| `ARTIFACTA_OUTPUT_PATHS` | 逗号分隔的输出相对路径 |
| `ARTIFACTA_SCRIPT_ID` | manifest 中的脚本 `id` |
| `ARTIFACTA_SOURCE_CONFIG` | 服务端 JSON 字符串（密钥仅存服务端，不进 ZIP） |

### 列出项目脚本

```
GET /projects/:project_id/sync-scripts
```

**响应:** `{ "data": [ { "id", "manifest_id", "script_path", "runtime", "outputs", "schedule", "enabled", "source_config", "last_run_at", "last_run_status", "next_run_at", ... } ] }`。当前手动触发版本中 `schedule` / `next_run_at` 固定为 `null`，字段仅为协议兼容保留。

项目详情 `GET /projects/:id` 的 `sync_scripts` 字段内容相同。

### 更新脚本配置（服务端覆盖）

```
PUT /projects/:project_id/sync-scripts/:script_id
```

**请求体 (JSON):** 可选 `enabled`, `outputs`（须为已绑定 bundle 数据集路径）, `source_config`。

重传 ZIP 时会更新 `script_path` / `runtime` / `outputs`，并保留已有 `source_config` 与 `enabled` 状态。当前版本仅支持手动触发，不执行 cron。

### 测试脚本（不写盘）

```
POST /projects/:project_id/sync-scripts/:script_id/test
```

校验脚本路径在 bundle 内且文件存在；不执行写操作。

### 触发脚本同步

```
POST /projects/:project_id/sync-scripts/:script_id/trigger
```

**响应:** `202` + `{ "job_id", "status": "queued" }`。同一项目同时最多一个 `queued` 或 `running` 脚本任务。

### 脚本运行状态与历史

```
GET /projects/:project_id/sync-scripts/:script_id/status
GET /projects/:project_id/sync-scripts/:script_id/history
```

历史记录 `outputs` 数组包含每个输出路径的 `dataset_id`、`rows_synced`、`status`、`error`。

### Worker 领取脚本任务

```
POST /sync/script-jobs/claim
```

领取后在本机执行 `runScriptSync`（Python 3 或 Node）。Worker 只 drain 脚本队列；按数据集的同步队列已移除（见 `scripts/sync-worker.mjs`）。

**权限:** `trigger`、`claim`、`PUT` 配置需要 API Key scope `sync:run`（或管理员会话）。

---

## 数据同步配置（按数据集，manual-only）

> 数据集默认是静态数据。按数据集的外部动态来源（URL / COS / Presto）已移除——动态更新请使用项目级 [Bundle 同步脚本](#bundle-同步脚本sync_scripts)。下列端点保留为兼容入口：`GET/PUT` 只读写一个 `manual` 静态配置，`status`/`history` 读取历史运行，`test`/`trigger` 返回 `410 SYNC_REMOVED`。

### 获取数据集同步配置

```
GET /projects/:project_id/datasets/:dataset_id/sync
```

**响应示例:**
```json
{
  "enabled": false,
  "source_type": "manual",
  "source_config": {},
  "schedule": null,
  "last_sync_at": null,
  "last_sync_status": null,
  "next_sync_at": null
}
```

### 配置数据集同步

```
PUT /projects/:project_id/datasets/:dataset_id/sync
```

`source_type` 仅接受 `manual`；其它取值返回 `400 INVALID_REQUEST`。请求只会把数据集落为静态（`enabled: false`）配置。

**请求体 (JSON):**
```json
{
  "enabled": false,
  "source_type": "manual"
}
```

### 测试 / 触发同步（已移除）

```
POST /projects/:project_id/datasets/:dataset_id/sync/test
POST /projects/:project_id/datasets/:dataset_id/sync/trigger
```

`test` 返回提示信息，`trigger` 返回 `410 SYNC_REMOVED`，二者都引导用户改用项目同步脚本并手动触发。

### Worker 领取同步任务（已停用）

```
POST /sync/jobs/claim
```

按数据集的同步队列已移除，该端点恒返回 `{ "job": null }`。Worker 实际只领取脚本任务（`POST /sync/script-jobs/claim`）。

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
      "error": "拉取远程数据失败：500"
    }
  ],
  "pagination": {...},
  "jobs": [
    {
      "job_id": "job_abc123",
      "status": "success",
      "trigger": "manual",
      "created_at": "2024-01-20T14:29:59Z",
      "started_at": "2024-01-20T14:30:00Z",
      "completed_at": "2024-01-20T14:30:45Z",
      "error": null
    }
  ]
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

`POST /team/members` 也支持相同请求体；两者都会创建或重新激活成员。仅管理员可调用。

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
  "role": "admin",
  "status": "active"
}
```

`role` 可选 `admin` 或 `member`；`status` 可选 `active`、`pending`、`disabled`。

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
  "key": "art_live_xxxxxxxxxxxxxxxxxxxx",
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

## 控制台统计

### 获取首页统计

```
GET /stats
```

**响应示例:**
```json
{
  "stats": {
    "projects": 8,
    "datasets": 12,
    "members": 3,
    "views": 156
  },
  "recent_projects": [],
  "popular_projects": []
}
```

`recent_projects` 和 `popular_projects` 使用项目摘要格式，分别返回最多 5 条。

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
| 500 | INTERNAL_ERROR | 服务器内部错误 |

---

## 尚未实现但预留的能力

以下能力属于后续生产化扩展点：SAML SSO、MySQL 元数据 adapter、关系型 Postgres（当前为单行 JSONB blob）、脚本子进程出站网络 allowlist、完整 5 段 cron 调度、公开链接密码保护、项目所有者转移。（速率限制、Webhook、OIDC、S3/COS 对象存储已实现。按数据集的 URL/COS/Presto 同步已移除，动态更新改用 bundle 同步脚本。）

---

## CLI 工具

当前仓库有两种 CLI 使用方式：

- 仓库内开发：`pnpm cli -- ...`
- 对外 npm 包：[`@artifacta/cli`](https://www.npmjs.com/package/@artifacta/cli)（源码位于 `packages/cli`）

零仓库终端用户接入流程见 `docs/ONBOARDING.md` / `docs/ONBOARDING.zh-CN.md`。`artifacta-publisher` skill 见 `skills/artifacta-publisher/SKILL.md`。

### 认证配置

```bash
export ARTIFACTA_URL=http://localhost:3000
export ARTIFACTA_API_KEY=art_live_xxxxxxxxxxxx
```

外部用户无需克隆仓库，直接运行：

```bash
npx @artifacta/cli@latest --help
```

### 常用命令

**列出项目**
```bash
pnpm cli -- projects list
pnpm cli -- projects list --search 销售
```

**创建或更新项目**
```bash
# ZIP：CLI 自动走 upload-sessions（数据文件放在 ZIP 内）
pnpm cli -- projects upload \
  --file ./dashboard.zip \
  --name "AI 生成的销售分析" \
  --visibility team

# 单 HTML（仅内联数据）
pnpm cli -- projects upload \
  --file ./dashboard.html \
  --name "单页看板"

pnpm cli -- projects update-html \
  --project-id proj_abc123 \
  --file ./dashboard-v2.zip
```

**Bundle 脚本同步**
```bash
pnpm cli -- sync-scripts list --project-id proj_abc123
pnpm cli -- sync-scripts trigger --project-id proj_abc123 --script-id sscript_abc123
pnpm cli -- sync-scripts set --project-id proj_abc123 --script-id sscript_abc123 \
  --config-file ./script-secrets.json

# 本地调试脚本（不调用 API）
pnpm cli -- bundle run-script \
  --file ./scripts/sync.py \
  --bundle-root ./dist \
  --outputs data/sales.csv
```

**列出数据集**
```bash
pnpm cli -- datasets list
pnpm cli -- datasets list --source manual
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

**触发 bundle 脚本同步（数据集动态更新的唯一方式）**
```bash
pnpm cli -- sync-scripts trigger --project-id proj_abc123 --script-id sscript_abc123
pnpm cli -- sync-scripts status --project-id proj_abc123 --script-id sscript_abc123
```

> 按数据集的 `datasets sync set --source-type` 与 `sync trigger` 已弃用：来源仅支持 `manual`，`sync trigger` 命中 `410 SYNC_REMOVED`。

**Doctor 与 JSON 输出**
```bash
pnpm cli -- doctor
pnpm cli -- --json projects list
```

### 同步 Worker

Worker 使用 API Key 只领取一类任务：

1. `POST /sync/script-jobs/claim` — 执行排队中的 bundle 脚本同步任务

按数据集的同步队列（`/sync/jobs/claim`）及到期调度已移除。脚本同步需要运行环境安装 **Python 3**（`ARTIFACTA_PYTHON` 可覆盖解释器路径）。

```bash
export ARTIFACTA_API_KEY=art_live_xxxxxxxxxxxx
export ARTIFACTA_PYTHON=python3
pnpm worker:once
node scripts/sync-worker.mjs --interval 300
```

### API Smoke Test

对运行中的本地服务做端到端冒烟测试：

```bash
pnpm dev
pnpm test:smoke
```

该脚本会登录、创建 API Key、上传临时 ZIP 看板、验证 HTML 与静态资源渲染、校验数据集同步配置为 `manual`（`trigger` 返回 410、`jobs/claim` 返回 null）、预览、版本与嵌入 token，并清理临时项目。

### 在 Coding Agent 中使用

```bash
# 1. Agent 读取 CSV/JSON 并生成 dashboard.zip
# 2. Agent 上传到 Artifacta
pnpm cli -- projects upload \
  --file ./dashboard.zip \
  --name "AI 生成的增长周报" \
  --visibility team

# 3. 需要动态更新数据时，触发 bundle 内的同步脚本
pnpm cli -- sync-scripts trigger \
  --project-id proj_abc123 \
  --script-id sscript_abc123
```

## 生产化与运维 API

### 数据集预览与版本

```http
GET /projects/:project_id/datasets/:dataset_id/preview
GET /projects/:project_id/datasets/:dataset_id/versions
```

预览会返回 `parsed`、`schema`、`rows` 和 `sample_size`。CSV、TSV、JSON、JSONL 会结构化展示样例；XLSX、Parquet 等文件会明确返回 `parsed: false`，表示已保存但不结构化解析。

### 项目版本与回滚

```http
GET /projects/:project_id/versions
POST /projects/:project_id/versions/:version_id/rollback
```

版本响应包含 `version`、`artifact`、`created_by`、`created_at` 和 `notes`。

### 嵌入 Token

```http
POST /projects/:project_id/embed-token
```

需要项目编辑权限。响应包含 `token`、`embed_url` 和 `expires_in_seconds`。嵌入页继续使用 sandboxed iframe，私有项目必须通过 token 或正常登录访问。

### Webhook 与审计日志

```http
GET /webhooks
POST /webhooks
PATCH /webhooks/:webhook_id
DELETE /webhooks/:webhook_id
GET /audit-logs
```

Webhook 支持 `project.created`、`project.updated`、`project.deleted`、`permission.changed`、`sync.success`、`sync.failed`。投递签名位于 `X-Artifacta-Signature`，格式为 `sha256=<hex>`。

## OpenAPI

The checked OpenAPI contract lives at `docs/openapi/artifacta.v1.yaml`. Use `pnpm test:api-contract` as the compatibility gate for CLI, client, and agent integrations.

### CI/CD 集成示例

```yaml
- name: Deploy Dashboard
  env:
    ARTIFACTA_URL: https://artifacta.example.com
    ARTIFACTA_API_KEY: ${{ secrets.ARTIFACTA_API_KEY }}
  run: |
    pnpm install --frozen-lockfile
    pnpm cli -- projects upload \
      --file ./dist/dashboard.zip \
      --name "Build Report #${{ github.run_number }}" \
      --visibility team
```

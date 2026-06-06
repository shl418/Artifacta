# Runtime Verification & Feature Review — 2026-06-06

逐项排查运行时环境与每个功能点的执行结果。本文档记录排查过程的中间产物。

## 0. 环境信息

| 项 | 值 |
| --- | --- |
| Node | v22.22.2 (`/opt/node22/bin/node`) — 满足 `engines >=22 <25` |
| pnpm | 11.1.3 — 匹配 `packageManager` |
| Python | 3.11.15（脚本同步运行时可用） |
| 安装方式 | `pnpm install --frozen-lockfile`（exit 0，591 个包，`better-sqlite3` native binding 加载正常） |
| 环境文件 | `cp .env.example .env.local`（默认 JSON 存储、本地文件存储） |

> 注：README/`docs/DEVELOPMENT-ENVIRONMENT.md` 写的是 Node `24.16.0` + `fnm`，本机用的是 `/opt/node22` 的 Node 22，仍在受支持区间内（`>=22 <25`），所有命令通过。

## 1. 静态检查与构建

| 功能点 | 命令 | 结果 |
| --- | --- | --- |
| TypeScript 类型检查 | `pnpm typecheck` | ✅ exit 0 |
| ESLint | `pnpm lint` | ✅ exit 0 |
| 生产构建 | `pnpm build` | ✅ exit 0（46 个 API 路由 + 页面全部产出） |
| 客户端包构建 | `pnpm client:build` | ✅ exit 0 |

## 2. 测试套件

| 套件 | 命令 | 结果 |
| --- | --- | --- |
| 单元测试（18 个脚本） | `pnpm test:unit` | ✅ 全部通过 |
| 安全测试（4 个脚本） | `pnpm test:security` | ✅ 全部通过 |
| API 合同覆盖 | `pnpm test:api-contract` | ✅ 46 个公开路由覆盖通过 |
| 客户端包测试 | `pnpm test:client` | ✅ 通过 |

## 3. 端到端 Smoke Test（运行中服务）

服务以 `pnpm start`（生产构建）启动于 `http://localhost:3000`，175ms 就绪。

### 3.1 发现的问题 ❌ → ✅（已修复）

`pnpm test:smoke`（`scripts/smoke-api.mjs`）**失败**：

```
Error: 数据集外部动态更新已移除，请使用项目同步脚本并手动触发。
    at assert (scripts/smoke-api.mjs:131)
    at jsonRequestWithStatus (scripts/smoke-api.mjs:109)
    at scripts/smoke-api.mjs:31
```

**根因**：commit `e0b773c`（"manual-only sync — remove Presto/S3 adapters"）把
`POST /datasets/:id/sync/trigger` 改为**故意返回 HTTP 410**（同步已下线）。Smoke
test 第 31–32 行也相应改成断言 `status === 410`，但它复用的助手
`jsonRequestWithStatus` 在解析前先 `assert(response.ok, ...)`——410 不是 `ok`，
于是在校验状态码之前就抛错。路由本身行为正确，是测试脚本与重构脱节遗留的缺陷。

**修复**：给 `jsonRequestWithStatus` 增加可选 `expectStatuses` 参数；当传入时按
白名单判断而非 `response.ok`。第 31 行改为显式期望 `[410]`。

### 3.2 修复后结果

`pnpm test:smoke` ✅ 通过，覆盖：登录、API Key、ZIP 看板托管、CSS 资源路由、
数据集同步配置（manual）、sync trigger 410、sync job claim 为空、CSV 预览、
版本历史、Embed token、清理。

## 4. CLI 逐命令验证（运行中服务）

用 `admin@artifacta.local` 登录创建临时 API Key 后，对每个 CLI 命令实测。

| 命令 | 结果 |
| --- | --- |
| `artifacta doctor` | ✅ node/pnpm/app_url/connectivity 全 ok（无 Key 时 api_key fail 属预期） |
| `artifacta projects list` | ✅ 列出种子项目 |
| `artifacta projects upload --file bundle.zip` | ✅ 发布 ZIP 项目，数据集自动发现 |
| `artifacta datasets list` | ✅ 列出数据集与行数 |
| `artifacta sync-scripts list --project-id ...` | ✅ 列出 manifest 声明的脚本 |
| `artifacta sync-scripts trigger --project-id ... --script-id sscript_...` | ✅ 入队 job |
| `artifacta sync-scripts status --project-id ... --script-id sscript_...` | ✅（修复后，见 4.2） |
| `artifacta bundle run-script --file sync.py --bundle-root ... --runtime python` | ✅ 本地执行 python 脚本 |
| `pnpm worker:once` | ✅ 认领并执行脚本 job → `success` |

### 4.1 发现的问题 ❌ → ✅：`pnpm cli -- <command>` 全部失效

README、`docs/ONBOARDING*` 等通篇用 `pnpm cli -- projects list` 形式，但
**pnpm 11.1.3 会把 `--` 分隔符原样转发给脚本**，于是 `command` 变成 `--`，
CLI 报 `Unknown command: --`。所有文档化的 `pnpm cli -- ...` 调用都跑不通。

**修复**：在 `packages/cli/bin/artifacta.mjs` 参数解析时剥离开头的独立 `--`
token。这样 `pnpm cli -- doctor`（文档形式）与 `artifacta doctor`（npm 安装后
的直接形式）都正确工作，符合 CLI 通用惯例。

### 4.2 发现的问题 ❌ → ✅：`sync-scripts status` 打印 `[object Object]`

`sync-scripts status` 的响应包含嵌套对象（`script` / `last_run` / `active_job`），
而 `printSummary` 用字符串插值 `${entryValue ?? ""}` 直接拼接对象，输出
`script: [object Object]`，不可读。

**修复**：`printSummary` 对对象/数组值改用 `JSON.stringify` 序列化，标量保持原样。
修复后 `status` 正常显示完整 JSON 字段（`last_run_status: success` 等）。

### 4.3 关于 `--script-id`（非 bug，使用约定）

`sync-scripts trigger/status` 的 `--script-id` 需要内部 id（`sscript_...`），
不是 manifest 里声明的 `id`（如 `main`）。README 示例即用 `sscript_x`，行为正确。
先用 `sync-scripts list` 取得内部 id 再传入即可。

## 5. 端到端脚本同步流水线（核心功能）

完整走通本分支主打的「自定义脚本同步」：

1. 构造带 `artifacta.json`（声明 `sync_scripts`）的 ZIP bundle，含 `scripts/sync.py`。
2. `projects upload` → `manifest_detected: true`，脚本与数据集绑定入库。
3. `sync-scripts trigger` → 生成 `queued` job（每项目仅允许一个排队/运行中 job）。
4. `pnpm worker:once` → 认领 job、在解压后的 bundle 内执行 python 脚本、刷新
   `data/sales.csv`，job 置为 `success`。
5. `sync-scripts status` → `last_run_status: success`。

Python 3.11 与 Node 运行时均可用，脚本沙箱内通过 `ARTIFACTA_BUNDLE_ROOT` 等环境
变量定位 bundle 目录。

## 6. 结论

- 运行时环境（Node 22 + pnpm 11.1.3 + Python 3.11）已就绪，依赖以 frozen
  lockfile 安装成功。
- 静态检查、构建、四类测试套件、端到端 smoke、CLI 全部通过。
- **修复 3 处运行脚本缺陷**（均已通过重跑验证）：
  1. `scripts/smoke-api.mjs`：410 期望与 `response.ok` 断言冲突，导致 smoke test 必失败。
  2. `packages/cli/bin/artifacta.mjs`：未剥离 `--`，文档化的 `pnpm cli -- ...` 全部报错。
  3. `packages/cli/bin/artifacta.mjs`：`sync-scripts status` 嵌套对象显示为 `[object Object]`。
- 改动仅限上述两个脚本文件 + 本报告，运行时数据 `.artifacta/` 已被 gitignore。

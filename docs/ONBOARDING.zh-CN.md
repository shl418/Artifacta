# 零仓库接入指南

这份文档面向两类人：

- 本地没有 Artifacta 仓库的最终用户
- 只有 Claude Code + 一个本地 skill，想把生成结果直接推到 Artifacta 网页上的用户

他们真正需要的只有：

- 一个可访问的 Artifacta 站点
- 这个站点上的 API Key
- 本地可以生成 HTML / ZIP / CSV / JSON 的工作流

ZIP 看板建议遵循稳定协议 `docs/protocol/manifest-v1.md`。

## 先澄清一件事

用户不需要先在本地创建 Artifacta project。

Artifacta 里的 project 是远端资源。第一次执行上传命令时，服务端就会创建这个 project。

## 第零步：本地用 HTTP 预览

如果看板会通过 `fetch()` 读取同包内的 CSV / JSON 等数据文件，**必须**先用 HTTP 服务预览，再打包上传。双击 `index.html` 用的是 `file://` 协议，浏览器禁止从 `null` origin 发起 fetch，本地会失败但上传到 Artifacta 后又能跑——很容易误判。

任何静态 HTTP 服务器都可以：

```bash
cd my-dashboard
npx serve .                       # 已装 Node
python3 -m http.server 5173       # 已装 Python
```

打开终端打印的 URL，在 DevTools → Network 里确认每个数据请求都返回 `200` 再继续。

构建前请记牢三条托管约束：

- **必须 ZIP**：单文件 `.html` 上传没有同包资源路由。
- **一个 HTML 一个包**：只有入口 HTML 能访问；同包内其他 `.html` 会返回 `409 ASSET_BLOCKED`，多 HTML 包上传时直接报 `MULTIPLE_HTML_FILES`。
- **只用相对路径**：`fetch("data/x.csv")` 本地与托管表现一致；带前导斜杠的 `/data/x.csv` 在托管端会绕过注入的 `<base href>` 而 404。

可直接复用 `examples/2-html-csv/`（扁平目录，无预置 manifest），完整五步见 `examples/WALKTHROUGH.zh-CN.md`。

## 第一步：创建 API Key

在 Artifacta 网页中：

1. 打开 `系统设置 -> API & CLI`
2. 创建一个新的 API Key
3. 立刻复制并安全保存

## 第二步：安装 CLI

推荐直接使用已发布的 npm 包（零仓库用户默认路径）：

```bash
npx @artifacta/cli@latest --help
```

或者全局安装：

```bash
npm install -g @artifacta/cli
artifacta --help
```

如果你在 Artifacta 仓库里做开发，也可以继续用：

```bash
pnpm cli -- --help
```

## 第三步：设置环境变量

```bash
export ARTIFACTA_URL=https://artifacta.example.com
export ARTIFACTA_API_KEY=art_...
```

## 第四步：skill 在本地生成文件

建议 skill 把产物统一写到一个临时目录，例如：

- `dashboard.zip`（推荐），可选根目录 `artifacta.json` 声明数据集与 `sync_scripts`
- `dashboard.html`（单文件看板）
- 单 HTML 仅适合内联数据；需要 `fetch()` 时请把 `data.csv` 等与 `index.html` 打在同一 ZIP 内

协议说明见 `docs/protocol/manifest-v1.md`，带脚本示例见 `docs/protocol/examples/script-sync-dashboard/artifacta.json`。

## 第五步：创建远端项目

**ZIP（推荐）：**

```bash
artifacta projects upload \
  --file ./dashboard.zip \
  --name "增长周报" \
  --visibility team
```

CLI 会自动：`POST /upload-sessions` → `POST /projects`。数据文件必须在 ZIP 内。

**单 HTML（仅内联数据）：**

```bash
artifacta projects upload \
  --file ./dashboard.html \
  --name "增长周报" \
  --visibility team
```

这个命令会在 Artifacta 上创建远端项目，并返回 `id` 和 `preview_url`。

## 第六步：更新已有远端项目

如果远端项目已经存在，就直接使用它的 `project_id`：

```bash
artifacta projects update-html \
  --project-id proj_123 \
  --file ./dashboard-v2.zip
```

## 第七步：上传或替换数据集

新增一个数据集：

```bash
artifacta datasets upload \
  --project-id proj_123 \
  --file ./data.csv \
  --name "增长周报数据"
```

替换已有数据集：

```bash
artifacta datasets replace \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --file ./data-v2.csv
```

## 第八步：提交同步配置 JSON

如果你的 skill 还需要把同步配置一起提交：

```bash
artifacta datasets sync set \
  --project-id proj_123 \
  --dataset-id ds_123 \
  --source-type presto \
  --config-file ./sync.json
```

当前 CLI 会把本地 JSON 对象直接透传到 `source_config`。

## 第九步：手动触发同步

**按数据集的外部来源（URL/COS/Presto）：**

```bash
artifacta sync trigger \
  --project-id proj_123 \
  --dataset-id ds_123
```

**ZIP 内 `sync_scripts` 声明的 bundle 脚本：**

```bash
artifacta sync-scripts list --project-id proj_123
artifacta sync-scripts trigger --project-id proj_123 --script-id sscript_xxxxxxxx
```

密钥通过 `sync-scripts set --config-file ./secrets.json` 保存在服务端，执行时注入 `ARTIFACTA_SOURCE_CONFIG`。

## Claude Code / skill 的推荐模式

最稳妥的 agent 工作流是：

1. 在本地生成 HTML / ZIP / CSV / JSON
2. 放到一个固定临时目录
3. 调 `artifacta projects upload` 或 `artifacta projects update-html`
4. 按需上传数据集
5. 按需提交 `sync.json`
6. 把 `preview_url` 返回给用户

可以直接从 `templates/claude-code-artifacta-publisher/SKILL.md` 开始复制。

## 默认建议

- 只要 HTML 依赖 CSS、JS、图片或字体，就优先上传 ZIP 包，并附带 `artifacta.json` 以自动绑定数据集或脚本同步。
- 不要用 `POST /projects` 的 `html_file` 直接传 ZIP；请走上传会话（CLI 已自动处理）。
- 把 `project_id`、`dataset_id` 当成远端 ID，不要当成本地目录名。
- API Key 只放在环境变量里，不要写进 prompt 或仓库文件。
- 每次上传成功后，把 `preview_url` 直接回传给用户。

## 常见问题

- `ARTIFACTA_API_KEY is required`：还没有导出 API Key。
- `UNAUTHORIZED`：API Key 无效、过期，或者指向了错误站点。
- `INVALID_ARTIFACT`：HTML 或 ZIP 文件格式有问题。
- 同步配置报错：确认 `sync.json` 是 JSON 对象，不是数组。

完整命令列表见 `artifacta --help`。

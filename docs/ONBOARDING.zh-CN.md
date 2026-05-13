# 零仓库接入指南

这份文档面向两类人：

- 本地没有 Artifacta 仓库的最终用户
- 只有 Claude Code + 一个本地 skill，想把生成结果直接推到 Artifacta 网页上的用户

他们真正需要的只有：

- 一个可访问的 Artifacta 站点
- 这个站点上的 API Key
- 本地可以生成 HTML / ZIP / CSV / JSON 的工作流

## 先澄清一件事

用户不需要先在本地创建 Artifacta project。

Artifacta 里的 project 是远端资源。第一次执行上传命令时，服务端就会创建这个 project。

## 第一步：创建 API Key

在 Artifacta 网页中：

1. 打开 `系统设置 -> API & CLI`
2. 创建一个新的 API Key
3. 立刻复制并安全保存

## 第二步：安装 CLI

仓库内开发者可以继续使用：

```bash
pnpm cli -- --help
```

对外用户在 npm 包发布后，推荐直接使用独立 CLI 包：

```bash
npx @artifacta/cli@latest --help
```

或者全局安装：

```bash
npm install -g @artifacta/cli
```

如果 npm 还没有发布，维护者也可以先按 `docs/CLI-RELEASE.md` 里写的方式，把 tarball 发给外部用户安装。

## 第三步：设置环境变量

```bash
export ARTIFACTA_URL=https://artifacta.example.com
export ARTIFACTA_API_KEY=art_...
```

## 第四步：skill 在本地生成文件

建议 skill 把产物统一写到一个临时目录，例如：

- `dashboard.zip` 或 `dashboard.html`
- `data.csv`
- `sync.json`，如果你还要提交数据集同步配置

## 第五步：创建远端项目

```bash
artifacta projects upload \
  --file ./dashboard.zip \
  --name "增长周报" \
  --data-file ./data.csv \
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

```bash
artifacta sync trigger \
  --project-id proj_123 \
  --dataset-id ds_123
```

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

- 只要 HTML 依赖 CSS、JS、图片或字体，就优先上传 ZIP 包。
- 把 `project_id`、`dataset_id` 当成远端 ID，不要当成本地目录名。
- API Key 只放在环境变量里，不要写进 prompt 或仓库文件。
- 每次上传成功后，把 `preview_url` 直接回传给用户。

## 常见问题

- `ARTIFACTA_API_KEY is required`：还没有导出 API Key。
- `UNAUTHORIZED`：API Key 无效、过期，或者指向了错误站点。
- `INVALID_ARTIFACT`：HTML 或 ZIP 文件格式有问题。
- 同步配置报错：确认 `sync.json` 是 JSON 对象，不是数组。

完整命令列表见 `artifacta --help`。
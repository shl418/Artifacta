# 示例走通指南

多数目录是**扁平**一堆文件；`0-single-html` 只有单个 HTML；`3-html-csv-json` **故意**带了 `data/`、`analytics/` 子目录。示例里都没有预置 `artifacta.json`（脚本同步除外，见第 4 节）。

```bash
export ARTIFACTA_URL=http://localhost:3000
export ARTIFACTA_API_KEY=art_live_...
```

ZIP 包：在对应目录里 `npx serve .` 预览，再 `zip -r ../bundle.zip .` 上传。  
单 HTML：直接 `artifacta projects upload --file index.html`，不必 zip。

---

## 0. 单 HTML — `0-single-html/`

```
0-single-html/
  index.html          # 数据写在 <script> 里，无外部文件
```

```bash
cd examples/0-single-html
# 本地可直接双击或：
npx serve .

artifacta projects upload \
  --file index.html \
  --name "示例0 单文件"
```

无需 zip；托管后没有 bundle 内数据集绑定。

---

## 1. HTML + JSON — `1-html-json/`

```
1-html-json/
  index.html
  metrics.json
```

```bash
cd examples/1-html-json
npx serve .
zip -r ../1.zip . && artifacta projects upload --file ../1.zip --name "示例1 JSON"
```

---

## 2. HTML + CSV — `2-html-csv/`

```
2-html-csv/
  index.html
  region_sales.csv
```

```bash
cd examples/2-html-csv
npx serve .
zip -r ../2.zip . && artifacta projects upload --file ../2.zip --name "示例2 CSV"
```

---

## 3. HTML + CSV + JSON（有层级）— `3-html-csv-json/`

```
3-html-csv-json/
  index.html
  data/
    q2_sales.csv
  analytics/
    funnel.json
```

`index.html` 里路径是相对包根的：`fetch("data/q2_sales.csv")`、`fetch("analytics/funnel.json")`。

```bash
cd examples/3-html-csv-json
npx serve .
zip -r ../3.zip . && artifacta projects upload --file ../3.zip --name "示例3 有目录"
```

上传后应自动发现两个数据集，路径为 `data/q2_sales.csv` 与 `analytics/funnel.json`。

---

## 4. HTML + CSV + Python — `4-html-csv-script/`

```
4-html-csv-script/
  index.html
  sales.csv
  pull_sales.py
```

上传前**自行新建** `artifacta.json`（见下），再 zip：

```json
{
  "schema_version": 1,
  "name": "日报",
  "entrypoint": "index.html",
  "datasets": [
    { "id": "sales", "name": "sales.csv", "kind": "csv", "path": "sales.csv", "refresh": "sync" }
  ],
  "sync_scripts": [
    {
      "id": "pull",
      "path": "pull_sales.py",
      "runtime": "python",
      "outputs": ["sales.csv"],
      "schedule": "0 8 * * *"
    }
  ]
}
```

```bash
cd examples/4-html-csv-script
export ARTIFACTA_BUNDLE_ROOT="$PWD" ARTIFACTA_OUTPUT_PATHS="sales.csv"
python3 pull_sales.py && npx serve .
# 放入 artifacta.json 后：
zip -r ../4.zip . && artifacta projects upload --file ../4.zip --name "示例4 脚本"
artifacta sync-scripts trigger --project-id <id> --script-id <script_id>
```

---

## 对照

| 目录 | 结构 | 上传方式 | 自带 manifest |
|------|------|----------|---------------|
| `0-single-html` | 单 html | `--file index.html` | 否 |
| `1-html-json` | 扁平 | zip | 否（平台生成） |
| `2-html-csv` | 扁平 | zip | 否 |
| `3-html-csv-json` | **data/ + analytics/** | zip | 否 |
| `4-html-csv-script` | 扁平 + py | zip + 自建 manifest | **是** |

# Examples

Messy bundles that mimic what users or agents actually drop into a folder — **no** pre-written `artifacta.json`.

**Walkthrough (中文):** [WALKTHROUGH.zh-CN.md](./WALKTHROUGH.zh-CN.md)

| Directory | Contents |
|-----------|----------|
| `0-single-html/` | one `index.html` only (inline data, upload as `.html` not zip) |
| `1-html-json/` | flat: `index.html` + `metrics.json` |
| `2-html-csv/` | flat: `index.html` + `region_sales.csv` (BI-styled dashboard) |
| `3-html-csv-json/` | **nested:** `index.html` + `data/*.csv` + `analytics/*.json` (BI-styled) |
| `4-html-csv-script/` | flat: `index.html` + `sales.csv` + `pull_sales.py` |
| `5-html-csv-cos/` | flat: `index.html` + `sales_snapshot.csv` |

Protocol reference manifests live under `docs/protocol/examples/`, not here.

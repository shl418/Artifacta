# Artifacta Examples

- `single-file-dashboard/index.html`: one HTML file that can be uploaded directly.
- `zip-dashboard/`: a multi-file dashboard. Zip the folder contents so `index.html` is at the bundle root.
- `datasets/sales.csv` and `datasets/growth.json`: small files for dataset preview and schema inspection.
- `sync/mock-rows.json`: sync config for `artifacta datasets sync set --config-file`.
- `sync/url-source.json`: remote URL fetch example (requires `SYNC_URL_ALLOWLIST` in production).
- `sync/local-file-source.json`: local file refresh example (requires `SYNC_LOCAL_BASE_DIR` in production).
- `publish-example.sh`: repo-local CLI upload example.

```bash
export ARTIFACTA_URL=http://localhost:3000
export ARTIFACTA_API_KEY=art_live_...
bash examples/publish-example.sh
```

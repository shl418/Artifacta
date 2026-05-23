# Artifacta Examples

- `single-file-dashboard/index.html`: one HTML file that can be uploaded directly.
- `zip-dashboard/`: a multi-file dashboard. Zip the folder contents so `index.html` is at the bundle root.
- `datasets/sales.csv` and `datasets/growth.json`: small files for dataset preview and schema inspection.
- `sync/mock-rows.json`: sync config for `artifacta datasets sync set --config-file`.
- `publish-example.sh`: repo-local CLI upload example.

```bash
export ARTIFACTA_URL=http://localhost:3000
export ARTIFACTA_API_KEY=art_live_...
bash examples/publish-example.sh
```

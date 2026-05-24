#!/usr/bin/env bash
set -euo pipefail

: "${ARTIFACTA_URL:=http://localhost:3000}"
: "${ARTIFACTA_API_KEY:?Set ARTIFACTA_API_KEY from Settings -> API & CLI first.}"

pnpm cli -- projects upload \
  --file examples/single-file-dashboard/index.html \
  --name "Artifacta Single File Example" \
  --description "Published from examples/publish-example.sh" \
  --data-file examples/datasets/sales.csv \
  --visibility team

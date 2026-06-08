"""Demo sync script: re-read each declared output CSV and add 1 to every numeric cell.

Contract (same locally and on the Artifacta worker):
  ARTIFACTA_BUNDLE_ROOT   bundle root (use $PWD when testing locally)
  ARTIFACTA_OUTPUT_PATHS  comma-separated relative paths this run may write
  ARTIFACTA_SCRIPT_ID     manifest script id (e.g. "main")
  ARTIFACTA_SOURCE_CONFIG JSON, server-injected secrets only (unused here)

Stdlib only on purpose — the worker has no network egress and does not pip-install,
so anything beyond the standard library must already be present on the host.
"""

import csv
import os
from pathlib import Path

ROOT = Path(os.environ["ARTIFACTA_BUNDLE_ROOT"])
OUTPUTS = [p.strip() for p in os.environ["ARTIFACTA_OUTPUT_PATHS"].split(",") if p.strip()]


def bump(value: str) -> str:
    """Add 1 to a numeric cell; leave non-numeric cells (labels, dates) untouched."""
    try:
        number = int(value)
        return str(number + 1)
    except ValueError:
        pass
    try:
        number = float(value)
        return str(number + 1)
    except ValueError:
        return value


def bump_csv(rel: str) -> None:
    dest = ROOT / rel
    with dest.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.reader(handle))
    if not rows:
        return
    header, body = rows[0], rows[1:]
    bumped = [[bump(cell) for cell in row] for row in body]
    dest.parent.mkdir(parents=True, exist_ok=True)
    with dest.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(bumped)


def main() -> None:
    for rel in OUTPUTS:
        if rel.endswith(".csv"):
            bump_csv(rel)


if __name__ == "__main__":
    main()

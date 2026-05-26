# 用户随手写的刷新脚本，和 index.html 同级（不是 scripts/ 目录）
import os
from datetime import date
from pathlib import Path

root = Path(os.environ.get("ARTIFACTA_BUNDLE_ROOT", Path(__file__).resolve().parent))
out = root / "sales.csv"
out.write_text(
    "date,region,amount\n"
    f"{date.today()},synced,100\n"
    f"{date.today()},synced,200\n",
    encoding="utf-8",
)

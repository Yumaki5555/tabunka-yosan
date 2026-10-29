# 出典資料（data/sources の出典URL）を取ってくるプログラム。リンク切れの確認にも使えます
#
#   python -I tools/fetch_sources.py <保存先のフォルダ> [自治体コード …]
#
# ・<保存先>/<自治体コード>/<出典ID>_<URLの最後の部分> に保存します（tools/verify_pages.py がこの置き方を読みます）
# ・取れなかった出典（リンク切れ・アクセス制限など）を一覧にして出します
# ・保存先は、このプロジェクトの外（作業用のフォルダ）にしてください

import csv
import glob
import os
import sys
import time
import urllib.request
from urllib.parse import unquote, urlparse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        sys.exit("使い方：python -I tools/fetch_sources.py <保存先のフォルダ> [自治体コード …]")
    out, codes = sys.argv[1], set(sys.argv[2:])
    rows = []
    for fp in sorted(glob.glob(os.path.join(ROOT, "data", "sources", "*.csv"))):
        with open(fp, encoding="utf-8-sig") as f:
            rows += list(csv.DictReader(f))
    bad = []
    for r in rows:
        if codes and r["自治体コード"] not in codes:
            continue
        for col in ["出典URL", "資料掲載ページ"]:
            url = r[col]
            if not url:
                continue
            name = os.path.basename(unquote(urlparse(url).path)) or "index.html"
            dst = os.path.join(out, r["自治体コード"], f"{r['出典ID']}_{name}" if col == "出典URL" else f"_page_{r['出典ID']}_{name}")
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.exists(dst) and os.path.getsize(dst) > 0:
                continue
            try:
                req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*", "Accept-Language": "ja"})
                with urllib.request.urlopen(req, timeout=60) as res:
                    data = res.read()
                    ctype = res.headers.get("Content-Type", "")
                if col == "出典URL" and url.lower().endswith(".pdf") and not data.startswith(b"%PDF"):
                    bad.append((r["出典ID"], col, url, f"PDFではない応答（{ctype}）"))
                    continue
                with open(dst, "wb") as f:
                    f.write(data)
            except Exception as e:  # リンク切れ・アクセス制限
                bad.append((r["出典ID"], col, url, str(e)[:120]))
            time.sleep(0.5)
    print(f"取れなかった出典：{len(bad)}件")
    for b in bad:
        print("  ", " ".join(b))


if __name__ == "__main__":
    main()

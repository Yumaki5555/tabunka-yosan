# 見る人のブラウザに古いJS・CSSが残らないよう、index.html の読み込み先に版番号（?v=日時）を付けるプログラム
#
#   python tools/set_version.py
#
# assets/js・assets/css を直して公開する前に、必ず実行してください（新しいJSファイルも自動で一覧に入ります）。
# データ（data/）だけを直したときは不要です（データは毎回新しく読み込みます）。

import datetime
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main():
    import sys
    sys.stdout.reconfigure(encoding="utf-8")
    ver = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).strftime("%Y%m%d%H%M")
    p = os.path.join(ROOT, "index.html")
    html = open(p, encoding="utf-8").read()
    js = sorted(f for f in os.listdir(os.path.join(ROOT, "assets", "js")) if f.endswith(".js"))
    imports = {f"./assets/js/{f}": f"./assets/js/{f}?v={ver}" for f in js}
    block = ("<!-- version:start（tools/set_version.py が書き換えます） -->\n"
             '<script type="importmap">\n' + json.dumps({"imports": imports}, ensure_ascii=False, indent=1) + "\n</script>\n"
             f'<script type="module" src="assets/js/app.js?v={ver}"></script>\n'
             "<!-- version:end -->")
    html, n = re.subn(r"<!-- version:start.*?<!-- version:end -->", block, html, flags=re.S)
    if not n:
        raise SystemExit("index.html に version:start〜version:end の印がありません")
    html = re.sub(r'(assets/css/style\.css)\?v=\d+', rf"\1?v={ver}", html)
    open(p, "w", encoding="utf-8", newline="\n").write(html)
    print(f"版番号を {ver} にしました（JS {len(js)}ファイル・CSS）")


if __name__ == "__main__":
    main()

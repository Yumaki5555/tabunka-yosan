# ファビコン（ブラウザのタブ・ブックマークの小さな絵）を作るプログラム
#
#   python -I tools/make_icons.py
#
# 作るもの: assets/img/favicon.svg・favicon-32.png・apple-touch-icon.png（グリーンの地に白い円グラフ）
# 一度作れば、データを直しても作り直す必要はありません（形や色を変えたいときだけ実行）。
# ヘッダーの左上の絵（index.html の brand-mark）も同じ形なので、形を変えたらそちらの d="…" も合わせて直してください。
#
# 形：4分の3の扇形と、少し離した4分の1の扇形の2つだけ（16pxでも円グラフと分かるよう、すき間を2pxにしている）。
# MOUマップ（ターコイズの地に白い地球の線画）と、色と形の両方で見分けられるようにしている。
import os
import sys

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IMG = os.path.join(ROOT, "assets", "img")

BRAND = "#1d7347"
# 32×32 の升目で：大きい扇形の中心 (14,18)、小さい扇形の中心 (18,14)、半径 10。
# 直線の辺が升目の偶数の位置にくるので、16pxに縮めてもぼやけない
PIE = "M14 18H24A10 10 0 1 1 14 8ZM18 14V4A10 10 0 0 1 28 14Z"
FAVICON = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
           f'<rect width="32" height="32" rx="7" fill="{BRAND}"/>'
           f'<path fill="#fff" d="{PIE}"/></svg>\n')


def favicon_png(size, corner=True):
    """大きく描いてから縮める（なめらかにするため）。corner=False は角を丸めない四角"""
    k = 16  # 1升 = 16px で描く（32×16 = 512px）
    S = 32 * k
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    dr = ImageDraw.Draw(im)
    if corner:
        dr.rounded_rectangle([0, 0, S - 1, S - 1], radius=7 * k, fill=BRAND)
    else:
        dr.rectangle([0, 0, S - 1, S - 1], fill=BRAND)
    r = 10 * k
    # 角度は3時の向きが0度で、時計回り（PIE と同じ形）
    dr.pieslice([14 * k - r, 18 * k - r, 14 * k + r, 18 * k + r], 0, 270, fill="white")
    dr.pieslice([18 * k - r, 14 * k - r, 18 * k + r, 14 * k + r], 270, 360, fill="white")
    return im.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(IMG, exist_ok=True)
    with open(os.path.join(IMG, "favicon.svg"), "w", encoding="utf-8", newline="\n") as f:
        f.write(FAVICON)
    favicon_png(32).save(os.path.join(IMG, "favicon-32.png"))
    # ホーム画面に追加したときのアイコン（角は端末が丸めるので、四角いまま）
    favicon_png(180, corner=False).convert("RGB").save(os.path.join(IMG, "apple-touch-icon.png"))
    print("favicon.svg・favicon-32.png・apple-touch-icon.png を作りました")


if __name__ == "__main__":
    main()

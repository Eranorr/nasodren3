# Etmoid görsellerinden oyun şekli: hat (outline), ızgara (grid), başlangıç; görsel oranı korunur (tek ölçek).
# Görselde kanal yok: alt kenardaki siklamen işareti ostiumun yeri. Oradan tahtanın alt kenarına 2 hücrelik kanal açılır
# (frontal bölümlerdeki gibi). Şekil, kanala en az 3 satır bırakarak tahtaya sığan en büyük boyda.
# Kullanım (proje kökünden): python tools/etmoid-sekli.py <çıktı klasörü>
#   -> sekil.json (content.js'e işlenen grid/outline/start) ve görselle üst üste önizleme PNG'leri
import numpy as np, cv2, json, sys
COLS, ROWS = 26, 35
TOP, BOT = 0.15, 31.6          # şeklin tahtadaki dikey aralığı (hücre); altındaki satırlar kanal
K = 40                          # hücre başına piksel (hat bu çözünürlükte çıkarılır)

def mask_of(path):
    im = cv2.imread(path); b, g, r = [im[..., i].astype(int) for i in range(3)]
    flower = (b > 90) & (r > 50) & (g < 60) & (b - g > 50)            # siklamenin magenta taç yaprakları
    fy, fx = np.nonzero(flower)
    m = ((r + g + b) > 130).astype(np.uint8) * 255                     # arka plan toplamı ~70, doku ~200, kenar çizgisi daha açık
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m); k = 1 + np.argmax(st[1:, 4]); m = (lab == k).astype(np.uint8) * 255
    ff = m.copy(); h, w = ff.shape; cv2.floodFill(ff, np.zeros((h + 2, w + 2), np.uint8), (0, 0), 255)
    m = m | cv2.bitwise_not(ff)                                        # delikleri doldur
    # siklamen: kutusunu sil, alt kenarı iki yanındaki sütunlardan doğrusal tamamla
    bx0, bx1, by0 = fx.min() - 8, fx.max() + 8, fy.min() - 4
    m[by0:, bx0:bx1 + 1] = 0
    bottom = lambda x: np.nonzero(m[:, x])[0].max()
    yl, yr = bottom(bx0 - 1), bottom(bx1 + 1)
    for x in range(bx0, bx1 + 1):
        ys = np.nonzero(m[:by0, x])[0]
        if len(ys): m[ys.min():int(round(yl + (yr - yl) * (x - bx0 + 1) / (bx1 - bx0 + 2))) + 1, x] = 255
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))
    m = cv2.erode(m, np.ones((3, 3), np.uint8))                        # hat kenar çizgisinin ortasına yakın
    return im, m, (fx.mean(), fy.max())

def build(path, straight_side):
    im, m, fl = mask_of(path)
    ys, xs = np.nonzero(m); x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    s = (BOT - TOP) / (y1 - y0)
    W = (x1 - x0) * s
    # yatayda ortala; düz duvar (burun bölümlerindeki gibi) tam hücre sınırına otursun
    sx = x0 if straight_side == 'L' else x1
    ox = (COLS - W) / 2; ox += round(ox + (sx - x0) * s) - (ox + (sx - x0) * s)
    A = np.float32([[s * K, 0, (ox - x0 * s) * K], [0, s * K, (TOP - y0 * s) * K]])
    H = int((ROWS + 2) * K); Wd = COLS * K
    M = cv2.warpAffine(m, A, (Wd, H), flags=cv2.INTER_LINEAR) > 127      # görselin şekli, tahta koordinatında
    # ostium kanalı: siklamenin altından tahtanın kenarının ötesine 2 hücre; hücre sınırına oturur
    fxc = (fl[0] - x0) * s + ox; c0 = int(round(fxc - 1))
    U = M.astype(np.uint8) * 255
    col = U[:, c0 * K:(c0 + 2) * K]; top = np.nonzero(col.any(1))[0].max() - K   # kanal şeklin içinden başlar
    U[top:int(36.5 * K), c0 * K:(c0 + 2) * K] = 255
    # kanalın gövdeye birleştiği köşeler yuvarlanır (frontal hatlarındaki gibi)
    r = int(K * .45); U = cv2.morphologyEx(U, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1)))
    U[int(36.5 * K):] = 0
    cs, _ = cv2.findContours(U, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); c = max(cs, key=cv2.contourArea)
    poly = cv2.approxPolyDP(c, K * .04, True)[:, 0, :].astype(float) / K
    pp = poly.astype(np.float32).reshape(-1, 1, 2)
    inside = lambda x, y: cv2.pointPolygonTest(pp, (float(x), float(y)), True)
    rows = [''.join('.' if inside(x + .5, y + .5) > .05 else '#' for x in range(COLS)) for y in range(ROWS)]
    for y in range(ROWS - 1, -1, -1):                                  # alttan: içinde ≤ 2 hücre kalan satırlar kanal
        if 0 < rows[y].count('.') <= 2: rows[y] = rows[y].replace('.', '=')
        else: break
    # başlangıç: serbest hücrelerin ağırlık merkezine en yakın; akış yukarı bakar, gövdesi altta (4 hücre), önünde 5 hücre boş
    free = [(x, y) for y in range(ROWS) for x in range(COLS) if rows[y][x] == '.']
    mx, my = np.mean([p[0] for p in free]), np.mean([p[1] for p in free])
    ok = lambda x, y: 0 <= x < COLS and 0 <= y < ROWS and rows[y][x] == '.'
    best = min(((x - mx) ** 2 + (y - my) ** 2, x, y) for x, y in free
               if all(ok(x + dx, y + dy) for dy in range(-5, 4) for dx in (-1, 0, 1)))
    return im, M, poly, rows, (best[1], best[2]), (s, ox, x0, y0)

out = {}
for name, f, side in [('etmoidSag', 'etmoid_sag', 'L'), ('etmoidSol', 'etmoid_sol', 'R')]:
    im, M, poly, rows, start, (s, ox, x0, y0) = build(f'src/assets/{f}.png', side)
    Mb = M[:ROWS * K]
    body = np.array([[ch == '.' for ch in r] for r in rows])          # kanal dışında ızgara
    gm = np.kron(body, np.ones((K, K), bool))
    pm = np.zeros(Mb.shape, np.uint8); cv2.fillPoly(pm, [np.round(poly * K).astype(np.int32)], 1)
    ch = np.kron(np.array([[c == '=' for c in r] for r in rows]), np.ones((K, K), bool))
    pm = (pm > 0) & ~ch & (np.arange(Mb.shape[0])[:, None] < BOT * K)  # kanal örtüşmeye katılmaz
    iou = (Mb & gm).sum() / (Mb | gm).sum(); iou2 = (Mb & pm).sum() / (Mb | pm).sum()
    print(name, 'ölçek', round(s, 5), 'boyut', round(float(poly[:, 0].max() - poly[:, 0].min()), 2), 'x', round(BOT - TOP, 2),
          'hücre; ızgara örtüşme %', round(iou * 100, 1), 'hat örtüşme %', round(iou2 * 100, 1), 'başlangıç', start,
          'nokta', len(poly), 'serbest hücre', sum(r.count('.') for r in rows))
    out[name] = {'grid': rows, 'outline': [round(float(v), 2) for v in poly.reshape(-1)], 'start': start}
    P = 20; prev = cv2.resize(cv2.cvtColor((M * 120).astype(np.uint8), cv2.COLOR_GRAY2BGR), (COLS * P, (ROWS + 2) * P))
    for y, row in enumerate(rows):
        for x, c in enumerate(row):
            colr = {'.': (90, 170, 90), '=': (60, 200, 230), '#': None}[c]
            if colr: cv2.rectangle(prev, (x * P + 2, y * P + 2), ((x + 1) * P - 3, (y + 1) * P - 3), colr, 1)
    cv2.polylines(prev, [np.round(poly * P).astype(np.int32)], True, (255, 255, 255), 1)
    cv2.circle(prev, (int((start[0] + .5) * P), int((start[1] + .5) * P)), 6, (200, 60, 220), -1)
    cv2.imwrite(sys.argv[1] + f'/{name}.png', prev)
json.dump(out, open(sys.argv[1] + '/sekil.json', 'w'))

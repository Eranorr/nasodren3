# Burun görsellerinden oyun şekli: hat (outline), ızgara (grid), başlangıç; görsel oranı korunur (tek ölçek).
# Kanal 2 hücreye genişletilir, siklamen işareti hattan çıkarılıp başlangıç olarak kullanılır.
# Kullanım (proje kökünden): python tools/burun-sekli.py <çıktı klasörü>
#   -> sekil.json (content.js'e işlenen grid/outline/start) ve görselle üst üste önizleme PNG'leri
import numpy as np, cv2, json, sys
COLS, ROWS = 26, 35
def extract(path, chan_side):
    im = cv2.imread(path); b, g, r = [im[..., i].astype(int) for i in range(3)]
    flower = ((r > 110) & (b > 70) & (g < 90) & (r - g > 60) & (b - g > 40)) | ((g > 90) & (g > r + 25))
    fy, fx = np.nonzero(flower)
    shape = ((r > 52) | ((r + g + b) > 200)).astype(np.uint8) * 255   # arka plan r≤35; dokunun koyu lekeleri bile r>70
    shape = cv2.morphologyEx(shape, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(shape); k = 1 + np.argmax(st[1:, 4]); shape = (lab == k).astype(np.uint8) * 255
    ff = shape.copy(); h, w = ff.shape; mm = np.zeros((h + 2, w + 2), np.uint8); cv2.floodFill(ff, mm, (0, 0), 255)
    m = shape | cv2.bitwise_not(ff)                     # delikleri doldur
    m[flower & (m > 0)] = 0 if False else m[flower & (m > 0)]
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((9, 9), np.uint8))   # çiçek gibi küçük çıkıntılar gider
    cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE); c = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)
    c = cv2.erode(m, np.ones((3, 3), np.uint8)); cs, _ = cv2.findContours(c, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cs, key=cv2.contourArea)[:, 0, :].astype(float)   # çizginin ortasına yakın
    if len(fx):
        bx0, bx1, by0 = fx.min() - 10, fx.max() + 10, fy.min() - 10
        c = c[~((c[:, 0] > bx0) & (c[:, 0] < bx1) & (c[:, 1] > by0))]
    return im, m, c, (fx.mean(), fy.max()) if len(fx) else None
def build(path, chan_side):
    im, m, c, fl = extract(path, chan_side)
    x0, y0, x1, y1 = c[:, 0].min(), c[:, 1].min(), c[:, 0].max(), c[:, 1].max()
    TOP, BOT = -0.6, 34.55
    s = (BOT - TOP) / (y1 - y0)
    # kanal: üstteki dar kısım; düz kenarı (septum tarafı) hücre sınırına oturt
    top = c[c[:, 1] < y0 + 25]; straight = top[:, 0].max() if chan_side == 'R' else top[:, 0].min()
    W = (x1 - x0) * s; ox = round((COLS - W) / 2 + (straight - x0) * s) - (straight - x0) * s   # ortalanmış, düz kenar tam sayıda
    P = np.stack([(c[:, 0] - x0) * s + ox, (c[:, 1] - y0) * s + TOP], 1)
    sx = round((straight - x0) * s + ox)
    # kanal genişliği görselde ~1,4 hücre: 2 hücreye (telefonda isabet) iç kenar kaydırılır; omuz eğrisine kadar
    chan_w = 2.0; inner = sx - chan_w if chan_side == 'R' else sx + chan_w
    yline = None
    # omuz: kanalın iç kenarının dikeyden ayrıldığı yükseklik
    sg = -1 if chan_side == 'R' else 1                 # iç taraf yönü
    d = (P[:, 0] - sx) * sg
    cw0 = np.median(d[(P[:, 1] < .5) & (d > .3) & (d < 3)])
    # kanalı 2 hücreye genişlet: iç duvar ve onun gövdeye inen kavisi, uzaklaştıkça azalan kaydırmayla (şekil pürüzsüz kalır)
    sel = (P[:, 1] < 4) & (d > .3) & (d < 4)
    P[sel, 0] = sx + sg * (d[sel] + (chan_w - cw0) * np.clip(1 - (d[sel] - cw0) / (4 - cw0), 0, 1))
    print('  kanal görselde', round(cw0, 2), 'hücre -> 2')
    P[:, 1] = np.where(P[:, 1] <= TOP + .05, -1.5, P[:, 1])   # kanal tahtanın dışına uzanır
    # sadeleştir
    ap = cv2.approxPolyDP(P.astype(np.float32).reshape(-1, 1, 2) * 100, 4, True)[:, 0, :] / 100
    poly = ap
    grid = []
    pp = poly.astype(np.float32).reshape(-1, 1, 2)
    inside = lambda x, y: cv2.pointPolygonTest(pp, (float(x), float(y)), True)
    rows = []
    for y in range(ROWS):
        rows.append(''.join('.' if inside(x + .5, y + .5) > .05 else '#' for x in range(COLS)))
    # kanal satırları: üstten, içteki hücre sayısı ≤ 2 olanlar '='
    for y in range(ROWS):
        if 0 < rows[y].count('.') <= 2: rows[y] = rows[y].replace('.', '=')
        else: break
    # başlangıç: çiçeğe en yakın, altında 3 hücre daha olan sütun
    fxc = (fl[0] - x0) * s + ox; fyc = (fl[1] - y0) * s + TOP
    best = None
    for y in range(ROWS - 4):
        for x in range(COLS):
            if all(rows[y + i][x] == '.' for i in range(4)) and all(rows[y + i][x + dx] == '.' for i in range(4) for dx in (-1, 1) if 0 <= x + dx < COLS):
                d = (x + .5 - fxc) ** 2 + (y + 3.5 - fyc) ** 2
                if best is None or d < best[0]: best = (d, x, y)
    return im, m, (x0, y0, s, ox, TOP), poly, rows, (best[1], best[2]), (fxc, fyc)
out = {}
for name, f, side in [('noseSag', 'sag_burun', 'L'), ('noseSol', 'sol_burun', 'R')]:
    im, m, (x0, y0, s, ox, TOP), poly, rows, start, fl = build(f'src/assets/{f}.png', side)
    # görselle örtüşme: şeklin piksel maskesi ile ızgaranın hücreleri
    K = 24; H = ROWS * K; Wd = COLS * K
    gm = np.zeros((H, Wd), np.uint8)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '#': gm[y*K:(y+1)*K, x*K:(x+1)*K] = 1
    M = cv2.warpAffine(m, np.float32([[s*K, 0, (ox - x0*s)*K], [0, s*K, (TOP - y0*s)*K]]), (Wd, H)) > 0
    iou = (M & (gm > 0)).sum() / (M | (gm > 0)).sum()
    pm = np.zeros((H, Wd), np.uint8); cv2.fillPoly(pm, [np.round(poly * K).astype(np.int32)], 1)
    iou2 = (M & (pm > 0) ).sum() / (M | (pm[:H] > 0)).sum()
    print(name, 'ölçek', round(s, 5), 'genişlik', round((m.shape[1] and (poly[:,0].max()-poly[:,0].min())), 2), 'hücre;', 'ızgara örtüşme %', round(iou*100, 1), 'hat örtüşme %', round(iou2*100, 1), 'başlangıç', start, 'çiçek', [round(v, 1) for v in fl], 'nokta', len(poly), 'serbest hücre', sum(r.count('.') for r in rows))
    out[name] = {'grid': rows, 'outline': [round(float(v), 2) for v in poly.reshape(-1)], 'start': start}
    # önizleme
    prev = cv2.cvtColor((M * 120).astype(np.uint8), cv2.COLOR_GRAY2BGR)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            col = {'.': (90, 170, 90), '=': (60, 200, 230), '#': None}[ch]
            if col: cv2.rectangle(prev, (x*K+2, y*K+2), ((x+1)*K-3, (y+1)*K-3), col, 1)
    cv2.polylines(prev, [np.round(poly * K).astype(np.int32)], True, (255, 255, 255), 1)
    cv2.circle(prev, (int((start[0]+.5)*K), int((start[1]+.5)*K)), 8, (200, 60, 220), -1)
    cv2.imwrite(sys.argv[1] + f'/{name}.png', prev)
json.dump(out, open(sys.argv[1] + '/sekil.json', 'w'))

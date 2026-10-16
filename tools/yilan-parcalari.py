# Sıklamen yılan çiziminden (src/assets/siklamen_yilan.png) oyunun kullandığı parçalar:
#   bas.png      çiçek (baş); ileri = dokunun solu, sap sağdan girer
#   yaprak1.png  kıvrık dallı kalp yaprak, tomurcuk.png  yukarı kalkan tomurcuk,
#   yaprak2.png  ikinci yaprak (sapıyla), tomurcuk2.png  onun sapından sarkan tomurcuk
#   sap.png      sapın kesiti (boyuna gerilir), kuyruk.png  düzleştirilmiş sivri kuyruk ucu
#   yilan.json   parçaların çapa noktaları, gövde üstündeki yerleri (hücre) ve sap kalınlığı
# Yapraklar sapın üstünde çizilir; sapın yaprağın altında kalan kısmı yaprağın dış hattıyla (dışbükey zarf) birlikte alınır.
# Tomurcuklar sapın arkasındadır (back: 1).
# Kullanım (proje kökünden): python tools/yilan-parcalari.py [önizleme klasörü]
import numpy as np, cv2, json, sys, os
from PIL import Image
from scipy.interpolate import UnivariateSpline
from scipy.ndimage import map_coordinates

SRC, OUT = 'src/assets/siklamen_yilan.png', 'src/assets/yilan'
S = 140          # çizimde bir hücre (px): sap kalınlığı ~0,6 hücre
PX = 64          # çıktıda bir hücre (px)
k = PX / S
XJ = 465         # sapın çiçeğin altından çıktığı yer
PIVOT_BACK = 175 # baş hücresinin merkezi, sap çıkışının bu kadar önünde (çiçeğin ağzına yakın)
XT = 1760        # kuyruk dokusunun başladığı yer (son tomurcuktan sonra yalnız sap)
os.makedirs(OUT, exist_ok=True)
a = np.array(Image.open(SRC).convert('RGBA')).astype(float)
H, W = a.shape[:2]
A = a[..., 3] > 100

# sapın orta hattı: yalnız sapın göründüğü sütunlardan (kalınlık 70-95 px) yumuşak eğri
xs, cs, ws = [], [], []
for x in range(500, 2060, 2):
    ys = np.nonzero(A[:, x])[0]
    runs = np.split(ys, np.nonzero(np.diff(ys) > 1)[0] + 1)
    prev = cs[-1] if cs else 400
    ok = [r for r in runs if 70 <= r[-1] - r[0] <= 95 and abs((r[0] + r[-1]) / 2 - prev) < 25]
    if ok:
        r = min(ok, key=lambda r: abs((r[0] + r[-1]) / 2 - prev)); xs.append(x); cs.append((r[0] + r[-1]) / 2); ws.append(r[-1] - r[0])
xs, cs, ws = np.array(xs), np.array(cs), np.array(ws, float)
sp = UnivariateSpline(xs, cs, s=len(xs) * 4); dsp = sp.derivative()
cosT = lambda x: 1 / np.hypot(1, dsp(x))
hsp = UnivariateSpline(xs, ws * cosT(xs) / 2, s=len(xs) * 6)   # dik yarı kalınlık
XX = np.arange(440, 2141, 1.0)
arc = np.concatenate([[0], np.cumsum(np.hypot(1, np.diff(sp(XX))))])
arcAt = lambda x: float(np.interp(x, XX, arc))
cellsAt = lambda x: (PIVOT_BACK + arcAt(x) - arcAt(XJ)) / S   # baş hücresinden uzaklık (hücre)

# sap kesiti: temiz bölümlerde kalınlığa göre normalize edilmiş renklerin ortalaması
NT = 128; TB = 1.25; T = np.linspace(-TB, TB, NT)
def section(x, h=None):
    c, ct = sp(x), cosT(x); h = hsp(x) if h is None else h; nx, ny = -dsp(x) * ct, ct
    off = T * h
    return np.stack([map_coordinates(a[..., i], [c + off * ny, x + off * nx], order=1) for i in range(4)], -1)
acc = np.zeros((NT, 4)); n = 0
for x0, x1 in [(545, 640), (905, 975), (1215, 1305), (1760, 1860)]:
    for x in range(x0, x1, 2):
        P = section(x); P[:, :3] *= P[:, 3:] / 255; acc += P; n += 1
prof = acc / n; prof[:, :3] /= np.maximum(prof[:, 3:], 1e-3) / 255
OH = 48   # kesit ve kuyruk dokusunun yüksekliği
profO = np.stack([np.interp(np.linspace(0, NT - 1, OH), np.arange(NT), prof[:, i]) for i in range(4)], -1)
Image.fromarray(np.repeat(profO[:, None, :], 4, 1).clip(0, 255).astype(np.uint8)).save(f'{OUT}/sap.png')

# kuyruk: XT'den uca kadar yay uzunluğuna göre düzleştirilmiş şerit; satırlar XT'deki kalınlıkla aynı ölçekte
h0 = float(hsp(XT)); tipX = 2140
L = arcAt(tipX) - arcAt(XT); NL = int(round(L * k))
cols = [section(float(np.interp(arcAt(XT) + s / (NL - 1) * L, arc, XX)), h0) for s in range(NL)]
tail = np.stack(cols, 1)
# ilk sütunlar ortalama kesite yumuşakça geçer: gövdeyle ek yeri görünmez
w = np.clip(np.arange(NL) / (NL * .12), 0, 1)[None, :, None]
tail = prof[:, None, :] * (1 - w) + tail * w
tail = np.stack([np.stack([np.interp(np.linspace(0, NT - 1, OH), np.arange(NT), tail[:, j, i]) for i in range(4)], -1) for j in range(NL)], 1)
Image.fromarray(tail.clip(0, 255).astype(np.uint8)).save(f'{OUT}/kuyruk.png')

# sap bandı: süslerin sapla çakışan kısmı
yy, xx = np.mgrid[0:H, 0:W].astype(float)
xc = np.clip(xx, 440, 2140)
t = (yy - sp(xc)) * cosT(xc) / hsp(xc)
band = (np.abs(t) < 1.2) & (xx >= 430)
outside = A & ~band

def hull_mask(sel):
    m = np.zeros((H, W), np.uint8)
    pts = np.argwhere(sel)[:, ::-1].astype(np.int32)
    if len(pts) > 2: cv2.fillConvexPoly(m, cv2.convexHull(pts), 1)
    return m > 0

def piece(mask, anchorX, name, pad=6):
    """mask'taki pikselleri sapın anchorX'teki teğeti yatay olacak biçimde döndürüp kırpar; çapa = sap orta hattı"""
    ax, ay = anchorX, float(sp(anchorX)); ang = np.degrees(np.arctan(dsp(anchorX)))
    img = a.copy(); img[..., 3] *= mask
    M = cv2.getRotationMatrix2D((ax, ay), ang, 1.0)
    rot = cv2.warpAffine(img.astype(np.float32), M, (W, H), flags=cv2.INTER_LINEAR, borderValue=(0, 0, 0, 0))
    ys, xs_ = np.nonzero(rot[..., 3] > 8)
    x0, x1, y0, y1 = xs_.min() - pad, xs_.max() + pad, ys.min() - pad, ys.max() + pad
    crop = rot[y0:y1 + 1, x0:x1 + 1]
    ow, oh = int(round(crop.shape[1] * k)), int(round(crop.shape[0] * k))
    # yarı saydam kenarların renk saçağı olmasın: önce ön çarpım, küçült, geri böl
    pm = crop.copy(); pm[..., :3] *= pm[..., 3:] / 255
    small = cv2.resize(pm, (ow, oh), interpolation=cv2.INTER_AREA)
    small[..., :3] /= np.maximum(small[..., 3:], 1e-3) / 255
    Image.fromarray(small.clip(0, 255).astype(np.uint8)).save(f'{OUT}/{name}.png')
    return {'w': ow, 'h': oh, 'ax': round((ax - x0) / crop.shape[1], 4), 'ay': round((ay - y0) / crop.shape[0], 4),
            'size': round(crop.shape[1] / S, 3), 'u': round(cellsAt(anchorX), 3)}

r, g, b = a[..., 0], a[..., 1], a[..., 2]
X = xx
meta = {'cell': PX}
# baş: çiçekte yeşil yok; sapı yeşil olduğu için ayırmak kolay
head = A & (X < 540) & (r > g + 10)
pv = (XJ - PIVOT_BACK, float(sp(XJ)))
img = a.copy(); img[..., 3] *= head
ys, xs_ = np.nonzero(img[..., 3] > 8); x0, x1, y0, y1 = xs_.min() - 6, xs_.max() + 6, ys.min() - 6, ys.max() + 6
crop = img[y0:y1 + 1, x0:x1 + 1]; ow, oh = int(round(crop.shape[1] * k)), int(round(crop.shape[0] * k))
pm = crop.copy(); pm[..., :3] *= pm[..., 3:] / 255
small = cv2.resize(pm, (ow, oh), interpolation=cv2.INTER_AREA); small[..., :3] /= np.maximum(small[..., 3:], 1e-3) / 255
Image.fromarray(small.clip(0, 255).astype(np.uint8)).save(f'{OUT}/bas.png')
meta['head'] = {'w': ow, 'h': oh, 'ax': round((pv[0] - x0) / crop.shape[1], 4), 'ay': round((pv[1] - y0) / crop.shape[0], 4), 'size': round(crop.shape[1] / S, 3)}

def deco(x0, x1, hullsel=None):
    sel = outside & (X >= x0) & (X < x1)
    return sel | (A & band & hull_mask(sel if hullsel is None else hullsel))
leafA = deco(560, 960)
# tomurcuklar sapın arkasında çizilir: sapları ana sapın kenarına kadar alınır, kalanını oyundaki sap örter.
# Çapaları sapın ana sapa değdiği yerde, böylece gövde kıvrılınca da bağlantı yerinde kalırlar.
budA = outside & (X >= 960) & (X < 1220) | A & band & (X >= 1150) & (X < 1215) & (t < -.5)
blade = outside & (X >= 1220) & (X < 1590)                   # ikinci yaprak
petiole = outside & (X >= 1590) & (X < 1760) & (t < 0)      # yaprak sapı
budB = outside & (X >= 1560) & (X < 1760) & (t > 0) | A & band & (X >= 1580) & (X < 1700) & (t > .5)   # sarkan tomurcuk
leafB = blade | petiole | (A & band & hull_mask(blade))
meta['deco'] = [dict(piece(leafA, 770, 'yaprak1'), back=0), dict(piece(budA, 1185, 'tomurcuk'), back=1),
                dict(piece(leafB, 1400, 'yaprak2'), back=0), dict(piece(budB, 1625, 'tomurcuk2'), back=1)]
meta['stem'] = {'h': [round(float(hsp(XJ)) / S, 4), round(h0 / S, 4)], 'band': TB}
meta['tail'] = {'len': round(L / S, 3), 'u': round(cellsAt(XT), 3), 'tip': round(cellsAt(tipX), 3)}
json.dump(meta, open(f'{OUT}/yilan.json', 'w'), indent=1)
print(json.dumps(meta))

if len(sys.argv) > 1:   # önizleme: ayrılmış süsler açık zeminde
    allm = head | leafA | budA | leafB | budB
    im = a.copy(); im[..., 3] *= allm
    bg = np.zeros_like(a); bg[..., :3] = (235, 225, 200); bg[..., 3] = 255
    al = im[..., 3:] / 255; bg[..., :3] = bg[..., :3] * (1 - al) + im[..., :3] * al
    Image.fromarray(bg.astype(np.uint8)[150:560, 0:2172]).save(os.path.join(sys.argv[1], 'parcalar.png'))

/* =========================================================================
   İÇERİK
   Metinler yasasinsaglik.com'un /antibiyotik-direnci ve /siklamen sayfalarıyla
   aynı çizgide: tanı koymaz, tedavi önermez, ürün ya da marka adı geçmez.
   ========================================================================= */
export const COLS = 18, ROWS = 24;
const R = (x, y, w, h) => ({ x, y, w, h });

export const ACTS = ['Tıkanıklık', 'Virüs', 'Direnç'];

/* Sinüs şekilleri (önden kesit, 18×24): '#' kemik ve mukoza duvarı, '.' boşluk, '=' ostium kanalı (2 hücre geniş: telefonda kaydırarak isabet ettirmek kolay olsun).
   Duvara bitişik iki hücre katmanı oyunun başında şişkin mukozadır (kod hesaplar): iç katman
   tıkanıklık %40'ta, dış katman %80'de çekilir; ostium kanalı hedef tamamlanınca açılır.
   Kanal tahtanın kenarına ulaşmalı; çıkış oradan dışarıya açılır. */
const SHAPES = {
  // ters piramit; iç (burun tarafı) duvar sağda ve düz, ostium onun en üstünde
  maxillary: [
    '############==####',
    '############==####',
    '############==####',
    '##..............##',
    '#................#',
    '#................#',
    '#................#',
    '#................#',
    '#................#',
    '#................#',
    '##...............#',
    '##...............#',
    '###..............#',
    '###..............#',
    '####.............#',
    '#####............#',
    '######..........##',
    '#######.........##',
    '########.......###',
    '#########.....####',
    '##########...#####',
    '##################',
    '##################',
    '##################',
  ],
};

// antibiotic: mukus toplandığında kapsül çıkma olasılığı (tahtada virüs varken)
// flora: dokuda yaşayan zararsız bakteri sayısı; antibiyotik alınınca biri dirençli olur
export const LEVELS = [
  { act: 0, name: 'Burun boşluğu', desc: 'Kaydırarak yön ver, mukusları topla, sonra açılan çıkıştan akışı dışarı çıkar.',
    target: 6, step: 150, obs: [], gold: .35, serum: 0, breeze: 0, obj: [['clean', 25], ['time', 50]] },
  { act: 0, name: 'Konkalar', desc: 'Konkalar burnun yan duvarlarındaki kıvrımlı raflardır. Aralarından dolaşarak ilerle.',
    target: 8, step: 138, obs: [R(0,7,6,1), R(12,12,6,1), R(0,17,5,1)], gold: .25, serum: .18, breeze: 0, obj: [['sneeze', 1], ['clean', 30]] },
  { act: 1, name: 'Maksiller sinüs', desc: 'Sinüslerin en büyüğü; ağzı üst iç duvarda olduğu için akış yukarı tırmanmalı. Mukusu topladıkça şişlik çekilir. Virüs mukusa yapışır; virüslü mukusu topla, akış onu dışarı taşır.',
    target: 10, step: 128, obs: [], shape: SHAPES.maxillary, start: [9, 13], gold: .3, serum: .12, breeze: .14, virus: 2, virusEvery: 3, obj: [['virus', 2], ['gold', 1]] },
  { act: 1, name: 'Etmoid hücreler', desc: 'Virüsler temizlenmemiş dokuda çoğalır. Parlak kapsül cazip görünebilir ama antibiyotik virüse etki etmez.',
    target: 11, step: 122, obs: [R(2,6,5,1), R(11,6,5,1), R(3,12,5,1), R(10,12,5,1), R(2,17,4,1), R(12,17,4,1)], gold: .25, serum: .16, breeze: .14,
    virus: 2, replicate: 14000, virusMax: 5, antibiotic: .45, flora: 3, obj: [['noab', 0], ['clean', 40]] },
  { act: 2, name: 'Frontal sinüs', desc: 'Tıkaçlar ileri geri geziniyor. Gereksiz antibiyotik dokudaki bakterileri dirençli yapar; dirençli bakteri yolu kapatır.',
    target: 12, step: 116, obs: [R(3,10,2,2), R(13,10,2,2)], movers: [[2,5,1], [15,15,-1]], gold: .25, serum: .2, breeze: .14,
    virus: 2, replicate: 12000, virusMax: 5, antibiotic: .5, flora: 4, obj: [['noab', 0], ['virus', 3]] },
  { act: 2, name: 'Sfenoid sinüs', desc: 'Final. Bekleyen mukus sertleşir, virüsler çoğalır, kapsül yine karşına çıkar. Akışı sonuna kadar taşı.',
    target: 13, step: 110, obs: [R(3,6,2,2), R(13,6,2,2), R(2,13,4,1), R(12,13,4,1), R(6,3,6,1)], movers: [[2,17,1]], harden: 10000, gold: .25, serum: .2, breeze: .2,
    virus: 3, replicate: 11000, virusMax: 6, antibiotic: .5, flora: 5, obj: [['noab', 0], ['nohard', 0]] },
];
export const ENDLESS = { name: 'Serbest akış', desc: 'Bölüm yok, çıkış yok. Mukus topladıkça akış hızlanır. Virüslü mukusu topla, akış onu kuyruktan dışarı atar. Kapsüle dokunma.',
  target: Infinity, step: 135, obs: [], gold: .22, serum: .14, breeze: .14, virus: 1, replicate: 13000, virusMax: 6, respawn: 10000, antibiotic: .3, flora: 4 };
export const DEMO = { name: 'demo', target: Infinity, step: 118, obs: [], gold: 0, serum: 0, breeze: 0 };

// Her bölümü bitirince açılan bilgi kartı (bölüm sırasıyla)
export const FACTS = [
  ['🕸️', 'Mukus havadaki tozu ve mikropları yakalar. Silya denen minik tüycükler onu sürekli burun boşluğuna doğru taşır.'],
  ['🌬️', 'Burnun yan duvarlarında konka denen kıvrımlı yapılar vardır. Soluduğumuz havayı ısıtıp nemlendirirler.'],
  ['🦠', 'Akut sinüzit vakalarının %90-98\'i viraldir (CDC). Virüslere karşı antibiyotiklerin etkisi yoktur.'],
  ['💊', 'Antibiyotik direnci, bakterilerin antibiyotiklere yanıtının azalması ya da kaybolmasıdır. Direnç geliştiren kişi değil, bakteridir.'],
  ['🌍', 'Gereksiz ve yanlış antibiyotik kullanımı direnç gelişimini hızlandırır. 2021\'de dünyada yaklaşık 4,7 milyon ölüm antibiyotik direnciyle ilişkilendirildi (WHO).'],
  ['🌸', 'Siklamen (Cyclamen europaeum) özütü, burun mukozasında salgı akışını artırarak tıkalı sinüslerin boşalmasına yardımcı olur. Doğal çözümleri eczacınıza ve doktorunuza danışarak seçin.'],
];
// Son bölümün sonunda ve ara sıra ipucu olarak: oyun antibiyotiğe karşıymış gibi okunmasın
export const CLOSING = 'Antibiyotik gerektiğinde hayat kurtarır. Ne zaman gerektiğine hekim karar verir; reçetesiz kullanmayın, eczacınıza ve doktorunuza danışın.';

export const TIPS = [
  'Üç mukusu art arda hızlıca topla, hapşırma refleksi tetiklenir ve bonus puan kazanırsın.',
  'Kuyruğunu kenarlara yaslayarak ilerlersen ortada manevra alanın kalır.',
  'Altın siklamen yanıp sönmeye başladıysa kaybolmak üzeredir.',
  'Serum fizyolojik akışı yavaşlatır; dar geçitlerden önce almak işe yarar.',
  'Ferah esinti yakındaki mukusu sana doğru çeker.',
  'Tıkaçlar sadece yatay gider. Geçtikleri anda arkalarından dal.',
  'Titreyen mukus birazdan sertleşecek. Önce onu topla.',
  'Parmağını kaldırmadan kaydırmaya devam edersen art arda dönüş yapabilirsin.',
  'Virüsler mukusa yapışır. Virüslü mukusu toplayıp çıkışa taşırsan bonus alırsın.',
  'Temizlediğin dokuda virüsler çoğalamaz. Şişip titreyen virüs çoğalmak üzere.',
  'Virüse kafa atma, akış kısalır. Onları mukusa yönlendir.',
  'Parlak kapsül virüse etki etmez. Aldıkça dokudaki bakteriler dirençlenir ve yolu kapatır.',
  CLOSING,
];
export const SKINS = [
  // petal: taç yaprak, eye: yaprak dibindeki koyu leke, disc: yüzün olduğu orta kısım. petal -1 = gökkuşağı
  { name: 'Magenta',     need: 0,  petal: 0xF075B5, eye: 0x7E0B45, disc: 0xD6227F },
  { name: 'Pembe',       need: 3,  petal: 0xF9A3CB, eye: 0xC2185B, disc: 0xF06AAE },
  { name: 'Beyaz',       need: 6,  petal: 0xFFFFFF, eye: 0xC2185B, disc: 0xFBE3EE },
  { name: 'Mor',         need: 9,  petal: 0xA066D6, eye: 0x4A1A7A, disc: 0x8446C2 },
  { name: 'Kırmızı',     need: 13, petal: 0xE8434F, eye: 0x7D0F22, disc: 0xC9283A },
  { name: 'Gökkuşağı',   need: 18, petal: -1,       eye: 0x5A1A6E, disc: 0x7A3FD1 },
  { name: 'Klasik akış', need: 0,  classic: true, body: 0x1FB5A0, head: 0xD6227F },
];
export const BADGES = [
  ['first',   '💧', 'İlk damla',        'İlk mukusunu topla'],
  ['sneeze5', '🤧', 'Hapşırma ustası',  'Tek oyunda 5 hapşırma refleksi'],
  ['gold10',  '🌼', 'Altın toplayıcı',  'Toplam 10 altın siklamen'],
  ['len40',   '〰️', 'Uzun akış',        'Akışı 40 uzunluğa ulaştır'],
  ['clean60', '✨', 'Tertemiz',         'Bir bölümde alanın %60\'ı'],
  ['serum5',  '🧊', 'Sakin akış',       'Toplam 5 serum fizyolojik'],
  ['perfect', '🏅', 'Kusursuz',         'Bir bölümde üç yıldız'],
  ['noab',    '🛡️', 'Antibiyotiği koru', 'Kapsül çıkan her bölümü antibiyotiksiz bitir'],
  ['all',     '🗺️', 'Tüm sinüsler',     'Altı bölümü de bitir'],
  ['stars10', '⭐', 'Yıldız avcısı',    '10 yıldız topla'],
  ['starsAll','👑', 'Siklamen uzmanı',  '18 yıldızın hepsi'],
  ['endless', '🏃', 'Maraton',          'Serbest akışta 1000 puan'],
  ['virus20', '🦠', 'Kapı dışarı',      'Toplam 20 virüsü dışarı taşı'],
];
export const ITEM_INFO = {
  mucus:  ['Mukus', 'Topla, akış uzar'],
  gold:   ['Altın siklamen', 'Kısa süre görünür, bol puan'],
  serum:  ['Serum fizyolojik', 'Akış 6 sn yavaşlar'],
  breeze: ['Ferah esinti', 'Yakındaki mukusu çeker'],
  polyp:  ['Polip', 'Çarpma, etrafından dolan'],
  septum: ['Raf', 'Çarpma, etrafından dolan'],
  plug:   ['Tıkaç', 'İleri geri gider'],
  crust:  ['Sert mukus', 'Bekleyen mukus sertleşir'],
  virus:  ['Virüs', 'Çarpma, mukusa yapışmasını bekle'],
  infected: ['Virüslü mukus', 'Topla, çıkışa taşı: bonus'],
  antibiotic: ['Antibiyotik', 'Virüse etki etmez, dokunma'],
  flora:  ['Bakteri', 'Dokuda zararsız yaşar'],
  resist: ['Dirençli bakteri', 'Antibiyotikten sonra oluşur, çarpma'],
  swell:  ['Şişlik', 'Mukus topladıkça çekilir, sinüs genişler'],
};
export const GOAL_TEXT = {
  clean: v => `Temiz alan en az %${v}`, time: v => `${v} saniyenin altında bitir`, sneeze: v => `${v} hapşırma refleksi yap`,
  gold: v => `${v} altın siklamen topla`, len: v => `Akışı ${v} uzunluğa ulaştır`, nohard: () => 'Hiçbir mukus sertleşmesin',
  virus: v => `${v} virüsü dışarı taşı`, noinfect: () => 'Hiçbir virüs çoğalmasın', noab: () => 'Antibiyotiğe dokunmadan bitir',
};
export const REASONS = {
  wall: 'Akış mukoza duvarına çarptı.', polyp: 'Akış bir engele takıldı.', self: 'Akış kendi kuyruğuna dolandı.',
  plug: 'Bir tıkaç akışın önünü kesti.', crust: 'Sertleşmiş mukusa çarptın.', resist: 'Dirençli bakteriye çarptın.',
  swell: 'Akış şişmiş mukozaya çarptı.',
};

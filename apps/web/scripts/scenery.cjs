/*
 * O cenário, desenhado à mão em código: o chão, a grama, os canteiros, o
 * tijolo, a moita, o pilar, a muralha, os cantos com lanterna, as árvores e o
 * banco. Nada vem de imagem: cada peça é pintada pixel a pixel numa grade de
 * 32 px por célula e ampliada duas vezes (sem suavizar) para os 64 px de arte
 * que o atlas guarda.
 *
 * A regra que manda em tudo é a emenda. Uma peça de chão encosta em outra de
 * qualquer versão, então a borda de todas é a mesma: a junta de argamassa
 * fica na coluna 0 e na linha 0 da célula, e cada lajota mora inteira dentro
 * dela — a variação (musgo, rachadura, lajota faltando) é só por dentro. A
 * grama é ruído num toro (o pixel 31 continua no 0), e os canteiros são a
 * mesma grama com as flores por dentro. A muralha é uma fieira de pedras com
 * período igual à célula: a pedra que sai pela direita entra pela esquerda
 * da vizinha, e a dos lados só mostra a face de cima, com as pedras correndo
 * na vertical. As bordas iguais são conferidas em `src/art/atlas.test.ts`.
 *
 * A vista é de 3/4, como nos Bomberman clássicos: a face de cima do bloco
 * (clara) sobe 4 px de arte na célula de cima e a frente (escura) desce até o
 * chão da célula.
 */
const { PNG } = require("pngjs");

/** Pixels da grade de desenho por célula. */
const R = 32;
/** Fator de ampliação para a arte do atlas (64 px por célula). */
const UP = 2;

/* ------------------------------------------------------------------ cores */

const C = {
  mortar: [70, 58, 62],
  stone: [146, 132, 132],
  stoneLight: [172, 160, 158],
  stoneDark: [116, 102, 106],
  stoneWorn: [160, 150, 146],
  dirt: [96, 74, 58],
  dirtDark: [72, 54, 42],
  pebble: [138, 122, 112],
  moss: [92, 142, 60],
  mossLight: [128, 178, 76],
  mossDark: [64, 108, 46],

  grass: [86, 150, 62],
  grassDark: [68, 126, 50],
  grassLight: [108, 174, 78],

  brick: [196, 98, 54],
  brickLight: [224, 134, 80],
  brickDark: [150, 68, 38],
  brickTop: [230, 158, 104],
  brickTopLight: [244, 190, 140],
  brickMortar: [112, 58, 42],
  brickLine: [84, 40, 30],

  leafDark: [34, 92, 46],
  leaf: [62, 136, 58],
  leafLight: [110, 182, 80],
  leafHi: [164, 216, 112],
  outline: [26, 42, 30],

  wallTop: [186, 188, 194],
  wallTopLight: [214, 216, 222],
  wall: [140, 142, 152],
  wallLight: [164, 166, 176],
  wallDark: [102, 104, 116],
  wallMortar: [74, 76, 88],
  wallLine: [50, 52, 62],

  wood: [120, 78, 44],
  woodLight: [160, 110, 64],
  woodDark: [84, 54, 32],
  brass: [214, 166, 64],
  brassDark: [150, 110, 36],
  glow: [255, 216, 128],
  flame: [255, 150, 48],
  flameCore: [255, 240, 190],
  iron: [66, 66, 76],

  flowerRed: [228, 64, 56],
  flowerBlue: [86, 128, 230],
  flowerYellow: [246, 206, 64],
  flowerPink: [236, 124, 196],
  flowerWhite: [246, 240, 230],
  flowerCenter: [250, 220, 90],
};

/* ---------------------------------------------------------------- pintura */

/** Um número fixo em [0, 1) para uma semente e uma posição. */
function rnd(seed, x, y, k = 0) {
  let h = Math.imul(seed + 1, 374761393) ^ Math.imul(x + 101, 668265263) ^ Math.imul(y + 37, 2246822519) ^ Math.imul(k + 7, 3266489917);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Uma cor um pouco mais clara (k > 0) ou mais escura (k < 0). */
function shade([r, g, b], k) {
  const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k))));
  return [f(r), f(g), f(b)];
}

/** Uma tela de w×h na grade de desenho, transparente, com `wrap` para pintar num toro. */
class Canvas {
  constructor(w, h, wrap = false) {
    this.w = w;
    this.h = h;
    this.wrap = wrap;
    this.data = new Uint8Array(w * h * 4);
  }
  set(x, y, color) {
    if (this.wrap) {
      x = ((x % this.w) + this.w) % this.w;
      y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const i = (y * this.w + x) * 4;
    this.data[i] = color[0];
    this.data[i + 1] = color[1];
    this.data[i + 2] = color[2];
    this.data[i + 3] = 255;
  }
  get(x, y) {
    if (this.wrap) {
      x = ((x % this.w) + this.w) % this.w;
      y = ((y % this.h) + this.h) % this.h;
    } else if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null;
    const i = (y * this.w + x) * 4;
    return this.data[i + 3] ? [this.data[i], this.data[i + 1], this.data[i + 2]] : null;
  }
  rect(x0, y0, w, h, color) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, color);
  }
  hline(x0, x1, y, color) {
    for (let x = x0; x <= x1; x++) this.set(x, y, color);
  }
  vline(x, y0, y1, color) {
    for (let y = y0; y <= y1; y++) this.set(x, y, color);
  }
  /** Um disco (ou elipse) cheio. */
  disc(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, color);
      }
    }
  }
  /** Pinta por cima só onde já há pixel: a cor muda, a silhueta não. */
  discIn(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1 && this.get(x, y)) this.set(x, y, color);
      }
    }
  }
  /** Um contorno de 1 px em volta de tudo o que está pintado, para fora. */
  outline(color) {
    const src = new Uint8Array(this.data);
    const has = (x, y) => x >= 0 && y >= 0 && x < this.w && y < this.h && src[(y * this.w + x) * 4 + 3] > 0;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (has(x, y)) continue;
        if (has(x - 1, y) || has(x + 1, y) || has(x, y - 1) || has(x, y + 1)) this.set(x, y, color);
      }
    }
  }
  /** Grão: cada pixel pintado oscila um pouco de tom. */
  grain(seed, amount, k = 0) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.get(x, y);
        if (!c) continue;
        const d = (rnd(seed, x, y, k) - 0.5) * 2 * amount;
        this.set(x, y, shade(c, d));
      }
    }
  }
  /** Copia outra tela por cima, respeitando a transparência dela. */
  blit(src, ox, oy) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const c = src.get(x, y);
        if (c) this.set(ox + x, oy + y, c);
      }
    }
  }
  espelho() {
    const out = new Canvas(this.w, this.h, this.wrap);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const c = this.get(x, y);
      if (c) out.set(this.w - 1 - x, y, c);
    }
    return out;
  }
  /** A arte do atlas: cada pixel da grade vira UP×UP, sem suavizar. */
  toPNG() {
    const png = new PNG({ width: this.w * UP, height: this.h * UP });
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        for (let dy = 0; dy < UP; dy++) {
          for (let dx = 0; dx < UP; dx++) {
            const o = ((y * UP + dy) * this.w * UP + x * UP + dx) * 4;
            png.data[o] = this.data[i];
            png.data[o + 1] = this.data[i + 1];
            png.data[o + 2] = this.data[i + 2];
            png.data[o + 3] = this.data[i + 3];
          }
        }
      }
    }
    return png;
  }
}

/* ------------------------------------------------------------------ o chão */

/** Lajotas de 8 px numa grade 4×4: a junta na coluna/linha 0 de cada lajota. */
const PAVER = 8;

/**
 * O chão liso: a grade de lajotas, cada uma com o bisel (clara em cima e à
 * esquerda, escura embaixo e à direita) e o grão. É o mesmo em toda versão —
 * as outras só pintam por dentro das lajotas de dentro.
 */
function floorBase(seed) {
  const c = new Canvas(R, R);
  c.rect(0, 0, R, R, C.mortar);
  for (let py = 0; py < R / PAVER; py++) {
    for (let px = 0; px < R / PAVER; px++) {
      const x0 = px * PAVER + 1;
      const y0 = py * PAVER + 1;
      const tone = (rnd(seed, px, py) - 0.5) * 0.1;
      c.rect(x0, y0, PAVER - 1, PAVER - 1, shade(C.stone, tone));
      c.hline(x0, x0 + PAVER - 2, y0, shade(C.stoneLight, tone));
      c.vline(x0, y0, y0 + PAVER - 2, shade(C.stoneLight, tone));
      c.hline(x0, x0 + PAVER - 2, y0 + PAVER - 2, shade(C.stoneDark, tone));
      c.vline(x0 + PAVER - 2, y0, y0 + PAVER - 2, shade(C.stoneDark, tone));
    }
  }
  c.grain(seed, 0.05, 1);
  return c;
}

/** O retângulo de dentro de uma lajota (sem o bisel), para pintar por cima. */
const paverBox = (px, py) => [px * PAVER + 2, py * PAVER + 2, PAVER - 3, PAVER - 3];

/** Uma rachadura: um traço escuro que desce em zigue-zague por uma lajota. */
function crack(c, px, py, seed) {
  const [x0, y0, w, h] = paverBox(px, py);
  let x = x0 + Math.floor(rnd(seed, px, py, 2) * w);
  for (let y = y0 - 1; y < y0 + h + 1; y++) {
    c.set(x, y, C.stoneDark);
    c.set(x + 1, y, shade(C.stoneLight, 0.1));
    const r = rnd(seed, x, y, 3);
    if (r < 0.3) x = Math.max(x0, x - 1);
    else if (r > 0.7) x = Math.min(x0 + w - 1, x + 1);
  }
}

/** Musgo numa junta de dentro (as de fora são a borda, e ficam limpas). */
function mossJoint(c, px, py, seed, vertical) {
  // A junta à direita (vertical) ou abaixo (horizontal) da lajota (px, py).
  const jx = (px + 1) * PAVER;
  const jy = (py + 1) * PAVER;
  const len = PAVER - 2;
  for (let i = 0; i < len; i++) {
    const x = vertical ? jx : px * PAVER + 2 + i;
    const y = vertical ? py * PAVER + 2 + i : jy;
    const r = rnd(seed, x, y, 4);
    c.set(x, y, r < 0.6 ? C.moss : C.mossDark);
    if (r < 0.35) c.set(x + (vertical ? -1 : 0), y + (vertical ? 0 : -1), C.mossLight);
    if (r > 0.65) c.set(x + (vertical ? 1 : 0), y + (vertical ? 0 : 1), C.moss);
  }
}

/** Um tufo de musgo no canto de uma lajota, com os pontinhos claros. */
function mossPatch(c, px, py, seed) {
  const [x0, y0, w, h] = paverBox(px, py);
  const cx = x0 + (rnd(seed, px, py, 5) < 0.5 ? 1 : w - 2);
  const cy = y0 + (rnd(seed, px, py, 6) < 0.5 ? 1 : h - 2);
  c.disc(cx + 0.5, cy + 0.5, 2.6, 2.1, C.mossDark);
  c.disc(cx + 0.5, cy + 0.5, 1.8, 1.4, C.moss);
  c.set(cx, cy - 1, C.mossLight);
  c.set(cx - 1, cy, C.mossLight);
}

/** Uma lajota que falta: terra com pedrinhas no lugar dela. */
function missingPaver(c, px, py, seed) {
  const x0 = px * PAVER + 1;
  const y0 = py * PAVER + 1;
  c.rect(x0, y0, PAVER - 1, PAVER - 1, C.dirt);
  c.hline(x0, x0 + PAVER - 2, y0, C.dirtDark);
  c.vline(x0, y0, y0 + PAVER - 2, C.dirtDark);
  for (let i = 0; i < 4; i++) {
    const x = x0 + 1 + Math.floor(rnd(seed, px, py, 10 + i) * (PAVER - 3));
    const y = y0 + 1 + Math.floor(rnd(seed, px, py, 20 + i) * (PAVER - 3));
    c.set(x, y, C.pebble);
    c.set(x + 1, y, C.dirtDark);
  }
}

/** Uma lajota mais gasta, mais clara. */
function wornPaver(c, px, py) {
  const [x0, y0, w, h] = paverBox(px, py);
  c.rect(x0, y0, w, h, C.stoneWorn);
  c.hline(x0, x0 + w - 1, y0 + h - 1, shade(C.stoneWorn, -0.12));
  c.vline(x0 + w - 1, y0, y0 + h - 1, shade(C.stoneWorn, -0.12));
}

function floors() {
  const list = [];
  const n = R / PAVER;
  // 0: liso, o da maioria das células.
  list.push(floorBase(0));
  // 1: duas rachaduras.
  {
    const c = floorBase(0);
    crack(c, 1, 0, 11);
    crack(c, 2, 2, 12);
    list.push(c);
  }
  // 2: musgo nas juntas de dentro.
  {
    const c = floorBase(0);
    mossJoint(c, 0, 1, 21, true);
    mossJoint(c, 1, 1, 21, false);
    mossJoint(c, 2, 0, 22, true);
    mossJoint(c, 1, 2, 23, false);
    list.push(c);
  }
  // 3: uma lajota faltando, com terra.
  {
    const c = floorBase(0);
    missingPaver(c, 2, 1, 31);
    list.push(c);
  }
  // 4: tufos de musgo nos cantos das lajotas.
  {
    const c = floorBase(0);
    mossPatch(c, 0, 0, 41);
    mossPatch(c, 3, 2, 42);
    mossPatch(c, 1, 3, 43);
    list.push(c);
  }
  // 5: lajotas gastas.
  {
    const c = floorBase(0);
    wornPaver(c, 1, 1);
    wornPaver(c, 3, 0);
    wornPaver(c, 0, 3);
    list.push(c);
  }
  // 6: musgo pesado com uma rachadura.
  {
    const c = floorBase(0);
    mossJoint(c, 0, 0, 61, true);
    mossJoint(c, 0, 0, 61, false);
    mossJoint(c, 2, 1, 62, false);
    mossJoint(c, 1, 2, 63, true);
    mossPatch(c, 3, 3, 64);
    mossPatch(c, 2, 0, 65);
    crack(c, 0, 2, 66);
    list.push(c);
  }
  if (list.length !== 7 || n !== 4) throw new Error("o chão tem 7 versões numa grade 4×4");
  return list;
}

/* ----------------------------------------------------------------- a grama */

/** A grama lisa: ruído de três tons num toro, com uns tufos que atravessam a borda. */
function grassBase() {
  const c = new Canvas(R, R, true);
  for (let y = 0; y < R; y++) {
    for (let x = 0; x < R; x++) {
      const r = rnd(100, x, y);
      c.set(x, y, r < 0.12 ? C.grassDark : r > 0.9 ? C.grassLight : shade(C.grass, (rnd(100, x, y, 1) - 0.5) * 0.08));
    }
  }
  // Tufos: um "V" de dois tons, espalhados (o toro cuida do que sai pela borda).
  for (let i = 0; i < 14; i++) {
    const x = Math.floor(rnd(101, i, 0) * R);
    const y = Math.floor(rnd(101, i, 1) * R);
    c.set(x, y, C.grassDark);
    c.set(x - 1, y - 1, C.grassLight);
    c.set(x + 1, y - 1, C.grassDark);
    c.set(x, y - 2, C.grassLight);
  }
  return c;
}

/** Uma flor: quatro pétalas e o miolo. Fica por dentro (a borda é a grama). */
function flower(c, x, y, color) {
  c.set(x, y - 1, color);
  c.set(x - 1, y, color);
  c.set(x + 1, y, color);
  c.set(x, y + 1, color);
  c.set(x, y, C.flowerCenter);
  c.set(x - 1, y + 2, C.grassDark);
  c.set(x, y + 2, C.leaf);
}

/** Uma moita baixa: um disco de três tons. */
function clump(c, cx, cy, r) {
  c.disc(cx, cy + 0.5, r, r * 0.8, C.leafDark);
  c.disc(cx - 0.3, cy, r * 0.8, r * 0.65, C.leaf);
  c.disc(cx - r * 0.3, cy - r * 0.3, r * 0.4, r * 0.3, C.leafLight);
}

/** Dentro da célula, longe da borda: as flores e moitas nunca a tocam. */
const inner = (seed, i, k) => 4 + Math.floor(rnd(seed, i, k) * (R - 8));

function gardens(base) {
  const list = [];
  const fresh = () => {
    const c = new Canvas(R, R);
    c.blit(base, 0, 0);
    return c;
  };
  const colors = [C.flowerRed, C.flowerBlue, C.flowerYellow, C.flowerPink, C.flowerWhite];
  // 0..3: flores de uma cor dominante, com moitas.
  for (let v = 0; v < 4; v++) {
    const c = fresh();
    clump(c, inner(200 + v, 0, 0), inner(200 + v, 0, 1), 4);
    clump(c, inner(200 + v, 1, 0), inner(200 + v, 1, 1), 3);
    for (let i = 0; i < 5; i++) {
      const color = i < 3 ? colors[v] : colors[(v + 1 + i) % colors.length];
      flower(c, inner(210 + v, i, 0), inner(210 + v, i, 1), color);
    }
    list.push(c);
  }
  // 4: só moitas.
  {
    const c = fresh();
    clump(c, 10, 12, 5);
    clump(c, 21, 19, 5);
    clump(c, 20, 9, 3);
    list.push(c);
  }
  // 5: flores brancas e amarelas miúdas, muitas.
  {
    const c = fresh();
    for (let i = 0; i < 9; i++) {
      flower(c, inner(250, i, 0), inner(250, i, 1), i % 2 ? C.flowerWhite : C.flowerYellow);
    }
    list.push(c);
  }
  // 6: pedrinhas e uma moita.
  {
    const c = fresh();
    clump(c, 22, 20, 4);
    for (let i = 0; i < 6; i++) {
      const x = inner(260, i, 0);
      const y = inner(260, i, 1);
      c.set(x, y, C.pebble);
      c.set(x + 1, y, C.pebble);
      c.set(x, y + 1, shade(C.pebble, -0.3));
      c.set(x + 1, y + 1, shade(C.pebble, -0.3));
    }
    list.push(c);
  }
  return list;
}

/* --------------------------------------------------------------- os blocos */

/** A altura de um bloco de dentro: a célula mais 2 px lógicos (4 na grade) de face de cima. */
const BLOCK_H = R + 4;
/** Onde a face de cima acaba e a frente começa. */
const BLOCK_TOP = 12;

/** O tijolo: face de cima lisa, frente em fiadas de tijolo. */
function brick() {
  const c = new Canvas(R, BLOCK_H);
  // A face de cima, com um friso claro.
  c.rect(0, 0, R, BLOCK_TOP, C.brickTop);
  c.rect(2, 2, R - 4, BLOCK_TOP - 4, C.brickTopLight);
  c.rect(4, 4, R - 8, BLOCK_TOP - 8, C.brickTop);
  // A frente: fiadas de 6 px, tijolos de 16 px, cada fiada deslocada de meia.
  c.rect(0, BLOCK_TOP, R, BLOCK_H - BLOCK_TOP, C.brickMortar);
  const COURSE = 6;
  const BW = 16;
  for (let row = 0; (BLOCK_TOP + row * COURSE) < BLOCK_H; row++) {
    const y0 = BLOCK_TOP + row * COURSE + 1;
    const off = row % 2 ? BW / 2 : 0;
    for (let x = off - BW; x < R; x += BW) {
      const x0 = Math.max(0, x + 1);
      const x1 = Math.min(R - 1, x + BW - 1);
      if (x1 < x0) continue;
      const tone = (rnd(300, x, row) - 0.5) * 0.12;
      c.rect(x0, y0, x1 - x0 + 1, COURSE - 1, shade(C.brick, tone));
      c.hline(x0, x1, y0, shade(C.brickLight, tone));
      c.hline(x0, x1, y0 + COURSE - 2, shade(C.brickDark, tone));
    }
  }
  c.grain(301, 0.04);
  // O contorno: a aresta entre as faces e as bordas do bloco.
  c.hline(0, R - 1, BLOCK_TOP, C.brickLine);
  c.hline(0, R - 1, 0, C.brickLine);
  c.hline(0, R - 1, BLOCK_H - 1, C.brickLine);
  c.vline(0, 0, BLOCK_H - 1, C.brickLine);
  c.vline(R - 1, 0, BLOCK_H - 1, C.brickLine);
  return c;
}

/** A moita: um monte de folhagem arredondado, em quatro tons, com contorno. */
function bush() {
  const c = new Canvas(R, BLOCK_H);
  // A silhueta: um disco grande e uns menores por fora, para o recorte das folhas.
  c.disc(16, 20, 13.5, 13, C.leafDark);
  const bumps = [
    [6, 12, 5], [12, 7, 5.5], [20, 6, 5.5], [26, 12, 5], [28, 22, 4.5], [4, 22, 4.5], [10, 30, 4], [22, 30, 4],
  ];
  for (const [x, y, r] of bumps) c.disc(x, y, r, r * 0.9, C.leafDark);
  // As folhas: discos médios e claros deslocados para cima e à esquerda (a luz vem de lá).
  const leaves = [
    [9, 13, 5], [17, 10, 6], [24, 15, 5], [12, 22, 6], [22, 24, 5.5], [6, 20, 3.5], [27, 20, 3],
  ];
  for (const [x, y, r] of leaves) c.discIn(x, y, r, r * 0.85, C.leaf);
  for (const [x, y, r] of leaves) c.discIn(x - 1.2, y - 1.4, r * 0.6, r * 0.5, C.leafLight);
  for (const [x, y] of [[8, 11], [16, 8], [23, 13], [11, 20], [21, 22]]) c.set(x, y, C.leafHi);
  // Sombra embaixo e o grão das folhas.
  for (let y = BLOCK_H - 7; y < BLOCK_H; y++) {
    for (let x = 0; x < R; x++) {
      const col = c.get(x, y);
      if (col && rnd(400, x, y) < (y - (BLOCK_H - 8)) / 7) c.set(x, y, C.leafDark);
    }
  }
  c.grain(401, 0.05);
  c.outline(C.outline);
  return c;
}

/** O pilar: um bloco de pedra lavrada, face de cima clara, frente biselada. */
function pillar() {
  const c = new Canvas(R, BLOCK_H);
  c.rect(0, 0, R, BLOCK_TOP, C.wallTop);
  c.rect(2, 2, R - 4, BLOCK_TOP - 4, C.wallTopLight);
  c.rect(5, 4, R - 10, BLOCK_TOP - 7, C.wallTop);
  c.rect(0, BLOCK_TOP, R, BLOCK_H - BLOCK_TOP, C.wall);
  // O bisel da frente: a aresta de cima e a esquerda claras, a de baixo e a direita escuras.
  c.hline(1, R - 2, BLOCK_TOP + 1, C.wallLight);
  c.vline(1, BLOCK_TOP + 1, BLOCK_H - 2, C.wallLight);
  c.hline(1, R - 2, BLOCK_H - 2, C.wallDark);
  c.vline(R - 2, BLOCK_TOP + 1, BLOCK_H - 2, C.wallDark);
  // Um painel rebaixado no meio da frente.
  c.rect(6, BLOCK_TOP + 5, R - 12, BLOCK_H - BLOCK_TOP - 10, C.wallDark);
  c.rect(7, BLOCK_TOP + 6, R - 14, BLOCK_H - BLOCK_TOP - 12, C.wall);
  c.hline(7, R - 8, BLOCK_H - 7, C.wallLight);
  c.vline(R - 8, BLOCK_TOP + 6, BLOCK_H - 7, C.wallLight);
  c.grain(500, 0.04);
  c.hline(0, R - 1, BLOCK_TOP, C.wallLine);
  c.hline(0, R - 1, 0, C.wallLine);
  c.hline(0, R - 1, BLOCK_H - 1, C.wallLine);
  c.vline(0, 0, BLOCK_H - 1, C.wallLine);
  c.vline(R - 1, 0, BLOCK_H - 1, C.wallLine);
  return c;
}

/* --------------------------------------------------------------- a muralha */

/** Onde a face de cima da muralha acaba (ela cabe na célula: 32 de altura). */
const WALL_TOP = 10;

/**
 * A frente da muralha em fiadas de pedra, com período igual à largura: a
 * pedra cortada na direita continua na esquerda da célula vizinha. Serve
 * para a muralha (altura da célula) e para a torre do canto (mais alta).
 */
function stoneCourses(c, y0, y1, seed) {
  c.rect(0, y0, R, y1 - y0, C.wallMortar);
  const COURSE = 7;
  const SW = 16;
  for (let row = 0; y0 + row * COURSE < y1; row++) {
    const top = y0 + row * COURSE + 1;
    const bottom = Math.min(y1 - 1, top + COURSE - 2);
    const off = row % 2 ? SW / 2 : 0;
    for (let x = off - SW; x < R; x += SW) {
      const xa = Math.max(0, x + 1);
      const xb = Math.min(R - 1, x + SW - 1);
      if (xb < xa) continue;
      c.rect(xa, top, xb - xa + 1, bottom - top + 1, C.wall);
      c.hline(xa, xb, top, C.wallLight);
      if (x + 1 >= 0) c.vline(xa, top, bottom, C.wallLight);
      c.hline(xa, xb, bottom, C.wallDark);
      if (x + SW - 1 <= R - 1) c.vline(xb, top, bottom, C.wallDark);
    }
  }
  c.grain(seed, 0.04);
}

/** A muralha: a face de cima com o friso, e a frente em pedra. */
function wall() {
  const c = new Canvas(R, R);
  c.rect(0, 0, R, WALL_TOP, C.wallTop);
  c.hline(0, R - 1, 1, C.wallTopLight);
  c.hline(0, R - 1, WALL_TOP - 2, shade(C.wallTop, -0.1));
  stoneCourses(c, WALL_TOP, R, 600);
  c.hline(0, R - 1, WALL_TOP, C.wallLine);
  c.hline(0, R - 1, 0, C.wallLine);
  c.hline(0, R - 1, R - 1, C.wallLine);
  return c;
}

/**
 * A muralha dos lados: vista de cima, a fileira vertical só mostra a face de
 * cima (a frente só aparece na torre do canto, embaixo). As pedras correm na
 * vertical com período igual à altura: a célula de cima continua na de baixo.
 */
function wallSide() {
  const c = new Canvas(R, R, true);
  c.rect(0, 0, R, R, shade(C.wallTop, -0.08));
  const COURSE = 8;
  const SW = 16;
  for (let col = 0; col < R / SW; col++) {
    const off = col % 2 ? COURSE / 2 : 0;
    for (let y = off - COURSE; y < R; y += COURSE) {
      const x0 = col * SW + 1;
      const x1 = x0 + SW - 2;
      const y0 = y + 1;
      const y1 = y + COURSE - 1;
      const tone = (rnd(610, col, y) - 0.5) * 0.08;
      for (let yy = y0; yy <= y1; yy++) c.hline(x0, x1, yy, shade(C.wallTop, tone));
      c.hline(x0, x1, y0, shade(C.wallTopLight, tone));
      c.vline(x0, y0, y1, shade(C.wallTopLight, tone));
      c.hline(x0, x1, y1, shade(C.wallTop, tone - 0.12));
      c.vline(x1, y0, y1, shade(C.wallTop, tone - 0.12));
    }
  }
  c.grain(611, 0.03);
  c.vline(0, 0, R - 1, C.wallLine);
  c.vline(R - 1, 0, R - 1, C.wallLine);
  // A sombra da espessura, do lado de dentro e de fora.
  c.vline(1, 0, R - 1, C.wallDark);
  c.vline(R - 2, 0, R - 1, C.wallDark);
  c.wrap = false;
  return c;
}

/** O canto: uma torre de pedra mais alta, com a lanterna acesa pendurada na frente. */
function corner() {
  const H = R + 16;
  const c = new Canvas(R, H);
  const TOP = 12;
  // A face de cima, com o friso, e a frente em pedra.
  c.rect(0, 0, R, TOP, C.wallTop);
  c.rect(2, 2, R - 4, TOP - 4, C.wallTopLight);
  c.rect(4, 4, R - 8, TOP - 8, C.wallTop);
  stoneCourses(c, TOP, H, 601);
  c.hline(0, R - 1, TOP, C.wallLine);
  c.hline(0, R - 1, 0, C.wallLine);
  c.hline(0, R - 1, H - 1, C.wallLine);
  c.vline(0, 0, H - 1, C.wallLine);
  c.vline(R - 1, 0, H - 1, C.wallLine);
  // A luz na pedra em volta da lanterna.
  const lx = 16;
  const ly = 29;
  for (let y = ly - 10; y <= ly + 10; y++) {
    for (let x = lx - 11; x <= lx + 11; x++) {
      const col = c.get(x, y);
      if (!col || y <= TOP) continue;
      const d = Math.hypot(x - lx, (y - ly) * 1.1) / 11;
      if (d < 1) c.set(x, y, [
        Math.min(255, col[0] + Math.round((1 - d) * 60)),
        Math.min(255, col[1] + Math.round((1 - d) * 40)),
        col[2],
      ]);
    }
  }
  // O suporte e a lanterna: a caixa de latão com o fogo dentro.
  c.vline(lx, TOP + 2, ly - 7, C.iron);
  c.hline(lx - 1, lx + 1, ly - 7, C.iron);
  c.rect(lx - 4, ly - 6, 9, 13, C.brassDark);
  c.rect(lx - 3, ly - 5, 7, 11, C.brass);
  c.rect(lx - 2, ly - 4, 5, 9, C.glow);
  c.rect(lx - 1, ly - 2, 3, 6, C.flame);
  c.rect(lx, ly, 1, 3, C.flameCore);
  c.set(lx - 1, ly + 3, C.flameCore);
  c.set(lx + 1, ly + 3, C.flameCore);
  c.rect(lx - 2, ly - 6, 5, 1, C.brassDark);
  c.set(lx, ly - 7, C.brass);
  c.hline(lx - 4, lx + 4, ly + 6, C.iron);
  return c;
}

/* ---------------------------------------------------------------- árvores */

/** Uma árvore: copa redonda em três tons, tronco e contorno. Cada versão tem o seu verde e o seu recorte. */
function tree(v) {
  const W = 36;
  const H = 44;
  const c = new Canvas(W, H);
  const greens = [
    [C.leafDark, C.leaf, C.leafLight, C.leafHi],
    [[28, 78, 50], [48, 118, 62], [92, 160, 76], [140, 200, 100]],
    [[62, 92, 36], [104, 140, 46], [150, 182, 64], [196, 220, 100]],
    [[30, 84, 76], [52, 132, 104], [96, 176, 132], [150, 212, 164]],
  ][v];
  const [dark, mid, light, hi] = greens;
  // O tronco primeiro: a copa cai por cima.
  c.rect(15, 28, 6, 16, C.wood);
  c.vline(15, 28, 43, C.woodLight);
  c.vline(20, 28, 43, C.woodDark);
  c.rect(13, 41, 10, 3, C.wood);
  c.hline(13, 22, 43, C.woodDark);
  // A copa: a silhueta de discos, depois as camadas de luz.
  const seed = 700 + v;
  c.disc(18, 17, 15, 14, dark);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd(seed, i, 0) * 0.5;
    const r = 4 + rnd(seed, i, 1) * 2;
    c.disc(18 + Math.cos(a) * 12, 17 + Math.sin(a) * 11, r, r * 0.9, dark);
  }
  const leaves = [[11, 13, 6], [20, 9, 7], [26, 17, 5.5], [14, 23, 6.5], [23, 25, 5.5]];
  for (const [x, y, r] of leaves) c.discIn(x, y, r, r * 0.9, mid);
  for (const [x, y, r] of leaves) c.discIn(x - 1.4, y - 1.6, r * 0.6, r * 0.5, light);
  for (const [x, y] of [[9, 11], [19, 6], [25, 14], [12, 21], [21, 22], [16, 15]]) c.set(x, y, hi);
  // A sombra da parte de baixo da copa.
  for (let y = 24; y < 32; y++) {
    for (let x = 0; x < W; x++) {
      const col = c.get(x, y);
      if (col && col !== C.wood && rnd(seed, x, y, 9) < (y - 23) / 9 && y < 31) c.set(x, y, dark);
    }
  }
  c.grain(seed, 0.05, 2);
  c.outline(C.outline);
  return c;
}

/* ------------------------------------------------------------------ banco */

/** O banco de madeira: encosto de duas ripas, assento, pés de ferro. */
function bench() {
  const W = 42;
  const H = 18;
  const c = new Canvas(W, H);
  // Os pés e os braços de ferro.
  for (const x of [3, W - 5]) {
    c.rect(x, 2, 2, 15, C.iron);
    c.rect(x - 1, 16, 4, 2, C.iron);
  }
  c.hline(3, W - 4, 9, C.iron);
  // O encosto: duas ripas.
  for (const y of [2, 6]) {
    c.rect(1, y, W - 2, 3, C.wood);
    c.hline(1, W - 2, y, C.woodLight);
    c.hline(1, W - 2, y + 2, C.woodDark);
  }
  // O assento: mais largo, com a frente escura.
  c.rect(0, 10, W, 4, C.wood);
  c.hline(0, W - 1, 10, C.woodLight);
  c.hline(0, W - 1, 12, C.woodDark);
  c.hline(0, W - 1, 13, shade(C.woodDark, -0.2));
  c.grain(800, 0.05);
  c.outline([40, 26, 18]);
  return c;
}

/* ---------------------------------------------------------------- a saída */

/** Todas as peças do cenário, pelo nome que o atlas usa, já na escala da arte. */
function paintScenery() {
  const out = {};
  floors().forEach((c, i) => (out[`floor${i}`] = c));
  const grass = grassBase();
  out.grass = grass;
  gardens(grass).forEach((c, i) => (out[`garden${i}`] = c));
  out.brick = brick();
  out.bush = bush();
  out.pillar = pillar();
  const w = wall();
  out.wall_t = w;
  out.wall_b = w;
  const side = wallSide();
  out.wall_l = side;
  out.wall_r = side;
  const cornerArt = corner();
  out.corner_l = cornerArt;
  out.corner_r = cornerArt.espelho();
  for (let v = 0; v < 4; v++) out[`tree${v}`] = tree(v);
  out.bench = bench();
  return Object.fromEntries(Object.entries(out).map(([name, c]) => [name, c.toPNG()]));
}

const VARIANTS = { floor: 7, garden: 7, tree: 4 };

module.exports = { paintScenery, VARIANTS };

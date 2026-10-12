#!/usr/bin/env node
/*
 * Monta o atlas da arte a partir das imagens de referência:
 *
 *   node scripts/build-atlas.cjs <bomb-garden-arena.png> <bomb-sprite-sheet.png> \
 *                                <bomb-iso_walk_down-trimmed.png> <bomb-iso_walk_up-trimmed.png> \
 *                                <bomb-iso_walk_right-trimmed.png> \
 *                                <bomb-iso_idle_down-trimmed.png> <bomb-iso_idle_up-trimmed.png> \
 *                                <bomb-iso_idle_right-trimmed.png> <bomb-iso_idle_left-trimmed.png> \
 *                                <bomb-iso_custom_victory_down.png> <bomb-tileset.png> \
 *                                <bomb-fuse-sheet.png> <bomb-explosion-sheet.png> <bomb-items-sheet.png> \
 *                                <bomb-pierce-sheet.png> \
 *                                <enchanted_forest_tileset.png> <volcanic_fortress_tileset.png> \
 *                                <frozen_citadel_tileset.png> <cyberpunk_facility_tileset.png> \
 *                                <desert_temple_tileset.png> <bomb-social-items-sheet.png>
 *
 * Os cinco últimos são os tilesets dos temas novos (ver `themes.cjs`): cada um
 * dá ao atlas as mesmas peças de cenário que o da referência, com o nome do
 * tema na frente (`forest_floor0`, `volcano_wall_t`…). Depois deles, a folha
 * dos itens da troca e da invisibilidade (duas colunas, quatro quadros de
 * brilho, fundo transparente).
 *
 * A folha da vitória é o boneco de frente, na escala do parado, erguendo os
 * braços (25 quadros numa grade de 5×5). O tileset do cenário dá o chão, a
 * muralha com os merlões, o canto, o pilar e os tijolos. Só a moita continua
 * desenhada em código (`scenery.cjs`): o tileset não tem uma, e a planta da
 * arena não usa nenhuma. As três últimas são as folhas da bomba (parada,
 * pavio, pulso e estouro), da explosão modular (centro, braços e pontas em
 * oito quadros), dos itens (quatro quadros de brilho cada, a caveira
 * inclusive) e da bomba perfurante (vermelha, com a ponta dourada, nas mesmas
 * fases da bomba comum). Da arena antiga ficam só os corações do painel; da
 * folha de sprites, o retrato e a morte.
 *
 * Depois da arena e da folha vêm as folhas de caminhada (de frente, de costas
 * e de lado) e as do parado (de frente, de costas, de lado direito e de lado
 * esquerdo): quadros numa grade de ~256 px em ordem de leitura, sobre fundo
 * transparente (ou preto liso, que sai por inundação). As de caminhada estão
 * numa escala entre si e as do parado em outra, maior; cada conjunto ganha
 * uma só escala. Só existem em vermelho: as outras cores são recoloridas.
 * A caminhada para a esquerda é a direita espelhada; o parado de esquerda
 * tem folha própria.
 *
 * Cada sprite é recortado da referência (sem redesenhar nada), ganha fundo
 * transparente onde faz sentido e entra em `src/art/atlas.png`; a posição de
 * cada um fica em `src/art/atlas.json`. A arte é guardada em 4 px por pixel
 * lógico (uma célula de 16 px vira 64 px), que é perto da resolução nativa das
 * referências — é isso que deixa a tela em alta definição.
 *
 * As referências são geradas por IA e não estão numa grade exata, por isso as
 * coordenadas abaixo foram medidas uma a uma.
 */
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const { paintScenery } = require("./scenery.cjs");
const { THEMES, cutTheme } = require("./themes.cjs");

const [
  ,
  ,
  arenaPath,
  sheetPath,
  downPath,
  upPath,
  sidePath,
  idleDownPath,
  idleUpPath,
  idleRightPath,
  idleLeftPath,
  winPath,
  tilesetPath,
  bombSheetPath,
  explosionSheetPath,
  itemSheetPath,
  pierceSheetPath,
  ...rest
] = process.argv;
/** A ordem dos tilesets dos temas na linha de comando. */
const THEME_ORDER = ["forest", "volcano", "frozen", "cyber", "desert"];
const themePaths = rest.slice(0, THEME_ORDER.length);
const socialSheetPath = rest[THEME_ORDER.length];
if (!pierceSheetPath || rest.length !== THEME_ORDER.length + 1) {
  console.error(
    "uso: node scripts/build-atlas.cjs <arena.png> <sheet.png> <walk-down.png> <walk-up.png> <walk-side.png> " +
      "<idle-down.png> <idle-up.png> <idle-right.png> <idle-left.png> <victory-down.png> <scenario-tiles.png> " +
      "<bomb-sheet.png> <explosion-sheet.png> <items-sheet.png> <pierce-bomb-sheet.png> " +
      "<forest-tileset.png> <volcano-tileset.png> <frozen-tileset.png> <cyber-tileset.png> <desert-tileset.png> " +
        "<social-items-sheet.png>",
  );
  process.exit(1);
}

/** Pixels de arte por pixel lógico. */
const ART = 4;
/** Uma célula lógica de 16 px, em pixels de arte. */
const TILE = 16 * ART;
/** O personagem da folha tem ~121 px de altura; na arena ele mede 24 lógicos. */
const CHAR_SCALE = 0.8;
const CHAR_W = 24 * ART;
const CHAR_H = 28 * ART;

const arena = PNG.sync.read(fs.readFileSync(arenaPath));
const sheet = PNG.sync.read(fs.readFileSync(sheetPath));
const downSheet = PNG.sync.read(fs.readFileSync(downPath));
const upSheet = PNG.sync.read(fs.readFileSync(upPath));
const sideSheet = PNG.sync.read(fs.readFileSync(sidePath));
const idleSheets = {
  down: PNG.sync.read(fs.readFileSync(idleDownPath)),
  up: PNG.sync.read(fs.readFileSync(idleUpPath)),
  right: PNG.sync.read(fs.readFileSync(idleRightPath)),
  left: PNG.sync.read(fs.readFileSync(idleLeftPath)),
};
const winSheet = PNG.sync.read(fs.readFileSync(winPath));
const tileset = PNG.sync.read(fs.readFileSync(tilesetPath));
const bombSheet = PNG.sync.read(fs.readFileSync(bombSheetPath));
const explosionSheet = PNG.sync.read(fs.readFileSync(explosionSheetPath));
const itemSheet = PNG.sync.read(fs.readFileSync(itemSheetPath));
const pierceSheet = PNG.sync.read(fs.readFileSync(pierceSheetPath));
const socialSheet = PNG.sync.read(fs.readFileSync(socialSheetPath));

/* -------------------------------------------------------------- utilidades */

function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

function blank(w, h) {
  const out = new PNG({ width: w, height: h });
  out.data.fill(0);
  return out;
}

function crop(img, x, y, w, h) {
  const out = blank(w, h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const sx = x + xx;
      const sy = y + yy;
      if (sx < 0 || sy < 0 || sx >= img.width || sy >= img.height) continue;
      const i = (sy * img.width + sx) * 4;
      const o = (yy * w + xx) * 4;
      out.data[o] = img.data[i];
      out.data[o + 1] = img.data[i + 1];
      out.data[o + 2] = img.data[i + 2];
      out.data[o + 3] = img.data[i + 3];
    }
  }
  return out;
}

/** Redimensiona por média de área, pesando pelo alfa: as bordas ficam limpas. */
function resize(img, w, h) {
  if (img.width === w && img.height === h) return img;
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const x0 = (x * img.width) / w;
      const x1 = ((x + 1) * img.width) / w;
      const y0 = (y * img.height) / h;
      const y1 = ((y + 1) * img.height) / h;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx);
          const wy = Math.min(y1, sy + 1) - Math.max(y0, sy);
          const weight = wx * wy;
          const i = (sy * img.width + sx) * 4;
          const alpha = (img.data[i + 3] / 255) * weight;
          r += img.data[i] * alpha;
          g += img.data[i + 1] * alpha;
          b += img.data[i + 2] * alpha;
          a += alpha;
          n += weight;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out.data[o] = Math.round(r / a);
        out.data[o + 1] = Math.round(g / a);
        out.data[o + 2] = Math.round(b / a);
      }
      out.data[o + 3] = Math.round((255 * a) / n);
    }
  }
  return out;
}

/** Cabe em `w`×`h` mantendo a proporção. */
function fit(img, w, h) {
  const s = Math.min(w / img.width, h / img.height);
  return resize(img, Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
}

function scaleBy(img, s) {
  return resize(img, Math.max(1, Math.round(img.width * s)), Math.max(1, Math.round(img.height * s)));
}

/** Centraliza `img` numa tela `w`×`h`; com `bottom`, encosta no chão. */
function place(img, w, h, bottom = false) {
  const out = blank(w, h);
  const ox = Math.round((w - img.width) / 2);
  const oy = bottom ? h - img.height : Math.round((h - img.height) / 2);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= w || dy >= h) continue;
      const i = (y * img.width + x) * 4;
      const o = (dy * w + dx) * 4;
      out.data[o] = img.data[i];
      out.data[o + 1] = img.data[i + 1];
      out.data[o + 2] = img.data[i + 2];
      out.data[o + 3] = img.data[i + 3];
    }
  }
  return out;
}

/** Cola `src` em `dst` com o canto em (x, y), por cima do que havia. */
function paste(dst, src, x, y) {
  for (let yy = 0; yy < src.height; yy++) {
    for (let xx = 0; xx < src.width; xx++) {
      const dx = x + xx;
      const dy = y + yy;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      const i = (yy * src.width + xx) * 4;
      if (src.data[i + 3] === 0) continue;
      dst.data.set(src.data.subarray(i, i + 4), (dy * dst.width + dx) * 4);
    }
  }
  return dst;
}

function mirror(img) {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const o = (y * img.width + (img.width - 1 - x)) * 4;
      out.data.set(img.data.subarray(i, i + 4), o);
    }
  }
  return out;
}

/** Gira 90° no sentido horário. */
function rotate(img) {
  const out = blank(img.height, img.width);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const o = (x * out.width + (img.height - 1 - y)) * 4;
      out.data.set(img.data.subarray(i, i + 4), o);
    }
  }
  return out;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** O que a inundação a partir das quatro bordas alcança sem pisar em `sealed`: o "fora". */
function floodOutside(sealed, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (outside[i] || sealed[i]) return;
    outside[i] = 1;
    stack.push(i);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    const y = (i - x) / w;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  return outside;
}

/** Engorda uma máscara em `r` pixels (vizinhança quadrada). */
function dilate(mask, w, h, r) {
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < w && yy < h) out[yy * w + xx] = 1;
        }
      }
    }
  }
  return out;
}

/**
 * Tira o fundo liso da folha. O problema é a bomba: a metade na sombra é
 * quase da cor do fundo, e o aro dela tem furos — uma inundação ingênua entra
 * e deixa a bomba transparente. Então o "fora" é inundado a partir das bordas
 * numa máscara ENGORDADA em 2 px do que é claramente sprite (furos de até
 * 4 px ficam vedados), e depois encolhe de volta. O que sobra por dentro fica
 * opaco, seja da cor que for.
 */
function keyFlood(img, bg, tol) {
  const { width: w, height: h } = img;
  const far = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) far[y * w + x] = dist(px(img, x, y), bg) > tol ? 1 : 0;
  }
  const outside = floodOutside(dilate(far, w, h, 2), w, h);
  const gone = dilate(outside, w, h, 2);
  for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = gone[i] ? 0 : 255;
  // O contorno encostado no fundo fica meio transparente, para não deixar halo.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (gone[i]) continue;
      const edge =
        (x > 0 && gone[i - 1]) || (x < w - 1 && gone[i + 1]) || (y > 0 && gone[i - w]) || (y < h - 1 && gone[i + w]);
      if (!edge) continue;
      const d = dist(px(img, x, y), bg);
      if (d < tol * 1.6) img.data[i * 4 + 3] = Math.round(255 * Math.max(0.35, Math.min(1, (d - tol * 0.6) / tol)));
    }
  }
  return img;
}

/** Recorta a caixa justa do que sobrou opaco. */
function trim(img, pad = 0) {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] > 40) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return img;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(img.width - 1, x1 + pad);
  y1 = Math.min(img.height - 1, y1 + pad);
  return crop(img, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

const hueDiff = (a, b) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** A cor média (matiz, saturação, valor) do que é saturado numa imagem. */
function tint(img) {
  let sx = 0;
  let sy = 0;
  let s = 0;
  let v = 0;
  let n = 0;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const [r, g, b, a] = px(img, x, y);
      if (a < 128) continue;
      const [hh, ss, vv] = rgbToHsv(r, g, b);
      if (ss < 0.45 || vv < 0.3) continue;
      const rad = (hh * Math.PI) / 180;
      sx += Math.cos(rad);
      sy += Math.sin(rad);
      s += ss;
      v += vv;
      n++;
    }
  }
  let h = (Math.atan2(sy, sx) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { h, s: s / n, v: v / n };
}

/** Troca a cor do uniforme: o que é da matiz `from` vira a matiz `to`. */
function recolor(img, from, to) {
  const out = crop(img, 0, 0, img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const [h, s, v] = rgbToHsv(out.data[i], out.data[i + 1], out.data[i + 2]);
      if (s < 0.3 || hueDiff(h, from.h) > 35) continue;
      const nh = (h - from.h + to.h + 360) % 360;
      const ns = Math.min(1, s * (to.s / from.s));
      const nv = Math.min(1, v * (to.v / from.v));
      const [r, g, b] = hsvToRgb(nh, ns, nv);
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
    }
  }
  return out;
}

/**
 * As folhas da bomba, da explosão e dos itens têm fundo em degradê, com um
 * brilho em volta de cada sprite: não há UMA cor de fundo para inundar. Mas o
 * sprite é pixel art de borda dura e o fundo é liso; então a tinta é onde a
 * cor muda de repente (o contorno, os detalhes, as faíscas) ou, a partir de
 * `bright`, onde o canal mais fraco é claro (o miolo do fogo, que o degradê
 * laranja do fundo nunca alcança). O fundo é o que a inundação a partir das
 * bordas da janela alcança sem cruzar tinta engordada em 2 px; o que ela não
 * alcança (o miolo liso da bomba, o fogo) fica opaco, seja da cor que for.
 */
const INK_EDGE = 45;
function keyGradient(src, x, y, w, h, bright = 256) {
  const img = crop(src, x, y, w, h);
  const ink = new Uint8Array(w * h);
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const c = px(img, xx, yy);
      const l = px(img, Math.max(0, xx - 1), yy);
      const u = px(img, xx, Math.max(0, yy - 1));
      const change =
        Math.abs(c[0] - l[0]) + Math.abs(c[1] - l[1]) + Math.abs(c[2] - l[2]) +
        Math.abs(c[0] - u[0]) + Math.abs(c[1] - u[1]) + Math.abs(c[2] - u[2]);
      if (change > INK_EDGE || Math.min(c[0], c[1], c[2]) >= bright) ink[yy * w + xx] = 1;
    }
  }
  const outside = floodOutside(dilate(ink, w, h, 2), w, h);
  const gone = dilate(outside, w, h, 2);
  for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = gone[i] ? 0 : 255;
  return img;
}

/* ------------------------------------------------------------- os recortes */

const frames = new Map();
const add = (name, img) => frames.set(name, img);


/* Os corações do painel: o fundo escuro da moldura sai. */
const hudBg = px(arena, 255, 40);
// O coração apagado é quase da cor do fundo: usa a silhueta do cheio.
const heartFull = keyFlood(crop(arena, 262, 44, 36, 33), hudBg, 40);
const heartEmpty = crop(arena, 330, 44, 36, 33);
for (let i = 3; i < heartEmpty.data.length; i += 4) heartEmpty.data[i] = heartFull.data[i];
add("heart", trim(heartFull));
add("heart_empty", trim(heartEmpty));

/* A folha de sprites: fundo liso que sai por inundação. */
const sheetBg = px(sheet, 4, 4);
const cut = (x, y, w, h) => trim(keyFlood(crop(sheet, x, y, w, h), sheetBg, 24), 1);

/* A caveirinha da maldição: 7×6 lógicos pintados em código, em pixels de
 * ART de lado, para pairar sobre a cabeça de quem pegou a caveira. Osso
 * claro, olhos no roxo do item. */
const CURSE_MARK = [
  "..XXX..",
  ".XXXXX.",
  "XXoXoXX",
  "XXXXXXX",
  ".XXXXX.",
  ".X.X.X.",
];
const CURSE_INK = { X: [240, 236, 226, 255], o: [58, 24, 84, 255] };
{
  const img = blank(CURSE_MARK[0].length * ART, CURSE_MARK.length * ART);
  CURSE_MARK.forEach((line, py) => {
    [...line].forEach((ch, px2) => {
      const ink = CURSE_INK[ch];
      if (!ink) return;
      for (let y = 0; y < ART; y++) {
        for (let x = 0; x < ART; x++) img.data.set(ink, ((py * ART + y) * img.width + px2 * ART + x) * 4);
      }
    });
  });
  add("curse", img);
}

/* ------------------------------------------- a bomba, a explosão e os itens */

/* A bomba: a folha tem a parada, o pavio em seis quadros, o pulso em oito e o
 * estouro em dois, numa grade que não é exata — as janelas abaixo passam no
 * meio dos vãos medidos. Todos os quadros numa só escala, a do corpo da bomba
 * parada (12 px lógicos de largura, um pouco menos que a bomba antiga), de pé no chão de uma
 * célula de 24 lógicos de altura: as faíscas sobem acima da bomba. */
const BOMB_ROWS = [
  [20, 175],
  [175, 316],
  [316, 470],
];
const BOMB_COLS = [
  [0, 113],
  [113, 226],
  [226, 327],
  [327, 434],
  [434, 541],
  [541, 647],
  [647, 755],
  [755, 860],
];
/** Cada fase: a linha da folha, a primeira coluna e quantos quadros. */
const BOMB_PHASES = [
  ["idle", 0, 0, 1],
  ["fuse", 0, 1, 6],
  ["pulse", 1, 0, 8],
  ["boom", 2, 0, 2],
];
const BOMB_W = 12 * ART;
const BOMB_H = 24 * ART;
const bombCell = (row, col) => {
  const [y0, y1] = BOMB_ROWS[row];
  const [x0, x1] = BOMB_COLS[col];
  return trim(keyGradient(bombSheet, x0, y0, x1 - x0, y1 - y0));
};
/** A largura e o meio do que há entre as linhas `y0` e `y1` de um quadro: a faixa do corpo. */
function bodySpan(img, y0, y1) {
  let x0 = img.width;
  let x1 = -1;
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(img.height, Math.ceil(y1)); y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  return { width: x1 - x0 + 1, center: (x0 + x1 + 1) / 2 };
}
/** O meio do corpo da bomba comum: as faíscas pendem para um lado, então o corpo é o que fica nas últimas linhas. */
const bodyCenter = (img) => bodySpan(img, img.height - 12, img.height).center;
const BOMB_SCALE = BOMB_W / bombCell(0, 0).width;
for (const [phase, row, first, count] of BOMB_PHASES) {
  for (let i = 0; i < count; i++) {
    const img = scaleBy(bombCell(row, first + i), BOMB_SCALE);
    const out = blank(TILE, BOMB_H);
    paste(out, img, Math.round(TILE / 2 - bodyCenter(img)), BOMB_H - img.height);
    add(`bomb_${phase}${i}`, out);
  }
}

/* A bomba perfurante: folha própria (2048×768), vermelha e com uma ponta
 * dourada para baixo e para a direita, nas mesmas fases e na mesma ordem da
 * bomba comum. A ponta sai do corpo, então o corpo não é a caixa justa do
 * quadro: é a faixa da esfera, entre 45% e 60% da altura contados do chão
 * (acima da ponta, abaixo do pavio). É por ela que a bomba ganha a escala e o
 * centro, para a esfera ficar do tamanho e no lugar da bomba comum. */
const PIERCE_ROWS = [
  [10, 255],
  [255, 505],
  [505, 760],
];
const PIERCE_COLS = [
  [0, 258],
  [258, 516],
  [516, 775],
  [775, 1034],
  [1034, 1292],
  [1292, 1550],
  [1550, 1809],
  [1809, 2048],
];
const pierceCell = (row, col) => {
  const [y0, y1] = PIERCE_ROWS[row];
  const [x0, x1] = PIERCE_COLS[col];
  return trim(keyGradient(pierceSheet, x0, y0, x1 - x0, y1 - y0));
};
const sphere = (img) => bodySpan(img, img.height * 0.4, img.height * 0.55);
const PIERCE_SCALE = BOMB_W / sphere(pierceCell(0, 0)).width;
for (const [phase, row, first, count] of BOMB_PHASES) {
  for (let i = 0; i < count; i++) {
    const img = scaleBy(pierceCell(row, first + i), PIERCE_SCALE);
    const out = blank(TILE, BOMB_H);
    paste(out, img, Math.round(TILE / 2 - sphere(img).center), BOMB_H - img.height);
    add(`pierce_${phase}${i}`, out);
  }
}

/* A explosão modular: uma coluna por peça (o centro, o braço horizontal, o
 * vertical, as pontas esquerda, direita, de cima e de baixo; as duas últimas
 * colunas da folha são enfeites que não entram) e uma linha por quadro. A
 * célula da folha mede o que o braço mede no auge: é essa a escala da
 * grossura de tudo. Na folha só os quadros 3 e 4 chegam à borda da célula; os
 * outros ficam curtos (de 45% a 92%) e a cruz aparecia em pedaços soltos
 * metade do tempo. Então cada braço e cada ponta é esticado ao longo do seu
 * eixo até a lajota inteira em todo quadro que tenha fogo (a brasa final, o
 * quadro 7, fica solta como é). Mas o braço é uma lente, que afina até uma
 * ponta na borda: duas lajotas encostavam ponta com ponta e a cruz continuava
 * parecendo losangos soltos. Então o braço emenda nele mesmo, como a chama da
 * arena antiga fazia: é a união da lente com ela mesma deslocada meia lajota
 * (uma lente centrada na emenda) — na borda fica tão grosso quanto no meio, e
 * qualquer braço encosta em qualquer outro. O centro é a união dos dois
 * braços do quadro (a grossura na emenda bate por construção, e a estrela de
 * quatro pontas é o que a união de duas lentes dá), e a ponta ganha a meia
 * lente do braço do lado de dentro, para encostar com a mesma grossura. */
const EXPLOSION_COLS = [
  [25, 171],
  [171, 312],
  [314, 430],
  [430, 566],
  [566, 702],
  [702, 830],
  [830, 960],
];
const EXPLOSION_ROWS = [
  [20, 118],
  [118, 240],
  [240, 363],
  [363, 495],
  [495, 628],
  [628, 755],
  [755, 872],
  [872, 975],
];
const EXPLOSION_PIECES = { h: 1, v: 2, l: 3, r: 4, u: 5, d: 6 };
const FIRE_BRIGHT = 120;
const explosionCell = (col, row) => {
  const [y0, y1] = EXPLOSION_ROWS[row];
  const [x0, x1] = EXPLOSION_COLS[col];
  return trim(keyGradient(explosionSheet, x0, y0, x1 - x0, y1 - y0, FIRE_BRIGHT));
};
const EXPLOSION_CELL = Math.max(explosionCell(1, 3).width, explosionCell(2, 3).height);
const EXPLOSION_SCALE = TILE / EXPLOSION_CELL;
/** Um quadro cujo braço horizontal fica abaixo disso é brasa solta, não chama: nada nele estica. */
const STRETCH_FROM = 0.4;
/** A peça numa lajota: esticada ao longo do eixo (`"x"` ou `"y"`) até a borda, ou centrada se for brasa. */
function explosionPiece(cell, axis, stretch) {
  const w = axis === "x" && stretch ? TILE : Math.round(cell.width * EXPLOSION_SCALE);
  const h = axis === "y" && stretch ? TILE : Math.round(cell.height * EXPLOSION_SCALE);
  return place(resize(cell, Math.max(1, w), Math.max(1, h)), TILE, TILE);
}
/** A união de duas peças do mesmo tamanho: onde as duas têm fogo, fica a mais clara. */
function union(a, b) {
  const out = crop(a, 0, 0, a.width, a.height);
  for (let i = 0; i < out.data.length; i += 4) {
    const la = a.data[i] + a.data[i + 1] + a.data[i + 2];
    const lb = b.data[i] + b.data[i + 1] + b.data[i + 2];
    if (b.data[i + 3] > a.data[i + 3] || (b.data[i + 3] === a.data[i + 3] && lb > la)) {
      out.data.set(b.data.subarray(i, i + 4), i);
    }
  }
  return out;
}
/** A imagem deslocada meia lajota ao longo de `axis`, dando a volta: o meio vai para a borda. */
function halfShift(img, axis) {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const sx = axis === "x" ? (x + img.width / 2) % img.width : x;
      const sy = axis === "y" ? (y + img.height / 2) % img.height : y;
      const i = (sy * img.width + sx) * 4;
      out.data.set(img.data.subarray(i, i + 4), (y * img.width + x) * 4);
    }
  }
  return out;
}
/** Só a metade de `img` encostada no lado `side` ("l", "r", "t", "b"); o resto fica transparente. */
function half(img, side) {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const keep =
        side === "l" ? x < img.width / 2 : side === "r" ? x >= img.width / 2 : side === "t" ? y < img.height / 2 : y >= img.height / 2;
      if (!keep) continue;
      const i = (y * img.width + x) * 4;
      out.data.set(img.data.subarray(i, i + 4), i);
    }
  }
  return out;
}
for (let row = 0; row < EXPLOSION_ROWS.length; row++) {
  const cells = {};
  for (const [piece, col] of Object.entries(EXPLOSION_PIECES)) cells[piece] = explosionCell(col, row);
  // O quadro inteiro é fogo ou é brasa: a brasa (o quadro 7) não estica nem emenda, fica solta como é.
  const fire = cells.h.width >= STRETCH_FROM * EXPLOSION_CELL;
  const lensH = explosionPiece(cells.h, "x", fire);
  const lensV = explosionPiece(cells.v, "y", fire);
  const seamH = fire ? halfShift(lensH, "x") : blank(TILE, TILE);
  const seamV = fire ? halfShift(lensV, "y") : blank(TILE, TILE);
  const armH = union(lensH, seamH);
  const armV = union(lensV, seamV);
  add(`flame_h${row}`, armH);
  add(`flame_v${row}`, armV);
  add(`flame_center${row}`, union(armH, armV));
  add(`flame_l${row}`, union(explosionPiece(cells.l, "x", fire), half(seamH, "r")));
  add(`flame_r${row}`, union(explosionPiece(cells.r, "x", fire), half(seamH, "l")));
  add(`flame_u${row}`, union(explosionPiece(cells.u, "y", fire), half(seamV, "b")));
  add(`flame_d${row}`, union(explosionPiece(cells.d, "y", fire), half(seamV, "t")));
}

/* Os itens: uma coluna por item, quatro linhas de brilho, em moldura dourada
 * (`bomb-items-sheet.png`, a de 11:56, que trouxe a caveira). Da folha entram só os que o jogo
 * tem, que agora são todos: o fogo (alcance), a bomba (mais uma), a bota
 * (rapidez), a perfurante, o chute e a caveira (a maldição). Cada item tem uma escala só (a do maior dos quatro quadros) e é
 * recortado pelo mesmo retângulo nos quatro, para o brilho mudar sem o item
 * sair do lugar. */
const ITEM_COLS = [
  [30, 275],
  [275, 522],
  [522, 768],
  [768, 1015],
  [1015, 1262],
  [1262, 1508],
];
const ITEM_ROWS = [
  [28, 264],
  [264, 503],
  [503, 741],
  [741, 980],
];
const ITEMS = { fire: 0, bomb: 1, boot: 2, pierce: 3, kick: 4, skull: 5 };
for (const [kind, col] of Object.entries(ITEMS)) {
  const [x0, x1] = ITEM_COLS[col];
  addItem(kind, ITEM_ROWS.map(([y0, y1]) => keyGradient(itemSheet, x0, y0, x1 - x0, y1 - y0)));
}

/* A troca e a invisibilidade (`bomb-social-items-sheet.png`, de 2026-10-12):
 * a mesma moldura dourada, uma coluna cada, quatro quadros de brilho, e o
 * fundo já transparente — só se recorta a janela. */
const SOCIAL_COLS = [
  [50, 440],
  [455, 840],
];
const SOCIAL_ROWS = [
  [50, 440],
  [455, 850],
  [860, 1255],
  [1265, 1660],
];
const SOCIAL_ITEMS = { swap: 0, ghost: 1 };
for (const [kind, col] of Object.entries(SOCIAL_ITEMS)) {
  const [x0, x1] = SOCIAL_COLS[col];
  addItem(kind, SOCIAL_ROWS.map(([y0, y1]) => crop(socialSheet, x0, y0, x1 - x0, y1 - y0)));
}

/** Um item: os quatro quadros pelo mesmo retângulo (a união deles), numa escala só. */
function addItem(kind, cells) {
  // O retângulo justo da união dos quatro quadros, em coordenadas da janela.
  const box = { x0: Infinity, y0: Infinity, x1: -1, y1: -1 };
  for (const cell of cells) {
    for (let y = 0; y < cell.height; y++) {
      for (let x = 0; x < cell.width; x++) {
        if (cell.data[(y * cell.width + x) * 4 + 3] === 0) continue;
        box.x0 = Math.min(box.x0, x);
        box.y0 = Math.min(box.y0, y);
        box.x1 = Math.max(box.x1, x);
        box.y1 = Math.max(box.y1, y);
      }
    }
  }
  cells.forEach((cell, i) => {
    const img = crop(cell, box.x0, box.y0, box.x1 - box.x0 + 1, box.y1 - box.y0 + 1);
    add(`pu_${kind}${i}`, place(fit(img, TILE - 4, TILE - 4), TILE, TILE));
  });
}

/* Os personagens: uma linha por cor, as colunas iguais. A linha é a faixa de
 * `y` de cada cor; a coluna é uma janela em `x` que o recorte justo aperta. */
const ROWS = [
  { y: 66, h: 140 }, // vermelho
  { y: 248, h: 140 }, // azul
  { y: 430, h: 140 }, // verde
  { y: 612, h: 140 }, // amarelo
];
const COLS = {
  down0: [116, 76], // de frente, parado: só o retrato do painel e a matiz de cada cor
};

function sprite(row, [x, w]) {
  return scaleBy(cut(x, ROWS[row].y, w, ROWS[row].h), CHAR_SCALE);
}
const character = (img) => place(img, CHAR_W, CHAR_H, true);

const tints = ROWS.map((_, row) => tint(sprite(row, COLS.down0)));

/* As folhas de caminhada e do parado: geradas na mesma escala dentro de cada
 * conjunto, numa grade de ~256 px que não é exata, em ordem de leitura. Uma
 * folha já transparente entra como está. Uma folha sobre preto liso (o
 * contorno do boneco também é preto) tem o fundo tirado por inundação a
 * partir das bordas, mas o preto encostado no uniforme (até WALK_OUTLINE px)
 * fica: é o contorno. Os quadros são achados pelas faixas de linhas e colunas
 * com sprite, não por uma grade fixa. Só existem em vermelho. */
const WALK_OUTLINE = 6;
const WALK_BG_TOL = 40;
function keyWalk(src) {
  const img = crop(src, 0, 0, src.width, src.height);
  const { width: w, height: h } = img;
  let transparent = false;
  for (let i = 3; i < img.data.length && !transparent; i += 4) transparent = img.data[i] < 255;
  if (transparent) return img; // já vem recortada
  const body = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    body[i] = Math.max(img.data[i * 4], img.data[i * 4 + 1], img.data[i * 4 + 2]) > WALK_BG_TOL ? 1 : 0;
  }
  const outside = floodOutside(dilate(body, w, h, WALK_OUTLINE), w, h);
  for (let i = 0; i < w * h; i++) img.data[i * 4 + 3] = outside[i] ? 0 : 255;
  return img;
}

/** As faixas de linhas (`axis` = "y") ou colunas ("x") com algo opaco: [início, fim). */
function bands(img, axis) {
  const n = axis === "y" ? img.height : img.width;
  const m = axis === "y" ? img.width : img.height;
  const has = [];
  for (let i = 0; i < n; i++) {
    let any = false;
    for (let j = 0; j < m && !any; j++) {
      const x = axis === "y" ? j : i;
      const y = axis === "y" ? i : j;
      any = img.data[(y * img.width + x) * 4 + 3] > 0;
    }
    has.push(any);
  }
  const runs = [];
  for (let i = 0; i <= n; i++) {
    const on = i < n && has[i];
    if (on && (runs.length === 0 || runs[runs.length - 1].closed)) runs.push({ start: i, end: n, closed: false });
    if (!on && runs.length && !runs[runs.length - 1].closed) {
      runs[runs.length - 1].end = i;
      runs[runs.length - 1].closed = true;
    }
  }
  // Sujeira e contornos partidos: junta faixas separadas por menos de 8 px, descarta as finas.
  const merged = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.start - last[1] < 8) last[1] = run.end;
    else merged.push([run.start, run.end]);
  }
  return merged.filter(([s, e]) => e - s >= 40);
}

function walkFrames(sheet, idle) {
  const img = keyWalk(sheet);
  const all = [];
  for (const [y0, y1] of bands(img, "y")) {
    for (const [x0, x1] of bands(img, "x")) {
      const cell = crop(img, x0, y0, x1 - x0, y1 - y0);
      const frame = trim(cell, 1);
      if (frame === cell) continue; // célula vazia: `trim` não achou nada
      all.push(frame);
    }
  }
  return [...all.slice(idle), ...all.slice(0, idle)];
}
/* ---------------------------------------------------------------- o cenário */

/*
 * O tileset do cenário (1536×1024) é gerado por IA e não está numa grade
 * exata: as lajotas têm ~68 px, os tijolos ~60 num passo de ~76, a muralha
 * ~70. Cada peça foi medida uma a uma, pelas faixas de alfa entre as peças e
 * pelas juntas escuras entre as lajotas. O que é opaco vem com alfa ~249 (a
 * imagem inteira tem um véu), então o alfa sobe para 255 antes do recorte.
 */
for (let i = 3; i < tileset.data.length; i += 4) tileset.data[i] = Math.min(255, Math.round((tileset.data[i] * 255) / 249));
const tile = (x, y, w, h) => crop(tileset, x, y, w, h);

/* O chão: duas fileiras de 22 lajotas, recortadas de junta a junta. A junta
 * escura fica na coluna e na linha 0 de cada lajota, como no chão pintado:
 * qualquer uma encosta em qualquer outra e a junta sai única. */
const FLOOR_X = [11, 75, 143, 210, 280, 345, 413, 482, 552, 626, 695, 767, 835, 903, 978, 1048, 1118, 1188, 1257, 1326, 1393, 1461, 1525];
const FLOOR_Y = [10, 78, 145];
let floorCount = 0;
for (let r = 0; r < FLOOR_Y.length - 1; r++) {
  for (let c = 0; c < FLOOR_X.length - 1; c++) {
    const img = resize(tile(FLOOR_X[c], FLOOR_Y[r], FLOOR_X[c + 1] - FLOOR_X[c], FLOOR_Y[r + 1] - FLOOR_Y[r]), TILE, TILE);
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
    add(`floor${floorCount++}`, img);
  }
}

/* Os tijolos: duas fileiras de 20, cada um com o seu musgo; o pilar: um só
 * (os 20 da fileira são iguais). Na referência o bloco enche a célula de alto
 * a baixo e deixa uma fresta de chão nos lados: cabe em 60×64, no chão da célula. */
const BRICK_X = [12, 86, 161, 240, 316, 395, 471, 550, 624, 701, 775, 851, 928, 1006, 1083, 1160, 1236, 1312, 1388, 1464];
const BRICK_W = 61;
let brickCount = 0;
for (const y of [445, 515]) {
  for (const x of BRICK_X) add(`brick${brickCount++}`, place(fit(tile(x, y, BRICK_W, 64), 60, TILE), TILE, TILE, true));
}
add("pillar", place(fit(tile(15, 378, 56, 59), 60, TILE), TILE, TILE, true));

/* A muralha de cima e a de baixo: duas pedras da fieira de cima e as duas
 * fieiras da frente, de uma peça lisa (sem merlão). O corte é na junta, então
 * a peça emenda com ela mesma: a fieira de baixo fica em aparelho corrido. */
const wallTile = resize(tile(1118, 316, 50, 52), TILE, TILE);
for (let i = 3; i < wallTile.data.length; i += 4) wallTile.data[i] = 255;
add("wall_t", wallTile);
add("wall_b", wallTile);

/* A muralha dos lados, como a referência a mostra: do lado de fora, uma
 * coluna de pedras (a da coluna curta que dá o bloco claro, esticada à
 * célula) em que os blocos claros se apoiam; do lado de dentro, a frente da
 * muralha girada, com as pedras miúdas correndo na vertical. A da direita é
 * o espelho da esquerda. */
const SIDE_OUT = 33;
const WALL_TOP_ROWS = Math.round((27 / 52) * TILE); // a fieira clara ocupa 27 dos 52 px da peça
const sideStones = resize(tile(781, 180, 31, 37), SIDE_OUT, TILE);
const sideFront = rotate(rotate(rotate(crop(wallTile, 0, WALL_TOP_ROWS, TILE, TILE - WALL_TOP_ROWS))));
const wallLeft = blank(TILE, TILE);
paste(wallLeft, sideStones, 0, 0);
paste(wallLeft, sideFront, SIDE_OUT, 0);
for (let i = 3; i < wallLeft.data.length; i += 4) wallLeft.data[i] = 255;
add("wall_l", wallLeft);
add("wall_r", mirror(wallLeft));

/* O merlão: a coluna que sobe da muralha de cima e da de baixo, com a face
 * clara em cima e as pedras até o chão da muralha. Vem da muralha longa de
 * três merlões; na referência ele mede 0,43 célula de largura por 1,3 de
 * altura. A face que coroa a muralha dos lados é só o bloco claro de uma
 * coluna curta, deitado para fora. */
const merlon = resize(tile(29, 224, 24, 68), 28, 84);
add("orn_t0_0", merlon);
add("orn_b0_0", merlon);
const cap = resize(tile(781, 149, 31, 30), 34, 30);
add("orn_l0_0", cap);
add("orn_r0_0", mirror(cap));
/* Como a referência coroa a muralha: uma série de merlões em cima e embaixo e uma de blocos nos lados, a cada
 * célula e meia, a duas células do canto; os blocos dos lados encostam na borda de fora. */
const GARDEN_WALLS = {
  bottom: "same",
  top: [{ pitch: 1.5, margin: 2, pieces: 1, center: false, skipCenter: false }],
  side: [{ pitch: 1.5, margin: 2, pieces: 1, center: false, skipCenter: false }],
  sideAnchor: "outer",
};

/* O canto: o bloco quadrado grande, com a moldura e a base. Na referência ele
 * passa um pouco da célula da muralha para fora e para cima. */
add("corner", resize(tile(973, 225, 56, 65), 72, 84));

/* A moita é a única peça ainda desenhada em código: o tileset não tem uma. */
add("bush", paintScenery().bush);
const VARIANTS = { floor: floorCount, brick: brickCount };

/* Os temas novos: cada tileset dá as mesmas peças, com o nome do tema na frente. */
const THEME_VARIANTS = {};
THEME_ORDER.forEach((id, i) => {
  const sheet = PNG.sync.read(fs.readFileSync(themePaths[i]));
  if (sheet.width !== 1536 || sheet.height !== 1024) throw new Error(`o tileset de ${id} tem de medir 1536×1024`);
  const cut = cutTheme(id, sheet, { TILE, crop, resize, fit, place, mirror, rotate, blank, paste });
  for (const [name, img] of cut.frames) add(name, img);
  THEME_VARIANTS[id] = { ...cut.variants, walls: { ...cut.walls, sideAnchor: "center" } };
});
if (Object.keys(THEMES).length !== THEME_ORDER.length) throw new Error("há tema sem tileset na linha de comando");

const downFrames = walkFrames(downSheet, 0);
const upFrames = walkFrames(upSheet, 0);
const sideFrames = walkFrames(sideSheet, 0);
const idleFrames = Object.fromEntries(Object.entries(idleSheets).map(([facing, sheet]) => [facing, walkFrames(sheet, 0)]));
/* A vitória: a mesma folha-grade, na escala do parado (o boneco está parado quando vence). */
const winFrames = walkFrames(winSheet, 0);

const artHeight = (list) => Math.max(...list.map((f) => f.height));
const WALK_ART_HEIGHT = { down: artHeight(downFrames), up: artHeight(upFrames), side: artHeight(sideFrames) };
const IDLE_ART_HEIGHT = Object.fromEntries(Object.entries(idleFrames).map(([facing, list]) => [facing, artHeight(list)]));
/** O boneco andando mede 100 px de arte (25 lógicos): as três folhas na MESMA escala, pelo quadro mais alto. */
const WALK_HEIGHT = 100;
const WALK_SCALE = WALK_HEIGHT / Math.max(...Object.values(WALK_ART_HEIGHT));
/* O parado é desenhado maior e respira (a altura sobe e desce); o que não muda
 * é a largura do corpo. Então a escala do parado iguala a largura mediana dos
 * quadros dele à da caminhada, e o boneco não "engorda" ao parar. */
const median = (list) => list.slice().sort((a, b) => a - b)[list.length >> 1];
const walkWidth = median([...downFrames, ...upFrames, ...sideFrames].map((f) => f.width)) * WALK_SCALE;
/** Ajuste a olho: mesmo com a largura igual, o parado ainda parecia um pouco grande demais. */
const IDLE_SHRINK = 0.94;
const IDLE_SCALE = (IDLE_SHRINK * walkWidth) / median(Object.values(idleFrames).flat().map((f) => f.width));
const walkArt = (img) => scaleBy(img, WALK_SCALE);
const idleArt = (img) => scaleBy(img, IDLE_SCALE);
const redTint = tint(sideFrames[0]);
/** O uniforme vermelho da folha nova na matiz da cor de cada vaga. */
const colored = (img, row) => (row === 0 ? img : recolor(img, redTint, tints[row]));

for (let row = 0; row < ROWS.length; row++) {
  const c = `c${row}`;
  const down0 = sprite(row, COLS.down0);
  // As caminhadas vêm das folhas novas; a esquerda é a direita espelhada.
  downFrames.forEach((img, i) => add(`${c}_down${i}`, character(colored(walkArt(img), row))));
  upFrames.forEach((img, i) => add(`${c}_up${i}`, character(colored(walkArt(img), row))));
  sideFrames.forEach((img, i) => {
    const right = colored(walkArt(img), row);
    add(`${c}_right${i}`, character(right));
    add(`${c}_left${i}`, character(mirror(right)));
  });
  // O parado: cada direção tem a própria folha, inclusive a esquerda.
  for (const [facing, list] of Object.entries(idleFrames)) {
    list.forEach((img, i) => add(`${c}_idle_${facing}${i}`, character(colored(idleArt(img), row))));
  }
  // A vitória: os braços para cima, quadro a quadro, na escala do parado.
  winFrames.forEach((img, i) => add(`${c}_win${i}`, character(colored(idleArt(img), row))));
  // O retrato do painel: a cabeça do boneco de frente.
  add(`${c}_head`, crop(down0, 0, 0, down0.width, Math.round(down0.height * 0.58)));
}

const WALK = { down: downFrames.length, up: upFrames.length, left: sideFrames.length, right: sideFrames.length };
const IDLE = Object.fromEntries(Object.entries(idleFrames).map(([facing, list]) => [facing, list.length]));

/* A morte só existe em vermelho na folha; as outras cores são o uniforme
 * recolorido para a matiz de cada linha. */
const DEATH = [
  [828, 846, 76, 104],
  [906, 846, 92, 104],
  [1000, 846, 96, 104],
  [1078, 846, 90, 104],
];
DEATH.forEach(([x, y, w, h], i) => {
  const red = scaleBy(cut(x, y, w, h), CHAR_SCALE);
  for (let row = 0; row < ROWS.length; row++) {
    const img = row === 0 ? red : recolor(red, tints[0], tints[row]);
    add(`c${row}_dead${i}`, character(img));
  }
});

/* ---------------------------------------------------------------- o atlas */

/* Com os seis temas o atlas tem ~1400 quadros: em 2048 de largura fica mais quadrado que comprido. */
const ATLAS_W = 2048;
const GAP = 2;
const entries = [...frames.entries()].sort((a, b) => b[1].height - a[1].height || a[0].localeCompare(b[0]));
let cx = GAP;
let cy = GAP;
let shelf = 0;
const placed = {};
for (const [name, img] of entries) {
  if (cx + img.width + GAP > ATLAS_W) {
    cx = GAP;
    cy += shelf + GAP;
    shelf = 0;
  }
  placed[name] = { x: cx, y: cy, w: img.width, h: img.height };
  cx += img.width + GAP;
  shelf = Math.max(shelf, img.height);
}
const ATLAS_H = cy + shelf + GAP;
const atlas = blank(ATLAS_W, ATLAS_H);
for (const [name, img] of entries) {
  const { x, y } = placed[name];
  for (let yy = 0; yy < img.height; yy++) {
    const i = yy * img.width * 4;
    atlas.data.set(img.data.subarray(i, i + img.width * 4), ((y + yy) * ATLAS_W + x) * 4);
  }
}

/* Onde começa a cabeça no quadro do boneco: a primeira linha com pixel do
 * parado de frente, em pixels lógicos. O quadro tem folga em cima, e a
 * caveirinha da maldição encosta na cabeça, não na folga. */
function headTop(img) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) if (img.data[(y * img.width + x) * 4 + 3] > 40) return Math.floor(y / ART);
  }
  return 0;
}
const HEAD_TOP = headTop(frames.get("c0_idle_down0"));

const outDir = path.join(__dirname, "..", "src", "art");
fs.writeFileSync(path.join(outDir, "atlas.png"), PNG.sync.write(atlas));
fs.writeFileSync(
  path.join(outDir, "atlas.json"),
  `${JSON.stringify(
    {
      scale: ART,
      walk: WALK,
      idle: IDLE,
      win: winFrames.length,
      variants: VARIANTS,
      walls: GARDEN_WALLS,
      themes: THEME_VARIANTS,
      walkArtHeight: WALK_ART_HEIGHT,
      idleArtHeight: IDLE_ART_HEIGHT,
      winArtHeight: artHeight(winFrames),
      headTop: HEAD_TOP,
      frames: placed,
    },
    null,
    2,
  )}\n`,
);
console.log(`atlas ${ATLAS_W}x${ATLAS_H}, ${entries.length} quadros`);

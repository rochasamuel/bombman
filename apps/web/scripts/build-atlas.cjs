#!/usr/bin/env node
/*
 * Monta o atlas da arte a partir das imagens de referência:
 *
 *   node scripts/build-atlas.cjs <Retro Bomberman Garden Arena.png> <Bomberman Pixel Sprite Sheet.png> \
 *                                <bomb-iso_walk_down-trimmed.png> <bomb-iso_walk_up-trimmed.png> \
 *                                <bomb-iso_walk_right-trimmed.png> \
 *                                <bomb-iso_idle_down-trimmed.png> <bomb-iso_idle_up-trimmed.png> \
 *                                <bomb-iso_idle_right-trimmed.png> <bomb-iso_idle_left-trimmed.png> \
 *                                <bomb-iso_custom_victory_down.png>
 *
 * A última é a folha da vitória: o boneco de frente, na escala do parado,
 * erguendo os braços (25 quadros numa grade de 5×5).
 *
 * O cenário (chão, grama, canteiros, blocos, muralha, árvores, banco) não vem
 * de imagem nenhuma: é desenhado em código por `scenery.cjs`, para que toda
 * peça emende com a vizinha. Da arena ficam só a chama e os corações do painel.
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
const { paintScenery, VARIANTS } = require("./scenery.cjs");

const [, , arenaPath, sheetPath, downPath, upPath, sidePath, idleDownPath, idleUpPath, idleRightPath, idleLeftPath, winPath] =
  process.argv;
if (!winPath) {
  console.error(
    "uso: node scripts/build-atlas.cjs <arena.png> <sheet.png> <walk-down.png> <walk-up.png> <walk-side.png> " +
      "<idle-down.png> <idle-up.png> <idle-right.png> <idle-left.png> <victory-down.png>",
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

function flipV(img) {
  const out = blank(img.width, img.height);
  for (let y = 0; y < img.height; y++) {
    const i = y * img.width * 4;
    const o = (img.height - 1 - y) * img.width * 4;
    out.data.set(img.data.subarray(i, i + img.width * 4), o);
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
  const sealed = dilate(far, w, h, 2);
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

/** A chama fica transparente onde não é fogo: o chão por baixo some. */
function keyFlame(img) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const [h, s, v] = rgbToHsv(img.data[i], img.data[i + 1], img.data[i + 2]);
      const warm = h < 70 || h > 330;
      const fire = warm ? Math.min(1, (s - 0.3) / 0.25) * Math.min(1, (v - 0.45) / 0.2) : 0;
      // O miolo quase branco não tem saturação, mas é fogo também.
      const core = Math.min(1, (v - 0.8) / 0.1);
      const a = Math.max(0, fire, core);
      // Resto fraco do chão e do tijolo da referência: some, senão vira um retângulo em volta da chama.
      img.data[i + 3] = a < 0.3 ? 0 : Math.round(255 * a);
    }
  }
  return img;
}

/**
 * Emenda de chama: na faixa de `band` px junto da borda `side` ("l", "r", "t"
 * ou "b"), a imagem passa aos poucos para `edge` (a linha ou coluna da borda
 * do vizinho, de fora para dentro igual à ordem da borda). Na borda fica
 * igual ao vizinho; `band` px para dentro, igual ao original.
 */
function blendEdge(img, side, edge, band) {
  const out = crop(img, 0, 0, img.width, img.height);
  const { width: w, height: h } = img;
  for (let d = 0; d < band; d++) {
    const t = 1 - d / band;
    const n = side === "l" || side === "r" ? h : w;
    for (let k = 0; k < n; k++) {
      const x = side === "l" ? d : side === "r" ? w - 1 - d : k;
      const y = side === "t" ? d : side === "b" ? h - 1 - d : k;
      const i = (y * w + x) * 4;
      const e = edge[k];
      // Mistura com alfa pré-multiplicado, para a cor do fundo transparente não sujar a borda.
      const a0 = out.data[i + 3] / 255;
      const a1 = e[3] / 255;
      const a = a0 * (1 - t) + a1 * t;
      for (let c = 0; c < 3; c++) {
        const v = out.data[i + c] * a0 * (1 - t) + e[c] * a1 * t;
        out.data[i + c] = a > 0 ? Math.round(v / a) : 0;
      }
      out.data[i + 3] = Math.round(255 * a);
    }
  }
  return out;
}
const column = (img, x) => Array.from({ length: img.height }, (_, y) => px(img, x, y));
const row = (img, y) => Array.from({ length: img.width }, (_, x) => px(img, x, y));

/** Um braço que emenda nele mesmo: a borda esquerda e a direita viram a mesma coluna (a do meio). */
function seamlessH(img) {
  const { width: w } = img;
  const half = Math.floor(w / 2);
  const shifted = blank(w, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + ((x + half) % w)) * 4;
      shifted.data.set(img.data.subarray(i, i + 4), (y * w + x) * 4);
    }
  }
  // `shifted` emenda nas bordas (lá estava o meio do original); o original não tem
  // costura no meio. Junta os dois: perto das bordas vale o deslocado, no meio o original.
  const out = crop(img, 0, 0, w, img.height);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < w; x++) {
      const t = Math.abs(x - (w - 1) / 2) / ((w - 1) / 2); // 0 no meio, 1 nas bordas
      const i = (y * w + x) * 4;
      const a0 = img.data[i + 3] / 255;
      const a1 = shifted.data[i + 3] / 255;
      const a = a0 * (1 - t) + a1 * t;
      for (let c = 0; c < 3; c++) {
        const v = img.data[i + c] * a0 * (1 - t) + shifted.data[i + c] * a1 * t;
        out.data[i + c] = a > 0 ? Math.round(v / a) : 0;
      }
      out.data[i + 3] = Math.round(255 * a);
    }
  }
  return out;
}

/** A chama "alternativa": a mesma, um pouco mais clara, para piscar. */
function brighten(img, k) {
  const out = crop(img, 0, 0, img.width, img.height);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = Math.min(255, Math.round(out.data[i] + (255 - out.data[i]) * k));
    out.data[i + 1] = Math.min(255, Math.round(out.data[i + 1] + (255 - out.data[i + 1]) * k));
    out.data[i + 2] = Math.min(255, Math.round(out.data[i + 2] + (255 - out.data[i + 2]) * k));
  }
  return out;
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

/* A chama: a cruz da arena tem o centro em (475, 538). Cada pedaço é uma
 * célula de 80×56 em volta desse centro. O braço esquerdo é o limpo (os
 * outros têm entulho de tijolo e o de cima afina), então os demais são o
 * espelho e o giro dele. */
const FX = 475;
const FY = 538;
const flamePiece = (x, y, w, h) => resize(keyFlame(crop(arena, x, y, w, h)), TILE, TILE);
/* Recortados um a um, os pedaços não emendavam: o contorno do fogo acabava
 * reto na borda da célula e a grossura mudava de um para o outro. Então o
 * braço vira um ladrilho que emenda nele mesmo, e cada borda que encosta num
 * braço (o centro dos quatro lados, a ponta do lado de dentro) passa aos
 * poucos para a borda do braço. */
const FLAME_BAND = 20;
const flameH = seamlessH(flamePiece(FX - 80, FY - 28, 42, 56));
const flameV = rotate(flameH);
let flameCenter = flamePiece(FX - 40, FY - 28, 80, 56);
flameCenter = blendEdge(flameCenter, "l", column(flameH, TILE - 1), FLAME_BAND);
flameCenter = blendEdge(flameCenter, "r", column(flameH, 0), FLAME_BAND);
flameCenter = blendEdge(flameCenter, "t", row(flameV, TILE - 1), FLAME_BAND);
flameCenter = blendEdge(flameCenter, "b", row(flameV, 0), FLAME_BAND);
const flameL = blendEdge(flamePiece(FX - 118, FY - 28, 80, 56), "r", column(flameH, 0), FLAME_BAND);
const flameU = rotate(flameL);
const flames = {
  flame_center: flameCenter,
  flame_h: flameH,
  flame_v: flameV,
  flame_l: flameL,
  flame_r: mirror(flameL),
  flame_u: flameU,
  flame_d: flipV(flameU),
};
for (const [name, img] of Object.entries(flames)) {
  add(name, img);
  add(`${name}_alt`, brighten(img, 0.18));
}

/* A folha de sprites: fundo liso que sai por inundação. */
const sheetBg = px(sheet, 4, 4);
const cut = (x, y, w, h) => trim(keyFlood(crop(sheet, x, y, w, h), sheetBg, 24), 1);

/* As bombas: cinco quadros do pavio queimando. Ficam no tamanho da folha,
 * encostadas no chão da célula. */
const BOMBS = [
  [30, 848, 60, 86],
  [99, 848, 60, 86],
  [165, 848, 60, 86],
  [232, 848, 60, 86],
  [297, 848, 60, 86],
];
BOMBS.forEach(([x, y, w, h], i) => add(`bomb${i}`, place(cut(x, y, w, h), TILE, 20 * ART, true)));

/* Os itens: fogo, bomba, bota e caveira, em moldura dourada ou azul. */
const POWERUPS = { fire: [1209, 851], bomb: [1286, 851], boot: [1360, 851], skull: [1434, 851] };
for (const [kind, [x, y]] of Object.entries(POWERUPS)) {
  add(`pu_${kind}`, place(fit(cut(x, y, 76, 76), TILE - 4, TILE - 4), TILE, TILE));
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
  const sealed = dilate(body, w, h, WALK_OUTLINE);
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
/* O cenário é desenhado em código (`scenery.cjs`): o chão, a grama, os
 * canteiros, os blocos, a muralha, os cantos, as árvores e o banco. */
for (const [name, img] of Object.entries(paintScenery())) add(name, img);

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

const ATLAS_W = 1024;
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
      walkArtHeight: WALK_ART_HEIGHT,
      idleArtHeight: IDLE_ART_HEIGHT,
      winArtHeight: artHeight(winFrames),
      frames: placed,
    },
    null,
    2,
  )}\n`,
);
console.log(`atlas ${ATLAS_W}x${ATLAS_H}, ${entries.length} quadros`);

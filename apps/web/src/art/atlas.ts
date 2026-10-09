import atlasUrl from "./atlas.png";
import atlasData from "./atlas.json";

/*
 * O atlas: a arte é recortada das duas imagens de referência por
 * `scripts/build-atlas.cjs` e guardada em `atlas.png`, em 4 px de arte por
 * pixel lógico (uma célula de 16 px tem 64 px de arte). Cada quadro vira um
 * canvas próprio na primeira vez em que é pedido; a imagem chega depois
 * (é uma rede), então o canvas nasce vazio no tamanho certo e é pintado
 * quando o atlas carrega — quem desenha a cada quadro nem percebe, e quem
 * desenha uma vez só (o painel) escuta `onReady`.
 */

export type Frame = HTMLCanvasElement;

/** Pixels de arte por pixel lógico. */
export const ART_SCALE: number = atlasData.scale;

type Rect = { x: number; y: number; w: number; h: number };
const RECTS: Record<string, Rect> = atlasData.frames;

const cache = new Map<string, Frame>();
let image: HTMLImageElement | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function paint(canvas: Frame, rect: Rect) {
  if (!image || !loaded) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h, 0, 0, rect.w, rect.h);
}

function load() {
  if (image || typeof Image === "undefined") return;
  image = new Image();
  image.decoding = "async";
  image.onload = () => {
    loaded = true;
    for (const [name, canvas] of cache) paint(canvas, RECTS[name]);
    for (const listener of listeners) listener();
  };
  image.src = atlasUrl;
}

function frame(name: string): Frame {
  let cached = cache.get(name);
  if (cached) return cached;
  const rect = RECTS[name];
  if (!rect) throw new Error(`quadro "${name}" não está no atlas`);
  cached = document.createElement("canvas");
  cached.width = rect.w;
  cached.height = rect.h;
  cache.set(name, cached);
  load();
  paint(cached, rect);
  return cached;
}

/** Avisa quando a arte estiver na tela (de imediato, se já estiver). */
export function onReady(listener: () => void): () => void {
  load();
  if (loaded) listener();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** O tamanho lógico de um quadro: o que ele ocupa na arena, em pixels de 16 por célula. */
export const logicalWidth = (f: Frame) => f.width / ART_SCALE;
export const logicalHeight = (f: Frame) => f.height / ART_SCALE;

/* ------------------------------------------------------------ personagem */

export type Facing = "down" | "up" | "left" | "right";
export type Pose = "head" | "dead0" | "dead1" | "dead2" | "dead3";

const slotOf = (slot: number) => `c${((slot % 4) + 4) % 4}`;

const WALK: Record<Facing, number> = atlasData.walk;
const IDLE: Record<Facing, number> = atlasData.idle;
const WIN: number = atlasData.win;

/** Quantos quadros tem a caminhada de uma direção. */
export const walkSteps = (facing: Facing): number => WALK[facing];
/** Quantos quadros tem o parado (a respiração) de uma direção. */
export const idleSteps = (facing: Facing): number => IDLE[facing];
/** Quantos quadros tem a vitória (os braços para cima). */
export const winSteps = (): number => WIN;

const wrap = (step: number, steps: number) => ((step % steps) + steps) % steps;

/** Um quadro da caminhada: a direção e o passo. */
export function character(slot: number, facing: Facing, step: number): Frame {
  return frame(`${slotOf(slot)}_${facing}${wrap(step, WALK[facing])}`);
}

/** Um quadro do parado: a direção e o quadro da respiração. */
export function characterIdle(slot: number, facing: Facing, step: number): Frame {
  return frame(`${slotOf(slot)}_idle_${facing}${wrap(step, IDLE[facing])}`);
}

/** Um quadro da vitória: o boneco de frente erguendo os braços. */
export function characterWin(slot: number, step: number): Frame {
  return frame(`${slotOf(slot)}_win${wrap(step, WIN)}`);
}

export function characterPose(slot: number, pose: Pose): Frame {
  return frame(`${slotOf(slot)}_${pose}`);
}

/* ---------------------------------------------------------------- blocos */

const VARIANTS: { floor: number; garden: number; tree: number } = atlasData.variants;
export type Scenery = keyof typeof VARIANTS;
/** Quantas versões tem uma peça do cenário (chão, canteiro, árvore). */
export const variants = (kind: Scenery): number => VARIANTS[kind];

/** Um número fixo por célula, para variar o cenário sem mudar de um quadro para o outro. */
export function cellHash(cx: number, cy: number): number {
  let h = Math.imul(cx + 101, 374761393) ^ Math.imul(cy + 37, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * O chão de uma célula: a lajota lisa (a 0) na maioria, as outras versões
 * (rachada, com musgo, de pedra) salpicadas.
 */
export function floor(cx: number, cy: number): Frame {
  const r = cellHash(cx, cy);
  const n = VARIANTS.floor;
  const i = r < 0.6 || n === 1 ? 0 : 1 + Math.floor(((r - 0.6) / 0.4) * (n - 1));
  return frame(`floor${Math.min(n - 1, i)}`);
}
export const garden = (cx: number, cy: number) => frame(`garden${Math.floor(cellHash(cx, cy) * VARIANTS.garden)}`);
export const tree = (cx: number, cy: number) => frame(`tree${Math.floor(cellHash(cx, cy) * VARIANTS.tree)}`);
export const pillar = () => frame("pillar");
export const brick = () => frame("brick");
export const bush = () => frame("bush");
/** O canto da muralha, com a lanterna: o da esquerda ou o da direita (espelhado). */
export const corner = (side: "l" | "r") => frame(`corner_${side}`);
export const bench = () => frame("bench");

export type WallSide = "t" | "b" | "l" | "r";
export const wall = (side: WallSide) => frame(`wall_${side}`);

/* --------------------------------------------------------- bomba e chama */

export const BOMB_FRAMES = 5;
export const bomb = (step: number) => frame(`bomb${wrap(step, BOMB_FRAMES)}`);

export type FlamePiece = "center" | "h" | "v" | "l" | "r" | "u" | "d";
export const flame = (piece: FlamePiece, alt: boolean) => frame(`flame_${piece}${alt ? "_alt" : ""}`);

/* ---------------------------------------------------------------- itens */

export const powerup = (kind: string) => frame(RECTS[`pu_${kind}`] ? `pu_${kind}` : "pu_fire");
export const heart = (full: boolean) => frame(full ? "heart" : "heart_empty");

/* ------------------------------------------------------------- conferência */

/** Todo quadro que a arena pede. Falta um e isso quebra aqui, não no meio do jogo. */
export function requiredFrames(): string[] {
  const names = [
    "pillar", "brick", "bush", "grass", "corner_l", "corner_r", "bench",
    "wall_t", "wall_b", "wall_l", "wall_r",
    "heart", "heart_empty",
    "pu_fire", "pu_bomb", "pu_boot", "pu_skull",
  ];
  for (const kind of ["floor", "garden", "tree"] as const) {
    for (let i = 0; i < VARIANTS[kind]; i++) names.push(`${kind}${i}`);
  }
  for (let i = 0; i < BOMB_FRAMES; i++) names.push(`bomb${i}`);
  for (const piece of ["center", "h", "v", "l", "r", "u", "d"]) names.push(`flame_${piece}`, `flame_${piece}_alt`);
  for (let slot = 0; slot < 4; slot++) {
    for (const facing of ["down", "up", "left", "right"] as const) {
      for (let step = 0; step < WALK[facing]; step++) names.push(`c${slot}_${facing}${step}`);
      for (let step = 0; step < IDLE[facing]; step++) names.push(`c${slot}_idle_${facing}${step}`);
    }
    for (let step = 0; step < WIN; step++) names.push(`c${slot}_win${step}`);
    names.push(`c${slot}_head`, `c${slot}_dead0`, `c${slot}_dead1`, `c${slot}_dead2`, `c${slot}_dead3`);
  }
  return names;
}

/** Roda uma vez, no carregamento. */
export function checkSprites(rects: Record<string, Rect> = RECTS) {
  const missing = requiredFrames().filter((name) => !rects[name]);
  if (missing.length) throw new Error(`faltam quadros no atlas: ${missing.join(", ")}`);
}

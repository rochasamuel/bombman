import atlasUrl from "./atlas.png";
import atlasData from "./atlas.json";

/*
 * O atlas: a arte é recortada das imagens de referência por
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

/**
 * As peças do cenário existem para cada tema: as da referência ("garden")
 * com o nome de sempre (`floor0`, `wall_t`…), as dos outros com o nome do
 * tema na frente (`forest_floor0`, `forest_wall_t`…). Um tema que o atlas
 * não tem desenha como a referência: a tela nunca fica sem peça.
 */
export const GARDEN = "garden";
const VARIANTS: { floor: number; brick: number } = atlasData.variants;
/** Uma série de ornamentos da muralha: o passo e a folga do canto (em células), quantas peças se alternam a partir do centro, se há peça central e se o centro fica vazio. */
export type OrnamentSeries = { pitch: number; margin: number; pieces: number; center: boolean; skipCenter: boolean };
/** Como a muralha de um tema é coroada: as séries de cima (e de baixo) e as dos lados; a de baixo é a de cima ou o espelho dela. */
export type WallArt = { bottom: "same" | "mirror"; top: OrnamentSeries[]; side: OrnamentSeries[]; sideAnchor: "outer" | "center" };
type ThemeMeta = { floor: number; brick: number; walls: WallArt };
const THEME_VARIANTS: Record<string, ThemeMeta> = {
  [GARDEN]: { ...VARIANTS, walls: atlasData.walls as WallArt },
  ...(atlasData.themes as Record<string, ThemeMeta>),
};
export type Scenery = keyof typeof VARIANTS;
/** Os temas que o atlas tem peças para desenhar. */
export const ATLAS_THEMES: readonly string[] = Object.keys(THEME_VARIANTS);
/** O tema como o atlas o conhece: ele mesmo, ou a referência se não está no atlas. */
export const atlasTheme = (theme: string = GARDEN): string => (THEME_VARIANTS[theme] ? theme : GARDEN);
const prefix = (theme: string) => (atlasTheme(theme) === GARDEN ? "" : `${atlasTheme(theme)}_`);
/** Quantas versões tem uma peça do cenário (lajota, tijolo) num tema. */
export const variants = (kind: Scenery, theme: string = GARDEN): number => THEME_VARIANTS[atlasTheme(theme)][kind];

const variant = (kind: Scenery, i: number, theme: string) =>
  `${prefix(theme)}${kind}${Math.min(variants(kind, theme) - 1, Math.max(0, Math.floor(i)))}`;

/** Uma das lajotas do chão; qual vai em cada célula é o `themes.ts` quem diz. */
export const floor = (i: number, theme = GARDEN) => frame(variant("floor", i, theme));
/** Um dos tijolos, cada um com o seu musgo. */
export const brick = (i: number, theme = GARDEN) => frame(variant("brick", i, theme));
export const pillar = (theme = GARDEN) => frame(`${prefix(theme)}pillar`);
export const bush = () => frame("bush");
/** O bloco quadrado dos quatro cantos da muralha. */
export const corner = (theme = GARDEN) => frame(`${prefix(theme)}corner`);

export type WallSide = "t" | "b" | "l" | "r";
export const wall = (side: WallSide, theme = GARDEN) => frame(`${prefix(theme)}wall_${side}`);

/** Como a muralha do tema é coroada (ver `WallArt`). */
export const walls = (theme: string = GARDEN): WallArt => THEME_VARIANTS[atlasTheme(theme)].walls;
/** Um ornamento da muralha: o lado, a série, e a peça (pelo lugar a partir do centro) ou a central (`"c"`). */
export const ornament = (side: WallSide, series: number, piece: number | "c", theme = GARDEN) =>
  frame(`${prefix(theme)}orn_${side}${series}_${piece}`);

/** Toda peça de cenário de um tema, com o nome que tem no atlas. */
export function sceneryFrames(theme: string = GARDEN): string[] {
  const p = prefix(theme);
  const names = [`${p}pillar`, `${p}corner`, `${p}wall_t`, `${p}wall_b`, `${p}wall_l`, `${p}wall_r`];
  for (const kind of ["floor", "brick"] as const) {
    for (let i = 0; i < variants(kind, theme); i++) names.push(`${p}${kind}${i}`);
  }
  const art = walls(theme);
  for (const [sides, list] of [[["t", "b"], art.top], [["l", "r"], art.side]] as const) {
    list.forEach((series, s) => {
      for (const side of sides) {
        for (let k = 0; k < series.pieces; k++) names.push(`${p}orn_${side}${s}_${k}`);
        if (series.center) names.push(`${p}orn_${side}${s}_c`);
      }
    });
  }
  return names;
}

/* --------------------------------------------------------- bomba e chama */

/** As fases da bomba e quantos quadros tem cada uma: parada, o pavio (volta), o pulso e o estouro. */
export type BombPhase = "idle" | "fuse" | "pulse" | "boom";
export const BOMB_STEPS: Record<BombPhase, number> = { idle: 1, fuse: 6, pulse: 8, boom: 2 };
/** Um quadro da bomba; a perfurante é a mesma bomba em vermelho. */
export const bomb = (phase: BombPhase, step: number, pierce = false) =>
  frame(`${pierce ? "pierce" : "bomb"}_${phase}${wrap(step, BOMB_STEPS[phase])}`);

/** A explosão é modular: o centro, os braços e as quatro pontas, todos nos mesmos oito quadros. */
export type FlamePiece = "center" | "h" | "v" | "l" | "r" | "u" | "d";
export const FLAME_PIECES: FlamePiece[] = ["center", "h", "v", "l", "r", "u", "d"];
export const FLAME_STEPS = 8;
export const flame = (piece: FlamePiece, step: number) => frame(`flame_${piece}${wrap(step, FLAME_STEPS)}`);

/* ---------------------------------------------------------------- itens */

/** Cada item brilha em quatro quadros. */
export const POWERUP_STEPS = 4;
export const POWERUP_KINDS = ["fire", "bomb", "boot", "kick", "pierce", "skull", "swap", "ghost"];
export function powerup(kind: string, step: number): Frame {
  const name = `pu_${POWERUP_KINDS.includes(kind) ? kind : "fire"}${wrap(step, POWERUP_STEPS)}`;
  return frame(name);
}
export const heart = (full: boolean) => frame(full ? "heart" : "heart_empty");
/** A caveirinha que paira sobre quem está amaldiçoado. */
export const curse = () => frame("curse");
/** Em que linha lógica do quadro do boneco começa a cabeça (o quadro tem folga em cima). */
export const HEAD_TOP: number = atlasData.headTop;

/* ------------------------------------------------------------- conferência */

/** Todo quadro que a arena pede. Falta um e isso quebra aqui, não no meio do jogo. */
export function requiredFrames(): string[] {
  const names = ["bush", "heart", "heart_empty", "curse"];
  for (const theme of ATLAS_THEMES) names.push(...sceneryFrames(theme));
  for (const kind of POWERUP_KINDS) {
    for (let i = 0; i < POWERUP_STEPS; i++) names.push(`pu_${kind}${i}`);
  }
  for (const [phase, steps] of Object.entries(BOMB_STEPS)) {
    for (let i = 0; i < steps; i++) names.push(`bomb_${phase}${i}`, `pierce_${phase}${i}`);
  }
  for (const piece of FLAME_PIECES) {
    for (let i = 0; i < FLAME_STEPS; i++) names.push(`flame_${piece}${i}`);
  }
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

import { DEFAULT_ARENA, TILE } from "@bomb/shared";

/*
 * O cenário, lido da imagem de referência. A planta (o que é muralha, pilar,
 * tijolo e chão) mora no pacote compartilhado, porque o servidor a monta;
 * aqui fica só o que é desenho: qual das 44 lajotas do tileset vai em cada
 * célula, qual dos 40 tijolos, onde ficam os merlões da muralha e quanto de
 * fundo escuro sobra em volta.
 *
 * As medidas vêm da imagem (1536×1024): a grade tem 27×17 células de
 * 55,6×57,5 px, começando em (18; 20,5). A lajota e o tijolo de cada célula
 * são os do tileset mais parecidos com o miolo daquela célula (comparação de
 * miniaturas 8×8); a célula tapada por um bloco herda a lajota da vizinha
 * livre mais próxima.
 *
 * As outras arenas são menores que a referência, e usam o mesmo chão: cada
 * uma lê o miolo das tabelas abaixo, centrado, como se fosse um recorte da
 * referência — as mesmas lajotas, com as mesmas faixas e manchas. Onde a
 * referência não tinha tijolo e a arena tem, o tijolo sai de uma conta fixa
 * da posição, para cada um ter o seu musgo sem ninguém sortear nada.
 */

/** As medidas da referência: é dela que as tabelas abaixo vêm. */
const REF_COLS = DEFAULT_ARENA.cols;
const REF_ROWS = DEFAULT_ARENA.rows;

/** O fundo escuro em volta da muralha, em pixels lógicos (na referência, ~0,33 célula). */
export const MARGIN = 6;
/** A cor desse fundo, medida na referência. */
export const BACKGROUND = "#171f28";
/**
 * A proporção da imagem de referência (1536 × 1024). As células dela são uns
 * 4% mais altas que largas; a tela estica a arena na vertical para ficar com
 * a mesma proporção, em vez de parecer achatada.
 */
export const ASPECT = 1536 / 1024;
/**
 * O esticão, como um fator: a altura mostrada sobre a altura desenhada, na
 * referência. Toda arena, de qualquer tamanho, estica o mesmo tanto — a
 * célula fica com a mesma forma em todas.
 */
export const STRETCH = (REF_COLS * TILE + MARGIN * 2) / ASPECT / (REF_ROWS * TILE + MARGIN * 2);

/** As lajotas das células de dentro da referência: linhas 1..ROWS-2, colunas 1..COLS-2. */
const FLOOR: readonly (readonly number[])[] = [
  [ 8, 16,  8,  8, 28,  8, 17, 17,  8,  8,  8,  8, 13, 17, 17, 17,  8,  8,  8,  8, 16, 16, 10, 16, 25],
  [ 5, 14,  3,  3,  7,  7, 37, 37, 37, 17, 17, 17,  7,  7,  7, 37, 37, 37, 13, 13,  5,  5,  5,  7,  3],
  [ 5, 10, 39,  8,  8,  8,  8, 10,  8,  8,  8,  8, 37, 37, 10, 10, 10,  6,  6,  6,  5, 13, 37, 10, 30],
  [ 5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5,  5],
  [13,  6,  6, 10, 25, 17,  8,  8,  8,  8,  8, 13, 13, 17,  6,  6, 10, 10, 15, 13,  8,  8,  8, 10, 17],
  [ 5,  5,  5,  5,  5,  5,  5,  5,  5,  8,  8,  8,  7,  7,  7, 13, 13, 13, 13, 13, 36, 36, 36, 36,  8],
  [ 8,  8,  8,  8,  8,  8,  8, 10,  8,  8,  8,  8, 34,  6,  6,  6, 10,  8,  8,  8,  8,  8,  8,  8,  8],
  [17, 17, 16, 17,  8,  8, 10,  8,  8, 15, 13,  8,  8,  5,  6,  6,  6, 36,  8,  8, 10, 13, 16, 13, 15],
  [36, 36, 36, 36, 36, 10, 10,  5,  8,  8,  8,  7, 17,  2,  2,  2, 10,  5,  5, 17, 17, 17, 34, 34, 34],
  [ 8,  8,  8,  8,  8,  8,  8,  8,  8, 17, 17, 17,  5,  5,  5,  8,  8,  8,  8,  8,  8,  8,  8,  8,  8],
  [37,  6,  6, 13,  8, 15,  8,  8,  8,  8,  8,  6, 17,  6,  6,  6, 10, 10,  8,  6,  8, 17, 17, 10,  8],
  [ 7,  7,  7,  7,  7,  7,  7,  7,  7,  7,  7,  7,  8,  8,  8,  8,  8,  8,  8,  8, 37, 37, 37, 37, 37],
  [ 8, 16, 11,  6, 16, 16, 16, 10,  8,  8, 13, 13, 37, 37,  8,  8, 10,  8,  8,  8,  5, 16, 17, 16,  8],
  [ 5, 27, 38, 38,  5,  5, 37, 37, 37, 17, 17, 17,  5,  5,  5, 15, 15, 15,  8,  8,  5,  5, 28,  7, 38],
  [36, 34, 30, 30,  5, 17, 30, 30,  8,  8,  8, 13, 37, 15, 15, 15,  8,  8, 37,  8,  8,  8, 34, 26, 32],
];

/** Os tijolos, onde a planta tem tijolo; -1 onde não tem. */
const BRICK: readonly (readonly number[])[] = [
  [-1, -1, -1, 36, -1, -1, -1, 25, -1, 31, 27, -1, -1, -1, 28, 21, -1, 32, -1, -1, -1, 27, -1, -1, -1],
  [-1, -1, -1, -1, -1, -1, -1, 27, -1, -1, 31, -1, -1, -1, 28, -1, -1, 26, -1, -1, -1, -1, -1, -1, -1],
  [-1, -1, -1, -1, -1, 36, 36, -1, -1, 36, -1, 27, -1, 26, -1, 26, -1, -1, 31, 27, -1, -1, -1, -1, -1],
  [31, -1, 16, -1, -1, -1, 31,  7, -1, 27, 27, -1, -1, -1, 26, 11, -1, 26, 29, -1, -1, -1,  7, -1, 31],
  [-1, -1,  7, -1, -1, -1, -1,  7, -1,  7, -1, -1, -1, -1, -1,  6, -1, 11, -1, -1, -1, -1, 31, -1, -1],
  [-1, -1, 36, -1, -1, -1,  9, 27, -1, -1, 27, -1, -1, -1, 26, -1, -1, 31,  9, -1, -1, -1,  5, -1, -1],
  [ 5, 31, -1, 31,  5, -1, 31, -1, -1,  7, 31, -1, -1, -1, 31, 26, -1, -1, 31, -1,  5, 31, -1, 27, 31],
  [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
  [36, 36, -1, 27, 31, -1, 27, -1, -1, 31, 21, -1, -1, -1, 26, 38, -1, -1, 31, -1, 27, 27, -1, 27, 27],
  [-1, -1, 36, -1, -1, -1, 31, 27, -1, -1, 27, -1, -1, -1, 26, -1, -1, 28, 31, -1, -1, -1, 27, -1, -1],
  [-1, -1, 31, -1, -1, -1, -1, 27, -1, 31, -1, -1, -1, -1, -1, 26, -1, 38, -1, -1, -1, -1, 31, -1, -1],
  [38, -1, 27, -1, -1, -1, 27, 27, -1, 27, 27, -1, -1, -1, 39, 38, -1, 38, 36, -1, -1, -1, 27, -1, 27],
  [-1, -1, -1, -1, -1, 31, 31, -1, -1, 31, -1, 27, -1, 38, -1, 23, -1, -1, 27, 36, -1, -1, -1, -1, -1],
  [-1, -1, -1, -1, -1, -1, -1, 27, -1, -1, 31, -1, -1, -1, 26, -1, -1, 38, -1, -1, -1, -1, -1, -1, -1],
  [-1, -1, -1, 31, -1, -1, -1, 31, -1, 31, 27, -1, -1, -1, 31,  8, -1, 26, -1, -1, -1, 31, -1, -1, -1],
];

if (FLOOR.length !== REF_ROWS - 2 || FLOOR.some((row) => row.length !== REF_COLS - 2)) {
  throw new Error("o mapa de lajotas não bate com a planta");
}
if (BRICK.length !== REF_ROWS - 2 || BRICK.some((row) => row.length !== REF_COLS - 2)) {
  throw new Error("o mapa de tijolos não bate com a planta");
}

/** Quantas lajotas e tijolos há; a conta do tijolo cai dentro disto. */
const FLOOR_VARIANTS = 44;
const BRICK_VARIANTS = 40;

/** Em que célula da referência uma arena `cols × rows` começa, para ler o miolo centrado. */
const offset = (cols: number, rows: number) => ({
  ox: Math.floor((REF_COLS - cols) / 2),
  oy: Math.floor((REF_ROWS - rows) / 2),
});

/**
 * A lajota da célula de uma arena `cols × rows`. Embaixo da muralha (onde o
 * canto deixa ver o chão), e fora das tabelas, vai a mais comum.
 */
export function floorVariant(cols: number, rows: number, cx: number, cy: number): number {
  const { ox, oy } = offset(cols, rows);
  return FLOOR[cy + oy - 1]?.[cx + ox - 1] ?? 43;
}

/**
 * O tijolo da célula de uma arena `cols × rows`: o da referência, se ela
 * tinha um ali; senão uma conta fixa da posição, que espalha os 40 pelo
 * campo. A planta é quem diz se há tijolo.
 */
export function brickVariant(cols: number, rows: number, cx: number, cy: number): number {
  const { ox, oy } = offset(cols, rows);
  const measured = BRICK[cy + oy - 1]?.[cx + ox - 1] ?? -1;
  if (measured >= 0) return measured;
  return (cx * 7 + cy * 13 + cols * 3) % BRICK_VARIANTS;
}

/* Conferência, uma vez, de que toda célula de toda arena cai numa peça que existe. */
if (FLOOR.some((row) => row.some((v) => v < 0 || v >= FLOOR_VARIANTS))) {
  throw new Error("há uma lajota fora do tileset");
}
if (BRICK.some((row) => row.some((v) => v >= BRICK_VARIANTS))) {
  throw new Error("há um tijolo fora do tileset");
}

/*
 * Os merlões: as colunas que coroam a muralha. Na referência há 16 em cima e
 * 16 embaixo, a cada célula e meia, simétricos em torno do meio da arena; e 9
 * blocos claros em cada lado, no mesmo passo. As posições são o centro de
 * cada um, em células, a partir da borda da arena.
 *
 * Numa muralha de outro comprimento vale a mesma regra: o passo de célula e
 * meia, centrados, e tantos quantos couberem sem chegar a menos de duas
 * células do canto — o bloco do canto é mais largo que a célula dele. Na
 * referência isso dá exatamente os 16 e os 9. Os outros temas usam a mesma
 * regra com o passo medido no seu cenário (`themes.ts`).
 */
export const MERLON_PITCH = 1.5;
const MERLON_MARGIN = 2;

export function crenellation(length: number, pitch: number = MERLON_PITCH, margin: number = MERLON_MARGIN): number[] {
  const center = length / 2;
  let best: number[] = [];
  for (let n = 1; ; n++) {
    const first = center - (pitch * (n - 1)) / 2;
    if (first < margin) break;
    best = Array.from({ length: n }, (_, k) => first + pitch * k);
  }
  return best;
}

/** Os merlões de cima e de baixo de uma arena de `cols` células. */
export const merlonsX = (cols: number): readonly number[] => crenellation(cols);
/** Os blocos claros dos lados de uma arena de `rows` células. */
export const capsY = (rows: number): readonly number[] => crenellation(rows);

export const MERLONS_X = merlonsX(REF_COLS);
export const CAPS_Y = capsY(REF_ROWS);

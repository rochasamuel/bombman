import { TILE } from "@bomb/shared";
import { variants, type OrnamentSeries } from "./atlas";
import { brickVariant as gardenBrick, floorVariant as gardenFloor, crenellation } from "./scenario";

/*
 * Os temas, do lado do desenho. A regra, a planta e o tamanho são os mesmos
 * em todo tema (ver `packages/shared/src/themes.ts`); o que muda aqui é com
 * que peças do atlas a arena é desenhada e como a muralha é coroada.
 *
 * Cada tema novo foi lido do seu cenário de referência como o "garden" foi
 * lido do dele (`scenario.ts`): a grade do cenário foi medida (nenhum deles
 * está numa grade exata de 64 px: as células têm de 46 a 55 px, e as muralhas
 * são mais grossas que uma célula), e o miolo de cada célula foi comparado
 * com cada peça do tileset — a lajota, o tijolo ou o pilar mais parecido. As
 * tabelas abaixo são o resultado: qual lajota vai em cada célula (-1 onde o
 * cenário tinha um bloco) e qual tijolo (-1 onde não tinha). Uma arena lê o
 * miolo da tabela, centrado, como as arenas menores leem a referência; uma
 * arena maior que a tabela dá a volta nela.
 *
 * Os ornamentos da muralha seguem a regra da referência (`crenellation`),
 * cada tema com o passo medido no seu cenário: as torres vulcânicas a cada
 * cinco células, os estandartes gelados a cada três, as luzes cyberpunk a
 * cada duas e meia…
 */

type Table = readonly (readonly number[])[];

export type ThemeArt = {
  id: string;
  /** A lajota da célula `cx, cy` de uma arena `cols × rows`. */
  floor: (cols: number, rows: number, cx: number, cy: number) => number;
  /** O tijolo da célula, quando a planta tem tijolo ali. */
  brick: (cols: number, rows: number, cx: number, cy: number) => number;
};

/** Lê a tabela centrada na arena; fora dela dá a volta (arena maior que a tabela). */
function read(table: Table, cols: number, rows: number, cx: number, cy: number): number {
  const th = table.length;
  const tw = table[0].length;
  const ox = Math.floor((tw - (cols - 2)) / 2);
  const oy = Math.floor((th - (rows - 2)) / 2);
  const tx = (((cx - 1 + ox) % tw) + tw) % tw;
  const ty = (((cy - 1 + oy) % th) + th) % th;
  return table[ty][tx];
}

/** Um tijolo fixo pela posição, para onde a tabela não tinha tijolo: espalha os do tema sem sortear. */
const spread = (cols: number, cx: number, cy: number, count: number) => (cx * 7 + cy * 13 + cols * 3) % count;

function fromTables(id: string, floor: Table, brick: Table, mode: number): ThemeArt {
  return {
    id,
    floor: (cols, rows, cx, cy) => {
      const v = read(floor, cols, rows, cx, cy);
      return v >= 0 ? v : mode;
    },
    brick: (cols, rows, cx, cy) => {
      const v = read(brick, cols, rows, cx, cy);
      return v >= 0 ? v : spread(cols, cx, cy, variants("brick", id));
    },
  };
}

/*
 * Floresta Encantada: o cenário de referência tem 17 × 15 células de ~55 px (contando a muralha);
 * o miolo, 15 × 13. A lajota mais comum é a 22. A planta lida do cenário:
 *
 *   ...B.B...B.B...
 *   ....P.BPB.B....
 *   B.B.........B.B
 *   .B...BB.BB...B.
 *   B..BB..B..PB..B
 *   .B.B.B...B.B.B.
 *   ..P...P.P...P..
 *   .B.B.B...B.B.B.
 *   B..BP..P..PB..B
 *   .B...BB.BB...B.
 *   B.P.........P.B
 *   ....P.BPB.P....
 *   .....B...B.B...
 */
const FOREST_FLOOR: Table = [
    [41, 41, 22, -1, 22, -1, 22, 28, 22, -1, 22, -1, 22,  2, 30],
    [ 2, 30, 28, 22, -1, 22, -1, -1, -1, 22, -1, 30, 28, 30,  2],
    [-1, 34, -1, 31, 22, 31, 22, 34, 22, 31, 30, 31, -1, 34, -1],
    [22, -1, 22, 28, 28, -1, -1, 30, -1, -1, 28, 28, 22, -1, 30],
    [-1, 22, 31, -1, -1, 22, 22, -1, 22, 22, -1, -1, 31, 22, -1],
    [22, -1, 22, -1, 22, -1, 28, 22, 28, -1, 22, -1, 22, -1, 22],
    [28, 22, -1, 22, 28, 30, -1, 28, -1, 22, 28, 30, -1, 22, 28],
    [22, -1, 22, -1, 22, -1, 22, 28, 22, -1, 22, -1, 22, -1, 22],
    [-1, 22, 31, -1, -1, 22, 22, -1, 13, 22, -1, -1, 31, 22, -1],
    [22, -1, 30, 28, 28, -1, -1, 22, -1, -1, 34, 28, 13, -1, 13],
    [-1, 28, -1, 31, 22, 31, 22, 28, 22, 31, 30, 31, -1, 34, -1],
    [ 2, 22, 28, 13, -1, 13, -1, -1, -1, 22, -1, 13, 28, 22,  2],
    [13, 19, 22, 13, 27, -1, 10, 28, 22, -1, 10, -1, 13,  0, 13],
];
const FOREST_BRICK: Table = [
    [-1, -1, -1, 14, -1, 14, -1, -1, -1, 14, -1, 14, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 14, -1, 14, -1, 34, -1, -1, -1, -1],
    [14, -1, 34, -1, -1, -1, -1, -1, -1, -1, -1, -1, 34, -1, 14],
    [-1, 14, -1, -1, -1, 14, 14, -1, 14, 14, -1, -1, -1, 14, -1],
    [14, -1, -1, 14, 34, -1, -1, 34, -1, -1, -1,  7, -1, -1, 17],
    [-1, 14, -1, 36, -1, 14, -1, -1, -1, 14, -1, 14, -1, 14, -1],
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, 14, -1, 14, -1, 14, -1, -1, -1, 14, -1,  7, -1, 16, -1],
    [14, -1, -1, 36, -1, -1, -1, -1, -1, -1, -1, 31, -1, -1, 31],
    [-1, 31, -1, -1, -1, 31, 14, -1, 31, 31, -1, -1, -1, 31, -1],
    [ 3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 19],
    [-1, -1, -1, -1, -1, -1, 19, -1, 34, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, 34, -1, -1, -1, 34, -1, 31, -1, -1, -1],
];

/*
 * Fortaleza Vulcânica: o cenário de referência tem 19 × 17 células de ~46 px (contando a muralha);
 * o miolo, 17 × 15. A lajota mais comum é a 29. A planta lida do cenário:
 *
 *   ....B.B....B.B...
 *   ...P.B.P..P.B.P..
 *   ....B.B.BB.B.B...
 *   .P.P.B.P..P.B.P.P
 *   B.B.B.B.BB.B.B.B.
 *   .B.B.P.B..B.P.B.B
 *   ..P..B..BB..B..P.
 *   ......B....B.....
 *   ..P..B..BB..B..P.
 *   .B.B.P.B..B.P.B.B
 *   B.B.B.B.BB.B.B.B.
 *   .P.P.B.P..P.B.P.P
 *   ....B.B.BB.B.B...
 *   ...P.B.P..P.B.P..
 *   ....B.B....B.B...
 */
const VOLCANO_FLOOR: Table = [
    [25, 26, 32, 32, -1, 33, -1, 33, 26, 26, 26, -1, 29, -1, 29, 26, 32],
    [29, 28, 31, -1, 33, -1, 33, -1, 30, 26, -1, 26, -1, 26, -1, 53, 31],
    [26, 28, 30, 32, -1, 33, -1, 33, -1, -1, 29, -1, 29, -1, 29,  9, 31],
    [26, -1, 32, -1, 12, -1, 33, -1, 29, 26, -1, 26, -1, 26, -1, 29, -1],
    [-1, 29, -1, 33, -1, 33, -1, 33, -1, -1, 29, -1, 29, -1, 29, -1, 33],
    [29, -1, 33, -1, 33, -1, 33, -1, 43, 26, -1, 26, -1, 29, -1, 29, -1],
    [41, 28, -1, 33, 31, -1, 33, 32, -1, -1, 33, 26, -1, 26, 26, -1, 33],
    [29,  6, 32, 10, 11, 32, -1, 11,  7, 42,  6, -1, 29,  5, 28, 26,  6],
    [26, 28, -1, 35, 31, -1, 33, 31, -1, -1, 53, 26, -1, 26, 26, -1, 53],
    [29, -1, 33, -1, 33, -1, 12, -1, 43,  6, -1, 29, -1, 29, -1, 29, -1],
    [-1, 29, -1, 33, -1, 33, -1, 33, -1, -1, 29, -1, 29, -1, 29, -1, 33],
    [42, -1, 45, -1, 53, -1, 53, -1, 53, 26, -1, 29, -1, 42, -1, 29, -1],
    [29, 28, 20, 10, -1, 33, -1, 33, -1, -1, 29, -1, 29, -1, 29, 30, 10],
    [29, 28, 10, -1, 33, -1, 53, -1, 43, 26, -1, 29, -1, 26, -1, 29, 10],
    [25, 28, 29, 32, -1, 46, -1, 12, 28, 28, 26, -1, 43, -1, 42, 29, 28],
];
const VOLCANO_BRICK: Table = [
    [-1, -1, -1, -1,  4, -1,  4, -1, -1, -1, -1,  0, -1,  0, -1, -1, -1],
    [-1, -1, -1, -1, -1, 15, -1, -1, -1, -1, -1, -1, 11, -1, -1, -1, -1],
    [-1, -1, -1, -1,  4, -1,  4, -1,  4, 13, -1, 11, -1, 11, -1, -1, -1],
    [-1, -1, -1, -1, -1, 15, -1, -1, -1, -1, -1, -1, 11, -1, -1, -1, -1],
    [12, -1,  4, -1,  4, -1,  4, -1,  4,  4, -1, 11, -1, 11, -1, 11, -1],
    [-1,  3, -1,  4, -1, -1, -1,  4, -1, -1, 11, -1, -1, -1, 11, -1,  4],
    [-1, -1, -1, -1, -1,  4, -1, -1,  4,  4, -1, -1, 11, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, -1, 15, -1, -1, -1, -1, 13, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, 15, -1, -1, 28, 13, -1, -1, 11, -1, -1, -1, -1],
    [-1, 28, -1, 28, -1, -1, -1, 29, -1, -1, 11, -1, -1, -1, 11, -1, 28],
    [28, -1, 28, -1, 15, -1, 15, -1, 28, 28, -1, 11, -1, 11, -1, 28, -1],
    [-1, -1, -1, -1, -1, 29, -1, -1, -1, -1, -1, -1, 11, -1, -1, -1, -1],
    [-1, -1, -1, -1, 15, -1, 15, -1, 28, 13, -1, 11, -1, 11, -1, -1, -1],
    [-1, -1, -1, -1, -1, 29, -1, -1, -1, -1, -1, -1, 11, -1, -1, -1, -1],
    [-1, -1, -1, -1, 15, -1, 29, -1, -1, -1, -1, 25, -1, 25, -1, -1, -1],
];

/*
 * Cidadela Gelada: o cenário de referência tem 19 × 15 células de ~50 px (contando a muralha);
 * o miolo, 17 × 13. A lajota mais comum é a 46. A planta lida do cenário:
 *
 *   .....B.B.B.B.....
 *   ..P.B.P.B...B....
 *   ...B.B.B.B.B.B...
 *   .B..B.B...B.B..B.
 *   B.B..B.B........B
 *   .B.BB.B.B.B.BB.B.
 *   .......B.B.......
 *   .B.BB.B.B.B.BB.B.
 *   B.B..P.B........B
 *   .B..B.B...B.B..B.
 *   ...B.B.B.B.B.B...
 *   ..P.B.B.B...B....
 *   .....B.B.B.B.....
 */
const FROZEN_FLOOR: Table = [
    [41, 30, 32, 10, 33, -1, 32, -1, 45, -1, 35, -1, 46, 46, 28, 28, 46],
    [46, 28, -1, 46, -1,  2, -1, 46, -1, 12,  2, 12, -1, 42, 29, 15, 36],
    [40, 33, 33, -1, 30, -1, 46, -1, 44, -1, 36, -1,  9, -1, 36, 46, 39],
    [45, -1, 35, 33, -1, 33, -1, 39, 46, 28, -1, 36, -1, 36, 28, -1, 46],
    [-1,  1, -1, 46, 28, -1, 45, -1, 46, 29, 12, 29, 15, 46, 29, 14, -1],
    [14, -1, 45, -1, -1, 33, -1, 45, -1, 36, -1, 36, -1, -1, 36, -1, 46],
    [38, 35, 35, 38, 33, 35, 36, -1, 44, -1, 36, 46, 46, 38, 46, 26, 33],
    [46, -1, 28, -1, -1, 32, -1, 39, -1, 28, -1, 39, -1, -1,  9, -1, 46],
    [-1, 46, -1, 46, 28, -1, 14, -1, 45,  2, 22, 29, 45, 46,  2, 14, -1],
    [46, -1, 45, 33, -1, 33, -1, 45, 46, 46, -1, 36, -1, 36, 36, -1, 46],
    [46, 30, 32, -1, 33, -1, 28, -1, 44, -1, 36, -1, 42, -1,  9, 28, 46],
    [45, 28, -1, 46, -1, 26, -1, 46, -1, 36,  2, 12, -1, 36,  2, 46, 46],
    [19, 36, 33, 33, 28, -1, 46, -1, 45, -1, 36, -1,  9, 36, 36, 46, 41],
];
const FROZEN_BRICK: Table = [
    [-1, -1, -1, -1, -1, 29, -1, 37, -1, 20, -1, 20, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, 29, -1, -1, -1, 44, -1, -1, -1, 44, -1, -1, -1, -1],
    [-1, -1, -1, 33, -1, 29, -1, 37, -1, 44, -1, 44, -1, 44, -1, -1, -1],
    [-1, 33, -1, -1, 33, -1, 37, -1, -1, -1, 44, -1, 44, -1, -1, 44, -1],
    [37, -1, 30, -1, -1,  9, -1, 13, -1, -1, -1, -1, -1, -1, -1, -1, 44],
    [-1, 33, -1, 33, 33, -1, 37, -1, 44, -1, 20, -1, 44, 37, -1, 44, -1],
    [-1, -1, -1, -1, -1, -1, -1, 37, -1, 20, -1, -1, -1, -1, -1, -1, -1],
    [-1, 33, -1, 33, 33, -1, 37, -1, 44, -1, 20, -1, 44, 37, -1, 44, -1],
    [37, -1, 30, -1, -1, -1, -1, 14, -1, -1, -1, -1, -1, -1, -1, -1, 44],
    [-1, 33, -1, -1, 33, -1, 37, -1, -1, -1, 20, -1, 44, -1, -1, 20, -1],
    [-1, -1, -1, 33, -1, 29, -1, 37, -1, 44, -1, 44, -1, 44, -1, -1, -1],
    [-1, -1, -1, -1, 33, -1,  9, -1, 44, -1, -1, -1, 44, -1, -1, -1, -1],
    [-1, -1, -1, -1, -1, 29, -1, 37, -1, 20, -1, 44, -1, -1, -1, -1, -1],
];

/*
 * Instalação Cyberpunk: o cenário de referência tem 19 × 15 células de ~49 × 52 px (contando a muralha);
 * o miolo, 17 × 13. A lajota mais comum é a 0. A planta lida do cenário:
 *
 *   ...B.........B...
 *   ...B..B.B.B..B...
 *   B.B.B.......B.B.B
 *   .B...B.B.B.B...B.
 *   B.....B...B.....B
 *   .B...B.....B...B.
 *   ...B.........B...
 *   .B...B.B.B.B...B.
 *   B.....B...B.....B
 *   .B...B.B.B.B...B.
 *   B.B.B.......B.B.B
 *   ...B..B.B.B..B...
 *   ...B.........B...
 */
const CYBER_FLOOR: Table = [
    [ 0,  0,  0, -1,  0,  0,  0,  0,  0,  0,  0,  0,  1, -1,  0,  0,  0],
    [13,  0,  0, -1,  0,  9, -1,  0, -1,  1, -1, 22, 12, -1,  0,  0, 13],
    [-1,  0, -1,  0, -1,  0, 13,  0,  0,  0,  0,  0, -1,  0, -1,  0, -1],
    [ 0, -1,  0,  0,  0, -1,  8, -1,  0, -1,  0, -1,  0, 13,  0, -1,  0],
    [-1, 27,  5,  0,  5, 27, -1,  0,  0,  0, -1, 28,  9, 12,  5, 24, -1],
    [ 0, -1,  0,  0,  0, -1,  7,  0, 13,  0,  0, -1, 13,  0,  0, -1,  0],
    [ 0,  0,  0, -1, 22,  5, 13,  0, 34, 22,  0,  0, 22, -1,  0,  0,  0],
    [ 0, -1,  0, 27,  0, -1, 19, -1,  0, -1,  0, -1,  0,  0, 13, -1,  0],
    [-1,  0,  0,  0, 12,  0, -1,  0,  0,  0, -1,  0,  0, 13,  0,  0, -1],
    [ 0, -1,  0,  0, 13, -1,  7, -1,  0, -1,  0, -1,  0, 22,  1, -1,  0],
    [-1,  0, -1,  0, -1, 34, 13,  0,  0,  0,  0,  0, -1,  0, -1,  0, -1],
    [13,  0,  0, -1,  0,  0, -1,  0, -1,  1, -1,  0,  5, -1,  0,  0,  0],
    [ 0,  0,  0, -1,  0, 34,  0,  0,  0,  0,  0, 34,  1, -1,  0,  6, 13],
];
const CYBER_BRICK: Table = [
    [-1, -1, -1,  0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 15, -1, -1, -1],
    [-1, -1, -1,  0, -1, -1, 14, -1,  0, -1,  0, -1, -1, 34, -1, -1, -1],
    [ 0, -1,  0, -1,  0, -1, -1, -1, -1, -1, -1, -1,  5, -1, 15, -1, 14],
    [-1,  0, -1, -1, -1, 13, -1, 21, -1,  0, -1,  0, -1, -1, -1, 14, -1],
    [ 0, -1, -1, -1, -1, -1, 14, -1, -1, -1,  0, -1, -1, -1, -1, -1, 14],
    [-1, 21, -1, -1, -1,  7, -1, -1, -1, -1, -1,  0, -1, -1, -1, 21, -1],
    [-1, -1, -1,  0, -1, -1, -1, -1, -1, -1, -1, -1, -1, 14, -1, -1, -1],
    [-1,  0, -1, -1, -1,  4, -1, 21, -1,  0, -1,  0, -1, -1, -1, 14, -1],
    [ 0, -1, -1, -1, -1, -1, 21, -1, -1, -1,  0, -1, -1, -1, -1, -1,  5],
    [-1,  0, -1, -1, -1,  4, -1, 21, -1,  0, -1,  0, -1, -1, -1, 14, -1],
    [ 0, -1,  0, -1,  0, -1, -1, -1, -1, -1, -1, -1,  5, -1, 15, -1, 14],
    [-1, -1, -1,  0, -1, -1, 21, -1, 18, -1,  0, -1, -1, 14, -1, -1, -1],
    [-1, -1, -1, 18, -1, -1, -1, -1, -1, -1, -1, -1, -1, 35, -1, -1, -1],
];

/*
 * Templo do Deserto: o cenário de referência tem 19 × 15 células de ~50 × 54 px (contando a muralha);
 * o miolo, 17 × 13. A lajota mais comum é a 5. A planta lida do cenário:
 *
 *   ...P....P....P...
 *   ...B.B.BBB.B.....
 *   ....B.B...B.B....
 *   BB.B.B.BBB.B.B.BB
 *   .................
 *   .B..B.B..B..B.B.B
 *   B..B.B..B..B.B...
 *   B..B.B.....B.B..B
 *   .BB.B.BB.BB.B.BB.
 *   .................
 *   B..BBBB.B..B.B..B
 *   .....B.B.B.B.....
 *   ...B....B....B...
 */
const DESERT_FLOOR: Table = [
    [15,  8,  5, -1, 12,  1,  4,  4, -1, 13, 16, 17, 12, -1, 16, 13,  5],
    [14,  9,  5, -1,  3, -1,  3, -1, -1, -1, 16, -1, 16, 15, 15, 18,  3],
    [15,  5,  9,  5, -1,  5, -1, 16,  5, 16, -1, 15, -1, 13, 16, 17,  5],
    [-1, -1,  8, -1, 16, -1, 16, -1, -1, -1, 17, -1, 14, -1, 15, -1, -1],
    [15,  5,  5,  3,  5,  5,  4,  5, 12,  5,  5, 12,  5, 16,  5, 32,  3],
    [16, -1,  6,  5, -1,  5, -1,  6,  5, -1,  6, 16, -1, 16, -1, 11, -1],
    [-1, 17,  5, -1, 15, -1, 15,  4, -1, 14,  5, -1, 15, -1, 15, 17,  5],
    [-1, 17,  5, -1,  3, -1, 13,  4,  9, 16,  5, -1, 16, -1, 32,  3, -1],
    [14, -1, -1, 15, -1, 15, -1, -1, 16, -1, -1, 15, -1, 15, -1, -1,  3],
    [16,  5,  8,  5,  3,  5,  3,  4,  5, 16, 17, 11, 13, 16, 13, 13,  5],
    [-1, 12,  8, -1, -1, -1, -1, 15, -1, 15,  5, -1, 15, -1, 15, 12, -1],
    [14,  5,  5,  5,  4, -1, 15, -1,  5, -1, 15, -1, 15, 15, 16, 18,  3],
    [33,  9,  5, -1, 15,  4,  4,  4, -1, 15, 35, 12, 15, -1, 34, 18, 22],
];
const DESERT_BRICK: Table = [
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, -1, -1, 13, -1,  9, -1, 16, 13, 11, -1, 25, -1, -1, -1, -1, -1],
    [-1, -1, -1, -1, 21, -1,  9, -1, -1, -1,  9, -1,  9, -1, -1, -1, -1],
    [11, 11, -1, 29, -1, 11, -1, 11, 11, 11, -1, 11, -1, 33, -1, 11, 36],
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [-1, 24, -1, -1, 13, -1, 13, -1, -1, 24, -1, -1,  2, -1, 24, -1, 24],
    [ 0, -1, -1, 11, -1, 11, -1, -1, 11, -1, -1, 11, -1, 10, -1, -1, -1],
    [ 5, -1, -1, 27, -1, 28, -1, -1, -1, -1, -1, 12, -1, 33, -1, -1,  8],
    [-1,  9,  4, -1,  4, -1,  4,  4, -1, 25,  9, -1, 25, -1,  9,  4, -1],
    [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
    [ 9, -1, -1, 11, 24, 11, 28, -1, 11, -1, -1, 11, -1, 11, -1, -1, 11],
    [-1, -1, -1, -1, -1, 24, -1, 29, -1, 24, -1, 24, -1, -1, -1, -1, -1],
    [-1, -1, -1,  4, -1, -1, -1, -1,  4, -1, -1, -1, -1,  4, -1, -1, -1],
];

/** A referência: as tabelas e a regra dos merlões de `scenario.ts`, como sempre foram. */
const GARDEN: ThemeArt = {
  id: "garden",
  floor: gardenFloor,
  brick: gardenBrick,
};

const THEME_ART: Record<string, ThemeArt> = {
  garden: GARDEN,
  forest: fromTables("forest", FOREST_FLOOR, FOREST_BRICK, 22),
  volcano: fromTables("volcano", VOLCANO_FLOOR, VOLCANO_BRICK, 29),
  frozen: fromTables("frozen", FROZEN_FLOOR, FROZEN_BRICK, 46),
  cyber: fromTables("cyber", CYBER_FLOOR, CYBER_BRICK, 0),
  desert: fromTables("desert", DESERT_FLOOR, DESERT_BRICK, 5),
};

export const THEME_ART_IDS: readonly string[] = Object.keys(THEME_ART);

/** O desenho de um tema; um tema que a tela não conhece desenha como a referência. */
export const themeArt = (id: string): ThemeArt => THEME_ART[id] ?? GARDEN;

/** Um ornamento a desenhar: onde (em células, o centro dele) e qual peça da série (pelo lugar a partir do centro, ou a central). */
export type Ornament = { at: number; piece: number | "c" };

/**
 * Onde vão os ornamentos de uma série numa muralha de `length` células.
 *
 *  - Com peça central (o portão gelado, a torre vulcânica, a porta
 *    cyberpunk): ela vai no meio, e as outras saem dele no passo da série,
 *    para os dois lados, até a folga do canto; as mais perto do meio são
 *    `pieces[0]`, as seguintes `pieces[1]`, dando a volta.
 *  - Sem peça central: a regra da referência (`crenellation`), centrada;
 *    com `skipCenter`, a posição do meio (se cair uma) fica vazia.
 */
export function ornamentsOf(series: OrnamentSeries, length: number): Ornament[] {
  const middle = length / 2;
  if (series.center) {
    const out: Ornament[] = [{ at: middle, piece: "c" }];
    if (!series.pieces) return out;
    for (let k = 1; middle - k * series.pitch >= series.margin; k++) {
      const piece = (k - 1) % series.pieces;
      out.push({ at: middle - k * series.pitch, piece }, { at: middle + k * series.pitch, piece });
    }
    return out.sort((a, b) => a.at - b.at);
  }
  const positions = crenellation(length, series.pitch, series.margin);
  const n = positions.length;
  const out: Ornament[] = [];
  positions.forEach((at, i) => {
    if (series.skipCenter && Math.abs(at - middle) < 1e-9) return;
    const rank = Math.floor(Math.abs(i - (n - 1) / 2));
    out.push({ at, piece: series.pieces ? rank % series.pieces : 0 });
  });
  return out;
}

/* Conferência, uma vez: toda tabela é retangular e cabe no tileset do tema. */
for (const [id, tables] of Object.entries({ forest: [FOREST_FLOOR, FOREST_BRICK], volcano: [VOLCANO_FLOOR, VOLCANO_BRICK], frozen: [FROZEN_FLOOR, FROZEN_BRICK], cyber: [CYBER_FLOOR, CYBER_BRICK], desert: [DESERT_FLOOR, DESERT_BRICK] })) {
  const [floor, brick] = tables;
  for (const table of tables) {
    if (table.some((row) => row.length !== table[0].length)) throw new Error(`a tabela do tema ${id} não é retangular`);
  }
  if (floor.length !== brick.length || floor[0].length !== brick[0].length) throw new Error(`as tabelas do tema ${id} não batem`);
  if (floor.some((row) => row.some((v) => v >= variants("floor", id)))) throw new Error(`há uma lajota fora do tileset de ${id}`);
  if (brick.some((row) => row.some((v) => v >= variants("brick", id)))) throw new Error(`há um tijolo fora do tileset de ${id}`);
}

export { TILE };

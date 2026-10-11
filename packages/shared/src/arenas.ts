import { ARENA_SIZES, ARENA_SIZE_DIMS, defineArena, emptyLayout, type ArenaDefinition, type ArenaSize } from "./arena.js";

/*
 * As nove arenas: três tamanhos, três desenhos em cada um. Cada planta foi
 * desenhada à mão, célula a célula, e é sempre a mesma — nada aqui é
 * sorteado. A legenda está em `arena.ts`: `#` muralha, `P` pilar, `B`
 * tijolo, `.` chão, `1234` onde cada um nasce (P1 em cima à esquerda, P2
 * embaixo à direita, P3 em cima à direita, P4 embaixo à esquerda).
 *
 * Todas são simétricas — nos dois eixos, ou em meia-volta — para os quatro
 * cantos terem o mesmo caminho até o meio. Dentro de cada tamanho os três
 * desenhos são outros: nenhum é o outro esticado, virado ou espelhado.
 */

/* ---------------------------------------------------------------- pequenas */

/** A grade clássica em miniatura: pilar sim, pilar não, e corredores curtos. */
export const SMALL_CLASSIC = defineArena(
  {
    id: "small-classic",
    name: "Clássica",
    blurb: "A grade de pilares de sempre, em corredores curtos.",
    size: "small",
  },
  [
    "###########",
    "#1..B.B..3#",
    "#.P.PBP.P.#",
    "#.BB.B.BB.#",
    "#BP.PBP.PB#",
    "#.B.B.B.B.#",
    "#BP.PBP.PB#",
    "#.BB.B.BB.#",
    "#.P.PBP.P.#",
    "#4..B.B..2#",
    "###########",
  ],
);

/** O meio aberto; o que há de bloco fica nas beiradas, e cada canto tem duas saídas livres. */
export const SMALL_OPEN = defineArena(
  {
    id: "small-open",
    name: "Praça",
    blurb: "O meio livre e os blocos nas beiradas: encontro rápido.",
    size: "small",
  },
  [
    "###########",
    "#1..B.B..3#",
    "#.P.BPB.P.#",
    "#....B....#",
    "#BB.....BB#",
    "#.P.....P.#",
    "#BB.....BB#",
    "#....B....#",
    "#.P.BPB.P.#",
    "#4..B.B..2#",
    "###########",
  ],
);

/** Um anel por fora, uma cruz por dentro, e bolsões curtos atrás de tijolos. */
export const SMALL_MAZE = defineArena(
  {
    id: "small-maze",
    name: "Labirinto",
    blurb: "Um anel em volta, uma cruz no meio e becos curtos.",
    size: "small",
  },
  [
    "###########",
    "#1...B...3#",
    "#.PPP.PPP.#",
    "#.P.B.B.P.#",
    "#.PB.P.BP.#",
    "#.BB...BB.#",
    "#.PB.P.BP.#",
    "#.P.B.B.P.#",
    "#.PPP.PPP.#",
    "#4...B...2#",
    "###########",
  ],
);

/* ------------------------------------------------------------------ médias */

/** A grade clássica inteira, com os tijolos espalhados por igual. */
export const MEDIUM_GRID = defineArena(
  {
    id: "medium-grid",
    name: "Grade",
    blurb: "A grade clássica, com tijolos por toda parte.",
    size: "medium",
  },
  [
    "###############",
    "#1..B.B.B.B..3#",
    "#.P.PBP.PBP.P.#",
    "#.BB.B.B.B.BB.#",
    "#BPBP.PBP.PBPB#",
    "#..B.B...B.B..#",
    "#BP.PBP.PBP.PB#",
    "#..B.B...B.B..#",
    "#BPBP.PBP.PBPB#",
    "#.BB.B.B.B.BB.#",
    "#.P.PBP.PBP.P.#",
    "#4..B.B.B.B..2#",
    "###############",
  ],
);

/** Quatro salas e um corredor no meio, ligados por passagens de uma célula. */
export const MEDIUM_REGIONS = defineArena(
  {
    id: "medium-regions",
    name: "Salas",
    blurb: "Quatro salas e um corredor central, com passagens estreitas.",
    size: "medium",
  },
  [
    "###############",
    "#1..BB.P.BB..3#",
    "#.P.P..P..P.P.#",
    "#.B.........B.#",
    "#.P.PBB.BBP.P.#",
    "#.B..B...B..B.#",
    "#PP.PPP.PPP.PP#",
    "#.B..B...B..B.#",
    "#.P.PBB.BBP.P.#",
    "#.B.........B.#",
    "#.P.P..P..P.P.#",
    "#4..BB.P.BB..2#",
    "###############",
  ],
);

/**
 * Uma cruz aberta no meio e um desenho diferente em cada quadrante: a grade,
 * a escada, a casinha e as barras. Cada canto fica a onze passos do centro.
 */
export const MEDIUM_CROSSROADS = defineArena(
  {
    id: "medium-crossroads",
    name: "Encruzilhada",
    blurb: "Uma cruz aberta no meio e um desenho em cada canto.",
    size: "medium",
  },
  [
    "###############",
    "#1..B.B.BB.P.3#",
    "#.P.P.P...B.P.#",
    "#.B...B.P..B..#",
    "#.P.P.P..PB...#",
    "#.B.BP...BP.B.#",
    "#.............#",
    "#.BB..B..BB.B.#",
    "#.PPP.B.PP.PP.#",
    "#.B.B.P...B...#",
    "#.PPP.B.BPP.P.#",
    "#4......B..B.2#",
    "###############",
  ],
);

/* ----------------------------------------------------------------- grandes */

/**
 * A reconstrução, célula a célula, da imagem de referência (`ChatGPT Image
 * Oct 11, 2026, 01_01_13 AM.png`). A planta foi lida da imagem medindo a
 * grade (27 × 17 células, 55,6 × 57,5 px cada) e classificando o miolo de
 * cada célula pela cor: cinza-azulado é pilar, laranja é tijolo. É simétrica
 * nos dois eixos, como a imagem, e é a arena com que a sala abre.
 */
export const LARGE_CLASSIC = defineArena(
  {
    id: "large-classic",
    name: "Jardim",
    blurb: "A arena da referência: corredores longos na grade clássica.",
    size: "large",
  },
  [
    "###########################",
    "#1..B...B.BB...BB.B...B..3#",
    "#...P.P.BP.BP.PB.PB.P.P...#",
    "#.....BB..B.B.B.B..BB.....#",
    "#BPBP.PBBPBBP.PBBPBBP.PBPB#",
    "#..B....B.B.....B.B....B..#",
    "#.PBP.PBBP.BP.PB.PBBP.PBP.#",
    "#BB.BB.B..BB...BB..B.BB.BB#",
    "#.....P..P...P...P..P.....#",
    "#BB.BB.B..BB...BB..B.BB.BB#",
    "#.PBP.PBBP.BP.PB.PBBP.PBP.#",
    "#..B....B.B.....B.B....B..#",
    "#BPBP.PBBPBBP.PBBPBBP.PBPB#",
    "#.....BB..B.B.B.B..BB.....#",
    "#...P.P.BP.BP.PB.PB.P.P...#",
    "#4..B...B.BB...BB.B...B..2#",
    "###########################",
  ],
);

/**
 * Seis regiões separadas por muros de pilares com uma passagem cada, e três
 * desenhos de corredor: a serpentina de barras deitadas nos cantos do P1 e
 * do P2, a grade miúda nos do P3 e do P4, as barras de pé no meio. Meia-volta
 * leva um canto no seu oposto.
 */
export const LARGE_MAZE = defineArena(
  {
    id: "large-maze",
    name: "Muralhas",
    blurb: "Seis regiões, muros com uma passagem e três desenhos de corredor.",
    size: "large",
  },
  [
    "###########################",
    "#1...B......B.B..P.B.B...3#",
    "#.PPPBPP.P.P.P.P.PP.P.PBP.#",
    "#...B..B.PBP.P.PBB..B.....#",
    "#PPPPBPP.B.PB.BP.PBP.P.P.P#",
    "#..B...B.P.P.P.P.P...B..B.#",
    "#.PPBPPPPPBP.P.PBPP.P.P.P.#",
    "#.B..B...P...B.....B...B..#",
    "#PPP.PPPBPPPP.PPPPBPPP.PPP#",
    "#..B...B.....B...P...B..B.#",
    "#.P.P.P.PPBP.P.PBPPPPPBPP.#",
    "#.B..B...P.P.P.P.P.B...B..#",
    "#P.P.P.PBP.PB.BP.B.PPBPPPP#",
    "#.....B..BBP.P.PBP.B..B...#",
    "#.PBP.P.PP.P.P.P.P.PPBPPP.#",
    "#4...B.B.P..B.B......B...2#",
    "###########################",
  ],
);

/**
 * Nove clareiras separadas por sebes de tijolo e pilar com passagens
 * abertas a cada quatro células: dá para correr de uma à outra sem derrubar
 * nada, e derrubar abre atalhos.
 */
export const LARGE_ZONES = defineArena(
  {
    id: "large-zones",
    name: "Clareiras",
    blurb: "Clareiras abertas, separadas por sebes com passagens.",
    size: "large",
  },
  [
    "###########################",
    "#1...B.....B...B.....B...3#",
    "#..P...BB.P.....P.BB...P..#",
    "#.B..P..P...BPB...P..P..B.#",
    "#...B...BB.......BB...B...#",
    "#.BPB.BPB.BPB.BPB.BPB.BPB.#",
    "#.B...B.B.B..B..B.B.B...B.#",
    "#...P..BP..P...P..PB..P...#",
    "#.........................#",
    "#...P..BP..P...P..PB..P...#",
    "#.B...B.B.B..B..B.B.B...B.#",
    "#.BPB.BPB.BPB.BPB.BPB.BPB.#",
    "#...B...BB.......BB...B...#",
    "#.B..P..P...BPB...P..P..B.#",
    "#..P...BB.P.....P.BB...P..#",
    "#4...B.....B...B.....B...2#",
    "###########################",
  ],
);

/* ------------------------------------------------------------- o catálogo */

/** As nove, na ordem da escolha: as pequenas, as médias, as grandes. */
export const ARENAS: readonly ArenaDefinition[] = [
  SMALL_CLASSIC,
  SMALL_OPEN,
  SMALL_MAZE,
  MEDIUM_GRID,
  MEDIUM_REGIONS,
  MEDIUM_CROSSROADS,
  LARGE_CLASSIC,
  LARGE_MAZE,
  LARGE_ZONES,
];

/** A arena com que uma sala abre: a da referência. */
export const DEFAULT_ARENA = LARGE_CLASSIC;
/** O nome antigo da planta da referência, para quem só conhece uma arena. */
export const ARENA = LARGE_CLASSIC;

/** Só a muralha, tudo livre por dentro: a arena limpa em que a regra se testa. */
export const EMPTY_ARENA = defineArena(
  { id: "empty", name: "Vazia", blurb: "Só a muralha.", size: "large" },
  emptyLayout(LARGE_CLASSIC.cols, LARGE_CLASSIC.rows),
);

export const arenaById = (id: unknown): ArenaDefinition | undefined =>
  typeof id === "string" ? ARENAS.find((arena) => arena.id === id) : undefined;

export const arenasOfSize = (size: ArenaSize): ArenaDefinition[] =>
  ARENAS.filter((arena) => arena.size === size);

export const isArenaSize = (value: unknown): value is ArenaSize =>
  ARENA_SIZES.includes(value as ArenaSize);

/**
 * A arena de um tamanho sem planta nenhuma: só a muralha e os quatro nos
 * cantos. É a miniatura da escolha — o host escolhe o tamanho e o tema, e a
 * planta é sorteada a cada rodada, então a miniatura não pode mostrar uma.
 */
export const SIZE_PREVIEWS: Record<ArenaSize, ArenaDefinition> = Object.fromEntries(
  ARENA_SIZES.map((size) => {
    const { cols, rows } = ARENA_SIZE_DIMS[size];
    return [size, defineArena({ id: `preview-${size}`, name: "Sorteada", blurb: "A planta é sorteada a cada rodada.", size }, emptyLayout(cols, rows))];
  }),
) as Record<ArenaSize, ArenaDefinition>;

/** Uma das três do tamanho, pelo sorteio dado: a planta de cada rodada. */
export function pickArena(size: ArenaSize, random: () => number = Math.random): ArenaDefinition {
  const options = arenasOfSize(size);
  return options[Math.min(options.length - 1, Math.floor(random() * options.length))];
}

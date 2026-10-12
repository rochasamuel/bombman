import { BRICK, BUSH, FLOOR, WALL, cellIndex } from "./contract.js";

/*
 * A planta de uma arena. Nada aqui é sorteado: cada arena nasce igual em toda
 * rodada, em todo cliente, e o servidor é quem a monta e espelha.
 *
 * Uma planta é um desenho em texto, uma linha por fileira, contando a
 * muralha da borda:
 *
 *   #  muralha (só na borda)        P  pilar (não quebra)
 *   B  tijolo (a chama derruba)     .  chão
 *   M  moita (a chama derruba; nenhuma planta usa)
 *   1234  o chão em que cada jogador nasce, na ordem das cores: P1 em cima à
 *         esquerda, P2 embaixo à direita, P3 em cima à direita, P4 embaixo à
 *         esquerda — os dois primeiros a entrar ficam em cantos opostos.
 *
 * As nove plantas moram em `arenas.ts`; aqui fica o que toda planta tem.
 */

export type ArenaSize = "small" | "medium" | "large";
export const ARENA_SIZES: readonly ArenaSize[] = ["small", "medium", "large"];

export const ARENA_SIZE_NAME: Record<ArenaSize, string> = {
  small: "Pequena",
  medium: "Média",
  large: "Grande",
};

/** Largura e altura de cada tamanho, em células, CONTANDO a muralha. */
export const ARENA_SIZE_DIMS: Record<ArenaSize, { cols: number; rows: number }> = {
  small: { cols: 11, rows: 11 },
  medium: { cols: 15, rows: 13 },
  large: { cols: 27, rows: 17 },
};

/** Uma posição em células. */
export type GridPosition = readonly [cx: number, cy: number];

export type ArenaDefinition = {
  /** `small-classic`, `large-maze`… O que a sala guarda e o cliente pede. */
  id: string;
  name: string;
  /** Uma frase sobre o desenho, para o cartão da escolha. */
  blurb: string;
  size: ArenaSize;
  cols: number;
  rows: number;
  layout: readonly string[];
  /** Onde cada um nasce, na ordem das cores (ver os dígitos da planta). */
  spawns: readonly [GridPosition, GridPosition, GridPosition, GridPosition];
};

const CELL_OF: Record<string, number> = {
  "#": WALL,
  P: WALL,
  B: BRICK,
  M: BUSH,
  ".": FLOOR,
  "1": FLOOR,
  "2": FLOOR,
  "3": FLOOR,
  "4": FLOOR,
};

export const isWalkableChar = (ch: string) => CELL_OF[ch] === FLOOR;

/**
 * Lê uma planta. O que é só forma (tamanho, caracteres, os quatro dígitos)
 * quebra aqui, no carregamento; o que é jogo (se dá para sair do canto, se a
 * arena é toda alcançável) é `validateArena`, que os testes rodam.
 */
export function defineArena(
  meta: { id: string; name: string; blurb: string; size: ArenaSize },
  layout: readonly string[],
): ArenaDefinition {
  const rows = layout.length;
  const cols = layout[0]?.length ?? 0;
  if (rows < 5 || cols < 5 || layout.some((row) => row.length !== cols)) {
    throw new Error(`a planta "${meta.id}" tem de ser retangular`);
  }
  const spawns: Array<GridPosition | undefined> = [undefined, undefined, undefined, undefined];
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const ch = layout[cy][cx];
      if (CELL_OF[ch] === undefined) {
        throw new Error(`célula desconhecida na planta "${meta.id}": "${ch}" em ${cx},${cy}`);
      }
      if (ch >= "1" && ch <= "4") {
        const slot = Number(ch) - 1;
        if (spawns[slot]) throw new Error(`a planta "${meta.id}" tem dois "${ch}"`);
        spawns[slot] = [cx, cy];
      }
    }
  }
  const missing = spawns.findIndex((s) => !s);
  if (missing >= 0) throw new Error(`a planta "${meta.id}" não diz onde nasce o P${missing + 1}`);
  return {
    ...meta,
    cols,
    rows,
    layout,
    spawns: spawns as [GridPosition, GridPosition, GridPosition, GridPosition],
  };
}

/** Escreve a planta na grade (no lugar, para quem a espelha não perder a referência). */
export function fillGrid(grid: number[], arena: ArenaDefinition): number[] {
  const { cols, rows, layout } = arena;
  grid.length = cols * rows;
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      grid[cellIndex(cx, cy, cols)] = CELL_OF[layout[cy][cx]];
    }
  }
  return grid;
}

/**
 * A ordem em que os blocos do aperto caem: em espiral, anel a anel, da borda
 * para o meio, no sentido do relógio a partir do canto de cima à esquerda, até
 * a última célula. O pilar já é bloco e fica de fora. Depende só da planta: a
 * tela calcula a mesma lista.
 */
export function hurryOrder(arena: ArenaDefinition): GridPosition[] {
  const order: GridPosition[] = [];
  let [x0, y0, x1, y1] = [1, 1, arena.cols - 2, arena.rows - 2];
  const push = (cx: number, cy: number) => {
    if (CELL_OF[arena.layout[cy][cx]] !== WALL) order.push([cx, cy]);
  };
  while (x0 <= x1 && y0 <= y1) {
    for (let cx = x0; cx <= x1; cx++) push(cx, y0);
    for (let cy = y0 + 1; cy <= y1; cy++) push(x1, cy);
    // O anel de uma fileira ou coluna só já acabou nas duas voltas acima.
    if (y1 > y0) for (let cx = x1 - 1; cx >= x0; cx--) push(cx, y1);
    if (x1 > x0) for (let cy = y1 - 1; cy > y0; cy--) push(x0, cy);
    [x0, y0, x1, y1] = [x0 + 1, y0 + 1, x1 - 1, y1 - 1];
  }
  return order;
}

/** Só a muralha, tudo livre por dentro, os quatro nos cantos: a arena limpa em que a regra se testa. */
export function emptyLayout(cols: number, rows: number): string[] {
  const rows_ = Array.from({ length: rows }, (_, cy) =>
    cy === 0 || cy === rows - 1 ? "#".repeat(cols) : `#${".".repeat(cols - 2)}#`,
  );
  const put = (cx: number, cy: number, ch: string) => {
    rows_[cy] = `${rows_[cy].slice(0, cx)}${ch}${rows_[cy].slice(cx + 1)}`;
  };
  put(1, 1, "1");
  put(cols - 2, rows - 2, "2");
  put(cols - 2, 1, "3");
  put(1, rows - 2, "4");
  return rows_;
}

/* ----------------------------------------------------------- a conferência */

const NEIGHBORS: ReadonlyArray<GridPosition> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * O que faz uma planta ser jogável. Devolve a lista do que está errado
 * (vazia quando está tudo certo), para o teste dizer o quê, e não só que não.
 *
 *  - a borda é toda muralha, e não há muralha por dentro (por dentro é pilar);
 *  - o tamanho é o do seu grupo;
 *  - cada um nasce no seu quadrante, com dois vizinhos livres e um lugar
 *    para se esconder da própria primeira bomba sem derrubar nada;
 *  - toda célula que não é pilar se alcança de qualquer canto, derrubando
 *    tijolos: não há bolsão murado nem tijolo que ninguém alcance.
 */
export function validateArena(arena: ArenaDefinition): string[] {
  const problems: string[] = [];
  const { cols, rows, layout, spawns } = arena;
  const at = (cx: number, cy: number) => layout[cy]?.[cx] ?? "#";

  const dims = ARENA_SIZE_DIMS[arena.size];
  if (cols !== dims.cols || rows !== dims.rows) {
    problems.push(`uma arena ${arena.size} tem ${dims.cols}×${dims.rows}, não ${cols}×${rows}`);
  }

  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const border = cx === 0 || cy === 0 || cx === cols - 1 || cy === rows - 1;
      const ch = at(cx, cy);
      if (border && ch !== "#") problems.push(`a muralha tem um buraco em ${cx},${cy}`);
      if (!border && ch === "#") problems.push(`muralha por dentro em ${cx},${cy} (use P)`);
    }
  }

  const quadrant: ReadonlyArray<(cx: number, cy: number) => boolean> = [
    (cx, cy) => cx < cols / 2 && cy < rows / 2,
    (cx, cy) => cx > cols / 2 && cy > rows / 2,
    (cx, cy) => cx > cols / 2 && cy < rows / 2,
    (cx, cy) => cx < cols / 2 && cy > rows / 2,
  ];
  spawns.forEach(([sx, sy], slot) => {
    const who = `P${slot + 1} (${sx},${sy})`;
    if (!quadrant[slot](sx, sy)) problems.push(`${who} nasce fora do seu quadrante`);
    const free = NEIGHBORS.filter(([dx, dy]) => isWalkableChar(at(sx + dx, sy + dy)));
    if (free.length < 2) problems.push(`${who} nasce murado: só ${free.length} vizinho livre`);
    // Andando só pelo chão, tem de haver uma célula fora da cruz da bomba de alcance 1.
    const reach = flood(arena, sx, sy, (ch) => isWalkableChar(ch));
    const safe = [...reach].some((key) => {
      const [cx, cy] = key.split(",").map(Number);
      return Math.abs(cx - sx) + Math.abs(cy - sy) >= 2;
    });
    if (!safe) problems.push(`${who} não tem onde se esconder da própria bomba`);
  });

  const open = new Set<string>();
  for (let cy = 1; cy < rows - 1; cy++) {
    for (let cx = 1; cx < cols - 1; cx++) {
      if (at(cx, cy) !== "P") open.add(`${cx},${cy}`);
    }
  }
  const reach = flood(arena, spawns[0][0], spawns[0][1], (ch) => ch !== "P" && ch !== "#");
  if (reach.size !== open.size) {
    const stranded = [...open].filter((key) => !reach.has(key));
    problems.push(`há ${stranded.length} célula(s) que ninguém alcança: ${stranded.slice(0, 6).join(" ")}`);
  }

  return problems;
}

/** As células alcançáveis a partir de uma, pisando só onde `passable` deixa. */
function flood(
  arena: ArenaDefinition,
  sx: number,
  sy: number,
  passable: (ch: string) => boolean,
): Set<string> {
  const seen = new Set<string>([`${sx},${sy}`]);
  const queue: GridPosition[] = [[sx, sy]];
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      if (seen.has(key)) continue;
      const ch = arena.layout[ny]?.[nx];
      if (ch === undefined || !passable(ch)) continue;
      seen.add(key);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

/* ------------------------------------------------------------- distância */

/** Quantas células até ir de uma a outra derrubando tijolos; -1 se não dá. */
export function walkDistance(arena: ArenaDefinition, from: GridPosition, to: GridPosition): number {
  const dist = new Map<string, number>([[`${from[0]},${from[1]}`, 0]]);
  const queue: GridPosition[] = [from];
  while (queue.length) {
    const [cx, cy] = queue.shift()!;
    const d = dist.get(`${cx},${cy}`)!;
    if (cx === to[0] && cy === to[1]) return d;
    for (const [dx, dy] of NEIGHBORS) {
      const nx = cx + dx;
      const ny = cy + dy;
      const key = `${nx},${ny}`;
      const ch = arena.layout[ny]?.[nx];
      if (dist.has(key) || ch === undefined || ch === "#" || ch === "P") continue;
      dist.set(key, d + 1);
      queue.push([nx, ny]);
    }
  }
  return -1;
}

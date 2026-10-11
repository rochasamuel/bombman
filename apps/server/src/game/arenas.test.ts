import {
  ARENAS,
  ARENA_SIZES,
  ARENA_SIZE_DIMS,
  BRICK,
  BombGame,
  COUNTDOWN,
  DEFAULT_ARENA,
  FLOOR,
  WALL,
  arenaById,
  arenasOfSize,
  cellIndex,
  defineArena,
  emptyLayout,
  fillGrid,
  isArenaSize,
  pickArena,
  validateArena,
  walkDistance,
  type ArenaDefinition,
} from "@bomb/shared";
import { describe, expect, it } from "vitest";

/** A grade de uma arena, como o motor a monta. */
const gridOf = (arena: ArenaDefinition) => fillGrid([], arena);

/** As oito simetrias do retângulo (as quatro de um quadrado, quando é quadrado). */
function symmetries(arena: ArenaDefinition): string[] {
  const rows = arena.layout.map((row) => row.replace(/[1-4]/g, "."));
  const flipX = (r: string[]) => r.map((row) => [...row].reverse().join(""));
  const flipY = (r: string[]) => [...r].reverse();
  const transpose = (r: string[]) => r[0].split("").map((_, x) => r.map((row) => row[x]).join(""));
  const out = [rows, flipX(rows), flipY(rows), flipX(flipY(rows))];
  if (arena.cols === arena.rows) {
    const t = transpose(rows);
    out.push(t, flipX(t), flipY(t), flipX(flipY(t)));
  }
  return out.map((r) => r.join("\n"));
}

describe("o catálogo", () => {
  it("tem nove arenas: três de cada tamanho", () => {
    expect(ARENAS).toHaveLength(9);
    expect(ARENA_SIZES).toEqual(["small", "medium", "large"]);
    for (const size of ARENA_SIZES) expect(arenasOfSize(size)).toHaveLength(3);
    expect(new Set(ARENAS.map((a) => a.id)).size).toBe(9);
    expect(new Set(ARENAS.map((a) => a.name)).size).toBe(9);
  });

  it("acha cada arena pelo nome, e só pelo nome", () => {
    for (const arena of ARENAS) expect(arenaById(arena.id)).toBe(arena);
    expect(arenaById("nope")).toBeUndefined();
    expect(arenaById(undefined)).toBeUndefined();
    expect(arenaById(42)).toBeUndefined();
    expect(isArenaSize("small")).toBe(true);
    expect(isArenaSize("huge")).toBe(false);
  });

  it("separa as arenas pelo tamanho, sem misturar", () => {
    for (const size of ARENA_SIZES) {
      for (const arena of arenasOfSize(size)) expect(arena.size).toBe(size);
    }
    expect(ARENAS.map((a) => a.size)).toEqual([
      "small", "small", "small", "medium", "medium", "medium", "large", "large", "large",
    ]);
  });

  it("abre a sala com a arena da referência", () => {
    expect(DEFAULT_ARENA.id).toBe("large-classic");
    expect(DEFAULT_ARENA.cols).toBe(27);
    expect(DEFAULT_ARENA.rows).toBe(17);
  });

  it("sorteia uma das três do tamanho pedido, e só delas", () => {
    for (const size of ARENA_SIZES) {
      const options = arenasOfSize(size);
      expect(pickArena(size, () => 0)).toBe(options[0]);
      expect(pickArena(size, () => 0.5)).toBe(options[1]);
      expect(pickArena(size, () => 0.999)).toBe(options[2]);
      // O sorteio é só o que entra: o mesmo número dá sempre a mesma arena.
      expect(pickArena(size, () => 0.4)).toBe(pickArena(size, () => 0.4));
    }
  });
});

describe.each(ARENAS)("a arena $id", (arena) => {
  it("tem o tamanho do seu grupo, e a planta é retangular", () => {
    const dims = ARENA_SIZE_DIMS[arena.size];
    expect(arena.cols).toBe(dims.cols);
    expect(arena.rows).toBe(dims.rows);
    expect(arena.layout).toHaveLength(arena.rows);
    for (const row of arena.layout) expect(row).toHaveLength(arena.cols);
  });

  it("passa na conferência: muralha inteira, cantos com saída, tudo alcançável", () => {
    expect(validateArena(arena)).toEqual([]);
  });

  it("só usa peças que existem: muralha, pilar, tijolo e chão", () => {
    const grid = gridOf(arena);
    expect(grid).toHaveLength(arena.cols * arena.rows);
    for (const cell of grid) expect([FLOOR, WALL, BRICK]).toContain(cell);
    // A borda é toda muralha.
    for (let cx = 0; cx < arena.cols; cx++) {
      expect(grid[cellIndex(cx, 0, arena.cols)]).toBe(WALL);
      expect(grid[cellIndex(cx, arena.rows - 1, arena.cols)]).toBe(WALL);
    }
    for (let cy = 0; cy < arena.rows; cy++) {
      expect(grid[cellIndex(0, cy, arena.cols)]).toBe(WALL);
      expect(grid[cellIndex(arena.cols - 1, cy, arena.cols)]).toBe(WALL);
    }
  });

  it("tem os quatro cantos em chão, cada um no seu quadrante, sem dois no mesmo lugar", () => {
    const grid = gridOf(arena);
    expect(arena.spawns).toHaveLength(4);
    expect(new Set(arena.spawns.map(([x, y]) => `${x},${y}`)).size).toBe(4);
    const midX = (arena.cols - 1) / 2;
    const midY = (arena.rows - 1) / 2;
    const sides = [
      [-1, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
    ];
    arena.spawns.forEach(([sx, sy], slot) => {
      expect(grid[cellIndex(sx, sy, arena.cols)]).toBe(FLOOR);
      expect(Math.sign(sx - midX)).toBe(sides[slot][0]);
      expect(Math.sign(sy - midY)).toBe(sides[slot][1]);
    });
  });

  it("dá o mesmo caminho até o meio a cada um dos quatro", () => {
    const cx = (arena.cols - 1) / 2;
    const cy = (arena.rows - 1) / 2;
    // Na referência o meio é um pilar: vale a célula livre mais perto dele.
    const targets: Array<readonly [number, number]> = [[cx, cy], [cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
    const fair = arena.spawns.map((s) =>
      Math.min(...targets.map((t) => walkDistance(arena, s, t)).filter((d) => d >= 0)),
    );
    expect(fair.every((d) => d > 0)).toBe(true);
    expect(Math.max(...fair) - Math.min(...fair)).toBeLessThanOrEqual(1);
  });

  it("tem tijolos para derrubar, e nem tanto que não dê para andar", () => {
    const grid = gridOf(arena);
    const inner = (arena.cols - 2) * (arena.rows - 2);
    const bricks = grid.filter((c) => c === BRICK).length;
    const floor = grid.filter((c) => c === FLOOR).length;
    expect(bricks / inner).toBeGreaterThanOrEqual(0.12);
    expect(bricks / inner).toBeLessThanOrEqual(0.5);
    expect(floor / inner).toBeGreaterThanOrEqual(0.4);
  });

  it("nasce igual toda vez", () => {
    expect(gridOf(arena)).toEqual(gridOf(arena));
    const a = new BombGame(() => 0, arena);
    const b = new BombGame(() => 0.99, arena);
    for (const game of [a, b]) {
      game.addPlayer("a", "ka", "A");
      game.addPlayer("b", "kb", "B");
      game.start();
      game.tick(COUNTDOWN);
    }
    expect(a.grid).toEqual(b.grid);
    expect(a.grid).toEqual(gridOf(arena));
  });

  it("é outra, e não uma das suas irmãs virada ou espelhada", () => {
    const mine = symmetries(arena)[0];
    for (const sister of arenasOfSize(arena.size)) {
      if (sister === arena) continue;
      expect(symmetries(sister)).not.toContain(mine);
    }
  });
});

describe("a planta", () => {
  it("recusa o que não é uma arena: forma torta, peça desconhecida, canto sem dono", () => {
    const meta = { id: "x", name: "X", blurb: "", size: "small" as const };
    expect(() => defineArena(meta, ["####", "#..#"])).toThrow(/retangular/);
    expect(() => defineArena(meta, emptyLayout(11, 11).map((r) => r.replace("1", "?")))).toThrow(
      /desconhecida/,
    );
    expect(() => defineArena(meta, emptyLayout(11, 11).map((r) => r.replace("3", ".")))).toThrow(/P3/);
    expect(() => defineArena(meta, emptyLayout(11, 11).map((r) => r.replace("3", "1")))).toThrow(/dois/);
  });

  it("aponta o que está errado numa planta jogável só na aparência", () => {
    const meta = { id: "y", name: "Y", blurb: "", size: "small" as const };
    const rows = emptyLayout(11, 11);
    // O P1 murado por pilares, e um bolsão que ninguém alcança.
    rows[1] = "#1P......3#";
    rows[2] = "#PP.......#";
    rows[5] = "#....PPP..#";
    rows[6] = "#....P.P..#";
    rows[7] = "#....PPP..#";
    const problems = validateArena(defineArena(meta, rows));
    expect(problems.some((p) => /P1.*murado/.test(p))).toBe(true);
    expect(problems.some((p) => /ninguém alcança/.test(p))).toBe(true);
    // Um buraco na muralha, e o tamanho errado para o grupo.
    const hole = emptyLayout(11, 11);
    hole[0] = "#####.#####";
    expect(validateArena(defineArena(meta, hole))).toContainEqual(expect.stringMatching(/buraco/));
    expect(validateArena(defineArena(meta, emptyLayout(15, 13)))).toContainEqual(
      expect.stringMatching(/small/),
    );
  });

  it("troca de arena no lobby e leva cada um para o seu canto", () => {
    const game = new BombGame(() => 0, arenaById("small-classic")!);
    game.addPlayer("a", "ka", "A");
    game.addPlayer("b", "kb", "B");
    expect(game.players[1].x).toBe(9.5);
    game.setArena(arenaById("large-zones")!);
    expect(game.cols).toBe(27);
    expect(game.grid).toHaveLength(27 * 17);
    expect(game.players[1].x).toBe(25.5);
    expect(game.players[1].y).toBe(15.5);
    game.start();
    expect(() => game.setArena(arenaById("small-open")!)).toThrow(/já começou/);
    expect(game.grid).toEqual(gridOf(arenaById("large-zones")!));
  });
});

import { describe, expect, it } from "vitest";
import {
  BombGame,
  COUNTDOWN,
  FLOOR,
  InputQueue,
  MAX_BATCH_COMMANDS,
  TICK_MS,
  arenaById,
  cellIndex,
  commandCode,
  commandDistance,
  decodeBatch,
  encodeBatch,
  moveOnRails,
  type MoveCommand,
} from "@bomb/shared";

/** Um acaso que se repete: a mesma semente, os mesmos itens. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

function open(seed = 1) {
  const game = new BombGame(seeded(seed));
  game.addPlayer("a", "ka", "A");
  game.addPlayer("b", "kb", "B");
  game.start();
  game.tick(COUNTDOWN);
  return game;
}

/** Comandos a partir de `seq`, um por direção da lista. */
function commands(from: number, dirs: Array<[number, number, boolean?]>): MoveCommand[] {
  return dirs.map(([dx, dy, bomb], i) => ({ seq: from + i, dx, dy, bomb: !!bomb }));
}

/** Uma caminhada pseudo-aleatória de `n` passos, com uma bomba de vez em quando. */
function wander(n: number, seed: number): Array<[number, number, boolean?]> {
  const random = seeded(seed);
  const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [0, 0]];
  const out: Array<[number, number, boolean?]> = [];
  let current = dirs[0];
  for (let i = 0; i < n; i++) {
    if (random() < 0.08) current = dirs[Math.floor(random() * dirs.length)];
    out.push([current[0], current[1], random() < 0.01]);
  }
  return out;
}

describe("o lote de comandos", () => {
  it("vai e volta pela rede sem mudar nada", () => {
    const cmds = commands(7, [[1, 0], [1, 0], [1, 0], [0, 0, true], [0, -1], [-1, 1], [-1, 1]]);
    const batch = encodeBatch(cmds)!;
    expect(batch.seq).toBe(7);
    // Trechos iguais viram um só; a bomba nunca entra num trecho.
    expect(batch.runs).toEqual([
      [commandCode(1, 0, false), 3],
      [commandCode(0, 0, true), 1],
      [commandCode(0, -1, false), 1],
      [commandCode(-1, 1, false), 2],
    ]);
    expect(decodeBatch(JSON.parse(JSON.stringify(batch)))).toEqual(cmds);
  });

  it("recusa o que não é lote, ou passa dos limites", () => {
    expect(decodeBatch(undefined)).toBeNull();
    expect(decodeBatch({ seq: 1 })).toBeNull();
    expect(decodeBatch({ seq: -1, runs: [[4, 1]] })).toBeNull();
    expect(decodeBatch({ seq: 1, runs: [[18, 1]] })).toBeNull();
    expect(decodeBatch({ seq: 1, runs: [[4, "2"]] })).toBeNull();
    expect(decodeBatch({ seq: 1, runs: [[13, 2]] })).toBeNull();
    expect(decodeBatch({ seq: 1, runs: [[4, 30], [5, 30], [4, 1]] })).toBeNull();
    expect(decodeBatch({ seq: 2 ** 31, runs: [[4, 1]] })).toBeNull();
    expect(decodeBatch({ seq: 1, runs: [[5, 30], [3, 30]] })).toHaveLength(MAX_BATCH_COMMANDS);
  });
});

describe("a fila de entrada do servidor", () => {
  it("aplica um por passo, em ordem, e descarta repetidos", () => {
    const queue = new InputQueue();
    queue.push(commands(1, [[1, 0], [0, 1], [-1, 0]]));
    queue.push(commands(2, [[1, 0], [1, 0]]));
    expect(queue.duplicates).toBe(2);
    expect(queue.take(1).map((c) => c.seq)).toEqual([1]);
    expect(queue.take(1).map((c) => c.seq)).toEqual([2]);
    expect(queue.ack).toBe(2);
  });

  it("alcança um atraso com o crédito guardado, um passo extra por tick, sem passar do relógio", () => {
    const queue = new InputQueue({ maxQueue: 60, maxCredit: 4 });
    // Três passos sem comando (a rede atrasou): três créditos guardados.
    for (let i = 0; i < 3; i++) expect(queue.take(1)).toHaveLength(0);
    queue.push(commands(1, Array.from({ length: 10 }, () => [1, 0] as [number, number])));
    const perTick = Array.from({ length: 8 }, () => queue.take(1).length);
    expect(perTick).toEqual([2, 2, 2, 1, 1, 1, 1, 0]);
    // No total, nunca mais comandos que passos de relógio.
    expect(queue.ack).toBe(10);
  });

  it("um cliente que manda demais não anda mais rápido: o crédito tem teto", () => {
    const queue = new InputQueue({ maxQueue: 600, maxCredit: 8 });
    queue.push(commands(1, Array.from({ length: 500 }, () => [1, 0] as [number, number])));
    let applied = 0;
    for (let tick = 0; tick < 100; tick++) applied += queue.take(1).length;
    expect(applied).toBeLessThanOrEqual(100);
  });

  it("a fila tem teto: o mais velho cai, e a memória não cresce", () => {
    const queue = new InputQueue({ maxQueue: 20, maxCredit: 4 });
    for (let i = 0; i < 100; i++) queue.push(commands(1 + i * 10, Array.from({ length: 10 }, () => [0, 1] as [number, number])));
    expect(queue.length).toBe(20);
    expect(queue.dropped).toBe(980);
  });

  it("descartar confirma tudo o que estava na fila", () => {
    const queue = new InputQueue();
    queue.push(commands(1, [[1, 0], [1, 0]]));
    queue.discard();
    expect(queue.length).toBe(0);
    expect(queue.ack).toBe(2);
  });
});

describe("o motor andando por comandos", () => {
  it("a mesma sequência de comandos dá exatamente o mesmo resultado", () => {
    const script = wander(1200, 3);
    const run = () => {
      const game = open(9);
      const out: string[] = [];
      for (let i = 0; i < script.length; i += 2) {
        game.pushCommands("a", commands(1 + i, script.slice(i, i + 2)));
        game.tick(TICK_MS);
        game.tick(TICK_MS);
        out.push(`${game.players[0].x},${game.players[0].y},${game.bombs.length},${game.grid.join("")}`);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });

  it("não importa quando os comandos chegam: a posição depende só deles", () => {
    const script = wander(240, 5).map(([dx, dy]) => [dx, dy] as [number, number]);
    const steady = open();
    const bursty = open();
    for (let i = 0; i < script.length; i++) {
      steady.pushCommands("a", commands(1 + i, [script[i]]));
      steady.tick(TICK_MS);
    }
    // O outro recebe em rajadas de 6, com buracos: alcança com o crédito.
    for (let i = 0; i < script.length; i += 6) {
      bursty.tick(TICK_MS);
      bursty.tick(TICK_MS);
      bursty.pushCommands("a", commands(1 + i, script.slice(i, i + 6)));
      for (let k = 0; k < 4; k++) bursty.tick(TICK_MS);
    }
    for (let k = 0; k < 30; k++) bursty.tick(TICK_MS);
    expect(bursty.players[0].queue.ack).toBe(script.length);
    expect(bursty.players[0].x).toBe(steady.players[0].x);
    expect(bursty.players[0].y).toBe(steady.players[0].y);
  });

  it("a bomba vai no comando: cai na célula em que o boneco estava naquele passo, uma vez só", () => {
    const game = open();
    const me = game.players[0];
    // Três passos à direita, bomba, mais três.
    game.pushCommands("a", commands(1, [[1, 0], [1, 0], [1, 0], [1, 0, true], [1, 0], [1, 0], [1, 0]]));
    const xAtBomb = 1.5 + 3 * commandDistance(me);
    for (let i = 0; i < 10; i++) game.tick(TICK_MS);
    expect(game.bombs).toHaveLength(1);
    expect(game.bombs[0]).toMatchObject({ cx: Math.floor(xAtBomb), cy: 1, owner: "a" });
    // O mesmo lote de novo (a tela reenviou): nada muda.
    game.pushCommands("a", commands(1, [[1, 0], [1, 0], [1, 0], [1, 0, true]]));
    for (let i = 0; i < 10; i++) game.tick(TICK_MS);
    expect(game.bombs).toHaveLength(1);
  });

  it("morto, os comandos são confirmados e jogados fora: não andam depois do renascimento", () => {
    const game = open();
    const me = game.players[0];
    me.alive = false;
    me.respawnAt = game.time + 10_000;
    game.pushCommands("a", commands(1, Array.from({ length: 20 }, () => [1, 0] as [number, number])));
    game.tick(TICK_MS);
    expect(me.queue.length).toBe(0);
    expect(me.queue.ack).toBe(20);
    expect(me.x).toBe(1.5);
  });

  it("aparece andando entre dois comandos atrasados, e para logo depois do último", () => {
    const game = open();
    const me = game.players[0];
    game.pushCommands("a", commands(1, [[1, 0]]));
    game.tick(TICK_MS);
    expect(me.moving).toBe(true);
    game.tick(TICK_MS);
    expect(me.moving).toBe(true);
    for (let i = 0; i < 4; i++) game.tick(TICK_MS);
    expect(me.moving).toBe(false);
  });
});

describe("o andar em trilhos", () => {
  it("na diagonal não anda mais que em linha reta", () => {
    const arena = arenaById("medium-grid");
    const game = arena ? new BombGame(seeded(1), arena) : new BombGame(seeded(1));
    const random = seeded(11);
    const blocked = (cx: number, cy: number) =>
      cx < 0 || cy < 0 || cx >= game.cols || cy >= game.rows || game.grid[cellIndex(cx, cy, game.cols)] !== FLOOR;
    const dist = commandDistance({ speed: 4, curse: "" });
    for (let i = 0; i < 4000; i++) {
      const cx = 1 + Math.floor(random() * (game.cols - 2));
      const cy = 1 + Math.floor(random() * (game.rows - 2));
      if (blocked(cx, cy)) continue;
      // Centrado numa linha (como sempre está quem anda em trilhos), em qualquer ponto dela.
      const along = random() - 0.5;
      const horizontal = random() < 0.5;
      // Só posições alcançáveis: o corpo passando da célula exige a vizinha aberta.
      const side = Math.sign(along);
      if (side !== 0 && (horizontal ? blocked(cx + side, cy) : blocked(cx, cy + side))) continue;
      const walker = { x: cx + 0.5 + (horizontal ? along : 0), y: cy + 0.5 + (horizontal ? 0 : along), dir: 0 as const };
      const before = { x: walker.x, y: walker.y };
      const dx = random() < 0.5 ? -1 : 1;
      const dy = random() < 0.5 ? -1 : 1;
      moveOnRails(walker, dx, dy, dist, blocked);
      const moved = Math.abs(walker.x - before.x) + Math.abs(walker.y - before.y);
      expect(moved).toBeLessThanOrEqual(dist + 1e-9);
    }
  });

  it("não atravessa parede nem sai da arena, em nenhuma velocidade", () => {
    const game = open();
    const me = game.players[0];
    me.speed = 4;
    const script = wander(3000, 21);
    for (let i = 0; i < script.length; i++) {
      game.pushCommands("a", commands(1 + i, [[script[i][0], script[i][1]]]));
      game.tick(TICK_MS);
      if (!me.alive) break;
      const cell = game.grid[cellIndex(Math.floor(me.x), Math.floor(me.y), game.cols)];
      expect(cell).toBe(FLOOR);
      expect(me.x).toBeGreaterThan(1);
      expect(me.y).toBeGreaterThan(1);
      expect(me.x).toBeLessThan(game.cols - 1);
      expect(me.y).toBeLessThan(game.rows - 1);
    }
  });
});

import { describe, expect, it } from "vitest";
import {
  BombGame,
  COUNTDOWN,
  TICK_MS,
  commandDistance,
  moveOnRails,
  type ArenaState,
  type GamePlayer,
  type MoveCommand,
} from "@bomb/shared";
import { Predictor } from "./predict";

/*
 * A previsão contra o motor de verdade: o `BombGame` faz o papel do servidor,
 * e uma fila com atraso faz o papel da rede, nos dois sentidos. Os comandos
 * da tela chegam ao motor `up` passos depois; o estado do motor chega à tela
 * `down` passos depois — como num patch que viaja.
 */

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

/** O estado público como a sala espelha (posição exata, `seq`, `passers`). */
function snapshot(game: BombGame, tick: number): ArenaState {
  return {
    roomName: "",
    hostId: "",
    phase: game.phase,
    maxPlayers: 4,
    arenaId: game.arena.id,
    themeId: "",
    cols: game.cols,
    rows: game.rows,
    matchMinutes: game.matchMinutes,
    players: game.players.map((p: GamePlayer) => ({
      id: p.id,
      name: p.name,
      slot: p.slot,
      connected: true,
      x: p.x,
      y: p.y,
      dir: p.dir,
      moving: p.moving,
      alive: p.alive,
      dying: false,
      lives: p.lives,
      range: p.range,
      bombs: p.bombs,
      speed: p.speed,
      kick: p.kick,
      pierce: p.pierce,
      invulnerable: false,
      curse: p.curse,
      ghost: false,
      wins: p.wins,
      seq: p.queue.ack,
    })),
    grid: [...game.grid],
    bombs: game.bombs.map((b) => ({
      id: b.id,
      cx: b.cx,
      cy: b.cy,
      x: b.x,
      y: b.y,
      owner: b.owner,
      pierce: b.pierce,
      fuse: b.fuse,
      passers: game.players.reduce((m, p) => (b.passers.has(p.id) ? m | (1 << p.slot) : m), 0),
    })),
    flames: [],
    powerups: game.powerups.map(({ cx, cy, kind }) => ({ cx, cy, kind })),
    timeLeft: game.timeLeft,
    tick,
    countdown: 0,
    winnerId: "",
    round: game.round,
    log: [],
  };
}

type Input = { dx: number; dy: number; bomb?: boolean };

/**
 * Uma partida com rede de mentira. `script(tick)` diz o que o dedo faz em
 * cada passo. Devolve o motor, a previsão e os bombas/estados vistos.
 */
function simulate(opts: {
  ticks: number;
  up: number;
  down: number;
  script: (tick: number) => Input;
  /** A cada quantos passos sai um estado (o patch). */
  patchEvery?: number;
  /** Mexe no motor antes do passo `tick` (para criar uma divergência). */
  meddle?: (game: BombGame, tick: number) => void;
  predictor?: Predictor;
}) {
  const game = new BombGame(seeded(1));
  game.addPlayer("me", "k1", "Eu");
  game.addPlayer("other", "k2", "Outro");
  game.start();
  game.tick(COUNTDOWN);
  const predictor = opts.predictor ?? new Predictor();
  const toServer: Array<{ at: number; cmd: MoveCommand }> = [];
  const toClient: Array<{ at: number; state: ArenaState }> = [];
  let clientState = snapshot(game, 0);
  const commands: MoveCommand[] = [];
  let ghostsCreated = 0;
  const patchEvery = opts.patchEvery ?? 2;

  for (let tick = 1; tick <= opts.ticks; tick++) {
    const now = tick * TICK_MS;
    // Chega à tela o estado que já viajou.
    while (toClient.length && toClient[0].at <= tick) {
      clientState = toClient.shift()!.state;
      predictor.reconcile(clientState, "me", now);
    }
    // A tela: um passo da previsão.
    const input = opts.script(tick);
    const out = predictor.step(clientState, "me", input.dx, input.dy, !!input.bomb, now);
    if (out) {
      commands.push(out.cmd);
      if (out.placed) ghostsCreated++;
      toServer.push({ at: tick + opts.up, cmd: out.cmd });
    }
    // O servidor: recebe o que chegou e dá um passo.
    const arrived: MoveCommand[] = [];
    while (toServer.length && toServer[0].at <= tick) arrived.push(toServer.shift()!.cmd);
    if (arrived.length) game.pushCommands("me", arrived);
    opts.meddle?.(game, tick);
    game.tick(TICK_MS);
    if (tick % patchEvery === 0) toClient.push({ at: tick + opts.down, state: snapshot(game, tick) });
  }
  // Deixa tudo chegar.
  for (let tick = opts.ticks + 1; tick <= opts.ticks + opts.up + opts.down + 20; tick++) {
    const now = tick * TICK_MS;
    while (toServer.length && toServer[0].at <= tick) game.pushCommands("me", [toServer.shift()!.cmd]);
    game.tick(TICK_MS);
    if (tick % patchEvery === 0) toClient.push({ at: tick + opts.down, state: snapshot(game, tick) });
    while (toClient.length && toClient[0].at <= tick) {
      clientState = toClient.shift()!.state;
      predictor.reconcile(clientState, "me", now);
    }
  }
  return { game, predictor, commands, ghostsCreated, clientState };
}

/** Uma volta pela arena do canto: direita, baixo, esquerda, cima, com paradas. */
function lap(tick: number): Input {
  const phase = Math.floor(tick / 40) % 6;
  return [
    { dx: 1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 1 },
  ][phase];
}

describe("a previsão do próprio boneco", () => {
  for (const [up, down] of [
    [3, 3],
    [6, 6],
    [9, 9],
    [12, 12],
  ]) {
    it(`com a regra igual, nunca corrige: ida ${Math.round(up * TICK_MS)} ms, volta ${Math.round(down * TICK_MS)} ms`, () => {
      const { game, predictor } = simulate({ ticks: 600, up, down, script: lap });
      expect(predictor.metrics.reconciles).toBeGreaterThan(100);
      expect(predictor.metrics.corrections).toBe(0);
      expect(predictor.metrics.mispredicts).toBe(0);
      // E no fim os dois concordam exatamente.
      const view = predictor.view(1, 0)!;
      expect(view.x).toBe(game.players[0].x);
      expect(view.y).toBe(game.players[0].y);
    });
  }

  it("anda no passo em que o dedo aperta, sem esperar o servidor", () => {
    const p = new Predictor();
    const game = new BombGame(seeded(1));
    game.addPlayer("me", "k", "Eu");
    game.addPlayer("b", "k2", "B");
    game.start();
    game.tick(COUNTDOWN);
    const state = snapshot(game, 0);
    p.reconcile(state, "me", 0);
    p.step(state, "me", 1, 0, false, 16);
    expect(p.view(1, 0)!.x).toBeCloseTo(1.5 + commandDistance({ speed: 0, curse: "" }), 12);
  });

  it("descarta o que o servidor confirmou e reaplica o resto, em ordem", () => {
    const game = new BombGame(seeded(1));
    game.addPlayer("me", "k", "Eu");
    game.addPlayer("b", "k2", "B");
    game.start();
    game.tick(COUNTDOWN);
    const p = new Predictor();
    const start = snapshot(game, 0);
    p.reconcile(start, "me", 0);
    const dirs: Array<[number, number]> = [[1, 0], [1, 0], [1, 0], [0, 1], [0, 1], [1, 0], [1, 0], [0, 1]];
    const sent = dirs.map(([dx, dy], i) => p.step(start, "me", dx, dy, false, i)!.cmd);
    expect(p.pendingCount).toBe(8);

    // O servidor aplicou os três primeiros, mas o boneco dele está um pouco atrás (outro mundo).
    game.pushCommands("me", sent.slice(0, 3));
    for (let i = 0; i < 3; i++) game.tick(TICK_MS);
    game.players[0].x -= 0.05;
    p.reconcile(snapshot(game, 3), "me", 100);
    expect(p.pendingCount).toBe(5);

    // O esperado: a posição do servidor e, em cima dela, os comandos 4..8 nesta ordem.
    const walker = { x: game.players[0].x, y: game.players[0].y, dir: game.players[0].dir };
    const blocked = (cx: number, cy: number) => game.grid[cy * game.cols + cx] !== 0;
    for (const cmd of sent.slice(3)) moveOnRails(walker, cmd.dx, cmd.dy, commandDistance({ speed: 0, curse: "" }), blocked);
    const view = p.view(1, 1e9)!;
    expect(view.x).toBe(walker.x);
    expect(view.y).toBe(walker.y);
    expect(p.metrics.corrections).toBe(1);
  });

  it("uma correção pequena é suavizada no desenho; a simulação já fica certa", () => {
    const { predictor } = simulate({
      ticks: 300,
      up: 6,
      down: 6,
      // Anda um pouco em campo aberto e para (contra a parede, a reaplicação apagaria a diferença sozinha).
      script: (t) => (t < 14 ? { dx: 1, dy: 0 } : { dx: 0, dy: 0 }),
      // O servidor "esbarra" num obstáculo que a tela não conhece: 0,1 célula para trás, uma vez.
      meddle: (game, tick) => {
        if (tick === 10) game.players[0].x -= 0.1;
      },
    });
    expect(predictor.metrics.mispredicts).toBeGreaterThan(0);
    expect(predictor.metrics.corrections).toBeGreaterThan(0);
    expect(predictor.metrics.correctionMax).toBeLessThan(0.2);
    expect(predictor.metrics.large).toBe(0);
  });

  it("logo depois de uma correção, o desenho continua de onde estava e se aproxima aos poucos", () => {
    const game = new BombGame(seeded(1));
    game.addPlayer("me", "k", "Eu");
    game.addPlayer("b", "k2", "B");
    game.start();
    game.tick(COUNTDOWN);
    const p = new Predictor();
    const state = snapshot(game, 0);
    p.reconcile(state, "me", 0);
    const drawnBefore = p.view(1, 0)!;
    game.players[0].x += 0.2;
    game.players[0].queue.ack = 0;
    p.reconcile(snapshot(game, 1), "me", 16);
    const right = p.view(1, 0)!;
    expect(right.x).toBeCloseTo(drawnBefore.x, 9);
    // Meia-vida de 60 ms: em 300 ms sobra ~3% da diferença.
    let last = right;
    for (let i = 0; i < 18; i++) last = p.view(1, 16.7)!;
    expect(Math.abs(last.x - game.players[0].x)).toBeLessThan(0.2 * 0.04);
  });

  it("uma diferença grande não é escondida: pula e fica contada", () => {
    const game = new BombGame(seeded(1));
    game.addPlayer("me", "k", "Eu");
    game.addPlayer("b", "k2", "B");
    game.start();
    game.tick(COUNTDOWN);
    const p = new Predictor();
    const large: number[] = [];
    p.onLarge = ({ error }) => large.push(error);
    p.reconcile(snapshot(game, 0), "me", 0);
    game.players[0].x = 5.5;
    game.players[0].y = 3.5;
    p.reconcile(snapshot(game, 1), "me", 16);
    expect(p.metrics.large).toBe(1);
    expect(large[0]).toBeGreaterThan(1.5);
    const view = p.view(0.3, 0)!;
    expect(view).toMatchObject({ x: 5.5, y: 3.5 });
  });

  it("sem confirmação do servidor, a memória não cresce", () => {
    const p = new Predictor({ maxPending: 50, correctionHalfLifeMs: 60, snapCells: 1.5 });
    const game = new BombGame(seeded(1));
    game.addPlayer("me", "k", "Eu");
    game.addPlayer("b", "k2", "B");
    game.start();
    game.tick(COUNTDOWN);
    const state = snapshot(game, 0);
    p.reconcile(state, "me", 0);
    for (let i = 0; i < 10_000; i++) p.step(state, "me", i % 400 < 200 ? 1 : -1, 0, false, i);
    expect(p.pendingCount).toBe(50);
    expect(p.metrics.overflow).toBe(10_000 - 50);
    // Um estado velho (confirmação menor que a última) também não quebra nada.
    p.reconcile({ ...state, players: state.players.map((pl) => ({ ...pl, seq: 9_000 })) }, "me", 1);
    p.reconcile({ ...state, players: state.players.map((pl) => ({ ...pl, seq: 3 })) }, "me", 2);
    expect(p.pendingCount).toBeLessThanOrEqual(50);
    expect(p.seq).toBeGreaterThanOrEqual(10_000);
  });
});

describe("a bomba prevista", () => {
  it("aparece uma vez só, cai onde foi mostrada, e a reaplicação não a repete", () => {
    const { game, predictor, ghostsCreated, commands } = simulate({
      ticks: 120,
      up: 9,
      down: 9,
      script: (t) => (t === 20 ? { dx: 1, dy: 0, bomb: true } : t < 60 ? { dx: 1, dy: 0 } : { dx: 0, dy: 0 }),
    });
    expect(commands.filter((c) => c.bomb)).toHaveLength(1);
    expect(ghostsCreated).toBe(1);
    // Reconciliou dezenas de vezes com o comando da bomba pendente, e ela continua uma só.
    expect(predictor.metrics.reconciles).toBeGreaterThan(30);
    expect(game.bombs.length + predictor.ghosts.length).toBeLessThanOrEqual(1);
    // O motor pôs a bomba exatamente na célula em que a tela a mostrou (o boneco no passo 20).
    const x20 = 1.5 + 19 * commandDistance({ speed: 0, curse: "" });
    const fx = game.takeFx().filter((e) => e.k === "place");
    expect(fx).toHaveLength(1);
    expect(predictor.metrics.corrections).toBe(0);
    // Já explodiu ou ainda está lá; se está, é na célula prevista.
    if (game.bombs[0]) expect(game.bombs[0].cx).toBe(Math.floor(x20));
  });

  it("a provisória sai quando o servidor confirma o comando; o pavio continua de onde estava", () => {
    const { predictor, game } = simulate({
      ticks: 80,
      up: 6,
      down: 6,
      script: (t) => (t === 10 ? { dx: 0, dy: 0, bomb: true } : { dx: 0, dy: 0 }),
    });
    expect(predictor.ghosts).toHaveLength(0);
    expect(game.bombs).toHaveLength(1);
    expect(predictor.ghostStart(game.bombs[0].cx, game.bombs[0].cy)).toBeCloseTo(10 * TICK_MS, 6);
  });

  it("sem bomba na mão, a tela não mostra provisória (o servidor recusaria)", () => {
    const { ghostsCreated, game } = simulate({
      ticks: 60,
      up: 6,
      down: 6,
      script: (t) => (t === 5 || t === 30 ? { dx: 0, dy: 0, bomb: true } : t > 5 && t < 25 ? { dx: 1, dy: 0 } : { dx: 0, dy: 0 }),
    });
    // Uma bomba só na mão: a segunda nem aparece.
    expect(ghostsCreated).toBe(1);
    expect(game.bombs).toHaveLength(1);
  });

  it("sair de cima da própria bomba faz ela fechar, igual ao motor", () => {
    const { predictor } = simulate({
      ticks: 200,
      up: 6,
      down: 6,
      // Bomba, anda para a direita, volta para a esquerda contra ela.
      script: (t) => (t === 5 ? { dx: 0, dy: 0, bomb: true } : t < 50 ? { dx: 1, dy: 0 } : t < 120 ? { dx: -1, dy: 0 } : { dx: 0, dy: 0 }),
    });
    expect(predictor.metrics.corrections).toBe(0);
  });
});

describe("a previsão com maldição de andar", () => {
  for (const curse of ["fast", "reverse", "slide"] as const) {
    it(`${curse}: a tela e o motor terminam no mesmo lugar`, () => {
      const { game, predictor } = simulate({
        ticks: 600,
        up: 6,
        down: 6,
        script: lap,
        meddle: (g, tick) => {
          if (tick !== 1) return;
          g.players[0].curse = curse;
          g.players[0].curseUntil = Number.MAX_SAFE_INTEGER;
        },
      });
      // A maldição chega à tela depois do motor: há correção no começo, e o desenho a desfaz com o tempo.
      expect(predictor.metrics.large).toBe(0);
      const view = predictor.view(1, 60_000)!;
      expect(view.x).toBe(game.players[0].x);
      expect(view.y).toBe(game.players[0].y);
    });
  }

  it("sem freio: parado, a tela continua mandando passos", () => {
    const { commands, game } = simulate({
      ticks: 120,
      up: 3,
      down: 3,
      script: (tick) => (tick <= 10 ? { dx: 1, dy: 0 } : { dx: 0, dy: 0 }),
      meddle: (g, tick) => {
        if (tick !== 1) return;
        g.players[0].curse = "slide";
        g.players[0].curseUntil = Number.MAX_SAFE_INTEGER;
      },
    });
    expect(commands.length).toBeGreaterThan(100);
    // Soltou o dedo por volta de x = 2,1 e seguiu até o primeiro tijolo.
    expect(game.players[0].x).toBeGreaterThan(3);
  });
});

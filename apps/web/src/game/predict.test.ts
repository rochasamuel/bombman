import { describe, expect, it } from "vitest";
import { BombGame, LARGE_CLASSIC, type ArenaState } from "@bomb/shared";
import { Predictor, SNAP_CELLS } from "./predict";

const FRAME = 1000 / 60;

/** Um motor numa rodada valendo, e o retrato público dele, como a sala espelha. */
function setup() {
  const game = new BombGame(() => 0.99, LARGE_CLASSIC);
  game.addPlayer("me", "k0", "Eu");
  game.addPlayer("p1", "k1", "Outro");
  game.start();
  game.tick(3100);
  return game;
}
function snapshot(game: BombGame): ArenaState {
  return {
    roomName: "", hostId: "me", phase: game.phase, maxPlayers: 4, arenaId: game.arena.id, themeId: "garden",
    cols: game.cols, rows: game.rows, matchMinutes: game.matchMinutes,
    players: game.players.map((p) => ({
      id: p.id, name: p.name, slot: p.slot, connected: true, x: p.x, y: p.y, dir: p.dir, moving: p.moving,
      alive: p.alive, dying: false, lives: p.lives, range: p.range, bombs: p.bombs, speed: p.speed,
      kick: p.kick, pierce: p.pierce, invulnerable: false, curse: p.curse, wins: 0,
    })),
    grid: [...game.grid],
    bombs: game.bombs.map(({ id, cx, cy, x, y, owner, pierce }) => ({ id, cx, cy, x, y, owner, pierce })),
    flames: [],
    powerups: game.powerups.map(({ cx, cy, kind }) => ({ cx, cy, kind })),
    timeLeft: 1, countdown: 0, winnerId: "", round: 1, log: [],
  };
}

/** Anda tela e motor juntos, quadro a quadro, com a mesma tecla e sem rede. */
function lockstep(game: BombGame, p: Predictor, dx: number, dy: number, ms: number, clock: { now: number }) {
  game.setInput("me", dx, dy);
  let last = null;
  for (let t = 0; t < ms; t += FRAME) {
    clock.now += FRAME;
    last = p.step(snapshot(game), "me", dx, dy, FRAME, clock.now);
    game.tick(FRAME);
  }
  return last!;
}

describe("a previsão do próprio boneco", () => {
  it("anda na hora, sem esperar o servidor, e chega onde o motor chega com a mesma tecla", () => {
    const game = setup();
    const p = new Predictor();
    const before = snapshot(game);
    // O servidor ainda não soube da tecla: a tela já anda.
    const first = p.step(before, "me", 1, 0, 100, 100)!;
    expect(first.x).toBeGreaterThan(before.players[0].x);
    expect(first.moving).toBe(true);
    // A mesma tecla, o mesmo tempo, no motor: o mesmo lugar (a regra é a mesma).
    game.setInput("me", 1, 0);
    for (let i = 0; i < 6; i++) game.tick(100 / 6);
    expect(first.x).toBeCloseTo(game.players[0].x, 5);
  });

  it("para na parede e vira a esquina como o motor", () => {
    const game = setup();
    const p = new Predictor();
    const clock = { now: 0 };
    lockstep(game, p, 0, -1, 500, clock);
    const last = lockstep(game, p, 1, 0, 1500, clock);
    expect(last.x).toBeCloseTo(game.players[0].x, 3);
    expect(last.y).toBeCloseTo(game.players[0].y, 3);
  });

  it("uma diferença pequena para o servidor entra aos poucos, sem puxar o boneco de uma vez; uma grande pula", () => {
    const game = setup();
    const p = new Predictor();
    const clock = { now: 0 };
    lockstep(game, p, 0, 0, 200, clock);
    // O servidor diz meia célula para baixo (o que a tela não viu).
    const moved = snapshot(game);
    moved.players[0].y += 0.5;
    clock.now += FRAME;
    const first = p.step(moved, "me", 0, 0, FRAME, clock.now)!;
    expect(first.y - game.players[0].y).toBeGreaterThan(0.01);
    expect(first.y - game.players[0].y).toBeLessThan(0.15);
    let at = first;
    for (let i = 0; i < 30; i++) {
      clock.now += FRAME;
      at = p.step(moved, "me", 0, 0, FRAME, clock.now)!;
    }
    expect(Math.abs(at.y - moved.players[0].y)).toBeLessThan(0.03);
    // Longe demais (renasceu): pula.
    const far = snapshot(game);
    far.players[0].x += SNAP_CELLS + 1;
    clock.now += FRAME;
    at = p.step(far, "me", 0, 0, FRAME, clock.now)!;
    expect(at.x).toBeCloseTo(far.players[0].x, 5);
  });

  it("compara o servidor com onde a tela estava uma ida e volta atrás: andando com rede, não puxa para trás", () => {
    const game = setup();
    const p = new Predictor();
    p.rtt = 100;
    const clock = { now: 0 };
    lockstep(game, p, 0, 0, 200, clock);
    // A tela anda; o servidor recebe a tecla 50 ms depois e anda igual (o retrato chega 50 ms depois disso).
    const frames: ArenaState[] = [];
    const start = game.players[0].x;
    let at = null;
    let back = 0;
    for (let i = 0; i < 60; i++) {
      clock.now += FRAME;
      if (i === 3) game.setInput("me", 1, 0);
      frames.push(snapshot(game));
      const seen = frames[Math.max(0, frames.length - 4)];
      const prev = at?.x ?? start;
      at = p.step(seen, "me", 1, 0, FRAME, clock.now)!;
      back = Math.max(back, prev - at.x);
      game.tick(FRAME);
    }
    // Nunca anda para trás.
    expect(back).toBeLessThan(0.02);
    // Sem a comparação pela ida e volta, a tela ficaria puxada para onde o servidor estava.
    expect(at!.x).toBeCloseTo(3.5, 2);
    expect(start).toBeCloseTo(1.5, 5);
  });

  it("a bomba aparece na hora, deixa sair de cima e fecha a volta; não passa do limite; some quando a de verdade chega", () => {
    const game = setup();
    const p = new Predictor();
    const clock = { now: 0 };
    lockstep(game, p, 0, 0, 100, clock);
    const state = snapshot(game);
    const cell = p.placeBomb(state, "me", clock.now)!;
    expect(cell).toEqual({ cx: 1, cy: 1 });
    expect(p.ghosts).toHaveLength(1);
    // Uma bomba só na mão: a segunda não aparece.
    expect(p.placeBomb(state, "me", clock.now)).toBeNull();
    // Sai de cima andando (o servidor junto); voltando, a bomba fecha.
    lockstep(game, p, 1, 0, 350, clock);
    const back = lockstep(game, p, -1, 0, 50, clock);
    expect(back.x).toBeGreaterThanOrEqual(2.5 - 1e-6);
    lockstep(game, p, 0, 0, 20, clock);
    // A de verdade chega na mesma célula: a de mentira sai.
    const real = { ...snapshot(game), bombs: [{ id: "b9", cx: 1, cy: 1, x: 1.5, y: 1.5, owner: "me", pierce: false }] };
    p.step(real, "me", 0, 0, FRAME, (clock.now += FRAME));
    expect(p.ghosts).toHaveLength(0);
  });

  it("a bomba que o servidor não mandou some em meio segundo", () => {
    const game = setup();
    const p = new Predictor();
    const clock = { now: 0 };
    lockstep(game, p, 0, 0, 100, clock);
    p.placeBomb(snapshot(game), "me", clock.now);
    lockstep(game, p, 0, 0, 600, clock);
    expect(p.ghosts).toHaveLength(0);
  });

  it("o item some na hora em que passa por cima, e volta se o servidor não o deu", () => {
    const game = setup();
    game.powerups.push({ cx: 2, cy: 1, kind: "fire" });
    const p = new Predictor();
    const clock = { now: 0 };
    // A tela anda 0,2 s à frente do servidor (que ainda não pegou o item).
    const frozen = snapshot(game);
    for (let i = 0; i < 12; i++) p.step(frozen, "me", 1, 0, FRAME, (clock.now += FRAME));
    expect(p.isTaken(2, 1)).toBe(false);
    p.rtt = 400;
    for (let i = 0; i < 4; i++) p.step(frozen, "me", 1, 0, FRAME, (clock.now += FRAME));
    expect(p.isTaken(2, 1)).toBe(true);
    // O servidor nunca o deu (outro pegou? não: ele continua lá): em meio segundo ele volta.
    for (let i = 0; i < 40; i++) p.step(frozen, "me", 0, 0, FRAME, (clock.now += FRAME));
    expect(p.isTaken(2, 1)).toBe(false);
  });

  it("fora da rodada, morto ou sem jogador, não prevê nada: vale o servidor", () => {
    const game = setup();
    const p = new Predictor();
    const state = snapshot(game);
    expect(p.step({ ...state, phase: "finished" }, "me", 1, 0, 16, 16)).toBeNull();
    expect(p.step(state, "ninguém", 1, 0, 16, 32)).toBeNull();
    const dead = snapshot(game);
    dead.players[0].alive = false;
    expect(p.step(dead, "me", 1, 0, 16, 48)).toBeNull();
  });
});

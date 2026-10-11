import { describe, expect, it } from "vitest";
import { BombGame, LARGE_CLASSIC, type ArenaState } from "@bomb/shared";
import { Predictor, SNAP_CELLS } from "./predict";

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
    flames: [], powerups: [], timeLeft: 1, countdown: 0, winnerId: "", round: 1, log: [],
  };
}

describe("a previsão do próprio boneco", () => {
  it("anda na hora, sem esperar o servidor, e chega onde o motor chega com a mesma tecla", () => {
    const game = setup();
    const p = new Predictor();
    const before = snapshot(game);
    // O servidor ainda não soube da tecla: a tela já anda.
    const first = p.step(before, "me", 1, 0, 100)!;
    expect(first.x).toBeGreaterThan(before.players[0].x);
    expect(first.moving).toBe(true);
    // A mesma tecla, o mesmo tempo, no motor: o mesmo lugar (a regra é a mesma).
    game.setInput("me", 1, 0);
    for (let i = 0; i < 6; i++) game.tick(100 / 6);
    expect(first.x).toBeCloseTo(game.players[0].x, 5);
    expect(first.y).toBeCloseTo(game.players[0].y, 5);
  });

  it("para na parede como o motor, e vira a esquina como ele", () => {
    const game = setup();
    const p = new Predictor();
    let last = p.step(snapshot(game), "me", 0, -1, 500)!; // para cima, contra a muralha
    expect(last.y).toBeCloseTo(1.5, 5);
    game.setInput("me", 1, 0);
    for (let t = 0; t < 1500; t += 1000 / 60) {
      last = p.step(snapshot(game), "me", 1, 0, 1000 / 60)!;
      game.tick(1000 / 60);
    }
    expect(last.x).toBeCloseTo(game.players[0].x, 4);
    expect(last.y).toBeCloseTo(game.players[0].y, 4);
  });

  it("parado aqui e lá, escorrega até o servidor; longe demais, pula para ele", () => {
    const game = setup();
    const p = new Predictor();
    p.step(snapshot(game), "me", 1, 0, 150);
    // Soltou: a tela para; o servidor (parado) está um pouco atrás.
    let at = p.step(snapshot(game), "me", 0, 0, 0)!;
    const gap = Math.abs(at.x - game.players[0].x);
    expect(gap).toBeGreaterThan(0.2);
    for (let i = 0; i < 30; i++) at = p.step(snapshot(game), "me", 0, 0, 1000 / 60)!;
    expect(Math.abs(at.x - game.players[0].x)).toBeLessThan(0.01);
    // O servidor pôs o boneco longe (renasceu): pula.
    const moved = snapshot(game);
    moved.players[0].x += SNAP_CELLS + 1;
    at = p.step(moved, "me", 0, 0, 16)!;
    expect(at.x).toBeCloseTo(moved.players[0].x, 5);
  });

  it("não atravessa a bomba dos outros, mas sai da que nasceu debaixo dele", () => {
    const game = setup();
    const p = new Predictor();
    game.requestBomb("me");
    game.tick(16);
    const withBomb = snapshot(game);
    expect(withBomb.bombs).toHaveLength(1);
    // A bomba nasceu debaixo dele: ele sai andando.
    const out = p.step(withBomb, "me", 1, 0, 400)!;
    expect(out.x).toBeGreaterThan(2);
    // Voltando, a bomba fecha o caminho: para na borda dela.
    const back = p.step(withBomb, "me", -1, 0, 1000)!;
    expect(back.x).toBeGreaterThanOrEqual(2.5 - 1e-6);
  });

  it("fora da rodada, morto ou sem jogador, não prevê nada: vale o servidor", () => {
    const game = setup();
    const p = new Predictor();
    const state = snapshot(game);
    expect(p.step({ ...state, phase: "finished" }, "me", 1, 0, 16)).toBeNull();
    expect(p.step(state, "ninguém", 1, 0, 16)).toBeNull();
    const dead = snapshot(game);
    dead.players[0].alive = false;
    expect(p.step(dead, "me", 1, 0, 16)).toBeNull();
  });
});

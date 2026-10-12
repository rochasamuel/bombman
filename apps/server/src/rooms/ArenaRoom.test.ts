import { boot, type ColyseusTestServer } from "@colyseus/testing";
import {
  COUNTDOWN,
  DEFAULT_ARENA,
  DEFAULT_THEME,
  TICK_MS,
  arenaById,
  arenasOfSize,
  commandCode,
  commandDistance,
  fillGrid,
  type NetStatsMessage,
} from "@bomb/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import appConfig from "../app.config.js";
import type { BombGame } from "@bomb/shared";
import type { ArenaRoom } from "./ArenaRoom.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(appConfig, 2569);
});
afterAll(() => colyseus.shutdown());
afterEach(() => colyseus.cleanup());

async function seated(count: number) {
  const room = await colyseus.createRoom<ArenaRoom>("arena", { roomName: "Arena" });
  const clients = [];
  for (let i = 0; i < count; i++) {
    clients.push(await colyseus.connectTo(room, { playerName: `P${i}`, seatKey: `k${i}` }));
  }
  await room.waitForNextPatch();
  return { room, clients };
}

function engine(room: ArenaRoom) {
  return (room as unknown as { game: BombGame }).game;
}

describe("a sala", () => {
  it("senta os jogadores nos cantos, em ordem de cor", async () => {
    const { room, clients } = await seated(3);
    const state = room.state;
    expect(state.players.length).toBe(3);
    expect(state.players.map((p) => p.slot)).toEqual([0, 1, 2]);
    expect(state.hostId).toBe(clients[0].sessionId);
    expect(state.phase).toBe("lobby");
  });

  it("só o host começa, e a contagem chega à tela", async () => {
    const { room, clients } = await seated(2);
    clients[1].send("start");
    await clients[1].waitForMessage("error", 1000);
    clients[0].send("start");
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("countdown");
    expect(room.state.countdown).toBeGreaterThan(0);
  });

  it("espelha o movimento e a bomba no estado", async () => {
    const { room, clients } = await seated(2);
    const game = engine(room);
    clients[0].send("start");
    await room.waitForNextPatch();
    game.tick(COUNTDOWN);
    expect(game.phase).toBe("playing");

    // Uma bomba no lugar e quinze passos para a direita, numerados a partir de 1.
    clients[0].send("input", { seq: 1, runs: [[commandCode(0, 0, true), 1], [commandCode(1, 0, false), 15]] });
    await clients[0].waitForMessage("fx", 1000);
    await new Promise((done) => setTimeout(done, 400));
    await room.waitForNextPatch();
    expect(room.state.bombs.length).toBe(1);
    expect(room.state.bombs[0]).toMatchObject({ cx: 1, cy: 1 });
    const me = room.state.players.find((p) => p.id === clients[0].sessionId)!;
    // Cada comando é um passo fixo: a distância não depende de quando o lote chegou.
    expect(me.x).toBeCloseTo(1.5 + 15 * commandDistance({ speed: 0, curse: "" }), 9);
    expect(me.seq).toBe(16);
    expect(room.state.tick).toBeGreaterThan(0);
  });

  it("abre com a arena da referência; o host escolhe o tamanho, e a planta é sorteada para todos", async () => {
    const { room, clients } = await seated(2);
    expect(room.state.arenaId).toBe(DEFAULT_ARENA.id);
    expect(room.state.cols).toBe(27);
    expect(room.state.grid.length).toBe(27 * 17);

    // Quem não é host não escolhe.
    clients[1].send("arena", { size: "small" });
    await clients[1].waitForMessage("error", 1000);
    expect(room.state.arenaId).toBe(DEFAULT_ARENA.id);

    // Um tamanho que não existe é recusado.
    clients[0].send("arena", { size: "huge" });
    await clients[0].waitForMessage("error", 1000);
    expect(room.state.arenaId).toBe(DEFAULT_ARENA.id);

    clients[0].send("arena", { size: "small" });
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    const smallIds = arenasOfSize("small").map((a) => a.id);
    expect(smallIds).toContain(room.state.arenaId);
    expect(room.state.cols).toBe(11);
    expect(room.state.rows).toBe(11);
    expect(room.state.grid.length).toBe(11 * 11);
    // Os dois clientes veem a mesma grade que o servidor montou.
    for (const client of clients) {
      const seen = client.state.toJSON() as { arenaId: string; grid: number[] };
      expect(seen.arenaId).toBe(room.state.arenaId);
      expect(seen.grid).toEqual([...room.state.grid]);
    }

    clients[0].send("start");
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("countdown");
    // A rodada sorteou de novo, entre as do mesmo tamanho; a grade é a da planta sorteada.
    expect(smallIds).toContain(room.state.arenaId);
    expect([...room.state.grid]).toEqual(fillGrid([], arenaById(room.state.arenaId)!));
    expect(room.state.players[0].x).toBe(1.5);
    expect(room.state.players[1].x).toBe(9.5);
    expect(room.state.players[1].y).toBe(9.5);
    // Começou: o tamanho não muda mais até o fim.
    const during = room.state.arenaId;
    clients[0].send("arena", { size: "large" });
    await clients[0].waitForMessage("error", 1000);
    expect(room.state.arenaId).toBe(during);
  });

  it("parados, o estado só muda uma vez por segundo: o relógio vai em segundos inteiros", async () => {
    const { room, clients } = await seated(2);
    clients[0].send("start");
    await room.waitForNextPatch();
    const game = engine(room);
    game.tick(COUNTDOWN + 10);
    // Ninguém se mexe: em meio segundo, nada no estado sincronizado muda.
    const sync = () => (room as unknown as { sync: () => void }).sync();
    sync();
    const before = JSON.stringify(room.state.toJSON());
    const ms = game.timeLeft % 1000;
    game.tick(Math.max(1, ms - 50));
    sync();
    expect(JSON.stringify(room.state.toJSON())).toBe(before);
    expect(room.state.timeLeft % 1000).toBe(0);
    expect(room.state.timeLeft).toBeGreaterThanOrEqual(game.timeLeft);
    expect(room.state.timeLeft - game.timeLeft).toBeLessThan(1000);
  });

  it("sorteia a planta a cada rodada: com o tempo, as três do tamanho aparecem", async () => {
    const { room } = await seated(2);
    const game = engine(room);
    const seen = new Set<string>();
    // O sorteio é o da sala (Math.random): trinta rodadas dão as três com folga.
    for (let i = 0; i < 30; i++) {
      (room as unknown as { drawArena: () => void }).drawArena();
      seen.add(game.arena.id);
      expect(game.arena.size).toBe("large");
    }
    expect([...seen].sort()).toEqual(arenasOfSize("large").map((a) => a.id).sort());
  });

  it("o host escolhe o tempo da rodada, com o mínimo da arena, e a sala abre com o pedido", async () => {
    const { room, clients } = await seated(2);
    expect(room.state.matchMinutes).toBe(5);

    clients[1].send("time", { minutes: 7 });
    await clients[1].waitForMessage("error", 1000);
    expect(room.state.matchMinutes).toBe(5);
    // Na grande, 3 é pouco.
    clients[0].send("time", { minutes: 3 });
    await clients[0].waitForMessage("error", 1000);
    clients[0].send("time", { minutes: 4 });
    await clients[0].waitForMessage("error", 1000);
    expect(room.state.matchMinutes).toBe(5);

    clients[0].send("time", { minutes: 7 });
    await room.waitForNextPatch();
    expect(room.state.matchMinutes).toBe(7);

    clients[0].send("arena", { size: "small" });
    await room.waitForNextPatch();
    clients[0].send("time", { minutes: 3 });
    await room.waitForNextPatch();
    expect(room.state.matchMinutes).toBe(3);
    // De volta à grande, o 3 sobe para 5 sozinho.
    clients[0].send("arena", { size: "large" });
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    expect(room.state.matchMinutes).toBe(5);

    const ten = await colyseus.createRoom<ArenaRoom>("arena", { roomName: "Arena", minutes: 10 });
    expect(ten.state.matchMinutes).toBe(10);
    const odd = await colyseus.createRoom<ArenaRoom>("arena", { roomName: "Arena", minutes: 4 });
    expect(odd.state.matchMinutes).toBe(5);
    const small = await colyseus.createRoom<ArenaRoom>("arena", { roomName: "Arena", arenaId: "small-open", minutes: 3 });
    expect(small.state.matchMinutes).toBe(3);
  });

  it("abre com o tema da referência, e o host troca por outro, que vai para todos", async () => {
    const { room, clients } = await seated(2);
    expect(room.state.themeId).toBe(DEFAULT_THEME.id);

    // Quem não é host não escolhe.
    clients[1].send("theme", { themeId: "volcano" });
    await clients[1].waitForMessage("error", 1000);
    expect(room.state.themeId).toBe(DEFAULT_THEME.id);

    // Um tema que não existe é recusado.
    clients[0].send("theme", { themeId: "lunar" });
    await clients[0].waitForMessage("error", 1000);
    expect(room.state.themeId).toBe(DEFAULT_THEME.id);

    // O tema é só desenho: a planta e a grade não mudam.
    clients[0].send("theme", { themeId: "volcano" });
    await room.waitForNextPatch();
    await room.waitForNextPatch();
    expect(room.state.themeId).toBe("volcano");
    expect(room.state.arenaId).toBe(DEFAULT_ARENA.id);
    expect(room.state.grid.length).toBe(27 * 17);
    for (const client of clients) {
      expect((client.state.toJSON() as { themeId: string }).themeId).toBe("volcano");
    }

    clients[0].send("start");
    await room.waitForNextPatch();
    expect(room.state.phase).toBe("countdown");
    // Começou: o tema não muda mais até o fim.
    clients[0].send("theme", { themeId: "frozen" });
    await clients[0].waitForMessage("error", 1000);
    expect(room.state.themeId).toBe("volcano");
  });

  it("abre com o tema pedido ao criar a sala, se ele existir", async () => {
    const room = await colyseus.createRoom<ArenaRoom>("arena", { roomName: "Arena", themeId: "desert" });
    expect(room.state.themeId).toBe("desert");
    const other = await colyseus.createRoom<ArenaRoom>("arena", { roomName: "Arena", themeId: "nope" });
    expect(other.state.themeId).toBe(DEFAULT_THEME.id);
  });

  it("abre no tamanho da arena pedida ao criar a sala, com a planta sorteada", async () => {
    const room = await colyseus.createRoom<ArenaRoom>("arena", { roomName: "Arena", arenaId: "medium-grid" });
    expect(engine(room).arena.size).toBe("medium");
    expect(arenasOfSize("medium")).toContain(engine(room).arena);
    const other = await colyseus.createRoom<ArenaRoom>("arena", { roomName: "Arena", arenaId: "nope" });
    expect(other.state.arenaId).toBe(DEFAULT_ARENA.id);
  });

  it("devolve a cadeira a quem volta com a mesma seatKey", async () => {
    const { room, clients } = await seated(2);
    await clients[1].leave(false);
    await room.waitForNextPatch();
    const back = await colyseus.connectTo(room, { playerName: "P1", seatKey: "k1" });
    await room.waitForNextPatch();
    expect(room.state.players.length).toBe(2);
    expect(room.state.players[1].id).toBe(back.sessionId);
    expect(room.state.players[1].slot).toBe(1);
  });
});

describe("a entrada pela rede", () => {
  async function playing() {
    const { room, clients } = await seated(2);
    clients[0].send("start");
    await room.waitForNextPatch();
    engine(room).tick(COUNTDOWN);
    return { room, clients, game: engine(room) };
  }
  const right = (count: number): [number, number] => [commandCode(1, 0, false), count];

  it("aplica cada comando uma vez: um lote repetido não anda de novo", async () => {
    const { room, clients, game } = await playing();
    clients[0].send("input", { seq: 1, runs: [right(10)] });
    clients[0].send("input", { seq: 1, runs: [right(10)] });
    clients[0].send("input", { seq: 5, runs: [right(6)] });
    await new Promise((done) => setTimeout(done, 400));
    const me = game.players[0];
    expect(me.x).toBeCloseTo(1.5 + 10 * commandDistance(me), 9);
    expect(me.queue.ack).toBe(10);
    expect(me.queue.duplicates).toBe(16);
    await room.waitForNextPatch();
    expect(room.state.players[0].seq).toBe(10);
  });

  it("recusa lote malformado inteiro e conta", async () => {
    const { room, clients, game } = await playing();
    const bad = [
      { dx: 1, dy: 0 },
      { seq: 0, runs: [right(1)] },
      { seq: 1.5, runs: [right(1)] },
      { seq: 1, runs: [[99, 1]] },
      { seq: 1, runs: [[commandCode(1, 1, false), 0]] },
      { seq: 1, runs: [[commandCode(0, 0, true), 3]] },
      { seq: 1, runs: [right(31)] },
      { seq: 1, runs: "x" },
      null,
    ];
    for (const message of bad) clients[0].send("input", message);
    await new Promise((done) => setTimeout(done, 200));
    await room.waitForNextPatch();
    const me = game.players[0];
    expect(me.queue.rejected).toBe(bad.length);
    expect(me.x).toBe(1.5);
    expect(me.queue.ack).toBe(0);
  });

  it("não deixa andar mais rápido que o relógio, por mais comandos que cheguem", async () => {
    const { clients, game } = await playing();
    const me = game.players[0];
    const ackBefore = me.queue.ack;
    const started = performance.now();
    // Sessenta comandos de uma vez: um segundo de caminhada, num lote só.
    clients[0].send("input", { seq: 1, runs: [right(30), right(30)] });
    await new Promise((done) => setTimeout(done, 150));
    const elapsedTicks = (performance.now() - started) / TICK_MS;
    // No máximo o tempo que passou mais o crédito guardado (`INPUT_CREDIT_MAX`), com folga para o relógio.
    expect(me.queue.ack - ackBefore).toBeLessThanOrEqual(Math.ceil(elapsedTicks) + 8 + 2);
    expect(me.queue.ack).toBeLessThan(60);
  });

  it("manda o diagnóstico de rede só para quem pediu", async () => {
    const { clients } = await seated(2);
    clients[0].send("diag", { on: true });
    const stats = (await clients[0].waitForMessage("net", 2500)) as NetStatsMessage;
    expect(stats.hz).toBeGreaterThan(30);
    expect(stats.patchMs).toBeGreaterThan(0);
    expect(stats.tickAvg).toBeGreaterThanOrEqual(0);
    await expect(clients[1].waitForMessage("net", 1200)).rejects.toBeTruthy();
  });
});

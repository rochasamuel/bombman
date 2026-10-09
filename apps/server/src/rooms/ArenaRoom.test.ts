import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { COUNTDOWN } from "@bomb/shared";
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

    clients[0].send("input", { dx: 1, dy: 0 });
    clients[0].send("bomb");
    await clients[0].waitForMessage("fx", 1000);
    await new Promise((done) => setTimeout(done, 250));
    await room.waitForNextPatch();
    expect(room.state.bombs.length).toBe(1);
    const me = room.state.players.find((p) => p.id === clients[0].sessionId)!;
    expect(me.x).toBeGreaterThan(1.5);
    expect(me.moving).toBe(true);
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

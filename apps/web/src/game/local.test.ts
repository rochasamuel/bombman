import { describe, expect, it } from "vitest";
import { BombGame, COUNTDOWN, TICK_MS, commandDistance, decodeBatch, type ArenaState, type InputBatch } from "@bomb/shared";
import { LocalPlayer } from "./local";
import { NetClock } from "./netclock";
import { readClientConfig } from "./netconfig";
import { HOLD_GAP_MS, record, sampleAt, type Sample } from "./interp";

const config = readClientConfig(() => undefined);

function playing(): ArenaState {
  const game = new BombGame(() => 0.5);
  game.addPlayer("me", "k", "Eu");
  game.addPlayer("b", "k2", "B");
  game.start();
  game.tick(COUNTDOWN);
  return {
    roomName: "",
    hostId: "",
    phase: "playing",
    maxPlayers: 4,
    arenaId: game.arena.id,
    themeId: "",
    cols: game.cols,
    rows: game.rows,
    matchMinutes: 5,
    players: game.players.map((p) => ({
      id: p.id, name: p.name, slot: p.slot, connected: true, x: p.x, y: p.y, dir: p.dir, moving: false,
      alive: true, dying: false, lives: 3, range: 1, bombs: 1, speed: 0, kick: false, pierce: false,
      invulnerable: false, curse: "", ghost: false, wins: 0, seq: 0,
    })),
    grid: [...game.grid],
    bombs: [],
    flames: [],
    powerups: [],
    timeLeft: 0,
    tick: 0,
    countdown: 0,
    winnerId: "",
    round: 1,
    log: [],
  };
}

/** Roda `ms` de quadros a `fps` com o dedo em (dx, dy); devolve os lotes mandados. */
function drive(local: LocalPlayer, state: ArenaState, fps: number, ms: number, from = 0) {
  const frame = 1000 / fps;
  for (let t = from; t <= from + ms + 1e-9; t += frame) local.frame(state, t);
}

describe("o passo fixo da tela", () => {
  it("anda o mesmo a 30, 60 ou 144 quadros por segundo", () => {
    const step = commandDistance({ speed: 0, curse: "" });
    const results = [30, 60, 144].map((fps) => {
      const sent: InputBatch[] = [];
      const local = new LocalPlayer(config);
      local.connect((b) => sent.push(b), () => "me");
      const state = playing();
      local.setDirection(1, 0);
      drive(local, state, fps, 300);
      local.setDirection(0, 0);
      drive(local, state, fps, 100, 300 + 1000 / fps);
      const commands = sent.flatMap((b) => decodeBatch(b)!);
      return { count: commands.length, x: local.view()!.x };
    });
    // 300 ms de dedo apertado: 18 passos (um a menos pela fase do quadro), em campo aberto.
    for (const r of results) {
      expect(r.count).toBeGreaterThanOrEqual(17);
      expect(r.count).toBeLessThanOrEqual(18);
      // A distância é a dos passos, não a dos quadros.
      expect(r.x).toBeCloseTo(1.5 + r.count * step, 9);
    }
  });

  it("manda lotes de dois passos, numerados sem buraco; e a mudança de direção vai na hora", () => {
    const sent: InputBatch[] = [];
    const local = new LocalPlayer(config);
    local.connect((b) => sent.push(b), () => "me");
    const state = playing();
    local.setDirection(1, 0);
    drive(local, state, 60, 500);
    const batchesWhileHolding = sent.length;
    // ~30 lotes por segundo andando, não 60.
    expect(batchesWhileHolding).toBeGreaterThanOrEqual(13);
    expect(batchesWhileHolding).toBeLessThanOrEqual(17);
    local.setDirection(0, 1);
    local.frame(state, 500 + TICK_MS + 1);
    const last = decodeBatch(sent[sent.length - 1])!;
    expect(last.at(-1)).toMatchObject({ dx: 0, dy: 1 });
    const seqs = sent.flatMap((b) => decodeBatch(b)!.map((c) => c.seq));
    expect(seqs).toEqual(seqs.map((_, i) => seqs[0] + i));
  });

  it("parado não manda nada", () => {
    const sent: InputBatch[] = [];
    const local = new LocalPlayer(config);
    local.connect((b) => sent.push(b), () => "me");
    drive(local, playing(), 60, 2000);
    expect(sent).toHaveLength(0);
  });

  it("a bomba vai num comando só, e o som toca uma vez", () => {
    const sent: InputBatch[] = [];
    const local = new LocalPlayer(config);
    local.connect((b) => sent.push(b), () => "me");
    let sounds = 0;
    local.subscribePlace(() => sounds++);
    const state = playing();
    local.requestBomb();
    drive(local, state, 60, 300);
    const bombs = sent.flatMap((b) => decodeBatch(b)!).filter((c) => c.bomb);
    expect(bombs).toHaveLength(1);
    expect(sounds).toBe(1);
  });

  it("fora do ar, nada anda nem sai", () => {
    const sent: InputBatch[] = [];
    const local = new LocalPlayer(config);
    local.connect((b) => sent.push(b), () => "me");
    local.setOnline(false);
    local.setDirection(1, 0);
    drive(local, playing(), 60, 500);
    expect(sent).toHaveLength(0);
  });
});

describe("o relógio do servidor e a interpolação dos outros", () => {
  /** Um boneco a 3,6 células/s; estados a cada 2 passos que chegam com atraso variável. */
  function arrivals(jitter: (i: number) => number) {
    const out: Array<{ tick: number; arrival: number; x: number }> = [];
    for (let i = 0; i < 120; i++) {
      const tick = 100 + i * 2;
      out.push({ tick, arrival: tick * TICK_MS + 80 + jitter(i), x: 1.5 + 0.06 * (tick - 100) });
    }
    return out;
  }

  /** Desenha a 60 quadros por segundo e devolve o quanto o boneco andou em cada quadro. */
  function render(list: ReturnType<typeof arrivals>, clock: NetClock) {
    const samples: Sample[] = [];
    let next = 0;
    const steps: number[] = [];
    let prev: number | null = null;
    const start = list[10].arrival;
    for (let now = list[0].arrival; now < list[list.length - 1].arrival; now += 1000 / 60) {
      while (next < list.length && list[next].arrival <= now) {
        clock.observe(list[next].tick, list[next].arrival);
        record(samples, list[next].tick * TICK_MS, list[next].x, 1.5);
        next++;
      }
      const at = clock.renderTime(now, 1000 / 60);
      const { x } = sampleAt(samples, at ?? Infinity);
      if (prev !== null && now > start + 500) steps.push(x - prev);
      prev = x;
    }
    return steps;
  }

  it("com chegada irregular, o boneco anda em velocidade constante", () => {
    // Até 40 ms de variação, sem ordem: os estados chegam em rajadas e buracos.
    const random = (() => {
      let s = 9;
      return () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    })();
    const list = arrivals(() => random() * 40);
    list.sort((a, b) => a.arrival - b.arrival);
    // O TCP não troca a ordem: quem chegaria antes do anterior espera por ele.
    for (let i = 1; i < list.length; i++) list[i].arrival = Math.max(list[i].arrival, list[i - 1].arrival);
    list.sort((a, b) => a.tick - b.tick);
    for (let i = 1; i < list.length; i++) list[i].arrival = Math.max(list[i].arrival, list[i - 1].arrival);
    const clock = new NetClock(config.clock);
    const steps = render(list, clock);
    const expected = 0.06 * (60 / 60);
    // Cada quadro anda ~0,06 célula (3,6 células/s a 60 quadros), sem parar nem pular.
    for (const step of steps) {
      expect(step).toBeGreaterThan(expected * 0.5);
      expect(step).toBeLessThan(expected * 1.6);
    }
    expect(clock.jitter).toBeGreaterThan(2);
    expect(clock.delay).toBeGreaterThanOrEqual(config.clock.minDelay);
  });

  it("depois de um tempo parado, a saída não vira um passeio lento desde a última amostra", () => {
    const samples: Sample[] = [];
    record(samples, 0, 1.5, 1.5);
    record(samples, 2000, 1.62, 1.5);
    // Logo antes da nova amostra, ainda parado lá atrás.
    expect(sampleAt(samples, 2000 - HOLD_GAP_MS).x).toBe(1.5);
  });

  it("o atraso se ajusta à variação, dentro dos limites", () => {
    const calm = new NetClock(config.clock);
    const rough = new NetClock(config.clock);
    for (let i = 0; i < 200; i++) {
      calm.observe(i * 2, i * 2 * TICK_MS + 80);
      rough.observe(i * 2, i * 2 * TICK_MS + 80 + (i % 3) * 30);
    }
    expect(calm.targetDelay).toBeLessThan(rough.targetDelay);
    expect(rough.targetDelay).toBeLessThanOrEqual(config.clock.maxDelay);
    expect(calm.targetDelay).toBeGreaterThanOrEqual(config.clock.minDelay);
  });
});

describe("a configuração de rede da tela", () => {
  it("lê, valida e cai no padrão quando o valor não presta", () => {
    const cfg = readClientConfig((name) => ({ interp: "90", correct: "abc", pending: "5", net: "1" })[name]);
    expect(cfg.clock.fixedDelay).toBe(90);
    expect(cfg.predict.correctionHalfLifeMs).toBe(60);
    expect(cfg.predict.maxPending).toBe(120);
    expect(cfg.diag).toBe(true);
    expect(readClientConfig(() => undefined).diag).toBe(false);
  });
});

/*
 * Simulação de rede, sem navegador: um servidor de verdade (o build de
 * `apps/server`, num processo à parte) e robôs que jogam com o SDK de verdade
 * e com a MESMA previsão, o mesmo relógio e a mesma interpolação da tela
 * (`LocalPlayer`, `NetClock`, `interp.ts`). A rede é moldada aqui: cada
 * mensagem, nos dois sentidos, espera meia ida e volta mais uma variação
 * sorteada, sem trocar de ordem (é TCP); de vez em quando uma mensagem
 * atrasa muito (a retransmissão de um pacote perdido segura as seguintes).
 * O engasgo do servidor é um SIGSTOP/SIGCONT no processo dele.
 *
 *   pnpm --filter server build
 *   apps/server/node_modules/.bin/tsx apps/web/scripts/netsim.ts [cenário…] [--seconds=20] [--json=saida.json]
 *
 * Sem cenário, roda todos. Cada um imprime uma linha da tabela no fim.
 */

import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { writeFileSync } from "node:fs";
import type { ArenaState, FxMessage, NetStatsMessage } from "@bomb/shared";

const here = dirname(fileURLToPath(import.meta.url));
const SERVER_ENTRY = resolve(here, "../../server/build/index.js");

/* ------------------------------------------------------------ a rede moldada */

type LinkSpec = {
  /** Ida e volta, em ms (metade para cada lado). */
  rtt: number;
  /** Variação máxima de cada mensagem, em ms (uniforme, 0..jitter). */
  jitter: number;
  /** Chance de uma mensagem ficar presa (perda + retransmissão TCP), e quanto. */
  spikeChance: number;
  spikeMs: number;
};

/**
 * Uma fila por sentido, entregue em ordem. Um `setTimeout` por mensagem não
 * serve: os temporizadores do Node com durações diferentes vivem em listas
 * diferentes, com granularidade de 1 ms, e duas mensagens a frações de ms uma
 * da outra podem sair trocadas — coisa que o TCP nunca faz.
 */
class Lane {
  private queue: Array<{ at: number; deliver: () => void }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastAt = 0;

  push(delay: number, deliver: () => void) {
    const at = Math.max(this.lastAt, performance.now() + delay);
    this.lastAt = at;
    this.queue.push({ at, deliver });
    if (!this.timer) this.arm();
  }

  private arm() {
    const head = this.queue[0];
    if (!head) {
      this.timer = null;
      return;
    }
    this.timer = setTimeout(() => this.drain(), Math.max(0, head.at - performance.now()));
  }

  private drain() {
    const now = performance.now();
    while (this.queue.length && this.queue[0].at <= now + 0.5) this.queue.shift()!.deliver();
    this.arm();
  }
}

class Link {
  private upLane = new Lane();
  private downLane = new Lane();
  bytesDown = 0;
  bytesUp = 0;
  messagesDown = 0;
  constructor(private spec: LinkSpec, private random: () => number) {}

  private delay() {
    const spike = this.random() < this.spec.spikeChance ? this.spec.spikeMs : 0;
    return this.spec.rtt / 2 + this.random() * this.spec.jitter + spike;
  }

  up(size: number, deliver: () => void) {
    this.bytesUp += size;
    this.upLane.push(this.delay(), deliver);
  }

  down(size: number, deliver: () => void) {
    this.bytesDown += size;
    this.messagesDown++;
    this.downLane.push(this.delay(), deliver);
  }
}

let nextLink: Link | null = null;
const Native = globalThis.WebSocket;

/** O WebSocket que o SDK vai usar: o nativo do Node, com o atraso do `Link` nos dois sentidos. */
class ShapedWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  onopen: ((e: unknown) => void) | null = null;
  onmessage: ((e: unknown) => void) | null = null;
  onclose: ((e: unknown) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  private inner: WebSocket;
  private link: Link;

  constructor(url: string, options?: unknown) {
    const protocols =
      options && typeof options === "object" && !Array.isArray(options)
        ? (options as { protocols?: string | string[] }).protocols
        : (options as string | string[] | undefined);
    this.inner = new Native(url, protocols);
    this.link = nextLink ?? new Link({ rtt: 0, jitter: 0, spikeChance: 0, spikeMs: 0 }, Math.random);
    this.inner.binaryType = "arraybuffer";
    this.inner.onopen = (e) => this.onopen?.(e);
    this.inner.onmessage = (e) => {
      const size = e.data instanceof ArrayBuffer ? e.data.byteLength : String(e.data).length;
      this.link.down(size, () => this.onmessage?.(e));
    };
    this.inner.onclose = (e) => this.link.down(0, () => this.onclose?.(e));
    this.inner.onerror = (e) => this.onerror?.(e);
  }

  set binaryType(value: BinaryType) {
    this.inner.binaryType = value;
  }
  get binaryType() {
    return this.inner.binaryType;
  }
  get readyState() {
    return this.inner.readyState;
  }

  send(data: ArrayBufferLike | Uint8Array | string) {
    // O SDK reaproveita o buffer: a cópia é o que viaja.
    const copy = typeof data === "string" ? data : new Uint8Array(data as ArrayBuffer).slice();
    const size = typeof copy === "string" ? copy.length : copy.byteLength;
    this.link.up(size, () => {
      if (this.inner.readyState === 1) this.inner.send(copy);
    });
  }

  close(code?: number, reason?: string) {
    this.inner.close(code, reason);
  }
}
(globalThis as unknown as { WebSocket: unknown }).WebSocket = ShapedWebSocket;

/* O SDK e a tela só depois da troca: o SDK guarda o `WebSocket` ao carregar. */
const { Client } = await import("@colyseus/sdk");
const { LocalPlayer } = await import("../src/game/local");
const { readClientConfig } = await import("../src/game/netconfig");
const { record, sampleAt } = await import("../src/game/interp");
type Sample = { t: number; x: number; y: number };
const { TICK_MS, JUMP_CELLS_GUARD } = { TICK_MS: 1000 / 60, JUMP_CELLS_GUARD: 2 };

/* ------------------------------------------------------------ os cenários */

type Scenario = {
  name: string;
  link: LinkSpec;
  rooms: number;
  /** Ambiente do servidor (PATCH_MS, …). */
  env?: Record<string, string>;
  /** Engasgo do servidor: SIGSTOP por `ms` a cada `every` ms. */
  stall?: { every: number; ms: number };
};

const base = { spikeChance: 0, spikeMs: 0 };
const SCENARIOS: Scenario[] = [
  { name: "rtt50", link: { rtt: 50, jitter: 5, ...base }, rooms: 1 },
  { name: "rtt100", link: { rtt: 100, jitter: 10, ...base }, rooms: 1 },
  { name: "rtt150", link: { rtt: 150, jitter: 20, ...base }, rooms: 1 },
  { name: "rtt200", link: { rtt: 200, jitter: 30, ...base }, rooms: 1 },
  { name: "rtt150-patch50", link: { rtt: 150, jitter: 20, ...base }, rooms: 1, env: { PATCH_MS: "50" } },
  { name: "rtt150-jitter60", link: { rtt: 150, jitter: 60, ...base }, rooms: 1 },
  { name: "rtt150-spikes", link: { rtt: 150, jitter: 20, spikeChance: 0.02, spikeMs: 250 }, rooms: 1 },
  { name: "rtt150-stalls", link: { rtt: 150, jitter: 20, ...base }, rooms: 1, stall: { every: 4000, ms: 300 } },
  { name: "rtt150-8rooms", link: { rtt: 150, jitter: 20, ...base }, rooms: 8 },
];

/* ------------------------------------------------------------ os robôs */

function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type BotReport = {
  reconciles: number;
  corrections: number;
  correctionSum: number;
  correctionMax: number;
  large: number;
  mispredicts: number;
  ackDelay: number;
  pendingMax: number;
  bombCommands: number;
  placeEvents: number;
  cursedDiarrhea: boolean;
  bytesDown: number;
  bytesUp: number;
  batches: number;
  /** Interpolação dos outros: quadros com salto visível, e quadros desenhados de alguém andando. */
  remoteJumps: number;
  remoteFrames: number;
  remoteFrozen: number;
  interpDelay: number;
  jitter: number;
  server: NetStatsMessage | null;
};

class Bot {
  room!: Awaited<ReturnType<InstanceType<typeof Client>["create"]>>;
  local = new LocalPlayer(readClientConfig(() => undefined));
  link: Link;
  private random: () => number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nextTurn = 0;
  private nextBomb = 0;
  private pendingMax = 0;
  private bombCommands = 0;
  private placeEvents = 0;
  private cursedDiarrhea = false;
  /** O desenho dos outros: amostras carimbadas pelo servidor e o último lugar desenhado. */
  private remote = new Map<string, { samples: Sample[]; last: { x: number; y: number } | null; still: number }>();
  private remoteJumps = 0;
  private remoteFrames = 0;
  private remoteFrozen = 0;
  private lastFrame = 0;

  constructor(
    private client: InstanceType<typeof Client>,
    spec: LinkSpec,
    seed: number,
    private watchRemote: boolean,
  ) {
    this.link = new Link(spec, seeded(seed * 7919));
    this.random = seeded(seed);
  }

  async create(options: Record<string, unknown>) {
    nextLink = this.link;
    this.room = await this.client.create("arena", options);
    this.attach();
  }

  async join(id: string, options: Record<string, unknown>) {
    nextLink = this.link;
    this.room = await this.client.joinById(id, options);
    this.attach();
  }

  private attach() {
    const room = this.room;
    this.local.connect((batch) => {
      const commands = batch.runs.reduce((n, [code, count]) => n + (code >= 9 ? 1 : 0) * count, 0);
      this.bombCommands += commands;
      room.send("input", batch);
    }, () => room.sessionId);
    room.onStateChange(() => this.local.onState(room.state as unknown as ArenaState, performance.now()));
    room.onMessage("fx", (events: FxMessage) => {
      for (const e of events) if (e.k === "place" && e.by === room.sessionId) this.placeEvents++;
    });
    room.onMessage("net", (stats: NetStatsMessage) => this.local.setServerStats(stats));
    room.onMessage("*", () => {});
  }

  diag() {
    this.room.send("diag", { on: true });
  }

  start() {
    this.timer = setInterval(() => this.frame(), 1000 / 60);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  private frame() {
    const now = performance.now();
    const state = this.room.state as unknown as ArenaState;
    const me = state.players?.find((p) => p.id === this.room.sessionId);
    if (me?.curse === "diarrhea") this.cursedDiarrhea = true;
    // O dedo: uma direção por 0,3–1,2 s (às vezes parado), e uma bomba a cada 2–5 s.
    if (now >= this.nextTurn) {
      const dirs: Array<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0], [1, 1]];
      const [dx, dy] = dirs[Math.floor(this.random() * dirs.length)];
      this.local.setDirection(dx, dy);
      this.nextTurn = now + 300 + this.random() * 900;
    }
    if (now >= this.nextBomb && !NO_BOMBS) {
      this.local.requestBomb();
      this.nextBomb = now + 2000 + this.random() * 3000;
    }
    this.local.frame(state, now);
    this.local.view();
    this.pendingMax = Math.max(this.pendingMax, this.local.predictor.pendingCount);
    if (this.watchRemote) this.drawRemote(state, now);
  }

  /** Desenha os outros como a tela: na linha do tempo do servidor, com o atraso do relógio. */
  private drawRemote(state: ArenaState, now: number) {
    const dt = this.lastFrame ? now - this.lastFrame : 0;
    this.lastFrame = now;
    if (state.phase !== "playing") return;
    const at = this.local.clock.renderTime(now, dt);
    if (at === null) return;
    for (const p of state.players) {
      if (p.id === this.room.sessionId) continue;
      let r = this.remote.get(p.id);
      if (!r) this.remote.set(p.id, (r = { samples: [], last: null, still: 0 }));
      if (!p.alive) {
        r.samples.length = 0;
        r.last = null;
        continue;
      }
      record(r.samples, state.tick * TICK_MS, p.x, p.y);
      const pos = sampleAt(r.samples, at);
      if (r.last && p.moving) {
        this.remoteFrames++;
        const step = Math.hypot(pos.x - r.last.x, pos.y - r.last.y);
        // A bota no máximo anda 0,1 célula por quadro: mais que 0,25 é um salto visível (renascer não conta).
        if (step > 0.25 && step < JUMP_CELLS_GUARD) this.remoteJumps++;
        // Parado na tela com uma amostra mais nova em outro lugar: a interpolação ficou sem amostra à frente.
        const newest = r.samples[r.samples.length - 1];
        const behind = newest && Math.hypot(newest.x - pos.x, newest.y - pos.y) > 1e-6;
        r.still = step < 1e-6 && behind ? r.still + 1 : 0;
        // Três quadros assim: um tranco visível.
        if (r.still === 3) this.remoteFrozen++;
      }
      r.last = pos;
    }
  }

  report(): BotReport {
    const m = this.local.predictor.metrics;
    return {
      reconciles: m.reconciles,
      corrections: m.corrections,
      correctionSum: m.correctionSum,
      correctionMax: m.correctionMax,
      large: m.large,
      mispredicts: m.mispredicts,
      ackDelay: m.ackDelay,
      pendingMax: this.pendingMax,
      bombCommands: this.bombCommands,
      placeEvents: this.placeEvents,
      cursedDiarrhea: this.cursedDiarrhea,
      bytesDown: this.link.bytesDown,
      bytesUp: this.link.bytesUp,
      batches: this.local.stats.batches,
      remoteJumps: this.remoteJumps,
      remoteFrames: this.remoteFrames,
      remoteFrozen: this.remoteFrozen,
      interpDelay: this.local.clock.delay,
      jitter: this.local.clock.jitter,
      server: this.local.stats.server,
    };
  }
}

/* ------------------------------------------------------------ o servidor */

async function startServer(port: number, env: Record<string, string>): Promise<ChildProcess> {
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, PORT: String(port), NODE_ENV: "production", ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout!.on("data", (d) => (log += d));
  child.stderr!.on("data", (d) => (log += d));
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res) return child;
    } catch {
      await sleep(100);
    }
  }
  child.kill();
  throw new Error(`o servidor não subiu:\n${log}`);
}

function usage(pid: number): { cpu: number; rssMb: number } {
  try {
    const out = execFileSync("ps", ["-o", "%cpu=,rss=", "-p", String(pid)]).toString().trim().split(/\s+/);
    return { cpu: Number(out[0]), rssMb: Math.round(Number(out[1]) / 1024) };
  } catch {
    return { cpu: NaN, rssMb: NaN };
  }
}

/* ------------------------------------------------------------ rodar */

async function run(s: Scenario, seconds: number, port: number) {
  const server = await startServer(port, s.env ?? {});
  const bots: Bot[] = [];
  let stallTimer: ReturnType<typeof setInterval> | null = null;
  try {
    for (let r = 0; r < s.rooms; r++) {
      const client = new Client(`http://127.0.0.1:${port}`);
      const roomBots = [0, 1, 2, 3].map((i) => new Bot(client, s.link, 1000 * r + i + 1, i === 0));
      await roomBots[0].create({ roomName: `sim${r}`, playerName: "B0", maxPlayers: 4, seatKey: `r${r}b0`, minutes: 10 });
      for (let i = 1; i < 4; i++) {
        await roomBots[i].join(roomBots[0].room.roomId, { playerName: `B${i}`, seatKey: `r${r}b${i}` });
      }
      roomBots[0].diag();
      bots.push(...roomBots);
      await sleep(300);
      roomBots[0].room.send("start");
    }
    await sleep(3500);
    for (const bot of bots) bot.start();
    if (s.stall) {
      stallTimer = setInterval(() => {
        process.kill(server.pid!, "SIGSTOP");
        setTimeout(() => process.kill(server.pid!, "SIGCONT"), s.stall!.ms);
      }, s.stall.every);
    }
    const memBefore = process.memoryUsage().heapUsed;
    await sleep(seconds * 1000);
    if (stallTimer) clearInterval(stallTimer);
    const serverUsage = usage(server.pid!);
    for (const bot of bots) bot.stop();
    const memAfter = process.memoryUsage().heapUsed;
    await sleep(200);
    const reports = bots.map((b) => b.report());
    return summarize(s, seconds, reports, serverUsage, (memAfter - memBefore) / 1024 / 1024);
  } finally {
    if (stallTimer) clearInterval(stallTimer);
    for (const bot of bots) {
      try {
        bot.room.leave();
      } catch {
        /* já saiu */
      }
    }
    try {
      process.kill(server.pid!, "SIGCONT");
    } catch {
      /* já foi */
    }
    server.kill();
    await sleep(300);
  }
}

function summarize(
  s: Scenario,
  seconds: number,
  reports: BotReport[],
  serverUsage: { cpu: number; rssMb: number },
  clientHeapDeltaMb: number,
) {
  const total = (f: (r: BotReport) => number) => reports.reduce((n, r) => n + f(r), 0);
  const max = (f: (r: BotReport) => number) => Math.max(...reports.map(f));
  const corrections = total((r) => r.corrections);
  const watchers = reports.filter((r) => r.server);
  const servers = watchers.map((r) => r.server!);
  // Uma bomba por comando, no máximo: mais eventos que comandos (sem a maldição) seria duplicação.
  const duplicated = reports.filter((r) => !r.cursedDiarrhea && r.placeEvents > r.bombCommands).length;
  return {
    scenario: s.name,
    rtt: s.link.rtt,
    jitter: s.link.jitter,
    rooms: s.rooms,
    bots: reports.length,
    patchMs: Number(s.env?.PATCH_MS ?? 33),
    reconciles: total((r) => r.reconciles),
    corrections,
    correctionsPerBotMin: Math.round((corrections / reports.length / seconds) * 60 * 10) / 10,
    mispredicts: total((r) => r.mispredicts),
    correctionAvg: corrections ? round(total((r) => r.correctionSum) / corrections, 4) : 0,
    correctionMax: round(max((r) => r.correctionMax), 3),
    large: total((r) => r.large),
    ackDelayMs: Math.round(total((r) => r.ackDelay) / reports.length),
    pendingMax: max((r) => r.pendingMax),
    bombCommands: total((r) => r.bombCommands),
    placeEvents: total((r) => r.placeEvents),
    duplicatedBots: duplicated,
    downKBps: round(total((r) => r.bytesDown) / reports.length / seconds / 1024, 2),
    upKBps: round(total((r) => r.bytesUp) / reports.length / seconds / 1024, 2),
    batchesPerSec: round(total((r) => r.batches) / reports.length / seconds, 1),
    remoteFrames: total((r) => r.remoteFrames),
    remoteJumps: total((r) => r.remoteJumps),
    remoteFrozen: total((r) => r.remoteFrozen),
    interpDelayMs: Math.round(total((r) => r.interpDelay) / reports.length),
    stateJitterMs: Math.round(total((r) => r.jitter) / reports.length),
    serverHz: servers.length ? round(Math.min(...servers.map((x) => x.hz)), 1) : NaN,
    serverTickAvgMs: servers.length ? round(Math.max(...servers.map((x) => x.tickAvg)), 3) : NaN,
    serverTickMaxMs: servers.length ? round(Math.max(...servers.map((x) => x.tickMax)), 3) : NaN,
    serverDroppedMs: servers.length ? Math.max(...servers.map((x) => x.droppedMs)) : NaN,
    serverCpu: serverUsage.cpu,
    serverRssMb: serverUsage.rssMb,
    clientHeapDeltaMb: round(clientHeapDeltaMb, 1),
  };
}

function round(value: number, digits: number) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

const args = process.argv.slice(2);
/** `--no-bombs`: ninguém põe bomba — o mundo não muda, e toda correção seria erro da previsão. */
var NO_BOMBS = args.includes("--no-bombs");
const seconds = Number(args.find((a) => a.startsWith("--seconds="))?.split("=")[1] ?? 20);
const jsonOut = args.find((a) => a.startsWith("--json="))?.split("=")[1];
const names = args.filter((a) => !a.startsWith("--"));
const chosen = names.length ? SCENARIOS.filter((s) => names.includes(s.name)) : SCENARIOS;

const results = [];
let port = 2700;
for (const scenario of chosen) {
  process.stderr.write(`… ${scenario.name}\n`);
  const result = await run(scenario, seconds, port++);
  results.push(result);
  process.stderr.write(`${JSON.stringify(result)}\n`);
}
console.table(
  results.map((r) => ({
    cenário: r.scenario,
    "corr/bot/min": r.correctionsPerBotMin,
    "previsão errada": r.mispredicts,
    "corr méd": r.correctionAvg,
    "corr máx": r.correctionMax,
    grandes: r.large,
    "conf ms": r.ackDelayMs,
    "pend máx": r.pendingMax,
    "bombas cmd/ev": `${r.bombCommands}/${r.placeEvents}`,
    dup: r.duplicatedBots,
    "saltos/quadros": `${r.remoteJumps}/${r.remoteFrames}`,
    trancos: r.remoteFrozen,
    "interp ms": r.interpDelayMs,
    "↓KB/s": r.downKBps,
    "↑KB/s": r.upKBps,
    "srv Hz": r.serverHz,
    "srv tick ms": `${r.serverTickAvgMs}/${r.serverTickMaxMs}`,
    "srv perdido": r.serverDroppedMs,
  })),
);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(results, null, 2));
process.exit(0);

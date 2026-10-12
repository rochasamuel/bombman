import { TICK_MS, encodeBatch, type ArenaState, type InputBatch, type MoveCommand, type NetStatsMessage } from "@bomb/shared";
import { NetClock } from "./netclock";
import type { ClientNetConfig } from "./netconfig";
import { Predictor, type Predicted } from "./predict";

/*
 * O jogador desta tela, do lado da rede. Junta quatro coisas que ficam
 * separadas de propósito:
 *
 *   - a ENTRADA: a direção que o dedo segura e a bomba pedida (`setDirection`,
 *     `requestBomb`), que só registram — nada anda aqui;
 *   - a SIMULAÇÃO: passos fixos de `TICK_MS`, contados pelo relógio da tela e
 *     não pelos quadros (a 30 ou a 144 quadros por segundo o boneco anda o
 *     mesmo), cada um um comando para o `Predictor`;
 *   - o TRANSPORTE: os comandos vão em lotes, a cada dois passos ou na hora em
 *     que algo muda (outra direção, bomba, soltou) — ~30 mensagens por segundo
 *     andando, nenhuma parado;
 *   - o ESTADO DO SERVIDOR: cada patch reconcilia a previsão e alimenta o
 *     relógio da interpolação dos outros (`NetClock`).
 *
 * O desenho só pergunta `view()`: onde o boneco está entre um passo e outro.
 */

/** Um lote sai no máximo a cada tantos passos andando na mesma direção. */
const SEND_EVERY_TICKS = 2;

export type LocalStats = {
  /** Ida e volta (ping nativo do Colyseus), em ms, suavizada; e a variação dela. */
  rtt: number;
  rttVar: number;
  /** Duração de um quadro, em ms (suavizada). */
  frameMs: number;
  /** Lotes e comandos mandados. */
  batches: number;
  commands: number;
  /** Passos jogados fora num quadro lento demais. */
  skippedTicks: number;
  /** O último diagnóstico do servidor, se pedido. */
  server: NetStatsMessage | null;
};

export class LocalPlayer {
  readonly predictor: Predictor;
  readonly clock: NetClock;
  stats: LocalStats = { rtt: 0, rttVar: 0, frameMs: 0, batches: 0, commands: 0, skippedTicks: 0, server: null };
  /** Sem conexão (caiu e ainda não voltou): nada anda nem sai. */
  private online = false;
  private placeHandlers = new Set<() => void>();
  private detonateHandlers = new Set<() => void>();
  private send: (batch: InputBatch) => void = () => {};
  private meId: () => string = () => "";
  private config: ClientNetConfig;

  private dx = 0;
  private dy = 0;
  private bombWanted = false;
  private detonateWanted = false;
  private acc = 0;
  private lastFrame = Number.NaN;
  private lastDt = 0;
  private outbox: MoveCommand[] = [];
  private lastCode = "";

  constructor(config: ClientNetConfig) {
    this.config = config;
    this.predictor = new Predictor(config.predict);
    this.clock = new NetClock(config.clock);
  }

  /** Liga a uma sala: por onde os lotes saem e quem é o jogador desta tela. */
  connect(send: (batch: InputBatch) => void, meId: () => string) {
    this.send = send;
    this.meId = meId;
    this.online = true;
  }

  setOnline(online: boolean) {
    this.online = online;
  }

  setServerStats(stats: NetStatsMessage) {
    this.stats.server = stats;
  }

  /** Uma bomba provisória apareceu (o som da bomba toca já). Devolve como desligar. */
  subscribePlace(handler: () => void): () => void {
    this.placeHandlers.add(handler);
    return () => this.placeHandlers.delete(handler);
  }

  setDirection(dx: number, dy: number) {
    this.dx = Math.sign(dx);
    this.dy = Math.sign(dy);
  }

  requestBomb() {
    this.bombWanted = true;
  }

  requestDetonate() {
    this.detonateWanted = true;
  }

  /** A detonação saiu (a tela já pisca a remota, antes de o servidor confirmar). Devolve como desligar. */
  subscribeDetonate(handler: () => void): () => void {
    this.detonateHandlers.add(handler);
    return () => this.detonateHandlers.delete(handler);
  }

  /**
   * Um quadro: roda os passos fixos que couberem no tempo que passou e manda
   * o que for preciso. `state` é o estado vivo do Colyseus.
   */
  frame(state: ArenaState | null, now: number) {
    const dt = Number.isNaN(this.lastFrame) ? 0 : Math.min(1000, now - this.lastFrame);
    this.lastFrame = now;
    this.lastDt = dt;
    if (dt > 0) this.stats.frameMs = this.stats.frameMs ? this.stats.frameMs * 0.95 + dt * 0.05 : dt;
    if (!state || !this.online) {
      this.acc = 0;
      this.bombWanted = false;
      this.detonateWanted = false;
      return;
    }
    this.acc += dt;
    let steps = Math.floor(this.acc / TICK_MS);
    if (steps > this.config.maxCatchUp) {
      // A aba engasgou: os passos a mais seriam uma rajada; ficam perdidos (o servidor só anda o que recebe).
      this.stats.skippedTicks += steps - this.config.maxCatchUp;
      this.acc -= (steps - this.config.maxCatchUp) * TICK_MS;
      steps = this.config.maxCatchUp;
    }
    for (let i = 0; i < steps; i++) {
      this.acc -= TICK_MS;
      const bomb = this.bombWanted;
      const detonate = this.detonateWanted;
      this.bombWanted = false;
      this.detonateWanted = false;
      const result = this.predictor.step(state, this.meId(), this.dx, this.dy, bomb, now, detonate);
      if (!result) {
        // Parou (ou não está em jogo): o que estava esperando vai já.
        this.flush();
        this.lastCode = "";
        continue;
      }
      const { cmd, placed } = result;
      if (placed) for (const handler of this.placeHandlers) handler();
      if (cmd.detonate) for (const handler of this.detonateHandlers) handler();
      const code = `${cmd.dx},${cmd.dy}`;
      const changed = code !== this.lastCode;
      this.lastCode = code;
      // Mudou de direção: o que era da direção anterior sai antes, e a nova vai junto no próximo.
      if (changed) this.flush();
      this.outbox.push(cmd);
      if (cmd.bomb || cmd.detonate || changed || this.outbox.length >= SEND_EVERY_TICKS) this.flush();
    }
  }

  /** Um estado do servidor chegou: reconcilia a previsão e anota a hora para a interpolação. */
  onState(state: ArenaState, now: number) {
    this.clock.observe(state.tick, now);
    this.predictor.reconcile(state, this.meId(), now);
  }

  /** Onde desenhar o próprio boneco agora; `null` quando não há previsão (vale o servidor). */
  view(): Predicted | null {
    return this.predictor.view(this.acc / TICK_MS, this.lastDt);
  }

  measurePing(ms: number) {
    const { stats } = this;
    if (!stats.rtt) {
      stats.rtt = ms;
      stats.rttVar = ms / 2;
      return;
    }
    // Como o TCP estima (RFC 6298): a média e a variação suavizadas.
    stats.rttVar = stats.rttVar * 0.75 + Math.abs(ms - stats.rtt) * 0.25;
    stats.rtt = stats.rtt * 0.875 + ms * 0.125;
  }

  private flush() {
    const batch = encodeBatch(this.outbox);
    this.outbox = [];
    if (!batch) return;
    this.stats.batches++;
    this.stats.commands += batch.runs.reduce((n, [, count]) => n + count, 0);
    this.send(batch);
  }
}

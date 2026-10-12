import { FLOOR, cellIndex } from "./contract.js";

/*
 * O protocolo de entrada e o passo fixo. A tela PREVÊ o próprio boneco com a
 * mesma regra do motor; para a previsão bater com o servidor, os dois lados
 * precisam andar exatamente os mesmos passos, na mesma ordem. Por isso a
 * entrada não é mais "a direção que está apertada agora" (o servidor andaria
 * de quando o "apertou" chegou até quando o "soltou" chegou, e o atraso da
 * rede mudaria a distância), e sim uma fila de COMANDOS: cada comando é um
 * passo de `TICK_MS` com uma direção, numerado. O servidor aplica cada um uma
 * vez só, em ordem, e devolve no estado o número do último aplicado (`seq`):
 * a tela volta à posição do servidor naquele comando e reaplica os que ainda
 * não foram confirmados.
 *
 * Parado não gera comando: não há o que andar. A bomba vai no comando do
 * passo em que foi apertada, para cair na célula em que a tela a mostrou.
 */

/** O passo fixo da simulação, nos dois lados: 60 por segundo. Mudar isto muda o protocolo. */
export const TICK_HZ = 60;
export const TICK_MS = 1000 / TICK_HZ;

/**
 * Um passo de entrada: a direção (cada eixo -1, 0 ou 1), se põe bomba antes
 * de andar e se detona a bomba remota mais antiga (o controle remoto).
 */
export type MoveCommand = { seq: number; dx: number; dy: number; bomb: boolean; detonate?: boolean };

/**
 * cliente -> servidor: comandos consecutivos, a partir de `seq`, em trechos
 * `[código, quantos]`. O código junta a direção, a bomba e a detonação (`commandCode`).
 * Segurar uma direção por dois passos é um trecho só.
 */
export type InputBatch = { seq: number; runs: Array<[number, number]> };

/** Os limites do que o servidor aceita num lote. Um lote fora deles é descartado inteiro. */
export const MAX_RUNS = 16;
export const MAX_RUN_LENGTH = 30;
export const MAX_BATCH_COMMANDS = 60;
/** O maior `seq` aceito: cabe no `uint32` do estado com folga. */
export const MAX_SEQ = 2 ** 31 - 1;

/** De 0 a 8, a direção; mais 9, a bomba; mais 18, a detonação. Do 9 em diante é evento. */
export function commandCode(dx: number, dy: number, bomb: boolean, detonate = false): number {
  return dx + 1 + 3 * (dy + 1) + (bomb ? 9 : 0) + (detonate ? 18 : 0);
}

export function decodeCommand(seq: number, code: number): MoveCommand {
  const cmd: MoveCommand = { seq, dx: (code % 3) - 1, dy: (Math.floor(code / 3) % 3) - 1, bomb: code % 18 >= 9 };
  if (code >= 18) cmd.detonate = true;
  return cmd;
}

/** O comando é um evento (bomba ou detonação): vai sozinho, nunca num trecho. */
const isEvent = (cmd: MoveCommand) => cmd.bomb || !!cmd.detonate;

/** Os comandos em ordem, agrupados em trechos iguais. Os `seq` precisam ser consecutivos. */
export function encodeBatch(commands: readonly MoveCommand[]): InputBatch | null {
  if (commands.length === 0) return null;
  const runs: Array<[number, number]> = [];
  for (const cmd of commands) {
    const code = commandCode(cmd.dx, cmd.dy, cmd.bomb, cmd.detonate);
    const last = runs[runs.length - 1];
    // A bomba e a detonação são eventos: nunca entram num trecho de mais de um passo.
    if (last && last[0] === code && !isEvent(cmd) && last[1] < MAX_RUN_LENGTH) last[1] += 1;
    else runs.push([code, 1]);
  }
  return { seq: commands[0].seq, runs };
}

/**
 * Confere e abre um lote vindo da rede. Devolve `null` se qualquer coisa
 * estiver fora do formato: tipo, faixa, tamanho, bomba repetida num trecho.
 */
export function decodeBatch(message: unknown): MoveCommand[] | null {
  if (!message || typeof message !== "object") return null;
  const { seq, runs } = message as { seq?: unknown; runs?: unknown };
  if (!Number.isInteger(seq) || (seq as number) < 1 || (seq as number) > MAX_SEQ) return null;
  if (!Array.isArray(runs) || runs.length === 0 || runs.length > MAX_RUNS) return null;
  const commands: MoveCommand[] = [];
  let next = seq as number;
  for (const run of runs) {
    if (!Array.isArray(run) || run.length !== 2) return null;
    const [code, count] = run as unknown[];
    if (!Number.isInteger(code) || (code as number) < 0 || (code as number) > 35) return null;
    if (!Number.isInteger(count) || (count as number) < 1 || (count as number) > MAX_RUN_LENGTH) return null;
    if ((code as number) >= 9 && count !== 1) return null;
    for (let i = 0; i < (count as number); i++) {
      if (next > MAX_SEQ || commands.length >= MAX_BATCH_COMMANDS) return null;
      commands.push(decodeCommand(next++, code as number));
    }
  }
  return commands;
}

/* ------------------------------------------------------------ a fila do servidor */

export type InputQueueLimits = {
  /** Quantos comandos a fila guarda; passou, o mais velho cai. */
  maxQueue: number;
  /** Quantos passos sem comando o servidor guarda de crédito para alcançar depois. */
  maxCredit: number;
};

export const DEFAULT_INPUT_LIMITS: InputQueueLimits = { maxQueue: 60, maxCredit: 8 };

/**
 * A fila de comandos de um jogador, no servidor. Cada passo do motor dá um
 * crédito; cada comando aplicado gasta um. Um comando que chega atrasado
 * (a rede engasgou) é alcançado depois com o crédito guardado — um passo
 * extra por tick, só quando há fila acumulada —, e é por isso que o boneco
 * nunca anda mais do que o tempo permite: no máximo `maxCredit` passos à
 * frente do relógio, por mais comandos que a tela mande.
 */
export class InputQueue {
  private items: MoveCommand[] = [];
  /** O maior `seq` já recebido: o que vier igual ou abaixo é repetido e cai. */
  lastSeq = 0;
  /** O `seq` do último comando aplicado (ou descartado): vai no estado. */
  ack = 0;
  credit = 0;
  /** Contadores, para o diagnóstico. */
  dropped = 0;
  duplicates = 0;
  rejected = 0;

  constructor(private limits: InputQueueLimits = DEFAULT_INPUT_LIMITS) {}

  get length() {
    return this.items.length;
  }

  /** Enfileira comandos já conferidos (`decodeBatch`). Devolve quantos entraram. */
  push(commands: readonly MoveCommand[]): number {
    let accepted = 0;
    for (const cmd of commands) {
      if (cmd.seq <= this.lastSeq) {
        this.duplicates++;
        continue;
      }
      this.lastSeq = cmd.seq;
      this.items.push(cmd);
      accepted++;
    }
    while (this.items.length > this.limits.maxQueue) {
      this.items.shift();
      this.dropped++;
    }
    return accepted;
  }

  /**
   * Os comandos deste passo do motor (`ticks` passos fixos de tempo, 1 no
   * servidor). Normalmente um por passo; um a mais quando há atraso acumulado
   * e crédito guardado.
   */
  take(ticks: number): MoveCommand[] {
    this.credit = Math.min(this.limits.maxCredit + ticks, this.credit + ticks);
    const out: MoveCommand[] = [];
    while (this.items.length > 0 && this.credit >= 1 - 1e-9) {
      const base = out.length < Math.round(ticks);
      const catchUp = out.length < Math.round(ticks) + 1 && this.items.length > 1;
      if (!base && !catchUp) break;
      const cmd = this.items.shift()!;
      this.credit -= 1;
      this.ack = cmd.seq;
      out.push(cmd);
    }
    return out;
  }

  /** Joga fora o que está na fila (morto, fora da rodada) e confirma tudo: nada disso anda depois. */
  discard() {
    if (this.items.length > 0) this.ack = this.items[this.items.length - 1].seq;
    this.items.length = 0;
    this.credit = 0;
  }

  /** Outra conexão na mesma cadeira: a numeração recomeça. */
  reset() {
    this.items.length = 0;
    this.lastSeq = 0;
    this.ack = 0;
    this.credit = 0;
  }
}

/* ------------------------------------------------------------ a parede, igual nos dois lados */

/** O que a pergunta "esta célula está fechada?" precisa saber do mundo. */
export type WalkWorld = {
  cols: number;
  rows: number;
  grid: ArrayLike<number>;
};

/**
 * A célula está fechada para quem anda: fora da arena, bloco, ou uma bomba
 * em que ele não está passando (`passing`). O motor e a previsão perguntam
 * por aqui, para a parede ser a mesma nos dois.
 */
export function cellBlocked(
  world: WalkWorld,
  cx: number,
  cy: number,
  bombHere: (cx: number, cy: number) => boolean,
  passing: (cx: number, cy: number) => boolean,
): boolean {
  if (cx < 0 || cy < 0 || cx >= world.cols || cy >= world.rows) return true;
  if (world.grid[cellIndex(cx, cy, world.cols)] !== FLOOR) return true;
  return bombHere(cx, cy) && !passing(cx, cy);
}

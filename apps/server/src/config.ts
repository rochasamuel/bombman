import { DEFAULT_INPUT_LIMITS, type InputQueueLimits } from "@bomb/shared";

/*
 * Os botões de rede da sala, por variável de ambiente. Cada um tem um padrão
 * e uma faixa; um valor fora dela (ou que não é número) volta ao padrão com
 * um aviso no log, em vez de derrubar o servidor na subida.
 *
 * O passo da simulação (`TICK_MS`, 60 Hz) NÃO está aqui: ele faz parte do
 * protocolo — a tela prevê o boneco com o mesmo passo —, e mudá-lo só de um
 * lado quebraria a previsão. Ele mora em `@bomb/shared` (`net.ts`).
 */

export type NetConfig = {
  /** De quanto em quanto a sala manda o estado, em ms. */
  patchMs: number;
  /** Quantos passos fixos a sala recupera de uma vez depois de um engasgo; o resto do atraso é jogado fora. */
  maxCatchUpTicks: number;
  /** A fila de entrada de cada jogador. */
  input: InputQueueLimits;
  /** Quantas mensagens por segundo uma conexão pode mandar antes de ser derrubada. */
  maxMessagesPerSecond: number;
  /** Um log estruturado do relógio da sala a cada tantos segundos; zero desliga. */
  logEverySeconds: number;
  /** Um passo que demora mais que isso (ms) vira um aviso no log, no máximo um a cada dez segundos por sala. */
  stallWarnMs: number;
};

export function readNetConfig(env: Record<string, string | undefined> = process.env): NetConfig {
  return {
    patchMs: int(env, "PATCH_MS", 33, 16, 200),
    maxCatchUpTicks: int(env, "MAX_CATCHUP_TICKS", 6, 1, 60),
    input: {
      maxQueue: int(env, "INPUT_QUEUE_MAX", DEFAULT_INPUT_LIMITS.maxQueue, 8, 600),
      maxCredit: int(env, "INPUT_CREDIT_MAX", DEFAULT_INPUT_LIMITS.maxCredit, 1, 60),
    },
    maxMessagesPerSecond: int(env, "MAX_MESSAGES_PER_SECOND", 120, 30, 10_000),
    logEverySeconds: int(env, "NET_LOG_SECONDS", 0, 0, 3600),
    stallWarnMs: int(env, "STALL_WARN_MS", 100, 20, 10_000),
  };
}

function int(env: Record<string, string | undefined>, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    console.warn(JSON.stringify({ msg: "config fora da faixa, usando o padrão", name, raw, min, max, fallback }));
    return fallback;
  }
  return value;
}

export const netConfig = readNetConfig();

/*
 * O relógio da sala, medido. Cada chamada do intervalo da simulação diz
 * quanto tempo real passou (`delta`) e quanto o trabalho levou (`work`); daqui
 * sai o diagnóstico: passos por segundo, o custo de um passo, o pior atraso
 * do relógio, e quanto tempo foi jogado fora num engasgo. Só contadores: nada
 * guarda histórico.
 */

export class TickStats {
  /** Na janela atual (zerada a cada `roll`). */
  private ticks = 0;
  private workSum = 0;
  private workMax = 0;
  private lateMax = 0;
  private windowStart: number;
  /** Desde que a sala nasceu. */
  droppedMs = 0;
  late = 0;
  totalTicks = 0;
  /** A última janela fechada. */
  last = { hz: 0, tickAvg: 0, tickMax: 0, lateMax: 0 };

  constructor(now: number, private intervalMs: number) {
    this.windowStart = now;
  }

  /** Um disparo do intervalo: `steps` passos fixos rodaram em `work` ms; o relógio andou `delta` ms. */
  record(delta: number, steps: number, work: number) {
    this.ticks += steps;
    this.totalTicks += steps;
    if (steps > 0) {
      this.workSum += work;
      this.workMax = Math.max(this.workMax, work / steps);
    }
    const late = delta - this.intervalMs;
    if (late > this.lateMax) this.lateMax = late;
    // Um disparo que chega com mais de um intervalo de atraso perdeu o prazo.
    if (late > this.intervalMs) this.late++;
  }

  drop(ms: number) {
    this.droppedMs += ms;
  }

  /** Fecha a janela, se já passou um segundo. Devolve se fechou. */
  roll(now: number): boolean {
    const span = now - this.windowStart;
    if (span < 1000) return false;
    this.last = {
      hz: round((this.ticks * 1000) / span),
      tickAvg: round(this.ticks ? this.workSum / this.ticks : 0, 3),
      tickMax: round(this.workMax, 3),
      lateMax: round(Math.max(0, this.lateMax)),
    };
    this.ticks = 0;
    this.workSum = 0;
    this.workMax = 0;
    this.lateMax = 0;
    this.windowStart = now;
    return true;
  }
}

function round(value: number, digits = 1) {
  const k = 10 ** digits;
  return Math.round(value * k) / k;
}

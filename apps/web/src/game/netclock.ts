import { TICK_MS } from "@bomb/shared";

/*
 * A linha do tempo do servidor, vista daqui. Cada estado que traz posição
 * nova traz também o passo do motor em que ela valeu (`state.tick`); a tela
 * anota quando ele chegou. A diferença entre as duas horas (`chegada -
 * servidor`) é o atraso da rede mais um deslocamento fixo dos relógios: a
 * MENOR diferença dos últimos segundos é o caminho mais rápido, e o quanto as
 * outras passam dela é a variação (jitter).
 *
 * Os outros bonecos são desenhados no instante do servidor `agora - menor
 * diferença - atraso`, interpolando entre as amostras carimbadas pelo próprio
 * servidor — o espaçamento entre elas é o do motor, não o da chegada, e um
 * patch que chega tarde não acelera nem freia ninguém. O atraso se ajusta à
 * variação medida: o bastante para quase sempre haver uma amostra à frente,
 * e nada além disso.
 */

export type ClockConfig = {
  /** O menor atraso de interpolação, em ms. */
  minDelay: number;
  /** O maior: com mais variação que isso, melhor um tranco de vez em quando que tudo atrasado. */
  maxDelay: number;
  /** Atraso fixo (ignora a variação medida); zero deixa adaptativo. */
  fixedDelay: number;
};

export const DEFAULT_CLOCK: ClockConfig = { minDelay: 50, maxDelay: 200, fixedDelay: 0 };

/** As menores diferenças são guardadas em janelas de meio segundo; vale a menor das últimas seis. */
const BUCKET_MS = 500;
const BUCKETS = 6;

export class NetClock {
  private buckets: Array<{ start: number; min: number }> = [];
  private lastServer = -1;
  private lastArrival = 0;
  /** A menor diferença `chegada - servidor` recente: o caminho mais rápido. */
  offset = NaN;
  /** Quanto as chegadas passam do caminho mais rápido, em ms (suavizado). */
  jitter = 0;
  /** De quanto em quanto chegam amostras novas, em ms do servidor (suavizado). */
  interval = 33;
  /** O atraso em uso, em ms: muda devagar, para o tempo desenhado não pular. */
  delay: number;
  /** Quando chegou o último estado com posição nova, no relógio da tela. */
  lastSampleAt = 0;
  samples = 0;
  private config: ClockConfig;

  constructor(config: ClockConfig = DEFAULT_CLOCK) {
    this.config = config;
    this.delay = config.fixedDelay || config.minDelay + 20;
  }

  /** Um estado chegou em `arrival` (ms da tela) com o carimbo `tick` do motor. */
  observe(tick: number, arrival: number) {
    const server = tick * TICK_MS;
    if (server === this.lastServer) return;
    if (server < this.lastServer) {
      // O servidor recomeçou (outra sala): a linha do tempo antiga não vale.
      this.buckets = [];
      this.offset = NaN;
    }
    if (this.lastServer >= 0 && server > this.lastServer) {
      const gap = server - this.lastServer;
      // Só o espaçamento de quem está andando (um boneco parado não manda nada).
      if (gap < 200) this.interval = this.interval * 0.9 + gap * 0.1;
    }
    this.lastServer = server;
    this.lastArrival = arrival;
    this.lastSampleAt = arrival;
    this.samples++;

    const diff = arrival - server;
    let bucket = this.buckets[this.buckets.length - 1];
    if (!bucket || arrival - bucket.start >= BUCKET_MS) {
      bucket = { start: arrival, min: diff };
      this.buckets.push(bucket);
      if (this.buckets.length > BUCKETS) this.buckets.shift();
    } else if (diff < bucket.min) {
      bucket.min = diff;
    }
    this.offset = Math.min(...this.buckets.map((b) => b.min));
    const late = diff - this.offset;
    this.jitter = this.jitter * 0.95 + late * 0.05;
  }

  /** O atraso que a variação medida pede: um intervalo entre amostras, mais duas vezes a variação, mais folga. */
  get targetDelay(): number {
    if (this.config.fixedDelay) return this.config.fixedDelay;
    const want = this.interval + 2 * this.jitter + 8;
    return Math.min(this.config.maxDelay, Math.max(this.config.minDelay, want));
  }

  /**
   * O instante do servidor que a tela deve desenhar agora (ms), ou `null`
   * antes de chegar qualquer amostra. `dt` é o tempo desde o quadro anterior:
   * o atraso anda até o alvo devagar (5% por quadro de 16 ms).
   */
  renderTime(now: number, dt: number): number | null {
    if (Number.isNaN(this.offset)) return null;
    const k = 1 - Math.pow(0.95, Math.max(0, dt) / 16.7);
    this.delay += (this.targetDelay - this.delay) * k;
    return now - this.offset - this.delay;
  }

  /** Quanto tempo faz desde o último estado com posição nova, em ms. */
  age(now: number): number {
    return this.lastArrival ? now - this.lastArrival : 0;
  }
}

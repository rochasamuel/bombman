import {
  FLOOR,
  bombLimit,
  cellBlocked,
  cellIndex,
  commandDistance,
  cursedInput,
  moveOnRails,
  touches,
  type ArenaState,
  type Direction,
  type MoveCommand,
  type PublicPlayer,
} from "@bomb/shared";

/*
 * A previsão do PRÓPRIO boneco, com reconciliação por número de comando.
 *
 * Cada passo fixo (`TICK_MS`) em que o dedo aponta para algum lado vira um
 * comando numerado: a tela o aplica na hora, com a mesma regra do motor
 * (`moveOnRails`, `commandDistance`, `cellBlocked`), guarda onde o boneco
 * ficou e manda o comando para o servidor. O servidor aplica cada comando uma
 * vez, em ordem, e devolve no estado o número do último (`seq`). Quando o
 * estado chega, a tela:
 *
 *   1. esquece os comandos até `seq` (o servidor já os aplicou);
 *   2. volta o boneco para onde o servidor diz que ele estava depois de `seq`;
 *   3. reaplica, em ordem, os comandos que o servidor ainda não viu.
 *
 * Com a regra igual e o passo igual, o resultado é o mesmo de antes e nada
 * muda na tela. Quando muda (uma bomba de outro jogador que a tela ainda não
 * tinha visto, um item de velocidade, um chute), a SIMULAÇÃO fica com o valor
 * certo na hora, e só o DESENHO se aproxima dele aos poucos (`offset`), para
 * a correção não ser um tranco. Uma diferença grande não é escondida: pula
 * direto e fica contada (`large`).
 *
 * A bomba que o dedo pede vai no comando do passo. A tela mostra uma bomba
 * provisória (`ghosts`) na hora, se o servidor deve aceitá-la; ela some quando
 * o servidor confirmar o comando — trocada pela de verdade, ou por nada, se ele
 * recusou. Reaplicar comandos NUNCA cria bomba, nem toca som: a reaplicação só
 * recalcula a posição.
 */

export type PredictConfig = {
  /** Quantos comandos não confirmados a tela guarda; passou, o mais velho cai. */
  maxPending: number;
  /** A correção visual cai pela metade a cada tanto, em ms. */
  correctionHalfLifeMs: number;
  /** Uma correção maior que isso, em células, não é suavizada: o boneco pula. */
  snapCells: number;
};

export const DEFAULT_PREDICT: PredictConfig = { maxPending: 120, correctionHalfLifeMs: 60, snapCells: 1.5 };

/** Diferenças menores que isso, em células, são a mesma posição. */
const SAME = 1e-6;

export type Predicted = { x: number; y: number; dir: Direction; moving: boolean };
/** Uma bomba que a tela já mostra e o servidor ainda não confirmou. */
export type GhostBomb = { seq: number; cx: number; cy: number; at: number };

type Walker = { x: number; y: number; dir: Direction };
type Pending = { cmd: MoveCommand; at: number; x: number; y: number; dir: Direction };

export type PredictMetrics = {
  /** Estados do servidor que chegaram com o boneco ativo. */
  reconciles: number;
  /** Destes, quantos mudaram a posição prevista (e quanto, em células). */
  corrections: number;
  correctionSum: number;
  correctionMax: number;
  /** Correções grandes demais para suavizar. */
  large: number;
  /** O servidor discordou da tela no próprio comando confirmado: a previsão errou. */
  mispredicts: number;
  /** Comandos que caíram por falta de confirmação (fila cheia). */
  overflow: number;
  /** Quanto o servidor levou para confirmar um comando, em ms (suavizado). */
  ackDelay: number;
};

const key = (cx: number, cy: number) => cy * 1024 + cx;

export class Predictor {
  /** O último número dado a um comando. Nunca volta: um comando repetido o servidor descarta. */
  seq = 0;
  private walker: Walker | null = null;
  /** Onde o boneco estava no passo anterior: o desenho interpola entre os dois. */
  private prev = { x: 0, y: 0 };
  private moving = false;
  private pending: Pending[] = [];
  /** As bombas (por célula) que o boneco ainda está atravessando desde que nasceram. */
  private passing = new Set<number>();
  ghosts: GhostBomb[] = [];
  /** As provisórias confirmadas há pouco: o desenho continua o pavio de onde estava. */
  private confirmed: GhostBomb[] = [];
  private offset = { x: 0, y: 0 };
  private ack = 0;
  /** Quem está jogando nesta tela, e em que cadeira. */
  private meId = "";
  metrics: PredictMetrics = {
    reconciles: 0,
    corrections: 0,
    correctionSum: 0,
    correctionMax: 0,
    large: 0,
    mispredicts: 0,
    overflow: 0,
    ackDelay: 0,
  };
  /** Avisa uma correção grande (o diagnóstico registra; nada aqui depende disso). */
  onLarge?: (info: { seq: number; error: number; server: { x: number; y: number }; predicted: { x: number; y: number } }) => void;

  private config: PredictConfig;

  constructor(config: PredictConfig = DEFAULT_PREDICT) {
    this.config = config;
  }

  get pendingCount() {
    return this.pending.length;
  }

  get active() {
    return this.walker !== null;
  }

  /** Esquece a posição prevista (morreu, a rodada acabou, outra sala). A numeração continua. */
  reset() {
    this.walker = null;
    this.pending = [];
    this.passing.clear();
    this.ghosts = [];
    this.offset = { x: 0, y: 0 };
    this.moving = false;
  }

  /**
   * Um passo fixo com o dedo em (`dx`, `dy`) e, se `bomb`, uma bomba pedida.
   * Devolve o comando para mandar ao servidor, ou `null` se não há o que
   * mandar (parado e sem bomba, ou fora de jogo).
   * `placed` diz se a tela mostrou a bomba (para o som tocar só nesse caso).
   */
  step(
    state: ArenaState,
    meId: string,
    dx: number,
    dy: number,
    bomb: boolean,
    now: number,
  ): { cmd: MoveCommand; placed: boolean } | null {
    const me = this.me(state, meId);
    if (!me) {
      this.reset();
      return null;
    }
    const walker = this.ensure(state, me);
    this.prev = { x: walker.x, y: walker.y };
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    // O sem freio anda sem dedo: o comando parado também vai, e o motor o vira em passo.
    const walk = cursedInput(me.curse, dx, dy, walker.dir);
    this.moving = walk.dx !== 0 || walk.dy !== 0;
    if (!this.moving && !bomb) return null;

    const cmd: MoveCommand = { seq: ++this.seq, dx, dy, bomb };
    let placed = false;
    if (bomb && this.canPlace(state, me, walker)) {
      this.ghosts.push({ seq: cmd.seq, cx: Math.floor(walker.x), cy: Math.floor(walker.y), at: now });
      placed = true;
    }
    this.apply(walker, cmd, state, me);
    this.pending.push({ cmd, at: now, x: walker.x, y: walker.y, dir: walker.dir });
    while (this.pending.length > this.config.maxPending) {
      // Sem confirmação há tempo demais: o mais velho não tem mais como ser reaplicado.
      this.pending.shift();
      this.metrics.overflow++;
    }
    return { cmd, placed };
  }

  /**
   * Um estado do servidor chegou: volta à posição dele no último comando
   * confirmado e reaplica os outros. A diferença para o que a tela tinha vai
   * para o `offset` do desenho (ou pula, se for grande).
   */
  reconcile(state: ArenaState, meId: string, now: number) {
    const me = this.me(state, meId);
    if (!me) {
      this.reset();
      return;
    }
    const ack = me.seq;
    if (ack < this.ack) {
      // O servidor recomeçou a numeração (outra conexão): nada do que está guardado vale.
      this.pending = [];
      this.ghosts = [];
      this.seq = Math.max(this.seq, ack);
    }
    this.ack = ack;
    if (!this.walker) {
      this.ensure(state, me);
      return;
    }
    this.metrics.reconciles++;

    // 1. O que o servidor já aplicou sai; o comando confirmado diz se a previsão acertou.
    let confirmed: Pending | undefined;
    while (this.pending.length > 0 && this.pending[0].cmd.seq <= ack) confirmed = this.pending.shift();
    if (confirmed) {
      const delay = now - confirmed.at;
      this.metrics.ackDelay = this.metrics.ackDelay ? this.metrics.ackDelay * 0.9 + delay * 0.1 : delay;
      if (confirmed.cmd.seq === ack && Math.hypot(confirmed.x - me.x, confirmed.y - me.y) > SAME) this.metrics.mispredicts++;
    }
    this.settleGhosts(state, meId, ack, now);

    // 2. e 3. Volta ao servidor e reaplica o resto, na ordem.
    const walker = this.walker;
    const before = { x: walker.x, y: walker.y };
    walker.x = me.x;
    walker.y = me.y;
    walker.dir = me.dir as Direction;
    this.passing = this.passersOf(state, me);
    for (const entry of this.pending) {
      this.apply(walker, entry.cmd, state, me);
      entry.x = walker.x;
      entry.y = walker.y;
      entry.dir = walker.dir;
    }

    const ex = before.x - walker.x;
    const ey = before.y - walker.y;
    const error = Math.hypot(ex, ey);
    if (error <= SAME) return;
    this.metrics.corrections++;
    this.metrics.correctionSum += error;
    this.metrics.correctionMax = Math.max(this.metrics.correctionMax, error);
    if (error > this.config.snapCells) {
      // Grande demais para esconder: o boneco vai direto para o lugar certo.
      this.metrics.large++;
      this.offset = { x: 0, y: 0 };
      this.prev = { x: walker.x, y: walker.y };
      this.onLarge?.({ seq: ack, error, server: { x: me.x, y: me.y }, predicted: before });
      return;
    }
    // A simulação já está certa; o desenho continua de onde estava e se aproxima aos poucos.
    this.offset.x += ex;
    this.offset.y += ey;
    this.prev.x -= ex;
    this.prev.y -= ey;
  }

  /**
   * Onde desenhar o boneco: entre o passo anterior e o atual (`alpha`, de 0 a
   * 1, é quanto do passo já passou), mais o que falta da correção. `dt` é o
   * tempo desde o quadro anterior, para a correção diminuir.
   */
  view(alpha: number, dt: number): Predicted | null {
    const walker = this.walker;
    if (!walker) return null;
    const decay = Math.pow(0.5, Math.max(0, dt) / this.config.correctionHalfLifeMs);
    this.offset.x *= decay;
    this.offset.y *= decay;
    if (Math.abs(this.offset.x) < 1e-4) this.offset.x = 0;
    if (Math.abs(this.offset.y) < 1e-4) this.offset.y = 0;
    const k = Math.min(1, Math.max(0, alpha));
    return {
      x: this.prev.x + (walker.x - this.prev.x) * k + this.offset.x,
      y: this.prev.y + (walker.y - this.prev.y) * k + this.offset.y,
      dir: walker.dir,
      moving: this.moving,
    };
  }

  /** O pavio de uma bomba que a tela já mostrava provisória: quando ela apareceu. */
  ghostStart(cx: number, cy: number): number | undefined {
    return (this.ghosts.find((g) => g.cx === cx && g.cy === cy) ?? this.confirmed.find((g) => g.cx === cx && g.cy === cy))?.at;
  }

  /* ------------------------------------------------------------ privado */

  /** O jogador desta tela, se ele está de pé numa rodada valendo. */
  private me(state: ArenaState, meId: string): PublicPlayer | null {
    if (meId !== this.meId) {
      this.meId = meId;
      this.reset();
    }
    if (state.phase !== "playing") return null;
    const me = state.players.find((p) => p.id === meId);
    return me && me.alive && !me.dying ? me : null;
  }

  private ensure(state: ArenaState, me: PublicPlayer): Walker {
    if (!this.walker) {
      this.walker = { x: me.x, y: me.y, dir: me.dir as Direction };
      this.prev = { x: me.x, y: me.y };
      this.passing = this.passersOf(state, me);
      this.pending = [];
    }
    return this.walker;
  }

  private passersOf(state: ArenaState, me: PublicPlayer): Set<number> {
    const out = new Set<number>();
    const bit = 1 << me.slot;
    for (const bomb of state.bombs) if (bomb.passers & bit) out.add(key(bomb.cx, bomb.cy));
    return out;
  }

  /** Um comando sobre o boneco: a bomba provisória entra no mundo, e o passo anda. Igual ao `drive` do motor. */
  private apply(walker: Walker, cmd: MoveCommand, state: ArenaState, me: PublicPlayer) {
    if (cmd.bomb) {
      const ghost = this.ghosts.find((g) => g.seq === cmd.seq);
      if (ghost) {
        // Na reaplicação a célula é a da posição recalculada: é onde o servidor vai pôr.
        ghost.cx = Math.floor(walker.x);
        ghost.cy = Math.floor(walker.y);
        this.passing.add(key(ghost.cx, ghost.cy));
      }
    }
    const { dx, dy } = cursedInput(me.curse, cmd.dx, cmd.dy, walker.dir);
    if (dx === 0 && dy === 0) return;
    const upTo = cmd.seq;
    const bombHere = (cx: number, cy: number) =>
      state.bombs.some((b) => b.cx === cx && b.cy === cy) ||
      this.ghosts.some((g) => g.seq <= upTo && g.cx === cx && g.cy === cy);
    moveOnRails(walker, dx, dy, commandDistance(me), (cx, cy) =>
      cellBlocked(state, cx, cy, bombHere, (bx, by) => this.passing.has(key(bx, by))),
    );
    // Saiu de cima de uma bomba: ela passa a fechar (o `leaveBombs` do motor).
    const cx = Math.floor(walker.x);
    const cy = Math.floor(walker.y);
    for (const k of this.passing) {
      const bx = k % 1024;
      const by = Math.floor(k / 1024);
      if ((bx !== cx || by !== cy) && !touches(walker, bx, by)) this.passing.delete(k);
    }
  }

  /** A tela mostra a bomba se o servidor deve aceitá-la: chão, sem bomba, e bomba na mão. */
  private canPlace(state: ArenaState, me: PublicPlayer, walker: Walker): boolean {
    const cx = Math.floor(walker.x);
    const cy = Math.floor(walker.y);
    if (state.grid[cellIndex(cx, cy, state.cols)] !== FLOOR) return false;
    if (state.bombs.some((b) => b.cx === cx && b.cy === cy)) return false;
    if (this.ghosts.some((g) => g.cx === cx && g.cy === cy)) return false;
    const mine = state.bombs.filter((b) => b.owner === me.id).length + this.ghosts.length;
    return mine < bombLimit(me.bombs, me.curse);
  }

  /** As provisórias até `ack` já foram decididas pelo servidor: saem (a de verdade, se houver, está no estado). */
  private settleGhosts(state: ArenaState, meId: string, ack: number, now: number) {
    this.confirmed = this.confirmed.filter((g) => now - g.at < 4000);
    const decided = this.ghosts.filter((g) => g.seq <= ack);
    if (decided.length === 0) return;
    this.ghosts = this.ghosts.filter((g) => g.seq > ack);
    for (const ghost of decided) {
      if (state.bombs.some((b) => b.owner === meId && b.cx === ghost.cx && b.cy === ghost.cy)) this.confirmed.push(ghost);
    }
  }
}

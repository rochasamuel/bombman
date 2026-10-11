import {
  FLOOR,
  cellIndex,
  moveOnRails,
  moveSpeed,
  touches,
  type ArenaState,
  type Direction,
  type PublicPlayer,
} from "@bomb/shared";

/*
 * A previsão do PRÓPRIO boneco, e do que ele faz na hora: andar, pôr bomba
 * e pegar item. Sem ela, tudo esperava a ida e a volta ao servidor.
 *
 * Andar: o boneco anda no quadro em que o dedo aperta, com a MESMA regra do
 * motor (`moveOnRails`), sobre a grade e as bombas que a tela conhece. A
 * tela guarda por onde ele passou; quando o servidor diz onde ele estava,
 * compara com onde a tela o tinha uma ida e volta atrás (`rtt`, medido) — o
 * mesmo instante, visto das duas pontas. Batendo, nada a fazer; diferindo
 * (um tijolo que caiu depois, uma bomba que a tela viu tarde), a diferença
 * entra aos poucos, em ~100 ms, em vez de puxar o boneco de volta de uma
 * vez. Só uma diferença grande (morreu, renasceu, uma bomba chutada lá
 * fechou o caminho) pula direto.
 *
 * Bomba: aparece na hora, na célula em que a tela mostra o boneco, e essa
 * célula vai para o servidor, que a aceita se o corpo dele ainda a toca lá
 * — a bomba cai onde foi vista, e quem a pôs passa por ela até sair de cima
 * (como no motor: `touches`). A bomba de mentira some quando a de verdade
 * chega, ou em meio segundo se o servidor recusou.
 *
 * Item: some na hora em que o boneco passa por cima; se o servidor não o
 * deu (outro chegou antes), ele volta em meio segundo.
 */

/** Mais longe que isso do servidor, em células, a previsão pula para ele. */
export const SNAP_CELLS = 1.5;
/** A diferença para o servidor cai pela metade a cada tanto, em ms. */
const CORRECT_MS = 60;
/** Diferenças menores que isso, em células, ficam como estão. */
const DEADZONE = 0.02;
/** A maior fatia de tempo de um passo, como no motor. */
const MAX_STEP_MS = 1000 / 60;
/** Quanto a tela guarda do caminho, em ms. */
const HISTORY_MS = 1500;
/** Quanto a bomba de mentira (ou o item sumido) espera o servidor confirmar, em ms. */
const PENDING_MS = 500;

export type Predicted = { x: number; y: number; dir: Direction; moving: boolean };
/** Uma bomba que a tela já mostra e o servidor ainda não mandou. */
export type GhostBomb = { cx: number; cy: number; at: number };

type Point = { t: number; x: number; y: number };

export class Predictor {
  private walker: { x: number; y: number; dir: Direction } | null = null;
  private history: Point[] = [];
  /** As bombas (por id) que o boneco ainda toca desde que elas nasceram: não o fecham. */
  private passers = new Set<string>();
  private known = new Set<string>();
  /** As bombas que a tela mostra antes do servidor, e os itens que ela já sumiu. */
  ghosts: GhostBomb[] = [];
  private taken = new Map<string, number>();
  /** A ida e volta ao servidor, em ms (suavizada). Zero sem servidor (o /mock). */
  rtt = 0;

  /** Esquece tudo: outra rodada, outra sala. */
  reset() {
    this.walker = null;
    this.history = [];
    this.passers.clear();
    this.known.clear();
    this.ghosts = [];
    this.taken.clear();
  }

  /** Uma medida nova da ida e volta: entra suavizada, para um pacote atrasado não sacudir a previsão. */
  measure(rtt: number) {
    this.rtt = this.rtt ? this.rtt * 0.8 + rtt * 0.2 : rtt;
  }

  /**
   * Avança a previsão `dt` ms com a direção do dedo (`dx`, `dy`) e devolve
   * onde desenhar o boneco; `null` quando não há o que prever (vale o servidor).
   */
  step(state: ArenaState, meId: string, dx: number, dy: number, dt: number, now: number): Predicted | null {
    const me = state.players.find((p) => p.id === meId);
    if (!me || state.phase !== "playing" || !me.alive || me.dying) {
      this.reset();
      return null;
    }
    if (!this.walker) {
      this.walker = { x: me.x, y: me.y, dir: me.dir };
      this.history = [];
    }
    const walker = this.walker;
    this.trackBombs(state, walker, now);

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const speed = moveSpeed(me.speed, me.curse);
      const blocked = (cx: number, cy: number) => this.blocked(state, cx, cy);
      for (let left = Math.min(dt, 250); left > 0; left -= MAX_STEP_MS) {
        const slice = Math.min(left, MAX_STEP_MS);
        moveOnRails(walker, dx, dy, (speed * slice) / 1000, blocked);
        this.trackBombs(state, walker, now);
      }
    } else if (!me.moving) {
      walker.dir = me.dir;
    }

    this.reconcile(me, dt, now);
    this.history.push({ t: now, x: walker.x, y: walker.y });
    while (this.history.length > 2 && this.history[0].t < now - HISTORY_MS) this.history.shift();
    this.forgetTaken(state, now);
    return { x: walker.x, y: walker.y, dir: walker.dir, moving };
  }

  /**
   * Compara o servidor com onde a tela tinha o boneco uma ida e volta atrás
   * (mais meio patch) e põe a diferença aos poucos — no boneco e no caminho
   * guardado, para não contar a mesma diferença duas vezes.
   */
  private reconcile(me: PublicPlayer, dt: number, now: number) {
    const walker = this.walker!;
    // Sem caminho guardado ainda (o primeiro quadro), não há com o que comparar.
    const then = this.at(now - this.rtt - 16);
    if (!then) return;
    const ex = me.x - then.x;
    const ey = me.y - then.y;
    const error = Math.hypot(ex, ey);
    if (error > SNAP_CELLS) {
      walker.x = me.x;
      walker.y = me.y;
      this.history = [];
      return;
    }
    if (error < DEADZONE) return;
    const k = 1 - Math.pow(0.5, dt / CORRECT_MS);
    const cx = ex * k;
    const cy = ey * k;
    walker.x += cx;
    walker.y += cy;
    for (const point of this.history) {
      point.x += cx;
      point.y += cy;
    }
  }

  /** Onde a tela tinha o boneco no instante `t` (entre duas anotações, a reta). */
  private at(t: number): { x: number; y: number } | null {
    const h = this.history;
    if (!h.length) return null;
    if (t <= h[0].t) return h[0];
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1];
      const b = h[i];
      if (t < a.t) continue;
      const k = Math.min(1, (t - a.t) / Math.max(1, b.t - a.t));
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    return h[h.length - 1];
  }

  /**
   * O dedo pediu bomba: se a tela mostra o boneco numa célula de chão sem
   * bomba, e ele ainda tem bomba na mão, ela aparece na hora. Devolve a
   * célula, para ir ao servidor; `null` se nada aparece (o pedido vai assim
   * mesmo, sem célula, e o servidor decide).
   */
  placeBomb(state: ArenaState, meId: string, now: number): { cx: number; cy: number } | null {
    const me = state.players.find((p) => p.id === meId);
    const walker = this.walker;
    if (!me || !walker || state.phase !== "playing" || !me.alive || me.dying) return null;
    const cx = Math.floor(walker.x);
    const cy = Math.floor(walker.y);
    if (state.grid[cellIndex(cx, cy, state.cols)] !== FLOOR) return null;
    if (state.bombs.some((b) => b.cx === cx && b.cy === cy) || this.ghosts.some((g) => g.cx === cx && g.cy === cy)) {
      return null;
    }
    const mine = state.bombs.filter((b) => b.owner === meId).length + this.ghosts.length;
    if (mine >= me.bombs) return null;
    this.ghosts.push({ cx, cy, at: now });
    return { cx, cy };
  }

  /** O item da célula já sumiu nesta tela? */
  isTaken(cx: number, cy: number): boolean {
    return this.taken.has(`${cx},${cy}`);
  }

  private blocked(state: ArenaState, cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= state.cols || cy >= state.rows) return true;
    if (state.grid[cellIndex(cx, cy, state.cols)] !== FLOOR) return true;
    const bomb = state.bombs.find((b) => b.cx === cx && b.cy === cy);
    if (bomb) return !this.passers.has(bomb.id);
    // A bomba de mentira fecha como a de verdade, menos para quem ainda a toca.
    const ghost = this.ghosts.find((g) => g.cx === cx && g.cy === cy);
    return !!ghost && !touches(this.walker!, cx, cy);
  }

  /**
   * As bombas que nascem tocando o boneco não o fecham até ele sair de cima
   * (a de mentira vale como a de verdade: a bomba que ele pôs e já deixou
   * para trás chega fechada). Também confere os itens e as bombas de mentira.
   */
  private trackBombs(state: ArenaState, walker: { x: number; y: number }, now: number) {
    const alive = new Set<string>();
    for (const bomb of state.bombs) {
      alive.add(bomb.id);
      const touching = touches(walker, bomb.cx, bomb.cy);
      if (!this.known.has(bomb.id)) {
        this.known.add(bomb.id);
        if (touching) this.passers.add(bomb.id);
        // A de verdade chegou: a de mentira da mesma célula sai.
        this.ghosts = this.ghosts.filter((g) => g.cx !== bomb.cx || g.cy !== bomb.cy);
      } else if (!touching) {
        this.passers.delete(bomb.id);
      }
    }
    for (const id of this.known) if (!alive.has(id)) this.known.delete(id);
    for (const id of this.passers) if (!alive.has(id)) this.passers.delete(id);
    this.ghosts = this.ghosts.filter((g) => now - g.at < PENDING_MS);

    const cx = Math.floor(walker.x);
    const cy = Math.floor(walker.y);
    if (state.powerups.some((p) => p.cx === cx && p.cy === cy) && !this.taken.has(`${cx},${cy}`)) {
      this.taken.set(`${cx},${cy}`, now);
    }
  }

  /** O item que o servidor confirmou (sumiu lá) ou negou (passou o tempo) sai da lista. */
  private forgetTaken(state: ArenaState, now: number) {
    for (const [key, at] of this.taken) {
      const [cx, cy] = key.split(",").map(Number);
      const still = state.powerups.some((p) => p.cx === cx && p.cy === cy);
      if (!still || now - at > PENDING_MS) this.taken.delete(key);
    }
  }
}

/** O jogador como a tela deve desenhá-lo: o previsto, se houver, por cima do que o servidor disse. */
export function withPrediction(player: PublicPlayer, predicted: Predicted | null): PublicPlayer {
  if (!predicted) return player;
  return { ...player, x: predicted.x, y: predicted.y, dir: predicted.dir, moving: predicted.moving };
}

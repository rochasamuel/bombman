import {
  FLOOR,
  cellIndex,
  moveOnRails,
  moveSpeed,
  type ArenaState,
  type Direction,
  type PublicPlayer,
} from "@bomb/shared";

/*
 * A previsão do PRÓPRIO boneco. Sem ela, o boneco só andava quando o
 * servidor respondia: a ida da tecla, o tick, o patch (até 50 ms), a volta,
 * e mais o atraso fixo da interpolação — dava para sentir. Com ela, o boneco
 * anda no quadro em que o dedo aperta, com a MESMA regra do motor
 * (`moveOnRails`), sobre a grade e as bombas que a tela conhece.
 *
 * O servidor continua mandando. Como as duas pontas rodam a mesma regra com
 * a mesma tecla, o boneco previsto e o do servidor terminam no mesmo lugar;
 * só o tempo é outro (a tela começa e para de andar uma meia ida e volta
 * antes). Então:
 *  - parado aqui e parado lá, a previsão escorrega até a posição do servidor
 *    (o resto de diferença de um tick, um tijolo que caiu depois);
 *  - longe demais (morreu, renasceu, uma bomba chutada fechou o caminho lá),
 *    a previsão pula para o servidor;
 *  - fora da rodada, morto ou morrendo, não há previsão: vale o servidor.
 *
 * A bomba em que o boneco está em cima não o fecha até ele sair da célula,
 * como no motor (`passers`): a tela anota as bombas que viu nascer debaixo
 * dele e as esquece quando ele sai.
 */

/** Mais longe que isso do servidor, em células, a previsão pula para ele. */
export const SNAP_CELLS = 1.5;
/** Parado, a diferença cai pela metade a cada tanto, em ms. */
const SETTLE_MS = 60;
/** A maior fatia de tempo de um passo, como no motor. */
const MAX_STEP_MS = 1000 / 60;

export type Predicted = { x: number; y: number; dir: Direction; moving: boolean };

export class Predictor {
  private walker: { x: number; y: number; dir: Direction } | null = null;
  /** As bombas (por id) em cima das quais o boneco estava quando elas apareceram. */
  private passers = new Set<string>();
  private known = new Set<string>();

  /** Esquece tudo: outra rodada, outra sala. */
  reset() {
    this.walker = null;
    this.passers.clear();
    this.known.clear();
  }

  /**
   * Avança a previsão `dt` ms com a direção do dedo (`dx`, `dy`) e devolve
   * onde desenhar o boneco; `null` quando não há o que prever (vale o servidor).
   */
  step(state: ArenaState, meId: string, dx: number, dy: number, dt: number): Predicted | null {
    const me = state.players.find((p) => p.id === meId);
    if (!me || state.phase !== "playing" || !me.alive || me.dying) {
      this.reset();
      return null;
    }
    if (!this.walker || Math.hypot(this.walker.x - me.x, this.walker.y - me.y) > SNAP_CELLS) {
      this.walker = { x: me.x, y: me.y, dir: me.dir };
    }
    const walker = this.walker;
    this.trackBombs(state, walker);

    const moving = dx !== 0 || dy !== 0;
    if (moving) {
      const speed = moveSpeed(me.speed, me.curse);
      const blocked = (cx: number, cy: number) => this.blocked(state, cx, cy);
      for (let left = Math.min(dt, 250); left > 0; left -= MAX_STEP_MS) {
        const slice = Math.min(left, MAX_STEP_MS);
        moveOnRails(walker, dx, dy, (speed * slice) / 1000, blocked);
        this.trackBombs(state, walker);
      }
    } else if (!me.moving) {
      // Parado aqui e lá: escorrega até o servidor.
      const k = 1 - Math.pow(0.5, dt / SETTLE_MS);
      walker.x += (me.x - walker.x) * k;
      walker.y += (me.y - walker.y) * k;
      walker.dir = me.dir;
    }
    return { x: walker.x, y: walker.y, dir: walker.dir, moving };
  }

  private blocked(state: ArenaState, cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= state.cols || cy >= state.rows) return true;
    if (state.grid[cellIndex(cx, cy, state.cols)] !== FLOOR) return true;
    const bomb = state.bombs.find((b) => b.cx === cx && b.cy === cy);
    return !!bomb && !this.passers.has(bomb.id);
  }

  /** A bomba que nasce debaixo do boneco não o fecha até ele sair da célula dela. */
  private trackBombs(state: ArenaState, walker: { x: number; y: number }) {
    const cx = Math.floor(walker.x);
    const cy = Math.floor(walker.y);
    const alive = new Set<string>();
    for (const bomb of state.bombs) {
      alive.add(bomb.id);
      const under = bomb.cx === cx && bomb.cy === cy;
      if (!this.known.has(bomb.id)) {
        this.known.add(bomb.id);
        if (under) this.passers.add(bomb.id);
      } else if (!under) {
        this.passers.delete(bomb.id);
      }
    }
    for (const id of this.known) if (!alive.has(id)) this.known.delete(id);
    for (const id of this.passers) if (!alive.has(id)) this.passers.delete(id);
  }
}

/** O jogador como a tela deve desenhá-lo: o previsto, se houver, por cima do que o servidor disse. */
export function withPrediction(player: PublicPlayer, predicted: Predicted | null): PublicPlayer {
  if (!predicted) return player;
  return { ...player, x: predicted.x, y: predicted.y, dir: predicted.dir, moving: predicted.moving };
}

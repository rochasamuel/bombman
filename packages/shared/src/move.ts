import { BASE_SPEED, DOWN, LEFT, RIGHT, SPEED_STEP, UP, type Curse, type Direction } from "./contract.js";

/*
 * O andar em trilhos, sem nada em volta: só a posição, a direção do dedo, a
 * distância do passo e uma pergunta — "esta célula está fechada para mim?".
 * O motor (`BombGame`) anda com isto; a tela não prevê nada, desenha só o
 * que o servidor confirmou.
 *
 * O personagem só anda na horizontal centrado na linha, e vice-versa. Fora
 * do centro, o passo vira um deslize até o corredor mais perto que esteja
 * aberto; parado contra a parede, o corte de quina o escorrega para a
 * diagonal aberta. Com as duas setas apertadas, a vertical vence.
 */

/** Metade da largura do personagem para o teste de parede. */
export const HALF = 0.5 - 1e-6;
/** Até onde da linha do corredor o corte de quina ainda puxa. */
export const CORNER_REACH = 0.8;

/** A célula está fechada para quem anda? (fora da arena também é fechada) */
export type Blocked = (cx: number, cy: number) => boolean;

/** Quem anda: a posição (o centro, em células) e para onde olha. Muda no lugar. */
export type Walker = { x: number; y: number; dir: Direction };

/** A velocidade em células por segundo: a base, cada bota, e a maldição do lento. */
export function moveSpeed(level: number, curse: Curse | "" = ""): number {
  if (curse === "slow") return BASE_SPEED * 0.55;
  return BASE_SPEED + level * SPEED_STEP;
}

/**
 * Anda `dist` células na direção (`dx`, `dy`). Devolve a célula em que
 * esbarrou parado contra ela (para o chute), ou `null`.
 */
export function moveOnRails(
  walker: Walker,
  dx: number,
  dy: number,
  dist: number,
  blocked: Blocked,
): { bumped: { cx: number; cy: number; dx: number; dy: number } | null } {
  const out = { bumped: null as { cx: number; cy: number; dx: number; dy: number } | null };
  if (dy !== 0) {
    walker.dir = dy > 0 ? DOWN : UP;
    if (!walk(walker, 0, dy, dist, blocked, out) && dx !== 0) {
      walker.dir = dx > 0 ? RIGHT : LEFT;
      walk(walker, dx, 0, dist, blocked, out);
    }
  } else if (dx !== 0) {
    walker.dir = dx > 0 ? RIGHT : LEFT;
    walk(walker, dx, 0, dist, blocked, out);
  }
  return out;
}

/** Um passo num eixo. Devolve se o personagem saiu do lugar. */
function walk(
  walker: Walker,
  dx: number,
  dy: number,
  dist: number,
  blocked: Blocked,
  out: { bumped: { cx: number; cy: number; dx: number; dy: number } | null },
): boolean {
  const axis = dx !== 0 ? "x" : "y";
  const cross = axis === "x" ? "y" : "x";
  const pos = walker[axis];
  const off = walker[cross];
  const lane = Math.floor(off) + 0.5;

  if (Math.abs(off - lane) > 1e-4) return slide(walker, axis, cross, dx || dy, lane, dist, blocked);

  const cell = Math.floor(pos);
  const step = dx || dy;
  const ahead = cell + step;
  const crossCell = Math.floor(off);
  const [bx, by] = axis === "x" ? [ahead, crossCell] : [crossCell, ahead];
  const target = pos + step * dist;
  const edge = step > 0 ? cell + 1 - HALF : cell + HALF;
  if (blocked(bx, by) && (step > 0 ? target > edge : target < edge)) {
    const moved = Math.abs(edge - pos) > 1e-6;
    walker[axis] = edge;
    out.bumped = { cx: bx, cy: by, dx, dy };
    if (!moved) return cutCorner(walker, axis, cross, step, dist, blocked);
    return true;
  }
  walker[axis] = target;
  return true;
}

/** Desliza até o corredor: o mais perto primeiro; fechado, o do outro lado, se o personagem já o alcança. */
function slide(
  walker: Walker,
  axis: "x" | "y",
  cross: "x" | "y",
  step: number,
  lane: number,
  dist: number,
  blocked: Blocked,
): boolean {
  const off = walker[cross];
  const cell = Math.floor(walker[axis]);
  const other = off > lane ? lane + 1 : lane - 1;
  for (const candidate of [lane, other]) {
    if (Math.abs(candidate - off) > CORNER_REACH) continue;
    const laneCell = Math.floor(candidate);
    const open = axis === "x" ? !blocked(cell + step, laneCell) : !blocked(laneCell, cell + step);
    if (!open) continue;
    const delta = Math.sign(candidate - off) * Math.min(dist, Math.abs(candidate - off));
    walker[cross] = off + delta;
    return true;
  }
  return false;
}

/** Parado contra a parede, centrado: se a diagonal está aberta, escorrega para o lado (virar a esquina sem parar). */
function cutCorner(
  walker: Walker,
  axis: "x" | "y",
  cross: "x" | "y",
  step: number,
  dist: number,
  blocked: Blocked,
): boolean {
  const cell = Math.floor(walker[axis]);
  const crossCell = Math.floor(walker[cross]);
  for (const side of [-1, 1]) {
    const open =
      axis === "x"
        ? !blocked(cell + step, crossCell + side) && !blocked(cell, crossCell + side)
        : !blocked(crossCell + side, cell + step) && !blocked(crossCell + side, cell);
    if (!open) continue;
    walker[cross] += side * dist;
    return true;
  }
  return false;
}

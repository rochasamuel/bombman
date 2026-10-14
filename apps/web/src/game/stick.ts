import type { Dir } from "./useInput";

/*
 * O joystick na tela é analógico, mas a arena só anda em quatro direções:
 * o vetor do polegar vira UMA seta. Perto da diagonal o eixo dominante
 * oscila a cada pixel, e o boneco tremeria entre "cima" e "direita"; por
 * isso o eixo que já vale tem vantagem (`STICKY`) — o outro só ganha quando
 * passa dele com folga. Dentro da zona morta, nada: o dedo que só pousou no
 * centro não anda.
 */

/** Raio da zona morta, em pixels CSS. */
export const DEAD_ZONE = 12;
/** Quanto o eixo atual pesa a mais na disputa com o outro. */
export const STICKY = 1.35;

export function stickDir(dx: number, dy: number, current: Dir | null): Dir | null {
  if (Math.hypot(dx, dy) < DEAD_ZONE) return null;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  let horizontal = ax > ay;
  if (current === "left" || current === "right") horizontal = ax * STICKY >= ay;
  else if (current === "up" || current === "down") horizontal = ax > ay * STICKY;
  if (horizontal) return dx < 0 ? "left" : "right";
  return dy < 0 ? "up" : "down";
}

/** O botão do joystick acompanha o dedo, mas não sai da base: o vetor preso ao raio. */
export function clampToRadius(dx: number, dy: number, radius: number): [number, number] {
  const length = Math.hypot(dx, dy);
  if (length <= radius) return [dx, dy];
  return [(dx / length) * radius, (dy / length) * radius];
}

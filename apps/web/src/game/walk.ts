/** Uma volta completa da caminhada cobre dois blocos, tenha ela 4 ou 17 quadros. */
export const WALK_CYCLE_PX = 32;

/**
 * O quadro da caminhada: 0 é o parado; andando, começa no 1 e dá a volta por
 * todos os `steps` (o 0 entra na volta, como passo de pernas juntas). O passo
 * segue a distância andada na tela, não o relógio: o pé não desliza.
 */
export function walkStep(stridePx: number, steps: number, walking: boolean): number {
  if (!walking) return 0;
  const perFrame = WALK_CYCLE_PX / steps;
  return (1 + Math.floor(stridePx / perFrame)) % steps;
}

/** Quanto dura cada quadro do parado (a respiração segue o relógio, não a distância). */
export const IDLE_FRAME_MS = 90;

/** O quadro do parado: dá a volta por todos os `steps` ao ritmo de IDLE_FRAME_MS. */
export function idleStep(now: number, steps: number): number {
  return Math.floor(now / IDLE_FRAME_MS) % steps;
}

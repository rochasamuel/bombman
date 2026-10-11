import { BOMB_FUSE, FLAME_TIME } from "@bomb/shared";
import { BOMB_STEPS, FLAME_STEPS, POWERUP_STEPS, type BombPhase } from "../art/atlas";

/*
 * O relógio da bomba, da chama e do item. As folhas foram desenhadas a 16
 * quadros por segundo; o servidor só diz ONDE a bomba e a chama estão, então
 * a tela conta a idade de cada uma desde que a viu pela primeira vez e
 * escolhe o quadro por ela.
 */

/** Um quadro das folhas: 16 por segundo. */
export const FX_FRAME_MS = 1000 / 16;
/** O pulso: os oito quadros, uma vez, logo antes do estouro. */
export const BOMB_PULSE_MS = BOMB_STEPS.pulse * FX_FRAME_MS;
/** O estouro: os dois quadros finais, e a explosão assume. */
export const BOMB_BOOM_MS = BOMB_STEPS.boom * FX_FRAME_MS;

/**
 * O quadro da bomba pela idade dela: o pavio dá voltas até faltar pulso e
 * estouro para o fim do fuso; o pulso toca uma vez; o estouro fecha. Se o
 * servidor demorar a explodir, ela segura o último quadro do estouro.
 */
export function bombFrame(ageMs: number): { phase: BombPhase; step: number } {
  const pulseAt = BOMB_FUSE - BOMB_BOOM_MS - BOMB_PULSE_MS;
  const boomAt = BOMB_FUSE - BOMB_BOOM_MS;
  if (ageMs >= boomAt) return { phase: "boom", step: clampStep((ageMs - boomAt) / FX_FRAME_MS, BOMB_STEPS.boom) };
  if (ageMs >= pulseAt) return { phase: "pulse", step: clampStep((ageMs - pulseAt) / FX_FRAME_MS, BOMB_STEPS.pulse) };
  return { phase: "fuse", step: Math.floor(Math.max(0, ageMs) / FX_FRAME_MS) % BOMB_STEPS.fuse };
}

/** O quadro da chama: os oito espalhados pela vida dela, parando no último. */
export function flameStep(ageMs: number): number {
  return clampStep(ageMs / (FLAME_TIME / FLAME_STEPS), FLAME_STEPS);
}

/** O quadro do item: o brilho dá a volta a 16 fps, no relógio da tela. */
export function itemStep(now: number): number {
  return Math.floor(now / FX_FRAME_MS) % POWERUP_STEPS;
}

const clampStep = (step: number, steps: number) => Math.min(steps - 1, Math.max(0, Math.floor(step)));

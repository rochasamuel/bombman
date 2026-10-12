/*
 * A interpolação de posição dos OUTROS bonecos (o próprio é previsto, ver
 * `predict.ts`). O servidor manda a posição de cada jogador a ~30 Hz; entre
 * um patch e outro a tela precisa de um lugar para desenhar o boneco. Em vez
 * de perseguir a última posição (que chega e espera, dando um tranco a cada
 * patch), a tela guarda as últimas amostras com a hora delas e desenha o
 * boneco onde ele estava há um atraso, em linha reta entre a amostra anterior
 * e a seguinte. Na sala, a hora é a do SERVIDOR (o passo do motor, ver
 * `netclock.ts`); no `/mock`, sem servidor, é a da chegada. Nada aqui conhece
 * canvas: é só aritmética, e por isso tem teste.
 */

export type Sample = { t: number; x: number; y: number };

/** O atraso fixo do `/mock`, que não tem relógio de servidor (na sala ele se ajusta, ver `netclock.ts`). */
export const DELAY_MS = 70;
/** Quantas amostras guardar; sobra para um patch atrasado. */
export const SAMPLES = 8;
/** Um salto maior que isso, em células, é renascimento: não se interpola. */
export const JUMP_CELLS = 2;
/**
 * Uma amostra que chega depois de tanto tempo parado (ms) não é interpolada
 * desde a anterior — o boneco não ficou andando devagar o tempo todo, ele
 * estava parado e saiu agora. Antes dela entra uma cópia da anterior, um
 * pouco antes (`RESUME_MS`).
 */
export const HOLD_GAP_MS = 100;
export const RESUME_MS = 50;

/**
 * Registra a posição que acabou de chegar, se mudou. Um salto grande apaga o
 * histórico: o boneco aparece no lugar, sem percurso pela arena.
 */
export function record(samples: Sample[], t: number, x: number, y: number): void {
  const last = samples[samples.length - 1];
  if (last && last.x === x && last.y === y) return;
  if (last && t < last.t) {
    // Uma amostra mais velha que a última (outra linha do tempo): começa de novo.
    samples.length = 0;
  } else if (last && (Math.abs(x - last.x) > JUMP_CELLS || Math.abs(y - last.y) > JUMP_CELLS)) {
    samples.length = 0;
  } else if (last && t - last.t > HOLD_GAP_MS) {
    samples.push({ t: t - RESUME_MS, x: last.x, y: last.y });
  }
  samples.push({ t, x, y });
  while (samples.length > SAMPLES) samples.shift();
}

/**
 * Onde o boneco estava no instante `at`. Antes da primeira amostra é a
 * primeira; depois da última é a última (parado); entre duas, a reta.
 */
export function sampleAt(samples: Sample[], at: number): { x: number; y: number } {
  const last = samples[samples.length - 1];
  if (!last) return { x: 0, y: 0 };
  if (at >= last.t) return { x: last.x, y: last.y };
  for (let i = samples.length - 1; i > 0; i--) {
    const b = samples[i];
    const a = samples[i - 1];
    if (at < a.t) continue;
    const k = (at - a.t) / Math.max(1, b.t - a.t);
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
  }
  const first = samples[0];
  return { x: first.x, y: first.y };
}

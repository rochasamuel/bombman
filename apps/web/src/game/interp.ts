/*
 * A interpolação de posição. O servidor manda a posição de cada jogador a
 * ~30 Hz; entre um patch e outro a tela precisa de um lugar para desenhar o
 * boneco. Em vez de perseguir a última posição (que chega e espera, dando um
 * tranco a cada patch), a tela guarda as últimas amostras com a hora em que
 * chegaram e desenha o boneco onde ele estava há um atraso fixo, em linha
 * reta entre a amostra anterior e a seguinte. Nada aqui conhece canvas: é só
 * aritmética, e por isso tem teste.
 */

export type Sample = { t: number; x: number; y: number };

/**
 * Dois patches de atraso (a ~30 Hz): sempre há uma amostra à frente para
 * interpolar. Vale para todos os bonecos, o próprio inclusive (não há
 * previsão: a tela desenha só o que o servidor confirmou), e as bombas chutadas.
 */
export const DELAY_MS = 70;
/** Quantas amostras guardar; sobra para um patch atrasado. */
export const SAMPLES = 8;
/** Um salto maior que isso, em células, é renascimento: não se interpola. */
export const JUMP_CELLS = 2;

/**
 * Registra a posição que acabou de chegar, se mudou. Um salto grande apaga o
 * histórico: o boneco aparece no lugar, sem percurso pela arena.
 */
export function record(samples: Sample[], t: number, x: number, y: number): void {
  const last = samples[samples.length - 1];
  if (last && last.x === x && last.y === y) return;
  if (last && (Math.abs(x - last.x) > JUMP_CELLS || Math.abs(y - last.y) > JUMP_CELLS)) {
    samples.length = 0;
  }
  samples.push({ t, x, y });
  if (samples.length > SAMPLES) samples.shift();
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

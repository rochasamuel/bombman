import { DEFAULT_CLOCK, type ClockConfig } from "./netclock";
import { DEFAULT_PREDICT, type PredictConfig } from "./predict";

/*
 * Os botões de rede da tela. Cada um tem padrão e faixa; vem, em ordem de
 * força, da URL (`?interp=80`, para testar no campo sem build novo), do
 * `localStorage` (`bomb.net.interp`) e das variáveis do build (`VITE_INTERP_MS`).
 * Um valor fora da faixa é ignorado.
 *
 *   interp    atraso fixo da interpolação dos outros, ms (0 = adaptativo)   VITE_INTERP_MS
 *   interpMin menor atraso adaptativo, ms                                    VITE_INTERP_MIN_MS
 *   interpMax maior atraso adaptativo, ms                                    VITE_INTERP_MAX_MS
 *   correct   meia-vida da correção visual do próprio boneco, ms             VITE_CORRECTION_MS
 *   pending   comandos não confirmados guardados                             VITE_MAX_PENDING
 *   catchup   passos fixos recuperados num quadro lento                      VITE_MAX_CATCHUP
 *   net       1 mostra o diagnóstico ao abrir (' alterna sempre)             VITE_NET_DIAG
 */

export type ClientNetConfig = {
  clock: ClockConfig;
  predict: PredictConfig;
  /** Quantos passos fixos um quadro pode rodar: depois de um engasgo da aba, o resto é perdido. */
  maxCatchUp: number;
  /** O diagnóstico começa aberto. */
  diag: boolean;
};

type Source = (name: string, envName: string) => string | undefined | null;

export function readClientConfig(source: Source): ClientNetConfig {
  const num = (name: string, envName: string, fallback: number, min: number, max: number) => {
    const raw = source(name, envName);
    if (raw === undefined || raw === null || raw === "") return fallback;
    const value = Number(raw);
    return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
  };
  const interpMin = num("interpMin", "VITE_INTERP_MIN_MS", DEFAULT_CLOCK.minDelay, 0, 500);
  return {
    clock: {
      fixedDelay: num("interp", "VITE_INTERP_MS", DEFAULT_CLOCK.fixedDelay, 0, 500),
      minDelay: interpMin,
      maxDelay: Math.max(interpMin, num("interpMax", "VITE_INTERP_MAX_MS", DEFAULT_CLOCK.maxDelay, 0, 1000)),
    },
    predict: {
      ...DEFAULT_PREDICT,
      correctionHalfLifeMs: num("correct", "VITE_CORRECTION_MS", DEFAULT_PREDICT.correctionHalfLifeMs, 1, 1000),
      maxPending: Math.round(num("pending", "VITE_MAX_PENDING", DEFAULT_PREDICT.maxPending, 10, 1200)),
    },
    maxCatchUp: Math.round(num("catchup", "VITE_MAX_CATCHUP", 8, 1, 60)),
    diag: source("net", "VITE_NET_DIAG") === "1",
  };
}

/** A configuração do navegador: URL, depois `localStorage`, depois o build. */
export function browserConfig(): ClientNetConfig {
  const params = typeof location === "undefined" ? null : new URLSearchParams(location.search);
  const env = import.meta.env as Record<string, string | undefined>;
  return readClientConfig((name, envName) => {
    const fromUrl = params?.get(name);
    if (fromUrl !== null && fromUrl !== undefined) return fromUrl;
    try {
      const stored = localStorage.getItem(`bomb.net.${name}`);
      if (stored !== null) return stored;
    } catch {
      // sem localStorage (aba privada, prévia): segue para o build
    }
    return env[envName];
  });
}

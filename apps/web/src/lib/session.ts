/**
 * Just enough in localStorage to get back into a room after a refresh — e para
 * a próxima arena nascer parecida com a última. O estado do jogo nunca entra
 * aqui: ele é do servidor.
 */

import {
  DEFAULT_ARENA,
  DEFAULT_MATCH_MINUTES,
  DEFAULT_MAX_PLAYERS,
  DEFAULT_THEME,
  MAX_PLAYERS,
  MIN_PLAYERS,
  arenaById,
  isMatchMinutes,
  themeById,
} from "@bomb/shared";

export type StoredSession = {
  reconnectionToken: string;
  playerName: string;
  /**
   * A chave da cadeira nesta arena. Ao contrário do `reconnectionToken`, que
   * o servidor troca a cada reconexão, esta não muda nunca — é ela que devolve
   * o lugar a quem voltou com o token velho na mão.
   */
  seatKey: string;
};

export type StoredSetup = {
  roomName: string;
  maxPlayers: number;
  /** A última arena escolhida: a próxima sala abre com ela. */
  arenaId: string;
  /** O último tempo de rodada escolhido, em minutos. */
  minutes: number;
  /** O último tema escolhido. */
  themeId: string;
};

const sessionKey = (code: string) => `bomb:session:${code}`;
const NAME_KEY = "bomb:name";
const SETUP_KEY = "bomb:setup";
const PREFS_KEY = "bomb:prefs";

export function loadSession(code: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(sessionKey(code));
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(code: string, session: StoredSession) {
  localStorage.setItem(sessionKey(code), JSON.stringify(session));
  localStorage.setItem(NAME_KEY, session.playerName);
}

export function clearSession(code: string) {
  localStorage.removeItem(sessionKey(code));
}

export const loadPlayerName = () => localStorage.getItem(NAME_KEY) ?? "";

export function seatKeyFor(code: string): string {
  const saved = loadSession(code)?.seatKey;
  return saved || newSeatKey();
}

export const newSeatKey = () =>
  typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;

export function saveSetup(setup: StoredSetup) {
  localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
}

export function loadSetup(): StoredSetup {
  const fallback: StoredSetup = {
    roomName: "Arena do jardim",
    maxPlayers: DEFAULT_MAX_PLAYERS,
    arenaId: DEFAULT_ARENA.id,
    minutes: DEFAULT_MATCH_MINUTES,
    themeId: DEFAULT_THEME.id,
  };
  const stored = readObject<StoredSetup>(SETUP_KEY);
  if (!stored) return fallback;
  const seats = Number(stored.maxPlayers);
  return {
    roomName:
      typeof stored.roomName === "string" && stored.roomName.trim()
        ? stored.roomName
        : fallback.roomName,
    maxPlayers:
      seats >= MIN_PLAYERS && seats <= MAX_PLAYERS ? Math.round(seats) : fallback.maxPlayers,
    arenaId: arenaById(stored.arenaId)?.id ?? fallback.arenaId,
    minutes: isMatchMinutes(stored.minutes) ? stored.minutes : fallback.minutes,
    themeId: themeById(stored.themeId)?.id ?? fallback.themeId,
  };
}

/** Como a pessoa quer VER a arena. Fica aqui pelo mesmo motivo que o nome. */
export type StoredPrefs = {
  lowMotion: boolean;
  /** O direcional na tela. `auto` é "onde o ponteiro é dedo". */
  touchPad: "auto" | "on" | "off";
};

export function savePrefs(prefs: StoredPrefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export function loadPrefs(): StoredPrefs {
  const fallback: StoredPrefs = { lowMotion: false, touchPad: "auto" };
  const stored = readObject<StoredPrefs>(PREFS_KEY);
  if (!stored) return fallback;
  return {
    lowMotion: stored.lowMotion === true,
    touchPad: stored.touchPad === "on" || stored.touchPad === "off" ? stored.touchPad : "auto",
  };
}

/**
 * O objeto guardado nesta chave, ou `null` quando não há um que se leia: chave
 * vazia, JSON quebrado ou um valor que não é objeto. Quem chama confere campo
 * a campo — aqui só se garante que há campos para conferir.
 */
function readObject<T>(key: string): Partial<T> | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "");
    return value && typeof value === "object" ? (value as Partial<T>) : null;
  } catch {
    return null;
  }
}

import type { ArenaSize } from "./arena.js";

/*
 * O contrato entre o servidor e a tela. Aqui só mora o que os dois lados
 * precisam concordar: o tamanho da arena, o formato do estado público, os
 * nomes das mensagens e as constantes que a tela usa para desenhar o que o
 * servidor decidiu.
 *
 * A REGRA mora ao lado, em `game.ts` (`BombGame`). Quem valida é sempre o
 * servidor; a tela só manda a direção do dedo e desenha o que recebe.
 */

/* ------------------------------------------------------------------- arena */

/** O lado de uma célula em pixels da arte. A tela multiplica por uma escala inteira. */
export const TILE = 16;

/** O que pode haver numa célula. A muralha e o pilar são ambos `WALL`: o que os
 * distingue é só a posição (a borda é muralha), e isso a tela deduz sozinha. */
export const FLOOR = 0;
export const WALL = 1;
export const BRICK = 2;
export const BUSH = 3;
export type Cell = typeof FLOOR | typeof WALL | typeof BRICK | typeof BUSH;

export const isSoft = (cell: number) => cell === BRICK || cell === BUSH;
export const isSolid = (cell: number) => cell !== FLOOR;

/** A célula na grade, que é uma lista só: `cols` é a largura da arena. */
export const cellIndex = (cx: number, cy: number, cols: number) => cy * cols + cx;

/* ---------------------------------------------------------------- a partida */

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const DEFAULT_MAX_PLAYERS = 4;

/** Vidas de cada um por rodada. Os três corações do painel. */
export const LIVES = 3;

/** Os tempos de rodada que o host pode escolher, em minutos. */
export const MATCH_MINUTES = [3, 5, 7, 10] as const;
export type MatchMinutes = (typeof MATCH_MINUTES)[number];
export const isMatchMinutes = (value: unknown): value is MatchMinutes =>
  MATCH_MINUTES.includes(value as MatchMinutes);
/** O tempo com que uma sala nasce: a arena padrão é a grande, e nela 3 é pouco. */
export const DEFAULT_MATCH_MINUTES: MatchMinutes = 5;
/** O menor tempo que cabe num tamanho de arena: a grande leva mais tempo para percorrer. */
export const minMinutesFor = (size: ArenaSize): MatchMinutes => (size === "large" ? 5 : 3);
/** Quanto dura uma rodada no tempo padrão, em ms. O relógio do painel conta daqui para baixo. */
export const MATCH_TIME = DEFAULT_MATCH_MINUTES * 60_000;

/** Os três segundos de "3, 2, 1" entre o host apertar e a arena abrir. */
export const COUNTDOWN = 3000;

/** O pavio: quanto a bomba espera antes de explodir, em ms. */
export const BOMB_FUSE = 2500;

/** Quanto tempo a chama fica na célula, em ms. */
export const FLAME_TIME = 550;

/** A morte: quanto dura a animação antes de o lugar ficar vazio. */
export const DEATH_TIME = 1000;

/** Quanto depois da morte o jogador renasce no canto dele. */
export const RESPAWN_TIME = 1800;

/** Quanto tempo quem renasceu fica intocável, em ms. */
export const INVULNERABLE_TIME = 3000;

/** Quanto tempo a maldição da caveira dura. */
export const CURSE_TIME = 15_000;

/** Velocidade base e o quanto cada bota acrescenta, em células por segundo. */
export const BASE_SPEED = 3.6;
export const SPEED_STEP = 0.6;
export const MAX_SPEED_LEVEL = 4;
export const MAX_RANGE = 8;
export const MAX_BOMBS = 8;

export type GamePhase = "lobby" | "countdown" | "playing" | "finished";

/** Para onde o personagem olha. Os números são os da arte. */
export const DOWN = 0;
export const LEFT = 1;
export const RIGHT = 2;
export const UP = 3;
export type Direction = typeof DOWN | typeof LEFT | typeof RIGHT | typeof UP;

/* ---------------------------------------------------------------- itens */

export const POWERUPS = ["fire", "bomb", "boot", "kick", "pierce", "skull"] as const;
export type Powerup = (typeof POWERUPS)[number];

export const POWERUP_NAME: Record<Powerup, string> = {
  fire: "fogo",
  bomb: "bomba",
  boot: "bota",
  kick: "chute",
  pierce: "perfurante",
  skull: "caveira",
};

/** A bomba chutada desliza a tantas células por segundo, até a última livre antes de um bloco, bomba ou jogador. */
export const KICK_SPEED = 6;

/** As maldições da caveira. Uma sorteada por caveira, pelo tempo de `CURSE_TIME`. */
export const CURSES = ["slow", "weak", "diarrhea"] as const;
export type Curse = (typeof CURSES)[number];

export const CURSE_NAME: Record<Curse, string> = {
  slow: "lento",
  weak: "fogo fraco",
  diarrhea: "bombas sem parar",
};

/* ------------------------------------------------------------ jogadores */

/** As quatro cores, na ordem dos cantos: P1 vermelho, P2 azul, P3 verde, P4 amarelo. */
export const SLOT_NAMES = ["Vermelho", "Azul", "Verde", "Amarelo"] as const;
export const SLOT_COLORS = ["#e8232a", "#2f6fd6", "#3bb24a", "#f0a020"] as const;

/* ------------------------------------------------------------ conversa */

export const EMOTES = ["😂", "😱", "😡", "😭", "👏", "👍", "👎", "🤔", "😎", "🙏"] as const;
export type Emote = (typeof EMOTES)[number];
export const isEmote = (value: unknown): value is Emote => EMOTES.includes(value as Emote);
export const EMOTE_COOLDOWN = 1500;
export const EMOTE_LINGER = 3000;

/* ------------------------------------------------------------ conexão */

/** Quanto tempo a cadeira fica guardada para quem caiu, em ms. */
export const RECONNECT_TIMEOUT = 60;
export const LOBBY_RECONNECT_TIMEOUT = 300;

/* ------------------------------------------------------------ protocolo */

export type PublicPlayer = {
  id: string;
  name: string;
  /** A cor e o canto: 0..3. */
  slot: number;
  connected: boolean;
  /** Posição do CENTRO do personagem, em células (3.5 é o meio da célula 3). */
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  /** De pé na arena. Falso durante a morte, o renascimento e depois de sair. */
  alive: boolean;
  /** A animação de morte está rolando. */
  dying: boolean;
  lives: number;
  range: number;
  bombs: number;
  speed: number;
  /** Tem a bota de chute: empurra a bomba em que esbarra. */
  kick: boolean;
  /** Tem a perfurante: a explosão das bombas dele atravessa tijolos e bombas. */
  pierce: boolean;
  invulnerable: boolean;
  curse: Curse | "";
  /** Rodadas vencidas nesta sala. */
  wins: number;
};

export type PublicBomb = {
  id: string;
  /** A célula em que está: o piso de `x` e `y`. */
  cx: number;
  cy: number;
  /** O centro, em células: fracionário enquanto desliza chutada. */
  x: number;
  y: number;
  owner: string;
  pierce: boolean;
};

/** O pedaço de chama: o centro, o meio de um braço, ou a ponta dele. */
export const FLAME_CENTER = 0;
export const FLAME_H = 1;
export const FLAME_V = 2;
export const FLAME_END_L = 3;
export const FLAME_END_R = 4;
export const FLAME_END_U = 5;
export const FLAME_END_D = 6;

/** `born` é quando a chama acendeu no relógio do motor: muda se outra bomba reacende a célula. */
export type PublicFlame = { cx: number; cy: number; kind: number; born: number };
export type PublicPowerup = { cx: number; cy: number; kind: Powerup };

export type ArenaState = {
  roomName: string;
  hostId: string;
  phase: GamePhase;
  maxPlayers: number;
  /** Qual das arenas (`arenas.ts`) a sala vai montar na próxima rodada; o host escolhe. */
  arenaId: string;
  /** O tamanho dela em células, contando a muralha: é o que a grade abaixo mede. */
  cols: number;
  rows: number;
  /** Qual dos temas (`themes.ts`) veste a arena: só desenho, e o host escolhe. */
  themeId: string;
  /** Quanto dura a próxima rodada, em minutos. */
  matchMinutes: number;
  players: PublicPlayer[];
  grid: number[];
  bombs: PublicBomb[];
  flames: PublicFlame[];
  powerups: PublicPowerup[];
  /** Quanto falta da rodada, em ms. */
  timeLeft: number;
  /** O "3, 2, 1". Zero fora da contagem. */
  countdown: number;
  /** Quem venceu a rodada; vazio no empate ou antes do fim. */
  winnerId: string;
  round: number;
  log: string[];
};

export type CreateRoomOptions = {
  roomName: string;
  playerName: string;
  maxPlayers: number;
  seatKey: string;
  /** Uma arena do tamanho com que a sala abre (a planta mesmo é sorteada). Desconhecida ou ausente, vale a padrão. */
  arenaId?: string;
  /** O tempo da rodada com que a sala abre, em minutos. Fora da lista ou abaixo do mínimo da arena, vale o padrão. */
  minutes?: number;
  /** O tema com que a sala abre. Desconhecido ou ausente, vale o padrão. */
  themeId?: string;
};

export type JoinRoomOptions = {
  playerName: string;
  seatKey: string;
};

/** cliente -> servidor: a direção do dedo. Zero nos dois é parado. */
export type InputMessage = { dx: number; dy: number };
/** host -> servidor: o tamanho da arena. A planta é sorteada pelo servidor entre as do tamanho, a cada rodada. */
export type ArenaMessage = { size: string };
/** host -> servidor: o tempo da próxima rodada, em minutos (um de `MATCH_MINUTES`, respeitando o mínimo da arena). */
export type TimeMessage = { minutes: number };
/** host -> servidor: o tema da arena. O servidor confere que ele existe e espelha para todos. */
export type ThemeMessage = { themeId: string };
export type EmoteMessage = { emote: Emote };
export type ErrorMessage = { message: string };

/**
 * O que ACONTECEU, para os sons e os efeitos. Nenhuma regra depende disto.
 */
export type FxEvent =
  | { k: "place"; by: string }
  | { k: "explode"; cx: number; cy: number }
  | { k: "die"; who: string }
  | { k: "pickup"; who: string; kind: Powerup }
  | { k: "start" }
  | { k: "finish"; winner: string };
export type FxMessage = FxEvent[];
export type EmoteEvent = { by: string; emote: Emote };

import { ArraySchema, Schema, type } from "@colyseus/schema";
import { DEFAULT_ARENA, DEFAULT_MATCH_MINUTES, DEFAULT_MAX_PLAYERS, DEFAULT_THEME, MATCH_TIME, type GamePhase } from "@bomb/shared";

/**
 * Tudo aqui é público e vai para todos os clientes da sala. O formato
 * espelhado em `ArenaState`, no `@bomb/shared`, é o mesmo: campo novo é campo
 * nos dois.
 */

export class PlayerState extends Schema {
  @type("string") id = "";
  @type("string") name = "";
  @type("uint8") slot = 0;
  @type("boolean") connected = true;
  /**
   * float64: a tela volta exatamente a esta posição e reaplica os comandos
   * ainda não confirmados. Arredondada, a conta dela nunca bateria com a do
   * motor, e toda chegada de estado seria uma pequena correção.
   */
  @type("float64") x = 0;
  @type("float64") y = 0;
  @type("uint8") dir = 0;
  @type("boolean") moving = false;
  @type("boolean") alive = false;
  @type("boolean") dying = false;
  @type("uint8") lives = 0;
  @type("uint8") range = 1;
  @type("uint8") bombs = 1;
  @type("uint8") speed = 0;
  @type("boolean") kick = false;
  @type("boolean") pierce = false;
  @type("boolean") invulnerable = false;
  @type("string") curse = "";
  @type("uint8") wins = 0;
  /** O último comando de entrada aplicado: a tela descarta até ele e reaplica o resto. */
  @type("uint32") seq = 0;
}

export class BombState extends Schema {
  @type("string") id = "";
  @type("uint8") cx = 0;
  @type("uint8") cy = 0;
  /** O centro, em células: muda enquanto desliza chutada. */
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("string") owner = "";
  @type("boolean") pierce = false;
  /** Quem ainda passa por ela, por `slot` (1 << slot): a previsão da tela precisa saber se ela fecha. */
  @type("uint8") passers = 0;
}

export class FlameState extends Schema {
  @type("uint8") cx = 0;
  @type("uint8") cy = 0;
  @type("uint8") kind = 0;
  /** Quando acendeu, no relógio do motor: muda quando outra bomba reacende a célula. */
  @type("uint32") born = 0;
}

export class PowerupState extends Schema {
  @type("uint8") cx = 0;
  @type("uint8") cy = 0;
  @type("string") kind = "";
}

export class ArenaRoomState extends Schema {
  @type("string") roomName = "";
  @type("string") hostId = "";
  @type("string") phase: GamePhase = "lobby";
  @type("uint8") maxPlayers = DEFAULT_MAX_PLAYERS;
  /** A arena da próxima rodada e o tamanho dela: a grade mede `cols × rows`. */
  @type("string") arenaId = DEFAULT_ARENA.id;
  @type("uint8") cols = DEFAULT_ARENA.cols;
  @type("uint8") rows = DEFAULT_ARENA.rows;
  /** O tema que veste a arena: só desenho, e o host escolhe. */
  @type("string") themeId = DEFAULT_THEME.id;
  /** Quanto dura a próxima rodada, em minutos; o host escolhe. */
  @type("uint8") matchMinutes = DEFAULT_MATCH_MINUTES;
  @type([PlayerState]) players = new ArraySchema<PlayerState>();
  @type(["uint8"]) grid = new ArraySchema<number>();
  @type([BombState]) bombs = new ArraySchema<BombState>();
  @type([FlameState]) flames = new ArraySchema<FlameState>();
  @type([PowerupState]) powerups = new ArraySchema<PowerupState>();
  @type("uint32") timeLeft = MATCH_TIME;
  /** O passo do motor da última vez que uma posição mudou: o carimbo da interpolação na tela. */
  @type("uint32") tick = 0;
  @type("uint8") countdown = 0;
  @type("string") winnerId = "";
  @type("uint8") round = 0;
  @type(["string"]) log = new ArraySchema<string>();
}

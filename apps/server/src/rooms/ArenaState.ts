import { ArraySchema, Schema, type } from "@colyseus/schema";
import { COLS, DEFAULT_MAX_PLAYERS, MATCH_TIME, ROWS, type GamePhase } from "@bomb/shared";

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
  @type("float32") x = 0;
  @type("float32") y = 0;
  @type("uint8") dir = 0;
  @type("boolean") moving = false;
  @type("boolean") alive = false;
  @type("boolean") dying = false;
  @type("uint8") lives = 0;
  @type("uint8") range = 1;
  @type("uint8") bombs = 1;
  @type("uint8") speed = 0;
  @type("boolean") invulnerable = false;
  @type("string") curse = "";
  @type("uint8") wins = 0;
}

export class BombState extends Schema {
  @type("string") id = "";
  @type("uint8") cx = 0;
  @type("uint8") cy = 0;
  @type("string") owner = "";
}

export class FlameState extends Schema {
  @type("uint8") cx = 0;
  @type("uint8") cy = 0;
  @type("uint8") kind = 0;
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
  @type([PlayerState]) players = new ArraySchema<PlayerState>();
  @type(["uint8"]) grid = new ArraySchema<number>(...new Array(COLS * ROWS).fill(0));
  @type([BombState]) bombs = new ArraySchema<BombState>();
  @type([FlameState]) flames = new ArraySchema<FlameState>();
  @type([PowerupState]) powerups = new ArraySchema<PowerupState>();
  @type("uint32") timeLeft = MATCH_TIME;
  @type("uint8") countdown = 0;
  @type("string") winnerId = "";
  @type("uint8") round = 0;
  @type(["string"]) log = new ArraySchema<string>();
}

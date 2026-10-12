import type { BombGame } from "@bomb/shared";
import { type ArenaRoomState, BombState, FlameState, PlayerState, PowerupState } from "./ArenaState.js";

/**
 * O adaptador entre o motor e a rede: copia o `BombGame` para o
 * `ArenaRoomState`, que é o que o Colyseus sincroniza.
 *
 * Fica à parte da sala porque é uma tarefa só, e de detalhe: roda a cada
 * tick, e cada lista só é reescrita quando de fato mudou — senão todo patch
 * levaria a arena inteira.
 */
export class ArenaMirror {
  /** Até que linha do log a sala já foi espelhada. */
  private sentLogSeq = 0;

  /** Escreve o motor no estado. `tick` é o carimbo do passo, para quem se mexeu. */
  write(state: ArenaRoomState, game: BombGame, tick: number, connected: (id: string) => boolean) {
    state.phase = game.phase;
    // O relógio vai em segundos inteiros (arredondado para cima, como o painel
    // mostra): em milissegundos ele mudava a cada tick, e todo patch levava
    // uma mudança mesmo com todo mundo parado — 30 mensagens por segundo à toa.
    state.timeLeft = Math.ceil(game.timeLeft / 1000) * 1000;
    state.countdown = game.countdown;
    state.hurry = game.hurry;
    state.winnerId = game.winnerId;
    state.round = game.round;
    state.arenaId = game.arena.id;
    state.cols = game.cols;
    state.rows = game.rows;
    state.matchMinutes = game.matchMinutes;

    if (state.grid.length !== game.grid.length) {
      // Outra arena, outro tamanho: a grade inteira vai de novo.
      state.grid.splice(0);
      state.grid.push(...game.grid);
    } else {
      for (let i = 0; i < game.grid.length; i++) {
        if (state.grid[i] !== game.grid[i]) state.grid[i] = game.grid[i];
      }
    }

    // Bonecos e bomba chutada levam o carimbo do passo em que mudaram de lugar.
    const movedPlayers = this.writePlayers(state, game, connected);
    const movedBombs = this.writeBombs(state, game);
    const moved = movedPlayers || movedBombs;
    if (moved) state.tick = tick;
    this.writeFlames(state, game);
    this.writePowerups(state, game);
    this.writeLog(state, game);
  }

  /** Devolve se alguma posição mudou. */
  private writePlayers(
    state: ArenaRoomState,
    game: BombGame,
    connected: (id: string) => boolean,
  ): boolean {
    let moved = false;
    const rosterChanged =
      state.players.length !== game.players.length ||
      game.players.some((player, i) => state.players[i]?.id !== player.id);
    if (rosterChanged) {
      state.players.splice(0);
      for (const player of game.players) {
        const entry = new PlayerState();
        entry.id = player.id;
        entry.name = player.name;
        entry.slot = player.slot;
        state.players.push(entry);
      }
    }
    game.players.forEach((player, i) => {
      const entry = state.players[i];
      entry.connected = connected(player.id);
      // A posição exata: com o passo fixo, parado é parado (nem o quinto
      // dígito muda), e a previsão da tela precisa do número do motor.
      if (entry.x !== player.x || entry.y !== player.y) {
        entry.x = player.x;
        entry.y = player.y;
        moved = true;
      }
      entry.seq = player.queue.ack;
      entry.dir = player.dir;
      entry.moving = player.moving;
      entry.alive = player.alive;
      entry.dying = !player.alive && game.time < player.dyingUntil;
      entry.lives = player.lives;
      entry.range = player.range;
      entry.bombs = player.bombs;
      entry.kick = player.kick;
      entry.pierce = player.pierce;
      entry.speed = player.speed;
      entry.invulnerable = player.alive && game.time < player.invulnerableUntil;
      entry.curse = player.curse;
      entry.ghost = player.alive && game.time < player.ghostUntil;
      entry.remote = player.remote;
      entry.wins = player.wins;
    });
    return moved;
  }

  /** As cadeiras que ainda passam por cima da bomba, como bits de `slot`. */
  private passersMask(game: BombGame, passers: Set<string>): number {
    let mask = 0;
    for (const player of game.players) if (passers.has(player.id)) mask |= 1 << player.slot;
    return mask;
  }

  /** Devolve se alguma bomba mudou de lugar (chutada). */
  private writeBombs(state: ArenaRoomState, game: BombGame): boolean {
    let moved = false;
    const same =
      state.bombs.length === game.bombs.length &&
      game.bombs.every((bomb, i) => state.bombs[i].id === bomb.id);
    if (same) {
      game.bombs.forEach((bomb, i) => {
        const entry = state.bombs[i];
        if (entry.owner !== bomb.owner) entry.owner = bomb.owner;
        // Chutada, ela anda: a célula e o centro seguem o motor.
        if (entry.cx !== bomb.cx) entry.cx = bomb.cx;
        if (entry.cy !== bomb.cy) entry.cy = bomb.cy;
        if (entry.x !== bomb.x || entry.y !== bomb.y) {
          entry.x = bomb.x;
          entry.y = bomb.y;
          moved = true;
        }
        const passers = this.passersMask(game, bomb.passers);
        if (entry.passers !== passers) entry.passers = passers;
        // A remota detonada passa a piscar; a do dono que morreu vira comum, com o pavio inteiro.
        if (entry.remote !== bomb.remote) entry.remote = bomb.remote;
        if (entry.armed !== bomb.armed) entry.armed = bomb.armed;
        if (entry.fuse !== bomb.fuse) entry.fuse = bomb.fuse;
      });
      return moved;
    }
    state.bombs.splice(0);
    for (const bomb of game.bombs) {
      const entry = new BombState();
      entry.id = bomb.id;
      entry.cx = bomb.cx;
      entry.cy = bomb.cy;
      entry.x = bomb.x;
      entry.y = bomb.y;
      entry.owner = bomb.owner;
      entry.pierce = bomb.pierce;
      entry.fuse = bomb.fuse;
      entry.remote = bomb.remote;
      entry.armed = bomb.armed;
      entry.passers = this.passersMask(game, bomb.passers);
      state.bombs.push(entry);
    }
    return moved;
  }

  private writeFlames(state: ArenaRoomState, game: BombGame) {
    const same =
      state.flames.length === game.flames.length &&
      game.flames.every(
        (f, i) =>
          state.flames[i].cx === f.cx &&
          state.flames[i].cy === f.cy &&
          state.flames[i].kind === f.kind &&
          state.flames[i].born === f.born,
      );
    if (same) return;
    state.flames.splice(0);
    for (const flame of game.flames) {
      const entry = new FlameState();
      entry.cx = flame.cx;
      entry.cy = flame.cy;
      entry.kind = flame.kind;
      entry.born = flame.born;
      state.flames.push(entry);
    }
  }

  private writePowerups(state: ArenaRoomState, game: BombGame) {
    const same =
      state.powerups.length === game.powerups.length &&
      game.powerups.every(
        (p, i) => state.powerups[i].cx === p.cx && state.powerups[i].cy === p.cy && state.powerups[i].kind === p.kind,
      );
    if (same) return;
    state.powerups.splice(0);
    for (const drop of game.powerups) {
      const entry = new PowerupState();
      entry.cx = drop.cx;
      entry.cy = drop.cy;
      entry.kind = drop.kind;
      state.powerups.push(entry);
    }
  }

  private writeLog(state: ArenaRoomState, game: BombGame) {
    const { log, logSeq } = game;
    const fresh = logSeq - this.sentLogSeq;
    this.sentLogSeq = logSeq;
    const mirrored = state.log;
    if (fresh === 0 && mirrored.length === log.length && mirrored.at(-1) === log.at(-1)) return;
    if (fresh > 0 && fresh < log.length) {
      const dropped = mirrored.length + fresh - log.length;
      for (let i = 0; i < dropped; i++) mirrored.shift();
      for (const message of log.slice(-fresh)) mirrored.push(message);
      return;
    }
    mirrored.splice(0);
    mirrored.push(...log);
  }
}

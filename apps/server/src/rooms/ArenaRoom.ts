import { CloseCode, Room, type Client } from "colyseus";
import {
  DEFAULT_MAX_PLAYERS,
  EMOTE_COOLDOWN,
  LOBBY_RECONNECT_TIMEOUT,
  MAX_PLAYERS,
  MIN_PLAYERS,
  RECONNECT_TIMEOUT,
  arenaById,
  isArenaSize,
  isEmote,
  type ArenaMessage,
  pickArena,
  type ThemeMessage,
  themeById,
  type TimeMessage,
  type CreateRoomOptions,
  type EmoteEvent,
  type EmoteMessage,
  type ErrorMessage,
  type FxMessage,
  type InputMessage,
  type JoinRoomOptions,
} from "@bomb/shared";
import { BombGame, GameError, type GamePlayer } from "@bomb/shared";
import { ArenaRoomState, BombState, FlameState, PlayerState, PowerupState } from "./ArenaState.js";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 5;
const LOBBY_CHANNEL = "$bomblobby";

/** O único fechamento que é uma saída de verdade: alguém apertou "sair". */
const CONSENTED = CloseCode.CONSENTED;

/** Quantas vezes por segundo o motor avança, e de quanto em quanto a tela recebe. */
const TICK_MS = 1000 / 60;
/** Patches a ~30 Hz: os outros bonecos ficam ~70 ms atrás, em vez de 100 (ver `interp.ts`). */
const PATCH_MS = 33;

/**
 * A sala: conexões, reconexão, o relógio e o espelho do motor no estado
 * sincronizado. A regra mora em `BombGame`; aqui só se liga o relógio nela e
 * se copia o resultado para quem está olhando.
 *
 * A reconexão é a mesma do FDP: a cadeira fica guardada por `RECONNECT_TIMEOUT`
 * segundos, e volta tanto pelo token do Colyseus quanto pela `seatKey` que o
 * navegador sorteou na primeira entrada — ver `onJoin`.
 */
export class ArenaRoom extends Room<{ state: ArenaRoomState }> {
  state = new ArenaRoomState();
  patchRate = PATCH_MS;

  private game = new BombGame();
  private connected = new Set<string>();
  private lastEmote = new Map<string, number>();
  private holding = new Set<string>();
  private sentLogSeq = 0;

  messages = {
    start: (client: Client) =>
      this.act(client, () => {
        this.requireHost(client);
        if (this.game.phase === "lobby" || this.game.phase === "finished") this.drawArena();
        this.game.start();
      }),

    /** A direção do dedo. Vale até a próxima: parar é mandar zero nos dois. */
    input: (client: Client, message: InputMessage) => {
      this.game.setInput(client.sessionId, Number(message?.dx) || 0, Number(message?.dy) || 0);
    },

    /** Um pedido de bomba. É evento e não estado: segurar a tecla não repete. */
    bomb: (client: Client) => this.game.requestBomb(client.sessionId),

    resync: (client: Client) => this.resync(client),

    emote: (client: Client, message: EmoteMessage) => {
      if (!isEmote(message?.emote)) return;
      const now = this.clock.currentTime;
      const last = this.lastEmote.get(client.sessionId) ?? -Infinity;
      if (now - last < EMOTE_COOLDOWN) return;
      this.lastEmote.set(client.sessionId, now);
      this.broadcast("emote", { by: client.sessionId, emote: message.emote } satisfies EmoteEvent);
    },

    restart: (client: Client) =>
      this.act(client, () => {
        this.requireHost(client);
        if (this.game.phase !== "finished") throw new GameError("A rodada ainda está rolando.");
        this.drawArena();
        this.game.start();
      }),

    /**
     * O host escolheu o tamanho da arena. A planta não se escolhe: a sala
     * sorteia uma das três do tamanho agora e de novo a cada rodada
     * (`drawArena`), e é esta que vai para todo mundo.
     */
    arena: (client: Client, message: ArenaMessage) =>
      this.act(client, () => {
        this.requireHost(client);
        if (!isArenaSize(message?.size)) throw new GameError("Esse tamanho de arena não existe.");
        this.game.setArena(pickArena(message.size));
      }),

    /** O host escolheu o tempo da próxima rodada. O motor confere a lista e o mínimo da arena. */
    time: (client: Client, message: TimeMessage) =>
      this.act(client, () => {
        this.requireHost(client);
        this.game.setMatchMinutes(Number(message?.minutes));
      }),

    /**
     * O host escolheu o tema. É só desenho, e nem passa pelo motor: a sala
     * confere que existe e espelha para todos. Como a arena, não muda no meio
     * da rodada — a tela de todo mundo troca de uma vez, no lobby.
     */
    theme: (client: Client, message: ThemeMessage) =>
      this.act(client, () => {
        this.requireHost(client);
        const theme = themeById(message?.themeId);
        if (!theme) throw new GameError("Esse tema não existe.");
        if (this.game.phase !== "lobby" && this.game.phase !== "finished") {
          throw new GameError("A rodada já começou.");
        }
        this.state.themeId = theme.id;
      }),
  };

  async onCreate(options: CreateRoomOptions) {
    this.roomId = await this.generateRoomId();
    this.state.roomName = sanitize(options?.roomName, "Arena", 40);
    this.state.maxPlayers = clamp(
      Number(options?.maxPlayers) || DEFAULT_MAX_PLAYERS,
      MIN_PLAYERS,
      MAX_PLAYERS,
    );
    this.maxClients = this.state.maxPlayers;
    // O tamanho com que a sala abre: o da última vez, se a arena ainda existir; a planta é sorteada.
    const arena = arenaById(options?.arenaId);
    if (arena) this.game.setArena(pickArena(arena.size));
    // E o tema da última vez, se existir.
    const theme = themeById(options?.themeId);
    if (theme) this.state.themeId = theme.id;
    // E o tempo da última vez, se couber nessa arena; senão fica o padrão.
    try {
      this.game.setMatchMinutes(Number(options?.minutes));
    } catch {
      /* fora da lista ou abaixo do mínimo: o padrão serve */
    }

    // O relógio do motor. Ele avança sempre, mesmo no lobby: é barato e
    // dispensa ligar e desligar o intervalo a cada rodada.
    this.setSimulationInterval((dt) => {
      this.game.tick(dt);
      this.sync();
    }, TICK_MS);
    this.sync();
  }

  onJoin(client: Client, options: JoinRoomOptions) {
    const seatKey = sanitize(options?.seatKey, "", 64);
    const seat = this.game.seatOf(seatKey);

    if (seat) {
      if (this.connected.has(seat.id)) {
        throw new GameError("Você já está nesta arena em outra aba.");
      }
      this.reseat(seat, client);
    } else {
      this.game.addPlayer(client.sessionId, seatKey, sanitize(options?.playerName, "Jogador", 16));
      this.connected.add(client.sessionId);
    }

    if (!this.state.hostId) this.state.hostId = client.sessionId;
    this.sync();
  }

  private reseat(seat: GamePlayer, client: Client) {
    const previous = seat.id;
    this.game.reseat(seat, client.sessionId);
    this.holding.delete(previous);
    this.connected.delete(previous);
    this.connected.add(client.sessionId);
    this.lastEmote.delete(previous);
    if (this.state.hostId === previous) this.state.hostId = client.sessionId;
  }

  onDrop(client: Client) {
    this.hold(client);
  }

  onReconnect(client: Client) {
    if (!this.seatOf(client)) {
      client.send("error", {
        message: "Você voltou para esta arena em outra aba.",
      } satisfies ErrorMessage);
      client.leave();
      return;
    }
    this.holding.delete(client.sessionId);
    this.connected.add(client.sessionId);
    this.sync();
  }

  onLeave(client: Client, code: CloseCode) {
    if (code !== CONSENTED && !this.holding.has(client.sessionId) && this.seatOf(client)) {
      this.hold(client);
      return;
    }
    this.release(client);
  }

  onDispose() {
    return this.presence.srem(LOBBY_CHANNEL, this.roomId);
  }

  /* --------------------------------------------------------------- privado */

  private seatOf(client: Client) {
    return this.game.players.find((player) => player.id === client.sessionId);
  }

  private hold(client: Client) {
    if (!this.seatOf(client)) return;
    this.connected.delete(client.sessionId);
    // Quem caiu solta o direcional: o personagem não pode seguir andando
    // sozinho até a parede enquanto a pessoa está sem conexão.
    this.game.setInput(client.sessionId, 0, 0);
    this.holding.add(client.sessionId);
    this.sync();

    this.allowReconnection(
      client,
      this.game.phase === "lobby" ? LOBBY_RECONNECT_TIMEOUT : RECONNECT_TIMEOUT,
    ).catch(() => {
      this.release(client);
    });
  }

  private release(client: Client) {
    this.holding.delete(client.sessionId);
    this.connected.delete(client.sessionId);
    this.lastEmote.delete(client.sessionId);
    this.game.removePlayer(client.sessionId);
    if (this.state.hostId === client.sessionId) {
      this.state.hostId = this.game.players[0]?.id ?? "";
    }
    this.sync();
  }

  private act(client: Client, action: () => void) {
    try {
      action();
    } catch (error) {
      if (error instanceof GameError) {
        client.send("error", { message: error.message } satisfies ErrorMessage);
        return;
      }
      throw error;
    }
    this.sync();
  }

  private resync(client: Client) {
    try {
      (this as unknown as { sendFullState(target: Client): void }).sendFullState(client);
    } catch {
      // segue sem
    }
  }

  private requireHost(client: Client) {
    if (client.sessionId !== this.state.hostId) {
      throw new GameError("Apenas o host pode fazer isso.");
    }
  }

  /** O sorteio da planta da rodada: uma das três do tamanho escolhido. */
  private drawArena() {
    this.game.setArena(pickArena(this.game.arena.size));
  }

  /** Espelha o motor no estado sincronizado. Roda a cada tick: só escreve o que mudou. */
  private sync() {
    const { game, state } = this;
    state.phase = game.phase;
    // O relógio vai em segundos inteiros (arredondado para cima, como o painel
    // mostra): em milissegundos ele mudava a cada tick, e todo patch levava
    // uma mudança mesmo com todo mundo parado — 30 mensagens por segundo à toa.
    state.timeLeft = Math.ceil(game.timeLeft / 1000) * 1000;
    state.countdown = game.countdown;
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

    this.syncPlayers();
    this.syncBombs();
    this.syncFlames();
    this.syncPowerups();
    this.syncLog();
    this.sendFx();
  }

  private syncPlayers() {
    const { game, state } = this;
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
      entry.connected = this.connected.has(player.id);
      // Duas casas decimais bastam para a tela, e poupam um patch por tick
      // de um jogador parado cujo float só mudou no quinto dígito.
      const x = Math.round(player.x * 100) / 100;
      const y = Math.round(player.y * 100) / 100;
      if (entry.x !== x) entry.x = x;
      if (entry.y !== y) entry.y = y;
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
      entry.wins = player.wins;
    });
  }

  private syncBombs() {
    const { game, state } = this;
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
        if (entry.x !== bomb.x) entry.x = bomb.x;
        if (entry.y !== bomb.y) entry.y = bomb.y;
      });
      return;
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
      state.bombs.push(entry);
    }
  }

  private syncFlames() {
    const { game, state } = this;
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

  private syncPowerups() {
    const { game, state } = this;
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

  private syncLog() {
    const { log, logSeq } = this.game;
    const fresh = logSeq - this.sentLogSeq;
    this.sentLogSeq = logSeq;
    const mirrored = this.state.log;
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

  private sendFx() {
    const events = this.game.takeFx();
    if (events.length > 0) this.broadcast("fx", events satisfies FxMessage);
  }

  private async generateRoomId(): Promise<string> {
    for (;;) {
      const id = Array.from(
        { length: ROOM_CODE_LENGTH },
        () => ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)],
      ).join("");
      if (await this.presence.sismember(LOBBY_CHANNEL, id)) continue;
      await this.presence.sadd(LOBBY_CHANNEL, id);
      return id;
    }
  }
}

function sanitize(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
  return text || fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

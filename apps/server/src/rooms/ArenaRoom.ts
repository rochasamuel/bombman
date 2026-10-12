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
  type BombMessage,
  pickArena,
  type ThemeMessage,
  themeById,
  type TimeMessage,
  type CreateRoomOptions,
  DEFAULT_ARENA,
  type DiagMessage,
  decodeBatch,
  type NetStatsMessage,
  TICK_MS,
  type EmoteEvent,
  type EmoteMessage,
  type ErrorMessage,
  type FxMessage,
  type JoinRoomOptions,
} from "@bomb/shared";
import { BombGame, GameError, type GamePlayer } from "@bomb/shared";
import { netConfig } from "../config.js";
import { ArenaMirror } from "./ArenaMirror.js";
import { ArenaRoomState } from "./ArenaState.js";
import { TickStats } from "./tickStats.js";

const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 5;
const LOBBY_CHANNEL = "$bomblobby";

/** O único fechamento que é uma saída de verdade: alguém apertou "sair". */
const CONSENTED = CloseCode.CONSENTED;

/** No máximo um aviso de engasgo a cada tanto, por sala. */
const STALL_WARN_EVERY_MS = 10_000;

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
  /** Patches a ~30 Hz por padrão (`PATCH_MS`): independente do passo do motor, que é sempre 60 Hz. */
  patchRate = netConfig.patchMs;
  /** Uma tela manda ~30 lotes de comandos por segundo andando; muito acima disso é abuso. */
  maxMessagesPerSecond = netConfig.maxMessagesPerSecond;

  private game = new BombGame(Math.random, DEFAULT_ARENA, netConfig.input);
  /** Quantos passos fixos o motor já deu: o carimbo `tick` do estado. */
  private ticks = 0;
  /** O tempo real que chegou do relógio e ainda não virou passo, em ms. */
  private owed = 0;
  private stats!: TickStats;
  private lastStallWarn = -Infinity;
  private lastNetLog = 0;
  /** Quem pediu o diagnóstico de rede (`diag`). */
  private watching = new Set<string>();
  private connected = new Set<string>();
  private lastEmote = new Map<string, number>();
  private holding = new Set<string>();
  /** Quem copia o motor para o estado sincronizado. Ver `ArenaMirror`. */
  private mirror = new ArenaMirror();

  messages = {
    start: (client: Client) =>
      this.act(client, () => {
        this.requireHost(client);
        if (this.game.phase === "lobby" || this.game.phase === "finished") this.drawArena();
        this.game.start();
      }),

    /**
     * Os comandos numerados de andar e de bomba (ver `net.ts`). Um lote fora
     * do formato cai inteiro e conta como recusado; os repetidos caem um a um.
     */
    input: (client: Client, message: unknown) => {
      const commands = decodeBatch(message);
      if (!commands) {
        const seat = this.seatOf(client);
        if (seat) seat.queue.rejected++;
        return;
      }
      this.game.pushCommands(client.sessionId, commands);
    },

    /**
     * Um pedido de bomba fora dos comandos (o caminho antigo). Cai na célula
     * em que o boneco está no servidor: a tela não escolhe a célula.
     */
    bomb: (client: Client, _message?: BombMessage) => {
      this.game.requestBomb(client.sessionId);
    },

    /** Liga ou desliga o diagnóstico de rede para esta tela (`net`, uma vez por segundo). */
    diag: (client: Client, message: DiagMessage) => {
      if (message?.on === true) this.watching.add(client.sessionId);
      else this.watching.delete(client.sessionId);
    },

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
    this.stats = new TickStats(performance.now(), TICK_MS);
    this.setSimulationInterval((delta) => this.advance(delta), TICK_MS);
    this.sync();
  }

  /**
   * O passo fixo. O intervalo do Colyseus dispara mais ou menos a cada
   * `TICK_MS`, com o tempo real que passou; esse tempo vira passos inteiros
   * de `TICK_MS` (o que sobra fica para o próximo disparo). O motor só anda
   * em passos fixos: é o que deixa a previsão da tela, que anda nos mesmos
   * passos, bater com ele. Depois de um engasgo (GC, máquina sobrecarregada),
   * a sala recupera no máximo `MAX_CATCHUP_TICKS` passos de uma vez e joga o
   * resto do atraso fora — senão um engasgo longo viraria uma rajada de
   * passos que engasga de novo.
   */
  private advance(delta: number) {
    const started = performance.now();
    this.owed += delta;
    let steps = Math.floor(this.owed / TICK_MS + 1e-9);
    if (steps > netConfig.maxCatchUpTicks) {
      const dropped = (steps - netConfig.maxCatchUpTicks) * TICK_MS;
      this.stats.drop(dropped);
      this.owed -= dropped;
      steps = netConfig.maxCatchUpTicks;
    }
    for (let i = 0; i < steps; i++) {
      this.game.tick(TICK_MS);
      this.ticks++;
      this.owed -= TICK_MS;
    }
    if (steps > 0) this.sync();
    const now = performance.now();
    const work = now - started;
    this.stats.record(delta, steps, work);
    this.warnStall(delta, work, now);
    if (this.stats.roll(now)) this.report(now);
  }

  private warnStall(delta: number, work: number, now: number) {
    const worst = Math.max(delta, work);
    if (worst < netConfig.stallWarnMs || now - this.lastStallWarn < STALL_WARN_EVERY_MS) return;
    this.lastStallWarn = now;
    console.warn(
      JSON.stringify({
        msg: "room stall",
        room: this.roomId,
        delta: Math.round(delta),
        work: Math.round(work * 10) / 10,
        droppedMs: Math.round(this.stats.droppedMs),
      }),
    );
  }

  /** Uma vez por segundo: o diagnóstico para quem pediu, e o log estruturado se estiver ligado. */
  private report(now: number) {
    const { last } = this.stats;
    for (const id of this.watching) {
      const client = this.clients.getById(id);
      const seat = this.game.player(id);
      if (!client) {
        this.watching.delete(id);
        continue;
      }
      client.send("net", {
        ...last,
        droppedMs: Math.round(this.stats.droppedMs),
        patchMs: this.patchRate ?? 0,
        queue: seat?.queue.length ?? 0,
        inputDropped: seat?.queue.dropped ?? 0,
        inputDuplicates: seat?.queue.duplicates ?? 0,
        inputRejected: seat?.queue.rejected ?? 0,
      } satisfies NetStatsMessage);
    }
    const every = netConfig.logEverySeconds * 1000;
    if (every > 0 && now - this.lastNetLog >= every) {
      this.lastNetLog = now;
      console.log(
        JSON.stringify({
          msg: "room net",
          room: this.roomId,
          phase: this.game.phase,
          players: this.game.players.length,
          ...last,
          late: this.stats.late,
          droppedMs: Math.round(this.stats.droppedMs),
          inputDropped: sum(this.game.players.map((p) => p.queue.dropped)),
          inputRejected: sum(this.game.players.map((p) => p.queue.rejected)),
        }),
      );
    }
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
    return this.game.player(client.sessionId);
  }

  private hold(client: Client) {
    if (!this.seatOf(client)) return;
    this.connected.delete(client.sessionId);
    // Quem caiu solta o direcional: o personagem não pode seguir andando
    // sozinho até a parede enquanto a pessoa está sem conexão.
    this.game.dropCommands(client.sessionId);
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
    this.watching.delete(client.sessionId);
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
    this.mirror.write(this.state, this.game, this.ticks, (id) => this.connected.has(id));
    this.sendFx();
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

function sum(values: number[]) {
  return values.reduce((a, b) => a + b, 0);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

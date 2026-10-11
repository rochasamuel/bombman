import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import type {
  ArenaMessage,
  BombMessage,
  PingMessage,
  ThemeMessage,
  TimeMessage,
  ArenaSize,
  ArenaState,
  Emote,
  EmoteEvent,
  EmoteMessage,
  ErrorMessage,
  FxEvent,
  FxMessage,
  InputMessage,
  JoinRoomOptions,
} from "@bomb/shared";
import { client } from "../lib/colyseus";
import { takePendingRoom } from "../lib/pendingRoom";
import {
  clearSession,
  loadPlayerName,
  loadSession,
  saveSession,
  seatKeyFor,
} from "../lib/session";

export type ConnectionStatus = "connecting" | "naming" | "connected" | "lost";

export type RoomActions = {
  start: () => void;
  /** O tamanho da arena (só o host). O servidor sorteia a planta a cada rodada e manda para todos. */
  arena: (size: ArenaSize) => void;
  /** O tempo da próxima rodada, em minutos (só o host). */
  time: (minutes: number) => void;
  /** O tema da arena (só o host). O servidor confere e espelha para todos. */
  theme: (themeId: string) => void;
  /** A direção do dedo. Zero nos dois é parado. */
  input: (dx: number, dy: number) => void;
  /** Uma bomba, na célula em que a tela a mostrou (se mostrou). */
  bomb: (at?: { cx: number; cy: number } | null) => void;
  emote: (emote: Emote) => void;
  restart: () => void;
};

export type RoomConnection = {
  status: ConnectionStatus;
  dropped: boolean;
  error: string;
  notice: string;
  state: ArenaState | null;
  /**
   * O estado VIVO do Colyseus, para o canvas. O `state` acima é um retrato
   * por patch, bom para o React; o canvas lê este a cada quadro, sem passar
   * por render nenhum.
   */
  live: () => ArenaState | null;
  /** A ida e volta ao servidor, em ms (suavizada): a previsão do próprio boneco usa. */
  rtt: () => number;
  sessionId: string;
  join: (playerName: string) => Promise<void>;
  retry: () => void;
  leave: () => void;
  actions: RoomActions;
  onFx: (handler: (events: FxEvent[]) => void) => () => void;
  onEmote: (handler: (event: EmoteEvent) => void) => () => void;
};

export function useRoomConnection(code: string): RoomConnection {
  const roomRef = useRef<Room | null>(null);
  const rttRef = useRef(0);
  const fxHandlers = useRef(new Set<(events: FxEvent[]) => void>());
  const emoteHandlers = useRef(new Set<(event: EmoteEvent) => void>());
  const busy = useRef(false);
  const alive = useRef(true);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [dropped, setDropped] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [state, setState] = useState<ArenaState | null>(null);
  const [sessionId, setSessionId] = useState("");

  const attach = useCallback(
    (room: Room, playerName: string, seatKey: string) => {
      roomRef.current = room;
      // Só em desenvolvimento: a sala à mão no console, para olhar o estado vivo.
      if (import.meta.env.DEV) (window as unknown as { __room?: Room }).__room = room;
      setSessionId(room.sessionId);
      setStatus("connected");
      setDropped(false);
      setError("");
      let token = room.reconnectionToken;
      saveSession(code, { reconnectionToken: token, playerName, seatKey });

      /*
       * O React só precisa saber do que muda a TELA em volta do canvas: fase,
       * jogadores, placar. Posição e chamas chegam vinte vezes por segundo e
       * seriam vinte renders por segundo do painel inteiro — o canvas as lê
       * direto do `live()`. Daí a assinatura: só o que o React desenha.
       */
      let signature = "";
      room.onStateChange(() => {
        if (room.reconnectionToken !== token) {
          token = room.reconnectionToken;
          saveSession(code, { reconnectionToken: token, playerName, seatKey });
        }
        const snapshot = room.state.toJSON() as ArenaState;
        const next = [
          snapshot.phase,
          snapshot.hostId,
          snapshot.arenaId,
          snapshot.themeId,
          snapshot.matchMinutes,
          snapshot.countdown,
          snapshot.winnerId,
          snapshot.round,
          Math.ceil(snapshot.timeLeft / 1000),
          snapshot.log.length,
          snapshot.log.at(-1),
          ...snapshot.players.map(
            (p) =>
              `${p.id}${p.name}${p.connected}${p.lives}${p.alive}${p.range}${p.bombs}${p.speed}${p.curse}${p.wins}`,
          ),
        ].join("|");
        if (next === signature) return;
        signature = next;
        setState(snapshot);
      });
      room.onMessage("error", (message: ErrorMessage) => setNotice(message.message));
      room.onMessage("fx", (events: FxMessage) => {
        for (const handler of fxHandlers.current) handler(events);
      });
      room.onMessage("emote", (event: EmoteEvent) => {
        for (const handler of emoteHandlers.current) handler(event);
      });
      // A ida e volta, medida a cada segundo para a previsão do próprio boneco.
      room.onMessage("pong", ({ t }: PingMessage) => {
        const sample = performance.now() - t;
        if (sample >= 0 && sample < 5000) rttRef.current = rttRef.current ? rttRef.current * 0.8 + sample * 0.2 : sample;
      });
      room.onDrop(() => setDropped(true));
      room.onReconnect(() => {
        setDropped(false);
        token = room.reconnectionToken;
        saveSession(code, { reconnectionToken: token, playerName, seatKey });
      });
      room.onLeave(() => {
        roomRef.current = null;
        setStatus("lost");
      });
    },
    [code],
  );

  const join = useCallback(
    async (playerName: string) => {
      setStatus("connecting");
      setError("");
      const seatKey = seatKeyFor(code);
      try {
        const room = await client.joinById(code, { playerName, seatKey } satisfies JoinRoomOptions);
        if (!alive.current) return void room.leave();
        attach(room, playerName, seatKey);
      } catch (cause) {
        setError(joinError(cause));
        setStatus("naming");
      }
    },
    [attach, code],
  );

  const connect = useCallback(async () => {
    if (roomRef.current || busy.current || !alive.current) return;
    busy.current = true;
    const saved = loadSession(code);

    try {
      const seatKey = seatKeyFor(code);
      const handedOver = takePendingRoom(code);
      if (handedOver) {
        return attach(handedOver, saved?.playerName ?? loadPlayerName(), seatKey);
      }

      const name = saved?.playerName || loadPlayerName();
      if (!saved?.reconnectionToken && !name) return setStatus("naming");

      setStatus("connecting");
      setError("");

      if (saved?.reconnectionToken) {
        const room = await reclaimSeat(saved.reconnectionToken, () => alive.current);
        if (!alive.current) return void room?.leave();
        if (room) return attach(room, saved.playerName, seatKey);
      }

      if (!name) return setStatus("naming");

      try {
        const room = await client.joinById(code, {
          playerName: name,
          seatKey,
        } satisfies JoinRoomOptions);
        if (!alive.current) return void room.leave();
        attach(room, name, seatKey);
      } catch (cause) {
        if (!alive.current) return;
        setError(joinError(cause));
        setStatus(saved ? "lost" : "naming");
      }
    } finally {
      busy.current = false;
    }
  }, [attach, code]);

  useEffect(() => {
    alive.current = true;
    void connect();
    return () => {
      alive.current = false;
      roomRef.current?.removeAllListeners();
      roomRef.current?.leave();
      roomRef.current = null;
    };
  }, [connect]);

  useEffect(() => {
    const recover = () => {
      if (document.visibilityState !== "visible") return;
      try {
        roomRef.current?.send("resync");
      } catch {
        // socket já morto: o `connect` abaixo é quem cuida deste caso
      }
      void connect();
    };
    document.addEventListener("visibilitychange", recover);
    addEventListener("online", recover);
    addEventListener("pageshow", recover);
    return () => {
      document.removeEventListener("visibilitychange", recover);
      removeEventListener("online", recover);
      removeEventListener("pageshow", recover);
    };
  }, [connect]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 2600);
    return () => clearTimeout(timer);
  }, [notice]);

  const retry = useCallback(() => void connect(), [connect]);

  const leave = useCallback(() => {
    roomRef.current?.leave(true);
    roomRef.current = null;
    clearSession(code);
  }, [code]);

  /** A última direção mandada, para não repetir a mesma. */
  const lastInput = useRef("");
  const actions = useMemo<RoomActions>(
    () => ({
      start: () => roomRef.current?.send("start"),
      arena: (size) => roomRef.current?.send("arena", { size } satisfies ArenaMessage),
      time: (minutes) => roomRef.current?.send("time", { minutes } satisfies TimeMessage),
      theme: (themeId) => roomRef.current?.send("theme", { themeId } satisfies ThemeMessage),
      input: (dx, dy) => {
        // Só o que mudou: o teclado repete a tecla segurada dezenas de vezes
        // por segundo, e o servidor guarda a direção até a próxima.
        const key = `${dx},${dy}`;
        if (key === lastInput.current) return;
        lastInput.current = key;
        roomRef.current?.send("input", { dx, dy } satisfies InputMessage);
      },
      bomb: (at) => roomRef.current?.send("bomb", (at ?? {}) satisfies BombMessage),
      emote: (emote) => roomRef.current?.send("emote", { emote } satisfies EmoteMessage),
      restart: () => roomRef.current?.send("restart"),
    }),
    [],
  );

  const live = useCallback(
    () => (roomRef.current?.state as unknown as ArenaState | undefined) ?? null,
    [],
  );

  const onFx = useCallback((handler: (events: FxEvent[]) => void) => {
    const handlers = fxHandlers.current;
    handlers.add(handler);
    return () => handlers.delete(handler);
  }, []);

  const onEmote = useCallback((handler: (event: EmoteEvent) => void) => {
    const handlers = emoteHandlers.current;
    handlers.add(handler);
    return () => handlers.delete(handler);
  }, []);

  const rtt = useCallback(() => rttRef.current, []);
  // O ping: um por segundo enquanto há sala.
  useEffect(() => {
    const id = setInterval(() => {
      roomRef.current?.send("ping", { t: performance.now() } satisfies PingMessage);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return {
    status,
    dropped,
    error,
    notice,
    state,
    live,
    rtt,
    sessionId,
    join,
    retry,
    leave,
    actions,
    onFx,
    onEmote,
  };
}

const RECLAIM_BACKOFF = [0, 400, 1200];

async function reclaimSeat(token: string, alive: () => boolean): Promise<Room | null> {
  for (const wait of RECLAIM_BACKOFF) {
    if (wait > 0) await new Promise((done) => setTimeout(done, wait));
    if (!alive()) return null;
    try {
      return await client.reconnect(token);
    } catch {
      // ainda não; a próxima volta tenta de novo
    }
  }
  return null;
}

function joinError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (/not found|locked|no rooms|full/i.test(message)) {
    return "Arena não encontrada, cheia ou com rodada já em andamento.";
  }
  return message || "Não foi possível entrar na arena.";
}

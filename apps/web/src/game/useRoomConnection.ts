import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Room } from "@colyseus/sdk";
import type {
  ArenaMessage,
  DiagMessage,
  NetStatsMessage,
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
  JoinRoomOptions,
} from "@bomb/shared";
import { LocalPlayer } from "./local";
import { browserConfig } from "./netconfig";
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
  /** A direção do dedo. Zero nos dois é parado. Só registra: quem anda e manda é o passo fixo (`LocalPlayer`). */
  input: (dx: number, dy: number) => void;
  /** Uma bomba, no próximo passo fixo. */
  bomb: () => void;
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
  /** O próprio boneco: previsão, envio dos comandos e o relógio da interpolação. Ausente no `/mock`. */
  local?: LocalPlayer;
  /** Liga ou desliga o diagnóstico de rede (o ping e as estatísticas do servidor). */
  setDiag?: (on: boolean) => void;
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
  const [local] = useState(() => new LocalPlayer(browserConfig()));
  const diagOn = useRef(false);

  const attach = useCallback(
    (room: Room, playerName: string, seatKey: string) => {
      roomRef.current = room;
      // Só em desenvolvimento: a sala à mão no console, para olhar o estado vivo.
      if (import.meta.env.DEV) Object.assign(window, { __room: room, __local: local });
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
      local.connect(
        (batch) => {
          try {
            room.send("input", batch);
          } catch {
            // socket morto: o comando se perde, e a reconciliação acerta o boneco quando voltar
          }
        },
        () => room.sessionId,
      );
      if (diagOn.current) room.send("diag", { on: true } satisfies DiagMessage);
      room.onStateChange(() => {
        // Todo patch: a previsão se acerta com o servidor e o relógio anota a chegada.
        local.onState(room.state as unknown as ArenaState, performance.now());
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
      room.onMessage("net", (stats: NetStatsMessage) => {
        local.setServerStats(stats);
      });
      room.onDrop(() => {
        local.setOnline(false);
        setDropped(true);
      });
      room.onReconnect(() => {
        local.setOnline(true);
        setDropped(false);
        token = room.reconnectionToken;
        saveSession(code, { reconnectionToken: token, playerName, seatKey });
      });
      room.onLeave(() => {
        local.setOnline(false);
        roomRef.current = null;
        setStatus("lost");
      });
    },
    [code, local],
  );

  /* O ping nativo do Colyseus, uma vez por segundo, só com o diagnóstico aberto. */
  const [diag, setDiagState] = useState(false);
  useEffect(() => {
    if (!diag) return;
    const timer = setInterval(() => roomRef.current?.ping((ms) => local.measurePing(ms)), 1000);
    return () => clearInterval(timer);
  }, [diag, local]);
  const setDiag = useCallback((on: boolean) => {
    diagOn.current = on;
    setDiagState(on);
    try {
      roomRef.current?.send("diag", { on } satisfies DiagMessage);
    } catch {
      // sem conexão: vai de novo no `attach`
    }
  }, []);

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

  const actions = useMemo<RoomActions>(
    () => ({
      start: () => roomRef.current?.send("start"),
      arena: (size) => roomRef.current?.send("arena", { size } satisfies ArenaMessage),
      time: (minutes) => roomRef.current?.send("time", { minutes } satisfies TimeMessage),
      theme: (themeId) => roomRef.current?.send("theme", { themeId } satisfies ThemeMessage),
      input: (dx, dy) => local.setDirection(dx, dy),
      bomb: () => local.requestBomb(),
      emote: (emote) => roomRef.current?.send("emote", { emote } satisfies EmoteMessage),
      restart: () => roomRef.current?.send("restart"),
    }),
    [local],
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

  return {
    status,
    dropped,
    error,
    notice,
    state,
    live,
    local,
    setDiag,
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

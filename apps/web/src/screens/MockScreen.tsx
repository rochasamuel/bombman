import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BombGame,
  GameError,
  MATCH_TIME,
  type ArenaState,
  type EmoteEvent,
  type FxEvent,
  type GamePlayer,
  type PublicPlayer,
} from "@bomb/shared";
import { Arena } from "../components/Arena";
import type { RoomActions } from "../game/useRoomConnection";

/**
 * Uma arena de mentira, sem servidor: `/mock`. O MESMO motor da sala roda
 * aqui, no navegador, com o relógio do `requestAnimationFrame` no lugar do
 * relógio do Colyseus — dá para andar, soltar bomba, pegar item e morrer, e a
 * arte toda passa pelos mesmos caminhos da partida de verdade. Os outros três
 * são bonecos de pé nos cantos: não andam, mas explodem. O relógio da rodada
 * não anda — a arena nunca acaba por tempo.
 *
 * O sorteio é fixo, para a arena nascer igual toda vez que a página abre.
 */
export function MockScreen() {
  const game = useMemo(() => buildGame(), []);
  const first = useMemo(() => snapshot(game), [game]);
  /** O retrato vivo, refeito a cada quadro: o canvas lê daqui, sem render. */
  const liveRef = useRef<ArenaState>(first);
  const [state, setState] = useState(first);
  const fxHandlers = useRef(new Set<(events: FxEvent[]) => void>());
  const emoteHandlers = useRef(new Set<(event: EmoteEvent) => void>());

  /*
   * O relógio. Avança o motor a cada quadro e refaz o retrato vivo; o React só
   * recebe um novo quando muda algo que o painel desenha — a mesma assinatura
   * que a conexão de verdade usa, para o /mock se comportar como a sala.
   */
  useEffect(() => {
    let handle = 0;
    let last = performance.now();
    let signature = "";
    const loop = (now: number) => {
      // Aba escondida não recebe quadro: ao voltar, não se avança a ausência inteira.
      const dt = Math.min(250, now - last);
      last = now;
      game.tick(dt);
      // O relógio da rodada fica congelado: o /mock é para olhar, não para
      // acabar por tempo. Bombas, chamas e mortes seguem o relógio normal.
      game.timeLeft = MATCH_TIME;
      const next = snapshot(game);
      liveRef.current = next;
      const key = signatureOf(next);
      if (key !== signature) {
        signature = key;
        setState(next);
      }
      const events = game.takeFx();
      if (events.length > 0) for (const handler of fxHandlers.current) handler(events);
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [game]);

  const live = useCallback(() => liveRef.current, []);

  const actions = useMemo<RoomActions>(
    () => ({
      start: () => quietly(() => game.start()),
      input: (dx, dy) => game.setInput(ME, dx, dy),
      bomb: () => game.requestBomb(ME),
      emote: (emote) => {
        for (const handler of emoteHandlers.current) handler({ by: ME, emote });
      },
      restart: () => quietly(() => game.start()),
    }),
    [game],
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

  return (
    <Arena
      state={state}
      live={live}
      sessionId={ME}
      actions={actions}
      onFx={onFx}
      onEmote={onEmote}
      onExit={() => history.back()}
    />
  );
}

/** Quem anda: o primeiro da lista, vermelho, no canto de cima à esquerda. */
const ME = "p0";

const EXTRAS = ["Bruno", "Carla", "Davi"];

function buildGame(): BombGame {
  const game = new BombGame(seeded(7));
  game.addPlayer(ME, "k0", "Você");
  EXTRAS.forEach((name, i) => game.addPlayer(`p${i + 1}`, `k${i + 1}`, name));
  game.start();
  // Só em desenvolvimento: o motor à mão no console, como a sala (`__room`).
  if (import.meta.env.DEV) (window as unknown as { __game?: BombGame }).__game = game;
  return game;
}

/** Um gerador congruente linear: o bastante para a arena nascer sempre igual. */
function seeded(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
}

/** O motor reclama de quem pede o que não pode (reiniciar no meio); aqui ninguém precisa ouvir. */
function quietly(action: () => void) {
  try {
    action();
  } catch (error) {
    if (!(error instanceof GameError)) throw error;
  }
}

/** O retrato do motor no formato do estado público, como a sala espelha. */
function snapshot(game: BombGame): ArenaState {
  return {
    roomName: "Arena de mentira",
    hostId: ME,
    phase: game.phase,
    maxPlayers: 4,
    players: game.players.map((player) => publicPlayer(game, player)),
    grid: game.grid,
    bombs: game.bombs.map(({ id, cx, cy, owner }) => ({ id, cx, cy, owner })),
    flames: game.flames.map(({ cx, cy, kind }) => ({ cx, cy, kind })),
    powerups: game.powerups.map(({ cx, cy, kind }) => ({ cx, cy, kind })),
    timeLeft: Math.round(game.timeLeft),
    countdown: game.countdown,
    winnerId: game.winnerId,
    round: game.round,
    log: game.log,
  };
}

function publicPlayer(game: BombGame, player: GamePlayer): PublicPlayer {
  return {
    id: player.id,
    name: player.name,
    slot: player.slot,
    connected: true,
    // Duas casas, como a sala manda: o boneco não treme no quinto dígito.
    x: Math.round(player.x * 100) / 100,
    y: Math.round(player.y * 100) / 100,
    dir: player.dir,
    moving: player.moving,
    alive: player.alive,
    dying: !player.alive && game.time < player.dyingUntil,
    lives: player.lives,
    range: player.range,
    bombs: player.bombs,
    speed: player.speed,
    invulnerable: player.alive && game.time < player.invulnerableUntil,
    curse: player.curse,
    wins: player.wins,
  };
}

/** Só o que o React desenha em volta do canvas; posição e chama ficam de fora. */
function signatureOf(state: ArenaState): string {
  return [
    state.phase,
    state.countdown,
    state.winnerId,
    state.round,
    Math.ceil(state.timeLeft / 1000),
    state.log.length,
    state.log.at(-1),
    ...state.players.map(
      (p) => `${p.id}${p.lives}${p.alive}${p.range}${p.bombs}${p.speed}${p.curse}${p.wins}`,
    ),
  ].join("|");
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BombGame,
  DEFAULT_ARENA,
  GameError,
  ARENA_SIZE_NAME,
  DEFAULT_MATCH_MINUTES,
  DEFAULT_THEME,
  arenasOfSize,
  isArenaSize,
  pickArena,
  type ArenaSize,
  minMinutesFor,
  arenaById,
  themeById,
  type ArenaDefinition,
  type ArenaState,
  type EmoteEvent,
  type FxEvent,
  type GamePlayer,
  type PublicPlayer,
} from "@bomb/shared";
import { Arena } from "../components/Arena";
import { ArenaPicker } from "../components/ArenaPicker";
import { TimePicker } from "../components/TimePicker";
import type { RoomActions } from "../game/useRoomConnection";

/**
 * Uma arena de mentira, sem servidor: `/mock`. O MESMO motor da sala roda
 * aqui, no navegador, com o relógio do `requestAnimationFrame` no lugar do
 * relógio do Colyseus — dá para andar, soltar bomba, pegar item e morrer, e a
 * arte toda passa pelos mesmos caminhos da partida de verdade. Os outros três
 * são bonecos de pé nos cantos: não andam, mas explodem. O relógio da rodada
 * não anda — a arena nunca acaba por tempo.
 *
 * O sorteio dos itens que os blocos deixam é fixo; a planta, como na sala
 * de verdade, é sorteada entre as três do tamanho a cada rodada. O tamanho e
 * o tema se escolhem antes, numa sala de espera de mentira com a MESMA
 * escolha da sala de verdade. A escolha vai para a URL
 * (`/mock?arena=small&theme=volcano`), para o F5 voltar a ela; uma planta na
 * URL (`?arena=small-maze`) joga só ela, para olhar uma planta de perto.
 * "Sair" da arena volta para a escolha.
 */
export function MockScreen({ arena = "", theme = "" }: { arena?: string; theme?: string }) {
  // `?arena=` aceita um tamanho (sorteio) ou uma planta (fixa, para olhar de perto).
  const fixed = arenaById(arena);
  const [size, setSize] = useState<ArenaSize>(() => (isArenaSize(arena) ? arena : (fixed ?? DEFAULT_ARENA).size));
  const [themeId, setThemeId] = useState(() => (themeById(theme) ?? DEFAULT_THEME).id);
  const [playing, setPlaying] = useState(false);
  const [minutes, setMinutes] = useState<number>(DEFAULT_MATCH_MINUTES);
  const shownMinutes = Math.max(minutes, minMinutesFor(size));
  const pinned = fixed && fixed.size === size ? fixed : undefined;

  const url = (size: string, themeId: string) => `/mock?arena=${size}&theme=${themeId}`;
  const choose = (next: ArenaSize) => {
    setSize(next);
    history.replaceState({}, "", url(next, themeId));
  };
  const chooseTheme = (id: string) => {
    if (!themeById(id)) return;
    setThemeId(id);
    history.replaceState({}, "", url(pinned?.id ?? size, id));
  };

  if (playing) {
    return (
      <MockMatch size={size} pinned={pinned} themeId={themeId} minutes={shownMinutes} onExit={() => setPlaying(false)} />
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <div className="px-slab flex flex-col items-center gap-2 p-5">
        <h1 className="px-title">Arena de mentira</h1>
        <p className="px-label text-center">Sem servidor: o motor roda aqui, e você é o vermelho</p>
      </div>
      <ArenaPicker
        arenaId={arenasOfSize(size)[0].id}
        themeId={themeId}
        canChoose
        onChoose={choose}
        onChooseTheme={chooseTheme}
      />
      <TimePicker minutes={shownMinutes} size={size} canChoose onChoose={setMinutes} />
      <button type="button" className="px-btn px-btn-primary" onClick={() => setPlaying(true)}>
        {pinned ? `Começar na ${pinned.name}` : `Começar na arena ${ARENA_SIZE_NAME[size].toLowerCase()}`}
      </button>
      <button type="button" className="px-link" onClick={() => history.back()}>
        voltar
      </button>
    </main>
  );
}

/** A partida de mentira numa arena: o motor, o relógio e a tela da arena. */
function MockMatch({
  size,
  pinned,
  themeId,
  minutes,
  onExit,
}: {
  size: ArenaSize;
  /** Uma planta fixa (da URL); sem ela, cada rodada sorteia uma do tamanho. */
  pinned?: ArenaDefinition;
  themeId: string;
  minutes: number;
  onExit: () => void;
}) {
  const draw = useCallback(() => pinned ?? pickArena(size), [pinned, size]);
  const game = useMemo(() => buildGame(draw(), minutes), [draw, minutes]);
  /** O tema de mentira: um estado por fora do motor, como na sala. */
  const themeRef = useRef(themeId);
  const first = useMemo(() => snapshot(game, themeId), [game, themeId]);
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
      game.timeLeft = game.matchMinutes * 60_000;
      const next = snapshot(game, themeRef.current);
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
      start: () =>
        quietly(() => {
          game.setArena(draw());
          game.start();
        }),
      arena: (next) => quietly(() => game.setArena(pickArena(next))),
      time: (minutes) => quietly(() => game.setMatchMinutes(minutes)),
      theme: (id) => {
        if (themeById(id)) themeRef.current = id;
      },
      input: (dx, dy) => game.setInput(ME, dx, dy),
      bomb: () => game.requestBomb(ME),
      emote: (emote) => {
        for (const handler of emoteHandlers.current) handler({ by: ME, emote });
      },
      restart: () =>
        quietly(() => {
          game.setArena(draw());
          game.start();
        }),
    }),
    [game, draw],
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
      onExit={onExit}
    />
  );
}

/** Quem anda: o primeiro da lista, vermelho, no canto de cima à esquerda. */
const ME = "p0";

const EXTRAS = ["Bruno", "Carla", "Davi"];

function buildGame(arena: ArenaDefinition, minutes: number): BombGame {
  const game = new BombGame(seeded(7), arena);
  game.setMatchMinutes(minutes);
  game.addPlayer(ME, "k0", "Você");
  EXTRAS.forEach((name, i) => game.addPlayer(`p${i + 1}`, `k${i + 1}`, name));
  game.start();
  // Só em desenvolvimento: o motor à mão no console, como a sala (`__room`).
  if (import.meta.env.DEV) (window as unknown as { __game?: BombGame }).__game = game;
  return game;
}

/** Um gerador congruente linear: o bastante para os itens caírem sempre iguais. */
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
function snapshot(game: BombGame, themeId: string): ArenaState {
  return {
    roomName: "Arena de mentira",
    hostId: ME,
    phase: game.phase,
    maxPlayers: 4,
    arenaId: game.arena.id,
    themeId,
    cols: game.cols,
    rows: game.rows,
    matchMinutes: game.matchMinutes,
    players: game.players.map((player) => publicPlayer(game, player)),
    grid: game.grid,
    bombs: game.bombs.map(({ id, cx, cy, x, y, owner, pierce, passers }) => ({
      id,
      cx,
      cy,
      x,
      y,
      owner,
      pierce,
      passers: game.players.reduce((mask, p) => (passers.has(p.id) ? mask | (1 << p.slot) : mask), 0),
    })),
    flames: game.flames.map(({ cx, cy, kind, born }) => ({ cx, cy, kind, born })),
    powerups: game.powerups.map(({ cx, cy, kind }) => ({ cx, cy, kind })),
    timeLeft: Math.round(game.timeLeft),
    // O /mock não tem relógio de servidor: a interpolação usa a hora da tela (ver `render.ts`).
    tick: 0,
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
    kick: player.kick,
    pierce: player.pierce,
    invulnerable: player.alive && game.time < player.invulnerableUntil,
    curse: player.curse,
    wins: player.wins,
    seq: player.queue.ack,
  };
}

/** Só o que o React desenha em volta do canvas; posição e chama ficam de fora. */
function signatureOf(state: ArenaState): string {
  return [
    state.phase,
    state.arenaId,
    state.themeId,
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

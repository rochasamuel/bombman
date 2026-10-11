import { useState } from "react";
import { ARENA_SIZE_NAME, MIN_PLAYERS, SLOT_COLORS, SLOT_NAMES, arenaById, arenasOfSize, type ArenaSize } from "@bomb/shared";
import { characterIdle } from "../art/atlas";
import { Arena } from "../components/Arena";
import { ArenaPicker } from "../components/ArenaPicker";
import { TimePicker } from "../components/TimePicker";
import { PixelSprite } from "../components/PixelSprite";
import { useRoomConnection } from "../game/useRoomConnection";
import { navigate, roomUrl } from "../lib/router";
import { loadSetup, saveSetup } from "../lib/session";
import { useUi } from "../store/ui";

export function RoomScreen({ code }: { code: string }) {
  const connection = useRoomConnection(code);
  const { state, status } = connection;

  const exit = () => {
    connection.leave();
    navigate("/");
  };

  return (
    <>
      {status === "naming" && (
        <NameGate code={code} error={connection.error} onJoin={connection.join} />
      )}

      {status === "lost" && (
        <Disconnected error={connection.error} onRetry={connection.retry} onExit={exit} />
      )}

      {status === "connecting" && <Centered title="Conectando" />}

      {status === "connected" && !state && <Centered title="Sincronizando" />}

      {status === "connected" && state && state.phase === "lobby" && (
        <Lobby code={code} connection={connection} />
      )}

      {status === "connected" && state && state.phase !== "lobby" && (
        <Arena
          state={state}
          live={connection.live}
          sessionId={connection.sessionId}
          actions={connection.actions}
          onFx={connection.onFx}
          onEmote={connection.onEmote}
          onExit={exit}
        />
      )}

      {connection.dropped && (
        <p
          className="px-label fixed inset-x-0 top-0 z-50 py-1 text-center"
          style={{ background: "var(--mark)", color: "var(--ink)" }}
        >
          Conexão caiu · reconectando
        </p>
      )}

      {connection.notice && (
        <p
          className="px-slab px-label fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm px-4 py-2 text-center"
          style={{ color: "var(--mark)" }}
        >
          {connection.notice}
        </p>
      )}
    </>
  );
}

function Lobby({
  code,
  connection,
}: {
  code: string;
  connection: ReturnType<typeof useRoomConnection>;
}) {
  const [copied, setCopied] = useState(false);
  const state = connection.state!;
  const isHost = state.hostId === connection.sessionId;
  const canShare = typeof navigator.share === "function";
  const arena = arenaById(state.arenaId);

  /** O host escolheu: a sala confere e espalha; a próxima sala deste navegador já abre com ela. */
  const chooseArena = (size: ArenaSize) => {
    connection.actions.arena(size);
    // A próxima sala deste navegador abre no mesmo tamanho (a planta é sorteada lá).
    saveSetup({ ...loadSetup(), arenaId: arenasOfSize(size)[0].id });
  };
  const chooseTime = (minutes: number) => {
    connection.actions.time(minutes);
    saveSetup({ ...loadSetup(), minutes });
  };
  const chooseTheme = (themeId: string) => {
    connection.actions.theme(themeId);
    saveSetup({ ...loadSetup(), themeId });
  };

  const copy = async () => {
    await navigator.clipboard.writeText(roomUrl(code));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const invite = async () => {
    if (!navigator.share) return copy();
    try {
      await navigator.share({
        title: state.roomName,
        text: `Entre na minha arena de Bombman. Código: ${code}`,
        url: roomUrl(code),
      });
    } catch {
      // Cancelar a folha é uma resposta, não um erro: nada a fazer.
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-5 p-6">
      <div className="px-slab flex flex-col items-center gap-2 p-5">
        <h1 className="px-title">{state.roomName}</h1>
        <p className="px-label">Código da arena</p>
        <p className="px-code">{code}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="px-label">Link do convite</span>
            <input readOnly value={roomUrl(code)} className="px-input text-xs" />
          </label>
          <button type="button" onClick={copy} className="px-btn">
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        {canShare && (
          <button type="button" onClick={invite} className="px-btn">
            Convidar por outro app
          </button>
        )}
      </div>

      <div className="px-slab flex flex-col gap-2 p-5">
        <p className="px-label">
          Jogadores · {state.players.length} de {state.maxPlayers}
        </p>
        <ul className="flex flex-col gap-2">
          {[...state.players]
            .sort((a, b) => a.slot - b.slot)
            .map((player) => (
              <li key={player.id} className="flex items-center gap-3 text-sm">
                <PixelSprite frame={characterIdle(player.slot, "down", 0)} scale={2} />
                <span
                  className="inline-block size-2"
                  style={{ background: player.connected ? "var(--live)" : "var(--gloss)" }}
                />
                {player.id === state.hostId && "👑"}
                <span style={{ color: "var(--paper-hi)" }}>{player.name}</span>
                <span className="px-label" style={{ color: SLOT_COLORS[player.slot] }}>
                  P{player.slot + 1} · {SLOT_NAMES[player.slot]}
                </span>
                {player.id === connection.sessionId && <span className="px-label">você</span>}
              </li>
            ))}
        </ul>
      </div>

      <ArenaPicker
        arenaId={state.arenaId}
        themeId={state.themeId}
        canChoose={isHost}
        onChoose={chooseArena}
        onChooseTheme={chooseTheme}
      />
      <TimePicker minutes={state.matchMinutes} size={arena?.size ?? "large"} canChoose={isHost} onChoose={chooseTime} />

      {isHost ? (
        <button
          type="button"
          onClick={connection.actions.start}
          disabled={state.players.length < MIN_PLAYERS}
          className="px-btn px-btn-primary"
        >
          {state.players.length < MIN_PLAYERS
            ? `Faltam ${MIN_PLAYERS - state.players.length} para começar`
            : `Começar na arena ${ARENA_SIZE_NAME[arena?.size ?? "large"].toLowerCase()}`}
        </button>
      ) : (
        <p className="px-label text-center">
          Aguardando o host começar<span className="px-caret">▌</span>
        </p>
      )}

      <button
        type="button"
        onClick={() => {
          connection.leave();
          navigate("/");
        }}
        className="px-link"
      >
        sair da arena
      </button>
    </main>
  );
}

function NameGate({
  code,
  error,
  onJoin,
}: {
  code: string;
  error: string;
  onJoin: (name: string) => void;
}) {
  const playerName = useUi((ui) => ui.playerName);
  const setPlayerName = useUi((ui) => ui.setPlayerName);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-5 p-6">
      <div className="px-slab flex flex-col items-center gap-2 p-5">
        <p className="px-label">Entrando na arena</p>
        <p className="px-code">{code}</p>
      </div>

      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          onJoin(playerName.trim());
        }}
      >
        <label className="flex flex-col gap-1">
          <span className="px-label">Seu nome</span>
          <input
            className="px-input"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            maxLength={16}
            required
            autoFocus
          />
        </label>
        <button type="submit" className="px-btn px-btn-primary">
          Entrar na arena
        </button>
      </form>

      {error && (
        <p className="px-label" style={{ color: "var(--ink-red)" }}>
          {error}
        </p>
      )}
      <button type="button" onClick={() => navigate("/")} className="px-link">
        voltar ao início
      </button>
    </main>
  );
}

function Disconnected({
  error,
  onRetry,
  onExit,
}: {
  error: string;
  onRetry: () => void;
  onExit: () => void;
}) {
  return (
    <Centered title="Fora da arena">
      <p className="text-sm" style={{ color: "var(--paper-sh)" }}>
        {error || "O lugar na arena não pôde ser recuperado."}
      </p>
      <div className="flex justify-center gap-3">
        <button type="button" onClick={onRetry} className="px-btn px-btn-primary">
          Tentar de novo
        </button>
        <button type="button" onClick={onExit} className="px-btn">
          Início
        </button>
      </div>
    </Centered>
  );
}

function Centered({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="grid min-h-screen place-content-center p-6">
      <div className="px-slab flex flex-col items-center gap-4 p-8 text-center">
        <h1 className="px-title">
          {title}
          <span className="px-caret">▌</span>
        </h1>
        {children}
      </div>
    </main>
  );
}

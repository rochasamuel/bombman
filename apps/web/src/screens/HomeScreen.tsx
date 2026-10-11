import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MAX_PLAYERS, MIN_PLAYERS, type CreateRoomOptions } from "@bomb/shared";
import { characterIdle } from "../art/atlas";
import { PixelSprite } from "../components/PixelSprite";
import { ROOM_NAME, client } from "../lib/colyseus";
import { setPendingRoom } from "../lib/pendingRoom";
import { navigate } from "../lib/router";
import { loadSetup, newSeatKey, saveSession, saveSetup } from "../lib/session";
import { useUi } from "../store/ui";

export function HomeScreen() {
  const playerName = useUi((ui) => ui.playerName);
  const setPlayerName = useUi((ui) => ui.setPlayerName);
  const [setup] = useState(loadSetup);
  const [roomName, setRoomName] = useState(setup.roomName);
  const [maxPlayers, setMaxPlayers] = useState(setup.maxPlayers);
  const [code, setCode] = useState("");

  const createRoom = useMutation({
    mutationFn: async (options: CreateRoomOptions) => {
      const room = await client.create(ROOM_NAME, options);
      saveSession(room.roomId, {
        reconnectionToken: room.reconnectionToken,
        playerName: options.playerName,
        seatKey: options.seatKey,
      });
      saveSetup({ ...setup, roomName: options.roomName, maxPlayers: options.maxPlayers });
      setPendingRoom(room);
      return room.roomId;
    },
    onSuccess: (roomId) => navigate(`/room/${roomId}`),
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 p-6">
      {/* O logotipo é o próprio elenco: os quatro, na ordem dos cantos. */}
      <div className="flex items-end justify-center gap-2">
        {[0, 1, 2, 3].map((slot) => (
          <PixelSprite key={slot} frame={characterIdle(slot, "down", 0)} scale={3} />
        ))}
      </div>
      <h1 className="px-title text-center" style={{ fontSize: 26 }}>
        Bombman
      </h1>

      <form
        className="px-slab flex flex-col gap-4 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          createRoom.mutate({
            roomName,
            playerName: playerName.trim(),
            maxPlayers,
            seatKey: newSeatKey(),
            // A arena da última vez; a escolha mesmo é na sala, antes de começar.
            arenaId: setup.arenaId,
            minutes: setup.minutes,
            themeId: setup.themeId,
          });
        }}
      >
        <h2 className="px-title">Abrir uma arena</h2>

        <label className="flex flex-col gap-1">
          <span className="px-label">Nome da arena</span>
          <input
            className="px-input"
            value={roomName}
            onChange={(event) => setRoomName(event.target.value)}
            maxLength={40}
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="px-label">Seu nome</span>
          <input
            className="px-input"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            maxLength={16}
            required
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="px-label">Lugares · {maxPlayers}</span>
          <input
            type="range"
            min={MIN_PLAYERS}
            max={MAX_PLAYERS}
            value={maxPlayers}
            onChange={(event) => setMaxPlayers(Number(event.target.value))}
            style={{ accentColor: "var(--mark)" }}
          />
        </label>

        <button type="submit" disabled={createRoom.isPending} className="px-btn px-btn-primary">
          {createRoom.isPending ? "Abrindo…" : "Abrir arena"}
        </button>
        {createRoom.isError && (
          <p className="px-label" style={{ color: "var(--ink-red)" }}>
            {createRoom.error.message}
          </p>
        )}
      </form>

      <form
        className="flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          navigate(`/room/${code.trim().toUpperCase()}`);
        }}
      >
        <label className="flex flex-1 flex-col gap-1">
          <span className="px-label">Entrar com um código</span>
          <input
            className="px-input uppercase"
            placeholder="A7K92"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            maxLength={8}
            required
          />
        </label>
        <button type="submit" className="px-btn">
          Entrar
        </button>
      </form>

      <p className="px-label text-center" style={{ letterSpacing: "0.06em", textTransform: "none" }}>
        Até 4 jogadores. Setas ou WASD andam, espaço solta a bomba. Última pessoa de pé vence.
      </p>

      <footer className="px-label flex flex-wrap items-baseline justify-center gap-x-2">
        <span>desenvolvido por</span>
        <a
          className="px-link px-credit"
          href="https://github.com/rochasamuel"
          target="_blank"
          rel="noopener noreferrer"
        >
          Samuel Rocha ↗
        </a>
      </footer>
    </main>
  );
}

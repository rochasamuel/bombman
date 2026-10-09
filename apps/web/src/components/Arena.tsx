import { useEffect, useRef, useState } from "react";
import { SLOT_COLORS, type ArenaState, type FxEvent } from "@bomb/shared";
import { checkSprites } from "../art/atlas";
import { ArenaRenderer, VIEW_H, VIEW_W } from "../game/render";
import { useEmotes } from "../game/useEmotes";
import { useInput } from "../game/useInput";
import type { RoomConnection } from "../game/useRoomConnection";
import { playSound } from "../lib/sound";
import { useMediaQuery } from "../lib/useMediaQuery";
import { useUi } from "../store/ui";
import { ConfigMenu } from "./ConfigMenu";
import { EmotePicker } from "./EmotePicker";
import { Hud } from "./Hud";
import { SystemLog } from "./SystemLog";
import { TouchPad } from "./TouchPad";

type Props = {
  /** O retrato por patch, para o painel. */
  state: ArenaState;
  /** O estado vivo, para o canvas. Nulo na arena de mentira do /mock. */
  live: RoomConnection["live"];
  sessionId: string;
  actions: RoomConnection["actions"];
  onFx?: RoomConnection["onFx"];
  onEmote?: RoomConnection["onEmote"];
  onExit: () => void;
};

checkSprites();

/**
 * A arena inteira: o cabeçalho, o painel, o canvas e os controles. O canvas
 * redesenha por `requestAnimationFrame` lendo o estado vivo; o React só
 * redesenha o que está em volta, quando o retrato muda.
 */
export function Arena({ state, live, sessionId, actions, onFx, onEmote, onExit }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<ArenaRenderer | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  /** O retrato mais novo, para o laço de desenho ler sem reiniciar a cada patch. */
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [scale, setScale] = useState(3);
  const bubbles = useEmotes(onEmote);
  const touchPad = useUi((ui) => ui.touchPad);
  const coarse = useMediaQuery("(pointer: coarse)");
  const showPad = touchPad === "on" || (touchPad === "auto" && coarse);

  const me = state.players.find((p) => p.id === sessionId);
  const playing = state.phase === "playing" && !!me?.alive;
  const controls = useInput(actions, playing);

  /* A escala é inteira e a maior que cabe; o canvas em si segue a densidade da tela. */
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const fit = () => {
      const width = frame.clientWidth;
      const height = window.innerHeight - 200;
      const next = Math.max(1, Math.min(4, Math.floor(Math.min(width / VIEW_W, height / VIEW_H))));
      setScale(next);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    addEventListener("resize", fit);
    return () => {
      observer.disconnect();
      removeEventListener("resize", fit);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = (rendererRef.current ??= new ArenaRenderer(canvas));
    renderer.setScale(scale);
    let handle = 0;
    const loop = (now: number) => {
      // O estado vivo primeiro; o retrato é a reserva do /mock, que não tem um.
      renderer.draw(live() ?? stateRef.current, now);
      handle = requestAnimationFrame(loop);
    };
    handle = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(handle);
  }, [live, scale]);

  /* Os sons seguem os eventos, não o estado. */
  useEffect(() => {
    if (!onFx) return;
    return onFx((events: FxEvent[]) => {
      for (const event of events) {
        if (event.k === "place") playSound("place");
        else if (event.k === "explode") playSound("explode", 0.35);
        else if (event.k === "pickup") playSound("pickup");
        else if (event.k === "die") playSound("die");
        else if (event.k === "start") playSound("go");
        else if (event.k === "finish" && event.winner === sessionId) playSound("victory");
      }
    });
  }, [onFx, sessionId]);

  useEffect(() => {
    if (state.phase === "countdown" && state.countdown > 0) playSound("tick");
  }, [state.phase, state.countdown]);

  const isHost = state.hostId === sessionId;
  const winner = state.players.find((p) => p.id === state.winnerId);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center gap-3 p-3">
      <header className="flex w-full items-center justify-between gap-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <h1 className="px-title truncate">{state.roomName}</h1>
          <span className="px-label whitespace-nowrap">rodada {state.round}</span>
        </div>
        <div className="flex items-center gap-3">
          <ConfigMenu />
          <button type="button" className="px-link" onClick={onExit}>
            sair
          </button>
        </div>
      </header>

      <Hud state={state} sessionId={sessionId} bubbles={bubbles} />

      <div ref={frameRef} className="relative flex w-full justify-center">
        <canvas
          ref={canvasRef}
          className="bomb-canvas"
          style={{ width: VIEW_W * scale, height: VIEW_H * scale }}
        />

        {state.phase === "countdown" && (
          <div className="bomb-overlay">
            <span key={state.countdown} className="bomb-count px-pop">
              {state.countdown}
            </span>
          </div>
        )}

        {state.phase === "finished" && (
          <div className="bomb-overlay">
            <div className="px-slab px-pop flex flex-col items-center gap-3 p-6 text-center">
              <p className="px-label">Fim da rodada</p>
              <p className="px-title" style={{ color: winner ? SLOT_COLORS[winner.slot] : undefined }}>
                {winner ? `${winner.name} venceu!` : "Empate"}
              </p>
              {isHost ? (
                <button type="button" className="px-btn px-btn-primary" onClick={actions.restart}>
                  Jogar de novo
                </button>
              ) : (
                <p className="px-label">
                  Aguardando o host<span className="px-caret">▌</span>
                </p>
              )}
            </div>
          </div>
        )}

        {state.phase === "playing" && me && !me.alive && !me.dying && me.lives === 0 && (
          <p
            className="px-label absolute inset-x-0 bottom-2 text-center"
            style={{ color: "var(--mark)" }}
          >
            Você está fora · assistindo
          </p>
        )}
      </div>

      <div className="flex w-full flex-col items-stretch gap-3 md:flex-row md:items-start md:justify-between">
        {showPad ? (
          <TouchPad controls={controls} />
        ) : (
          <p className="px-label text-center md:text-left">
            setas ou WASD andam · espaço solta a bomba
          </p>
        )}
        <div className="flex items-start justify-center gap-3">
          <EmotePicker onSend={actions.emote} />
          <SystemLog messages={state.log} />
        </div>
      </div>
    </main>
  );
}

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_MATCH_MINUTES,
  DEFAULT_THEME,
  MATCH_TIME,
  fillGrid,
  type ArenaDefinition,
  type ArenaState,
} from "@bomb/shared";
import { onReady } from "../art/atlas";
import { ArenaRenderer, viewOf } from "../game/render";

/**
 * A miniatura de uma arena: a planta de verdade, desenhada pelo MESMO
 * desenhista da partida (`ArenaRenderer`), com o mesmo tileset, só que num
 * canvas menor — e com os quatro bonecos parados nos cantos em que nascem.
 * Ocupa a largura que lhe derem; a altura sai da proporção da arena.
 */
export function ArenaPreview({ arena, themeId = DEFAULT_THEME.id }: { arena: ArenaDefinition; themeId?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);
  const view = viewOf(arena.cols, arena.rows);
  const scale = width / view.w;

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setWidth(box.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scale) return;
    const renderer = new ArenaRenderer(canvas);
    const state = stillLife(arena, themeId);
    // Desenha agora e de novo quando o atlas chegar.
    return onReady(() => {
      renderer.fit(scale, arena.cols, arena.rows);
      renderer.draw(state, 0);
    });
  }, [arena, themeId, scale]);

  return (
    <div ref={boxRef} className="w-full">
      <canvas
        ref={canvasRef}
        className="bomb-pixel"
        style={{ width: width || undefined, height: width ? Math.round(view.shownH * scale) : undefined }}
        role="img"
        aria-label={`${arena.name}, ${arena.cols} por ${arena.rows}`}
      />
    </div>
  );
}

/** A arena parada, como nasce: a planta montada e os quatro de pé nos cantos. */
function stillLife(arena: ArenaDefinition, themeId: string): ArenaState {
  return {
    roomName: arena.name,
    hostId: "",
    phase: "lobby",
    maxPlayers: 4,
    arenaId: arena.id,
    themeId,
    matchMinutes: DEFAULT_MATCH_MINUTES,
    cols: arena.cols,
    rows: arena.rows,
    tick: 0,
    players: arena.spawns.map(([sx, sy], slot) => ({
      id: `p${slot}`,
      name: "",
      slot,
      connected: true,
      x: sx + 0.5,
      y: sy + 0.5,
      dir: 0,
      moving: false,
      alive: true,
      dying: false,
      lives: 3,
      range: 1,
      bombs: 1,
      kick: false,
      pierce: false,
      speed: 0,
      invulnerable: false,
      curse: "",
      ghost: false,
      remote: false,
      wins: 0,
      seq: 0,
    })),
    grid: fillGrid([], arena),
    bombs: [],
    flames: [],
    powerups: [],
    timeLeft: MATCH_TIME,
    countdown: 0,
    hurry: 0,
    winnerId: "",
    round: 0,
    log: [],
  };
}

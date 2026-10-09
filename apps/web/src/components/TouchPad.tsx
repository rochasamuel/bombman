import { useState } from "react";
import type { Dir, InputControls } from "../game/useInput";

/**
 * O direcional na tela, para quem joga no dedo. Quatro setas e o botão da
 * bomba, grandes o bastante para o polegar. Eventos de ponteiro, e não de
 * clique: a seta vale ENQUANTO está apertada, e o dedo pode escorregar de uma
 * para a outra sem levantar — daí capturar o ponteiro e seguir o alvo.
 */
export function TouchPad({ controls }: { controls: InputControls }) {
  const [down, setDown] = useState<Dir | null>(null);
  const [firing, setFiring] = useState(false);

  const start = (dir: Dir) => (event: React.PointerEvent) => {
    event.preventDefault();
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    setDown(dir);
    controls.press(dir);
  };
  const stop = (dir: Dir) => (event: React.PointerEvent) => {
    event.preventDefault();
    setDown((current) => (current === dir ? null : current));
    controls.release(dir);
  };

  const key = (dir: Dir, label: string, style: React.CSSProperties) => (
    <button
      type="button"
      className={["bomb-pad-key", down === dir && "is-down"].filter(Boolean).join(" ")}
      style={style}
      onPointerDown={start(dir)}
      onPointerUp={stop(dir)}
      onPointerCancel={stop(dir)}
      onPointerLeave={stop(dir)}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={dir}
    >
      {label}
    </button>
  );

  return (
    <div className="flex w-full items-center justify-between px-2">
      <div className="bomb-pad">
        {key("up", "▲", { gridColumn: 2, gridRow: 1 })}
        {key("left", "◀", { gridColumn: 1, gridRow: 2 })}
        {key("right", "▶", { gridColumn: 3, gridRow: 2 })}
        {key("down", "▼", { gridColumn: 2, gridRow: 3 })}
      </div>
      <button
        type="button"
        className={["bomb-fire", firing && "is-down"].filter(Boolean).join(" ")}
        onPointerDown={(event) => {
          event.preventDefault();
          setFiring(true);
          controls.bomb();
        }}
        onPointerUp={() => setFiring(false)}
        onPointerCancel={() => setFiring(false)}
        onPointerLeave={() => setFiring(false)}
        onContextMenu={(event) => event.preventDefault()}
        aria-label="bomba"
      >
        💣
      </button>
    </div>
  );
}

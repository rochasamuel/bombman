import { useRef, useState } from "react";
import { clampToRadius, stickDir } from "../game/stick";
import type { Dir, InputControls } from "../game/useInput";

/** Até onde o botão do joystick anda a partir do centro da base, em pixels CSS. */
const TRAVEL = 30;

const ARROWS: [Dir, string][] = [
  ["up", "▲"],
  ["right", "▶"],
  ["down", "▼"],
  ["left", "◀"],
];

/** Um toque curto no celular quando a direção muda; onde não há vibração, nada. */
const buzz = () => navigator.vibrate?.(6);

/**
 * Os controles na tela, para quem joga no dedo. À esquerda, um joystick FIXO:
 * a base não sai do lugar, e o polegar arrasta o botão dentro dela — tocar já
 * à direita do centro é andar para a direita, sem precisar arrastar desde o
 * meio. O vetor vira uma das quatro setas (ver `game/stick.ts`). À direita, a
 * bomba e, ao lado, o detonador do controle remoto — sempre no lugar, para o
 * polegar decorar onde fica, e apagado enquanto o jogador não tem o item.
 *
 * Segurar o dedo num botão não pode abrir o menu de copiar do celular: nada
 * aqui é selecionável (ver `.bomb-touch` no CSS) e o menu de contexto é
 * cancelado. Deitado, os controles flutuam semitransparentes sobre a arena.
 *
 * Eventos de ponteiro, com captura: o dedo pode sair da base e continuar
 * mandando, e cada polegar segura o seu controle sem roubar o do outro.
 */
export function TouchPad({ controls, remote }: { controls: InputControls; remote: boolean }) {
  return (
    <div className="bomb-touch flex w-full items-center justify-between px-2">
      <Stick controls={controls} />
      <div className="bomb-touch-fire flex items-end gap-3">
        <FireButton
          className="bomb-detonate"
          label="detonar"
          glyph="📡"
          off={!remote}
          onPress={controls.detonate}
        />
        <FireButton label="bomba" glyph="💣" onPress={controls.bomb} />
      </div>
    </div>
  );
}

function Stick({ controls }: { controls: InputControls }) {
  const zone = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const dirRef = useRef<Dir | null>(null);
  const [dir, setDir] = useState<Dir | null>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);

  const steer = (next: Dir | null) => {
    const prev = dirRef.current;
    if (next === prev) return;
    if (prev) controls.release(prev);
    if (next) {
      controls.press(next);
      buzz();
    }
    dirRef.current = next;
    setDir(next);
  };

  const track = (event: React.PointerEvent) => {
    const box = zone.current?.getBoundingClientRect();
    if (!box) return;
    const dx = event.clientX - (box.left + box.width / 2);
    const dy = event.clientY - (box.top + box.height / 2);
    setKnob(clampToRadius(dx, dy, TRAVEL));
    steer(stickDir(dx, dy, dirRef.current));
  };

  const end = (event: React.PointerEvent) => {
    if (event.pointerId !== pointer.current) return;
    pointer.current = null;
    setKnob([0, 0]);
    steer(null);
  };

  return (
    <div
      ref={zone}
      className={["bomb-stick", dir && "is-held"].filter(Boolean).join(" ")}
      onPointerDown={(event) => {
        if (pointer.current !== null) return;
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pointer.current = event.pointerId;
        track(event);
      }}
      onPointerMove={(event) => {
        if (event.pointerId === pointer.current) track(event);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(event) => event.preventDefault()}
      role="group"
      aria-label="direcional"
    >
      <div className="bomb-stick-base px-round">
        <div className="bomb-stick-face px-round">
          {ARROWS.map(([d, glyph]) => (
            <span key={d} className={`bomb-stick-arrow is-${d}`} data-on={dir === d || undefined}>
              {glyph}
            </span>
          ))}
        </div>
      </div>
      <div
        className="bomb-stick-knob px-round"
        style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }}
      >
        <div className="bomb-stick-knob-face px-round" />
      </div>
    </div>
  );
}

function FireButton({
  label,
  glyph,
  onPress,
  off = false,
  className,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  off?: boolean;
  className?: string;
}) {
  const [down, setDown] = useState(false);
  const release = () => setDown(false);
  return (
    <button
      type="button"
      className={["bomb-fire px-round", className, down && "is-down", off && "is-off"]
        .filter(Boolean)
        .join(" ")}
      onPointerDown={(event) => {
        event.preventDefault();
        if (off) return;
        setDown(true);
        onPress();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onPointerLeave={release}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={label}
      aria-disabled={off || undefined}
    >
      <span className="bomb-fire-face px-round">
        <span className="bomb-fire-glyph" aria-hidden>
          {glyph}
        </span>
      </span>
    </button>
  );
}

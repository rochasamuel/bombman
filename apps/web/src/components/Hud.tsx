import {
  CURSE_NAME,
  LIVES,
  MAX_PLAYERS,
  SLOT_COLORS,
  type ArenaState,
  type Curse,
  type PublicPlayer,
} from "@bomb/shared";
import { characterPose, heart } from "../art/atlas";
import type { Bubble } from "../game/useEmotes";
import { EmoteBubble } from "./EmoteBubble";
import { PixelSprite } from "./PixelSprite";

type Props = {
  state: ArenaState;
  sessionId: string;
  bubbles: Record<string, Bubble>;
};

/**
 * O painel de cima, como na referência: um quadro por cor com o retrato, o
 * "P1" e os três corações, e o relógio no meio. Os quadros ficam sempre nos
 * quatro lugares, na ordem das cores — um canto vazio é um quadro apagado,
 * para a fileira não dançar quando alguém entra.
 */
export function Hud({ state, sessionId, bubbles }: Props) {
  const bySlot = new Map(state.players.map((p) => [p.slot, p]));
  const slots = Array.from({ length: MAX_PLAYERS }, (_, i) => i);
  const left = slots.slice(0, 2);
  const right = slots.slice(2);

  return (
    <div className="flex w-full flex-wrap items-stretch justify-center gap-2 sm:flex-nowrap">
      {left.map((slot) => (
        <Panel key={slot} slot={slot} player={bySlot.get(slot)} me={sessionId} bubble={bubbles} />
      ))}
      <Timer state={state} />
      {right.map((slot) => (
        <Panel key={slot} slot={slot} player={bySlot.get(slot)} me={sessionId} bubble={bubbles} />
      ))}
    </div>
  );
}

function Timer({ state }: { state: ArenaState }) {
  const seconds = Math.ceil(state.timeLeft / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const urgent = state.phase === "playing" && seconds <= 30;
  return (
    <div className={["bomb-timer order-first basis-full text-center sm:order-none sm:basis-auto", urgent && "is-urgent"]
      .filter(Boolean)
      .join(" ")}
    >
      {mm}:{ss}
    </div>
  );
}

function Panel({
  slot,
  player,
  me,
  bubble,
}: {
  slot: number;
  player?: PublicPlayer;
  me: string;
  bubble: Record<string, Bubble>;
}) {
  const tint = SLOT_COLORS[slot];
  const out = !!player && !player.alive && !player.dying && player.lives === 0;
  const classes = [
    "bomb-panel relative flex-1",
    !player && "is-out",
    out && "is-out",
    player?.id === me && "is-me",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} style={{ "--tint": tint } as React.CSSProperties}>
      <PixelSprite frame={characterPose(slot, "head")} scale={2} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="bomb-panel-tag">P{slot + 1}</span>
          <span className="bomb-panel-name" title={player?.name}>
            {player ? player.name : "vazio"}
          </span>
          {player && !player.connected && (
            <span className="px-label" title="desconectado">
              ⌁
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {Array.from({ length: LIVES }, (_, i) => (
            <PixelSprite key={i} frame={heart(!!player && i < player.lives)} scale={2} />
          ))}
          {player && <Stats player={player} />}
        </div>
      </div>
      {player && bubble[player.id] && (
        <span className="absolute top-full left-1/2 z-20 -translate-x-1/2 pt-1">
          <EmoteBubble key={bubble[player.id].seq} emote={bubble[player.id].emote} />
        </span>
      )}
    </div>
  );
}

/** Os poderes, em miúdo: 🔥 alcance, 💣 bombas, 👟 velocidade. A maldição, se houver. */
function Stats({ player }: { player: PublicPlayer }) {
  return (
    <span className="px-label ml-1 hidden whitespace-nowrap sm:inline" style={{ letterSpacing: 0 }}>
      🔥{player.range} 💣{player.bombs} 👟{player.speed}
      {player.curse && (
        <span style={{ color: "var(--mark)" }} title={CURSE_NAME[player.curse as Curse]}>
          {" "}
          💀
        </span>
      )}
      {player.wins > 0 && <span style={{ color: "var(--paper-hi)" }}> ★{player.wins}</span>}
    </span>
  );
}

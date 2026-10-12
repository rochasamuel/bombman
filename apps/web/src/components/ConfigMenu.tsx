import type { ReactNode } from "react";
import { useUi } from "../store/ui";

/**
 * Os ajustes de quem olha a arena. Nada aqui atravessa a rede: o som, o
 * movimento e o direcional na tela são de quem está olhando, e mudam a tela
 * dele e só a dela.
 */
export function ConfigMenu() {
  const soundEnabled = useUi((ui) => ui.soundEnabled);
  const toggleSound = useUi((ui) => ui.toggleSound);
  const lowMotion = useUi((ui) => ui.lowMotion);
  const setLowMotion = useUi((ui) => ui.setLowMotion);
  const touchPad = useUi((ui) => ui.touchPad);
  const setTouchPad = useUi((ui) => ui.setTouchPad);
  const netDiag = useUi((ui) => ui.netDiag);
  const setNetDiag = useUi((ui) => ui.setNetDiag);

  return (
    <details className="px-menu relative" name="bomb-header">
      <summary className="px-link" aria-label="Ajustes da tela">
        ▤<span className="hidden sm:inline"> ajustes</span>
      </summary>

      <div className="px-slab px-menu-panel flex flex-col gap-3 p-4">
        <Switch
          on={soundEnabled}
          onToggle={toggleSound}
          label="Som"
          state={["ligado", "desligado"]}
          hint="As bombas, os itens e a conversa."
        />
        <div className="flex flex-col gap-2">
          <span className="px-label">Direcional na tela</span>
          <div role="radiogroup" className="flex gap-2">
            {(["auto", "on", "off"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={touchPad === mode}
                className="px-link text-sm"
                style={{ color: touchPad === mode ? "var(--mark)" : undefined }}
                onClick={() => setTouchPad(mode)}
              >
                {mode === "auto" ? "só no dedo" : mode === "on" ? "sempre" : "nunca"}
              </button>
            ))}
          </div>
        </div>
        <Switch
          on={lowMotion}
          onToggle={() => setLowMotion(!lowMotion)}
          label="Movimento reduzido"
          state={["ligado", "desligado"]}
          hint="Nada pisca fora da arena. O sistema pode ligar isto sozinho."
        />
        <Switch
          on={netDiag}
          onToggle={() => setNetDiag(!netDiag)}
          label="Painel de rede"
          state={["aberto", "fechado"]}
          hint="Ping, atraso e correções, no canto da arena."
        />
        <div className="flex flex-col gap-1 text-xs" style={{ color: "var(--paper-sh)" }}>
          <span className="px-label">Teclado</span>
          <span>setas ou WASD andam · espaço, X ou Z soltam a bomba</span>
        </div>
      </div>
    </details>
  );
}

function Switch({
  on,
  onToggle,
  label,
  hint,
  state = ["ligada", "desligada"],
}: {
  on: boolean;
  onToggle: () => void;
  label: string;
  hint: ReactNode;
  state?: readonly [string, string];
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className="px-switch flex items-start gap-2 text-left"
    >
      <span aria-hidden className="px-switch-dot mt-1 inline-block size-2 shrink-0" />
      <span className="flex flex-col">
        <span className="px-switch-label text-sm">
          {label}
          <span className="px-label ml-2">{on ? state[0] : state[1]}</span>
        </span>
        <span className="text-xs" style={{ color: "var(--paper-sh)" }}>
          {hint}
        </span>
      </span>
    </button>
  );
}

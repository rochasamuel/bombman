import { useEffect, useState } from "react";
import { TICK_HZ } from "@bomb/shared";
import type { LocalPlayer } from "../game/local";
import { useUi } from "../store/ui";

/*
 * O diagnóstico de rede, no canto da tela. Fechado por padrão; abre e fecha
 * pelos ajustes ou pela tecla à esquerda do 1 (' no ABNT, ` no americano —
 * `Backquote`, pela posição), e a escolha fica guardada; `?net=1` abre ao
 * carregar. Aberto, ele
 * liga o ping nativo do Colyseus e pede as estatísticas do relógio da sala.
 * Lê contadores quatro vezes por segundo: não custa nada ao desenho.
 */

export function NetOverlay({ local, setDiag }: { local: LocalPlayer; setDiag?: (on: boolean) => void }) {
  const open = useUi((ui) => ui.netDiag);
  const [now, setNow] = useState(0);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      // F3 não serve: no navegador é "procurar na página".
      if (event.code !== "Backquote" || event.repeat || event.ctrlKey || event.altKey || event.metaKey) return;
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      event.preventDefault();
      const ui = useUi.getState();
      ui.setNetDiag(!ui.netDiag);
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, []);

  useEffect(() => {
    setDiag?.(open);
    if (!open) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => {
      clearInterval(timer);
      setDiag?.(false);
    };
  }, [open, setDiag]);

  if (!open) return null;

  const { stats, predictor, clock } = local;
  const m = predictor.metrics;
  const server = stats.server;
  const rows: Array<[string, string]> = [
    ["rtt", stats.rtt ? `${ms(stats.rtt)} ±${ms(stats.rttVar)}` : "…"],
    ["jitter (estado)", ms(clock.jitter)],
    ["idade do estado", ms(clock.age(now))],
    ["intervalo do estado", ms(clock.interval)],
    ["interp. dos outros", `${ms(clock.delay)} (alvo ${ms(clock.targetDelay)})`],
    ["comandos pendentes", String(predictor.pendingCount)],
    ["confirmação", ms(m.ackDelay)],
    ["reconciliações", String(m.reconciles)],
    ["correções", `${m.corrections} · méd ${cells(m.corrections ? m.correctionSum / m.corrections : 0)} · máx ${cells(m.correctionMax)}`],
    ["previsão errada", `${m.mispredicts} · grandes ${m.large}`],
    ["quadro", `${ms(stats.frameMs)} (${stats.frameMs ? Math.round(1000 / stats.frameMs) : 0} fps)`],
    ["simulação", server ? `${server.hz} Hz (alvo ${TICK_HZ})` : "…"],
    ["passo do servidor", server ? `${server.tickAvg} ms · máx ${server.tickMax} ms` : "…"],
    ["atraso do relógio", server ? `máx ${server.lateMax} ms · perdido ${server.droppedMs} ms` : "…"],
    ["fila no servidor", server ? `${server.queue} · caiu ${server.inputDropped} · rep ${server.inputDuplicates} · recus ${server.inputRejected}` : "…"],
    ["patch", server ? `${server.patchMs} ms` : "…"],
    ["enviado", `${stats.batches} lotes · ${stats.commands} cmds · pulados ${stats.skippedTicks}`],
  ];

  return (
    <div
      className="px-slab"
      style={{
        position: "fixed",
        top: 8,
        left: 8,
        zIndex: 50,
        padding: "6px 8px",
        font: "11px/1.35 ui-monospace, monospace",
        pointerEvents: "none",
        opacity: 0.92,
      }}
    >
      <table>
        <tbody>
          {rows.map(([label, value]) => (
            <tr key={label}>
              <td style={{ paddingRight: 8, opacity: 0.7 }}>{label}</td>
              <td>{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ opacity: 0.6, marginTop: 2 }}>' (esquerda do 1) fecha</div>
    </div>
  );
}

function ms(value: number) {
  return `${Math.round(value)} ms`;
}

function cells(value: number) {
  return value.toFixed(3);
}

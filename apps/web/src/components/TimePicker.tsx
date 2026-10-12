import { MATCH_MINUTES, minMinutesFor, type ArenaSize } from "@bomb/shared";

type Props = {
  /** O tempo escolhido, em minutos (o estado sincronizado: igual para todos). */
  minutes: number;
  /** O tamanho da arena escolhida: a grande não aceita o tempo mais curto. */
  size: ArenaSize;
  /** Só o host escolhe; os outros olham. */
  canChoose: boolean;
  onChoose: (minutes: number) => void;
};

/**
 * O tempo da rodada, na sala de espera: 2, 4 ou 6 minutos, no estilo das
 * abas de tamanho da arena. Um tempo curto demais para a arena escolhida fica
 * apagado; a escolha é do host e chega pelo estado da sala.
 */
export function TimePicker({ minutes, size, canChoose, onChoose }: Props) {
  const min = minMinutesFor(size);
  return (
    <div className="px-slab flex flex-col gap-3 p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="px-label">Tempo da rodada</p>
        {min > MATCH_MINUTES[0] && <p className="px-label">mínimo {min} na grande</p>}
      </div>
      <div role="radiogroup" aria-label="Tempo da rodada" className="grid grid-cols-3 gap-2">
        {MATCH_MINUTES.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={minutes === option}
            disabled={!canChoose || option < min}
            className="bomb-arena-tab"
            onClick={() => onChoose(option)}
          >
            {option} min
          </button>
        ))}
      </div>
    </div>
  );
}

import {
  ARENA_SIZES,
  ARENA_SIZE_DIMS,
  ARENA_SIZE_NAME,
  DEFAULT_THEME,
  SIZE_PREVIEWS,
  THEMES,
  arenaById,
  themeById,
  type ArenaSize,
} from "@bomb/shared";
import { ArenaPreview } from "./ArenaPreview";

type Props = {
  /** A arena que a sala vai montar (o estado sincronizado: igual para todos); daqui só sai o tamanho. */
  arenaId: string;
  /** O tema que veste a arena (também sincronizado); ausente, o da referência. */
  themeId?: string;
  /** Só o host escolhe; os outros olham. */
  canChoose: boolean;
  onChoose: (size: ArenaSize) => void;
  onChooseTheme?: (themeId: string) => void;
};

/**
 * A escolha da arena, na sala de espera: o tema em cima, um separador, e o
 * tamanho embaixo. A planta não se escolhe: a sala sorteia uma das três do
 * tamanho a cada rodada. A miniatura mostra o tema no tamanho escolhido, só
 * a muralha e os quatro nos cantos — a planta é surpresa. Quem não é host vê
 * a mesma coisa, apagada, com a escolha acesa.
 */
export function ArenaPicker({ arenaId, themeId = DEFAULT_THEME.id, canChoose, onChoose, onChooseTheme }: Props) {
  const size: ArenaSize = arenaById(arenaId)?.size ?? "large";
  const theme = themeById(themeId) ?? DEFAULT_THEME;

  return (
    <div className="px-slab flex flex-col gap-3 p-4">
      <p className="px-label">Tema</p>
      <div role="radiogroup" aria-label="Tema da arena" className="grid grid-cols-3 gap-2">
        {THEMES.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={theme.id === option.id}
            disabled={!canChoose || !onChooseTheme}
            className="bomb-arena-tab"
            title={option.blurb}
            onClick={() => onChooseTheme?.(option.id)}
          >
            {option.name}
          </button>
        ))}
      </div>

      <hr className="bomb-separator" />

      <p className="px-label">Tamanho</p>
      <div role="radiogroup" aria-label="Tamanho da arena" className="grid grid-cols-3 gap-2">
        {ARENA_SIZES.map((option) => {
          const dims = ARENA_SIZE_DIMS[option];
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={size === option}
              disabled={!canChoose}
              className="bomb-arena-tab"
              onClick={() => onChoose(option)}
            >
              {ARENA_SIZE_NAME[option]}
              <span className="block text-[9px] tracking-widest opacity-80">
                {dims.cols}×{dims.rows}
              </span>
            </button>
          );
        })}
      </div>

      <ArenaPreview arena={SIZE_PREVIEWS[size]} themeId={theme.id} />

      <p className="text-xs" style={{ color: "var(--paper-sh)" }}>
        <span style={{ color: "var(--paper-hi)" }}>{theme.name}</span> · {theme.blurb}
        <br />A planta é sorteada entre as três deste tamanho a cada rodada.
      </p>
    </div>
  );
}

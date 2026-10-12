import { CURSE_HINT, CURSE_NAME, type Curse, type PublicPlayer } from "@bomb/shared";

/**
 * O aviso de quem está amaldiçoado (ou invisível), logo abaixo da arena: fora
 * do chão em que se joga, piscando para ser notado. A linha fica sempre
 * reservada, vazia sem maldição: se aparecesse e sumisse, a arena mudaria de
 * tamanho (ela se ajusta ao que sobra da tela). Uma linha só; o que não couber
 * fica no `title`.
 */
export function CurseTip({ me }: { me: PublicPlayer | undefined }) {
  const curse = (me?.alive ? me.curse : "") as Curse | "";
  const ghost = !!me?.alive && me.ghost;
  const parts = [
    curse && `💀 ${CURSE_NAME[curse]}: ${CURSE_HINT[curse]} (pega em quem encostar)`,
    ghost && "👻 invisível: os outros quase não te veem",
  ].filter(Boolean);
  const text = parts.join(" · ");
  return (
    <div className="bomb-curse-tip" role="status">
      {text && (
        <span className="bomb-curse-badge" title={text}>
          {text}
        </span>
      )}
    </div>
  );
}

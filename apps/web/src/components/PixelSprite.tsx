import { useEffect, useRef } from "react";
import { logicalHeight, logicalWidth, onReady, type Frame } from "../art/atlas";

/**
 * Um sprite do atlas num canvas próprio, para fora da arena: o retrato do
 * painel, os corações. A `scale` é em pixels CSS por pixel lógico; a arte
 * tem mais resolução que isso e o canvas acompanha a densidade da tela.
 */
export function PixelSprite({
  frame,
  scale = 2,
  className,
  title,
}: {
  frame: Frame;
  scale?: number;
  className?: string;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const width = logicalWidth(frame) * scale;
  const height = logicalHeight(frame) * scale;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    };
    // Desenha agora e de novo quando o atlas chegar.
    return onReady(draw);
  }, [frame, width, height]);

  return (
    <canvas
      ref={ref}
      className={["bomb-pixel", className].filter(Boolean).join(" ")}
      style={{ width, height }}
      title={title}
      aria-hidden={!title}
      role={title ? "img" : undefined}
      aria-label={title}
    />
  );
}

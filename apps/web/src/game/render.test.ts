import { describe, expect, it } from "vitest";
import { ARENAS, ARENA_SIZE_DIMS, TILE } from "@bomb/shared";
import { MARGIN, STRETCH } from "../art/scenario";
import { fitScale, viewOf } from "./render";

describe("o tamanho do canvas", () => {
  it("é a arena em 16 px por célula, mais a margem, em qualquer tamanho: a célula nunca estica", () => {
    for (const arena of ARENAS) {
      const view = viewOf(arena.cols, arena.rows);
      expect(view.w).toBe(arena.cols * TILE + MARGIN * 2);
      expect(view.h).toBe(arena.rows * TILE + MARGIN * 2);
      expect(view.shownH).toBe(Math.round(view.h * STRETCH));
    }
    // A referência: 444 × 284 desenhados, 296 mostrados, como sempre foi.
    const { cols, rows } = ARENA_SIZE_DIMS.large;
    expect(viewOf(cols, rows)).toEqual({ w: 444, h: 284, shownH: 296 });
    expect(viewOf(11, 11)).toEqual({ w: 188, h: 188, shownH: 196 });
  });

  it("tem três tamanhos bem diferentes", () => {
    const small = viewOf(ARENA_SIZE_DIMS.small.cols, ARENA_SIZE_DIMS.small.rows);
    const medium = viewOf(ARENA_SIZE_DIMS.medium.cols, ARENA_SIZE_DIMS.medium.rows);
    const large = viewOf(ARENA_SIZE_DIMS.large.cols, ARENA_SIZE_DIMS.large.rows);
    expect(medium.w * medium.h).toBeGreaterThan(small.w * small.h * 1.5);
    expect(large.w * large.h).toBeGreaterThan(medium.w * medium.h * 1.5);
  });
});

describe("a escala do canvas", () => {
  const small = viewOf(ARENA_SIZE_DIMS.small.cols, ARENA_SIZE_DIMS.small.rows);
  const large = viewOf(ARENA_SIZE_DIMS.large.cols, ARENA_SIZE_DIMS.large.rows);

  it("é a maior, em quartos, em que o canvas cabe na largura E na altura que sobram", () => {
    // Sobra de 1000 × 600: a pequena (188 × 196 mostrados) cabe em 3 na altura (600 / 196 = 3,06).
    expect(fitScale(1000, 600, small)).toBe(3);
    // A grande (444 × 296) cabe em 2 na largura (1000 / 444 = 2,25) e em 2 na altura (600 / 296 = 2,03).
    expect(fitScale(1000, 600, large)).toBe(2);
    // Com altura de sobra, manda a largura: 1000 / 444 = 2,25.
    expect(fitScale(1000, 2000, large)).toBe(2.25);
  });

  it("nunca passa de 6 nem fica abaixo de 0,5, mesmo sem sobra nenhuma", () => {
    expect(fitScale(5000, 5000, small)).toBe(6);
    // Um celular deitado com o direcional na tela: a célula encolhe antes de a página rolar.
    expect(fitScale(844, 218, large)).toBe(0.5);
    expect(fitScale(100, 0, small)).toBe(0.5);
    expect(fitScale(100, -50, small)).toBe(0.5);
  });
});

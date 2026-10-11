import { describe, expect, it } from "vitest";
import { ARENAS, ARENA_SIZES, ARENA_SIZE_DIMS, BRICK, DEFAULT_ARENA, cellIndex, fillGrid } from "@bomb/shared";
import { variants } from "./atlas";
import {
  CAPS_Y,
  MARGIN,
  MERLONS_X,
  MERLON_PITCH,
  STRETCH,
  brickVariant,
  capsY,
  crenellation,
  floorVariant,
  merlonsX,
} from "./scenario";

describe("o cenário lido da referência", () => {
  it("tem uma lajota do tileset para cada célula, em toda arena", () => {
    for (const arena of ARENAS) {
      for (let cy = 0; cy < arena.rows; cy++) {
        for (let cx = 0; cx < arena.cols; cx++) {
          const v = floorVariant(arena.cols, arena.rows, cx, cy);
          expect(v, `${arena.id} ${cx},${cy}`).toBeGreaterThanOrEqual(0);
          expect(v, `${arena.id} ${cx},${cy}`).toBeLessThan(variants("floor"));
        }
      }
    }
  });

  it("tem um tijolo do tileset em toda célula em que a planta tem tijolo, em toda arena", () => {
    for (const arena of ARENAS) {
      const grid = fillGrid([], arena);
      for (let cy = 0; cy < arena.rows; cy++) {
        for (let cx = 0; cx < arena.cols; cx++) {
          if (grid[cellIndex(cx, cy, arena.cols)] !== BRICK) continue;
          const v = brickVariant(arena.cols, arena.rows, cx, cy);
          expect(v, `${arena.id} ${cx},${cy}`).toBeGreaterThanOrEqual(0);
          expect(v, `${arena.id} ${cx},${cy}`).toBeLessThan(variants("brick"));
        }
      }
    }
  });

  it("uma arena menor lê o miolo da referência, centrado: as mesmas lajotas nas mesmas faixas", () => {
    const { cols, rows } = DEFAULT_ARENA;
    // A fileira 4 da referência é toda a lajota 5; na média (15×13) ela é a fileira 2.
    for (let cx = 1; cx < 14; cx++) expect(floorVariant(15, 13, cx, 2)).toBe(floorVariant(cols, rows, cx + 6, 4));
    // Na referência o recorte é ela mesma.
    expect(floorVariant(cols, rows, 5, 4)).toBe(5);
    expect(brickVariant(cols, rows, 4, 1)).toBe(36);
  });

  it("escolhe um tijolo fixo para a célula, sem sorteio, e espalha os quarenta", () => {
    expect(brickVariant(11, 11, 4, 1)).toBe(brickVariant(11, 11, 4, 1));
    const seen = new Set<number>();
    for (let cy = 1; cy < 10; cy++) for (let cx = 1; cx < 10; cx++) seen.add(brickVariant(11, 11, cx, cy));
    expect(seen.size).toBeGreaterThan(10);
  });

  it("estica toda arena o mesmo tanto, o da referência", () => {
    expect(STRETCH).toBeCloseTo(296 / 284, 6);
  });

  it("coroa a muralha como a referência: 16 merlões em cima e embaixo, 9 blocos de cada lado, a cada célula e meia", () => {
    expect(MERLONS_X).toHaveLength(16);
    expect(CAPS_Y).toHaveLength(9);
    expect(MERLONS_X[0]).toBeCloseTo(2.25);
    expect(CAPS_Y[0]).toBeCloseTo(2.5);
    expect(merlonsX(DEFAULT_ARENA.cols)).toEqual(MERLONS_X);
    expect(capsY(DEFAULT_ARENA.rows)).toEqual(CAPS_Y);
    // Os merlões passam 5 px lógicos da muralha para cima: a margem tem de comportar.
    expect(MARGIN).toBeGreaterThanOrEqual(5);
  });

  it("coroa uma muralha de qualquer comprimento com a mesma regra: centrados, no mesmo passo, longe dos cantos", () => {
    for (const size of ARENA_SIZES) {
      const { cols, rows } = ARENA_SIZE_DIMS[size];
      for (const [length, positions] of [
        [cols, crenellation(cols)],
        [rows, crenellation(rows)],
      ] as const) {
        expect(positions.length).toBeGreaterThanOrEqual(3);
        for (let k = 1; k < positions.length; k++) {
          expect(positions[k] - positions[k - 1]).toBeCloseTo(MERLON_PITCH);
        }
        for (const x of positions) {
          expect(positions.some((other) => Math.abs(other - (length - x)) < 1e-9)).toBe(true);
          expect(x).toBeGreaterThanOrEqual(2);
          expect(x).toBeLessThanOrEqual(length - 2);
        }
        // Não cabe mais um sem chegar perto demais do canto.
        expect(positions[0] - MERLON_PITCH / 2).toBeLessThan(2);
      }
    }
    expect(crenellation(11)).toEqual([2.5, 4, 5.5, 7, 8.5]);
    expect(crenellation(13)).toEqual([2, 3.5, 5, 6.5, 8, 9.5, 11]);
  });

  it("coroa com outro passo, para os outros temas: centrado, no passo pedido, longe dos cantos", () => {
    expect(crenellation(15, 5)).toEqual([2.5, 7.5, 12.5]);
    expect(crenellation(27, 5)).toEqual([3.5, 8.5, 13.5, 18.5, 23.5]);
    expect(crenellation(11, 5)).toEqual([3, 8]);
    expect(crenellation(15, 6)).toEqual([4.5, 10.5]);
    expect(crenellation(11, 6)).toEqual([2.5, 8.5]);
    expect(crenellation(13, 2.5)).toEqual([2.75, 5.25, 7.75, 10.25]);
    for (const pitch of [1.5, 2.5, 3, 4, 5, 6]) {
      for (const length of [11, 13, 15, 17, 27]) {
        const positions = crenellation(length, pitch);
        expect(positions.length).toBeGreaterThanOrEqual(1);
        for (const x of positions) {
          expect(x).toBeGreaterThanOrEqual(2);
          expect(x).toBeLessThanOrEqual(length - 2);
          expect(positions.some((other) => Math.abs(other - (length - x)) < 1e-9)).toBe(true);
        }
      }
    }
  });
});

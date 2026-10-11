import { describe, expect, it } from "vitest";
import { ARENAS, BRICK, DEFAULT_ARENA, THEMES, cellIndex, fillGrid } from "@bomb/shared";
import { variants } from "./atlas";
import { brickVariant, floorVariant } from "./scenario";
import { walls } from "./atlas";
import { THEME_ART_IDS, ornamentsOf, themeArt } from "./themes";

describe("o desenho de cada tema", () => {
  it("existe para todo tema do catálogo, e um tema desconhecido desenha como a referência", () => {
    expect(THEME_ART_IDS).toEqual(THEMES.map((t) => t.id));
    for (const theme of THEMES) expect(themeArt(theme.id).id).toBe(theme.id);
    expect(themeArt("lunar").id).toBe("garden");
  });

  it("a referência continua a mesma: as tabelas e a regra de sempre", () => {
    const garden = themeArt("garden");
    const { cols, rows } = DEFAULT_ARENA;
    expect(garden.floor(cols, rows, 5, 4)).toBe(floorVariant(cols, rows, 5, 4));
    expect(garden.brick(cols, rows, 4, 1)).toBe(brickVariant(cols, rows, 4, 1));
    // Os 16 merlões e os 9 blocos de sempre, uma peça só.
    expect(ornamentsOf(walls("garden").top[0], 27)).toHaveLength(16);
    expect(ornamentsOf(walls("garden").side[0], 17)).toHaveLength(9);
    expect(ornamentsOf(walls("garden").top[0], 27).every((o) => o.piece === 0)).toBe(true);
  });

  it("tem uma lajota do tileset do tema para cada célula de cada arena, e um tijolo onde a planta tem tijolo", () => {
    for (const theme of THEMES) {
      const art = themeArt(theme.id);
      for (const arena of ARENAS) {
        const grid = fillGrid([], arena);
        for (let cy = 0; cy < arena.rows; cy++) {
          for (let cx = 0; cx < arena.cols; cx++) {
            const f = art.floor(arena.cols, arena.rows, cx, cy);
            expect(f, `${theme.id} ${arena.id} ${cx},${cy}`).toBeGreaterThanOrEqual(0);
            expect(f, `${theme.id} ${arena.id} ${cx},${cy}`).toBeLessThan(variants("floor", theme.id));
            if (grid[cellIndex(cx, cy, arena.cols)] !== BRICK) continue;
            const b = art.brick(arena.cols, arena.rows, cx, cy);
            expect(b, `${theme.id} ${arena.id} ${cx},${cy}`).toBeGreaterThanOrEqual(0);
            expect(b, `${theme.id} ${arena.id} ${cx},${cy}`).toBeLessThan(variants("brick", theme.id));
          }
        }
      }
    }
  });

  it("é fixo: a mesma célula dá sempre a mesma peça, e as peças variam pela arena", () => {
    for (const theme of THEMES) {
      const art = themeArt(theme.id);
      expect(art.floor(15, 13, 3, 4)).toBe(art.floor(15, 13, 3, 4));
      expect(art.brick(27, 17, 9, 7)).toBe(art.brick(27, 17, 9, 7));
      const floors = new Set<number>();
      const bricks = new Set<number>();
      for (let cy = 1; cy < 16; cy++) {
        for (let cx = 1; cx < 26; cx++) {
          floors.add(art.floor(27, 17, cx, cy));
          bricks.add(art.brick(27, 17, cx, cy));
        }
      }
      expect(floors.size, theme.id).toBeGreaterThan(4);
      expect(bricks.size, theme.id).toBeGreaterThan(8);
    }
  });

  it("lê a tabela do cenário centrada na arena: a média (13 × 11 por dentro) cai no miolo da tabela", () => {
    // O cenário vulcânico tem 17 × 15 por dentro: a média lê das colunas 2..14 e das fileiras 2..12.
    const volcano = themeArt("volcano");
    for (let cx = 1; cx < 14; cx++) {
      for (let cy = 1; cy < 12; cy++) {
        expect(volcano.floor(15, 13, cx, cy)).toBe(volcano.floor(19, 17, cx + 2, cy + 2));
      }
    }
    // A grande (25 × 15 por dentro) é maior que a tabela: dá a volta, sem estourar.
    expect(() => volcano.floor(27, 17, 26, 16)).not.toThrow();
  });

  it("coroa a muralha com as séries do tema, sempre centrado e longe dos cantos", () => {
    for (const theme of THEMES) {
      const art = walls(theme.id);
      for (const [cols, rows] of [[11, 11], [15, 13], [27, 17]] as const) {
        for (const [list, length] of [[art.top, cols], [art.side, rows]] as const) {
          for (const series of list) {
            for (const { at } of ornamentsOf(series, length)) {
              expect(at).toBeGreaterThanOrEqual(series.margin);
              expect(at).toBeLessThanOrEqual(length - series.margin);
            }
          }
        }
      }
    }
  });

  it("alterna as peças a partir do centro, com a central no meio: o vulcânico, o gelado, o cyberpunk e o deserto como no cenário", () => {
    // Vulcânico, 19 colunas (o cenário): fenda, sorriso, sorriso, fenda de cada lado da torre.
    const volcano = ornamentsOf(walls("volcano").top[0], 19);
    expect(volcano.map((o) => o.piece)).toEqual([3, 2, 1, 0, "c", 0, 1, 2, 3]);
    expect(volcano.map((o) => o.at)).toEqual([1.5, 3.5, 5.5, 7.5, 9.5, 11.5, 13.5, 15.5, 17.5]);
    // Gelado, 19 colunas: dois estandartes de cada lado do portão.
    expect(ornamentsOf(walls("frozen").top[0], 19).map((o) => o.piece)).toEqual([0, 0, "c", 0, 0]);
    // Os lados gelados só têm a placa da gema no meio.
    expect(ornamentsOf(walls("frozen").side[0], 17).map((o) => o.piece)).toEqual(["c"]);
    // Cyberpunk, 19 colunas: rosa longe, ciano perto, a porta no meio.
    expect(ornamentsOf(walls("cyber").top[0], 19).map((o) => o.piece)).toEqual([2, 1, 0, "c", 0, 1, 2]);
    // Deserto, 19 colunas: três medalhões (o do meio inclusive) e dois blocos do sol entre eles, nunca no meio.
    expect(ornamentsOf(walls("desert").top[0], 19).map((o) => Math.round(o.at * 10) / 10)).toEqual([3.9, 9.5, 15.1]);
    expect(ornamentsOf(walls("desert").top[1], 19).map((o) => o.at)).toEqual([5.5, 13.5]);
    expect(ornamentsOf(walls("desert").top[1], 15)).toEqual([]);
    // Numa arena menor a torre continua no meio, e cabem menos de cada lado.
    expect(ornamentsOf(walls("volcano").top[0], 15).map((o) => o.piece)).toEqual([2, 1, 0, "c", 0, 1, 2]);
  });
});

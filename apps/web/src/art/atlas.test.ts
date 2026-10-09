import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import atlasData from "./atlas.json";
import { cellHash, checkSprites, idleSteps, requiredFrames, variants, walkSteps, winSteps } from "./atlas";

const ART = atlasData.scale;
const frames: Record<string, { x: number; y: number; w: number; h: number }> = atlasData.frames;

describe("o atlas", () => {
  it("tem todo quadro que a arena pede", () => {
    expect(() => checkSprites()).not.toThrow();
    expect(() => checkSprites({})).toThrow(/faltam quadros/);
  });

  it("guarda 4 px de arte por pixel lógico", () => {
    expect(ART).toBe(4);
  });

  it("todo chão e canteiro ocupa a célula inteira, e todo bloco a largura dela", () => {
    const tiles = ["grass"];
    for (let i = 0; i < atlasData.variants.floor; i++) tiles.push(`floor${i}`);
    for (let i = 0; i < atlasData.variants.garden; i++) tiles.push(`garden${i}`);
    for (const name of tiles) {
      expect(frames[name].w, name).toBe(16 * ART);
      expect(frames[name].h, name).toBe(16 * ART);
    }
    // Vista de 3/4: o bloco tem a largura da célula e sobe no máximo 2 px lógicos na célula de cima.
    for (const name of ["pillar", "brick", "bush"]) {
      expect(frames[name].w, name).toBe(16 * ART);
      expect(frames[name].h, name).toBeGreaterThanOrEqual(16 * ART);
      expect(frames[name].h, name).toBeLessThanOrEqual(18 * ART);
    }
    // A muralha cabe na célula: não come a fileira de dentro.
    for (const name of ["wall_t", "wall_b", "wall_l", "wall_r"]) {
      expect(frames[name].w, name).toBe(16 * ART);
      expect(frames[name].h, name).toBe(16 * ART);
    }
    // O canto, com a lanterna, é uma torre: a largura da célula e até duas células de altura.
    for (const name of ["corner_l", "corner_r"]) {
      expect(frames[name].w, name).toBe(16 * ART);
      expect(frames[name].h, name).toBeLessThanOrEqual(32 * ART);
    }
  });

  it("tem as versões do cenário: 7 chãos, 7 canteiros e 4 árvores", () => {
    expect(atlasData.variants).toEqual({ floor: 7, garden: 7, tree: 4 });
    expect(variants("tree")).toBe(4);
  });

  it("varia o cenário por célula, sempre igual para a mesma célula", () => {
    expect(cellHash(3, 4)).toBe(cellHash(3, 4));
    const seen = new Set<number>();
    for (let cx = 0; cx < 20; cx++) for (let cy = 0; cy < 20; cy++) seen.add(Math.floor(cellHash(cx, cy) * 7));
    expect(seen.size).toBe(7);
  });

  it("sabe quantos passos tem a caminhada de cada direção", () => {
    expect(atlasData.walk).toEqual({ down: 17, up: 22, left: 20, right: 20 });
    expect(walkSteps("down")).toBe(17);
    expect(walkSteps("right")).toBe(20);
  });

  it("sabe quantos quadros tem o parado de cada direção", () => {
    expect(atlasData.idle).toEqual({ down: 14, up: 14, left: 22, right: 15 });
    expect(idleSteps("down")).toBe(14);
    expect(idleSteps("left")).toBe(22);
  });

  it("sabe quantos quadros tem a vitória", () => {
    expect(atlasData.win).toBe(25);
    expect(winSteps()).toBe(25);
  });

  it("pede todos os passos de cada direção", () => {
    const names = requiredFrames();
    expect(names).toContain("c3_win24");
    expect(names).not.toContain("c0_win25");
    expect(names).toContain("c3_right19");
    expect(names).toContain("c3_up21");
    expect(names).toContain("c0_down16");
    expect(names).not.toContain("c0_down17");
    expect(names).toContain("c3_idle_left21");
    expect(names).toContain("c0_idle_down13");
    expect(names).not.toContain("c0_idle_down14");
  });

  it("cada passo de cada direção é um quadro distinto", () => {
    for (const facing of ["down", "up", "left", "right"] as const) {
      const seen = new Set<string>();
      for (let step = 0; step < walkSteps(facing); step++) {
        const r = frames[`c0_${facing}${step}`];
        seen.add(`${r.x},${r.y}`);
      }
      expect(seen.size, facing).toBe(walkSteps(facing));
    }
  });

  it("cada quadro do parado de cada direção é distinto, e a esquerda não é a direita espelhada", () => {
    for (const facing of ["down", "up", "left", "right"] as const) {
      const seen = new Set<string>();
      for (let step = 0; step < idleSteps(facing); step++) {
        const r = frames[`c0_idle_${facing}${step}`];
        seen.add(`${r.x},${r.y}`);
      }
      expect(seen.size, facing).toBe(idleSteps(facing));
    }
    expect(idleSteps("left")).not.toBe(idleSteps("right"));
  });

  it("todo personagem tem o mesmo quadro de 24x28 lógicos", () => {
    for (const name of requiredFrames().filter((n) => /^c\d_(?!head)/.test(n))) {
      expect(frames[name].w, name).toBe(24 * ART);
      expect(frames[name].h, name).toBe(28 * ART);
    }
  });

  it("nenhum quadro passa da imagem nem invade outro", () => {
    const list = Object.entries(frames);
    for (const [name, r] of list) {
      expect(r.x + r.w, name).toBeLessThanOrEqual(1024);
      for (const [other, o] of list) {
        if (other === name) continue;
        const apart = r.x + r.w <= o.x || o.x + o.w <= r.x || r.y + r.h <= o.y || o.y + o.h <= r.y;
        expect(apart, `${name} x ${other}`).toBe(true);
      }
    }
  });
});

describe("as folhas de caminhada", () => {
  it("de frente, de costas e de lado têm o boneco do mesmo tamanho, sem ampliar uma para a outra", () => {
    // As três folhas foram desenhadas na mesma escala (~80 px de altura): uma só escala para todas.
    const { down, up, side } = atlasData.walkArtHeight;
    for (const h of [down, up, side]) {
      expect(h).toBeGreaterThanOrEqual(70);
      expect(h).toBeLessThanOrEqual(100);
    }
    expect(Math.abs(side - up)).toBeLessThanOrEqual(10);
    expect(Math.abs(down - up)).toBeLessThanOrEqual(10);
  });
});

describe("as folhas do parado", () => {
  it("as quatro direções têm o boneco do mesmo tamanho (maior que o da caminhada: é outra escala)", () => {
    const { down, up, left, right } = atlasData.idleArtHeight;
    for (const h of [down, up, left, right]) {
      expect(h).toBeGreaterThanOrEqual(170);
      expect(h).toBeLessThanOrEqual(220);
    }
    // De costas a bomba fica mais baixa na cabeça: o quadro mais alto varia um pouco entre direções.
    expect(Math.max(down, up, left, right) - Math.min(down, up, left, right)).toBeLessThanOrEqual(30);
  });
});

describe("o cenário desenhado", () => {
  // O pngjs não tem tipos: só o que o teste usa.
  type Png = { width: number; data: Uint8Array };
  const { PNG } = createRequire(import.meta.url)("pngjs") as { PNG: { sync: { read(buf: Buffer): Png } } };
  const png = PNG.sync.read(readFileSync(new URL("./atlas.png", import.meta.url)));
  /** As quatro bordas de um quadro, pixel a pixel. */
  const border = (name: string) => {
    const r = frames[name];
    const px = (x: number, y: number) => {
      const i = ((r.y + y) * png.width + r.x + x) * 4;
      return Array.from(png.data.subarray(i, i + 4));
    };
    const out: number[][] = [];
    for (let x = 0; x < r.w; x++) out.push(px(x, 0), px(x, r.h - 1));
    for (let y = 0; y < r.h; y++) out.push(px(0, y), px(r.w - 1, y));
    return out;
  };

  it("todo chão emenda com todo outro chão: as bordas são as mesmas", () => {
    const base = border("floor0");
    for (let i = 1; i < atlasData.variants.floor; i++) expect(border(`floor${i}`), `floor${i}`).toEqual(base);
  });

  it("todo canteiro emenda com a grama e com os outros canteiros", () => {
    const base = border("grass");
    for (let i = 0; i < atlasData.variants.garden; i++) expect(border(`garden${i}`), `garden${i}`).toEqual(base);
  });

  it("a muralha segue reta: a de cima é a de baixo, e a da esquerda é a da direita", () => {
    expect(border("wall_b")).toEqual(border("wall_t"));
    expect(border("wall_r")).toEqual(border("wall_l"));
    expect(border("wall_l")).not.toEqual(border("wall_t"));
  });
});

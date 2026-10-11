import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import atlasData from "./atlas.json";
import { THEMES } from "@bomb/shared";
import {
  ATLAS_THEMES,
  BOMB_STEPS,
  FLAME_STEPS,
  HEAD_TOP,
  POWERUP_STEPS,
  atlasTheme,
  checkSprites,
  idleSteps,
  requiredFrames,
  sceneryFrames,
  variants,
  walkSteps,
  winSteps,
} from "./atlas";

/** As caixas medidas de cada tema (`scripts/themes.cjs`): o que o atlas tem de bater. */
type ThemeCut = { floors: number[][]; bricks: number[][] };
const { THEMES: THEME_CUTS, WALLS: THEME_WALLS } = createRequire(import.meta.url)("../../scripts/themes.cjs") as {
  THEMES: Record<string, ThemeCut>;
  WALLS: Record<string, { bottom: "same" | "mirror" }>;
};
const THEME_VARIANTS: Record<string, { floor: number; brick: number }> = atlasData.themes;

const ART = atlasData.scale;
const frames: Record<string, { x: number; y: number; w: number; h: number }> = atlasData.frames;
/** A largura do atlas: com os seis temas ele passou de 1024 para 2048. */
const ATLAS_W = 2048;

describe("o atlas", () => {
  it("tem todo quadro que a arena pede", () => {
    expect(() => checkSprites()).not.toThrow();
    expect(() => checkSprites({})).toThrow(/faltam quadros/);
  });

  it("guarda 4 px de arte por pixel lógico", () => {
    expect(ART).toBe(4);
  });

  it("toda lajota ocupa a célula inteira, e todo bloco a largura dela", () => {
    for (let i = 0; i < atlasData.variants.floor; i++) {
      expect(frames[`floor${i}`].w, `floor${i}`).toBe(16 * ART);
      expect(frames[`floor${i}`].h, `floor${i}`).toBe(16 * ART);
    }
    // O bloco tem a largura da célula e, de pé no chão dela, sobe no máximo 2 px lógicos na de cima.
    const blocks = ["pillar", "bush"];
    for (let i = 0; i < atlasData.variants.brick; i++) blocks.push(`brick${i}`);
    for (const name of blocks) {
      expect(frames[name].w, name).toBe(16 * ART);
      expect(frames[name].h, name).toBeGreaterThanOrEqual(16 * ART);
      expect(frames[name].h, name).toBeLessThanOrEqual(18 * ART);
    }
    // A muralha cabe na célula: não come a fileira de dentro.
    for (const name of ["wall_t", "wall_b", "wall_l", "wall_r"]) {
      expect(frames[name].w, name).toBe(16 * ART);
      expect(frames[name].h, name).toBe(16 * ART);
    }
    // O canto passa um pouco da célula da muralha, para os lados e para cima: até célula e meia.
    expect(frames.corner.w).toBeGreaterThan(16 * ART);
    expect(frames.corner.w).toBeLessThanOrEqual(24 * ART);
    expect(frames.corner.h).toBeLessThanOrEqual(24 * ART);
    // O merlão é mais estreito que meia célula e mais alto que ela; o bloco dos lados cabe em meia célula.
    expect(frames.orn_t0_0.w).toBeLessThanOrEqual(8 * ART);
    expect(frames.orn_t0_0.h).toBeGreaterThan(16 * ART);
    expect(frames.orn_t0_0.h).toBeLessThanOrEqual(22 * ART);
    for (const name of ["orn_l0_0", "orn_r0_0"]) {
      expect(frames[name].w, name).toBeLessThanOrEqual(9 * ART);
      expect(frames[name].h, name).toBeLessThanOrEqual(8 * ART);
    }
  });

  it("tem as versões do cenário: as 44 lajotas e os 40 tijolos do tileset", () => {
    expect(atlasData.variants).toEqual({ floor: 44, brick: 40 });
    expect(variants("floor")).toBe(44);
    expect(variants("brick")).toBe(40);
    expect(variants("floor", "garden")).toBe(44);
  });

  it("sabe como cada tema coroa a muralha: a de baixo igual ou espelhada, como no cenário", () => {
    // Só na cyberpunk a borda de aço fica para fora dos dois lados; nos outros as ameias e as torres continuam de pé.
    for (const [id, w] of Object.entries(THEME_WALLS)) {
      expect(atlasData.themes[id as keyof typeof atlasData.themes].walls.bottom, id).toBe(w.bottom);
    }
    expect(atlasData.themes.cyber.walls.bottom).toBe("mirror");
    expect(atlasData.themes.frozen.walls.bottom).toBe("same");
    expect(atlasData.walls.sideAnchor).toBe("outer");
    expect(atlasData.walls.top[0].pitch).toBe(1.5);
    // Cada série tem as peças e a central que anuncia.
    for (const id of ["garden", ...Object.keys(atlasData.themes)]) {
      for (const name of sceneryFrames(id)) expect(frames[name], name).toBeDefined();
    }
    expect(frames.volcano_orn_t0_c, "a torre vulcânica do meio").toBeDefined();
    expect(frames.frozen_orn_t0_c, "o portão gelado").toBeDefined();
    expect(frames.desert_orn_t1_0, "o pilar de relevo entre os medalhões").toBeDefined();
  });

  it("tem as peças de cada um dos cinco temas novos, tantas quantas o tileset deu", () => {
    expect(Object.keys(atlasData.themes)).toEqual(["forest", "volcano", "frozen", "cyber", "desert"]);
    expect(ATLAS_THEMES).toEqual(["garden", "forest", "volcano", "frozen", "cyber", "desert"]);
    // Todo tema do catálogo tem peça no atlas: nenhum cai na referência por falta.
    for (const theme of THEMES) expect(atlasTheme(theme.id)).toBe(theme.id);
    expect(atlasTheme("lunar")).toBe("garden");
    for (const [id, cut] of Object.entries(THEME_CUTS)) {
      expect(variants("floor", id), id).toBe(cut.floors.length);
      expect(variants("brick", id), id).toBe(cut.bricks.length);
      expect(variants("floor", id), id).toBeGreaterThanOrEqual(38);
      expect(variants("brick", id), id).toBeGreaterThanOrEqual(30);
      for (const name of sceneryFrames(id)) expect(frames[name], name).toBeDefined();
    }
    expect(sceneryFrames("forest")).toContain("forest_floor0");
    expect(sceneryFrames("forest")).toContain("forest_wall_r");
    expect(sceneryFrames("garden")).toContain("floor0");
    expect(requiredFrames()).toContain("desert_brick37");
    expect(requiredFrames()).not.toContain("desert_brick38");
  });

  it("nos temas novos toda peça tem o tamanho da célula: lajota e tijolo 64×64, a muralha 64 de largura", () => {
    for (const id of Object.keys(atlasData.themes)) {
      for (let i = 0; i < variants("floor", id); i++) {
        expect(frames[`${id}_floor${i}`].w, `${id}_floor${i}`).toBe(16 * ART);
        expect(frames[`${id}_floor${i}`].h, `${id}_floor${i}`).toBe(16 * ART);
      }
      for (let i = 0; i < variants("brick", id); i++) {
        expect(frames[`${id}_brick${i}`].w, `${id}_brick${i}`).toBe(16 * ART);
        expect(frames[`${id}_brick${i}`].h, `${id}_brick${i}`).toBe(16 * ART);
      }
      // O pilar assenta na célula e sobe no máximo meia célula e pouco (a máquina cyberpunk).
      expect(frames[`${id}_pillar`].w, id).toBe(16 * ART);
      expect(frames[`${id}_pillar`].h, id).toBeGreaterThanOrEqual(16 * ART);
      expect(frames[`${id}_pillar`].h, id).toBeLessThanOrEqual(25 * ART);
      // A muralha de cima e a de baixo podem subir para a margem (as ameias de neve); as dos lados cabem na célula.
      for (const side of ["t", "b"]) {
        expect(frames[`${id}_wall_${side}`].w, id).toBe(16 * ART);
        expect(frames[`${id}_wall_${side}`].h, id).toBeGreaterThanOrEqual(16 * ART);
        expect(frames[`${id}_wall_${side}`].h, id).toBeLessThanOrEqual(21 * ART);
      }
      for (const side of ["l", "r"]) {
        expect(frames[`${id}_wall_${side}`].w, id).toBe(16 * ART);
        expect(frames[`${id}_wall_${side}`].h, id).toBe(16 * ART);
      }
      // O canto cabe em célula e meia; os ornamentos, em duas células e meia (o medalhão alado do deserto é largo).
      expect(frames[`${id}_corner`].w, id).toBeLessThanOrEqual(24 * ART);
      expect(frames[`${id}_corner`].h, id).toBeLessThanOrEqual(24 * ART);
      for (const name of sceneryFrames(id).filter((n) => n.includes("_orn_"))) {
        expect(frames[name].w, name).toBeLessThanOrEqual(40 * ART);
        expect(frames[name].h, name).toBeLessThanOrEqual(30 * ART);
        expect(frames[name].w, name).toBeGreaterThanOrEqual(8 * ART);
      }
    }
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

  it("pede a bomba, a chama e os itens das folhas novas, quadro a quadro", () => {
    const names = requiredFrames();
    // A bomba: parada, o pavio em seis, o pulso em oito e o estouro em dois.
    expect(names).toContain("bomb_idle0");
    expect(names).toContain("bomb_fuse5");
    expect(names).not.toContain("bomb_fuse6");
    expect(names).toContain("bomb_pulse7");
    expect(names).toContain("bomb_boom1");
    expect(names).not.toContain("bomb0");
    expect(BOMB_STEPS).toEqual({ idle: 1, fuse: 6, pulse: 8, boom: 2 });
    // A perfurante: a mesma bomba, em vermelho, quadro a quadro.
    expect(names).toContain("pierce_idle0");
    expect(names).toContain("pierce_fuse5");
    expect(names).toContain("pierce_pulse7");
    expect(names).toContain("pierce_boom1");
    // A explosão: as sete peças em oito quadros sincronizados; o tremeluzir `_alt` acabou.
    for (const piece of ["center", "h", "v", "l", "r", "u", "d"]) {
      for (let i = 0; i < FLAME_STEPS; i++) expect(names).toContain(`flame_${piece}${i}`);
    }
    expect(FLAME_STEPS).toBe(8);
    expect(names).not.toContain("flame_center_alt");
    expect(names).not.toContain("flame_center");
    // Os itens: quatro quadros cada, a caveira inclusive (ela vem da folha antiga, parada).
    for (const kind of ["fire", "bomb", "boot", "kick", "pierce", "skull"]) {
      for (let i = 0; i < POWERUP_STEPS; i++) expect(names).toContain(`pu_${kind}${i}`);
    }
    expect(POWERUP_STEPS).toBe(4);
    expect(names).not.toContain("pu_fire");
  });

  it("a caveirinha da maldição tem 7×6 lógicos, e o atlas sabe onde começa a cabeça do boneco", () => {
    expect(requiredFrames()).toContain("curse");
    expect(frames.curse.w).toBe(7 * ART);
    expect(frames.curse.h).toBe(6 * ART);
    // O quadro de 28 lógicos tem linhas vazias acima do pompom: a caveirinha encosta nele, não no quadro.
    expect(atlasData.headTop).toBeGreaterThan(0);
    expect(atlasData.headTop).toBeLessThan(10);
    expect(HEAD_TOP).toBe(atlasData.headTop);
  });

  it("a chama e o item ocupam a célula inteira; a bomba cabe na largura dela e sobe 24 lógicos (as faíscas)", () => {
    for (const name of requiredFrames().filter((n) => /^(flame_|pu_)/.test(n))) {
      expect(frames[name].w, name).toBe(16 * ART);
      expect(frames[name].h, name).toBe(16 * ART);
    }
    for (const name of requiredFrames().filter((n) => /^(bomb|pierce)_/.test(n))) {
      expect(frames[name].w, name).toBe(16 * ART);
      expect(frames[name].h, name).toBe(24 * ART);
    }
  });

  it("cada quadro da bomba, da chama e do item é um recorte distinto", () => {
    for (const prefix of ["bomb_fuse", "bomb_pulse", "pierce_fuse", "flame_center", "flame_h", "pu_fire", "pu_kick"]) {
      const seen = new Set<string>();
      const names = requiredFrames().filter((n) => n.startsWith(prefix));
      for (const name of names) seen.add(`${frames[name].x},${frames[name].y}`);
      expect(seen.size, prefix).toBe(names.length);
    }
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
    const outside = list.filter(([, r]) => r.x + r.w > ATLAS_W).map(([name]) => name);
    expect(outside).toEqual([]);
    // São centenas de quadros: junta as invasões num só resultado em vez de um expect por par.
    const overlaps: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const [name, r] = list[i];
      for (let j = i + 1; j < list.length; j++) {
        const [other, o] = list[j];
        const apart = r.x + r.w <= o.x || o.x + o.w <= r.x || r.y + r.h <= o.y || o.y + o.h <= r.y;
        if (!apart) overlaps.push(`${name} x ${other}`);
      }
    }
    expect(overlaps).toEqual([]);
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

describe("o cenário recortado do tileset", () => {
  // O pngjs não tem tipos: só o que o teste usa.
  type Png = { width: number; data: Uint8Array };
  const { PNG } = createRequire(import.meta.url)("pngjs") as { PNG: { sync: { read(buf: Buffer): Png } } };
  const png = PNG.sync.read(readFileSync(new URL("./atlas.png", import.meta.url)));
  const px = (name: string, x: number, y: number) => {
    const r = frames[name];
    const i = ((r.y + y) * png.width + r.x + x) * 4;
    return Array.from(png.data.subarray(i, i + 4));
  };
  /** As quatro bordas de um quadro, pixel a pixel. */
  const border = (name: string) => {
    const r = frames[name];
    const out: number[][] = [];
    for (let x = 0; x < r.w; x++) out.push(px(name, x, 0), px(name, x, r.h - 1));
    for (let y = 0; y < r.h; y++) out.push(px(name, 0, y), px(name, r.w - 1, y));
    return out;
  };
  const luma = ([r, g, b]: number[]) => (r + g + b) / 3;

  it("toda lajota é opaca e tem a junta escura na coluna e na linha 0: qualquer uma encosta em qualquer outra", () => {
    for (let i = 0; i < atlasData.variants.floor; i++) {
      const name = `floor${i}`;
      const r = frames[name];
      let joint = 0;
      for (let x = 0; x < r.w; x++) joint += luma(px(name, x, 0));
      for (let y = 0; y < r.h; y++) joint += luma(px(name, 0, y));
      // A junta é bem mais escura que a lajota (a lajota fica em ~115).
      expect(joint / (r.w + r.h), name).toBeLessThan(80);
      for (const p of border(name)) expect(p[3], name).toBe(255);
    }
  });

  it("a muralha segue reta: a de cima é a de baixo, e a da direita é o espelho da esquerda", () => {
    expect(border("wall_b")).toEqual(border("wall_t"));
    const l = frames.wall_l;
    for (let y = 0; y < l.h; y++) {
      for (let x = 0; x < l.w; x++) expect(px("wall_r", l.w - 1 - x, y), `${x},${y}`).toEqual(px("wall_l", x, y));
    }
    expect(border("wall_l")).not.toEqual(border("wall_t"));
  });

  it("do lado de dentro, a muralha dos lados é a frente da de cima girada: as pedras miúdas correm na vertical", () => {
    const t = frames.wall_t;
    const top = Math.round((27 / 52) * t.h);
    const inner = t.h - top; // a frente, em linhas da de cima; em colunas na dos lados
    for (let y = top; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        // Girada 90° para a esquerda e colada do lado de dentro: a linha y da frente vira a coluna (y - top) a partir da emenda.
        expect(px("wall_l", t.w - inner + (y - top), t.h - 1 - x), `${x},${y}`).toEqual(px("wall_t", x, y));
      }
    }
    expect(inner).toBeGreaterThan(0);
  });

  it("os blocos dos lados são o espelho um do outro", () => {
    const l = frames.orn_l0_0;
    for (let y = 0; y < l.h; y++) {
      for (let x = 0; x < l.w; x++) expect(px("orn_r0_0", l.w - 1 - x, y)).toEqual(px("orn_l0_0", x, y));
    }
  });

  it("em todo tema novo a lajota é opaca, o tijolo tem a largura da célula, e a muralha segue reta", () => {
    for (const id of Object.keys(THEME_CUTS)) {
      for (let i = 0; i < THEME_VARIANTS[id].floor; i++) {
        for (const p of border(`${id}_floor${i}`)) expect(p[3], `${id}_floor${i}`).toBe(255);
      }
      // A direita é o espelho da esquerda; o ornamento dos lados também.
      for (const [a, b] of [[`${id}_wall_l`, `${id}_wall_r`], [`${id}_orn_l0_0`, `${id}_orn_r0_0`]].filter(([a]) => frames[a])) {
        const r = frames[a];
        for (let y = 0; y < r.h; y += 3) {
          for (let x = 0; x < r.w; x += 3) expect(px(b, r.w - 1 - x, y), `${a} ${x},${y}`).toEqual(px(a, x, y));
        }
      }
      // A de baixo é a de cima espelhada na vertical, ou ela mesma, conforme o cenário.
      const t = frames[`${id}_wall_t`];
      const mirror = atlasData.themes[id as keyof typeof atlasData.themes].walls.bottom === "mirror";
      for (let y = 0; y < t.h; y += 3) {
        for (let x = 0; x < t.w; x += 3) {
          const sy = mirror ? t.h - 1 - y : y;
          expect(px(`${id}_wall_b`, x, sy), `${id} ${x},${y}`).toEqual(px(`${id}_wall_t`, x, y));
        }
      }
    }
  });

  it("nenhuma peça de tema novo tem um vizinho do tileset na borda: o recorte é só a peça", () => {
    // Uma lajota recortada de junta a junta tem as quatro bordas parecidas com o miolo (não um pedaço de outra peça).
    for (const id of Object.keys(atlasData.themes)) {
      const name = `${id}_floor0`;
      const r = frames[name];
      const mid = luma(px(name, r.w >> 1, r.h >> 1));
      let edge = 0;
      for (const p of border(name)) edge += luma(p);
      edge /= 2 * (r.w + r.h);
      expect(Math.abs(edge - mid), name).toBeLessThan(60);
    }
  });
});

describe("a explosão recortada da folha", () => {
  type Png = { width: number; data: Uint8Array };
  const { PNG } = createRequire(import.meta.url)("pngjs") as { PNG: { sync: { read(buf: Buffer): Png } } };
  const png = PNG.sync.read(readFileSync(new URL("./atlas.png", import.meta.url)));
  const alpha = (name: string, x: number, y: number) => {
    const r = frames[name];
    return png.data[((r.y + y) * png.width + r.x + x) * 4 + 3];
  };
  /** Quantos pixels de fogo tem a coluna `x` (ou a linha `y`) de um quadro. */
  const thickX = (name: string, x: number) => {
    let n = 0;
    for (let y = 0; y < frames[name].h; y++) if (alpha(name, x, y) > 0) n++;
    return n;
  };
  const thickY = (name: string, y: number) => {
    let n = 0;
    for (let x = 0; x < frames[name].w; x++) if (alpha(name, x, y) > 0) n++;
    return n;
  };
  const last = 16 * ART - 1;
  const mid = 8 * ART;

  it("o braço emenda: na borda da lajota é tão grosso quanto no meio, e igual dos dois lados", () => {
    for (let f = 1; f <= 5; f++) {
      const h = `flame_h${f}`;
      expect(thickX(h, 0), h).toBeGreaterThanOrEqual(0.6 * thickX(h, mid));
      expect(Math.abs(thickX(h, 0) - thickX(h, last)), h).toBeLessThanOrEqual(2);
      const v = `flame_v${f}`;
      expect(thickY(v, 0), v).toBeGreaterThanOrEqual(0.6 * thickY(v, mid));
      expect(Math.abs(thickY(v, 0) - thickY(v, last)), v).toBeLessThanOrEqual(2);
    }
  });

  it("o centro e as pontas encostam no braço com a mesma grossura", () => {
    for (let f = 1; f <= 5; f++) {
      const h = `flame_h${f}`;
      const v = `flame_v${f}`;
      expect(thickX(`flame_center${f}`, last), `center${f}`).toBe(thickX(h, last));
      expect(thickX(`flame_center${f}`, 0), `center${f}`).toBe(thickX(h, 0));
      expect(thickY(`flame_center${f}`, last), `center${f}`).toBe(thickY(v, last));
      expect(thickX(`flame_l${f}`, last), `l${f}`).toBeGreaterThanOrEqual(thickX(h, 0) - 2);
      expect(thickX(`flame_r${f}`, 0), `r${f}`).toBeGreaterThanOrEqual(thickX(h, last) - 2);
      expect(thickY(`flame_u${f}`, last), `u${f}`).toBeGreaterThanOrEqual(thickY(v, 0) - 2);
      expect(thickY(`flame_d${f}`, 0), `d${f}`).toBeGreaterThanOrEqual(thickY(v, last) - 2);
    }
  });
});

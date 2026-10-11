import {
  BRICK,
  BUSH,
  DEATH_TIME,
  DOWN,
  FLAME_CENTER,
  FLAME_END_D,
  FLAME_END_L,
  FLAME_END_R,
  FLAME_END_U,
  FLAME_H,
  LEFT,
  RIGHT,
  TILE,
  UP,
  WALL,
  cellIndex,
  type ArenaState,
  type PublicPlayer,
} from "@bomb/shared";
import * as art from "../art/atlas";
import type { Facing, FlamePiece, Frame } from "../art/atlas";
import { BACKGROUND, MARGIN, STRETCH } from "../art/scenario";
import { ornamentsOf, themeArt, type ThemeArt } from "../art/themes";
import { bombFrame, flameStep, itemStep } from "./fuse";
import { DELAY_MS, record, sampleAt, type Sample } from "./interp";
import { Predictor, withPrediction } from "./predict";
import { idleStep, walkStep } from "./walk";

/*
 * O desenho da arena. Lê o estado VIVO do Colyseus a cada quadro e desenha em
 * 16px lógicos por célula, numa escala inteira. A arte do atlas tem quatro
 * vezes essa resolução e é reduzida com suavização para a escala da tela —
 * por isso a imagem fica em alta definição em vez de serrilhada. Nada aqui
 * decide regra: se o servidor diz que a chama está na célula, a chama é
 * desenhada; o que é deste arquivo é só o tempo entre um patch e outro — a
 * posição interpolada, o quadro da animação, o pulso da bomba. A bomba e a
 * chama não trazem relógio: a tela anota quando viu cada uma pela primeira
 * vez e escolhe o quadro pela idade (ver `fuse.ts`).
 */

/**
 * O que o canvas de uma arena `cols × rows` mede, em pixels lógicos: a arena
 * e o fundo escuro em volta, onde os merlões e os cantos passam da muralha.
 * `shownH` é a altura que a tela mostra: a desenhada, esticada na proporção
 * da referência (ver `STRETCH`). A célula continua com 16 px lógicos em
 * qualquer tamanho: uma arena maior é um canvas maior, não uma peça maior.
 */
export function viewOf(cols: number, rows: number) {
  const w = cols * TILE + MARGIN * 2;
  const h = rows * TILE + MARGIN * 2;
  return { w, h, shownH: Math.round(h * STRETCH) };
}

/**
 * A maior escala, em quartos (2, 2,25, 2,5…), em que o canvas de `view` cabe
 * na largura e na altura que sobram na janela; entre 0,5 e 6. Uma arena menor
 * é um canvas menor, que cabe numa escala maior. Abaixo de 1 a célula fica
 * menor que os 16 px lógicos (um celular deitado com o direcional na tela):
 * é pequeno, mas a página não rola.
 */
export function fitScale(availW: number, availH: number, view: { w: number; shownH: number }): number {
  const raw = Math.min(availW / view.w, availH / view.shownH);
  return Math.max(0.5, Math.min(6, Math.floor(raw * 4) / 4));
}

/** Algo que assenta no chão: desenhado na ordem do pé (`y`, a borda de baixo, em pixels lógicos) e, no mesmo pé, do `rank`. */
type Drawable = { y: number; rank: number; draw: (ctx: CanvasRenderingContext2D) => void };
const BLOCK = 0;
const POWERUP = 1;
const FLAME = 2;
const BOMB = 3;
const PLAYER = 4;

type Puppet = {
  x: number;
  y: number;
  samples: Sample[];
  /** Quando a morte começou, no relógio da tela. */
  diedAt: number;
  /** A distância andada na tela, em pixels lógicos, acumulada só enquanto anda. */
  stride: number;
};

/** Desenha um quadro do atlas em coordenadas lógicas, no tamanho lógico dele. */
/**
 * Desenha um quadro com as bordas em pixels inteiros da tela. Com a escala
 * fracionária e a suavização ligada, uma borda no meio de um pixel sai meio
 * transparente, e entre duas células vizinhas aparecia um fio do fundo.
 */
function blit(ctx: CanvasRenderingContext2D, frame: Frame, x: number, y: number, w?: number, h?: number) {
  w ??= art.logicalWidth(frame);
  h ??= art.logicalHeight(frame);
  const m = ctx.getTransform();
  const x0 = Math.round(m.a * x + m.e);
  const y0 = Math.round(m.d * y + m.f);
  const x1 = Math.round(m.a * (x + w) + m.e);
  const y1 = Math.round(m.d * (y + h) + m.f);
  ctx.drawImage(frame, (x0 - m.e) / m.a, (y0 - m.f) / m.d, (x1 - x0) / m.a, (y1 - y0) / m.d);
}

export class ArenaRenderer {
  private puppets = new Map<string, Puppet>();
  /** Quando cada bomba (por id) e cada chama (por célula e nascimento) apareceu, no relógio da tela. */
  private bombSeen = new Map<string, number>();
  /** O rastro de cada bomba, por id: chutada, ela anda e é interpolada como os bonecos. */
  private bombTrails = new Map<string, Sample[]>();
  private flameSeen = new Map<string, number>();
  private scale = 1;
  private dpr = 1;
  private cols = 0;
  private rows = 0;
  private canvas: HTMLCanvasElement;
  /** Quem joga nesta tela e a direção do dedo dele: o boneco dele é previsto (ver `predict.ts`). */
  private local: { id: string; input: () => readonly [number, number] } | null = null;
  private predictor = new Predictor();
  private lastNow = 0;
  /** Onde o próprio boneco foi desenhado no quadro anterior: para o passo da caminhada. */
  private ownX = 0;
  private ownY = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /**
   * O tamanho do canvas: a arena `cols × rows` em `scale` pixels CSS por
   * pixel lógico; o canvas acompanha a densidade da tela.
   */
  fit(scale: number, cols: number, rows: number) {
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const { w, shownH } = viewOf(cols, rows);
    const width = Math.round(w * scale * dpr);
    if (
      scale === this.scale &&
      dpr === this.dpr &&
      cols === this.cols &&
      rows === this.rows &&
      this.canvas.width === width
    ) {
      return;
    }
    this.scale = scale;
    this.dpr = dpr;
    this.cols = cols;
    this.rows = rows;
    this.canvas.width = width;
    this.canvas.height = Math.round(shownH * scale * dpr);
  }

  /** Liga a previsão do boneco de `id`, que anda com a direção que `input` devolve. */
  setLocal(id: string, input: () => readonly [number, number]) {
    if (this.local?.id !== id) this.predictor.reset();
    this.local = { id, input };
  }

  draw(state: ArenaState | null, now: number) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    // A arena que o estado traz; sem estado, o canvas do tamanho que se pediu.
    const cols = state?.cols || this.cols;
    const rows = state?.rows || this.rows;
    if (state && (cols !== this.cols || rows !== this.rows)) this.fit(this.scale, cols, rows);
    const { w, h, shownH } = viewOf(cols, rows);
    const k = this.scale * this.dpr;
    // Na vertical, a escala leva o esticão da proporção da referência.
    ctx.setTransform(k, 0, 0, (k * shownH) / h, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = BACKGROUND;
    ctx.fillRect(0, 0, w, h);
    ctx.translate(MARGIN, MARGIN);

    if (!state || state.grid.length !== cols * rows) return;
    // O tema é só desenho: a mesma planta, com as peças do tileset escolhido.
    const theme = themeArt(state.themeId);
    this.drawGrid(ctx, state, theme);
    /*
     * Tudo o que assenta no chão — bloco, item, chama, bomba, boneco — é
     * desenhado em ordem de profundidade: pelo pé (a borda de baixo), de
     * cima para baixo. Um pilar mais alto que a célula (o da floresta, a
     * máquina cyberpunk) sobe para a célula de cima, e quem está lá fica
     * atrás dele; quem está na célula de baixo fica na frente. No mesmo pé
     * vale a ordem clássica: o bloco embaixo, o item, a chama, a bomba e o
     * boneco por cima.
     */
    const layer: Drawable[] = [];
    this.layBlocks(layer, state, theme);
    this.layPowerups(layer, state, now);
    this.layFlames(layer, state, now);
    this.layBombs(layer, state, now);
    this.layPlayers(layer, ctx, state, now);
    layer.sort((a, b) => a.y - b.y || a.rank - b.rank);
    for (const entry of layer) entry.draw(ctx);
    // A muralha de baixo é a mais perto de quem olha: ela e os ornamentos
    // dela sobem por cima da última fileira (as ameias de neve, os merlões),
    // e ficam na frente de tudo o que pisa nela.
    this.drawBottomWall(ctx, cols, rows, theme);
  }

  /* ------------------------------------------------------------ a grade */

  /**
   * O chão inteiro primeiro, depois a muralha da borda (com os cantos, os
   * merlões de cima e os blocos dos lados). Os blocos (pilar, tijolo, moita)
   * e tudo o que se mexe vêm depois, em ordem de profundidade (ver `draw`);
   * só os merlões da muralha de baixo vêm depois de tudo.
   */
  private drawGrid(ctx: CanvasRenderingContext2D, state: ArenaState, theme: ThemeArt) {
    const { cols, rows } = state;
    // O chão vai também embaixo da muralha: o canto deixa ver um pouco dele.
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        blit(ctx, art.floor(theme.floor(cols, rows, cx, cy), theme.id), cx * TILE, cy * TILE);
      }
    }
    this.drawWalls(ctx, cols, rows, theme);
  }

  /** Os blocos de dentro da muralha: pilar, tijolo, moita, cada um no pé da sua célula. */
  private layBlocks(layer: Drawable[], state: ArenaState, theme: ThemeArt) {
    const { cols, rows } = state;
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (wallSide(cx, cy, cols, rows)) continue;
        const cell = state.grid[cellIndex(cx, cy, cols)];
        const frame =
          cell === WALL
            ? art.pillar(theme.id)
            : cell === BRICK
              ? art.brick(theme.brick(cols, rows, cx, cy), theme.id)
              : cell === BUSH
                ? art.bush()
                : null;
        if (frame) layer.push({ y: (cy + 1) * TILE, rank: BLOCK, draw: (ctx) => this.drawBlock(ctx, frame, cx * TILE, cy * TILE) });
      }
    }
  }

  /**
   * A muralha: a fieira de cada lado, os quatro cantos e os ornamentos de
   * cima e dos lados (os de baixo vêm depois de tudo, ver `draw`). A peça da
   * muralha de cima pode ser mais alta que a célula (as ameias de neve): o
   * que passa sobe para a margem. A de baixo é a mesma peça de pé, subindo
   * por cima da última fileira como no cenário, ou — nos temas em que a
   * borda fica para fora dos dois lados — a de cima espelhada, descendo
   * para a margem.
   */
  private drawWalls(ctx: CanvasRenderingContext2D, cols: number, rows: number, theme: ThemeArt) {
    // A fileira de baixo fica para o fim (`drawBottomWall`).
    for (let cy = 0; cy < rows - 1; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const side = wallSide(cx, cy, cols, rows);
        if (!side) continue;
        const frame = art.wall(side, theme.id);
        const h = art.logicalHeight(frame);
        blit(ctx, frame, cx * TILE, side === "t" ? (cy + 1) * TILE - h : cy * TILE);
      }
    }
    this.drawCorners(ctx, 0, cols, theme);
    this.drawOrnaments(ctx, "t", cols, rows, theme);
    this.drawOrnaments(ctx, "l", cols, rows, theme);
    this.drawOrnaments(ctx, "r", cols, rows, theme);
  }

  /** Os dois cantos de uma fileira. O canto passa um pouco da célula: para os lados, para cima e um pixel para baixo. */
  private drawCorners(ctx: CanvasRenderingContext2D, cy: number, cols: number, theme: ThemeArt) {
    const corner = art.corner(theme.id);
    const cw = art.logicalWidth(corner);
    const ch = art.logicalHeight(corner);
    for (const cx of [0, cols - 1]) blit(ctx, corner, cx * TILE + (TILE - cw) / 2, (cy + 1) * TILE + 1 - ch);
  }

  /**
   * A muralha de baixo, com os cantos e os ornamentos, por cima de tudo.
   * De pé, a peça sobe por cima da última fileira (as ameias de neve da
   * cidadela); espelhada, desce para a margem.
   */
  private drawBottomWall(ctx: CanvasRenderingContext2D, cols: number, rows: number, theme: ThemeArt) {
    const mirror = art.walls(theme.id).bottom === "mirror";
    const frame = art.wall("b", theme.id);
    const h = art.logicalHeight(frame);
    const y = mirror ? (rows - 1) * TILE : rows * TILE - h;
    for (let cx = 1; cx < cols - 1; cx++) blit(ctx, frame, cx * TILE, y);
    this.drawCorners(ctx, rows - 1, cols, theme);
    this.drawOrnaments(ctx, "b", cols, rows, theme);
  }

  /**
   * Os ornamentos de um lado da muralha, série por série (ver `ornamentsOf`).
   * Em cima, de pé no chão da muralha; embaixo, idem (ou pendendo da borda,
   * se a muralha é espelhada); nos lados, centrados na célula da muralha —
   * ou, na referência, encostados na borda de fora, passando um pixel dela.
   */
  private drawOrnaments(ctx: CanvasRenderingContext2D, side: art.WallSide, cols: number, rows: number, theme: ThemeArt) {
    const walls = art.walls(theme.id);
    const horizontal = side === "t" || side === "b";
    const series = horizontal ? walls.top : walls.side;
    const length = horizontal ? cols : rows;
    series.forEach((entry, s) => {
      for (const { at, piece } of ornamentsOf(entry, length)) {
        const frame = art.ornament(side, s, piece, theme.id);
        const w = art.logicalWidth(frame);
        const h = art.logicalHeight(frame);
        if (side === "t") {
          blit(ctx, frame, at * TILE - w / 2, TILE - h);
        } else if (side === "b") {
          const y = walls.bottom === "mirror" ? (rows - 1) * TILE : rows * TILE - h;
          blit(ctx, frame, at * TILE - w / 2, y);
        } else {
          const x =
            walls.sideAnchor === "outer"
              ? side === "l"
                ? -1
                : cols * TILE + 1 - w
              : (side === "l" ? 0 : (cols - 1) * TILE) + (TILE - w) / 2;
          blit(ctx, frame, x, at * TILE - h / 2);
        }
      }
    });
  }

  /** Um bloco assenta no chão da célula, centrado; o que passa da altura sobe. */
  private drawBlock(ctx: CanvasRenderingContext2D, frame: Frame, x: number, y: number) {
    const w = art.logicalWidth(frame);
    const h = art.logicalHeight(frame);
    blit(ctx, frame, x + (TILE - w) / 2, y + TILE - h);
  }

  private layPowerups(layer: Drawable[], state: ArenaState, now: number) {
    const step = itemStep(now);
    for (const drop of state.powerups) {
      // O item flutua devagar, cada um na sua fase, para a arena não ficar parada.
      const bob = Math.sin(now / 350 + drop.cx * 1.3 + drop.cy * 0.7);
      const frame = art.powerup(drop.kind, step);
      layer.push({ y: (drop.cy + 1) * TILE, rank: POWERUP, draw: (ctx) => blit(ctx, frame, drop.cx * TILE, drop.cy * TILE + bob) });
    }
  }

  private layBombs(layer: Drawable[], state: ArenaState, now: number) {
    const alive = new Set<string>();
    for (const bomb of state.bombs) {
      alive.add(bomb.id);
      // O pavio queima desde que a tela viu a bomba; o pulso e o estouro vêm no fim do fuso.
      const { phase, step } = bombFrame(now - this.firstSeen(this.bombSeen, bomb.id, now));
      const frame = art.bomb(phase, step, bomb.pierce);
      const w = art.logicalWidth(frame);
      const h = art.logicalHeight(frame);
      // Parada, o centro é o da célula; chutada, segue o rastro com o mesmo atraso dos bonecos.
      let trail = this.bombTrails.get(bomb.id);
      if (!trail) this.bombTrails.set(bomb.id, (trail = []));
      record(trail, now, bomb.x, bomb.y);
      const { x, y } = sampleAt(trail, now - DELAY_MS);
      const foot = (y + 0.5) * TILE;
      layer.push({ y: foot, rank: BOMB, draw: (ctx) => blit(ctx, frame, x * TILE - w / 2, foot - h) });
    }
    forget(this.bombSeen, alive);
    forget(this.bombTrails, alive);
  }

  private layFlames(layer: Drawable[], state: ArenaState, now: number) {
    const alive = new Set<string>();
    for (const flame of state.flames) {
      // Uma chama reacesa (outra bomba na cadeia) nasce de novo: a chave muda e a animação recomeça.
      const key = `${flame.cx},${flame.cy}:${flame.born}`;
      alive.add(key);
      const step = flameStep(now - this.firstSeen(this.flameSeen, key, now));
      const frame = art.flame(piece(flame.kind), step);
      layer.push({ y: (flame.cy + 1) * TILE, rank: FLAME, draw: (ctx) => blit(ctx, frame, flame.cx * TILE, flame.cy * TILE) });
    }
    forget(this.flameSeen, alive);
  }

  /** Quando a tela viu `key` pela primeira vez; agora, se é a primeira. */
  private firstSeen(seen: Map<string, number>, key: string, now: number): number {
    let at = seen.get(key);
    if (at === undefined) {
      at = now;
      seen.set(key, at);
    }
    return at;
  }

  /* ------------------------------------------------------------ os bonecos */

  private layPlayers(layer: Drawable[], ctx: CanvasRenderingContext2D, state: ArenaState, now: number) {
    const seen = new Set<string>();

    const dt = this.lastNow ? Math.max(0, now - this.lastNow) : 0;
    this.lastNow = now;
    for (let player of state.players) {
      seen.add(player.id);
      const puppet = this.puppet(player, now);
      let moved = this.follow(puppet, player, now);
      if (this.local && player.id === this.local.id) {
        // O próprio boneco: a previsão, na hora, em vez do servidor de 100 ms atrás.
        const [dx, dy] = this.local.input();
        const predicted = this.predictor.step(state, player.id, dx, dy, dt);
        if (predicted) {
          moved = Math.hypot(predicted.x - this.ownX, predicted.y - this.ownY);
          puppet.x = predicted.x;
          puppet.y = predicted.y;
          player = withPrediction(player, predicted);
        }
        this.ownX = puppet.x;
        this.ownY = puppet.y;
      }
      if (player.alive) puppet.stride += moved * TILE;
      else puppet.stride = 0;

      if (player.dying) {
        if (!puppet.diedAt) puppet.diedAt = now;
      } else {
        puppet.diedAt = 0;
      }

      if (!player.alive && !player.dying) continue;

      // O pé do boneco: a borda de baixo da célula em que está.
      layer.push({ y: (puppet.y + 0.5) * TILE, rank: PLAYER, draw: () => this.drawPlayer(ctx, state, player, puppet, now) });
    }

    for (const [id] of this.puppets) if (!seen.has(id)) this.puppets.delete(id);
  }

  private drawPlayer(
    ctx: CanvasRenderingContext2D,
    state: ArenaState,
    player: PublicPlayer,
    puppet: Puppet,
    now: number,
  ) {
    // O quadro do personagem é mais largo e mais alto que a célula: os pés
    // ficam no chão da célula e o resto sobe.
    const box = art.character(player.slot, "down", 0);
    const w = art.logicalWidth(box);
    const h = art.logicalHeight(box);
    const x = puppet.x * TILE - w / 2;
    const y = (puppet.y + 0.5) * TILE - h;

    if (player.dying) {
      // Os olhos em X tremendo, o boneco achatando e, por fim, a nuvem.
      const elapsed = now - puppet.diedAt;
      const t = elapsed / DEATH_TIME;
      if (t < 0.3) {
        const shake = Math.floor(elapsed / 60) % 2 === 0 ? 0.5 : -0.5;
        blit(ctx, art.characterPose(player.slot, "dead0"), x + shake, y);
      } else if (t < 0.55) {
        blit(ctx, art.characterPose(player.slot, "dead1"), x, y);
      } else if (t < 0.8) {
        blit(ctx, art.characterPose(player.slot, "dead2"), x, y);
      } else {
        blit(ctx, art.characterPose(player.slot, "dead3"), x, y);
      }
      return;
    }

    // Intocável: pisca em quadros.
    if (player.invulnerable && Math.floor(now / 100) % 2 === 0) return;

    const finished = state.phase === "finished";
    if (finished && state.winnerId === player.id) {
      // A vitória: a folha própria, de frente, no ritmo do parado.
      blit(ctx, art.characterWin(player.slot, idleStep(now, art.winSteps())), x, y);
      return;
    }

    const facing = FACING[player.dir] ?? "down";
    const walking = player.moving && !finished;
    // Andando, o passo segue a distância; parado, a respiração segue o relógio.
    const sprite = walking
      ? art.character(player.slot, facing, walkStep(puppet.stride, art.walkSteps(facing), walking))
      : art.characterIdle(player.slot, facing, idleStep(now, art.idleSteps(facing)));
    blit(ctx, sprite, x, y);

    if (player.curse) {
      // Amaldiçoado: a caveirinha paira sobre a cabeça, balançando devagar.
      const mark = art.curse();
      const bob = Math.round(Math.sin(now / 250));
      blit(ctx, mark, x + (w - art.logicalWidth(mark)) / 2, y + art.HEAD_TOP - art.logicalHeight(mark) - 1 + bob);
    }
  }

  private puppet(player: PublicPlayer, now: number): Puppet {
    let puppet = this.puppets.get(player.id);
    if (!puppet) {
      puppet = {
        x: player.x,
        y: player.y,
        samples: [{ t: now - DELAY_MS, x: player.x, y: player.y }],
        diedAt: 0,
        stride: 0,
      };
      this.puppets.set(player.id, puppet);
    }
    return puppet;
  }

  /**
   * Leva o boneco para onde o servidor dizia que ele estava há `DELAY_MS`
   * (ver `interp.ts`). Devolve quanto ele andou na tela, em células. Morto,
   * ele fica onde morreu, sem histórico.
   */
  private follow(puppet: Puppet, player: PublicPlayer, now: number): number {
    if (!player.alive) {
      puppet.samples.length = 0;
      puppet.x = player.x;
      puppet.y = player.y;
      return 0;
    }
    record(puppet.samples, now, player.x, player.y);
    const { x, y } = sampleAt(puppet.samples, now - DELAY_MS);
    const moved = Math.hypot(x - puppet.x, y - puppet.y);
    puppet.x = x;
    puppet.y = y;
    return moved;
  }
}

/** Esquece o que não está mais na arena, para o mapa não crescer a rodada inteira. */
function forget(seen: Map<string, unknown>, alive: Set<string>) {
  for (const key of seen.keys()) if (!alive.has(key)) seen.delete(key);
}

/** A muralha da borda: cada lado tem a fieira virada para o seu lado. Fora da borda, nada. */
function wallSide(cx: number, cy: number, cols: number, rows: number): art.WallSide | null {
  if (cy === 0) return "t";
  if (cy === rows - 1) return "b";
  if (cx === 0) return "l";
  if (cx === cols - 1) return "r";
  return null;
}

const FACING: Record<number, Facing> = {
  [DOWN]: "down",
  [UP]: "up",
  [LEFT]: "left",
  [RIGHT]: "right",
};

function piece(kind: number): FlamePiece {
  switch (kind) {
    case FLAME_CENTER:
      return "center";
    case FLAME_H:
      return "h";
    case FLAME_END_L:
      return "l";
    case FLAME_END_R:
      return "r";
    case FLAME_END_U:
      return "u";
    case FLAME_END_D:
      return "d";
    default:
      return "v";
  }
}

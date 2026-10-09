import {
  BRICK,
  BUSH,
  COLS,
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
  ROWS,
  TILE,
  UP,
  WALL,
  cellIndex,
  type ArenaState,
  type PublicPlayer,
} from "@bomb/shared";
import * as art from "../art/atlas";
import type { Facing, FlamePiece, Frame } from "../art/atlas";
import { DELAY_MS, record, sampleAt, type Sample } from "./interp";
import { idleStep, walkStep } from "./walk";

/*
 * O desenho da arena. Lê o estado VIVO do Colyseus a cada quadro e desenha em
 * 16px lógicos por célula, numa escala inteira. A arte do atlas tem quatro
 * vezes essa resolução e é reduzida com suavização para a escala da tela —
 * por isso a imagem fica em alta definição em vez de serrilhada. Nada aqui
 * decide regra: se o servidor diz que a chama está na célula, a chama é
 * desenhada; o que é deste arquivo é só o tempo entre um patch e outro — a
 * posição interpolada, o quadro da animação, o pulso da bomba.
 */

/** A borda de jardim em volta da muralha, em células. */
export const MARGIN = 1;
export const VIEW_COLS = COLS + MARGIN * 2;
export const VIEW_ROWS = ROWS + MARGIN * 2;
export const VIEW_W = VIEW_COLS * TILE;
export const VIEW_H = VIEW_ROWS * TILE;

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
  private scale = 1;
  private dpr = 1;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  /** `scale` é em pixels CSS por pixel lógico; o canvas acompanha a densidade da tela. */
  setScale(scale: number) {
    const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
    const width = Math.round(VIEW_W * scale * dpr);
    if (scale === this.scale && dpr === this.dpr && this.canvas.width === width) return;
    this.scale = scale;
    this.dpr = dpr;
    this.canvas.width = width;
    this.canvas.height = Math.round(VIEW_H * scale * dpr);
  }

  draw(state: ArenaState | null, now: number) {
    const ctx = this.canvas.getContext("2d");
    if (!ctx) return;
    const k = this.scale * this.dpr;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    this.drawGarden(ctx);
    ctx.translate(MARGIN * TILE, MARGIN * TILE);

    if (!state) return;
    this.drawGrid(ctx, state);
    this.drawPowerups(ctx, state, now);
    this.drawBombs(ctx, state, now);
    this.drawFlames(ctx, state, now);
    this.drawPlayers(ctx, state, now);
  }

  /* ------------------------------------------------------------ o jardim */

  private drawGarden(ctx: CanvasRenderingContext2D) {
    for (let cy = 0; cy < VIEW_ROWS; cy++) {
      for (let cx = 0; cx < VIEW_COLS; cx++) {
        const edge =
          cx < MARGIN || cy < MARGIN || cx >= VIEW_COLS - MARGIN || cy >= VIEW_ROWS - MARGIN;
        if (!edge) continue;
        blit(ctx, art.garden(cx, cy), cx * TILE, cy * TILE);
      }
    }
    // As árvores nas laterais (cada uma de uma versão) e um banco embaixo.
    const tree = (cx: number, cy: number) => {
      const frame = art.tree(cx, cy);
      const w = art.logicalWidth(frame);
      blit(ctx, frame, cx * TILE + (TILE - w) / 2, (cy + 1) * TILE - art.logicalHeight(frame));
    };
    for (let cy = 1; cy < VIEW_ROWS - 1; cy += 3) {
      tree(0, cy);
      tree(VIEW_COLS - 1, cy + 1);
    }
    for (let cx = 3; cx < VIEW_COLS - 3; cx += 4) {
      tree(cx, 0);
      tree(cx + 2, VIEW_ROWS - 1);
    }
    const benchFrame = art.bench();
    const benchY = (VIEW_ROWS - 1) * TILE + (TILE - art.logicalHeight(benchFrame)) / 2;
    blit(ctx, benchFrame, Math.floor(VIEW_COLS / 2) * TILE + 1, benchY);
    blit(ctx, benchFrame, (Math.floor(VIEW_COLS / 2) - 4) * TILE + 1, benchY);
  }

  /* ------------------------------------------------------------ a grade */

  /**
   * O chão inteiro primeiro, depois os blocos (muralha com os cantos de
   * lanterna, pilar, tijolo, moita) de cima para baixo. Em vista de 3/4 a face de cima do bloco
   * sobe um pouco para a célula de cima; como no Bomberman clássico, tudo o que
   * se mexe (item, bomba, chama, boneco) vem depois, por cima dos blocos, e
   * nunca é cortado por eles.
   */
  private drawGrid(ctx: CanvasRenderingContext2D, state: ArenaState) {
    // O chão vai também embaixo da muralha: o canto tem recortes (o chanfro, o degrau da lanterna).
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) blit(ctx, art.floor(cx, cy), cx * TILE, cy * TILE);
    }
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const cell = state.grid[cellIndex(cx, cy)];
        const side = cell === WALL ? wallSide(cx, cy) : null;
        const corner = side ? cornerSide(cx, cy) : null;
        const frame = corner
          ? art.corner(corner)
          : side
            ? art.wall(side)
            : cell === WALL
            ? art.pillar()
            : cell === BRICK
              ? art.brick()
              : cell === BUSH
                ? art.bush()
                : null;
        if (frame) this.drawBlock(ctx, frame, cx * TILE, cy * TILE);
      }
    }
  }

  /** Um bloco assenta no chão da célula, centrado; o que passa da altura sobe. */
  private drawBlock(ctx: CanvasRenderingContext2D, frame: Frame, x: number, y: number) {
    const w = art.logicalWidth(frame);
    const h = art.logicalHeight(frame);
    blit(ctx, frame, x + (TILE - w) / 2, y + TILE - h);
  }

  private drawPowerups(ctx: CanvasRenderingContext2D, state: ArenaState, now: number) {
    for (const drop of state.powerups) {
      // O item flutua devagar, cada um na sua fase, para a arena não ficar parada.
      const bob = Math.sin(now / 350 + drop.cx * 1.3 + drop.cy * 0.7);
      blit(ctx, art.powerup(drop.kind), drop.cx * TILE, drop.cy * TILE + bob);
    }
  }

  private drawBombs(ctx: CanvasRenderingContext2D, state: ArenaState, now: number) {
    for (const bomb of state.bombs) {
      // O pavio queima em cinco quadros e a bomba incha e murcha de leve.
      const frame = art.bomb(Math.floor(now / 120));
      const phase = (now / 500) % 1;
      const swell = 1 + 0.04 * Math.sin(phase * Math.PI * 2);
      const w = art.logicalWidth(frame) * swell;
      const h = art.logicalHeight(frame) * swell;
      blit(ctx, frame, bomb.cx * TILE + (TILE - w) / 2, (bomb.cy + 1) * TILE - h, w, h);
    }
  }

  private drawFlames(ctx: CanvasRenderingContext2D, state: ArenaState, now: number) {
    const alt = Math.floor(now / 70) % 2 === 1;
    for (const flame of state.flames) {
      blit(ctx, art.flame(piece(flame.kind), alt), flame.cx * TILE, flame.cy * TILE);
    }
  }

  /* ------------------------------------------------------------ os bonecos */

  private drawPlayers(ctx: CanvasRenderingContext2D, state: ArenaState, now: number) {
    const seen = new Set<string>();
    const drawn: Array<{ y: number; draw: () => void }> = [];

    for (const player of state.players) {
      seen.add(player.id);
      const puppet = this.puppet(player, now);
      const moved = this.follow(puppet, player, now);
      if (player.alive) puppet.stride += moved * TILE;
      else puppet.stride = 0;

      if (player.dying) {
        if (!puppet.diedAt) puppet.diedAt = now;
      } else {
        puppet.diedAt = 0;
      }

      if (!player.alive && !player.dying) continue;

      drawn.push({
        y: puppet.y,
        draw: () => this.drawPlayer(ctx, state, player, puppet, now),
      });
    }

    for (const [id] of this.puppets) if (!seen.has(id)) this.puppets.delete(id);
    drawn.sort((a, b) => a.y - b.y);
    for (const entry of drawn) entry.draw();
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

/** A muralha da borda: cada lado tem a pedra virada para o seu lado; os cantos seguem o de cima e o de baixo. */
/** Os quatro cantos da muralha: o lado do canto, ou nada. */
function cornerSide(cx: number, cy: number): "l" | "r" | null {
  if (cy !== 0 && cy !== ROWS - 1) return null;
  if (cx === 0) return "l";
  if (cx === COLS - 1) return "r";
  return null;
}

function wallSide(cx: number, cy: number): art.WallSide | null {
  if (cy === 0) return "t";
  if (cy === ROWS - 1) return "b";
  if (cx === 0) return "l";
  if (cx === COLS - 1) return "r";
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

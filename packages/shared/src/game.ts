import {
  BASE_SPEED,
  BOMB_FUSE,
  BRICK,
  BUSH,
  COLS,
  COUNTDOWN,
  CURSES,
  CURSE_TIME,
  DEATH_TIME,
  DOWN,
  FLAME_CENTER,
  FLAME_END_D,
  FLAME_END_L,
  FLAME_END_R,
  FLAME_END_U,
  FLAME_H,
  FLAME_TIME,
  FLAME_V,
  FLOOR,
  INVULNERABLE_TIME,
  LEFT,
  LIVES,
  MATCH_TIME,
  MAX_BOMBS,
  MAX_PLAYERS,
  MAX_RANGE,
  MAX_SPEED_LEVEL,
  MIN_PLAYERS,
  POWERUPS,
  RESPAWN_TIME,
  RIGHT,
  ROWS,
  SPEED_STEP,
  UP,
  WALL,
  cellIndex,
  isSoft,
  type Curse,
  type Direction,
  type FxEvent,
  type GamePhase,
  type Powerup,
} from "./contract.js";

/**
 * A REGRA do Bombman. Tudo aqui, e nada em lugar nenhum além daqui. Mora no
 * pacote compartilhado porque o `/mock` da tela roda o mesmo motor, sem
 * servidor; valendo, quem o roda é só o servidor (`ArenaRoom`).
 *
 * O motor não conhece o Colyseus nem o relógio: ele recebe `tick(dt)` de quem
 * tem relógio e avança a arena em `dt` milissegundos. O único acaso é a função
 * `random` do construtor. É isso que deixa o teste rodar uma rodada inteira
 * sem esperar um milissegundo.
 *
 * As posições são em CÉLULAS: `x = 3.5` é o meio da coluna 3. O personagem
 * ocupa uma célula de largura e anda em trilhos — só se move no eixo
 * horizontal quando está centrado na linha, e vice-versa —, com o "corte de
 * quina" dos Bomberman clássicos: apertar para cima perto de uma esquina
 * desliza o personagem até o corredor em vez de travá-lo na parede.
 */

export class GameError extends Error {}

export type GamePlayer = {
  id: string;
  seatKey: string;
  name: string;
  slot: number;
  x: number;
  y: number;
  dir: Direction;
  moving: boolean;
  alive: boolean;
  /** Até quando a animação de morte roda. */
  dyingUntil: number;
  /** Quando renasce. Zero quando não há renascimento marcado. */
  respawnAt: number;
  lives: number;
  range: number;
  bombs: number;
  /** Nível da bota: 0..MAX_SPEED_LEVEL. */
  speed: number;
  invulnerableUntil: number;
  curse: Curse | "";
  curseUntil: number;
  wins: number;
  input: { dx: number; dy: number };
  /** Um pedido de bomba, consumido no tick seguinte. */
  wantsBomb: boolean;
};

export type Bomb = {
  id: string;
  cx: number;
  cy: number;
  owner: string;
  explodeAt: number;
  range: number;
  /** Quem estava em cima quando ela nasceu, e ainda não saiu de cima. */
  passers: Set<string>;
};

export type Flame = { cx: number; cy: number; kind: number; until: number };
export type PowerupDrop = { cx: number; cy: number; kind: Powerup };

/** Os quatro cantos, na ordem das cores. */
const SPAWNS: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [COLS - 2, ROWS - 2],
  [COLS - 2, 1],
  [1, ROWS - 2],
];

/** Chance de uma célula livre nascer com bloco. */
const SOFT_DENSITY = 0.72;
/** Chance de um bloco destruído deixar um item. */
const DROP_CHANCE = 0.38;
/** Os pesos dos itens, na ordem de `POWERUPS`. */
const DROP_WEIGHTS = [36, 34, 20, 10];

/** Metade da largura do personagem para o teste de parede. */
const HALF = 0.5 - 1e-6;
/** Até onde da linha do corredor o corte de quina ainda puxa. */
const CORNER_REACH = 0.8;
/**
 * Maior fatia de tempo que um passo da simulação aceita. Com a bota no máximo
 * (6 células/s) são 0,3 célula: longe da meia célula em que o movimento
 * precisaria olhar duas células adiante.
 */
const MAX_STEP_MS = 50;

export class BombGame {
  players: GamePlayer[] = [];
  grid: number[] = new Array(COLS * ROWS).fill(FLOOR);
  bombs: Bomb[] = [];
  flames: Flame[] = [];
  powerups: PowerupDrop[] = [];
  phase: GamePhase = "lobby";
  /** O relógio da rodada, em ms desde que o motor nasceu. */
  time = 0;
  timeLeft = MATCH_TIME;
  countdownUntil = 0;
  winnerId = "";
  round = 0;
  log: string[] = [];
  logSeq = 0;

  private fx: FxEvent[] = [];
  private nextBombId = 1;

  constructor(private random: () => number = Math.random) {}

  /* --------------------------------------------------------------- lobby */

  addPlayer(id: string, seatKey: string, name: string): GamePlayer {
    if (this.players.length >= MAX_PLAYERS) throw new GameError("A arena está cheia.");
    if (this.phase !== "lobby" && this.phase !== "finished") {
      throw new GameError("A rodada já começou.");
    }
    const slot = [0, 1, 2, 3].find((s) => !this.players.some((p) => p.slot === s))!;
    const [sx, sy] = SPAWNS[slot];
    const player: GamePlayer = {
      id,
      seatKey,
      name,
      slot,
      x: sx + 0.5,
      y: sy + 0.5,
      dir: DOWN,
      moving: false,
      alive: false,
      dyingUntil: 0,
      respawnAt: 0,
      lives: 0,
      range: 1,
      bombs: 1,
      speed: 0,
      invulnerableUntil: 0,
      curse: "",
      curseUntil: 0,
      wins: 0,
      input: { dx: 0, dy: 0 },
      wantsBomb: false,
    };
    this.players.push(player);
    this.say(`${name} entrou na arena.`);
    return player;
  }

  removePlayer(id: string) {
    const player = this.players.find((p) => p.id === id);
    if (!player) return;
    this.players = this.players.filter((p) => p !== player);
    this.say(`${player.name} saiu.`);
    if (this.phase === "playing" || this.phase === "countdown") this.checkEnd();
  }

  seatOf(seatKey: string) {
    return seatKey ? this.players.find((p) => p.seatKey === seatKey) : undefined;
  }

  /** Devolve a cadeira a uma conexão nova. */
  reseat(player: GamePlayer, id: string) {
    for (const bomb of this.bombs) {
      if (bomb.owner === player.id) bomb.owner = id;
      if (bomb.passers.delete(player.id)) bomb.passers.add(id);
    }
    if (this.winnerId === player.id) this.winnerId = id;
    player.id = id;
  }

  /* --------------------------------------------------------------- rodada */

  /** O host apertou: a arena nasce e o "3, 2, 1" começa. */
  start() {
    if (this.phase === "playing" || this.phase === "countdown") {
      throw new GameError("A rodada já começou.");
    }
    if (this.players.length < MIN_PLAYERS) {
      throw new GameError(`Precisa de ${MIN_PLAYERS} jogadores para começar.`);
    }
    this.round += 1;
    this.winnerId = "";
    this.bombs = [];
    this.flames = [];
    this.powerups = [];
    this.timeLeft = MATCH_TIME;
    this.buildGrid();
    for (const player of this.players) {
      const [sx, sy] = SPAWNS[player.slot];
      Object.assign(player, {
        x: sx + 0.5,
        y: sy + 0.5,
        dir: DOWN,
        moving: false,
        alive: true,
        dyingUntil: 0,
        respawnAt: 0,
        lives: LIVES,
        range: 1,
        bombs: 1,
        speed: 0,
        invulnerableUntil: 0,
        curse: "",
        curseUntil: 0,
        input: { dx: 0, dy: 0 },
        wantsBomb: false,
      });
    }
    this.phase = "countdown";
    this.countdownUntil = this.time + COUNTDOWN;
    this.say(`Rodada ${this.round}: preparar…`);
  }

  /** Segundos inteiros até a arena abrir; zero fora da contagem. */
  get countdown() {
    if (this.phase !== "countdown") return 0;
    return Math.max(1, Math.ceil((this.countdownUntil - this.time) / 1000));
  }

  private buildGrid() {
    const grid = this.grid;
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        const border = cx === 0 || cy === 0 || cx === COLS - 1 || cy === ROWS - 1;
        const pillar = cx % 2 === 0 && cy % 2 === 0;
        grid[cellIndex(cx, cy)] = border || pillar ? WALL : FLOOR;
      }
    }
    // Os cantos e as duas células vizinhas ficam livres: ninguém nasce murado.
    const reserved = new Set<number>();
    for (const [sx, sy] of SPAWNS) {
      for (const [dx, dy] of [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ]) {
        reserved.add(cellIndex(sx + dx, sy + dy));
      }
    }
    for (let i = 0; i < grid.length; i++) {
      if (grid[i] !== FLOOR || reserved.has(i)) continue;
      if (this.random() < SOFT_DENSITY) grid[i] = this.random() < 0.55 ? BRICK : BUSH;
    }
  }

  /* --------------------------------------------------------------- entrada */

  setInput(id: string, dx: number, dy: number) {
    const player = this.players.find((p) => p.id === id);
    if (!player) return;
    player.input.dx = Math.sign(Number(dx) || 0);
    player.input.dy = Math.sign(Number(dy) || 0);
  }

  requestBomb(id: string) {
    const player = this.players.find((p) => p.id === id);
    if (player) player.wantsBomb = true;
  }

  /* --------------------------------------------------------------- o tick */

  /**
   * Avança a arena em `dt` milissegundos.
   *
   * O relógio da sala manda o tempo REAL desde o tick anterior, e ele cresce
   * quando o processo engasga (GC, máquina dormindo). O passo de movimento só
   * confere a célula da frente, então um `dt` grande viraria um salto por cima
   * de blocos e para fora do campo. Por isso o tempo é fatiado em passos em
   * que nem o personagem mais rápido anda meia célula.
   */
  tick(dt: number) {
    let left = dt;
    while (left > 0) {
      const step = Math.min(MAX_STEP_MS, left);
      this.step(step);
      left -= step;
    }
  }

  private step(dt: number) {
    this.time += dt;
    if (this.phase === "countdown") {
      // Apertar bomba no "3, 2, 1" não guarda uma bomba para o "valendo".
      for (const player of this.players) player.wantsBomb = false;
      if (this.time >= this.countdownUntil) {
        this.phase = "playing";
        this.fx.push({ k: "start" });
        this.say("Valendo!");
      }
      return;
    }
    if (this.phase !== "playing") return;

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    const seconds = dt / 1000;

    for (const player of this.players) {
      this.tickPlayer(player, seconds);
    }
    this.tickBombs();
    this.tickFlames();
    this.tickDeaths();
    this.checkEnd();
  }

  private tickPlayer(player: GamePlayer, seconds: number) {
    if (player.curse && this.time >= player.curseUntil) player.curse = "";

    if (!player.alive) {
      // Um pedido de bomba feito morto não vale ao renascer: a tecla apertada
      // no susto poria uma bomba no canto no exato instante da volta.
      player.wantsBomb = false;
      if (player.respawnAt && this.time >= player.respawnAt) this.respawn(player);
      return;
    }

    if (player.curse === "diarrhea") player.wantsBomb = true;
    if (player.wantsBomb) {
      player.wantsBomb = false;
      this.placeBomb(player);
    }

    const { dx, dy } = player.input;
    player.moving = dx !== 0 || dy !== 0;
    if (!player.moving) return;

    let speed = BASE_SPEED + player.speed * SPEED_STEP;
    if (player.curse === "slow") speed = BASE_SPEED * 0.55;
    const dist = speed * seconds;

    // Com as duas setas apertadas, a vertical vence: é a que mais costuma ser
    // a nova — quem vinha andando de lado e aperta para cima quer virar.
    if (dy !== 0) {
      player.dir = dy > 0 ? DOWN : UP;
      if (!this.walk(player, 0, dy, dist) && dx !== 0) {
        player.dir = dx > 0 ? RIGHT : LEFT;
        this.walk(player, dx, 0, dist);
      }
    } else {
      player.dir = dx > 0 ? RIGHT : LEFT;
      this.walk(player, dx, 0, dist);
    }

    this.pickUp(player);
    this.leaveBombs(player);
  }

  /**
   * Um passo num eixo. Devolve se o personagem saiu do lugar.
   *
   * Para andar na horizontal é preciso estar centrado na linha. Fora do
   * centro, o passo vira um deslize até o corredor mais perto que esteja
   * aberto — o corte de quina. Centrado, anda até a parede e para nela.
   */
  private walk(player: GamePlayer, dx: number, dy: number, dist: number): boolean {
    const axis = dx !== 0 ? "x" : "y";
    const cross = axis === "x" ? "y" : "x";
    const pos = player[axis];
    const off = player[cross];
    const lane = Math.floor(off) + 0.5;

    if (Math.abs(off - lane) > 1e-4) {
      return this.slide(player, axis, cross, dx || dy, lane, dist);
    }

    const cell = Math.floor(pos);
    const step = dx || dy;
    const ahead = cell + step;
    const crossCell = Math.floor(off);
    const blocked =
      axis === "x"
        ? this.blockedFor(player, ahead, crossCell)
        : this.blockedFor(player, crossCell, ahead);

    const target = pos + step * dist;
    const edge = step > 0 ? cell + 1 - HALF : cell + HALF;
    if (blocked && (step > 0 ? target > edge : target < edge)) {
      const moved = Math.abs(edge - pos) > 1e-6;
      player[axis] = edge;
      if (!moved) return this.cutCorner(player, axis, cross, step, dist);
      return true;
    }
    player[axis] = target;
    return true;
  }

  /**
   * Desliza até o corredor. O corredor mais perto primeiro; se ele estiver
   * fechado, o do outro lado, desde que o personagem já o alcance.
   */
  private slide(
    player: GamePlayer,
    axis: "x" | "y",
    cross: "x" | "y",
    step: number,
    lane: number,
    dist: number,
  ): boolean {
    const off = player[cross];
    const cell = Math.floor(player[axis]);
    const other = off > lane ? lane + 1 : lane - 1;
    for (const candidate of [lane, other]) {
      if (Math.abs(candidate - off) > CORNER_REACH) continue;
      const laneCell = Math.floor(candidate);
      const open =
        axis === "x"
          ? !this.blockedFor(player, cell + step, laneCell)
          : !this.blockedFor(player, laneCell, cell + step);
      if (!open) continue;
      const delta = Math.sign(candidate - off) * Math.min(dist, Math.abs(candidate - off));
      player[cross] = off + delta;
      return true;
    }
    return false;
  }

  /**
   * Parado contra a parede, ainda centrado: se a célula da frente está
   * fechada mas a diagonal está aberta e o personagem está perto o bastante
   * dela, ele escorrega para o lado. É o que faz virar uma esquina sem parar.
   */
  private cutCorner(
    player: GamePlayer,
    axis: "x" | "y",
    cross: "x" | "y",
    step: number,
    dist: number,
  ): boolean {
    const cell = Math.floor(player[axis]);
    const crossCell = Math.floor(player[cross]);
    for (const side of [-1, 1]) {
      const open =
        axis === "x"
          ? !this.blockedFor(player, cell + step, crossCell + side) &&
            !this.blockedFor(player, cell, crossCell + side)
          : !this.blockedFor(player, crossCell + side, cell + step) &&
            !this.blockedFor(player, crossCell + side, cell);
      if (!open) continue;
      player[cross] += side * dist;
      return true;
    }
    return false;
  }

  /** A célula está fechada para ESTE jogador. A bomba em que ele ainda está em cima não fecha. */
  private blockedFor(player: GamePlayer, cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return true;
    if (this.grid[cellIndex(cx, cy)] !== FLOOR) return true;
    const bomb = this.bombAt(cx, cy);
    return !!bomb && !bomb.passers.has(player.id);
  }

  bombAt(cx: number, cy: number) {
    return this.bombs.find((b) => b.cx === cx && b.cy === cy);
  }

  private leaveBombs(player: GamePlayer) {
    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y);
    for (const bomb of this.bombs) {
      if (bomb.passers.has(player.id) && (bomb.cx !== cx || bomb.cy !== cy)) {
        bomb.passers.delete(player.id);
      }
    }
  }

  private pickUp(player: GamePlayer) {
    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y);
    const index = this.powerups.findIndex((p) => p.cx === cx && p.cy === cy);
    if (index < 0) return;
    const [drop] = this.powerups.splice(index, 1);
    this.apply(player, drop.kind);
    this.fx.push({ k: "pickup", who: player.id, kind: drop.kind });
  }

  private apply(player: GamePlayer, kind: Powerup) {
    switch (kind) {
      case "fire":
        player.range = Math.min(MAX_RANGE, player.range + 1);
        break;
      case "bomb":
        player.bombs = Math.min(MAX_BOMBS, player.bombs + 1);
        break;
      case "boot":
        player.speed = Math.min(MAX_SPEED_LEVEL, player.speed + 1);
        break;
      case "skull": {
        player.curse = CURSES[Math.floor(this.random() * CURSES.length)];
        player.curseUntil = this.time + CURSE_TIME;
        break;
      }
    }
  }

  /* --------------------------------------------------------------- bombas */

  placeBomb(player: GamePlayer): boolean {
    if (!player.alive || this.phase !== "playing") return false;
    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y);
    if (this.bombAt(cx, cy)) return false;
    const mine = this.bombs.filter((b) => b.owner === player.id).length;
    if (mine >= player.bombs) return false;

    const passers = new Set<string>();
    for (const other of this.players) {
      if (other.alive && Math.floor(other.x) === cx && Math.floor(other.y) === cy) {
        passers.add(other.id);
      }
    }
    this.bombs.push({
      id: `b${this.nextBombId++}`,
      cx,
      cy,
      owner: player.id,
      explodeAt: this.time + BOMB_FUSE,
      range: player.curse === "weak" ? 1 : player.range,
      passers,
    });
    this.fx.push({ k: "place", by: player.id });
    return true;
  }

  private tickBombs() {
    // Uma de cada vez, e sempre a partir da lista viva: uma explosão pode
    // detonar outra, e a outra entra na mesma volta.
    for (;;) {
      const due = this.bombs.find((b) => this.time >= b.explodeAt);
      if (!due) break;
      this.explode(due);
    }
  }

  private explode(bomb: Bomb) {
    this.bombs = this.bombs.filter((b) => b !== bomb);
    this.fx.push({ k: "explode", cx: bomb.cx, cy: bomb.cy });
    const until = this.time + FLAME_TIME;
    this.burn(bomb.cx, bomb.cy, FLAME_CENTER, until);

    const arms: Array<[number, number, number, number]> = [
      [-1, 0, FLAME_H, FLAME_END_L],
      [1, 0, FLAME_H, FLAME_END_R],
      [0, -1, FLAME_V, FLAME_END_U],
      [0, 1, FLAME_V, FLAME_END_D],
    ];
    for (const [dx, dy, mid, end] of arms) {
      for (let i = 1; i <= bomb.range; i++) {
        const cx = bomb.cx + dx * i;
        const cy = bomb.cy + dy * i;
        const cell = this.grid[cellIndex(cx, cy)];
        if (cell === WALL) break;
        const last = i === bomb.range;
        if (isSoft(cell)) {
          // O bloco queima e segura o braço: a chama entra nele e não passa.
          this.grid[cellIndex(cx, cy)] = FLOOR;
          this.burn(cx, cy, end, until);
          this.drop(cx, cy);
          break;
        }
        this.burn(cx, cy, last ? end : mid, until);
        const other = this.bombAt(cx, cy);
        if (other) {
          // A chama alcança outra bomba: ela explode agora.
          other.explodeAt = this.time;
          break;
        }
      }
    }
  }

  private burn(cx: number, cy: number, kind: number, until: number) {
    const existing = this.flames.find((f) => f.cx === cx && f.cy === cy);
    if (existing) {
      existing.until = until;
      // Duas chamas na mesma célula: vira um centro, que desenha para os
      // quatro lados — é o que uma cruzada de braços parece.
      if (existing.kind !== kind) existing.kind = FLAME_CENTER;
    } else {
      this.flames.push({ cx, cy, kind, until });
    }
    // Um item na chama vira cinza.
    this.powerups = this.powerups.filter((p) => p.cx !== cx || p.cy !== cy);
  }

  private drop(cx: number, cy: number) {
    if (this.random() >= DROP_CHANCE) return;
    const total = DROP_WEIGHTS.reduce((a, b) => a + b, 0);
    let roll = this.random() * total;
    for (let i = 0; i < POWERUPS.length; i++) {
      roll -= DROP_WEIGHTS[i];
      if (roll < 0) {
        this.powerups.push({ cx, cy, kind: POWERUPS[i] });
        return;
      }
    }
  }

  private tickFlames() {
    this.flames = this.flames.filter((f) => this.time < f.until);
  }

  /* --------------------------------------------------------------- mortes */

  private tickDeaths() {
    for (const player of this.players) {
      if (!player.alive || this.time < player.invulnerableUntil) continue;
      const cx = Math.floor(player.x);
      const cy = Math.floor(player.y);
      if (this.flames.some((f) => f.cx === cx && f.cy === cy)) this.kill(player);
    }
  }

  private kill(player: GamePlayer) {
    player.alive = false;
    player.moving = false;
    player.lives -= 1;
    player.curse = "";
    player.dyingUntil = this.time + DEATH_TIME;
    player.respawnAt = player.lives > 0 ? this.time + RESPAWN_TIME : 0;
    this.fx.push({ k: "die", who: player.id });
    this.say(
      player.lives > 0
        ? `${player.name} explodiu. Restam ${player.lives}.`
        : `${player.name} está fora.`,
    );
  }

  private respawn(player: GamePlayer) {
    const [sx, sy] = SPAWNS[player.slot];
    player.x = sx + 0.5;
    player.y = sy + 0.5;
    player.dir = DOWN;
    player.alive = true;
    player.respawnAt = 0;
    player.invulnerableUntil = this.time + INVULNERABLE_TIME;
    // O canto pode ter virado armadilha: limpa o que estiver em cima dele.
    this.bombs = this.bombs.filter((b) => b.cx !== sx || b.cy !== sy);
    this.flames = this.flames.filter((f) => f.cx !== sx || f.cy !== sy);
  }

  /** Está na disputa: de pé, ou morto com vida para voltar. */
  private contending(player: GamePlayer) {
    return player.alive || player.lives > 0;
  }

  private checkEnd() {
    if (this.phase !== "playing" && this.phase !== "countdown") return;
    const standing = this.players.filter((p) => this.contending(p));

    if (this.players.length < MIN_PLAYERS) {
      this.finish(standing.length === 1 ? standing[0] : undefined, "A arena esvaziou.");
      return;
    }
    if (this.phase !== "playing") return;

    if (standing.length <= 1) {
      // Quem ficou só ganha depois de a animação do outro terminar: o fim da
      // rodada em cima de uma morte parece a tela travando.
      const settling = this.players.some((p) => !p.alive && this.time < p.dyingUntil);
      if (settling) return;
      this.finish(standing[0]);
      return;
    }
    if (this.timeLeft <= 0) {
      const most = Math.max(...standing.map((p) => p.lives));
      const top = standing.filter((p) => p.lives === most);
      this.finish(top.length === 1 ? top[0] : undefined, "Deu o tempo.");
    }
  }

  private finish(winner?: GamePlayer, why = "") {
    this.phase = "finished";
    this.winnerId = winner?.id ?? "";
    if (winner) winner.wins += 1;
    for (const player of this.players) {
      player.input = { dx: 0, dy: 0 };
      player.moving = false;
      player.wantsBomb = false;
    }
    this.fx.push({ k: "finish", winner: this.winnerId });
    this.say(
      [why, winner ? `${winner.name} venceu a rodada!` : "Empate."].filter(Boolean).join(" "),
    );
  }

  /* --------------------------------------------------------------- diversos */

  takeFx(): FxEvent[] {
    const events = this.fx;
    this.fx = [];
    return events;
  }

  private say(message: string) {
    this.log.push(message);
    this.logSeq += 1;
    if (this.log.length > 12) this.log.shift();
  }
}


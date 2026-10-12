import {
  BASE_SPEED,
  GHOST_TIME,
  BOMB_FUSE,
  REMOTE_ARM_MS,
  REMOTE_BACKUP,
  bombFuse,
  bombLimit,
  BRICK,
  BUSH,
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
  HURRY_DROP_MS,
  HURRY_TIME,
  INVULNERABLE_TIME,
  KICK_SPEED,
  LEFT,
  LIVES,
  MATCH_TIME,
  DEFAULT_MATCH_MINUTES,
  isMatchMinutes,
  minMinutesFor,
  type MatchMinutes,
  MAX_BOMBS,
  MAX_PLAYERS,
  MAX_RANGE,
  MAX_SPEED_LEVEL,
  MIN_PLAYERS,
  POWERUPS,
  RESPAWN_TIME,
  RIGHT,
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
import { ARENA_SIZE_NAME, fillGrid, hurryOrder, type ArenaDefinition, type GridPosition } from "./arena.js";
import { cursedInput, moveOnRails, moveSpeed } from "./move.js";
import { DEFAULT_INPUT_LIMITS, InputQueue, TICK_MS, cellBlocked, type InputQueueLimits, type MoveCommand } from "./net.js";
import { DEFAULT_ARENA } from "./arenas.js";

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
  /** Tem a bota de chute. */
  kick: boolean;
  /** Tem a perfurante: as bombas dele nascem perfurantes. */
  pierce: boolean;
  invulnerableUntil: number;
  curse: Curse | "";
  curseUntil: number;
  /** Até quando está invisível (o item), no relógio do motor. */
  ghostUntil: number;
  /** Tem o controle remoto (morrer leva). */
  remote: boolean;
  wins: number;
  input: { dx: number; dy: number };
  /**
   * Os comandos numerados que a tela manda (ver `net.ts`). Um jogador que
   * já mandou um comando anda só por eles, um por passo; `input` fica para o
   * `/mock` e os testes, que seguram a direção.
   */
  queue: InputQueue;
  driven: boolean;
  /** Até quando conta como andando: um passo sem comando (a rede atrasou) não vira um quadro parado. */
  movingUntil: number;
  /** Um pedido de bomba, consumido no tick seguinte. */
  wantsBomb: boolean;
  /** Pediu para detonar fora dos comandos (o /mock e os testes; ver `requestDetonate`). */
  wantsDetonate: boolean;
  /** A célula em que a tela de quem joga desenhou a bomba (ver `requestBomb`). */
  bombAt?: { cx: number; cy: number } | null;
};

export type Bomb = {
  id: string;
  /** A célula em que está: sempre o piso de `x` e `y`. */
  cx: number;
  cy: number;
  /** O centro, em células. Fracionário enquanto desliza chutada. */
  x: number;
  y: number;
  owner: string;
  explodeAt: number;
  /** O pavio com que nasceu, em ms (ver `bombFuse`). */
  fuse: number;
  range: number;
  /** A explosão atravessa tijolos e bombas (só muralha e pilar a param). */
  pierce: boolean;
  /** Do controle remoto: espera o dono detonar (ou o pavio reserva). */
  remote: boolean;
  /** Detonada: pisca até `explodeAt`. */
  armed: boolean;
  /** Para onde desliza, depois de um chute; nulo parada. */
  sliding: { dx: number; dy: number } | null;
  /** Quem estava em cima quando ela nasceu, e ainda não saiu de cima. */
  passers: Set<string>;
};

/** `born` é quando a chama acendeu (ou reacendeu, numa cadeia): a tela recomeça a animação dela. */
export type Flame = { cx: number; cy: number; kind: number; born: number; until: number };
export type PowerupDrop = { cx: number; cy: number; kind: Powerup };

/** Quanto tempo depois do último comando de andar o boneco ainda aparece andando, em ms. */
const MOVING_HOLD_MS = 4 * TICK_MS;

/** Chance de um bloco destruído deixar um item. */
const DROP_CHANCE = 0.38;
/** Os pesos dos itens, na ordem de `POWERUPS`: fogo, bomba, bota, chute, perfurante, caveira, troca, invisível, controle remoto. Chute, perfurante, troca, invisível e controle remoto são raros. */
// O controle remoto: 2,5 de 120,5 = ~2,1% dos itens, ~0,8% dos tijolos (com `DROP_CHANCE`).
const DROP_WEIGHTS = [36, 34, 20, 6, 4, 10, 4, 4, 2.5];

/**
 * Maior fatia de tempo que um passo da simulação aceita. Com a bota no máximo
 * (6 células/s) são 0,3 célula: longe da meia célula em que o movimento
 * precisaria olhar duas células adiante.
 */
const MAX_STEP_MS = 50;

/**
 * O corpo do boneco (uma célula de lado, centrada nele) toca a célula? Toca
 * enquanto o centro está a menos de uma célula do centro dela nos dois eixos.
 */
export function touches(player: { x: number; y: number }, cx: number, cy: number): boolean {
  return Math.abs(player.x - (cx + 0.5)) < 1 - 1e-6 && Math.abs(player.y - (cy + 0.5)) < 1 - 1e-6;
}

/** Quão perto (em células, nos dois eixos) dois bonecos se encostam para o contágio. */
const CONTACT = 0.75;

/** Quanto um comando anda: um passo fixo na velocidade do jogador. A previsão da tela usa a mesma conta. */
export function commandDistance(player: { speed: number; curse: Curse | "" }): number {
  return (moveSpeed(player.speed, player.curse) * TICK_MS) / 1000;
}

export class BombGame {
  players: GamePlayer[] = [];
  /** A planta da próxima rodada. Só muda no lobby ou depois do fim (`setArena`). */
  arena: ArenaDefinition;
  /** A arena, célula a célula, `cols` por fileira: o que a tela desenha. */
  grid: number[] = [];
  bombs: Bomb[] = [];
  flames: Flame[] = [];
  powerups: PowerupDrop[] = [];
  phase: GamePhase = "lobby";
  /** O relógio da rodada, em ms desde que o motor nasceu. */
  time = 0;
  timeLeft = MATCH_TIME;
  /** Quanto dura a próxima rodada, em minutos. Só muda no lobby ou depois do fim (`setMatchMinutes`). */
  matchMinutes: MatchMinutes = DEFAULT_MATCH_MINUTES;
  countdownUntil = 0;
  /** O aperto: zero antes dele; depois, 1 + quantos blocos já caíram (ver `HURRY_TIME`). */
  hurry = 0;
  /** Quando cai o próximo bloco do aperto, no relógio do motor. */
  private nextDropAt = 0;
  /** As células do aperto, na ordem da espiral, da planta desta rodada. */
  private hurryCells: GridPosition[] = [];
  winnerId = "";
  round = 0;
  log: string[] = [];
  logSeq = 0;

  private fx: FxEvent[] = [];
  private nextBombId = 1;

  /**
   * `random` só decide os itens que os blocos deixam; a arena é uma planta
   * (a da referência, por padrão), igual em toda rodada.
   */
  constructor(
    private random: () => number = Math.random,
    arena: ArenaDefinition = DEFAULT_ARENA,
    private inputLimits: InputQueueLimits = DEFAULT_INPUT_LIMITS,
  ) {
    this.arena = arena;
    this.buildGrid();
  }

  get cols() {
    return this.arena.cols;
  }

  get rows() {
    return this.arena.rows;
  }

  /** A posição de uma célula na grade. */
  index(cx: number, cy: number) {
    return cellIndex(cx, cy, this.cols);
  }

  /**
   * O host trocou de arena. Vale para a próxima rodada: a grade já vira a
   * nova, e cada um vai para o seu canto nela, para a tela não mostrar
   * ninguém dentro de um pilar.
   */
  setArena(arena: ArenaDefinition) {
    if (this.phase === "playing" || this.phase === "countdown") {
      throw new GameError("A rodada já começou.");
    }
    this.arena = arena;
    // Uma arena maior pede mais tempo: um tempo curto demais para ela sobe para o mínimo.
    const min = minMinutesFor(arena.size);
    if (this.matchMinutes < min) this.matchMinutes = min;
    this.buildGrid();
    this.bombs = [];
    this.flames = [];
    this.powerups = [];
    for (const player of this.players) this.seat(player);
  }

  /** O tempo da próxima rodada, em minutos: um da lista, e não menos que o mínimo da arena. */
  setMatchMinutes(minutes: number) {
    if (this.phase === "playing" || this.phase === "countdown") {
      throw new GameError("A rodada já começou.");
    }
    if (!isMatchMinutes(minutes)) throw new GameError("Esse tempo não existe.");
    const min = minMinutesFor(this.arena.size);
    if (minutes < min) {
      throw new GameError(`Na arena ${ARENA_SIZE_NAME[this.arena.size].toLowerCase()} o mínimo é ${min} minutos.`);
    }
    this.matchMinutes = minutes;
  }

  /** Põe o jogador no canto dele, parado. */
  private seat(player: GamePlayer) {
    const [sx, sy] = this.arena.spawns[player.slot];
    player.x = sx + 0.5;
    player.y = sy + 0.5;
    player.dir = DOWN;
    player.moving = false;
  }

  /* --------------------------------------------------------------- lobby */

  addPlayer(id: string, seatKey: string, name: string): GamePlayer {
    if (this.players.length >= MAX_PLAYERS) throw new GameError("A arena está cheia.");
    if (this.phase !== "lobby" && this.phase !== "finished") {
      throw new GameError("A rodada já começou.");
    }
    const slot = [0, 1, 2, 3].find((s) => !this.players.some((p) => p.slot === s))!;
    const [sx, sy] = this.arena.spawns[slot];
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
      kick: false,
      pierce: false,
      invulnerableUntil: 0,
      curse: "",
      curseUntil: 0,
      ghostUntil: 0,
      remote: false,
      wins: 0,
      input: { dx: 0, dy: 0 },
      queue: new InputQueue(this.inputLimits),
      driven: false,
      movingUntil: 0,
      wantsBomb: false,
      wantsDetonate: false,
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
    // A conexão nova é outra tela: a numeração dos comandos recomeça.
    player.queue.reset();
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
    this.timeLeft = this.matchMinutes * 60_000;
    this.hurry = 0;
    this.hurryCells = hurryOrder(this.arena);
    this.buildGrid();
    for (const player of this.players) {
      this.seat(player);
      Object.assign(player, {
        alive: true,
        dyingUntil: 0,
        respawnAt: 0,
        lives: LIVES,
        range: 1,
        bombs: 1,
        speed: 0,
        kick: false,
        pierce: false,
        invulnerableUntil: 0,
        curse: "",
        curseUntil: 0,
        ghostUntil: 0,
        remote: false,
        input: { dx: 0, dy: 0 },
        movingUntil: 0,
        wantsBomb: false,
        wantsDetonate: false,
      });
      player.queue.discard();
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
    fillGrid(this.grid, this.arena);
  }

  /* --------------------------------------------------------------- entrada */

  setInput(id: string, dx: number, dy: number) {
    const player = this.players.find((p) => p.id === id);
    if (!player) return;
    player.input.dx = Math.sign(Number(dx) || 0);
    player.input.dy = Math.sign(Number(dy) || 0);
  }

  /**
   * Comandos numerados de quem joga pela rede (já conferidos por
   * `decodeBatch`). Daqui em diante o jogador anda só por eles.
   */
  pushCommands(id: string, commands: readonly MoveCommand[]): number {
    const player = this.players.find((p) => p.id === id);
    if (!player) return 0;
    player.driven = true;
    return player.queue.push(commands);
  }

  /** Esquece os comandos na fila (quem caiu da rede): o boneco não segue andando sozinho. */
  dropCommands(id: string) {
    const player = this.players.find((p) => p.id === id);
    if (!player) return;
    player.queue.discard();
    player.input.dx = 0;
    player.input.dy = 0;
  }

  /**
   * Pede uma bomba. A tela de quem joga desenha o próprio boneco à frente do
   * servidor (a previsão) e mostra a bomba na hora, na célula em que ELA o
   * vê; essa célula vem junto, e vale se o corpo do boneco ainda a toca
   * aqui. Senão, vale a célula em que o boneco está.
   */
  requestBomb(id: string, at?: { cx: number; cy: number } | null) {
    const player = this.players.find((p) => p.id === id);
    if (!player) return;
    player.wantsBomb = true;
    const ok = at && Number.isInteger(at.cx) && Number.isInteger(at.cy);
    player.bombAt = ok ? { cx: at.cx, cy: at.cy } : null;
  }

  /** Pede a detonação da remota mais antiga (o caminho sem comandos: o /mock). */
  requestDetonate(id: string) {
    const player = this.players.find((p) => p.id === id);
    if (player) player.wantsDetonate = true;
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
      // Apertar bomba no "3, 2, 1" não guarda uma bomba para o "valendo"; andar, idem.
      for (const player of this.players) {
        player.wantsBomb = false;
        player.wantsDetonate = false;
        player.queue.discard();
      }
      if (this.time >= this.countdownUntil) {
        this.phase = "playing";
        this.fx.push({ k: "start" });
        this.say("Valendo!");
      }
      return;
    }
    if (this.phase !== "playing") {
      for (const player of this.players) player.queue.discard();
      return;
    }

    this.timeLeft = Math.max(0, this.timeLeft - dt);
    const seconds = dt / 1000;
    this.tickHurry();

    for (const player of this.players) {
      this.tickPlayer(player, seconds, dt);
    }
    this.spread();
    this.tickBombs(seconds);
    this.tickFlames();
    this.tickDeaths();
    this.checkEnd();
  }

  /* --------------------------------------------------------------- o aperto */

  private tickHurry() {
    if (this.hurry === 0) {
      if (this.timeLeft > HURRY_TIME[this.arena.size]) return;
      this.hurry = 1;
      this.nextDropAt = this.time + HURRY_DROP_MS;
      this.fx.push({ k: "hurry" });
      this.say("Hurry up! Os blocos estão caindo.");
    }
    while (this.hurry - 1 < this.hurryCells.length && this.time >= this.nextDropAt) {
      const [cx, cy] = this.hurryCells[this.hurry - 1];
      this.crush(cx, cy);
      this.hurry += 1;
      this.nextDropAt += HURRY_DROP_MS;
    }
  }

  /**
   * Um bloco do aperto cai na célula: vira bloco rígido e leva o que houver
   * nela — tijolo, item, chama e bomba (que some sem explodir). Quem está de
   * pé ali é esmagado, mesmo piscando de quem acabou de renascer.
   */
  private crush(cx: number, cy: number) {
    this.grid[this.index(cx, cy)] = WALL;
    this.bombs = this.bombs.filter((b) => b.cx !== cx || b.cy !== cy);
    this.flames = this.flames.filter((f) => f.cx !== cx || f.cy !== cy);
    this.powerups = this.powerups.filter((p) => p.cx !== cx || p.cy !== cy);
    this.fx.push({ k: "crush", cx, cy });
    for (const player of this.players) {
      if (player.alive && Math.floor(player.x) === cx && Math.floor(player.y) === cy) {
        this.kill(player, "foi esmagado");
      }
    }
  }

  /**
   * Onde renascer: o canto, se ainda está aberto; senão o chão livre mais
   * perto dele, de preferência fora dos próximos blocos a cair. Com a arena
   * toda fechada, lugar nenhum.
   */
  private respawnCell(player: GamePlayer): GridPosition | null {
    const [sx, sy] = this.arena.spawns[player.slot];
    const soon = new Set(
      this.hurry ? this.hurryCells.slice(this.hurry - 1, this.hurry + 9).map(([cx, cy]) => this.index(cx, cy)) : [],
    );
    for (const avoid of [soon, new Set<number>()]) {
      const open = (cx: number, cy: number) =>
        this.grid[this.index(cx, cy)] === FLOOR && !avoid.has(this.index(cx, cy)) && !this.bombAt(cx, cy);
      if (open(sx, sy)) return [sx, sy];
      let best: GridPosition | null = null;
      let bestDistance = Infinity;
      for (let cy = 1; cy < this.rows - 1; cy++) {
        for (let cx = 1; cx < this.cols - 1; cx++) {
          const distance = Math.abs(cx - sx) + Math.abs(cy - sy);
          if (distance < bestDistance && open(cx, cy)) {
            best = [cx, cy];
            bestDistance = distance;
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  private tickPlayer(player: GamePlayer, seconds: number, dt: number) {
    if (player.curse && this.time >= player.curseUntil) player.curse = "";

    if (!player.alive) {
      // Um pedido de bomba feito morto não vale ao renascer: a tecla apertada
      // no susto poria uma bomba no canto no exato instante da volta. Os
      // comandos de andar, idem: são confirmados e jogados fora.
      player.wantsBomb = false;
      player.wantsDetonate = false;
      player.queue.discard();
      if (player.respawnAt && this.time >= player.respawnAt) this.respawn(player);
      return;
    }

    if (player.curse === "diarrhea") player.wantsBomb = true;
    if (player.wantsBomb) {
      player.wantsBomb = false;
      this.placeBomb(player, player.bombAt);
      player.bombAt = null;
    }
    if (player.wantsDetonate) {
      player.wantsDetonate = false;
      this.detonate(player);
    }

    if (player.driven) {
      this.drive(player, dt);
      return;
    }

    const { dx, dy } = cursedInput(player.curse, player.input.dx, player.input.dy, player.dir);
    player.moving = dx !== 0 || dy !== 0;
    if (!player.moving) return;
    this.movePlayer(player, dx, dy, moveSpeed(player.speed, player.curse) * seconds);
  }

  /**
   * Os comandos deste passo, cada um uma vez, em ordem: a bomba primeiro (na
   * célula em que o boneco está naquele comando), depois o passo de
   * `TICK_MS`. É a mesma conta que a tela faz na previsão.
   */
  private drive(player: GamePlayer, dt: number) {
    for (const cmd of player.queue.take(dt / TICK_MS)) {
      if (!player.alive) break;
      if (cmd.bomb) this.placeBomb(player);
      if (cmd.detonate) this.detonate(player);
      const { dx, dy } = cursedInput(player.curse, cmd.dx, cmd.dy, player.dir);
      if (dx === 0 && dy === 0) continue;
      player.movingUntil = this.time + MOVING_HOLD_MS;
      this.movePlayer(player, dx, dy, commandDistance(player));
    }
    player.moving = this.time < player.movingUntil;
  }

  private movePlayer(player: GamePlayer, dx: number, dy: number, dist: number) {
    const { bumped } = moveOnRails(player, dx, dy, dist, (cx, cy) => this.blockedFor(player, cx, cy));
    // Esbarrou numa bomba com a bota de chute: ela vai.
    if (bumped && player.kick) {
      const bomb = this.bombAt(bumped.cx, bumped.cy);
      if (bomb) this.kick(bomb, bumped.dx, bumped.dy);
    }

    this.pickUp(player);
    this.leaveBombs(player);
  }

  /** A célula está fechada para ESTE jogador. A bomba em que ele ainda está em cima não fecha. */
  private blockedFor(player: GamePlayer, cx: number, cy: number): boolean {
    return cellBlocked(
      this,
      cx,
      cy,
      (bx, by) => !!this.bombAt(bx, by),
      (bx, by) => !!this.bombAt(bx, by)?.passers.has(player.id),
    );
  }

  bombAt(cx: number, cy: number) {
    return this.bombs.find((b) => b.cx === cx && b.cy === cy);
  }

  /** A célula está livre para uma bomba entrar deslizando: chão, sem bomba e sem ninguém de pé. */
  private freeForBomb(cx: number, cy: number): boolean {
    if (cx < 0 || cy < 0 || cx >= this.cols || cy >= this.rows) return false;
    if (this.grid[this.index(cx, cy)] !== FLOOR) return false;
    if (this.bombAt(cx, cy)) return false;
    return !this.players.some((p) => p.alive && Math.floor(p.x) === cx && Math.floor(p.y) === cy);
  }

  /** O chute: a bomba sai deslizando, se a célula seguinte estiver livre. Quem estava em cima já não está. */
  private kick(bomb: Bomb, dx: number, dy: number) {
    if (bomb.sliding) return;
    if (!this.freeForBomb(bomb.cx + dx, bomb.cy + dy)) return;
    bomb.sliding = { dx, dy };
    bomb.passers.clear();
  }

  /**
   * A bomba chutada anda de centro em centro: em cada centro olha a célula
   * seguinte e, se ela não estiver livre, para ali mesmo, encaixada.
   */
  private slideBomb(bomb: Bomb, seconds: number) {
    if (!bomb.sliding) return;
    const { dx, dy } = bomb.sliding;
    const axis = dx !== 0 ? "x" : "y";
    const dir = dx || dy;
    let left = KICK_SPEED * seconds;
    while (left > 1e-9) {
      const cell = axis === "x" ? bomb.cx : bomb.cy;
      const center = cell + 0.5;
      const ahead = (center - bomb[axis]) * dir;
      if (ahead > 1e-9) {
        // Ainda antes do centro desta célula: vai até ele.
        const move = Math.min(left, ahead);
        bomb[axis] += dir * move;
        left -= move;
      } else if (this.freeForBomb(bomb.cx + dx, bomb.cy + dy)) {
        const move = Math.min(left, (cell + dir + 0.5 - bomb[axis]) * dir);
        bomb[axis] += dir * move;
        left -= move;
        bomb.cx = Math.floor(bomb.x);
        bomb.cy = Math.floor(bomb.y);
      } else {
        bomb[axis] = center;
        bomb.sliding = null;
        return;
      }
    }
  }

  private leaveBombs(player: GamePlayer) {
    const cx = Math.floor(player.x);
    const cy = Math.floor(player.y);
    for (const bomb of this.bombs) {
      if (bomb.passers.has(player.id) && (bomb.cx !== cx || bomb.cy !== cy) && !touches(player, bomb.cx, bomb.cy)) {
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

  /** O item, em quem o pegou (também o painel do /mock). */
  apply(player: GamePlayer, kind: Powerup) {
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
      case "kick":
        player.kick = true;
        break;
      // A perfurante e o controle remoto são tipos de bomba: vale o último que pegou.
      case "pierce":
        player.pierce = true;
        this.dropRemote(player);
        break;
      case "skull":
        this.curse(player, CURSES[Math.floor(this.random() * CURSES.length)]);
        break;
      case "swap":
        this.swap(player);
        break;
      case "ghost":
        player.ghostUntil = this.time + GHOST_TIME;
        break;
      case "remote":
        player.remote = true;
        player.pierce = false;
        break;
    }
  }

  /* ------------------------------------------------------------- maldições */

  /** Amaldiçoa (a caveira, ou o painel do /mock). */
  curse(player: GamePlayer, kind: Curse) {
    player.curse = kind;
    player.curseUntil = this.time + CURSE_TIME;
  }

  /** O item da troca: quem pegou e um adversário de pé, sorteado, trocam de lugar. Sem ninguém, nada. */
  private swap(player: GamePlayer) {
    const others = this.players.filter((p) => p !== player && p.alive);
    if (others.length === 0) return;
    const other = others[Math.floor(this.random() * others.length)];
    [player.x, other.x] = [other.x, player.x];
    [player.y, other.y] = [other.y, player.y];
    [player.dir, other.dir] = [other.dir, player.dir];
    // Caiu em cima de uma bomba: sai dela andando, como quem a soltou.
    for (const bomb of this.bombs) {
      for (const p of [player, other]) if (touches(p, bomb.cx, bomb.cy)) bomb.passers.add(p.id);
    }
    this.say(`${player.name} trocou de lugar com ${other.name}.`);
    this.pickUp(other);
    this.pickUp(player);
  }

  /** O contágio: quem encosta num amaldiçoado pega a mesma maldição, pelo tempo inteiro. */
  private spread() {
    const sick = this.players.filter((p) => p.alive && p.curse);
    for (const from of sick) {
      for (const to of this.players) {
        if (to === from || !to.alive || to.curse === from.curse) continue;
        if (Math.abs(to.x - from.x) >= CONTACT || Math.abs(to.y - from.y) >= CONTACT) continue;
        to.curse = from.curse;
        to.curseUntil = this.time + CURSE_TIME;
        this.say(`${from.name} passou a maldição para ${to.name}.`);
      }
    }
  }

  /* --------------------------------------------------------------- bombas */

  placeBomb(player: GamePlayer, at?: { cx: number; cy: number } | null): boolean {
    if (!player.alive || this.phase !== "playing") return false;
    // A célula pedida vale se é chão e o corpo do boneco ainda a toca; senão, a dele.
    const asked =
      at && touches(player, at.cx, at.cy) && at.cx >= 0 && at.cy >= 0 && at.cx < this.cols && at.cy < this.rows &&
      this.grid[this.index(at.cx, at.cy)] === FLOOR;
    const cx = asked ? at.cx : Math.floor(player.x);
    const cy = asked ? at.cy : Math.floor(player.y);
    if (this.bombAt(cx, cy)) return false;
    const mine = this.bombs.filter((b) => b.owner === player.id).length;
    if (mine >= bombLimit(player.bombs, player.curse)) return false;

    // Quem o corpo toca a célula passa por ela até sair de cima (`leaveBombs`).
    const passers = new Set<string>();
    for (const other of this.players) {
      if (other.alive && touches(other, cx, cy)) passers.add(other.id);
    }
    // As maldições do pavio e a diarreia ganham do controle remoto: senão a
    // diarreia viraria um arsenal de remotas.
    const remote =
      player.remote && player.curse !== "shortfuse" && player.curse !== "longfuse" && player.curse !== "diarrhea";
    const fuse = remote ? REMOTE_BACKUP : bombFuse(player.curse);
    this.bombs.push({
      id: `b${this.nextBombId++}`,
      cx,
      cy,
      x: cx + 0.5,
      y: cy + 0.5,
      owner: player.id,
      explodeAt: this.time + fuse,
      fuse,
      range: player.curse === "weak" ? 1 : player.range,
      pierce: player.pierce,
      remote,
      armed: false,
      sliding: null,
      passers,
    });
    this.fx.push({ k: "place", by: player.id });
    return true;
  }

  /**
   * Perdeu o controle remoto (morreu, ou trocou pela perfurante): sem quem as
   * detone, as remotas que ainda esperam viram bombas comuns, com o pavio inteiro.
   */
  private dropRemote(player: GamePlayer) {
    if (!player.remote) return;
    player.remote = false;
    for (const bomb of this.bombs) {
      if (bomb.owner !== player.id || !bomb.remote || bomb.armed) continue;
      bomb.remote = false;
      bomb.fuse = BOMB_FUSE;
      bomb.explodeAt = this.time + BOMB_FUSE;
    }
  }

  /** O controle remoto: a remota mais antiga do jogador que ainda não pisca começa a piscar. */
  private detonate(player: GamePlayer) {
    const bomb = this.bombs.find((b) => b.owner === player.id && b.remote && !b.armed);
    if (bomb) this.arm(bomb);
  }

  /** A remota pisca `REMOTE_ARM_MS` e explode. */
  private arm(bomb: Bomb) {
    bomb.armed = true;
    bomb.explodeAt = Math.min(bomb.explodeAt, this.time + REMOTE_ARM_MS);
  }

  private tickBombs(seconds: number) {
    for (const bomb of this.bombs) {
      this.slideBomb(bomb, seconds);
      // O pavio reserva acabando: ela pisca antes, como se detonada.
      if (bomb.remote && !bomb.armed && this.time >= bomb.explodeAt - REMOTE_ARM_MS) this.arm(bomb);
    }
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
        const cell = this.grid[this.index(cx, cy)];
        if (cell === WALL) break;
        // A ponta vai na última célula do braço: pelo alcance, ou porque a seguinte é muralha ou pilar.
        const last = i === bomb.range || this.grid[this.index(cx + dx, cy + dy)] === WALL;
        if (isSoft(cell)) {
          // O bloco queima e segura o braço: a chama entra nele e não passa.
          // A perfurante atravessa: queima e segue até o alcance.
          this.grid[this.index(cx, cy)] = FLOOR;
          this.burn(cx, cy, last || !bomb.pierce ? end : mid, until);
          this.drop(cx, cy);
          if (!bomb.pierce) break;
          continue;
        }
        this.burn(cx, cy, last ? end : mid, until);
        const other = this.bombAt(cx, cy);
        if (other) {
          // A chama alcança outra bomba: ela explode agora. A perfurante segue adiante.
          other.explodeAt = this.time;
          if (!bomb.pierce) break;
        }
      }
    }
  }

  private burn(cx: number, cy: number, kind: number, until: number) {
    const existing = this.flames.find((f) => f.cx === cx && f.cy === cy);
    if (existing) {
      existing.born = this.time;
      existing.until = until;
      // Duas chamas na mesma célula: vira um centro, que desenha para os
      // quatro lados — é o que uma cruzada de braços parece.
      if (existing.kind !== kind) existing.kind = FLAME_CENTER;
    } else {
      this.flames.push({ cx, cy, kind, born: this.time, until });
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

  private kill(player: GamePlayer, how = "explodiu") {
    player.alive = false;
    player.moving = false;
    player.movingUntil = 0;
    player.queue.discard();
    player.lives -= 1;
    player.curse = "";
    player.ghostUntil = 0;
    this.dropRemote(player);
    // A morte leva o chute e a perfurante; fogo, bombas e bota ficam.
    player.kick = false;
    player.pierce = false;
    player.dyingUntil = this.time + DEATH_TIME;
    player.respawnAt = player.lives > 0 ? this.time + RESPAWN_TIME : 0;
    this.fx.push({ k: "die", who: player.id });
    this.say(
      player.lives > 0
        ? `${player.name} ${how}. Restam ${player.lives}.`
        : `${player.name} está fora.`,
    );
  }

  private respawn(player: GamePlayer) {
    const cell = this.respawnCell(player);
    if (!cell) {
      // A arena fechou inteira: não há onde voltar, e as vidas que sobravam se perdem.
      player.lives = 0;
      player.respawnAt = 0;
      this.say(`${player.name} está fora: a arena fechou.`);
      return;
    }
    const [sx, sy] = cell;
    this.seat(player);
    player.x = sx + 0.5;
    player.y = sy + 0.5;
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
    // Com o aperto valendo, o relógio não acaba a rodada: os blocos acabam.
    if (this.timeLeft <= 0 && this.hurry === 0) {
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
      player.movingUntil = 0;
      player.wantsBomb = false;
      player.wantsDetonate = false;
      player.queue.discard();
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


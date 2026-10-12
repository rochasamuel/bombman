import {
  ARENA,
  BOMB_FUSE,
  BRICK,
  COUNTDOWN,
  CURSE_TIME,
  REMOTE_ARM_MS,
  REMOTE_BACKUP,
  GHOST_TIME,
  DEFAULT_MATCH_MINUTES,
  EMPTY_ARENA,
  FLAME_CENTER,
  FLAME_END_R,
  FLAME_H,
  FLAME_TIME,
  FLOOR,
  LIVES,
  MATCH_MINUTES,
  MAX_SPEED_LEVEL,
  RIGHT,
  TICK_MS,
  WALL,
  arenaById,
  defineArena,
  minMinutesFor,
  type Curse,
} from "@bomb/shared";
import { describe, expect, it } from "vitest";
import { BombGame } from "@bomb/shared";

/** A arena da referência tem 27 × 17 células: é nela que a regra se testa. */
const COLS = ARENA.cols;
const ROWS = ARENA.rows;
const cellIndex = (cx: number, cy: number) => cy * COLS + cx;

/** Uma arena com dois jogadores, já valendo, e SEM blocos: a regra se testa limpa. */
function open(count = 2, random = () => 0.99, arena = EMPTY_ARENA) {
  const game = new BombGame(random, arena);
  for (let i = 0; i < count; i++) game.addPlayer(`p${i}`, `k${i}`, `P${i}`);
  game.start();
  game.tick(COUNTDOWN);
  return game;
}

/** Avança o motor em passos de 16 ms, como a sala faz. */
function run(game: BombGame, ms: number) {
  let left = ms;
  while (left > 0) {
    const step = Math.min(16, left);
    game.tick(step);
    left -= step;
  }
}

describe("a arena", () => {
  it("nasce com a planta da referência: muralha, pilares, tijolos e os cantos livres", () => {
    const game = open(2, () => 0, ARENA);
    expect(game.grid).toHaveLength(COLS * ROWS);
    expect(game.grid[cellIndex(0, 0)]).toBe(WALL);
    expect(game.grid[cellIndex(4, 2)]).toBe(WALL); // um pilar
    expect(game.grid[cellIndex(1, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(2, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(1, 2)]).toBe(FLOOR);
    expect(game.grid[cellIndex(COLS - 2, ROWS - 2)]).toBe(FLOOR);
    // As duas células vizinhas de cada canto são livres na planta: ninguém nasce murado.
    expect(game.grid[cellIndex(3, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(4, 1)]).toBe(BRICK);
  });

  it("nasce igual toda vez, seja qual for o sorteio", () => {
    const a = open(2, () => 0, ARENA);
    const b = open(2, () => 0.99, ARENA);
    expect(a.grid).toEqual(b.grid);
    // A referência é simétrica nos dois eixos.
    for (let cy = 0; cy < ROWS; cy++) {
      for (let cx = 0; cx < COLS; cx++) {
        expect(a.grid[cellIndex(cx, cy)]).toBe(a.grid[cellIndex(COLS - 1 - cx, cy)]);
        expect(a.grid[cellIndex(cx, cy)]).toBe(a.grid[cellIndex(cx, ROWS - 1 - cy)]);
      }
    }
  });

  it("não começa com um jogador só", () => {
    const game = new BombGame();
    game.addPlayer("a", "ka", "A");
    expect(() => game.start()).toThrow();
  });

  it("espera o 3, 2, 1 antes de valer", () => {
    const game = new BombGame();
    game.addPlayer("a", "ka", "A");
    game.addPlayer("b", "kb", "B");
    game.start();
    expect(game.phase).toBe("countdown");
    expect(game.countdown).toBe(3);
    game.tick(COUNTDOWN);
    expect(game.phase).toBe("playing");
  });
});

describe("o tempo da rodada", () => {
  it("nasce com 5 minutos, e a rodada começa com esse tempo", () => {
    const game = new BombGame(() => 0.99, ARENA);
    expect(game.matchMinutes).toBe(DEFAULT_MATCH_MINUTES);
    expect(DEFAULT_MATCH_MINUTES).toBe(5);
    game.addPlayer("p0", "k0", "P0");
    game.addPlayer("p1", "k1", "P1");
    game.start();
    expect(game.timeLeft).toBe(5 * 60_000);
  });

  it("o host escolhe entre 3, 5, 7 e 10; fora disso, ou com a rodada em curso, é recusado", () => {
    expect([...MATCH_MINUTES]).toEqual([3, 5, 7, 10]);
    const running = open(2, () => 0.99, ARENA);
    expect(() => running.setMatchMinutes(7)).toThrow(/começou/);
    const game = new BombGame(() => 0.99, ARENA);
    game.addPlayer("p0", "k0", "P0");
    game.addPlayer("p1", "k1", "P1");
    game.setMatchMinutes(7);
    expect(game.matchMinutes).toBe(7);
    expect(() => game.setMatchMinutes(4)).toThrow(/tempo/);
    expect(game.matchMinutes).toBe(7);
    game.start();
    expect(game.timeLeft).toBe(7 * 60_000);
  });

  it("na arena grande o mínimo é 5: o 3 é recusado, e trocar para a grande corrige o 3", () => {
    expect(minMinutesFor("small")).toBe(3);
    expect(minMinutesFor("medium")).toBe(3);
    expect(minMinutesFor("large")).toBe(5);
    const game = new BombGame(() => 0.99, arenaById("small-open")!);
    game.setMatchMinutes(3);
    expect(game.matchMinutes).toBe(3);
    game.setArena(ARENA);
    expect(game.matchMinutes).toBe(5);
    expect(() => game.setMatchMinutes(3)).toThrow(/grande/);
    game.setArena(arenaById("medium-grid")!);
    expect(game.matchMinutes).toBe(5);
    game.setMatchMinutes(3);
    expect(game.matchMinutes).toBe(3);
  });
});

describe("andar", () => {
  it("anda para a direita e para na parede", () => {
    const game = open();
    const [p] = game.players;
    game.setInput(p.id, 1, 0);
    run(game, 500);
    expect(p.x).toBeGreaterThan(1.5);
    expect(p.dir).toBe(2);
    run(game, 9000);
    // A muralha fica em x = COLS - 1: o personagem encosta nela e não entra.
    expect(p.x).toBeLessThan(COLS - 1);
    expect(p.x).toBeGreaterThan(COLS - 2);
  });

  it("não atravessa o pilar", () => {
    const game = open(2, () => 0.99, ARENA);
    const [p] = game.players;
    // (1,1) -> desce até (1,2), direita anda até bater no pilar (4,2)
    game.setInput(p.id, 0, 1);
    run(game, 300);
    game.setInput(p.id, 1, 0);
    run(game, 1000);
    expect(Math.floor(p.x)).toBe(3);
  });

  it("corta a quina: apertar para baixo perto da esquina desliza até o corredor", () => {
    // Um pilar em (2,2): descer de perto da coluna 1 tem de escorregar para ela.
    const layout = EMPTY_ARENA.layout.map((row, cy) => (cy === 2 ? `${row.slice(0, 2)}P${row.slice(3)}` : row));
    const game = open(2, () => 0.99, defineArena({ ...EMPTY_ARENA, id: "quina" }, layout));
    const [p] = game.players;
    game.setInput(p.id, 1, 0);
    run(game, 180); // ainda na coluna 1, fora do centro
    expect(p.x).toBeGreaterThan(1.5);
    expect(p.x).toBeLessThan(2.5);
    game.setInput(p.id, 0, 1);
    run(game, 1500);
    expect(Math.floor(p.y)).toBeGreaterThan(1);
    expect(p.x).toBeCloseTo(1.5, 5);
  });
});

describe("um tick atrasado", () => {
  it("não atravessa a muralha nem sai do campo", () => {
    const game = open();
    const [p] = game.players;
    // O servidor engasgou (GC, máquina dormindo): um único tick de 8 s.
    game.setInput(p.id, 0, 1);
    game.tick(8000);
    expect(p.y).toBeLessThan(ROWS - 1);
    expect(p.y).toBeGreaterThan(ROWS - 2);
    game.setInput(p.id, 1, 0);
    game.tick(8000);
    expect(p.x).toBeLessThan(COLS - 1);
    expect(p.x).toBeGreaterThan(COLS - 2);
  });

  it("não pula um bloco a duas células de distância", () => {
    const game = open();
    const [p] = game.players;
    // (2,1) está livre, mas (3,1) é bloco: um tick de 1 s andaria 3,6 células
    game.grid[cellIndex(3, 1)] = BRICK;
    game.setInput(p.id, 1, 0);
    game.tick(1000);
    // encosta no bloco e para nele
    expect(p.x).toBeCloseTo(2.5, 4);
  });
});

describe("a bomba", () => {
  it("explode depois do pavio, em cruz, e a chama some", () => {
    const game = open();
    const [p] = game.players;
    game.requestBomb(p.id);
    game.tick(16);
    expect(game.bombs).toHaveLength(1);
    expect(game.bombs[0]).toMatchObject({ cx: 1, cy: 1, owner: p.id });

    run(game, BOMB_FUSE);
    expect(game.bombs).toHaveLength(0);
    const cells = game.flames.map((f) => `${f.cx},${f.cy}`).sort();
    expect(cells).toEqual(["1,1", "1,2", "2,1"]);

    run(game, FLAME_TIME + 16);
    expect(game.flames).toHaveLength(0);
  });

  it("o braço que encosta num pilar termina em ponta, não no pedaço do meio", () => {
    const game = open();
    const [p] = game.players;
    game.grid[cellIndex(3, 1)] = WALL;
    p.range = 5;
    game.requestBomb(p.id);
    game.tick(16);
    run(game, BOMB_FUSE);
    expect(game.flames.find((f) => f.cx === 2 && f.cy === 1)!.kind).toBe(FLAME_END_R);
    expect(game.flames.some((f) => f.cx === 3 && f.cy === 1)).toBe(false);
  });

  it("respeita o limite de bombas e não empilha duas na mesma célula", () => {
    const game = open();
    const [p] = game.players;
    game.requestBomb(p.id);
    game.tick(16);
    game.requestBomb(p.id);
    game.tick(16);
    expect(game.bombs).toHaveLength(1);
  });

  it("deixa o dono sair de cima, mas não voltar", () => {
    const game = open();
    const [p] = game.players;
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, 1, 0);
    run(game, 400);
    expect(Math.floor(p.x)).toBe(2);
    game.setInput(p.id, -1, 0);
    run(game, 600);
    expect(Math.floor(p.x)).toBe(2);
  });

  it("queima o bloco, para nele e pode deixar um item", () => {
    const game = open(2, () => 0, ARENA);
    const [p] = game.players;
    expect(game.grid[cellIndex(3, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(4, 1)]).toBe(BRICK);
    expect(game.grid[cellIndex(5, 1)]).toBe(FLOOR);
    p.range = 4;
    game.requestBomb(p.id);
    game.tick(16);
    run(game, BOMB_FUSE);
    expect(game.grid[cellIndex(4, 1)]).toBe(FLOOR);
    // A chama parou no tijolo: o 5 fica sem chama mesmo com alcance 4.
    expect(game.flames.some((f) => f.cx === 5 && f.cy === 1)).toBe(false);
    expect(game.flames.some((f) => f.cx === 4 && f.cy === 1)).toBe(true);
    // random = 0 cai sempre no primeiro item
    expect(game.powerups).toContainEqual({ cx: 4, cy: 1, kind: "fire" });
  });

  it("o chute e a perfurante são raros: juntos, menos de um item em dez, mas ambos saem", () => {
    // O sorteio chama random duas vezes: a chance de cair algo (sempre cai) e qual item.
    const kinds: Record<string, number> = {};
    for (let i = 0; i < 100; i++) {
      const roll = (i + 0.5) / 100;
      let calls = 0;
      const game = open(2, () => (calls++ % 2 === 0 ? 0 : roll), ARENA);
      const [p] = game.players;
      p.range = 4;
      game.requestBomb(p.id);
      game.tick(16);
      run(game, BOMB_FUSE);
      const kind = game.powerups[0]?.kind ?? "nada";
      kinds[kind] = (kinds[kind] ?? 0) + 1;
    }
    expect(kinds.nada).toBeUndefined();
    expect(kinds.kick).toBeGreaterThanOrEqual(1);
    expect(kinds.pierce).toBeGreaterThanOrEqual(1);
    expect(kinds.kick + kinds.pierce).toBeLessThan(10);
    expect(kinds.kick + kinds.pierce).toBeLessThan(kinds.boot);
  });

  it("detona a bomba vizinha em cadeia", () => {
    const game = open();
    const [p] = game.players;
    p.bombs = 2;
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, 1, 0);
    run(game, 400);
    game.setInput(p.id, 0, 0);
    game.requestBomb(p.id);
    game.tick(16);
    expect(game.bombs).toHaveLength(2);
    run(game, BOMB_FUSE - 416);
    expect(game.bombs).toHaveLength(0);
  });

  it("uma chama reacesa por outra bomba nasce de novo: a tela recomeça a animação", () => {
    const game = open();
    const [p] = game.players;
    p.bombs = 2;
    game.requestBomb(p.id);
    game.tick(16);
    // Duas células à direita: os braços das duas bombas se encontram em (2,1).
    p.x = 3.5;
    run(game, 300);
    game.requestBomb(p.id);
    game.tick(16);
    expect(game.bombs.map((b) => b.cx)).toEqual([1, 3]);

    run(game, BOMB_FUSE - 316);
    const first = game.flames.find((f) => f.cx === 2 && f.cy === 1);
    expect(first).toBeDefined();
    const born = first!.born;
    expect(first!.until).toBe(born + FLAME_TIME);

    // A segunda explode com a chama da primeira ainda acesa em (2,1).
    run(game, 316);
    const again = game.flames.find((f) => f.cx === 2 && f.cy === 1);
    expect(again!.born).toBeGreaterThan(born);
    expect(again!.until).toBe(again!.born + FLAME_TIME);
  });
});

describe("a bomba pedida numa célula (a da tela)", () => {
  it("cai na célula pedida se o corpo do boneco ainda a toca, e ele passa por ela até sair de cima", () => {
    const game = open();
    const me = game.players[0];
    // Andou para a direita: o centro já está na célula 2, mas o corpo ainda toca a 1.
    me.x = 2.2;
    me.y = 1.5;
    game.requestBomb(me.id, { cx: 1, cy: 1 });
    game.tick(16);
    expect(game.bombs).toHaveLength(1);
    expect(game.bombs[0]).toMatchObject({ cx: 1, cy: 1 });
    expect(game.bombs[0].passers.has(me.id)).toBe(true);
    // Andando, enquanto ainda toca, continua passando; saindo de cima, a bomba fecha.
    game.setInput(me.id, 1, 0);
    game.tick(16);
    expect(game.bombs[0].passers.has(me.id)).toBe(true);
    run(game, 200);
    expect(me.x).toBeGreaterThan(2.5);
    expect(game.bombs[0].passers.has(me.id)).toBe(false);
  });

  it("uma célula que o corpo não toca não vale: a bomba cai na célula do boneco", () => {
    const game = open();
    const me = game.players[0];
    me.x = 3.5;
    me.y = 1.5;
    game.requestBomb(me.id, { cx: 1, cy: 1 });
    game.tick(16);
    expect(game.bombs[0]).toMatchObject({ cx: 3, cy: 1 });
    // Nem fora da arena, nem na muralha.
    game.bombs.length = 0;
    me.x = 1.3;
    game.requestBomb(me.id, { cx: 0, cy: 1 });
    game.tick(16);
    expect(game.bombs[0]).toMatchObject({ cx: 1, cy: 1 });
  });
});

describe("o chute", () => {
  /** O jogador 1 põe uma bomba em (2,1) e volta para (1,1), de frente para ela. */
  function bombAhead(game: BombGame) {
    const [p] = game.players;
    game.setInput(p.id, 1, 0);
    run(game, 400);
    game.setInput(p.id, 0, 0);
    expect(Math.floor(p.x)).toBe(2);
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, -1, 0);
    run(game, 500);
    expect(Math.floor(p.x)).toBe(1);
    game.setInput(p.id, 0, 0);
    expect(game.bombs[0]).toMatchObject({ cx: 2, cy: 1 });
    return game.bombs[0];
  }

  it("sem o item, andar contra a bomba só para nela", () => {
    const game = open();
    const [p] = game.players;
    const bomb = bombAhead(game);
    game.setInput(p.id, 1, 0);
    run(game, 300);
    expect(bomb).toMatchObject({ cx: 2, cy: 1, x: 2.5 });
    expect(p.x).toBeCloseTo(2 - 0.5, 3);
  });

  it("com o item, a bomba desliza na direção do chute e para na última célula livre antes do bloco", () => {
    const game = open();
    const [p] = game.players;
    game.grid[cellIndex(5, 1)] = BRICK;
    const bomb = bombAhead(game);
    p.kick = true;
    game.setInput(p.id, 1, 0);
    game.tick(16);
    expect(bomb.cx).toBe(2);
    run(game, 1000);
    expect(bomb).toMatchObject({ cx: 4, cy: 1, x: 4.5, y: 1.5 });
    // Chutada, ela deixou de ser a bomba em que alguém está em cima.
    expect(bomb.passers.size).toBe(0);
  });

  it("para antes de outra bomba e antes de um jogador", () => {
    const game = open();
    const [p] = game.players;
    p.kick = true;
    p.bombs = 2;
    p.speed = 4; // 6 células/s: dá tempo de armar tudo antes de a primeira bomba estourar
    // Primeiro a bomba de trás, em (6,1); depois a da frente, em (2,1).
    game.setInput(p.id, 1, 0);
    run(game, 900);
    game.setInput(p.id, 0, 0);
    expect(Math.floor(p.x)).toBe(6);
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, -1, 0);
    run(game, 700);
    game.setInput(p.id, 0, 0);
    expect(Math.floor(p.x)).toBe(2);
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, -1, 0);
    run(game, 300);
    game.setInput(p.id, 1, 0);
    run(game, 700);
    expect(game.bombs).toHaveLength(2);
    const front = game.bombs.find((b) => b.id !== game.bombs[0].id)!;
    expect(game.bombs[0]).toMatchObject({ cx: 6, cy: 1 });
    expect(front).toMatchObject({ cx: 5, cy: 1, x: 5.5 });

    // Um jogador no caminho também segura a bomba.
    const game2 = open();
    const [p2] = game2.players;
    const q2 = game2.players[1];
    q2.x = 4.5;
    q2.y = 1.5;
    const bomb = bombAhead(game2);
    p2.kick = true;
    game2.setInput(p2.id, 1, 0);
    run(game2, 1000);
    expect(bomb).toMatchObject({ cx: 3, cy: 1, x: 3.5 });
    expect(q2.alive).toBe(true);
  });

  it("a bomba chutada explode onde estiver quando o pavio acaba, e a cruz sai de lá", () => {
    const game = open();
    const [p] = game.players;
    const bomb = bombAhead(game);
    p.kick = true;
    game.setInput(p.id, 1, 0);
    game.tick(16);
    game.setInput(p.id, 0, 0);
    // A 6 células por segundo, o que resta do pavio não chega à muralha do outro lado.
    run(game, BOMB_FUSE);
    expect(game.bombs).toHaveLength(0);
    const center = game.flames.find((f) => f.kind === FLAME_CENTER)!;
    expect(center.cy).toBe(1);
    expect(center.cx).toBeGreaterThan(6);
    expect(center.cx).toBeLessThan(25);
    expect(bomb.cx).toBe(center.cx);
  });

  it("o item dá o chute", () => {
    const game = open();
    const [p] = game.players;
    game.powerups.push({ cx: 1, cy: 1, kind: "kick" });
    game.setInput(p.id, 1, 0);
    game.tick(16);
    expect(p.kick).toBe(true);
    expect(game.powerups).toHaveLength(0);
  });
});

describe("a bomba perfurante", () => {
  it("atravessa os tijolos até o alcance e queima todos, mas para no pilar", () => {
    const game = open();
    const [p] = game.players;
    game.grid[cellIndex(3, 1)] = BRICK;
    game.grid[cellIndex(5, 1)] = BRICK;
    game.grid[cellIndex(7, 1)] = WALL;
    p.range = 8;
    p.pierce = true;
    game.requestBomb(p.id);
    game.tick(16);
    expect(game.bombs[0].pierce).toBe(true);
    run(game, BOMB_FUSE);
    expect(game.grid[cellIndex(3, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(5, 1)]).toBe(FLOOR);
    const row = game.flames.filter((f) => f.cy === 1).map((f) => f.cx).sort((a, b) => a - b);
    expect(row).toEqual([1, 2, 3, 4, 5, 6]);
    // O tijolo atravessado vira um pedaço do meio do braço; a ponta fica junto ao pilar.
    expect(game.flames.find((f) => f.cx === 3 && f.cy === 1)!.kind).toBe(FLAME_H);
    expect(game.flames.find((f) => f.cx === 6 && f.cy === 1)!.kind).toBe(FLAME_END_R);
  });

  it("sem o item, a mesma bomba para no primeiro tijolo", () => {
    const game = open();
    const [p] = game.players;
    game.grid[cellIndex(3, 1)] = BRICK;
    game.grid[cellIndex(5, 1)] = BRICK;
    p.range = 8;
    game.requestBomb(p.id);
    game.tick(16);
    run(game, BOMB_FUSE);
    expect(game.grid[cellIndex(5, 1)]).toBe(BRICK);
    expect(game.flames.some((f) => f.cx === 4 && f.cy === 1)).toBe(false);
  });

  it("atravessa outra bomba: detona e segue", () => {
    const game = open();
    const [p] = game.players;
    p.range = 8;
    p.pierce = true;
    p.bombs = 2;
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, 1, 0);
    run(game, 600);
    game.setInput(p.id, 0, 0);
    expect(Math.floor(p.x)).toBe(3);
    // A segunda é fraca: só a primeira pode acender o (6,1).
    p.range = 1;
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, 0, 1);
    run(game, 500);
    game.setInput(p.id, 0, 0);
    // A primeira nasceu aos 16 ms: estoura aos 2516, e as chamas ainda estão lá logo depois.
    run(game, BOMB_FUSE - 1100);
    expect(game.bombs).toHaveLength(0);
    expect(game.flames.some((f) => f.cx === 6 && f.cy === 1)).toBe(true);
  });

  it("o item dá a perfurante", () => {
    const game = open();
    const [p] = game.players;
    game.powerups.push({ cx: 1, cy: 1, kind: "pierce" });
    game.setInput(p.id, 1, 0);
    game.tick(16);
    expect(p.pierce).toBe(true);
  });
});

describe("morrer e vencer", () => {
  it("quem fica na chama perde uma vida e renasce no canto", () => {
    const game = open();
    const [p] = game.players;
    game.requestBomb(p.id);
    game.tick(16);
    run(game, BOMB_FUSE);
    expect(p.alive).toBe(false);
    expect(p.lives).toBe(LIVES - 1);
    run(game, 2500);
    expect(p.alive).toBe(true);
    expect(p.x).toBeCloseTo(1.5);
    expect(game.phase).toBe("playing");
  });

  it("morrer tira o chute e a perfurante, mas não o fogo, as bombas nem a bota", () => {
    const game = open();
    const [p] = game.players;
    p.kick = true;
    p.pierce = true;
    p.range = 3;
    p.bombs = 2;
    p.speed = 2;
    game.requestBomb(p.id);
    game.tick(16);
    run(game, BOMB_FUSE);
    expect(p.alive).toBe(false);
    expect(p.kick).toBe(false);
    expect(p.pierce).toBe(false);
    expect(p).toMatchObject({ range: 3, bombs: 2, speed: 2 });
  });

  it("um pedido de bomba feito morto não vale ao renascer", () => {
    const game = open();
    const [p] = game.players;
    game.requestBomb(p.id);
    game.tick(16);
    run(game, BOMB_FUSE);
    expect(p.alive).toBe(false);
    game.requestBomb(p.id);
    run(game, 2500);
    expect(p.alive).toBe(true);
    expect(game.bombs).toHaveLength(0);
  });

  it("quem perde as três vidas sai, e o outro vence", () => {
    const game = open();
    const [p, q] = game.players;
    for (let i = 0; i < LIVES; i++) {
      game.requestBomb(p.id);
      game.tick(16);
      run(game, BOMB_FUSE + 3000);
    }
    expect(p.lives).toBe(0);
    expect(game.phase).toBe("finished");
    expect(game.winnerId).toBe(q.id);
    expect(q.wins).toBe(1);
  });

  it("o item dá poder a quem pisa nele", () => {
    const game = open();
    const [p] = game.players;
    game.powerups.push({ cx: 2, cy: 1, kind: "fire" });
    game.setInput(p.id, 1, 0);
    run(game, 400);
    expect(p.range).toBe(2);
    expect(game.powerups).toHaveLength(0);
  });

  it("acabado o tempo, vence quem tem mais vidas", () => {
    const game = open();
    const [p, q] = game.players;
    q.lives = 1;
    // A rodada padrão tem 5 minutos.
    run(game, 5 * 60_000 + 500);
    expect(game.phase).toBe("finished");
    expect(game.winnerId).toBe(p.id);
  });
});

describe("as maldições", () => {
  /** Um jogo com o primeiro jogador amaldiçoado até o fim do teste. */
  function cursed(curse: Curse) {
    const game = open();
    const [p] = game.players;
    p.curse = curse;
    p.curseUntil = Number.MAX_SAFE_INTEGER;
    return { game, p };
  }

  it("rápido demais anda mais que a bota no máximo", () => {
    const { game, p } = cursed("fast");
    const free = open();
    free.players[0].speed = MAX_SPEED_LEVEL;
    for (const g of [game, free]) g.setInput(g.players[0].id, 1, 0);
    run(game, 400);
    run(free, 400);
    expect(p.x).toBeGreaterThan(free.players[0].x);
  });

  it("invertido troca os lados", () => {
    const { game, p } = cursed("reverse");
    game.setInput(p.id, -1, 0);
    run(game, 300);
    expect(p.x).toBeGreaterThan(1.5);
    expect(p.dir).toBe(RIGHT);
  });

  it("sem freio segue andando sem dedo até a parede", () => {
    const { game, p } = cursed("slide");
    game.setInput(p.id, 1, 0);
    run(game, 200);
    game.setInput(p.id, 0, 0);
    const stopped = p.x;
    run(game, 9000);
    expect(p.x).toBeGreaterThan(stopped + 3);
    expect(p.x).toBeLessThan(COLS - 1);
  });

  it("sem bomba não solta nenhuma", () => {
    const { game, p } = cursed("constipation");
    game.requestBomb(p.id);
    game.tick(16);
    expect(game.bombs).toHaveLength(0);
  });

  it("uma bomba só, por mais que tenha", () => {
    const { game, p } = cursed("single");
    p.bombs = 4;
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, 1, 0);
    run(game, 400);
    game.requestBomb(p.id);
    game.tick(16);
    expect(game.bombs).toHaveLength(1);
  });

  it("pavio curto explode na metade do tempo; pavio longo, no dobro", () => {
    const short = cursed("shortfuse");
    short.game.requestBomb(short.p.id);
    short.game.tick(16);
    expect(short.game.bombs[0].fuse).toBe(BOMB_FUSE / 2);
    run(short.game, BOMB_FUSE / 2);
    expect(short.game.bombs).toHaveLength(0);

    const long = cursed("longfuse");
    long.game.requestBomb(long.p.id);
    long.game.tick(16);
    run(long.game, BOMB_FUSE + 100);
    expect(long.game.bombs).toHaveLength(1);
    run(long.game, BOMB_FUSE);
    expect(long.game.bombs).toHaveLength(0);
  });
});

describe("o contágio", () => {
  it("toda maldição passa a quem encostar, pelo tempo inteiro", () => {
    const game = open();
    const [a, b] = game.players;
    game.curse(a, "reverse");
    run(game, 5000);
    b.x = a.x + 0.5;
    b.y = a.y;
    game.tick(16);
    expect(b.curse).toBe("reverse");
    // Separados (encostados, um devolveria ao outro quando a dele acabasse).
    b.x = COLS - 2.5;
    // O que pegou agora tem os 15 s inteiros; quem passou, só o que sobrava.
    run(game, CURSE_TIME - 2000);
    expect(a.curse).toBe("");
    expect(b.curse).toBe("reverse");
  });

  it("de longe não pega, e morrer cura", () => {
    const game = open();
    const [a, b] = game.players;
    game.curse(a, "slow");
    game.tick(16);
    expect(b.curse).toBe("");
    game.flames.push({ cx: 1, cy: 1, kind: FLAME_CENTER, until: game.time + 100, born: game.time });
    game.tick(16);
    expect(a.alive).toBe(false);
    expect(a.curse).toBe("");
  });
});

describe("os itens da troca e da invisibilidade", () => {
  it("troca: os dois trocam de lugar na hora", () => {
    const game = open();
    const [a, b] = game.players;
    const at = { a: [a.x, a.y], b: [b.x, b.y] };
    game.apply(a, "swap");
    expect([a.x, a.y]).toEqual(at.b);
    expect([b.x, b.y]).toEqual(at.a);
  });

  it("troca sem ninguém de pé não faz nada", () => {
    const game = open();
    const [a, b] = game.players;
    b.alive = false;
    game.apply(a, "swap");
    expect([a.x, a.y]).toEqual([1.5, 1.5]);
  });

  it("invisível dura o tempo do item e não pega em ninguém", () => {
    const game = open();
    const [a, b] = game.players;
    game.apply(a, "ghost");
    expect(a.ghostUntil).toBe(game.time + GHOST_TIME);
    b.x = a.x + 0.5;
    b.y = a.y;
    game.tick(16);
    expect(b.ghostUntil).toBe(0);
    expect(a.curse).toBe("");
  });
});

describe("o controle remoto", () => {
  /** O primeiro jogador com o controle remoto e duas bombas. */
  function remote() {
    const game = open();
    const [p] = game.players;
    game.apply(p, "remote");
    p.bombs = 2;
    return { game, p };
  }

  it("a bomba espera a detonação, muito além do pavio comum", () => {
    const { game, p } = remote();
    game.requestBomb(p.id);
    game.tick(16);
    expect(game.bombs[0]).toMatchObject({ remote: true, armed: false });
    run(game, BOMB_FUSE * 2);
    expect(game.bombs).toHaveLength(1);
  });

  it("detonar arma a mais antiga, que pisca o aviso e só então explode", () => {
    const { game, p } = remote();
    game.requestBomb(p.id);
    game.tick(16);
    // Longe o bastante para a primeira não detonar a segunda em cadeia.
    game.setInput(p.id, 1, 0);
    run(game, 900);
    game.setInput(p.id, 0, 0);
    game.requestBomb(p.id);
    game.tick(16);
    const [first, second] = game.bombs;
    expect(second.cx - first.cx).toBeGreaterThan(1);
    game.requestDetonate(p.id);
    game.tick(16);
    expect(first.armed).toBe(true);
    expect(second.armed).toBe(false);
    run(game, REMOTE_ARM_MS - 50);
    expect(game.bombs).toContain(first);
    run(game, 100);
    expect(game.bombs).not.toContain(first);
    expect(game.bombs).toContain(second);
  });

  it("detonar pelos comandos da rede faz o mesmo", () => {
    const { game, p } = remote();
    game.pushCommands(p.id, [{ seq: 1, dx: 0, dy: 0, bomb: true }]);
    game.tick(TICK_MS);
    game.pushCommands(p.id, [{ seq: 2, dx: 0, dy: 0, bomb: false, detonate: true }]);
    game.tick(TICK_MS);
    expect(game.bombs[0].armed).toBe(true);
  });

  it("esquecida, explode sozinha no pavio reserva, piscando antes", () => {
    const { game, p } = remote();
    game.requestBomb(p.id);
    game.tick(16);
    run(game, REMOTE_BACKUP - REMOTE_ARM_MS + 32);
    expect(game.bombs[0].armed).toBe(true);
    run(game, REMOTE_ARM_MS);
    expect(game.bombs).toHaveLength(0);
  });

  it("o dono morre: perde o controle, e a remota vira comum com o pavio inteiro", () => {
    const { game, p } = remote();
    game.requestBomb(p.id);
    game.tick(16);
    game.setInput(p.id, 1, 0);
    run(game, 600);
    game.setInput(p.id, 0, 0);
    const [bomb] = game.bombs;
    game.flames.push({ cx: Math.floor(p.x), cy: 1, kind: FLAME_CENTER, until: game.time + 50, born: game.time });
    game.tick(16);
    expect(p.alive).toBe(false);
    expect(p.remote).toBe(false);
    expect(bomb).toMatchObject({ remote: false, fuse: BOMB_FUSE });
    run(game, BOMB_FUSE + 16);
    expect(game.bombs).not.toContain(bomb);
  });

  it("as maldições do pavio e a diarreia ganham do controle remoto", () => {
    for (const curse of ["shortfuse", "longfuse", "diarrhea"] as const) {
      const { game, p } = remote();
      game.curse(p, curse);
      game.requestBomb(p.id);
      game.tick(16);
      expect(game.bombs[0].remote).toBe(false);
    }
  });
});

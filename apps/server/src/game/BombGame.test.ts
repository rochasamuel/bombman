import { BOMB_FUSE, BRICK, COLS, COUNTDOWN, FLAME_TIME, FLOOR, LIVES, ROWS, WALL, cellIndex } from "@bomb/shared";
import { describe, expect, it } from "vitest";
import { BombGame } from "@bomb/shared";

/** Uma arena com dois jogadores, já valendo, e SEM blocos: a regra se testa limpa. */
function open(count = 2, random = () => 0.99) {
  const game = new BombGame(random);
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
  it("nasce com muralha, pilares e os cantos livres", () => {
    const game = open(2, () => 0);
    expect(game.grid[cellIndex(0, 0)]).toBe(WALL);
    expect(game.grid[cellIndex(2, 2)]).toBe(WALL);
    expect(game.grid[cellIndex(1, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(2, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(1, 2)]).toBe(FLOOR);
    expect(game.grid[cellIndex(COLS - 2, ROWS - 2)]).toBe(FLOOR);
    // random = 0 enche tudo que pode de bloco; as duas células vizinhas do
    // canto ficam livres de propósito
    expect(game.grid[cellIndex(3, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(4, 1)]).toBe(BRICK);
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

describe("andar", () => {
  it("anda para a direita e para na parede", () => {
    const game = open();
    const [p] = game.players;
    game.setInput(p.id, 1, 0);
    run(game, 500);
    expect(p.x).toBeGreaterThan(1.5);
    expect(p.dir).toBe(2);
    run(game, 5000);
    // A muralha fica em x = 14: o personagem encosta nela e não entra.
    expect(p.x).toBeLessThan(COLS - 1);
    expect(p.x).toBeGreaterThan(COLS - 2);
  });

  it("não atravessa o pilar", () => {
    const game = open();
    const [p] = game.players;
    // (1,1) -> desce até (1,2), direita bate no pilar (2,2)
    game.setInput(p.id, 0, 1);
    run(game, 300);
    game.setInput(p.id, 1, 0);
    run(game, 1000);
    expect(Math.floor(p.x)).toBe(1);
  });

  it("corta a quina: apertar para baixo perto da esquina desliza até o corredor", () => {
    const game = open();
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
    // O servidor engasgou (GC, máquina dormindo): um único tick de 4 s.
    game.setInput(p.id, 0, 1);
    game.tick(4000);
    expect(p.y).toBeLessThan(ROWS - 1);
    expect(p.y).toBeGreaterThan(ROWS - 2);
    game.setInput(p.id, 1, 0);
    game.tick(4000);
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
    const game = open(2, () => 0);
    const [p] = game.players;
    expect(game.grid[cellIndex(3, 1)]).toBe(FLOOR); // reservado ao canto
    expect(game.grid[cellIndex(4, 1)]).toBe(BRICK);
    p.range = 4;
    game.requestBomb(p.id);
    game.tick(16);
    run(game, BOMB_FUSE);
    expect(game.grid[cellIndex(4, 1)]).toBe(FLOOR);
    expect(game.grid[cellIndex(5, 1)]).toBe(BRICK); // a chama parou no 4
    expect(game.flames.some((f) => f.cx === 5 && f.cy === 1)).toBe(false);
    expect(game.flames.some((f) => f.cx === 4 && f.cy === 1)).toBe(true);
    // random = 0 cai sempre no primeiro item
    expect(game.powerups).toContainEqual({ cx: 4, cy: 1, kind: "fire" });
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
    run(game, 180_500);
    expect(game.phase).toBe("finished");
    expect(game.winnerId).toBe(p.id);
  });
});

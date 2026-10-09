import { describe, expect, it } from "vitest";
import { IDLE_FRAME_MS, idleStep, walkStep } from "./walk";

describe("o passo da caminhada", () => {
  it("parado é sempre o quadro 0", () => {
    expect(walkStep(0, 4, false)).toBe(0);
    expect(walkStep(37, 17, false)).toBe(0);
  });

  it("andando começa no quadro 1 e dá a volta por todos, inclusive o 0", () => {
    const seen = new Set<number>();
    for (let px = 0; px < 64; px += 0.5) seen.add(walkStep(px, 17, true));
    expect(seen.size).toBe(17);
    expect(walkStep(0, 17, true)).toBe(1);
  });

  it("uma volta completa cobre dois blocos, seja qual for o número de quadros", () => {
    expect(walkStep(32, 4, true)).toBe(walkStep(0, 4, true));
    expect(walkStep(32, 17, true)).toBe(walkStep(0, 17, true));
    expect(walkStep(16, 4, true)).toBe(3);
  });
});

describe("o quadro do parado", () => {
  it("segue o relógio e dá a volta por todos os quadros", () => {
    const seen = new Set<number>();
    for (let t = 0; t < 5000; t += 10) seen.add(idleStep(t, 14));
    expect(seen.size).toBe(14);
    expect(idleStep(0, 14)).toBe(0);
  });

  it("troca de quadro a cada IDLE_FRAME_MS", () => {
    expect(idleStep(IDLE_FRAME_MS - 1, 14)).toBe(0);
    expect(idleStep(IDLE_FRAME_MS, 14)).toBe(1);
    expect(idleStep(IDLE_FRAME_MS * 14, 14)).toBe(0);
  });
});

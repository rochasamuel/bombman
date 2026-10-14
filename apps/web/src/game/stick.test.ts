import { describe, expect, it } from "vitest";
import { clampToRadius, DEAD_ZONE, stickDir } from "./stick";

describe("o joystick", () => {
  it("dentro da zona morta não anda", () => {
    expect(stickDir(0, 0, null)).toBeNull();
    expect(stickDir(DEAD_ZONE - 1, 0, "right")).toBeNull();
  });

  it("fora dela, vale o eixo dominante", () => {
    expect(stickDir(30, 5, null)).toBe("right");
    expect(stickDir(-30, 5, null)).toBe("left");
    expect(stickDir(5, -30, null)).toBe("up");
    expect(stickDir(5, 30, null)).toBe("down");
  });

  it("perto da diagonal, o eixo atual segura", () => {
    expect(stickDir(30, 33, "right")).toBe("right");
    expect(stickDir(33, -30, "up")).toBe("up");
  });

  it("o outro eixo ganha quando passa com folga", () => {
    expect(stickDir(20, 40, "right")).toBe("down");
    expect(stickDir(40, -20, "up")).toBe("right");
  });

  it("virar para o lado oposto no mesmo eixo é imediato", () => {
    expect(stickDir(-30, 2, "right")).toBe("left");
  });

  it("o botão não sai da base", () => {
    expect(clampToRadius(3, 4, 10)).toEqual([3, 4]);
    expect(clampToRadius(30, 40, 10)).toEqual([6, 8]);
  });
});

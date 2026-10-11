import { describe, expect, it } from "vitest";
import { BOMB_FUSE, FLAME_TIME } from "@bomb/shared";
import { BOMB_BOOM_MS, BOMB_PULSE_MS, FX_FRAME_MS, bombFrame, flameStep, itemStep } from "./fuse";

describe("o pavio da bomba", () => {
  it("queima em volta pelos seis quadros a 16 fps desde que a bomba nasce", () => {
    expect(FX_FRAME_MS).toBe(62.5);
    expect(bombFrame(0)).toEqual({ phase: "fuse", step: 0 });
    expect(bombFrame(62)).toEqual({ phase: "fuse", step: 0 });
    expect(bombFrame(63)).toEqual({ phase: "fuse", step: 1 });
    expect(bombFrame(6 * FX_FRAME_MS)).toEqual({ phase: "fuse", step: 0 });
  });

  it("pulsa nos últimos 625 ms: oito quadros em meio segundo e os dois do estouro no fim", () => {
    expect(BOMB_PULSE_MS).toBe(500);
    expect(BOMB_BOOM_MS).toBe(125);
    const pulseAt = BOMB_FUSE - BOMB_BOOM_MS - BOMB_PULSE_MS;
    expect(bombFrame(pulseAt - 1).phase).toBe("fuse");
    expect(bombFrame(pulseAt)).toEqual({ phase: "pulse", step: 0 });
    expect(bombFrame(pulseAt + 7 * FX_FRAME_MS)).toEqual({ phase: "pulse", step: 7 });
    expect(bombFrame(BOMB_FUSE - BOMB_BOOM_MS - 1)).toEqual({ phase: "pulse", step: 7 });
    expect(bombFrame(BOMB_FUSE - BOMB_BOOM_MS)).toEqual({ phase: "boom", step: 0 });
    expect(bombFrame(BOMB_FUSE - 1)).toEqual({ phase: "boom", step: 1 });
  });

  it("passado o pavio sem o servidor ter avisado, fica no último quadro do estouro", () => {
    expect(bombFrame(BOMB_FUSE + 1000)).toEqual({ phase: "boom", step: 1 });
  });
});

describe("a chama", () => {
  it("espalha os oito quadros pela vida da chama e para no último", () => {
    expect(flameStep(0)).toBe(0);
    expect(flameStep(FLAME_TIME / 2)).toBe(4);
    expect(flameStep(FLAME_TIME - 1)).toBe(7);
    expect(flameStep(FLAME_TIME * 2)).toBe(7);
  });
});

describe("o item", () => {
  it("dá a volta nos quatro quadros a 16 fps", () => {
    expect(itemStep(0)).toBe(0);
    expect(itemStep(FX_FRAME_MS * 3)).toBe(3);
    expect(itemStep(FX_FRAME_MS * 4)).toBe(0);
  });
});

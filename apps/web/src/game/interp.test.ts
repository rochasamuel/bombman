import { describe, expect, it } from "vitest";
import { DELAY_MS, JUMP_CELLS, SAMPLES, record, sampleAt, type Sample } from "./interp";

describe("a interpolação", () => {
  it("anda em linha reta e em velocidade constante entre dois patches", () => {
    const s: Sample[] = [];
    record(s, 0, 1.5, 1.5);
    record(s, 50, 1.7, 1.5);
    expect(sampleAt(s, 25).x).toBeCloseTo(1.6);
    expect(sampleAt(s, 10).x).toBeCloseTo(1.54);
    expect(sampleAt(s, 40).x).toBeCloseTo(1.66);
  });

  it("com o atraso fixo, cada quadro de tela tem uma amostra à frente", () => {
    // Patches a 20 Hz, o boneco a 3,6 células/s; a tela desenha a 60 Hz com DELAY_MS.
    const s: Sample[] = [];
    for (let i = 0; i < 6; i++) record(s, i * 50, 1.5 + 0.18 * i, 1.5);
    const xs: number[] = [];
    for (let now = 150; now <= 250; now += 1000 / 60) xs.push(sampleAt(s, now - DELAY_MS).x);
    // Cada passo da tela anda o mesmo tanto: nada de "chega e espera".
    const steps = xs.slice(1).map((x, i) => x - xs[i]);
    for (const step of steps) expect(step).toBeCloseTo(steps[0], 3);
    expect(steps[0]).toBeGreaterThan(0);
  });

  it("parado não anda, e um patch repetido não vira amostra", () => {
    const s: Sample[] = [];
    record(s, 0, 2.5, 3.5);
    record(s, 50, 2.5, 3.5);
    record(s, 100, 2.5, 3.5);
    expect(s).toHaveLength(1);
    expect(sampleAt(s, 500)).toEqual({ x: 2.5, y: 3.5 });
  });

  it("renascer é um salto, não um passeio pela arena", () => {
    const s: Sample[] = [];
    record(s, 0, 1.5, 1.5);
    record(s, 50, 1.6, 1.5);
    record(s, 100, 1.6 + JUMP_CELLS + 1, 11.5);
    expect(s).toHaveLength(1);
    expect(sampleAt(s, 60)).toEqual({ x: 1.6 + JUMP_CELLS + 1, y: 11.5 });
  });

  it("guarda só as últimas amostras", () => {
    const s: Sample[] = [];
    for (let i = 0; i < SAMPLES * 3; i++) record(s, i * 50, 1.5 + 0.1 * i, 1.5);
    expect(s).toHaveLength(SAMPLES);
    expect(sampleAt(s, 0).x).toBeCloseTo(s[0].x);
  });
});

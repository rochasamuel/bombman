import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ARENA, DEFAULT_MATCH_MINUTES, DEFAULT_MAX_PLAYERS, DEFAULT_THEME } from "@bomb/shared";
import { loadPrefs, loadSetup } from "./session";

/** Um localStorage de mentira com o que estiver em `items`. */
function stub(items: Record<string, string>) {
  Object.assign(globalThis, {
    localStorage: {
      getItem: (key: string) => items[key] ?? null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
}

afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

const SETUP_FALLBACK = {
  roomName: "Arena do jardim",
  maxPlayers: DEFAULT_MAX_PLAYERS,
  arenaId: DEFAULT_ARENA.id,
  minutes: DEFAULT_MATCH_MINUTES,
  themeId: DEFAULT_THEME.id,
};

describe("loadSetup e loadPrefs", () => {
  it("sem localStorage, ficam no padrão", () => {
    expect(loadSetup()).toEqual(SETUP_FALLBACK);
    expect(loadPrefs()).toEqual({ lowMotion: false, touchPad: "auto" });
  });

  it("com lixo guardado, ficam no padrão", () => {
    for (const raw of ["{quebrado", "null", "5", '"texto"']) {
      stub({ "bomb:setup": raw, "bomb:prefs": raw });
      expect(loadSetup()).toEqual(SETUP_FALLBACK);
      expect(loadPrefs()).toEqual({ lowMotion: false, touchPad: "auto" });
    }
  });

  it("lê o que foi guardado, campo a campo", () => {
    stub({
      "bomb:setup": JSON.stringify({ roomName: "Sala", maxPlayers: 99 }),
      "bomb:prefs": JSON.stringify({ lowMotion: true, touchPad: "on" }),
    });
    expect(loadSetup()).toEqual({ ...SETUP_FALLBACK, roomName: "Sala" });
    expect(loadPrefs()).toEqual({ lowMotion: true, touchPad: "on" });
  });
});

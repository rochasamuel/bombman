import { DEFAULT_THEME, THEMES, isThemeId, themeById } from "@bomb/shared";
import { describe, expect, it } from "vitest";

describe("o catálogo de temas", () => {
  it("tem seis temas: a referência e os cinco novos, com nomes e ids únicos", () => {
    expect(THEMES.map((t) => t.id)).toEqual(["garden", "forest", "volcano", "frozen", "cyber", "desert"]);
    expect(new Set(THEMES.map((t) => t.name)).size).toBe(6);
    for (const theme of THEMES) {
      expect(theme.id).toMatch(/^[a-z]+$/);
      expect(theme.name.length).toBeGreaterThan(3);
      expect(theme.blurb.length).toBeGreaterThan(10);
    }
  });

  it("abre a sala com a referência", () => {
    expect(DEFAULT_THEME.id).toBe("garden");
    expect(THEMES[0]).toBe(DEFAULT_THEME);
  });

  it("acha cada tema pelo id, e só pelo id", () => {
    for (const theme of THEMES) expect(themeById(theme.id)).toBe(theme);
    expect(themeById("lunar")).toBeUndefined();
    expect(themeById(undefined)).toBeUndefined();
    expect(themeById(3)).toBeUndefined();
    expect(isThemeId("frozen")).toBe(true);
    expect(isThemeId("Frozen")).toBe(false);
  });
});

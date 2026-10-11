/*
 * Os temas: a cara da arena. Um tema é só desenho — a planta, as colisões e a
 * regra são as mesmas em todos; o que muda é o tileset com que a tela
 * desenha o chão, o tijolo, o pilar e a muralha. Por isso o tema mora aqui,
 * no pacote compartilhado, só como um nome: a sala guarda o escolhido pelo
 * host e espelha para todos (`themeId`), e cada tela desenha com as peças
 * que tem no atlas (`apps/web/src/art/themes.ts`). Ninguém desenha um tema
 * que não veio do servidor.
 *
 * O primeiro, "garden", é a reconstrução da imagem de referência original;
 * os outros cinco vieram dos cenários e tilesets de 11 de outubro.
 */

export type ThemeDefinition = {
  /** `garden`, `forest`… O que a sala guarda e o cliente pede. */
  id: string;
  name: string;
  /** Uma frase sobre o lugar, para o cartão da escolha. */
  blurb: string;
};

export const THEMES: readonly ThemeDefinition[] = [
  { id: "garden", name: "Jardim", blurb: "A fortaleza de pedra da referência, com grama e tijolos de musgo." },
  { id: "forest", name: "Floresta Encantada", blurb: "Muralha de pedra tomada por hera, grama com flores e tijolos de terra." },
  { id: "volcano", name: "Fortaleza Vulcânica", blurb: "Pedra escura rachada de lava, torres com fendas acesas." },
  { id: "frozen", name: "Cidadela Gelada", blurb: "Muralha coberta de neve, estandartes e blocos de gelo." },
  { id: "cyber", name: "Instalação Cyberpunk", blurb: "Painéis de aço com luzes de neon e caixas de carga." },
  { id: "desert", name: "Templo do Deserto", blurb: "Arenito, medalhões alados e tijolos de barro cozido." },
];

/** O tema com que uma sala abre: o da referência. */
export const DEFAULT_THEME = THEMES[0];

export const themeById = (id: unknown): ThemeDefinition | undefined =>
  typeof id === "string" ? THEMES.find((theme) => theme.id === id) : undefined;

export const isThemeId = (value: unknown): value is string => themeById(value) !== undefined;

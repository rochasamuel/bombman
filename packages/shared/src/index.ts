/*
 * O pacote compartilhado: o contrato (tipos, constantes, mensagens), as
 * arenas (a forma de uma planta e as nove plantas) e a REGRA (o motor
 * `BombGame`). O servidor é quem roda o motor valendo; a tela só o roda no
 * `/mock`, para olhar a arte andando sem servidor.
 */
export * from "./contract.js";
export * from "./arena.js";
export * from "./arenas.js";
export * from "./themes.js";
export * from "./game.js";

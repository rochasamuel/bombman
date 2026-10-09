# Bombman

Bomberman multiplayer para até 4 pessoas, em pixel art. O servidor é
autoritativo: o cliente só manda a direção do dedo e desenha o estado que
recebe de volta, sessenta vezes por segundo.

**As regras são as do original.** Cada um nasce num canto com 3 vidas, 1 bomba
e fogo de alcance 1. A bomba explode dois segundos e meio depois de cair, em
cruz; a chama derruba tijolos e moitas, detona outras bombas em cadeia e tira
uma vida de quem estiver nela. Blocos destruídos podem deixar um item: 🔥 mais
fogo, 💣 mais bombas, 👟 mais velocidade, 💀 uma maldição de dez segundos
(lento, fogo fraco ou bombas sem parar). Quem perde as três vidas sai; a última
pessoa de pé vence. Deu o tempo (3 minutos), vence quem tiver mais vidas.

## Arquitetura

```
React (apps/web)
   │  @colyseus/sdk
   ▼
Colyseus (apps/server)
   │
   └── ArenaRoom    sala, conexões, reconexão, relógio, espelho do estado
         │
         ▼
   BombGame (packages/shared)   A REGRA: a grade, o andar, as bombas, as chamas, as vidas
```

`BombGame` mora no pacote compartilhado porque dois relógios o rodam: o da
sala, valendo, e o do `/mock`, no navegador, para olhar a arte andando sem
servidor. Quem valida é sempre o servidor; a tela de verdade só manda a direção
do dedo e desenha o que recebe.

A base de tudo isto — o monorepo, o sistema de chapas e botões, a fonte, as
salas com código de cinco letras, a reconexão por `seatKey`, os emojis da
conversa — veio dos irmãos [`fdp`](../fdp) e [`nuo`](../nuo). O que é novo é o
motor em tempo real e a arte.

### O motor

`BombGame` não conhece o Colyseus nem o relógio: recebe `tick(dt)` de quem tem
relógio e avança a arena em `dt` milissegundos. O único acaso é a função
`random` do construtor. É isso que deixa o teste rodar uma rodada inteira sem
esperar um milissegundo.

As posições são em células: `x = 3.5` é o meio da coluna 3. O personagem anda
em trilhos — só se move na horizontal quando está centrado na linha, e
vice-versa — com o corte de quina dos Bomberman clássicos: apertar para cima
perto de uma esquina desliza o personagem até o corredor em vez de travá-lo na
parede.

A sala roda o motor a 60 Hz (`setSimulationInterval`) e manda patches a 20 Hz.
O cliente interpola a posição entre um patch e outro (`game/render.ts`), e o
que não é situação — o som de uma explosão, um emoji — vai em mensagens `fx` e
`emote`, fora do estado sincronizado.

### A arte

O boneco é recortado das folhas de referência por
`apps/web/scripts/build-atlas.cjs`, que monta `src/art/atlas.png` e
`src/art/atlas.json` em 4 px de arte por pixel lógico — uma célula de 16 px tem
64 px de arte, perto da resolução nativa das referências. A folha de sprites dá
o retrato, as bombas, os itens e a morte; as folhas de caminhada dão o boneco
de frente, de costas e de lado (a esquerda é o espelho do lado), as do parado
dão a respiração em cada direção (a esquerda tem folha própria), e a folha da
vitória dá os braços para cima; só existem em vermelho — as outras cores são
recoloridas. Da arena ficam só a chama e os corações do painel. O `atlas.json`
guarda quantos quadros tem cada animação, e uma volta da caminhada sempre
cobre dois blocos.

O cenário não vem de imagem nenhuma: `apps/web/scripts/scenery.cjs` desenha
em código o chão (7 versões), a grama, os canteiros (7), o tijolo, a moita, o
pilar, a muralha, os cantos com lanterna, as árvores (4) e o banco, numa grade
de 32 px por célula ampliada duas vezes. A regra é a emenda: toda versão de
chão tem a mesma borda (a junta fica na coluna e na linha 0, e a lajota mora
inteira dentro da célula), a grama é ruído num toro, os canteiros são a mesma
grama com as flores por dentro, e a muralha tem período igual à célula — por
isso qualquer peça encosta em qualquer outra sem risca. O teste do atlas
confere as bordas pixel a pixel.

```bash
node apps/web/scripts/build-atlas.cjs "Retro Bomberman Garden Arena.png" "Bomberman Pixel Sprite Sheet.png" \
  bomb-iso_walk_down-trimmed.png bomb-iso_walk_up-trimmed.png bomb-iso_walk_right-trimmed.png \
  bomb-iso_idle_down-trimmed.png bomb-iso_idle_up-trimmed.png bomb-iso_idle_right-trimmed.png \
  bomb-iso_idle_left-trimmed.png bomb-iso_custom_victory_down.png
```

O atlas (`art/atlas.ts`) fatia a imagem num canvas por quadro quando ela
chega, e a arena desenha em 16 px lógicos numa escala inteira, reduzindo a
arte com suavização e seguindo a densidade da tela.

Abra `/mock` para jogar sozinho, sem servidor: o mesmo `BombGame` roda no
navegador, com o `requestAnimationFrame` de relógio e o tempo da rodada
congelado. Você é o vermelho; os outros três são bonecos parados nos cantos —
não andam, mas explodem. O sorteio da arena é fixo, para ela nascer igual toda
vez.

## Requisitos

- Node.js >= 20.9
- pnpm (`corepack enable pnpm`)

## Instalação

```bash
pnpm install
```

## Desenvolvimento

```bash
pnpm dev          # tipos compartilhados + servidor (8080) + web (5173)
pnpm dev:web
pnpm dev:server
```

Abra <http://localhost:5173>. O `vite` sobe com `--host`, então o celular na
mesma rede entra pelo IP da máquina. O endpoint usado pelo front sai de
`VITE_SERVER_URL`, com `http://<host>:8080` como padrão.

## Build e testes

```bash
pnpm build        # valida o projeto inteiro
pnpm test         # o motor, a sala e a arte
pnpm lint
```

Em produção o servidor roda com `pnpm --filter server start` (a partir de
`apps/server/build`). `CORS_ORIGIN` limita as origens que podem falar com ele.

## Controles

- Setas ou WASD andam; espaço, Enter, X ou Z soltam a bomba.
- No celular aparece um direcional na tela (ajustável em "ajustes").
- O balão 💬 manda um emoji para a arena.

## Estrutura

```
apps/
  server/
    src/game/       os testes do BombGame
    src/rooms/      ArenaRoom, ArenaState
  web/
    scripts/        build-atlas.cjs: recorta as referências e monta o atlas
                    scenery.cjs: desenha o cenário em código
    src/art/        o atlas (imagem, mapa e acesso aos quadros)
    src/game/       conexão com a sala, o desenho da arena, o direcional
    src/components/ arena, painel, direcional na tela, conversa, ajustes
    src/screens/    home, sala, mock
packages/
  shared/           contract.ts (constantes, estado público, mensagens) e game.ts (BombGame, a regra)
```

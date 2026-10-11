# Bombman

Bomberman multiplayer para até 4 pessoas, em pixel art. O servidor é
autoritativo: o cliente só manda a direção do dedo e desenha o estado que
recebe de volta, sessenta vezes por segundo.

**As regras são as do original.** Cada um nasce num canto com 3 vidas, 1 bomba
e fogo de alcance 1. Antes de começar, o host escolhe o tempo da rodada (3, 5, 7 ou 10
minutos; na arena grande o mínimo é 5), a arena: três tamanhos
(pequena 11 × 11, média 15 × 13, grande 27 × 17), com uma das três plantas
do tamanho sorteada a cada rodada, e o tema que a veste (jardim, floresta encantada, fortaleza vulcânica, cidadela
gelada, instalação cyberpunk ou templo do deserto). A bomba explode dois segundos e meio depois de cair, em
cruz; a chama derruba tijolos e moitas, detona outras bombas em cadeia e tira
uma vida de quem estiver nela. Blocos destruídos podem deixar um item: 🔥 mais
fogo, 💣 mais bombas, 👟 mais velocidade, 🦶 o chute (andar contra uma bomba a
empurra: ela desliza a 6 células/s e para na última célula livre antes de
bloco, bomba ou jogador, com o pavio contando), ⚡ a perfurante (as bombas
nascem vermelhas com uma ponta dourada e a explosão delas atravessa tijolos e bombas, parando só em
muralha e pilar; morrer leva o chute e a perfurante, só eles), 💀 uma maldição de quinze segundos (uma caveirinha paira sobre a cabeça enquanto dura) (lento, fogo fraco ou bombas
sem parar). Quem perde as três vidas sai; a última
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
o retrato e a morte; as folhas de caminhada dão o boneco
de frente, de costas e de lado (a esquerda é o espelho do lado), as do parado
dão a respiração em cada direção (a esquerda tem folha própria), e a folha da
vitória dá os braços para cima; só existem em vermelho — as outras cores são
recoloridas. Da arena ficam só os corações do painel. O `atlas.json`
guarda quantos quadros tem cada animação, e uma volta da caminhada sempre
cobre dois blocos.

A bomba, a explosão e os itens vêm de três folhas próprias (as três últimas
do comando abaixo), desenhadas a 16 quadros por segundo: a bomba tem a parada,
o pavio em seis quadros (dá voltas), o pulso em oito (uma vez, no meio segundo
antes do fim do fuso) e o estouro em dois; a explosão é modular — o braço
horizontal, o vertical e as quatro pontas, cada peça em oito quadros
sincronizados que a tela espalha pela vida da chama. Na folha só dois quadros
chegam à borda da célula e o braço é uma lente que afina até uma ponta, então
a cruz aparecia em losangos soltos: no atlas cada braço é esticado até a
lajota inteira em todo quadro com fogo e emenda nele mesmo (a união da lente
com ela deslocada meia lajota, tão grossa na borda quanto no meio), o centro é
a união dos dois braços, e a ponta ganha a meia lente do lado de dentro — a
cruz é uma chama só, de ponta a ponta, em qualquer alcance. Cada item brilha
em quatro quadros, e todos os seis entram, a caveira, o chute e a perfurante
inclusive. A bomba perfurante tem folha própria, a última do comando: vermelha,
com a ponta dourada, nas mesmas fases da bomba comum; a esfera dela ganha o
tamanho e o lugar da bomba comum pela faixa do corpo, não pela caixa justa.
O servidor não manda relógio nenhum: a tela anota quando viu cada bomba e cada
chama pela primeira vez e escolhe o quadro pela idade (`src/game/fuse.ts`);
uma chama reacesa por outra bomba traz um `born` novo, e a animação recomeça.
As folhas têm fundo em degradê, sem uma cor para inundar, então o recorte
acha a tinta pelas bordas duras do pixel art (e pelo miolo claro do fogo) e
tira o resto; a grade delas também não é exata, e as janelas foram medidas.

O cenário é a reconstrução de uma imagem de referência (a arena inteira,
`bomb-scenario-reference.png`) com as peças de um tileset
(`bomb-tileset.png`). A planta dessa arena — 27 × 17 células contando a
muralha, com o pilar e o tijolo de cada célula — é a "Jardim", a grande
clássica, e mora com as outras oito em `packages/shared/src/arenas.ts`,
porque é o servidor quem as monta; é fixa e simétrica nos dois eixos, como a
imagem. O que é só desenho fica em `apps/web/src/art/scenario.ts`: qual das
44 lajotas do tileset vai em cada célula e qual dos 40 tijolos (a mais
parecida com o miolo daquela célula na referência), e onde ficam os merlões
que coroam a muralha (16 em cima, 16 embaixo e 9 blocos de cada lado, a cada
célula e meia, como na imagem). As arenas menores leem o miolo dessas mesmas
tabelas, centrado, e coroam a muralha com a mesma regra (célula e meia de
passo, a dois cantos de distância da quina). O tileset, gerado por IA, não está numa grade
exata, então `build-atlas.cjs` recorta cada peça por medidas tomadas uma a
uma: as lajotas de junta a junta (a junta fica na coluna e na linha 0, e por
isso qualquer uma encosta em qualquer outra), a muralha de uma peça lisa
cortada na junta (a de baixo é a mesma, as dos lados são ela girada com a
fieira clara para fora), o merlão da muralha longa, o canto do bloco
quadrado. Só a moita continua desenhada em código, em
`apps/web/scripts/scenery.cjs`: o tileset não tem uma, e a planta não usa
nenhuma.

```bash
node apps/web/scripts/build-atlas.cjs bomb-garden-arena.png bomb-sprite-sheet.png \
  bomb-iso_walk_down-trimmed.png bomb-iso_walk_up-trimmed.png bomb-iso_walk_right-trimmed.png \
  bomb-iso_idle_down-trimmed.png bomb-iso_idle_up-trimmed.png bomb-iso_idle_right-trimmed.png \
  bomb-iso_idle_left-trimmed.png bomb-iso_custom_victory_down.png bomb-tileset.png \
  bomb-fuse-sheet.png bomb-explosion-sheet.png bomb-items-sheet.png bomb-pierce-sheet.png \
  enchanted_forest_tileset.png volcanic_fortress_tileset.png frozen_citadel_tileset.png \
  cyberpunk_facility_tileset.png desert_temple_tileset.png
```

Os cinco últimos são os tilesets dos temas novos (ver abaixo).

O atlas (`art/atlas.ts`) fatia a imagem num canvas por quadro quando ela
chega, e a arena desenha em 16 px lógicos numa escala inteira, reduzindo a
arte com suavização e seguindo a densidade da tela.

### Os temas

Um tema é só a cara da arena: a planta, as colisões e a regra são as mesmas
em todos; o que muda é com que peças a tela desenha o chão, o tijolo, o
pilar e a muralha. O catálogo (`packages/shared/src/themes.ts`) tem seis:
o "Jardim" da referência e os cinco de 11 de outubro — Floresta Encantada,
Fortaleza Vulcânica, Cidadela Gelada, Instalação Cyberpunk e Templo do
Deserto — cada um com um cenário de referência de 960 × 832 e um tileset de
1536 × 1024.

Cada tileset dá ao atlas as mesmas peças que o da referência, com o nome do
tema na frente (`forest_floor0`, `volcano_wall_t`…): as lajotas do chão, os
tijolos, o pilar, a muralha de cima, de baixo e dos lados, o canto, o
ornamento da muralha de cima e de baixo e o dos lados. De onde sai cada peça
está em `apps/web/scripts/themes.cjs`, caixa a caixa: os tilesets, gerados
por IA, não estão numa grade exata de 64 px (as lajotas medem de 63 a 78 px,
as fileiras têm alturas diferentes, e em três deles as peças encostam numa
chapa contínua, sem alfa entre elas), então cada peça foi medida — pela
grade regular das fileiras de chão, pelos componentes opacos onde há alfa,
pelas juntas onde não há — e levada aos 64 × 64 px de arte da célula.

Qual lajota e qual tijolo vai em cada célula é lido do cenário de referência
de cada tema, como o Jardim foi lido do dele (`apps/web/src/art/themes.ts`):
a grade do cenário foi medida, e o miolo de cada célula comparado com cada
peça do tileset. O que é bloco (tijolo) e o que é chão no tileset vulcânico
sai do bisel: o bloco tem a borda de cima clara e a de baixo escura, a laje
plana — com ou sem fendas de lava — não. Uma arena lê o miolo da tabela,
centrado; uma arena maior que a tabela dá a volta nela.

A muralha também foi lida do cenário (`WALLS` em `scripts/themes.cjs`): uma
peça lisa por célula, ornamentos em séries — cada uma com o passo, a folga
do canto, as peças que se alternam a partir do centro e a peça do meio (o
portão gelado, a torre vulcânica, a porta cyberpunk, o medalhão do
deserto). Nenhum tileset tem a muralha dos lados de pé: nos cenários ela é
a de cima deitada, com a face de fora para fora, e assim é recortada. A de
baixo é a de cima, de pé, em quatro temas, e espelhada no cyberpunk, em que
a borda de aço fica para fora dos dois lados.

O host escolhe o tema na sala de espera, na fileira acima do tamanho; a
sala confere que existe e espelha para todos (`themeId`), e só no lobby —
no meio da rodada é recusado. A escolha fica guardada no navegador e a
próxima sala abre com ela. No `/mock`, `?theme=frozen` escolhe o tema pela
URL. Um tema que a tela não conhece desenha como a referência.

### As arenas

São nove plantas, em `packages/shared/src/arenas.ts`, desenhadas à mão em
texto (`#` muralha, `P` pilar, `B` tijolo, `.` chão, `1234` onde cada um
nasce), três por tamanho:

| Tamanho | Células | Plantas |
|---|---|---|
| Pequena | 11 × 11 | Clássica, Praça (meio aberto), Labirinto (anel e cruz) |
| Média | 15 × 13 | Grade, Salas (quatro salas e um corredor), Encruzilhada (uma cruz, um desenho por canto) |
| Grande | 27 × 17 | Jardim (a referência), Muralhas (seis regiões com passagens), Clareiras (sebes com passagens) |

A grande é 27 × 17, e não 19 × 17, para a arena da referência continuar
sendo uma das plantas. Os quatro nascem nos cantos na ordem das cores (P1 em
cima à esquerda, P2 embaixo à direita, P3 em cima à direita, P4 embaixo à
esquerda), para os dois primeiros ficarem em cantos opostos. `defineArena`
confere a forma de cada planta ao carregar; `validateArena` (que os testes
rodam em todas) confere o jogo: muralha inteira, cada canto no seu quadrante
com saída, toda célula alcançável derrubando tijolos.

O host escolhe na sala de espera o tema e, abaixo de um separador, o
tamanho. A planta não se escolhe: a sala sorteia uma das três do tamanho
quando o host troca de tamanho e de novo a cada rodada, e espelha para todos
(`arenaId`, `cols`, `rows`, `grid`). Ninguém desenha uma arena que não veio
do servidor. A miniatura é o tema no tamanho escolhido, só a muralha e os
quatro nos cantos, desenhada pelo mesmo `ArenaRenderer` da partida — a
planta é surpresa.

Abra `/mock` para jogar sozinho, sem servidor: o mesmo `BombGame` roda no
navegador, com o `requestAnimationFrame` de relógio e o tempo da rodada
congelado. Você é o vermelho; os outros três são bonecos parados nos cantos —
não andam, mas explodem. O sorteio dos itens é fixo, para a rodada nascer
igual toda vez. Antes da partida há a mesma escolha de arena da sala de
verdade, para olhar cada planta sem servidor; a escolhida vai para a URL
(`/mock?arena=small&theme=volcano`; uma planta na URL, `?arena=small-maze`,
joga só ela, para olhar de perto), e "sair" volta para a escolha.

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
    scripts/        build-atlas.cjs: recorta as referências e o tileset e monta o atlas
                    scenery.cjs: desenha em código o que o tileset não tem (a moita)
    src/art/        o atlas (imagem, mapa e acesso aos quadros) e o cenário lido da referência
    src/game/       conexão com a sala, o desenho da arena, o direcional
    src/components/ arena, painel, a escolha da arena (com as miniaturas), direcional na tela, conversa, ajustes
    src/screens/    home, sala, mock
packages/
  shared/           contract.ts (constantes, estado público, mensagens), arena.ts (a forma de uma planta e a conferência),
                    arenas.ts (as nove plantas) e game.ts (BombGame, a regra)
```

# Bombman

Bomberman multiplayer para até 4 pessoas, em pixel art. O servidor é
autoritativo: o cliente manda comandos numerados (a direção do dedo, passo a
passo) e prevê o próprio boneco com a mesma regra do servidor, que confirma ou
corrige; os outros são desenhados a partir do estado que volta (ver
[A rede](#a-rede)).

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
muralha e pilar; morrer leva o chute e a perfurante, só eles), 💀 uma maldição de quinze segundos (uma caveirinha paira sobre a cabeça enquanto dura) (uma sorteada entre dez: lento, rápido demais, invertido,
sem freio, fogo fraco, bombas sem parar, sem bomba, pavio curto, pavio longo
ou uma bomba só; toda maldição pega: quem encosta num amaldiçoado leva a
mesma, pelos quinze segundos inteiros), 🔄 a troca (você troca de lugar na
hora com um adversário sorteado), 👻 a invisibilidade (dez segundos em que
os outros só te veem num lampejo) e 📡 o controle remoto (as suas bombas
ganham antena e esperam: **B** ou **Shift** — no celular, o botão 📡 — detona
a mais antiga, que pisca 300 ms em todas as telas e só então explode; o aviso
cobre o ping de quase todo mundo, e ninguém morre de uma bomba que não viu
piscar. Esquecida, ela explode sozinha em 10 s; morrer leva o controle, e as
remotas que esperavam viram bombas comuns. Pavio curto, pavio longo e bombas
sem parar ganham do controle enquanto duram). A perfurante e o controle
remoto são tipos de bomba: vale o último que você pegou, e trocar o controle
pela perfurante transforma as remotas que esperavam em bombas comuns. Quem perde as três vidas sai; a última
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

A sala roda o motor em passos fixos de 60 Hz e manda patches a ~30 Hz; o
próprio boneco é previsto na tela e os outros são interpolados (ver
[A rede](#a-rede)). O que não é situação — o som de uma explosão, um emoji —
vai em mensagens `fx` e `emote`, fora do estado sincronizado.

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
em quatro quadros, e todos os seis da folha entram, a caveira, o chute e a
perfurante inclusive; a troca e a invisibilidade vêm de uma folha própria, a
21ª do comando (fundo já transparente, só se recorta a janela), e as duas
últimas são a bomba remota (com antena, nas fases da bomba comum) e o ícone do
controle remoto. A bomba
perfurante tem folha própria, a 15ª do comando: vermelha,
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
  cyberpunk_facility_tileset.png desert_temple_tileset.png bomb-social-items-sheet.png \
  bomb-remote-sheet.png bomb-remote-item-sheet.png
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

## A rede

Os jogadores estão quase todos no Brasil e o servidor, nos EUA: 120–200 ms de
ida e volta. A rede foi desenhada para que isso não apareça no próprio boneco
nem em tranco nos outros.

### O que causava o "anda e volta"

A versão anterior previa o boneco, mas sem número de comando:

1. A entrada era um **estado** ("direita apertada"), e o servidor andava de
   quando o "apertou" chegava até quando o "soltou" chegava. A variação da
   rede mudava essa duração, e cada parada terminava numa correção para trás.
2. A reconciliação comparava o servidor com onde a tela tinha o boneco "uma ida
   e volta atrás" — um palpite de tempo. Com a variação do RTT e a fase do
   patch (0–33 ms, 0,1–0,2 célula), havia uma "diferença" quase a cada patch.
3. A tela andava em passos do quadro e o servidor em fatias de até 50 ms; o
   andar em trilhos (deslize para o corredor, corte de quina, encosto na
   parede) depende do caminho, então o mesmo tempo dava posições diferentes.
4. A posição ia arredondada em 0,01 célula: a tela nunca batia exatamente.

### Como funciona agora

```
tela                                         servidor (autoritativo)
────                                         ───────────────────────
teclado/toque ─► direção segurada
passo fixo 60 Hz (relógio da tela, não do quadro)
  └─ comando {seq, dx, dy, bomba} ─► lote ─────► fila do jogador (InputQueue)
  └─ previsão: aplica já (moveOnRails)            passo fixo 60 Hz: 1 comando/passo
     guarda o resultado de cada seq                (crédito: no máx. +1 para alcançar)
                                                  bomba no comando: célula daquele passo
estado (patch ~30 Hz) ◄────────── x, y float64, seq = último aplicado, tick
  └─ descarta seq ≤ confirmado
  └─ volta à posição do servidor, reaplica o resto em ordem
  └─ diferença → offset do desenho (meia-vida 60 ms); > 1,5 célula: pula e conta
outros bonecos: amostras carimbadas pelo tick do servidor,
  desenhados em agora − menor atraso − atraso adaptativo (≥ 50 ms)
```

- **Passo fixo e regra única.** `TICK_MS` (60 Hz) é parte do protocolo
  (`packages/shared/src/net.ts`). O motor anda por `commandDistance` a cada
  comando, a tela também, e as duas perguntam "esta célula fecha?" pela mesma
  função (`cellBlocked`). A mesma sequência de comandos dá o mesmo resultado,
  bit a bit (há teste).
- **Comandos, não estados.** Parado não gera comando. Os comandos vão em lotes
  `{seq, runs: [[código, quantos]]}` a cada dois passos, ou na hora em que a
  direção muda ou sai uma bomba (~30 mensagens/s andando, nenhuma parado).
- **O servidor confere tudo** (`decodeBatch`): inteiro, faixa, tamanho,
  bomba sempre isolada; lote fora do formato cai inteiro e é contado. Repetido
  (`seq` já visto) cai. Cada passo do motor dá um crédito e cada comando gasta
  um — o boneco nunca anda mais do que o relógio permite (no máximo
  `INPUT_CREDIT_MAX` passos à frente), por mais comandos que cheguem. A fila
  tem teto (`INPUT_QUEUE_MAX`), e morto, fora da rodada ou desconectado, os
  comandos são confirmados e jogados fora.
- **Bomba no comando.** A bomba é posta na célula em que o boneco está naquele
  comando — a mesma que a tela mostrou. A tela mostra uma bomba provisória e
  toca o som na hora, só se o servidor deve aceitar; ela é trocada pela de
  verdade (o pavio continua) ou some, quando o comando é confirmado.
  Reaplicar comandos nunca cria bomba nem som. Detonação, chama, dano, morte e
  fim de rodada são só do servidor.
- **Os outros** são interpolados na linha do tempo do servidor (`state.tick`
  muda só quando alguma posição muda), não na hora de chegada: um patch
  atrasado não acelera nem freia ninguém. O atraso se ajusta à variação medida
  (`intervalo + 2 × jitter`, entre 50 e 200 ms).
- **O relógio da sala** (`ArenaRoom.advance`) transforma o tempo real em
  passos fixos e, depois de um engasgo, recupera no máximo
  `MAX_CATCHUP_TICKS`; o resto é jogado fora e contado. O patch sai no seu
  próprio intervalo (`PATCH_MS`), independente do passo.

O Colyseus 0.17 instalado não tem previsão nem reconciliação próprias; usa-se
o que ele tem: `setSimulationInterval`, `patchRate`, `maxMessagesPerSecond`,
o `room.ping()` do SDK e o estado `Schema` (só com o que muda; idle não manda
nada).

### Configuração

Servidor (variáveis de ambiente; fora da faixa, vale o padrão com aviso no log):

| variável | padrão | faixa | o quê |
|---|---|---|---|
| `PATCH_MS` | 33 | 16–200 | de quanto em quanto o estado sai |
| `MAX_CATCHUP_TICKS` | 6 | 1–60 | passos recuperados de uma vez depois de um engasgo |
| `INPUT_QUEUE_MAX` | 60 | 8–600 | comandos guardados por jogador |
| `INPUT_CREDIT_MAX` | 8 | 1–60 | passos que um jogador pode alcançar depois de um atraso |
| `MAX_MESSAGES_PER_SECOND` | 120 | 30–10000 | acima disso a conexão cai |
| `NET_LOG_SECONDS` | 0 | 0–3600 | log JSON do relógio da sala a cada N s (0 desliga) |
| `STALL_WARN_MS` | 100 | 20–10000 | passo mais lento que isso vira aviso (1 a cada 10 s por sala) |

Tela (no build, `VITE_*`; ou na URL, `?interp=80`, ou em
`localStorage["bomb.net.interp"]`, para testar sem build novo):

| URL | build | padrão | o quê |
|---|---|---|---|
| `interp` | `VITE_INTERP_MS` | 0 (adaptativo) | atraso fixo da interpolação dos outros, ms |
| `interpMin` / `interpMax` | `VITE_INTERP_MIN_MS` / `VITE_INTERP_MAX_MS` | 50 / 200 | limites do atraso adaptativo |
| `correct` | `VITE_CORRECTION_MS` | 60 | meia-vida da correção visual do próprio boneco |
| `pending` | `VITE_MAX_PENDING` | 120 | comandos não confirmados guardados (2 s) |
| `catchup` | `VITE_MAX_CATCHUP` | 8 | passos que um quadro lento pode rodar |
| `net` | `VITE_NET_DIAG` | 0 | `1` abre o diagnóstico ao carregar |

### Diagnóstico

O interruptor **Painel de rede**, nos ajustes da arena, abre e fecha o painel de rede (atalho: a tecla à esquerda do 1, `'` no ABNT, `` ` `` no americano) (fechado por padrão, também em
produção; a escolha fica guardada). Ele mostra RTT e variação (ping nativo),
jitter e idade do estado, o atraso de interpolação em uso, comandos pendentes,
tempo de confirmação, reconciliações, correções (contagem, média, máxima),
previsões erradas e correções grandes, quadros por segundo, e — pedido ao
servidor só enquanto aberto — passos por segundo, custo do passo, atraso do
relógio, tempo perdido em engasgo e a fila de entrada desta tela no servidor.

No servidor, `NET_LOG_SECONDS=60` escreve uma linha JSON por sala por minuto
(`msg: "room net"`); engasgos acima de `STALL_WARN_MS` viram `msg: "room
stall"`. Nada é logado por comando.

### Simulação de rede

`apps/web/scripts/netsim.ts` sobe o build do servidor num processo à parte e
põe robôs para jogar com o SDK de verdade e com a mesma previsão, relógio e
interpolação da tela. A rede é moldada no próprio processo: cada mensagem, nos
dois sentidos, espera meia ida e volta mais uma variação, em ordem (TCP); de
vez em quando uma fica presa (perda + retransmissão). O engasgo do servidor é
um `SIGSTOP`/`SIGCONT` no processo dele.

```bash
pnpm --filter server build
apps/server/node_modules/.bin/tsx apps/web/scripts/netsim.ts                 # todos os cenários, 20 s cada
apps/server/node_modules/.bin/tsx apps/web/scripts/netsim.ts rtt150 rtt200 --seconds=30 --json=out.json
apps/server/node_modules/.bin/tsx apps/web/scripts/netsim.ts rtt150-jitter60 --no-bombs   # mundo parado: toda correção seria erro
```

Uma rodada em 11/10/2026 (WSL2, 4 robôs por sala, 20 s por cenário, bombas a
cada 2–5 s, direção nova a cada 0,3–1,2 s):

| cenário | correções/robô/min | correção máx (células) | grandes | confirmação | bombas cmd/eventos, duplicadas | saltos visíveis dos outros | ↓ KB/s | passo do servidor (méd/máx) |
|---|---|---|---|---|---|---|---|---|
| 50 ms ±5 | 0 | 0 | 0 | 88 ms | 19/16, 0 | 0 / 2308 quadros | 1,56 | 0,15 / 0,64 ms |
| 100 ms ±10 | 0 | 0 | 0 | 142 ms | 18/15, 0 | 0 / 2344 | 1,50 | 0,13 / 0,45 ms |
| 150 ms ±20 | 0 | 0 | 0 | 204 ms | 19/17, 0 | 0 / 2273 | 1,55 | 0,13 / 0,55 ms |
| 200 ms ±30 | 1,5 | 0,29 | 0 | 264 ms | 20/18, 0 | 0 / 2376 | 1,69 | 0,17 / 1,45 ms |
| 150 ms, patch 50 ms | 0,8 | 0,02 | 0 | 206 ms | 19/16, 0 | 0 / 2415 | 1,21 | 0,14 / 0,52 ms |
| 150 ms ±60 | 0,8 | 0,02 | 0 | 249 ms | 18/15, 0 | 0 / 2302 | 1,46 | 0,17 / 0,52 ms |
| 150 ms, 2% presas +250 ms | 0,8 | 0,22 | 0 | 331 ms | 18/15, 0 | 2 / 2212 | 1,47 | 0,14 / 0,58 ms |
| 150 ms, servidor para 300 ms a cada 4 s | 0 | 0 | 0 | 287 ms | 20/17, 0 | 4 / 2383 | 1,54 | 0,14 / 0,45 ms (817 ms perdidos) |
| 150 ms, 8 salas (32 robôs) | 0,2 | 0,13 | 0 | 204 ms | 166/138, 0 | 0 / 20479 | 1,63 | 0,12 / 0,54 ms |

As correções que sobram vêm de o mundo mudar entre a previsão e o servidor
(a bomba de outro jogador que a tela ainda não via, um tijolo que caiu, um
item de velocidade) — com `--no-bombs` elas vão a zero mesmo com ±60 ms e
picos de 250 ms. Bombas: menos eventos que comandos porque o servidor recusa
a bomba sem bomba na mão; nenhum robô teve mais eventos que comandos. Patch a
50 ms gasta 22% menos banda que a 33 ms, com o atraso dos outros ~5 ms maior;
a banda é pequena dos dois jeitos, e o padrão ficou 33 ms. Os "saltos" dos
outros só aparecem com o servidor parado ou mensagens presas por 250 ms —
mais que o atraso de interpolação.

### Implantação

O protocolo mudou nos dois lados (o lote de comandos, `seq`/`tick`/`passers`
no estado): **servidor e tela sobem juntos**. Uma tela antiga contra o
servidor novo manda `{dx, dy}`, que é recusado (o boneco não anda); recarregar
resolve.

```bash
pnpm build
pnpm --filter server start      # PATCH_MS, NET_LOG_SECONDS… no ambiente, se quiser mudar
```

### Medir antes e depois, e EUA × São Paulo

Mudar o servidor de região tira RTT, mas não conserta previsão: com esta
rede, a tela já anda na hora em qualquer RTT, e o que a região muda é o quanto
os outros e as bombas chegam atrasados (confirmação ≈ RTT + 50 ms na tabela
acima). Uma partida tem um servidor só; não há duas autoridades.

Para comparar:

1. Suba o mesmo build em duas regiões (a atual, nos EUA, e uma em São Paulo,
   ex.: `gru`/`sa-east-1`), com `NET_LOG_SECONDS=60`.
2. Do Brasil, abra uma sala em cada uma (`VITE_SERVER_URL` diferente, ou dois
   builds) e jogue alguns minutos com o painel de rede aberto (tecla à esquerda do 1). Anote RTT e variação,
   confirmação, correções/min e máxima, idade do estado e o atraso de
   interpolação adaptado.
3. No servidor, compare `hz`, `tickAvg`/`tickMax`, `lateMax` e `droppedMs`
   das linhas `room net` (a região não deve mudar isso; uma máquina menor sim).
4. Para isolar a rede da máquina, rode o `netsim` com o RTT medido em cada
   região (`rtt` e `jitter` do cenário) e compare com a tabela acima.

### Limites conhecidos

- Chutar uma bomba não é previsto: o boneco para nela até o servidor mostrar a
  bomba deslizando (uma ida e volta), e então segue.
- Item de velocidade e maldição só valem na previsão quando o estado chega:
  os passos entre pegar e saber viram uma correção (pequena; no invertido,
  pegando a caveira em velocidade, pode chegar a uma ida e volta de passos).
- A bomba de outro jogador no caminho só existe na tela quando chega: o boneco
  previsto passa um pouco por ela e é corrigido (fica contado).
- A interpolação dos outros não extrapola: um buraco maior que o atraso (o
  servidor parado, um pacote retransmitido) para o boneco até chegar a amostra.
- O passo de 60 Hz é fixo no protocolo; 30 Hz não foi necessário — o passo
  inteiro custa ~0,15 ms por sala.

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
    src/rooms/      ArenaRoom (passo fixo, entrada, diagnóstico), ArenaState, tickStats
    src/config.ts   as variáveis de rede, conferidas
  web/
    scripts/        build-atlas.cjs: recorta as referências e o tileset e monta o atlas
                    scenery.cjs: desenha em código o que o tileset não tem (a moita)
    src/art/        o atlas (imagem, mapa e acesso aos quadros) e o cenário lido da referência
    scripts/        netsim.ts: servidor de verdade + robôs com rede moldada (RTT, variação, perda, engasgo)
    src/game/       conexão com a sala, a previsão (predict, local), o relógio e a interpolação dos outros
                    (netclock, interp), o desenho da arena, o direcional
    src/components/ arena, painel, a escolha da arena (com as miniaturas), direcional na tela, conversa, ajustes
    src/screens/    home, sala, mock
packages/
  shared/           contract.ts (constantes, estado público, mensagens), arena.ts (a forma de uma planta e a conferência),
                    arenas.ts (as nove plantas), game.ts (BombGame, a regra) e net.ts (o passo fixo,
                    o lote de comandos, a fila do servidor, a parede comum)
```

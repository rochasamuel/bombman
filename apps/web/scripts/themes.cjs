/*
 * Os cinco temas novos (11 de outubro): de onde sai cada peça de cada tileset.
 *
 * Os tilesets são gerados por IA e, como o da referência, NÃO estão numa grade
 * exata de 64 px: as lajotas medem de 63 a 78 px, as fileiras têm alturas
 * diferentes e em três deles (vulcânico, gelado, cyberpunk) as peças encostam
 * numa chapa contínua, sem alfa entre elas. Por isso cada peça é recortada por
 * uma caixa medida — pela grade regular das fileiras de chão, pelos componentes
 * opacos onde há alfa, ou pelas juntas onde não há — e só então levada aos
 * 64×64 px de arte da célula (ver `cutTheme`). As medidas foram conferidas
 * reconstruindo cada cenário de referência célula a célula com as peças
 * recortadas, lado a lado com a imagem original.
 *
 * Cada tema dá ao atlas as mesmas peças que a referência: as lajotas do chão,
 * os tijolos, o pilar, a muralha (de cima, de baixo e dos lados), o canto, o
 * ornamento que se repete na muralha de cima e de baixo ("merlon") e o dos
 * lados ("cap"). A tela desenha todo tema com o mesmo desenhista.
 */

/** Uma caixa no tileset: [x, y, largura, altura], em pixels da imagem. */
const THEMES = {
  /** A muralha de pedra com hera: as peças têm alfa entre si, e as caixas são as dos componentes opacos. O chão são duas fileiras de 21 lajotas de ~73 px; os tijolos, 41 blocos de terra; o pilar, o bloco quadrado de musgo sobre raízes (o primeiro da fileira). */
  forest: {
    file: "enchanted_forest_tileset.png",
    floors: [
      [5, 6, 73, 73], [78, 6, 72, 73], [150, 6, 73, 73], [223, 6, 73, 73],
      [296, 6, 72, 73], [368, 6, 73, 73], [441, 6, 73, 73], [514, 6, 72, 73],
      [586, 6, 73, 73], [659, 6, 73, 73], [732, 6, 72, 73], [804, 6, 73, 73],
      [877, 6, 73, 73], [950, 6, 72, 73], [1022, 6, 73, 73], [1095, 6, 73, 73],
      [1168, 6, 72, 73], [1240, 6, 73, 73], [1313, 6, 73, 73], [1386, 6, 72, 73],
      [1458, 6, 73, 73], [5, 79, 73, 72], [78, 79, 72, 72], [150, 79, 73, 72],
      [223, 79, 73, 72], [296, 79, 72, 72], [368, 79, 73, 72], [441, 79, 73, 72],
      [514, 79, 72, 72], [586, 79, 73, 72], [659, 79, 73, 72], [732, 79, 72, 72],
      [804, 79, 73, 72], [877, 79, 73, 72], [950, 79, 72, 72], [1022, 79, 73, 72],
      [1095, 79, 73, 72], [1168, 79, 72, 72], [1240, 79, 73, 72], [1313, 79, 73, 72],
      [1386, 79, 72, 72], [1458, 79, 73, 72],
    ],
    bricks: [
      [8, 470, 63, 66], [82, 470, 63, 66], [153, 471, 64, 65], [226, 471, 62, 65],
      [299, 470, 62, 66], [372, 471, 62, 65], [443, 471, 65, 65], [517, 471, 63, 65],
      [590, 471, 63, 65], [664, 471, 62, 65], [737, 471, 62, 65], [809, 471, 63, 65],
      [882, 471, 63, 65], [955, 471, 63, 65], [1029, 471, 63, 65], [1101, 471, 63, 65],
      [1175, 471, 62, 65], [1248, 471, 63, 65], [1320, 471, 63, 65], [1393, 470, 63, 66],
      [1466, 469, 62, 66], [8, 543, 63, 66], [81, 543, 62, 66], [153, 543, 63, 66],
      [226, 543, 62, 66], [299, 544, 62, 65], [372, 543, 62, 66], [445, 544, 63, 65],
      [518, 544, 62, 65], [591, 543, 62, 66], [664, 544, 62, 65], [737, 544, 62, 65],
      [810, 544, 61, 65], [882, 543, 62, 66], [956, 544, 62, 65], [1029, 543, 62, 66],
      [1102, 543, 62, 66], [1175, 543, 62, 66], [1248, 543, 63, 66], [1320, 543, 62, 66],
      [1393, 544, 63, 65],
    ],
    /** Os tijolos enchem a célula inteira; aqui ficam com a fresta de chão nos lados, como na referência. */
    brickFill: false,
    pillar: { box: [19, 388, 63, 77], size: [60, 73] },
  },
  /** A chapa contínua: tudo numa grade de 24 colunas a partir de x=6, a cada 63,5 px. As quatro fileiras de chão (y 4-70, 70-133, 436-500, 500-562) misturam lajotas e tijolos de lava; o que separa é a mediana de R-G (> 18 é tijolo). A muralha lisa é a célula 1 da fileira y 133-208 (a pedra começa em y 139: acima é chão); a torre de fenda vertical, a célula 4 (só os 44 px do meio, de y 139 a 201); o canto, a torre com a janela de quatro vidros (célula 10). O pilar é o bloco trapezoidal (y 370-434), opaco com o chão em volta. */
  volcano: {
    file: "volcanic_fortress_tileset.png",
    floors: [
      [6, 4, 64, 66], [70, 4, 63, 66], [133, 4, 64, 66], [197, 4, 63, 66],
      [260, 4, 64, 66], [387, 4, 64, 66], [451, 4, 63, 66], [514, 4, 64, 66],
      [578, 4, 63, 66], [641, 4, 64, 66], [705, 4, 63, 66], [768, 4, 64, 66],
      [895, 4, 64, 66], [959, 4, 63, 66], [1022, 4, 64, 66], [1149, 4, 64, 66],
      [1213, 4, 63, 66], [1276, 4, 64, 66], [1340, 4, 63, 66], [1403, 4, 64, 66],
      [1467, 4, 63, 66], [6, 70, 64, 63], [70, 70, 63, 63], [133, 70, 64, 63],
      [197, 70, 63, 63], [260, 70, 64, 63], [324, 70, 63, 63], [387, 70, 64, 63],
      [451, 70, 63, 63], [578, 70, 63, 63], [705, 70, 63, 63], [768, 70, 64, 63],
      [832, 70, 63, 63], [959, 70, 63, 63], [1086, 70, 63, 63], [1213, 70, 63, 63],
      [1340, 70, 63, 63], [1467, 70, 63, 63], [6, 436, 64, 64], [70, 436, 63, 64],
      [133, 436, 64, 64], [260, 436, 64, 64], [387, 436, 64, 64], [641, 436, 64, 64],
      [768, 436, 64, 64], [832, 436, 63, 64], [959, 436, 63, 64], [1149, 436, 64, 64],
      [1276, 436, 64, 64], [1403, 436, 64, 64], [70, 500, 63, 62], [260, 500, 64, 62],
      [514, 500, 64, 62], [705, 500, 63, 62], [895, 500, 64, 62], [1022, 500, 64, 62],
      [1213, 500, 63, 62], [1340, 500, 63, 62], [1467, 500, 63, 62],
    ],
    bricks: [
      [324, 4, 63, 66], [832, 4, 63, 66], [1086, 4, 63, 66], [514, 70, 64, 63],
      [641, 70, 64, 63], [895, 70, 64, 63], [1022, 70, 64, 63], [1149, 70, 64, 63],
      [1276, 70, 64, 63], [1403, 70, 64, 63], [197, 436, 63, 64], [324, 436, 63, 64],
      [451, 436, 63, 64], [514, 436, 64, 64], [578, 436, 63, 64], [705, 436, 63, 64],
      [895, 436, 64, 64], [1022, 436, 64, 64], [1086, 436, 63, 64], [1213, 436, 63, 64],
      [1340, 436, 63, 64], [1467, 436, 63, 64], [6, 500, 64, 62], [133, 500, 64, 62],
      [197, 500, 63, 62], [324, 500, 63, 62], [387, 500, 64, 62], [451, 500, 63, 62],
      [578, 500, 63, 62], [641, 500, 64, 62], [768, 500, 64, 62], [832, 500, 63, 62],
      [959, 500, 63, 62], [1086, 500, 63, 62], [1149, 500, 64, 62], [1276, 500, 64, 62],
      [1403, 500, 64, 62],
    ],
    /** Os tijolos enchem a célula inteira. */
    brickFill: true,
    pillar: { box: [6, 369, 64, 67], size: [64, 64] },
  },
  /** Grade de 24 colunas a partir de x=9, a cada 63,3 px. O chão são as duas fileiras de cima; os tijolos de gelo, as duas de baixo (y 426-563). A muralha é a célula 1 da fileira y 127-209, com as ameias cobertas de neve passando para cima (alfa); o estandarte (célula 3) é o ornamento de cima; o bloco com a gema (célula 0) é o canto e o ornamento dos lados; a muralha dos lados é a parede de blocos de neve (célula 0 da fileira y 209-276). O pilar é o bloco com a gema sobre o pedestal (y 356-426). */
  frozen: {
    file: "frozen_citadel_tileset.png",
    floors: [
      [9, 6, 63, 62], [72, 6, 64, 62], [136, 6, 63, 62], [199, 6, 63, 62],
      [262, 6, 64, 62], [326, 6, 63, 62], [389, 6, 63, 62], [452, 6, 63, 62],
      [515, 6, 64, 62], [579, 6, 63, 62], [642, 6, 63, 62], [705, 6, 64, 62],
      [769, 6, 63, 62], [832, 6, 63, 62], [895, 6, 64, 62], [959, 6, 63, 62],
      [1022, 6, 63, 62], [1085, 6, 63, 62], [1148, 6, 64, 62], [1212, 6, 63, 62],
      [1275, 6, 63, 62], [1338, 6, 64, 62], [1402, 6, 63, 62], [1465, 6, 63, 62],
      [9, 68, 63, 59], [72, 68, 64, 59], [136, 68, 63, 59], [199, 68, 63, 59],
      [262, 68, 64, 59], [326, 68, 63, 59], [389, 68, 63, 59], [452, 68, 63, 59],
      [515, 68, 64, 59], [579, 68, 63, 59], [642, 68, 63, 59], [705, 68, 64, 59],
      [769, 68, 63, 59], [832, 68, 63, 59], [895, 68, 64, 59], [959, 68, 63, 59],
      [1022, 68, 63, 59], [1085, 68, 63, 59], [1148, 68, 64, 59], [1212, 68, 63, 59],
      [1275, 68, 63, 59], [1338, 68, 64, 59], [1402, 68, 63, 59], [1465, 68, 63, 59],
    ],
    bricks: [
      [9, 426, 63, 72], [72, 426, 64, 72], [136, 426, 63, 72], [199, 426, 63, 72],
      [262, 426, 64, 72], [326, 426, 63, 72], [389, 426, 63, 72], [452, 426, 63, 72],
      [515, 426, 64, 72], [579, 426, 63, 72], [642, 426, 63, 72], [705, 426, 64, 72],
      [769, 426, 63, 72], [832, 426, 63, 72], [895, 426, 64, 72], [959, 426, 63, 72],
      [1022, 426, 63, 72], [1085, 426, 63, 72], [1148, 426, 64, 72], [1212, 426, 63, 72],
      [1275, 426, 63, 72], [1338, 426, 64, 72], [1402, 426, 63, 72], [1465, 426, 63, 72],
      [9, 498, 63, 65], [72, 498, 64, 65], [136, 498, 63, 65], [199, 498, 63, 65],
      [262, 498, 64, 65], [326, 498, 63, 65], [389, 498, 63, 65], [452, 498, 63, 65],
      [515, 498, 64, 65], [579, 498, 63, 65], [642, 498, 63, 65], [705, 498, 64, 65],
      [769, 498, 63, 65], [832, 498, 63, 65], [895, 498, 64, 65], [959, 498, 63, 65],
      [1022, 498, 63, 65], [1085, 498, 63, 65], [1148, 498, 64, 65], [1212, 498, 63, 65],
      [1275, 498, 63, 65], [1338, 498, 64, 65], [1402, 498, 63, 65], [1465, 498, 63, 65],
    ],
    /** Os tijolos enchem a célula inteira. */
    brickFill: true,
    pillar: { box: [9, 356, 63, 70], size: [60, 67] },
  },
  /** Grade de 24 colunas a partir de x=11, a cada 63,17 px. O chão são as duas fileiras de cima; os caixotes (os 38 claros, média de luminância > 90) estão nas fileiras y 453-580. A muralha é o painel com a borda de aço em cima (célula 1 da fileira y 144-215); o painel com a luz rosa (célula 9) é o ornamento; o bloco com o X (célula 0), o canto; a muralha dos lados é o painel com a borda de aço à esquerda (célula 5 da fileira y 215-285) e a luz ciano vertical (célula 1) é o ornamento dos lados. O pilar é a máquina alta (y 351-453), mais alta que a célula. */
  cyber: {
    file: "cyberpunk_facility_tileset.png",
    floors: [
      [11, 5, 63, 67], [74, 5, 63, 67], [137, 5, 64, 67], [201, 5, 63, 67],
      [264, 5, 63, 67], [327, 5, 63, 67], [390, 5, 63, 67], [453, 5, 63, 67],
      [516, 5, 64, 67], [580, 5, 63, 67], [643, 5, 63, 67], [706, 5, 63, 67],
      [769, 5, 63, 67], [832, 5, 63, 67], [895, 5, 64, 67], [959, 5, 63, 67],
      [1022, 5, 63, 67], [1085, 5, 63, 67], [1148, 5, 63, 67], [1211, 5, 63, 67],
      [1274, 5, 64, 67], [1338, 5, 63, 67], [1401, 5, 63, 67], [1464, 5, 63, 67],
      [11, 72, 63, 72], [74, 72, 63, 72], [137, 72, 64, 72], [201, 72, 63, 72],
      [264, 72, 63, 72], [327, 72, 63, 72], [390, 72, 63, 72], [453, 72, 63, 72],
      [516, 72, 64, 72], [580, 72, 63, 72], [643, 72, 63, 72], [706, 72, 63, 72],
      [769, 72, 63, 72], [832, 72, 63, 72], [895, 72, 64, 72], [959, 72, 63, 72],
      [1022, 72, 63, 72], [1085, 72, 63, 72], [1148, 72, 63, 72], [1211, 72, 63, 72],
      [1274, 72, 64, 72], [1338, 72, 63, 72], [1401, 72, 63, 72], [1464, 72, 63, 72],
    ],
    bricks: [
      [11, 453, 63, 66], [74, 453, 63, 66], [201, 453, 63, 66], [264, 453, 63, 66],
      [390, 453, 63, 66], [453, 453, 63, 66], [516, 453, 64, 66], [580, 453, 63, 66],
      [643, 453, 63, 66], [832, 453, 63, 66], [895, 453, 64, 66], [959, 453, 63, 66],
      [1085, 453, 63, 66], [1148, 453, 63, 66], [1211, 453, 63, 66], [1274, 453, 64, 66],
      [1338, 453, 63, 66], [1464, 453, 63, 66], [11, 519, 63, 61], [74, 519, 63, 61],
      [137, 519, 64, 61], [201, 519, 63, 61], [327, 519, 63, 61], [453, 519, 63, 61],
      [516, 519, 64, 61], [580, 519, 63, 61], [643, 519, 63, 61], [706, 519, 63, 61],
      [769, 519, 63, 61], [832, 519, 63, 61], [895, 519, 64, 61], [959, 519, 63, 61],
      [1022, 519, 63, 61], [1148, 519, 63, 61], [1211, 519, 63, 61], [1274, 519, 64, 61],
      [1401, 519, 63, 61], [1464, 519, 63, 61],
    ],
    /** Os tijolos enchem a célula inteira. */
    brickFill: true,
    pillar: { box: [11, 351, 63, 102], size: [60, 97] },
  },
  /** O chão são duas fileiras de 19 lajotas de ~77,5 px a partir de x=9; os tijolos de barro, os componentes opacos de y 496-658 (38). Na fileira da muralha (y 164-241) as peças encostam, e as caixas foram medidas pelas juntas: o bloco liso de arenito em x 519-576, o medalhão alado curto em x 359-451, o bloco com o sol em x 10-85 (o canto e o ornamento dos lados). O pilar é o bloco do sol sobre o pedestal (y 391-495), mais alto que a célula. */
  desert: {
    file: "desert_temple_tileset.png",
    floors: [
      [9, 4, 78, 77], [87, 4, 77, 77], [164, 4, 78, 77], [242, 4, 77, 77],
      [319, 4, 78, 77], [397, 4, 77, 77], [474, 4, 78, 77], [552, 4, 77, 77],
      [629, 4, 78, 77], [707, 4, 77, 77], [784, 4, 78, 77], [862, 4, 77, 77],
      [939, 4, 78, 77], [1017, 4, 77, 77], [1094, 4, 78, 77], [1172, 4, 77, 77],
      [1249, 4, 78, 77], [1327, 4, 78, 77], [1405, 4, 77, 77], [9, 81, 78, 79],
      [87, 81, 77, 79], [164, 81, 78, 79], [242, 81, 77, 79], [319, 81, 78, 79],
      [397, 81, 77, 79], [474, 81, 78, 79], [552, 81, 77, 79], [629, 81, 78, 79],
      [707, 81, 77, 79], [784, 81, 78, 79], [862, 81, 77, 79], [939, 81, 78, 79],
      [1017, 81, 77, 79], [1094, 81, 78, 79], [1172, 81, 77, 79], [1249, 81, 78, 79],
      [1327, 81, 78, 79], [1405, 81, 77, 79],
    ],
    bricks: [
      [9, 498, 73, 78], [88, 498, 73, 78], [166, 498, 73, 78], [244, 498, 74, 78],
      [320, 498, 75, 78], [398, 498, 73, 78], [475, 498, 74, 78], [553, 498, 74, 78],
      [630, 498, 74, 78], [708, 498, 74, 78], [787, 498, 76, 78], [865, 498, 74, 78],
      [947, 498, 73, 78], [1024, 498, 74, 78], [1100, 498, 74, 78], [1178, 498, 74, 78],
      [1255, 498, 75, 78], [1333, 498, 74, 78], [1411, 498, 73, 78], [9, 577, 73, 78],
      [88, 577, 73, 78], [166, 577, 73, 78], [244, 577, 73, 78], [320, 577, 74, 78],
      [398, 578, 73, 77], [475, 577, 73, 78], [553, 577, 74, 78], [630, 578, 74, 77],
      [708, 577, 74, 78], [788, 578, 75, 77], [865, 577, 74, 78], [947, 577, 73, 78],
      [1024, 577, 74, 78], [1099, 577, 74, 78], [1178, 577, 74, 78], [1255, 577, 74, 78],
      [1333, 577, 74, 78], [1411, 577, 73, 78],
    ],
    /** Os tijolos enchem a célula inteira. */
    brickFill: true,
    pillar: { box: [12, 391, 76, 104], size: [60, 82] },
  },
};


/*
 * As muralhas, lidas do cenário de cada tema. Em todos, a muralha é uma
 * peça lisa repetida célula a célula, com ornamentos a cada tantas células
 * (como os merlões da referência: `crenellation`) e, no meio, uma peça
 * central (o portão, a torre). Cada série de ornamentos tem o passo, a
 * folga mínima do canto, as peças que se alternam a partir do centro
 * (`pieces[0]` nas posições mais perto do centro, depois `pieces[1]`…) e a
 * peça do centro, se houver. Os lados têm a sua própria peça lisa e as suas
 * séries; a direita é o espelho da esquerda, como nos cenários. Nenhum
 * tileset tem a muralha dos lados de pé: nos cenários ela é a de cima
 * deitada, com a face de fora para fora (`plain: "rotate"`, e `rotate: true`
 * numa série gira as peças dela do mesmo jeito; `centerRotate: false` deixa
 * a do meio de pé, como no cenário). A muralha de
 * baixo é a de cima ("same": o ornamento na mesma posição, como na floresta,
 * no vulcânico, no gelado e no deserto, onde as ameias e as torres continuam
 * de pé) ou espelhada na vertical ("mirror": a cyberpunk, em que a borda de
 * aço fica para fora dos dois lados).
 *
 * `size` é o tamanho da peça no atlas, em pixels de arte (64 por célula);
 * `height` da muralha lisa pode passar de 64: o que passa sobe para a margem.
 */
const WALLS = {
  forest: {
    corner: { box: [817, 303, 68, 76], size: [64, 72] },
    top: { plain: { box: [79, 157, 69, 67], height: 64 }, series: [{ pieces: [[817, 303, 68, 76]], size: [64, 72], pitch: 5, margin: 2 }] },
    bottom: "same",
    side: { plain: "rotate", series: [{ pieces: [[817, 303, 68, 76]], size: [64, 72], pitch: 4.2, margin: 2 }] },
  },
  volcano: {
    /* O canto é a torre da janela de quatro vidros; em cima, a fenda pequena e o "sorriso" de lava se alternam a cada 2 células, com a torre da fenda vertical no meio; nos lados, a mesma muralha deitada: as fendas viram barras e a torre do meio, a barra de lava. */
    corner: { box: [641, 133, 64, 75], size: [64, 70] },
    top: {
      plain: { box: [198, 133, 63, 75], height: 64 },
      series: [{ pieces: [[1060, 133, 55, 75], [512, 133, 95, 75], [512, 133, 95, 75], [1060, 133, 55, 75]], size: [[50, 68], [86, 68], [86, 68], [50, 68]], center: [261, 133, 55, 75], centerSize: [50, 70], pitch: 2, margin: 1.4 }],
    },
    bottom: "same",
    side: {
      plain: "rotate",
      series: [{ rotate: true, pieces: [[1060, 133, 55, 75], [512, 133, 95, 75]], size: [[50, 64], [86, 64]], center: [261, 133, 55, 75], centerSize: [50, 64], centerRotate: false, pitch: 2, margin: 1.4 }],
    },
  },
  frozen: {
    /* O canto é o bloco da gema; a muralha lisa tem uma ameia de neve por célula; os estandartes a cada 2,6 células e o portão no meio; nos lados, a mesma muralha deitada, só com o portão (deitado) no meio. */
    corner: { box: [8, 127, 60, 82], size: [64, 84] },
    top: { plain: { box: [258, 127, 65, 82], height: 84 }, series: [{ pieces: [[323, 127, 62, 82]], size: [64, 84], center: [713, 127, 76, 82], centerSize: [78, 84], pitch: 2.6, margin: 2 }] },
    bottom: "same",
    side: { plain: "rotate", series: [{ rotate: true, pieces: [], center: [713, 127, 76, 82], centerSize: [56, 72], centerRotate: false, pitch: 1, margin: 2 }] },
  },
  cyber: {
    /* O canto é a placa do X; em cima, luzes ciano e rosa se alternam a cada 2,2 células (ciano perto do meio, rosa longe), com a porta de duas luzes no meio; a borda de aço fica para fora: a de baixo é a de cima espelhada; nos lados, a mesma muralha deitada. */
    corner: { box: [11, 144, 63, 71], size: [64, 64] },
    top: { plain: { box: [144, 144, 62, 71], height: 64 }, series: [{ pieces: [[206, 144, 65, 71], [206, 144, 65, 71], [588, 144, 62, 71]], size: [64, 64], center: [271, 144, 63, 71], centerSize: [64, 64], pitch: 2.2, margin: 1.6 }] },
    bottom: "mirror",
    side: { plain: "rotate", series: [{ rotate: true, pieces: [[206, 144, 65, 71], [588, 144, 62, 71]], size: [64, 64], center: [271, 144, 63, 71], centerSize: [64, 64], pitch: 2.2, margin: 1.6 }] },
  },
  desert: {
    /* O canto é o bloco do sol; em cima, o medalhão alado largo (2,2 células) a cada 5,6 células, o do meio inclusive, e o pilar alto de relevo pequeno entre eles; nos lados, o painel entalhado a cada 3,4 células e o bloco do sol no meio. */
    corner: { box: [10, 164, 75, 77], size: [66, 68] },
    top: {
      plain: { box: [519, 164, 57, 77], height: 64 },
      series: [
        { pieces: [[132, 164, 170, 77]], size: [140, 64], pitch: 5.6, margin: 2 },
        { pieces: [[302, 164, 57, 77]], size: [50, 68], pitch: 8, margin: 4, skipCenter: true },
      ],
    },
    bottom: "same",
    side: { plain: "rotate", series: [{ pieces: [[19, 242, 68, 147]], size: [56, 112], center: [451, 164, 68, 77], centerSize: [56, 60], pitch: 3.4, margin: 1.6 }] },
  },
};

/**
 * Recorta as peças de um tema. `h` são as utilidades do `build-atlas.cjs`
 * (crop, resize, fit, place, mirror, rotate, blank, paste); `TILE` é a célula
 * em pixels de arte (64). Devolve um mapa nome → imagem, já com o prefixo do
 * tema (`forest_floor0`, `forest_wall_t`…), e quantas lajotas e tijolos há.
 */
function cutTheme(id, tileset, h) {
  const spec = THEMES[id];
  const TILE = h.TILE;
  /* O que é opaco vem com alfa ~250 (um véu na imagem inteira): sobe para 255; o resto fica como está. */
  const img = h.crop(tileset, 0, 0, tileset.width, tileset.height);
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= 200 ? 255 : Math.round((img.data[i] * 255) / 200);
  const piece = ([x, y, w, hh]) => h.crop(img, x, y, w, hh);
  const opaque = (im) => { for (let i = 3; i < im.data.length; i += 4) im.data[i] = 255; return im; };
  const flipV = (im) => h.rotate(h.rotate(h.mirror(im)));
  const frames = new Map();
  const add = (name, im) => frames.set(`${id}_${name}`, im);

  spec.floors.forEach((box, i) => add(`floor${i}`, opaque(h.resize(piece(box), TILE, TILE))));
  spec.bricks.forEach((box, i) =>
    add(`brick${i}`, spec.brickFill ? opaque(h.resize(piece(box), TILE, TILE)) : h.place(h.fit(piece(box), 60, TILE), TILE, TILE, true)),
  );
  const [pw, ph] = spec.pillar.size;
  add("pillar", h.place(h.resize(piece(spec.pillar.box), pw, ph), TILE, Math.max(TILE, ph), true));

  /* A muralha: a peça lisa de cada lado, o canto e as séries de ornamentos (ver `WALLS`). */
  const W = WALLS[id];
  const sized = (box, [w, hh]) => h.resize(piece(box), w, hh);
  const wallTop = opaque(h.resize(piece(W.top.plain.box), TILE, W.top.plain.height));
  add("wall_t", wallTop);
  add("wall_b", W.bottom === "mirror" ? flipV(wallTop) : wallTop);
  const rotCCW = (im) => h.rotate(h.rotate(h.rotate(im)));
  const wallLeft =
    W.side.plain === "same"
      ? opaque(h.resize(piece(W.top.plain.box), TILE, TILE))
      : W.side.plain === "rotate"
        ? opaque(h.resize(rotCCW(h.resize(piece(W.top.plain.box), TILE, W.top.plain.height)), TILE, TILE))
        : opaque(h.resize(piece(W.side.plain.box), TILE, TILE));
  add("wall_l", wallLeft);
  add("wall_r", h.mirror(wallLeft));
  add("corner", sized(W.corner.box, W.corner.size));
  const meta = { bottom: W.bottom, top: [], side: [] };
  W.top.series.forEach((series, s) => {
    series.pieces.forEach((box, k) => {
      const im = sized(box, Array.isArray(series.size[0]) ? series.size[k] : series.size);
      add(`orn_t${s}_${k}`, im);
      add(`orn_b${s}_${k}`, W.bottom === "mirror" ? flipV(im) : im);
    });
    if (series.center) {
      const im = sized(series.center, series.centerSize);
      add(`orn_t${s}_c`, im);
      add(`orn_b${s}_c`, W.bottom === "mirror" ? flipV(im) : im);
    }
    meta.top.push({ pitch: series.pitch, margin: series.margin, pieces: series.pieces.length, center: !!series.center, skipCenter: !!series.skipCenter });
  });
  W.side.series.forEach((series, s) => {
    const turn = (im) => (series.rotate ? rotCCW(im) : im);
    series.pieces.forEach((box, k) => {
      const im = turn(sized(box, Array.isArray(series.size[0]) ? series.size[k] : series.size));
      add(`orn_l${s}_${k}`, im);
      add(`orn_r${s}_${k}`, h.mirror(im));
    });
    if (series.center) {
      // A peça do meio fica de pé quando no cenário ela está de pé (a torre vulcânica, o portão gelado).
      const im = series.centerRotate === false ? sized(series.center, series.centerSize) : turn(sized(series.center, series.centerSize));
      add(`orn_l${s}_c`, im);
      add(`orn_r${s}_c`, h.mirror(im));
    }
    meta.side.push({ pitch: series.pitch, margin: series.margin, pieces: series.pieces.length, center: !!series.center, skipCenter: !!series.skipCenter });
  });
  return { frames, variants: { floor: spec.floors.length, brick: spec.bricks.length }, walls: meta };
}

module.exports = { THEMES, WALLS, cutTheme };

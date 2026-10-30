# TatuVR

Tatu no Labirinto: fliperama de labirinto em VR para o Meta Quest 3 no navegador (WebXR), sem
instalar nada. Jogo original do gênero "labirinto de perseguição": o labirinto é uma maquete de
brinquedo em cima de uma mesa à sua frente. Com o manche você leva o tatu pelos corredores comendo
frutinhas; onças caçam o tatu, cada uma de um jeito. A mecânica que só existe no VR: você **pega
pedras com a mão** numa bandeja na beira da mesa e põe nos corredores para bloquear as onças (o
tatu cava por baixo). Pequi dourado faz o tatu virar bola e derrubar as onças. 12 fases em 3
mundos (Cerrado, Pantanal, Caatinga à noite), a 4ª de cada mundo é um chefe. Modo fliperama (12
fases seguidas com 3 vidas, placar e recordes com 3 letras) e modo de fases (estrelas). Também
joga no PC. Tudo em português.

## Como rodar / jogar

**No Quest:** abrir no navegador do óculos o endereço publicado
(**https://parappathe.github.io/TatuVR/**) e apertar "Entrar em VR". Para atualizar o site:
commitar e rodar `python publicar.py TatuVR` na pasta `C:\claude code` (só quando o Eduardo pedir).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8841` (o painel de visualização
usa `.claude/launch.json`). O `serve.py` manda o navegador não guardar cache;
`python serve.py --https` serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Mover o tatu | Manche de qualquer mão (a última direção fica guardada, como no fliperama) | Setas ou WASD |
| Pegar pedra | Segurar o aperto (botão lateral) com a mão perto da pedra (bandeja ou tabuleiro) | Clicar na pedra |
| Pôr pedra | Levar a mão até a casa (um anel verde mostra onde cai; vermelho = não pode) e soltar | Clicar na casa |
| Devolver pedra | Soltar fora do tabuleiro | Botão direito ou Esc |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| Só com as mãos | Pinça perto da pedra pega; pinça no tabuleiro guia o tatu na direção da mão | |
| FPS | Menu → FPS | Tecla F |

Na pausa do VR, "Recentralizar" põe a cabeça atrás da mesa olhando para o tabuleiro (funciona
sentado ou em pé). O controle vibra ao pegar e pôr pedra, no pequi, ao derrubar onça e ao morrer.

### Regras

- **Vencer:** comer todas as frutinhas (fases normais) ou derrubar o chefe (fases de chefe; comer
  tudo não vence). Frutinha 10 pontos, pequi 50, caju (aparece com 35% e 70% comido, some em 9 s)
  300/500/800 por mundo, vida extra aos 10.000 pontos (máximo 5 vidas).
- **Onças** (`js/sim.js`, `targetOf`): pintada persegue pelo caminho mais curto; parda mira 4 casas
  na frente do tatu; farejadora segue o rastro do tatu (6 passos atrás); gato-do-mato é rápido e
  anda à toa, mas avança se vê o tatu no mesmo corredor (até 7 casas). Saem da toca uma a uma
  (a cada 3,5 s). Ciclo: 16 s caçando, 6 s descansando no canto de cada uma. Não dão meia-volta.
- **Pequi** (4 cantos): o tatu vira bola por 7,5 s a 5 s (cai com os mundos); as onças fogem,
  mais lentas; encostar derruba (200, 400, 800, 1600 em sequência) e elas voltam tontas para a toca.
- **Pedras:** 2 por fase (3 com 4 ou mais onças). Duram 9 s no tabuleiro e voltam para a bandeja 5 s
  depois. Não podem ir na parede, na toca, na saída da toca, em cima do tatu nem em cima ou logo na
  frente de uma onça.
- **Chefes:** Pintadona (fase 4) quebra a pedra com cabeçadas (1 s); Jacaré-Açu (fase 8) é mais
  rápido que o tatu na reta, mas para 0,3 s em cada curva; Lobo Fantasma (fase 12) segue o rastro e
  some 3 s a cada 7 s (só aparecem as pegadas). Derrubar com o tatu em bola: 3, 3 e 4 vezes. Os
  pequis voltam 6 s depois de acabarem.
- **Estrelas (fases):** 3 sem perder vida, 2 perdendo uma, 1 perdendo mais. Fase vencida libera a
  próxima. O fliperama também marca as fases que venceu.
- Progresso, recordes e opções no navegador (localStorage `tatuvr.v1`).

Fases (em `js/levels.js`): Cerrado 1 Primeiros passos, 2 Duas pintas, 3 Faro fino, 4 A Pintadona;
Pantanal 5 Beira do rio, 6 Bando completo, 7 Cheia, 8 O Jacaré-Açu; Caatinga à noite 9 Lua nova,
10 Mandacaru, 11 Cinco pintas, 12 O Lobo Fantasma.

## Como testar

- `node tests/run.js` (ou `npm test`, uns 3 minutos): labirintos (mesma semente = mesmo labirinto,
  simétrico, borda fechada, tudo ligado, sem becos, toca com porta, os 12 diferentes), tatu (anda,
  come, meia-volta, parede, só anda em corredor), onças (saem da toca, pegam o tatu parado, vida,
  pequi assusta, derrubar dá 200 e dobra, voltam da toca, farejadora, gato, descanso), pedras
  (onde pode, bloqueia, esfarela, volta, tatu passa por baixo, Pintadona quebra), chefes (vida, caem
  com as batidas, comer tudo não vence, pequis voltam, lobo some, jacaré rápido), fim de fase
  (estrelas, vida extra, fim de jogo) e o **robô**: joga as 12 fases com 5 sementes cada, com limites
  humanos (decide a cada 0,15 s, leva 0,8 s para pôr uma pedra, não vê o lobo escondido) e tem que
  vencer pelo menos 4 de 5 em cada fase. `node tests/run.js rapido` roda o robô com 2 sementes.
  Termina com "Tudo certo". Não toca som.
- No navegador (console): `dev.loadLevel(5)` abre a fase 5, `dev.arcade()` começa o fliperama,
  `dev.autoplay = true` faz o robô jogar, `dev.showPlan = true` desenha o caminho que ele escolheu,
  `dev.advance(20)` avança 20 s na hora, `dev.state()` mostra tela, fase, pontos, vidas, frutinhas,
  onças e pedras, `dev.cam = [[x,y,z],[x,y,z]]` para a câmera do PC num ponto (null volta),
  `dev.closeUp()` câmera perto do tatu, `dev.snapshot()` devolve a imagem (JPEG em data URL),
  `dev.resetSave()` apaga progresso e recordes. `window.tatu` tem `game`, `save`, `sfx`, `robot`,
  `board`, `startLevel`, `goMenu`.
- **Só dá para testar no óculos:** manche, pegar e soltar pedra com o aperto (alcance da mão até o
  fundo do tabuleiro), pinça no rastreamento de mãos, recentralizar, vibração, conforto (olhar para
  baixo), se os bichos dão para ver bem, FPS no Quest.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", dica e avisos do PC |
| `js/vec.js` | Aleatório com semente. Sem navegador |
| `js/levels.js` | Gerador de labirinto (metade esquerda espelhada, sem becos, voltas extras, toca no meio), os 3 mundos e as 12 fases. Sem navegador |
| `js/sim.js` | Regras: `Game` (tatu, onças e chefes, pequi, pedras, caju, vidas, pontos, estrelas). Sem navegador |
| `js/robot.js` | Robô com limites humanos (caminho mais barato fugindo das onças, pedra na frente da onça que chega). Testes, demonstração do menu e `dev.autoplay`. Sem navegador |
| `js/main.js` | Liga tudo: render, VR (manche, aperto pega pedra, pinça, vibração, recentralizar), teclado e mouse, menus, fliperama e recordes, letreiro, eventos → sons e efeitos, `dev` |
| `js/scene.js` | Paisagens dos 3 mundos, mesa, tabuleiro (paredes, frutinhas e pequis instanciados), toca, caju, tatu, onças e chefes, pegadas, pedras, bandeja, mãos, partículas |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto (letreiro) |
| `js/audio.js` | Sons sintetizados (bipes de fliperama, ruído filtrado), insetos ao fundo |
| `js/save.js` | Progresso, recordes e opções |
| `tests/run.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8841, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: o tabuleiro tem 19 x 15 casas de 4,5 cm (`T` em `scene.js`), centro em
`BOARD_POS` (0; 0,95; -0,47) em metros. Casa (x, y): x para a direita, y para perto do jogador.
Direções: 0 longe, 1 direita, 2 perto, 3 esquerda. A toca são as casas (8..10, 7), porta (9, 6).

## Regras e convenções do projeto

- `vec.js`, `levels.js`, `sim.js` e `robot.js` não podem usar navegador nem Three.js: os testes rodam
  no Node.
- Mexeu em fase, onça, velocidade ou robô: rodar `node tests/run.js`. Fase nova ou semente nova:
  conferir que o robô vence pelo menos 4 de 5; o desenho do labirinto muda muito a dificuldade.
- Eventos do jogo (`game.events`) são a única ponte da lógica para som, vibração e efeitos.
- A demonstração do menu (robô jogando) nunca toca som.

## Decisões

- Jogo original do gênero, não cópia de nenhum fliperama: tatu, onças do Brasil, pedras na mão,
  chefes e mundos próprios.
- O labirinto é uma maquete parada na mesa e o jogador não se move (conforto); recentralizar põe a
  cabeça num ponto fixo atrás da mesa.
- Labirintos gerados por semente em vez de desenhados à mão: sempre simétricos, sem becos, todos
  ligados (testado). As sementes de cada fase foram escolhidas pelo robô.
- Pedras com prazo (9 s + 5 s de recarga) para não dar para trancar as onças para sempre; o tatu
  passa por baixo para a pedra nunca prender o próprio jogador.
- Fases com 4 ou mais onças ganham uma terceira pedra (sem ela o robô perdia mais da metade).
- Estrelas pelas vidas perdidas (fácil de entender no fliperama).
- Desempenho de Quest: pixelRatio 1, foveação, paredes e frutinhas instanciadas, sombras de mentira
  (manchas), 2 luzes (+ um lampião à noite), sem pós-processamento.
- Porta do servidor local 8841.

## Pendências / problemas conhecidos

- **Nada foi testado no Quest ainda**: manche, pegar pedra com o aperto, alcance do fundo do
  tabuleiro (~80 cm da cabeça), pinça no rastreamento de mãos, recentralizar, vibração, FPS.
- Sons só foram checados por não dar erro; ninguém ouviu ainda.
- A dificuldade foi calibrada pelo robô; pode estar fácil ou difícil para gente de verdade.

// Testes do Tatu no Labirinto: node tests/run.js (ou npm test). Não toca som.
// Uso: node tests/run.js [rapido]   -> "rapido" roda o robô com só 2 sementes por fase
import { Game, DT, DIRS, W, H, PATH, WALL, DEN, DOOR, STONE_LIFE, STONE_COOL, LIVES } from '../js/sim.js';
import { LEVELS, buildMaze, TATU_START, OUT_TILE, CORNERS } from '../js/levels.js';
import { makeRobot } from '../js/robot.js';

let fails = 0, count = 0;
function ok(cond, name) {
  count++;
  if (!cond) { fails++; console.log('  FALHOU:', name); }
}
function section(n) { console.log(n); }
const run = (g, sec, input = {}) => { for (let i = 0; i < sec / DT && !g.over; i++) g.step(typeof input === 'function' ? input(g) : input); };
const toPlay = (g) => { while (g.phase !== 'play') g.step({}); };

// ---------- labirintos ----------
section('Labirintos');
for (const [li, def] of LEVELS.entries()) {
  const m = buildMaze(def), again = buildMaze(def);
  ok(m.grid.every((v, i) => v === again.grid[i]), `fase ${li + 1}: mesma semente, mesmo labirinto`);
  const at = (x, y) => m.grid[y * W + x];
  // simétrico
  let sym = true;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) !== at(W - 1 - x, y)) sym = false;
  ok(sym, `fase ${li + 1}: simétrico`);
  // borda fechada
  let border = true;
  for (let x = 0; x < W; x++) if (at(x, 0) !== WALL || at(x, H - 1) !== WALL) border = false;
  for (let y = 0; y < H; y++) if (at(0, y) !== WALL || at(W - 1, y) !== WALL) border = false;
  ok(border, `fase ${li + 1}: borda fechada`);
  // tudo ligado (a partir do tatu) e sem becos
  const seen = new Set([TATU_START.join()]);
  const q = [TATU_START];
  while (q.length) {
    const [x, y] = q.pop();
    for (const [dx, dy] of DIRS) {
      const k = [x + dx, y + dy].join();
      if (at(x + dx, y + dy) === PATH && !seen.has(k)) { seen.add(k); q.push([x + dx, y + dy]); }
    }
  }
  let paths = 0, dead = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (at(x, y) === PATH) {
    paths++;
    const n = DIRS.filter(([dx, dy]) => at(x + dx, y + dy) === PATH || at(x + dx, y + dy) === DOOR).length;
    if (n < 2) dead++;
  }
  ok(seen.size === paths, `fase ${li + 1}: todo corredor alcançável (${seen.size}/${paths})`);
  ok(dead === 0, `fase ${li + 1}: sem becos sem saída (${dead})`);
  ok(at(...OUT_TILE) === PATH && at(9, 6) === DOOR && at(9, 7) === DEN, `fase ${li + 1}: toca com porta`);
  ok(CORNERS.every(c => at(...c) === PATH), `fase ${li + 1}: pequis nos cantos`);
}
// labirintos diferentes entre si
const keys = new Set(LEVELS.map(d => buildMaze(d).grid.join('')));
ok(keys.size === LEVELS.length, `os ${LEVELS.length} labirintos são diferentes (${keys.size})`);

// ---------- tatu ----------
section('Tatu');
{
  const g = new Game(0);
  ok(g.phase === 'ready', 'começa em "prepare-se"');
  toPlay(g);
  const x0 = g.tatu.x;
  // anda para os lados e come frutinha
  const side = g.walkTatu(x0 + 1, g.tatu.y) ? 1 : 3;
  const f0 = g.fruitsLeft;
  run(g, 0.6, { dir: side });
  ok(g.tatu.x !== x0, 'anda com o manche');
  ok(g.fruitsLeft < f0, 'come frutinha');
  ok(g.score >= 10, 'frutinha vale 10');
  // meia-volta no meio do corredor
  g.tatu.want = -1;
  const d = g.tatu.dir;
  if (d >= 0) { g.step({ dir: (d + 2) % 4 }); ok(g.tatu.dir === (d + 2) % 4, 'meia-volta na hora'); }
  // parede para
  const g2 = new Game(0); toPlay(g2);
  let blockedDir = DIRS.findIndex(([dx, dy]) => !g2.walkTatu(g2.tatu.x + dx, g2.tatu.y + dy));
  if (blockedDir >= 0) { run(g2, 0.5, { dir: blockedDir }); ok(g2.tatu.dir === -1 && g2.tatu.x === TATU_START[0] && g2.tatu.y === TATU_START[1], 'parede não deixa passar'); }
  // nunca entra na toca nem atravessa parede
  const g3 = new Game(5); toPlay(g3);
  let ok3 = true;
  for (let k = 0; k < 2000 && !g3.over; k++) {
    g3.step({ dir: Math.floor(k / 37) % 4 });
    if (g3.tile(g3.tatu.x, g3.tatu.y) !== PATH) ok3 = false;
    g3.oncas.forEach(o => { o.state = 'den'; o.wait = 99; });
  }
  ok(ok3, 'tatu só anda em corredor');
}

// ---------- pequi e onças ----------
section('Onças');
{
  const g = new Game(0); toPlay(g);
  run(g, 3);
  const o = g.oncas[0];
  ok(o.state === 'free', 'a primeira onça sai da toca');
  ok(g.tile(o.x, o.y) === PATH, 'a onça sai pela porta para o corredor');
  // a pintada chega no tatu parado
  const g2 = new Game(0); toPlay(g2);
  for (let k = 0; k < 60 * 30 && g2.phase === 'play'; k++) g2.step({});
  ok(g2.lost === 1 || g2.phase === 'dying' || g2.lives < LIVES, 'tatu parado: a pintada pega');
  // morrer tira vida e volta todo mundo
  ok(g2.lives === LIVES - 1, 'perde uma vida');
  run(g2, 4);
  ok(g2.tatu.x === TATU_START[0] && g2.tatu.y === TATU_START[1] || g2.phase === 'play', 'volta para o começo');
  // pequi assusta e onça assustada vira pontos
  const g3 = new Game(0); toPlay(g3);
  run(g3, 3);
  const on = g3.oncas[0];
  g3.pequi[g3.tatu.y * W + g3.tatu.x] = 1;
  g3.arriveTatu();
  ok(g3.power > 0 && on.state === 'fear', 'pequi assusta as onças');
  // põe a onça encostada no tatu
  on.x = g3.tatu.x; on.y = g3.tatu.y; on.off = 0; on.dir = -1;
  const sc = g3.score;
  g3.contacts();
  ok(on.state === 'back' && g3.score === sc + 200, 'tatu em bola derruba a onça: 200 pontos');
  ok(g3.lives === LIVES, 'derrubar não tira vida');
  run(g3, 8);
  ok(on.state !== 'back', 'a onça tonta volta para a toca e sai de novo');
  // segunda, terceira: dobra
  const g4 = new Game(5); toPlay(g4);
  g4.oncas.forEach(o => { o.state = 'free'; [o.x, o.y] = g4.maze.out; o.dir = -1; o.off = 0; });
  g4.pequi[g4.tatu.y * W + g4.tatu.x] = 1; g4.arriveTatu();
  const pts = [];
  for (const k of g4.oncas.filter(o => o.state === 'fear')) { const s0 = g4.score; k.x = g4.tatu.x; k.y = g4.tatu.y; k.off = 0; g4.contacts(); pts.push(g4.score - s0); }
  ok(pts.length >= 2 && pts[1] === 2 * pts[0], `pontos dobram em sequência (${pts.join(', ')})`);
  // o pequi acaba
  g4.oncas.forEach(o => { if (o.state === 'fear') { [o.x, o.y] = [1, 1]; } });
  for (let k = 0; k < 60 * 8; k++) { g4.step({}); g4.lives = 3; if (g4.phase === 'dying') g4.phase = 'play'; }
  ok(g4.power === 0 && !g4.oncas.some(o => o.state === 'fear'), 'o pequi acaba e as onças voltam ao normal');
  // farejadora segue o rastro
  const g5 = new Game(2); toPlay(g5);
  const fare = g5.oncas.find(o => o.kind === 'farejadora');
  g5.tatu.trail = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 7], [1, 8]];
  const tg = g5.targetOf(fare);
  ok(tg[0] === 1 && tg[1] === 2, 'farejadora mira o rastro de alguns passos atrás');
  // gato só avança se enxerga
  const g6 = new Game(4); toPlay(g6);
  const gato = g6.oncas.find(o => o.kind === 'gato');
  gato.x = 1; gato.y = 1; gato.state = 'free';
  g6.tatu.x = 17; g6.tatu.y = 13;
  ok(g6.targetOf(gato) === null, 'gato longe e sem ver: anda à toa');
  // descanso: vão para o canto delas
  const g7 = new Game(0); toPlay(g7);
  g7.mode = 'rest';
  ok(g7.targetOf(g7.oncas[0]) === g7.oncas[0].home, 'no descanso a onça vai para o canto dela');
}

// ---------- pedras ----------
section('Pedras');
{
  const g = new Game(0); toPlay(g);
  ok(g.stonesReady === 2, 'duas pedras na bandeja');
  ok(!g.canPlace(0, 0), 'pedra não vai na parede');
  ok(!g.canPlace(...g.maze.out), 'pedra não tampa a saída da toca');
  ok(!g.canPlace(g.tatu.x, g.tatu.y), 'pedra não cai em cima do tatu');
  ok(!g.canPlace(9, 7), 'pedra não entra na toca');
  // pedra bloqueia a onça
  run(g, 3);
  const o = g.oncas[0];
  // cerca a onça com pedras nas casas em volta (as possíveis)
  const free = DIRS.map(([dx, dy]) => [o.x + dx, o.y + dy]).filter(([x, y]) => g.tile(x, y) === PATH);
  g.stones.push({ id: 2, state: 'tray', x: 0, y: 0, life: 0, cool: 0 }, { id: 3, state: 'tray', x: 0, y: 0, life: 0, cool: 0 });
  o.dir = -1; o.off = 0;
  let placed = 0;
  for (const [x, y] of free) if (g.quickPlace(x, y)) placed++;
  ok(placed === free.length, `pedras em volta da onça (${placed}/${free.length})`);
  const ox = o.x, oy = o.y;
  run(g, 2);
  ok(o.x === ox && o.y === oy, 'onça cercada de pedra não sai do lugar');
  run(g, STONE_LIFE);
  ok(g.stones.every(s => s.state !== 'board'), `a pedra esfarela depois de ${STONE_LIFE} s`);
  run(g, STONE_COOL + 0.2);
  ok(g.stones.filter(s => s.state === 'tray').length >= 2 || g.phase !== 'play', `volta para a bandeja ${STONE_COOL} s depois`);
  // pegar de volta da mesa e soltar fora: volta para a bandeja
  const g2 = new Game(0); toPlay(g2);
  const spot = [1, 1];
  ok(g2.quickPlace(...spot), 'põe pedra');
  ok(g2.take(0) && g2.stones[0].state === 'held', 'pega a pedra de volta da mesa');
  g2.drop(0, null, null);
  ok(g2.stones[0].state === 'tray', 'soltou fora do tabuleiro: volta para a bandeja');
  // tatu passa por baixo da pedra (cava)
  ok(g2.walkTatu(1, 1), 'o tatu passa por baixo da pedra');
  // pintadona quebra pedra
  const g3 = new Game(3); toPlay(g3);
  run(g3, 2);
  const boss = g3.boss;
  ok(boss && boss.kind === 'pintadona' && boss.state !== 'den', 'chefe Pintadona sai primeiro');
  let broke = false;
  for (let k = 0; k < 60 * 25 && !broke && !g3.over; k++) {
    if (boss.state === 'free' && boss.dir >= 0 && g3.stonesReady) {
      const nx = boss.x + DIRS[boss.dir][0] * 2, ny = boss.y + DIRS[boss.dir][1] * 2;
      g3.quickPlace(nx, ny);
    }
    g3.step({});
    if (g3.events.some(e => e.type === 'stone-break')) broke = true;
    g3.events.length = 0;
  }
  ok(broke, 'a Pintadona quebra a pedra');
}

// ---------- chefes ----------
section('Chefes');
{
  for (const li of [3, 7, 11]) {
    const g = new Game(li); toPlay(g);
    ok(!!g.boss && g.boss.hp === LEVELS[li].bossHp, `fase ${li + 1}: chefe com ${LEVELS[li].bossHp} de vida`);
    // derruba o chefe todas as vezes
    let hits = 0;
    for (let k = 0; k < LEVELS[li].bossHp; k++) {
      run(g, 1);
      const b = g.boss;
      g.oncas.forEach(o => { if (!o.boss) { o.state = 'den'; o.wait = 99; } });
      b.state = 'free'; g.power = 0;
      g.pequi[g.tatu.y * W + g.tatu.x] = 1; g.arriveTatu();
      b.x = g.tatu.x; b.y = g.tatu.y; b.off = 0; b.dir = -1;
      if (b.state === 'fear') { g.contacts(); hits++; }
    }
    ok(hits === LEVELS[li].bossHp && g.phase === 'won', `fase ${li + 1}: chefe cai com ${LEVELS[li].bossHp} batidas de bola`);
  }
  // fase de chefe não acaba comendo as frutinhas
  const g = new Game(3); toPlay(g);
  g.fruit.fill(0); g.fruitsLeft = 1;
  const i = g.tatu.y * W + g.tatu.x; g.fruit[i] = 1;
  g.arriveTatu();
  ok(g.phase === 'play', 'na fase de chefe, comer tudo não vence');
  // pequis voltam
  g.oncas.forEach(o => { o.state = 'den'; o.wait = 99; });
  g.pequi.fill(0); run(g, 7);
  ok(g.pequi.some(v => v), 'na fase de chefe os pequis voltam');
  // lobo some e aparece
  const gl = new Game(11); toPlay(gl);
  let hid = false, shown = false;
  for (let k = 0; k < 60 * 20; k++) { gl.step({}); if (gl.boss.hidden) hid = true; else if (hid) shown = true; if (gl.over || gl.phase === 'dying') break; }
  ok(hid && shown, 'o Lobo Fantasma some e reaparece');
  // jacaré: rápido na reta, para na curva
  const gj = new Game(7); toPlay(gj); run(gj, 3);
  ok(gj.speedOf(gj.boss) > gj.def.tatu * 0.99, 'Jacaré na reta é mais rápido que o tatu');
}

// ---------- vitória, estrelas, vida extra ----------
section('Fim de fase');
{
  const g = new Game(0); toPlay(g);
  g.fruit.fill(0); g.fruitsLeft = 1;
  g.fruit[g.tatu.y * W + g.tatu.x] = 1;
  g.arriveTatu();
  ok(g.phase === 'won' && g.result.stars === 3, 'comeu a última frutinha sem morrer: vence com 3 estrelas');
  const g2 = new Game(0, { score: 9995 }); toPlay(g2);
  g2.addScore(10);
  ok(g2.lives === LIVES + 1, 'vida extra aos 10.000 pontos');
  const g3 = new Game(0, { lives: 1 }); toPlay(g3);
  run(g3, 40);
  ok(g3.phase === 'lost' && g3.result && !g3.result.won, 'sem vidas: fim de jogo');
}

// ---------- robô ----------
section('Robô (limites humanos: decide a cada 0,15 s, 0,8 s para pôr pedra)');
const quick = process.argv.includes('rapido');
const SEEDS = quick ? [1, 2] : [1, 2, 3, 4, 5];
function playRobot(li, seed) {
  const g = new Game(li, { seed: seed * 1000 + li });
  const R = makeRobot();
  let stones = 0;
  for (let k = 0; k < 400 / DT && !g.over; k++) {
    const inp = R.step(g);
    if (inp.place && g.quickPlace(...inp.place)) stones++;
    g.step(inp);
  }
  return { g, stones };
}
let allWon = true;
for (let li = 0; li < LEVELS.length; li++) {
  const res = SEEDS.map(s => playRobot(li, s));
  const won = res.filter(r => r.g.result?.won).length;
  const stars = res.map(r => r.g.result?.stars ?? 0);
  const avgT = res.reduce((s, r) => s + r.g.t, 0) / res.length;
  const st = res.reduce((s, r) => s + r.stones, 0) / res.length;
  console.log(`  fase ${String(li + 1).padStart(2)} ${LEVELS[li].name.padEnd(18)} venceu ${won}/${res.length}  estrelas ${stars.join(' ')}  tempo médio ${avgT.toFixed(0)} s  pedras ${st.toFixed(1)}`);
  // tem que vencer quase sempre: no máximo 1 derrota por fase
  if (won < res.length - 1) allWon = false;
}
ok(allWon, 'o robô vence todas as fases');

console.log(fails ? `\n${fails} de ${count} testes falharam` : `\nTudo certo (${count} testes)`);
process.exit(fails ? 1 : 0);

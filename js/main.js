// Liga as regras (sim.js) à tela, ao Quest (manche, aperto para pegar pedra, mãos) e ao PC
// (setas/WASD e mouse para as pedras). Também os menus, o letreiro, o fliperama e o "dev".
import * as THREE from '../vendor/three/three.module.js';
import { Game, DT, DIRS, LIVES, STONE_LIFE, STONE_COOL, ONCA_INFO } from './sim.js';
import { LEVELS, WORLDS, W, H } from './levels.js';
import { makeRobot } from './robot.js';
import { buildWorld, BoardView, buildTatu, buildOnca, buildStone, buildTray, traySlot, buildHand, Footprints, Particles, T, BOARD_POS, BOARD_D, HEAD_REF, THEMES } from './scene.js';
import { Panel, Label, C as UI, roundRect } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave, best, makesTable, addScore } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad = (n, k = 6) => String(Math.max(0, n)).padStart(k, '0');
const MAX_STONES = 3;

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld();
const { scene } = world;
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.02, 500);
const rig = new THREE.Group();
scene.add(rig);
rig.add(camera);

const board = new BoardView(scene);
const tatuView = buildTatu();
board.group.add(tatuView.group);
let oncaViews = [];
const footprints = new Footprints(board.group);
const particles = new Particles(scene);
let tray = null;
const stoneMeshes = [];
for (let i = 0; i < MAX_STONES; i++) { const m = buildStone(i); m.visible = false; scene.add(m); stoneMeshes.push(m); }

// letreiro de fliperama atrás do tabuleiro
const marquee = new Label(0.78, 1024, 220);
marquee.mesh.position.set(0, BOARD_POS.y + 0.2, BOARD_POS.z - BOARD_D / 2 - 0.06);
marquee.mesh.rotation.x = -0.25;
marquee.mesh.material.depthTest = true;
marquee.mesh.renderOrder = 0;
scene.add(marquee.mesh);
const marqueePost = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.02), new THREE.MeshLambertMaterial({ color: '#2a1030' }));
marqueePost.position.copy(marquee.mesh.position).add(new THREE.Vector3(0, 0, -0.012));
marqueePost.rotation.x = -0.25;
scene.add(marqueePost);

const panel = new Panel(0.9);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const msgLabel = new Label(0.8, 1024, 128);
msgLabel.mesh.visible = false;
scene.add(msgLabel.mesh);

// ---------- Estado ----------
let app = 'menu';            // 'menu' | 'playing' | 'paused' | 'done'
let mode = 'level';          // 'level' (fase avulsa) | 'arcade' (fliperama: 12 fases seguidas, vidas e pontos continuam)
let level = 0;
let game = null;
let robot = makeRobot();
let demo = true;             // no menu o robô joga sozinho, sem som
let msg = null;
let doneTimer = 0;
let stageTimer = 0;          // fliperama: segundos até começar a próxima fase sozinho
let lastResult = null, newBest = false;
let initials = null;         // { letters: [..], score, level }

const unlocked = (i) => i === 0 || !!save.done[i - 1];
const nextLevel = () => { let n = 0; while (n < LEVELS.length - 1 && save.done[n]) n++; return n; };

function newGame(li, opts = {}) {
  pcDir = -1;
  level = clamp(li, 0, LEVELS.length - 1);
  game = new Game(level, opts);
  const th = LEVELS[level].world;
  world.setTheme(th);
  board.setLevel(game, th);
  for (const v of oncaViews) board.group.remove(v.group);
  oncaViews = game.oncas.map(o => { const v = buildOnca(o.kind); board.group.add(v.group); v.ang = 0; return v; });
  if (tray) scene.remove(tray);
  tray = buildTray(game.stones.length);
  scene.add(tray);
  for (const h of hands) { h.stone = -1; h.guide = false; }
  mouse.held = -1;
  robot.reset();
  acc = 0;
  sfx.power(false);
  sfx.setAmbient(THEMES[th].night, !demo);
}

function startLevel(li, m = mode, carry = null) {
  demo = false;
  mode = m;
  newGame(li, carry ? { lives: carry.lives, score: carry.score, extraGiven: carry.extraGiven } : {});
  app = 'playing';
  doneTimer = 0;
  stageTimer = 0;
  panel.hide();
  const L = LEVELS[level];
  const firstOfWorld = level === 0 || LEVELS[level - 1].world !== L.world;
  showMsg(L.boss ? `Chefe: ${ONCA_INFO[L.boss].name}! Derrube com o tatu em bola.` : firstOfWorld ? `${WORLDS[L.world].name}. ${WORLDS[L.world].hint}` : `Fase ${level + 1}: ${L.name}`, 5, '#fff4e0');
  sfx.ready();
  updateHint();
}

function togglePause() {
  if (app === 'playing') { app = 'paused'; sfx.power(false); showScreen('pause'); }
  else if (app === 'paused') { app = 'playing'; panel.hide(); if (game.power > 0) sfx.power(true); }
  updateHint();
}

function goMenu() {
  app = 'menu';
  stageTimer = 0;
  demo = true;
  newGame(Math.floor(Math.random() * LEVELS.length), { seed: Math.floor(Math.random() * 1e6) });
  showScreen('main');
  updateHint();
}

function showMsg(text, t = 2, color = '#ffcf3a') { msg = { text, t, color }; }

// ---------- Menus ----------
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  placePanel();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Tatu no Labirinto', 70);
      p.text('Coma as frutinhas e fuja das onças. Pedras na mão bloqueiam o caminho delas.', 512, 126, { size: 25, color: UI.dim });
      p.text('Pequi dourado: o tatu vira bola e derruba as onças.', 512, 158, { size: 25, color: UI.dim });
      p.button('Fliperama', () => startLevel(0, 'arcade'), 162, 192, 340, 100, { size: 38, sub: '12 fases, 3 vidas' });
      const nx = nextLevel();
      p.button('Fases', () => showScreen('levels'), 522, 192, 340, 100, { size: 38, sub: save.done[0] ? `continuar: fase ${nx + 1}` : 'uma de cada vez' });
      p.button('Recordes', () => showScreen('records'), 162, 308, 340, 80, { size: 32 });
      p.button('Como jogar', () => showScreen('help'), 522, 308, 340, 80, { size: 32 });
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; storeSave(save); sfx.setOn(save.sound); showScreen('main'); }, 162, 404, 340, 70, { size: 28 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 522, 404, 340, 70, { size: 28 });
      const total = Object.values(save.done).reduce((s, d) => s + (d.stars || 0), 0);
      p.text(`Estrelas: ${total} de ${LEVELS.length * 3}   ·   Recorde: ${pad(best(save))}`, 512, 520, { size: 28, color: UI.star });
      p.text(vr ? 'Aponte e aperte o gatilho para escolher' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 580, { size: 22, color: UI.dim });
      p.text('No PC: setas ou WASD movem o tatu; o mouse pega e põe as pedras', 512, 618, { size: 22, color: UI.dim });
    } else if (name === 'levels') {
      p.title('Fases', 54);
      WORLDS.forEach((Wd, w) => {
        const y = 96 + w * 186;
        p.text(Wd.name, 60, y + 10, { size: 26, color: UI.pink, align: 'left', bold: true });
        for (let k = 0; k < 4; k++) {
          const i = w * 4 + k, d = save.done[i];
          p.tile(60 + k * 232, y + 30, 212, 140, { num: i + 1, name: LEVELS[i].name, stars: d?.stars || 0, done: !!d, locked: !unlocked(i), master: !!LEVELS[i].boss, action: () => startLevel(i, 'level') });
        }
      });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 652, 300, 56, { size: 28 });
    } else if (name === 'records') {
      p.title('Recordes do fliperama', 64);
      if (!save.scores.length) p.text('Ninguém jogou o fliperama ainda.', 512, 300, { size: 32, color: UI.dim });
      save.scores.forEach((r, k) => {
        const y = 150 + k * 78;
        p.text(`${k + 1}º`, 230, y, { size: 38, color: UI.pink, bold: true });
        p.text(r.name, 380, y, { size: 44, color: UI.edge, bold: true });
        p.text(pad(r.score), 620, y, { size: 44, bold: true });
        p.text(r.level >= LEVELS.length ? 'zerou!' : `fase ${r.level + 1}`, 820, y, { size: 26, color: UI.dim });
      });
      p.button('Voltar', () => showScreen('main'), 362, 600, 300, 80);
    } else if (name === 'help') {
      p.title('Como jogar', 56);
      const rows = vr ? [
        'Manche (qualquer mão): leva o tatu pelos corredores.',
        'Coma todas as frutinhas para passar de fase.',
        'Pedras na bandeja: segure o aperto perto de uma, leve até a',
        'casa do labirinto e solte. A onça não passa; o tatu cava por baixo.',
        'A pedra dura 9 s e volta para a bandeja 5 s depois.',
        'Pequi dourado: o tatu vira bola e derruba as onças (pontos em dobro).',
        'Chefes: derrube com o tatu em bola. B/Y: pausa.',
        'Só com as mãos: pinça na pedra pega; pinça no tabuleiro guia o tatu.',
      ] : [
        'Setas ou WASD: levam o tatu pelos corredores.',
        'Coma todas as frutinhas para passar de fase.',
        'Pedras: clique numa pedra da bandeja e clique numa casa do',
        'labirinto. A onça não passa; o tatu cava por baixo.',
        'A pedra dura 9 s e volta para a bandeja 5 s depois.',
        'Clique numa pedra da mesa para tirar; botão direito devolve.',
        'Pequi dourado: o tatu vira bola e derruba as onças (pontos em dobro).',
        'Chefes: derrube com o tatu em bola.  Esc ou P: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 50, 116 + i * 58, { size: 26, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 64);
      p.text(`Fase ${level + 1}: ${LEVELS[level].name}${mode === 'arcade' ? ' · fliperama' : ''}`, 512, 122, { size: 28, color: UI.dim });
      p.button('Continuar', () => togglePause(), 262, 160, 500, 84);
      p.button(mode === 'arcade' ? 'Recomeçar o fliperama' : 'Recomeçar a fase', () => startLevel(mode === 'arcade' ? 0 : level), 262, 258, 500, 80);
      p.button('Recentralizar', () => { recenter(); togglePause(); }, 262, 352, 245, 80, { size: 28, locked: !vr });
      p.button('Como jogar', () => showScreen('help'), 517, 352, 245, 80, { size: 28 });
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; storeSave(save); sfx.setOn(save.sound); showScreen('pause'); }, 262, 446, 500, 72, { size: 26 });
      p.button('Menu principal', () => goMenu(), 262, 560, 500, 80);
    } else if (name === 'done') {
      const r = lastResult, L = LEVELS[level];
      if (r.won) {
        p.title(L.boss ? `${ONCA_INFO[L.boss].name} derrotado!` : 'Fase vencida!', 62);
        p.stars(r.stars, 512, 140, 74);
        p.text(`${pad(r.score)} pontos`, 512, 216, { size: 46, bold: true, color: UI.edge });
        p.text(r.lost ? `Perdeu ${r.lost} vida${r.lost > 1 ? 's' : ''} (3 estrelas: sem perder nenhuma)` : 'Sem perder nenhuma vida!', 512, 270, { size: 26, color: UI.dim });
      } else {
        p.title('As onças pegaram o tatu', 62);
        p.text(`Faltaram ${game.boss ? `${game.boss.hp} batida${game.boss.hp > 1 ? 's' : ''} no chefe` : `${game.fruitsLeft} frutinhas`}`, 512, 150, { size: 34, color: UI.red });
        p.text('Dica: ponha a pedra no corredor ANTES da onça chegar.', 512, 214, { size: 27 });
      }
      if (newBest) p.text('Novo recorde da fase!', 512, 314, { size: 30, color: UI.star, bold: true });
      if (level < LEVELS.length - 1) p.button('Próxima fase', () => startLevel(level + 1, 'level'), 262, 362, 500, 90, { size: 36, locked: !unlocked(level + 1) });
      else if (r.won) p.text('Você venceu as 12 fases!', 512, 406, { size: 34, bold: true, color: UI.edge });
      p.button(r.won ? 'Repetir' : 'Tentar de novo', () => startLevel(level, 'level'), 262, 470, 245, 80);
      p.button('Fases', () => showScreen('levels'), 517, 470, 245, 80);
      p.button('Menu principal', () => goMenu(), 262, 570, 500, 78);
    } else if (name === 'stage') {
      // fliperama: entre uma fase e outra
      const r = lastResult;
      p.title(LEVELS[level].boss ? `${ONCA_INFO[LEVELS[level].boss].name} derrotado!` : `Fase ${level + 1} vencida!`, 80);
      p.text(`${pad(r.score)} pontos   ·   vidas ${'●'.repeat(r.lives)}`, 512, 170, { size: 40, bold: true, color: UI.edge });
      const nx = LEVELS[level + 1];
      p.text(`Próxima: fase ${level + 2}, ${nx.name}${nx.world !== LEVELS[level].world ? ` (${WORLDS[nx.world].name})` : ''}`, 512, 250, { size: 30 });
      p.button('Continuar', () => startLevel(level + 1, 'arcade', r), 262, 320, 500, 100, { size: 40 });
      p.button('Menu principal', () => goMenu(), 262, 450, 500, 80);
      p.text('Continua sozinho em alguns segundos', 512, 590, { size: 22, color: UI.dim });
    } else if (name === 'over') {
      const r = lastResult, all = r.won && level === LEVELS.length - 1;
      p.title(all ? 'Você zerou o fliperama!' : 'Fim de jogo', 80);
      p.text(`${pad(r.score)} pontos`, 512, 180, { size: 60, bold: true, color: UI.edge });
      p.text(all ? 'As 12 fases, de uma vez só.' : `Chegou na fase ${level + 1}: ${LEVELS[level].name}`, 512, 260, { size: 30 });
      p.button('Jogar de novo', () => startLevel(0, 'arcade'), 262, 330, 500, 90, { size: 36 });
      p.button('Recordes', () => showScreen('records'), 262, 440, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 540, 500, 80);
    } else if (name === 'initials') {
      const I = initials;
      p.title('Recorde! Suas iniciais', 70);
      p.text(`${pad(I.score)} pontos`, 512, 140, { size: 40, bold: true, color: UI.edge });
      I.letters.forEach((c, k) => {
        const x = 292 + k * 160;
        p.button('▲', () => { I.letters[k] = String.fromCharCode((c.charCodeAt(0) - 65 + 1) % 26 + 65); showScreen('initials'); }, x, 190, 120, 80, { size: 40 });
        p.text(c, x + 60, 340, { size: 110, bold: true, color: UI.text });
        p.button('▼', () => { I.letters[k] = String.fromCharCode((c.charCodeAt(0) - 65 + 25) % 26 + 65); showScreen('initials'); }, x, 410, 120, 80, { size: 40 });
      });
      p.button('Pronto', () => {
        save.name = I.letters.join('');
        addScore(save, { name: save.name, score: I.score, level: I.level });
        storeSave(save);
        initials = null;
        showScreen('records');
      }, 262, 530, 500, 90, { size: 38 });
    }
  });
}

function placePanel() {
  if (renderer.xr.isPresenting) {
    if (panel.mesh.parent !== scene) scene.add(panel.mesh);
    panel.mesh.scale.setScalar(1);
    const e = new THREE.Euler().setFromQuaternion(xrHeadQuat(), 'YXZ');
    const head = xrHeadPos();
    panel.mesh.position.set(head.x - Math.sin(e.y) * 1.0, head.y + 0.02, head.z - Math.cos(e.y) * 1.0);
    panel.mesh.rotation.set(0, e.y, 0);
    return;
  }
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.rotation.set(0, 0, 0);
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
}

function finishLevel() {
  doneTimer = 0;
  const r = game.result;
  lastResult = r;
  sfx.power(false);
  if (mode === 'level') {
    const prev = save.done[level];
    newBest = r.won && (!prev || r.score > (prev.score || 0));
    if (r.won) save.done[level] = { stars: Math.max(r.stars, prev?.stars || 0), score: Math.max(r.score, prev?.score || 0) };
    storeSave(save);
    app = 'done';
    showScreen('done');
    for (let k = 0; k < r.stars; k++) setTimeout(() => sfx.star(k), 300 + k * 220);
  } else {
    // fliperama: a fase também conta para o modo de fases
    if (r.won) {
      const prev = save.done[level];
      save.done[level] = { stars: Math.max(r.stars, prev?.stars || 0), score: Math.max(prev?.score || 0, 0) };
      storeSave(save);
    }
    app = 'done';
    if (r.won && level < LEVELS.length - 1) {
      showScreen('stage');
      stageTimer = 6;
    } else if (makesTable(save, r.score)) {
      initials = { letters: (save.name || 'TAT').split(''), score: r.score, level: r.won ? LEVELS.length : level };
      showScreen('initials');
    } else showScreen('over');
  }
  updateHint();
}

// ---------- Controles do VR ----------
const hands = [];
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  rig.add(ctrl, grip);
  const laser = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]),
    new THREE.LineBasicMaterial({ color: 0xffcf3a }));
  laser.visible = false;
  ctrl.add(laser);
  const entry = { ctrl, grip, laser, source: null, side: null, prevButtons: [], hoverIndex: -1, stone: -1, by: null, guide: false, model: null };
  hands.push(entry);
  ctrl.addEventListener('connected', (e) => {
    entry.source = e.data; entry.side = e.data.handedness;
    if (entry.model) grip.remove(entry.model);
    entry.model = buildHand(entry.side === 'left' ? -1 : 1);
    grip.add(entry.model);
  });
  ctrl.addEventListener('disconnected', () => { release(entry); entry.source = null; entry.side = null; entry.guide = false; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('selectend', () => { if (entry.by === 'select') release(entry); entry.guide = false; });
  ctrl.addEventListener('squeezestart', () => { sfx.unlock(); if (!entry.source?.hand) grab(entry, 'squeeze'); });
  ctrl.addEventListener('squeezeend', () => { if (entry.by === 'squeeze') release(entry); });
}
function pulse(entry, v, ms) {
  try { entry?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ }
}
const pulseAll = (v, ms) => hands.forEach(h => pulse(h, v, ms));
function handPos(entry, out) {
  const src = entry.source?.hand ? entry.ctrl : entry.grip;
  return src.getWorldPosition(out);
}
// pedra mais perto da mão (na bandeja ou no tabuleiro)
function nearestStone(entry) {
  if (!game) return -1;
  handPos(entry, _v);
  let bestI = -1, bd = 0.075;
  game.stones.forEach((s, k) => {
    if (s.state !== 'tray' && s.state !== 'board') return;
    const d = _v.distanceTo(stoneMeshes[k].position);
    if (d < bd) { bd = d; bestI = k; }
  });
  return bestI;
}
function grab(entry, by) {
  if (!entry.side || panel.visible || app !== 'playing' || entry.stone >= 0) return false;
  const k = nearestStone(entry);
  if (k < 0 || !game.take(k)) return false;
  entry.stone = k; entry.by = by;
  pulse(entry, 0.4, 30);
  sfx.stoneBack();
  return true;
}
function release(entry) {
  if (entry.stone < 0) return;
  const k = entry.stone;
  entry.stone = -1; entry.by = null;
  if (!game || game.stones[k]?.state !== 'held') return;
  const t = dropTarget(entry);
  game.drop(k, t?.x ?? null, t?.y ?? null);
  if (t && game.stones[k].state === 'board') pulse(entry, 0.7, 50);
  handleEvents(game.events.splice(0));
}
// casa embaixo da mão (até 20 cm acima do tabuleiro)
function dropTarget(entry) {
  handPos(entry, _v);
  const t = board.worldToTile(_v);
  return t && t.h < 0.2 ? t : null;
}
function onSelect(entry) {
  sfx.unlock();
  if (panel.visible) {
    if (entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } }
    return;
  }
  if (grab(entry, 'select')) return;
  if (entry.source?.hand) entry.guide = true;     // mão rastreada: pinça no tabuleiro guia o tatu
}
function pollButtons() {
  for (const e of hands) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5] && (app === 'playing' || app === 'paused')) togglePause();   // B ou Y
    e.prevButtons = b;
  }
}
// manche: a direção da mão que mais empurrou
function stickDir() {
  let bx = 0, by = 0, bm = 0.55;
  for (const e of hands) {
    const ax = e.source?.gamepad?.axes;
    if (!ax || e.source.hand) continue;
    const x = ax[2] ?? 0, y = ax[3] ?? 0, m = Math.hypot(x, y);
    if (m > bm) { bm = m; bx = x; by = y; }
  }
  if (bm <= 0.55) return -1;
  return Math.abs(bx) > Math.abs(by) ? (bx > 0 ? 1 : 3) : (by < 0 ? 0 : 2);
}
function guideDir() {
  for (const e of hands) {
    if (!e.guide) continue;
    handPos(e, _v);
    const l = board.group.worldToLocal(_v.clone());
    const [tx, ty] = game.pos(game.tatu);
    const dx = l.x / T + (W - 1) / 2 - tx, dy = l.z / T + (H - 1) / 2 - ty;
    if (Math.hypot(dx, dy) < 0.6) return -1;
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy < 0 ? 0 : 2);
  }
  return -1;
}

// ---------- VR: sessão e recentralizar ----------
let recenterIn = 0;
function xrHeadPos() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldPosition(new THREE.Vector3()) : camera.getWorldPosition(new THREE.Vector3()); }
function xrHeadQuat() { return renderer.xr.isPresenting ? renderer.xr.getCamera().getWorldQuaternion(new THREE.Quaternion()) : camera.getWorldQuaternion(new THREE.Quaternion()); }
function recenter() {
  if (!renderer.xr.isPresenting) return;
  // põe a cabeça num ponto fixo atrás da mesa, olhando para o tabuleiro (sentado ou em pé)
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -e.y);
  rig.position.set(HEAD_REF.x - head.x, HEAD_REF.y - head.y, HEAD_REF.z - head.z);
  if (panel.visible) placePanel();
}
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 6;
  camera.position.set(0, 0, 0); camera.rotation.set(0, 0, 0);
  if (panel.visible) setTimeout(placePanel, 150);
  updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  for (const e of hands) { release(e); e.guide = false; }
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  if (panel.visible) placePanel();
  onResize();
  updateHint();
});

// ---------- Mouse e teclado (PC) ----------
const mouse = { ndc: new THREE.Vector2(0, 0), held: -1, hoverStone: -1, tile: null };
const raycaster = new THREE.Raycaster();
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -BOARD_POS.y);
let pcDir = -1;
const canvas = renderer.domElement;
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
function mouseRay() {
  raycaster.setFromCamera(mouse.ndc, camera);
  const p = raycaster.ray.intersectPlane(boardPlane, new THREE.Vector3());
  mouse.tile = p ? board.worldToTile(p) : null;
  mouse.point = p;
  mouse.hoverStone = -1;
  if (game && mouse.held < 0) {
    const hits = raycaster.intersectObjects(stoneMeshes.filter(m => m.visible));
    if (hits.length) {
      const k = stoneMeshes.indexOf(hits[0].object);
      if (game.stones[k] && (game.stones[k].state === 'tray' || game.stones[k].state === 'board')) mouse.hoverStone = k;
    }
  }
}
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv));
    if (a) { sfx.click(); a(); }
    return;
  }
  if (app !== 'playing' || dev.autoplay) return;
  mouseRay();
  if (e.button === 2) { if (mouse.held >= 0) { game.drop(mouse.held, null, null); mouse.held = -1; handleEvents(game.events.splice(0)); } return; }
  if (mouse.held >= 0) {
    const t = mouse.tile;
    game.drop(mouse.held, t?.x ?? null, t?.y ?? null);
    mouse.held = -1;
    handleEvents(game.events.splice(0));
  } else if (mouse.hoverStone >= 0 && game.take(mouse.hoverStone)) {
    mouse.held = mouse.hoverStone;
    sfx.stoneBack();
  }
});
canvas.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
});
const KEYDIR = { arrowup: 0, w: 0, arrowright: 1, d: 1, arrowdown: 2, s: 2, arrowleft: 3, a: 3 };
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = e.key.toLowerCase();
  if (k === ' ' || k.startsWith('arrow')) e.preventDefault();
  if (KEYDIR[k] != null) { pcDir = KEYDIR[k]; return; }
  if (e.repeat) return;
  if (k === 'escape' || k === 'p') {
    if (mouse.held >= 0 && k === 'escape' && game) { game.drop(mouse.held, null, null); mouse.held = -1; return; }
    if (app === 'playing' || app === 'paused') togglePause();
    return;
  }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); }
});
function onResize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.visible) placePanel();
}
window.addEventListener('resize', onResize);

// ---------- Entrada para o jogo ----------
function buildInput() {
  if (dev.autoplay || demo) {
    const r = robot.step(game);
    if (r.place) { game.quickPlace(...r.place); }
    return { dir: r.dir };
  }
  if (app !== 'playing') return {};
  let dir = -1;
  if (renderer.xr.isPresenting) { dir = stickDir(); if (dir < 0) dir = guideDir(); }
  else { dir = pcDir; pcDir = -1; }      // a tecla vale até a próxima (o tatu guarda a direção pedida)
  return { dir };
}

// ---------- Câmera do PC ----------
const PC_CAM = new THREE.Vector3(0, 1.56, 0.06), PC_LOOK = new THREE.Vector3(0, 0.9, -0.43);
function updatePcCamera() {
  if (renderer.xr.isPresenting) return;
  if (dev.cam) { camera.position.set(...dev.cam[0]); camera.lookAt(...dev.cam[1]); return; }
  camera.position.copy(PC_CAM);
  if (app === 'menu') camera.position.x += Math.sin(time * 0.2) * 0.15;
  camera.lookAt(PC_LOOK);
}

// ---------- Raios do menu ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateMenuRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1;
  for (const e of hands) {
    e.hoverIndex = -1;
    e.laser.visible = false;
    if (!vr || !e.source || !panel.visible) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    const hit = raycaster.intersectObject(panel.mesh)[0];
    e.laser.visible = true;
    e.laser.scale.z = hit ? hit.distance : 1.2;
    e.hoverIndex = panel.pick(hit?.uv);
    if (e.hoverIndex >= 0) hover = e.hoverIndex;
  }
  if (!vr && panel.visible) {
    raycaster.setFromCamera(mouse.ndc, camera);
    hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
    canvas.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
  } else if (!vr) canvas.style.cursor = mouse.held >= 0 ? 'grabbing' : mouse.hoverStone >= 0 ? 'grab' : 'default';
  if (panel.visible) panel.setHover(hover);
}

// ---------- Bichos, pedras e marcador ----------
const ANG = [0, -Math.PI / 2, Math.PI, Math.PI / 2];
const _p = new THREE.Vector3();
function placeCritter(view, e, speed, ahead, dt) {
  const [x, y] = game.pos(e);
  let px = x, py = y;
  if (e.dir >= 0 && app !== 'paused') {
    const extra = Math.min(speed * ahead, 1 - e.off);
    px += DIRS[e.dir][0] * extra; py += DIRS[e.dir][1] * extra;
  }
  view.group.position.set((px - (W - 1) / 2) * T, 0, (py - (H - 1) / 2) * T);
  if (e.dir >= 0) {
    let target = ANG[e.dir], cur = view.group.rotation.y;
    let d = target - cur;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    view.group.rotation.y = cur + d * Math.min(1, dt * 16);
  }
}
function updateCritters(dt, ahead) {
  const T0 = game.tatu;
  const moving = app === 'playing' || app === 'menu' || app === 'done';
  placeCritter(tatuView, T0, game.def.tatu, ahead, dt);
  tatuView.update(dt, moving && T0.dir >= 0 && game.phase === 'play', game.power > 0, game.phase === 'dying' ? game.phaseT : 0, time);
  tatuView.group.visible = !(game.phase === 'dying' && game.phaseT < 0.3);
  game.oncas.forEach((o, k) => {
    const v = oncaViews[k];
    placeCritter(v, o, game.speedOf(o), o.breakT > 0 || o.pauseT > 0 ? 0 : ahead, dt);
    v.update(dt, o, game.power, time, moving && o.dir >= 0 && game.phase === 'play' && o.breakT <= 0 && o.pauseT <= 0);
    v.group.visible = game.phase !== 'dying' || game.phaseT > 1.2;
  });
  const lobo = game.oncas.find(o => o.kind === 'lobo');
  footprints.update(lobo, lobo ? oncaViews[game.oncas.indexOf(lobo)].group.position : null, time);
}
function updateStones(dt) {
  board.marker.visible = false;
  const n = game.stones.length;
  stoneMeshes.forEach((m, k) => {
    const s = game.stones[k];
    m.visible = !!s;
    if (!s) return;
    m.scale.setScalar(1);
    if (s.state === 'tray') { traySlot(k, n, m.position); m.position.y += Math.sin(time * 2 + k) * 0.001; }
    else if (s.state === 'cool') { traySlot(k, n, m.position); m.scale.setScalar(Math.max(0.05, 1 - s.cool / STONE_COOL) * 0.8); }
    else if (s.state === 'board') {
      board.tileWorld(s.x, s.y, m.position);
      m.position.y += T * 0.22;
      const left = s.life;
      if (left < 2) { m.position.x += Math.sin(time * 40) * 0.0015; m.scale.setScalar(0.75 + 0.25 * left / 2); }
    } else if (s.state === 'held') {
      const h = hands.find(e => e.stone === k);
      let target = null;
      if (h) { handPos(h, m.position); target = dropTarget(h); }
      else if (mouse.held === k) {
        if (mouse.point) m.position.copy(mouse.point).add(_p.set(0, 0.06, 0));
        target = mouse.tile;
      } else traySlot(k, n, m.position);
      if (target) {
        board.marker.visible = true;
        board.marker.position.set((target.x - (W - 1) / 2) * T, 0.002, (target.y - (H - 1) / 2) * T);
        board.marker.material.color.set(game.canPlace(target.x, target.y) ? '#5fe07a' : '#ff5a6a');
      }
    }
  });
  // passar o mouse por cima de uma pedra: ela cresce um pouco
  if (mouse.hoverStone >= 0 && mouse.held < 0 && !renderer.xr.isPresenting) stoneMeshes[mouse.hoverStone].scale.multiplyScalar(1.18);
  if (!renderer.xr.isPresenting && mouse.held < 0 && mouse.tile && app === 'playing' && mouse.hoverStone < 0) { /* só o cursor */ }
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const msgEl = document.getElementById('msg');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  hintEl.innerHTML = app === 'playing'
    ? '<span>Setas/WASD: tatu · clique numa pedra da bandeja e depois numa casa · botão direito devolve · Esc: pausa</span>'
    : '<span>Clique nas opções do painel</span>';
}
function updateHud(dt) {
  const vr = renderer.xr.isPresenting;
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const playing = (app === 'playing' || app === 'done' || app === 'paused') && !demo;
  const rec = Math.max(best(save), playing ? game.score : 0);
  const stones = '◆'.repeat(game.stonesReady) + '◇'.repeat(game.stones.length - game.stonesReady);
  let status;
  if (demo) status = { text: 'DEMONSTRAÇÃO', color: '#ff6ab8' };
  else if (game.phase === 'ready') status = { text: 'PREPARE-SE!', color: '#5ff2ff' };
  else if (game.boss) status = { text: `${game.boss.info.name.toUpperCase()} ${'♥'.repeat(Math.max(0, game.boss.hp))}${'♡'.repeat(game.boss.maxHp - Math.max(0, game.boss.hp))}  PEDRAS ${stones}`, color: '#ff8a6a' };
  else status = { text: `FRUTINHAS ${game.fruitsLeft}  PEDRAS ${stones}${game.power > 0 ? `  PEQUI ${Math.ceil(game.power)}s` : ''}`, color: game.power > 0 ? '#ffcf3a' : '#5fe07a' };
  marquee.set([
    { text: demo ? 'TATU NO LABIRINTO' : `FASE ${level + 1} · ${LEVELS[level].name.toUpperCase()}`, size: 0.27, color: '#ffcf3a' },
    { text: `${pad(game.score)}  RECORDE ${pad(rec)}  ${'●'.repeat(Math.max(0, game.lives))}`, size: 0.34, color: '#fff4e0' },
    { ...status, size: 0.25 },
  ]);
  if (!vr) {
    msgLabel.mesh.visible = false;
    const mtxt = msg && playing ? msg.text : '';
    if (msgEl.dataset.last !== mtxt) { msgEl.textContent = mtxt; msgEl.style.color = msg?.color || '#fff'; msgEl.dataset.last = mtxt; }
    msgEl.style.display = mtxt ? 'block' : 'none';
    return;
  }
  msgEl.style.display = 'none';
  msgLabel.mesh.visible = playing && !!msg;
  if (msg) msgLabel.set([{ text: msg.text, size: 0.62, color: msg.color, bold: false }]);
  // aviso acima do letreiro, virado para a cabeça
  const hp = xrHeadPos();
  msgLabel.mesh.position.set(0, BOARD_POS.y + 0.4, BOARD_POS.z - 0.3);
  msgLabel.mesh.lookAt(hp);
}

// ---------- Eventos do jogo -> som, vibração, efeitos ----------
const tileWorldOf = (x, y) => board.tileWorld(x, y, new THREE.Vector3()).add(_p.set(0, T * 0.3, 0));
const panOf = (x) => ((x ?? 9) - (W - 1) / 2) / ((W - 1) / 2) * 0.8;
function handleEvents(evs) {
  const quiet = demo;
  for (const ev of evs) {
    switch (ev.type) {
      case 'fruit': if (!quiet) sfx.fruit(panOf(ev.x)); particles.burst(tileWorldOf(ev.x, ev.y), THEMES[LEVELS[level].world].fruit, 4, 0.12, 0.3, 0.006); break;
      case 'pequi':
        particles.burst(tileWorldOf(ev.x, ev.y), '#ffcf3a', 26, 0.3, 0.7, 0.012, 0.15);
        if (!quiet) { sfx.pequi(panOf(ev.x)); sfx.power(true); pulseAll(0.5, 80); showMsg('Pequi! O tatu virou bola: derrube as onças!', 2.2, '#ffcf3a'); }
        break;
      case 'power-warn': if (!quiet) sfx.powerWarn(); break;
      case 'power-end': if (!quiet) sfx.power(false); break;
      case 'knock': {
        particles.burst(tileWorldOf(ev.x, ev.y), '#ffffff', 22, 0.35, 0.6, 0.01, 0.2);
        if (!quiet) { sfx.knock(panOf(ev.x), Math.log2(ev.score / 200)); pulseAll(0.6, 60); showMsg(`+${ev.score}`, 1.2, '#ffffff'); }
        break;
      }
      case 'boss-hit':
        particles.burst(tileWorldOf(ev.x, ev.y), '#ff8a3a', 40, 0.45, 0.8, 0.014, 0.25);
        if (!quiet) { sfx.bossHit(panOf(ev.x)); pulseAll(1, 120); showMsg(ev.hp > 0 ? `Acertou! Faltam ${ev.hp}` : 'Derrubado!', 1.8, '#ff8a3a'); }
        break;
      case 'boss-down': for (let k = 0; k < 5; k++) setTimeout(() => particles.burst(tileWorldOf(ev.x + (Math.random() - 0.5) * 3, ev.y + (Math.random() - 0.5) * 3), k % 2 ? '#ffcf3a' : '#ff6ab8', 30, 0.5, 0.9, 0.014, 0.3), k * 160); break;
      case 'die':
        particles.burst(tileWorldOf(ev.x, ev.y), '#a8957a', 30, 0.3, 0.8, 0.01, 0.15);
        if (!quiet) { sfx.power(false); sfx.die(); pulseAll(1, 300); showMsg(ev.lives > 0 ? `Pegaram o tatu! Vidas: ${ev.lives}` : 'Pegaram o tatu...', 2, '#ff5a6a'); }
        if (!quiet) for (const h of hands) release(h);
        if (mouse.held >= 0 && game.stones[mouse.held]?.state === 'held') { game.drop(mouse.held, null, null); mouse.held = -1; }
        break;
      case 'ready': if (!quiet) sfx.ready(); break;
      case 'go': break;
      case 'release': if (!quiet) { const o = game.oncas[ev.i]; if (o.boss) { sfx.roar(0); showMsg(`${o.info.name} saiu da toca!`, 2, '#ff8a6a'); } else sfx.growl(0); } break;
      case 'stone-place': particles.burst(tileWorldOf(ev.x, ev.y), '#c8b8a0', 10, 0.12, 0.4, 0.008, 0.05); if (!quiet) sfx.stonePlace(panOf(ev.x)); break;
      case 'stone-back': if (!quiet) sfx.stoneBack(); break;
      case 'stone-crumble': particles.burst(tileWorldOf(ev.x, ev.y), '#9a948a', 16, 0.15, 0.6, 0.008, 0.05); if (!quiet) sfx.crumble(panOf(ev.x)); break;
      case 'stone-break':
        particles.burst(tileWorldOf(ev.x, ev.y), '#9a948a', 26, 0.3, 0.6, 0.01, 0.15);
        if (!quiet) { sfx.crumble(panOf(ev.x)); sfx.ram(panOf(ev.x)); showMsg('A Pintadona quebrou a pedra!', 1.6, '#ff8a6a'); }
        break;
      case 'stone-ram': if (!quiet) sfx.ram(panOf(ev.x)); break;
      case 'stone-ready': if (!quiet) sfx.stoneReady(); break;
      case 'caju-show': if (!quiet) { sfx.cajuShow(panOf(ev.x)); showMsg('Apareceu um caju! Vale muito ponto.', 2, '#ff8a3a'); } break;
      case 'caju': particles.burst(tileWorldOf(ev.x, ev.y), '#ff4a2a', 20, 0.25, 0.6, 0.01, 0.15); if (!quiet) { sfx.caju(panOf(ev.x)); showMsg(`Caju! +${ev.score}`, 1.6, '#ff8a3a'); } break;
      case 'extra-life': if (!quiet) { sfx.extraLife(); showMsg('Vida extra!', 2.2, '#5fe07a'); } break;
      case 'pequi-back': if (!quiet) showMsg('Os pequis voltaram!', 1.6, '#ffcf3a'); break;
      case 'hide': if (!quiet) sfx.hide(0); break;
      case 'show': if (!quiet) sfx.show(0); break;
      case 'mode': break;
      case 'won': if (!quiet) { sfx.power(false); sfx.won(); doneTimer = 2.2; } break;
      case 'lost': if (!quiet) { sfx.power(false); sfx.lost(); doneTimer = 1.6; } break;
    }
  }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const okXR = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!okXR) {
    vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS';
    vrBtn.disabled = true;
    return;
  }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) {
      vrBtn.textContent = 'Erro ao entrar em VR';
      console.error(err);
    }
  };
}
setupVR();

// ---------- Laço principal ----------
let acc = 0, lastT = performance.now(), time = 0;
let fpsFrames = 0, fpsTime = 0;

function tick(dt) {
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) recenter();
  pollButtons();
  rig.updateMatrixWorld(true);
  updatePcCamera();
  camera.updateMatrixWorld(true);
  if (!vr) mouseRay();

  const running = app === 'playing' || app === 'menu' || (app === 'done' && demo);
  if (running) {
    acc += dt;
    const n = Math.min(10, Math.floor(acc / DT));
    for (let i = 0; i < n; i++) {
      game.step(buildInput());
      handleEvents(game.events.splice(0));
    }
    acc -= n * DT;
    if (demo && game.over) newGame(Math.floor(Math.random() * LEVELS.length), { seed: Math.floor(Math.random() * 1e6) });
  } else acc = 0;
  if (app === 'playing' && doneTimer > 0) { doneTimer -= dt; if (doneTimer <= 0) finishLevel(); }
  if (app === 'done' && stageTimer > 0) { stageTimer -= dt; if (stageTimer <= 0) startLevel(level + 1, 'arcade', lastResult); }

  const ahead = app === 'paused' ? 0 : acc;
  updateCritters(dt, ahead);
  updateStones(dt);
  board.update(game, time);
  board.showTrail(dev.showPlan && (dev.autoplay || demo) ? robot.plan : null);
  if (app !== 'paused') particles.update(dt);
  particles.mat.uniforms.uScale.value = vr ? 800 : renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  world.update(dt, time);
  updateHud(dt);
  updateMenuRays();
  for (const h of hands) if (h.model) h.model.visible = !panel.visible;

  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}

function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.loadLevel(3)        abre a fase 3 (1 a 12); dev.arcade() começa o fliperama
// dev.autoplay = true     o robô joga (decide a cada 0,15 s; 0,8 s para pôr pedra)
// dev.showPlan = true     desenha o caminho que o robô escolheu
// dev.advance(20)         avança 20 s de jogo na hora
// dev.state()             resumo: tela, fase, pontos, vidas, frutinhas, onças, pedras
// dev.cam = [[x,y,z],[x,y,z]]   câmera do PC parada (posição, para onde olha); null volta ao normal
// dev.closeUp()           câmera perto do tatu
const dev = {
  _auto: false, showPlan: false, cam: null,
  closeUp(d = 0.22) {
    const p = tatuView.group.getWorldPosition(new THREE.Vector3());
    this.cam = [[p.x, p.y + d * 0.8, p.z + d], [p.x, p.y, p.z]];
    return this.advance(1 / 60);
  },
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; robot.reset(); updateHint(); },
  loadLevel(n) { startLevel(clamp(n, 1, LEVELS.length) - 1, 'level'); return this.state(); },
  arcade() { startLevel(0, 'arcade'); return this.state(); },
  advance(sec, step = 1 / 72) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  state() {
    return {
      tela: app, modo: mode, fase: level + 1, nome: LEVELS[level].name, etapa: game.phase, tempo: +game.t.toFixed(1),
      pontos: game.score, vidas: game.lives, frutinhas: game.fruitsLeft, pequi: +game.power.toFixed(1),
      tatu: [game.tatu.x, game.tatu.y], oncas: game.oncas.map(o => `${o.kind}:${o.state}`),
      pedras: game.stones.map(s => s.state), chefe: game.boss ? { nome: game.boss.info.name, vida: game.boss.hp } : null,
      resultado: game.result, salvo: save.done[level] || null,
    };
  },
  snapshot(w = 960) {
    renderer.render(scene, camera);
    const src = renderer.domElement, c = document.createElement('canvas');
    c.width = w; c.height = Math.round(w * src.height / src.width);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.88);
  },
  resetSave() { save.done = {}; save.scores = []; storeSave(save); },
};
window.dev = dev;
window.tatu = { dev, get game() { return game; }, save, sfx, robot, startLevel, goMenu, camera, scene, renderer, board };

goMenu();
renderer.setAnimationLoop(frame);

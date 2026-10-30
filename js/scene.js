// Tudo que se desenha: a paisagem de cada mundo (Cerrado de dia, Pantanal no fim da tarde,
// Caatinga à noite), a mesa com a maquete do labirinto, o tatu, as onças, frutinhas, pequis,
// caju, pedras e a bandeja, o letreiro de fliperama e as partículas.
// A maquete tem cara de brinquedo de feira: massinha, madeira e feltro.
import * as THREE from '../vendor/three/three.module.js';
import { W, H, WALL, PATH, DEN, DOOR } from './levels.js';

export const T = 0.045;                                       // tamanho de uma casa (m)
export const BOARD_POS = new THREE.Vector3(0, 0.95, -0.47);    // centro do tabuleiro (em cima da mesa)
export const HEAD_REF = new THREE.Vector3(0, 1.45, 0.05);      // onde a cabeça fica depois de recentralizar
export const TRAY_POS = new THREE.Vector3(0, 0.95, -0.06);     // bandeja das pedras (beira da mesa, perto do jogador)
export const BOARD_W = W * T, BOARD_D = H * T;

export const THEMES = [
  { // Cerrado, de dia
    sky: ['#7fc4ef', '#cfe9f2', '#f6e2b8'], fog: '#e9e2c8', ground: '#b88a52', ground2: '#9a6f3c',
    hemi: ['#fff6e0', '#7a5a3a', 0.95], sun: ['#fff1cf', 1.5, [-0.5, 1, 0.35]],
    floor: '#d9b77e', wall: ['#a8532e', '#c06a3a', '#8e4426'], wallTop: '#6e9a3a', fruit: '#ff4a5a', fruit2: '#ffd04a',
    board: '#7a4a28', night: false,
  },
  { // Pantanal, fim de tarde
    sky: ['#3e5a9a', '#e88a6a', '#ffcf8a'], fog: '#f0b48a', ground: '#4a7a3a', ground2: '#3a6a30',
    hemi: ['#ffd8b8', '#3a5a40', 0.9], sun: ['#ffb070', 1.4, [0.7, 0.45, -0.4]],
    floor: '#c8b88a', wall: ['#3f8a4a', '#57a858', '#2e6e3a'], wallTop: '#8acb5a', fruit: '#a050ff', fruit2: '#ff7ab8',
    board: '#5a3a24', night: false, water: '#3a7aa0',
  },
  { // Caatinga, à noite
    sky: ['#060a1e', '#14204a', '#3a3a6a'], fog: '#1a2040', ground: '#6a5a4a', ground2: '#504436',
    hemi: ['#8aa0ff', '#2a2430', 0.55], sun: ['#c8d8ff', 0.9, [0.4, 0.9, 0.6]],
    floor: '#9a8a70', wall: ['#7a7a80', '#8e8a8a', '#62626a'], wallTop: '#4a6a4a', fruit: '#5ff2ff', fruit2: '#ffe85a',
    board: '#4a3424', night: true,
  },
];

// ---------- Ajudantes de geometria (malhas mescladas com cor por vértice) ----------
export const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
function part(geo, color, m) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new THREE.Color(color), arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
function merge(parts) {
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3);
    nor.set(p.attributes.normal.array, o * 3);
    col.set(p.attributes.color.array, o * 3);
    o += p.attributes.position.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere();
  return g;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 10) => new THREE.CylinderGeometry(rt, rb, h, s);
const sph = (r, w = 12, h = 8) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, s = 10) => new THREE.ConeGeometry(r, h, s);
const HALF = Math.PI / 2;
const VC = () => new THREE.MeshLambertMaterial({ vertexColors: true });

// tile -> posição local no tabuleiro
export function tileLocal(x, y, out = new THREE.Vector3()) {
  return out.set((x - (W - 1) / 2) * T, 0, (y - (H - 1) / 2) * T);
}

// ---------- Mundo (céu, chão, paisagem, mesa) ----------
export function buildWorld() {
  const scene = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { cTop: { value: new THREE.Color() }, cMid: { value: new THREE.Color() }, cLow: { value: new THREE.Color() }, uStars: { value: 0 }, uMoon: { value: new THREE.Vector3(0.4, 0.5, -0.75).normalize() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 cTop, cMid, cLow; uniform float uStars; uniform vec3 uMoon; varying vec3 vD;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,37.719))) * 43758.5453); }
      void main(){
        float y = vD.y;
        vec3 c = y > 0.12 ? mix(cMid, cTop, smoothstep(0.12, 0.7, y)) : mix(cLow, cMid, smoothstep(-0.1, 0.12, y));
        if (uStars > 0.0) {
          vec3 q = floor(vD * 220.0);
          float s = step(0.994, h(q)) * smoothstep(0.05, 0.3, y);
          c += vec3(s) * uStars * (0.6 + 0.4 * h(q + 1.0));
          float m = dot(vD, uMoon);
          c += vec3(1.0, 0.97, 0.85) * (smoothstep(0.9985, 0.9992, m) + 0.25 * smoothstep(0.97, 0.9985, m) * uStars);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat);
  scene.add(sky);
  scene.fog = new THREE.Fog('#ffffff', 25, 180);

  const hemi = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  const sun = new THREE.DirectionalLight('#ffffff', 1.4);
  // lampião em cima da mesa (só à noite)
  const lamp = new THREE.PointLight('#ffc070', 0, 2.2, 1.6);
  lamp.position.set(0.35, BOARD_POS.y + 0.55, BOARD_POS.z - 0.1);
  const lampBulb = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd890' }));
  lampBulb.position.copy(lamp.position);
  scene.add(hemi, sun, sun.target, lamp, lampBulb);

  const groundMat = new THREE.MeshLambertMaterial({ color: '#888888' });
  const ground = new THREE.Mesh(new THREE.CircleGeometry(300, 48), groundMat);
  ground.rotation.x = -HALF;
  scene.add(ground);
  // manchas no chão (terra mais escura), perto
  const patchMat = new THREE.MeshLambertMaterial({ color: '#777777' });
  const patches = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), patchMat, 40);
  const rnd = mulberry(7);
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, r = 3 + rnd() * 30, s = 0.6 + rnd() * 2.6;
    patches.setMatrixAt(i, M(Math.cos(a) * r, 0.004, Math.sin(a) * r, -HALF, 0, rnd() * 3, s, s * (0.5 + rnd() * 0.5), 1));
  }
  scene.add(patches);
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshLambertMaterial({ color: '#3a7aa0', transparent: true, opacity: 0.85 }));
  water.rotation.x = -HALF;
  water.scale.set(14, 7, 1);
  water.position.set(-9, 0.01, -16);
  scene.add(water);

  // paisagem por mundo
  const sets = [cerradoSet(), pantanalSet(), caatingaSet()];
  for (const s of sets) scene.add(s);

  // mesa
  const table = buildTable();
  scene.add(table);

  // vaga-lumes na noite
  const flies = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ color: '#d8ff6a', size: 0.06, transparent: true, opacity: 0.9, depthWrite: false }));
  const fp = new Float32Array(60 * 3);
  for (let i = 0; i < 60; i++) { const a = rnd() * 6.28, r = 2 + rnd() * 10; fp.set([Math.cos(a) * r, 0.3 + rnd() * 2, Math.sin(a) * r], i * 3); }
  flies.geometry.setAttribute('position', new THREE.BufferAttribute(fp, 3));
  const fp0 = fp.slice();
  scene.add(flies);

  let theme = 0;
  function setTheme(i) {
    theme = i;
    const th = THEMES[i];
    skyMat.uniforms.cTop.value.set(th.sky[0]); skyMat.uniforms.cMid.value.set(th.sky[1]); skyMat.uniforms.cLow.value.set(th.sky[2]);
    skyMat.uniforms.uStars.value = th.night ? 1 : 0;
    scene.fog.color.set(th.fog);
    hemi.color.set(th.hemi[0]); hemi.groundColor.set(th.hemi[1]); hemi.intensity = th.hemi[2];
    sun.color.set(th.sun[0]); sun.intensity = th.sun[1];
    sun.position.set(...th.sun[2]).multiplyScalar(10);
    groundMat.color.set(th.ground);
    patchMat.color.set(th.ground2);
    water.visible = i === 1;
    sets.forEach((s, k) => { s.visible = k === i; });
    flies.visible = th.night;
    lamp.intensity = th.night ? 1.6 : 0;
    lampBulb.visible = th.night;
  }
  function update(dt, time) {
    if (flies.visible) {
      for (let i = 0; i < 60; i++) {
        fp[i * 3] = fp0[i * 3] + Math.sin(time * 0.4 + i) * 0.4;
        fp[i * 3 + 1] = fp0[i * 3 + 1] + Math.sin(time * 0.7 + i * 2.1) * 0.25;
      }
      flies.geometry.attributes.position.needsUpdate = true;
      flies.material.opacity = 0.55 + 0.4 * Math.sin(time * 3);
    }
  }
  setTheme(0);
  return { scene, setTheme, update, get theme() { return theme; } };
}

function mulberry(seed) {
  let a = seed;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// espalha objetos em volta, longe da mesa
function scatter(n, rMin, rMax, seed, fn) {
  const rnd = mulberry(seed), parts = [];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = rMin + rnd() * (rMax - rMin);
    fn(parts, Math.cos(a) * r, Math.sin(a) * r, rnd);
  }
  const m = new THREE.Mesh(merge(parts), VC());
  return m;
}
function cerradoSet() {
  const g = new THREE.Group();
  // árvores tortas do cerrado: tronco inclinado e copa achatada
  g.add(scatter(34, 4, 40, 3, (p, x, z, r) => {
    const h = 1.6 + r() * 2.2, lean = (r() - 0.5) * 0.5;
    p.push(part(cyl(0.07, 0.14, h, 6), '#5a3a24', M(x, h / 2, z, lean, 0, lean * 0.6)));
    const cx = x + Math.sin(lean * 0.6) * -h * 0.5, cz = z + Math.sin(lean) * h * 0.5;
    p.push(part(sph(1, 9, 6), r() > 0.5 ? '#6a8a32' : '#7e9a3a', M(cx, h + 0.2, cz, 0, r() * 3, 0, 0.9 + r() * 0.6, 0.38, 0.9 + r() * 0.6)));
  }));
  // cupinzeiros
  g.add(scatter(18, 3, 25, 9, (p, x, z, r) => { const h = 0.4 + r() * 0.8; p.push(part(cone(0.28 + r() * 0.2, h, 7), '#a8532e', M(x, h / 2, z))); }));
  // capim
  g.add(scatter(140, 3, 30, 5, (p, x, z, r) => {
    const c = r() > 0.5 ? '#c8b45a' : '#a89a48';
    for (let k = 0; k < 4; k++) p.push(part(cone(0.025, 0.25 + r() * 0.2, 3), c, M(x + (r() - 0.5) * 0.15, 0.12, z + (r() - 0.5) * 0.15, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)));
  }));
  return g;
}
function pantanalSet() {
  const g = new THREE.Group();
  // palmeiras (carandá): tronco fino e leque no alto
  g.add(scatter(26, 5, 40, 13, (p, x, z, r) => {
    const h = 3 + r() * 3;
    p.push(part(cyl(0.08, 0.12, h, 6), '#6a5a48', M(x, h / 2, z)));
    for (let k = 0; k < 7; k++) p.push(part(cone(0.18, 1.3, 4), '#3e7a3a', M(x + Math.cos(k) * 0.5, h + 0.1, z + Math.sin(k) * 0.5, Math.cos(k) * 1.2, 0, Math.sin(k) * 1.2)));
  }));
  // touceiras e aguapés
  g.add(scatter(80, 3, 30, 17, (p, x, z, r) => { p.push(part(sph(0.35 + r() * 0.3, 7, 5), r() > 0.4 ? '#4a8a3a' : '#5aa04a', M(x, 0.1, z, 0, 0, 0, 1, 0.5, 1))); }));
  // tuiuiús (de longe: corpo branco, pescoço preto)
  g.add(scatter(6, 6, 14, 21, (p, x, z, r) => {
    p.push(part(sph(0.22, 8, 6), '#f4f0e8', M(x, 0.75, z, 0, 0, 0, 1, 0.8, 1.4)));
    p.push(part(cyl(0.035, 0.05, 0.4, 5), '#1a1a1a', M(x, 1.0, z + 0.18, -0.3)));
    p.push(part(sph(0.06, 6, 4), '#c8302a', M(x, 1.0, z + 0.2)));
    p.push(part(cyl(0.015, 0.015, 0.55, 4), '#2a2a2a', M(x - 0.06, 0.3, z)));
    p.push(part(cyl(0.015, 0.015, 0.55, 4), '#2a2a2a', M(x + 0.06, 0.3, z)));
  }));
  return g;
}
function caatingaSet() {
  const g = new THREE.Group();
  // mandacarus: tronco com braços para cima
  g.add(scatter(30, 4, 36, 31, (p, x, z, r) => {
    const h = 1.5 + r() * 2;
    p.push(part(cyl(0.16, 0.18, h, 8), '#3e6a4a', M(x, h / 2, z)));
    for (let k = 0; k < 2; k++) {
      const s = k ? 1 : -1, y = h * (0.35 + r() * 0.25);
      p.push(part(cyl(0.11, 0.11, 0.4, 7), '#3e6a4a', M(x + s * 0.25, y, z, 0, 0, HALF)));
      p.push(part(cyl(0.11, 0.11, 0.7, 7), '#46744e', M(x + s * 0.42, y + 0.33, z)));
    }
  }));
  // pedras e galhos secos
  g.add(scatter(40, 3, 30, 37, (p, x, z, r) => { const s = 0.3 + r() * 0.9; p.push(part(new THREE.DodecahedronGeometry(s, 0), r() > 0.5 ? '#7a7068' : '#8a8078', M(x, s * 0.35, z, r(), r(), r(), 1, 0.6, 1))); }));
  g.add(scatter(30, 3, 25, 41, (p, x, z, r) => { p.push(part(cyl(0.02, 0.04, 1.2, 4), '#5a4a3a', M(x, 0.5, z, (r() - 0.5) * 0.9, 0, (r() - 0.5) * 0.9))); }));
  return g;
}

function buildTable() {
  const p = [];
  const top = BOARD_POS.y - 0.04;
  // tampo de madeira com bordas
  p.push(part(box(1.24, 0.04, 1.02), '#8a5a34', M(0, top - 0.02, BOARD_POS.z + 0.07)));
  p.push(part(box(1.26, 0.02, 1.04), '#6e4426', M(0, top - 0.05, BOARD_POS.z + 0.07)));
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) p.push(part(box(0.06, top - 0.06, 0.06), '#6e4426', M(sx * 0.55, (top - 0.06) / 2, BOARD_POS.z + 0.07 + sz * 0.44)));
  // toalhinha de feltro debaixo da bandeja
  p.push(part(box(0.5, 0.004, 0.12), '#c83a3a', M(TRAY_POS.x, top + 0.002, TRAY_POS.z)));
  const m = new THREE.Mesh(merge(p), VC());
  return m;
}

// ---------- Tabuleiro (maquete do labirinto) ----------
export class BoardView {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.copy(BOARD_POS);
    scene.add(this.group);
    this.base = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: '#7a4a28' }));
    this.floorMat = new THREE.MeshLambertMaterial({ color: '#d9b77e' });
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(BOARD_W, BOARD_D), this.floorMat);
    this.floor.rotation.x = -HALF;
    this.floor.position.y = 0.0005;
    this.base.scale.set(BOARD_W + 0.03, 0.04, BOARD_D + 0.03);
    this.base.position.y = -0.02;
    this.group.add(this.base, this.floor);
    // paredes: blocos de massinha com um tufo em cima
    const wallGeo = new THREE.BoxGeometry(T * 1.0, T * 0.4, T * 1.0);
    wallGeo.translate(0, T * 0.2, 0);
    this.walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), W * H);
    const topGeo = new THREE.SphereGeometry(T * 0.42, 7, 4);
    topGeo.scale(1, 0.4, 1); topGeo.translate(0, T * 0.42, 0);
    this.tops = new THREE.InstancedMesh(topGeo, new THREE.MeshLambertMaterial({ color: '#ffffff' }), W * H);
    this.group.add(this.walls, this.tops);
    // frutinhas, pequis
    this.fruitMat = new THREE.MeshLambertMaterial({ color: '#ff4a5a', emissive: '#000000' });
    this.fruits = new THREE.InstancedMesh(new THREE.SphereGeometry(T * 0.12, 8, 6), this.fruitMat, W * H);
    this.pequiMat = new THREE.MeshLambertMaterial({ color: '#ffc21a', emissive: '#ff9a00', emissiveIntensity: 0.5 });
    this.pequis = new THREE.InstancedMesh(new THREE.SphereGeometry(T * 0.24, 12, 8), this.pequiMat, 8);
    this.group.add(this.fruits, this.pequis);
    // toca: cabaninha de palha em volta das 3 casas do meio e uma porteira
    this.den = buildDen();
    this.group.add(this.den.group);
    // caju
    this.caju = buildCaju();
    this.caju.visible = false;
    this.group.add(this.caju);
    // marcador de onde a pedra vai cair
    this.marker = new THREE.Mesh(new THREE.RingGeometry(T * 0.32, T * 0.48, 20), new THREE.MeshBasicMaterial({ color: '#5fe07a', transparent: true, opacity: 0.85, depthWrite: false }));
    this.marker.rotation.x = -HALF;
    this.marker.position.y = 0.002;
    this.marker.visible = false;
    this.group.add(this.marker);
    // trilha da demonstração (robô): pontinhos
    this.trail = new THREE.InstancedMesh(new THREE.CircleGeometry(T * 0.08, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false }), 40);
    this.trail.count = 0;
    this.group.add(this.trail);
    this._m = new THREE.Matrix4(); this._v = new THREE.Vector3(); this._c = new THREE.Color();
    this.key = null;
  }

  setLevel(game, theme) {
    const th = THEMES[theme];
    this.base.material.color.set(th.board);
    this.floorMat.color.set(th.floor);
    this.fruitMat.color.set(th.fruit);
    this.fruitMat.emissive.set(th.night ? th.fruit : '#000000');
    this.fruitMat.emissiveIntensity = th.night ? 0.6 : 0;
    this.den.setTheme(theme);
    const rnd = mulberry(game.def.seed);
    let n = 0;
    const g = game.grid;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (g[y * W + x] !== WALL) continue;
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      tileLocal(x, y, this._v);
      const s = 0.94 + rnd() * 0.1;
      this._m.compose(this._v, new THREE.Quaternion(), new THREE.Vector3(s, border ? 1.15 : 0.85 + rnd() * 0.35, s));
      this.walls.setMatrixAt(n, this._m);
      this.walls.setColorAt(n, this._c.set(th.wall[Math.floor(rnd() * 3)]));
      this.tops.setMatrixAt(n, this._m);
      this.tops.setColorAt(n, this._c.set(th.wallTop).offsetHSL(0, 0, (rnd() - 0.5) * 0.08));
      n++;
    }
    this.walls.count = this.tops.count = n;
    this.walls.instanceMatrix.needsUpdate = this.tops.instanceMatrix.needsUpdate = true;
    if (this.walls.instanceColor) this.walls.instanceColor.needsUpdate = true;
    if (this.tops.instanceColor) this.tops.instanceColor.needsUpdate = true;
    this.key = null;
  }

  update(game, time) {
    // frutinhas (só reconstrói quando muda)
    const key = game.fruitsLeft + ':' + game.pequi.join('');
    if (key !== this.key) {
      this.key = key;
      let n = 0, k = 0;
      for (let i = 0; i < W * H; i++) {
        if (game.fruit[i]) { tileLocal(i % W, (i / W) | 0, this._v); this._v.y = T * 0.16; this._m.makeTranslation(this._v.x, this._v.y, this._v.z); this.fruits.setMatrixAt(n++, this._m); }
        if (game.pequi[i]) { tileLocal(i % W, (i / W) | 0, this._v); this._v.y = T * 0.3; this._m.makeTranslation(this._v.x, this._v.y, this._v.z); this.pequis.setMatrixAt(k++, this._m); }
      }
      this.fruits.count = n; this.pequis.count = k;
      this.fruits.instanceMatrix.needsUpdate = this.pequis.instanceMatrix.needsUpdate = true;
    }
    const pul = 0.5 + 0.5 * Math.sin(time * 6);
    this.pequiMat.emissiveIntensity = 0.3 + pul * 0.6;
    this.pequis.position.y = Math.sin(time * 3) * T * 0.05;
    // caju
    this.caju.visible = !!game.caju;
    if (game.caju) {
      tileLocal(game.caju.x, game.caju.y, this.caju.position);
      this.caju.position.y = T * 0.25 + Math.sin(time * 4) * T * 0.06;
      this.caju.rotation.y = time * 1.5;
      this.caju.visible = game.caju.t > 2 || Math.sin(time * 20) > 0;
    }
    this.den.update(game, time);
  }

  showTrail(plan) {
    if (!plan) { this.trail.count = 0; return; }
    const n = Math.min(plan.length, 40);
    for (let k = 0; k < n; k++) {
      const i = plan[k];
      tileLocal(i % W, (i / W) | 0, this._v);
      this._m.compose(this._v.setY(0.001), new THREE.Quaternion().setFromEuler(new THREE.Euler(-HALF, 0, 0)), new THREE.Vector3(1, 1, 1));
      this.trail.setMatrixAt(k, this._m);
    }
    this.trail.count = n;
    this.trail.instanceMatrix.needsUpdate = true;
  }

  // posição no mundo -> casa (ou null se fora do tabuleiro)
  worldToTile(p) {
    const l = this.group.worldToLocal(p.clone());
    const x = Math.round(l.x / T + (W - 1) / 2), y = Math.round(l.z / T + (H - 1) / 2);
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return { x, y, h: l.y };
  }
  tileWorld(x, y, out = new THREE.Vector3()) {
    tileLocal(x, y, out);
    return this.group.localToWorld(out);
  }
}

function buildDen() {
  const group = new THREE.Group();
  const roof = new THREE.Mesh(merge([
    part(cyl(T * 0.62, T * 0.62, T * 3.4, 3), '#d8aa5a', M(0, T * 1.02, 0, -HALF, 0, HALF)),   // telhado de palha (duas águas)
    part(box(T * 3.1, T * 0.05, T * 0.9), '#a87a3a', M(0, T * 0.74, 0)),
    part(cyl(T * 0.06, T * 0.06, T * 0.8, 5), '#6a4a2a', M(-T * 1.5, T * 0.4, -T * 0.45)),
    part(cyl(T * 0.06, T * 0.06, T * 0.8, 5), '#6a4a2a', M(T * 1.5, T * 0.4, -T * 0.45)),
    part(cyl(T * 0.06, T * 0.06, T * 0.8, 5), '#6a4a2a', M(-T * 1.5, T * 0.4, T * 0.45)),
    part(cyl(T * 0.06, T * 0.06, T * 0.8, 5), '#6a4a2a', M(T * 1.5, T * 0.4, T * 0.45)),
  ]), VC());
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(T * 3, T * 1), new THREE.MeshLambertMaterial({ color: '#5a3a24' }));
  floor.rotation.x = -HALF; floor.position.y = 0.001;
  // porteira (abre quando uma onça sai)
  const gate = new THREE.Group();
  const gateMesh = new THREE.Mesh(merge([
    part(box(T * 0.9, T * 0.06, T * 0.05), '#8a5a2a', M(T * 0.45, T * 0.15, 0)),
    part(box(T * 0.9, T * 0.06, T * 0.05), '#8a5a2a', M(T * 0.45, T * 0.35, 0)),
    part(box(T * 0.06, T * 0.42, T * 0.05), '#6a4422', M(T * 0.05, T * 0.22, 0)),
    part(box(T * 0.06, T * 0.42, T * 0.05), '#6a4422', M(T * 0.85, T * 0.22, 0)),
  ]), VC());
  gate.add(gateMesh);
  const c = tileLocal(9, 7);
  group.position.copy(c);
  floor.position.x = 0;
  const door = tileLocal(9, 6).sub(c);
  gate.position.set(door.x - T * 0.45, 0, door.z + T * 0.5);
  group.add(roof, floor, gate);
  let open = 0;
  return {
    group,
    setTheme(i) { roof.visible = true; floor.material.color.set(i === 2 ? '#3a2a20' : '#5a3a24'); },
    update(game, time) {
      const near = game.oncas.some(o => (o.state === 'leave' || o.state === 'back') && Math.abs(o.x - 9) + Math.abs(o.y - 6) <= 1);
      open += ((near ? 1 : 0) - open) * 0.2;
      gate.rotation.y = -open * 1.6;
    },
  };
}

function buildCaju() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge([
    part(sph(T * 0.22, 10, 8), '#ff4a2a', M(0, 0, 0, 0, 0, 0, 1, 1.25, 1)),
    part(sph(T * 0.12, 8, 6), '#7a4a2a', M(0, -T * 0.32, 0, 0, 0, 0.4, 1, 0.8, 1.3)),
    part(cone(T * 0.06, T * 0.12, 5), '#3a8a3a', M(0, T * 0.3, 0)),
  ]), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#601000' })));
  return g;
}

// ---------- Tatu ----------
export function buildTatu() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(1.3);
  g.add(body);
  const shellParts = [];
  // casco: cinco faixas (cinta) de tons alternados
  for (let k = 0; k < 5; k++) {
    const z = (k - 2) * T * 0.13;
    const r = T * (0.3 - Math.abs(k - 2) * 0.03);
    shellParts.push(part(new THREE.CylinderGeometry(r, r, T * 0.13, 14, 1, true, -HALF, Math.PI), k % 2 ? '#a8957a' : '#8e7a62', M(0, 0, z, -HALF, 0, 0)));
  }
  const cap = new THREE.SphereGeometry(T * 0.24, 12, 6, 0, Math.PI * 2, 0, HALF);
  shellParts.push(part(cap, '#7e6a54', M(0, 0, -T * 0.32, 0, 0, 0, 1, 1, 0.7)));
  shellParts.push(part(cap, '#7e6a54', M(0, 0, T * 0.32, 0, 0, 0, 1, 1, 0.7)));
  const shell = new THREE.Mesh(merge(shellParts), new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  shell.position.y = T * 0.08;
  shell.rotation.z = 0;
  body.add(shell);
  const skin = new THREE.Mesh(merge([
    part(cone(T * 0.11, T * 0.32, 8), '#d8b898', M(0, T * 0.1, -T * 0.52, -HALF - 0.25)),          // focinho
    part(sph(T * 0.03, 6, 4), '#2a1a12', M(0, T * 0.07, -T * 0.67)),                               // narizinho
    part(cone(T * 0.045, T * 0.13, 5), '#c8a888', M(-T * 0.07, T * 0.24, -T * 0.42, 0.3, 0, 0.3)),   // orelhas
    part(cone(T * 0.045, T * 0.13, 5), '#c8a888', M(T * 0.07, T * 0.24, -T * 0.42, 0.3, 0, -0.3)),
    part(cone(T * 0.05, T * 0.4, 6), '#a8957a', M(0, T * 0.05, T * 0.58, HALF + 0.2)),              // rabo
  ]), VC());
  body.add(skin);
  const eyes = new THREE.Mesh(merge([
    part(sph(T * 0.028, 6, 4), '#111111', M(-T * 0.075, T * 0.17, -T * 0.43)),
    part(sph(T * 0.028, 6, 4), '#111111', M(T * 0.075, T * 0.17, -T * 0.43)),
  ]), VC());
  body.add(eyes);
  const legs = [];
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const l = new THREE.Mesh(cyl(T * 0.04, T * 0.05, T * 0.12, 5), new THREE.MeshLambertMaterial({ color: '#9a8468' }));
    l.position.set(x * T * 0.16, -T * 0.02, z * T * 0.18);
    body.add(l); legs.push(l);
  }
  // bola (pequi): o tatu enrola
  const ball = new THREE.Mesh(merge([
    part(sph(T * 0.33, 14, 10), '#9a866c'),
    part(new THREE.TorusGeometry(T * 0.33, T * 0.025, 5, 20), '#7a6650', M(0, 0, 0, 0, 0, 0)),
    part(new THREE.TorusGeometry(T * 0.33, T * 0.025, 5, 20), '#7a6650', M(0, 0, 0, 0, 0.6, 0)),
    part(new THREE.TorusGeometry(T * 0.33, T * 0.025, 5, 20), '#7a6650', M(0, 0, 0, 0, -0.6, 0)),
  ]), new THREE.MeshLambertMaterial({ vertexColors: true, emissive: '#ffa020', emissiveIntensity: 0 }));
  ball.position.y = T * 0.33;
  ball.scale.setScalar(1.2);
  ball.visible = false;
  g.add(ball);
  const shadow = blob(T * 0.36);
  g.add(shadow);
  let walk = 0, roll = 0;
  return {
    group: g,
    update(dt, moving, power, dying, time) {
      walk += moving ? dt * 18 : 0;
      body.visible = !power;
      ball.visible = power;
      if (power) {
        if (moving) roll += dt * 14;
        ball.rotation.x = -roll;
        ball.material.emissiveIntensity = 0.25 + 0.2 * Math.sin(time * 12);
      }
      body.position.y = T * 0.12 + (moving ? Math.abs(Math.sin(walk)) * T * 0.04 : 0);
      legs.forEach((l, k) => { l.rotation.x = moving ? Math.sin(walk + (k % 2 ? Math.PI : 0) + (k > 1 ? Math.PI : 0)) * 0.6 : 0; });
      if (dying > 0) { g.rotation.z = Math.min(Math.PI, (1.8 - dying) * 5); g.position.y = Math.sin(Math.min(1, (1.8 - dying)) * Math.PI) * T * 0.8; }
      else g.rotation.z = 0;
    },
  };
}

function blob(r) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  m.rotation.x = -HALF;
  m.position.y = 0.0015;
  return m;
}

// pelagem pintada (rosetas) num canvas
function spotTexture(base, spot, ring) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 128, 64);
  const r = mulberry(5);
  for (let i = 0; i < 40; i++) {
    const px = r() * 128, py = r() * 64, s = 3 + r() * 4;
    x.fillStyle = spot;
    x.beginPath(); x.arc(px, py, s, 0, 6.3); x.fill();
    if (ring) { x.fillStyle = ring; x.beginPath(); x.arc(px, py, s * 0.5, 0, 6.3); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- Onças e chefes ----------
const FEAR = new THREE.Color('#8ab8ff'), FLASH = new THREE.Color('#ffffff');
export function buildOnca(kind) {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const S = 1.25 * ({ pintadona: 1.35, jacare: 1.3, lobo: 1.25, gato: 0.8 }[kind] || 1);
  body.scale.setScalar(S);
  const looks = {
    pintada: ['#e8a83a', '#2a1a10', '#c8882a'], pintadona: ['#ffb02a', '#2a1a10', '#d88a1a'],
    parda: ['#b0703a', null], farejadora: ['#2a2a32', '#16161c'], gato: ['#c8b890', '#5a4a3a'],
  };
  const mats = [];
  let eyesMat = null;
  if (kind === 'jacare') {
    const mat = new THREE.MeshLambertMaterial({ color: '#4e4a26' });
    mats.push(mat);
    const belly = new THREE.MeshLambertMaterial({ color: '#c8c88a' });
    const parts = [
      [box(T * 0.34, T * 0.16, T * 0.62), mat, [0, T * 0.12, 0]],
      [box(T * 0.24, T * 0.1, T * 0.36), mat, [0, T * 0.1, -T * 0.46]],     // focinho comprido
      [box(T * 0.2, T * 0.04, T * 0.3), belly, [0, T * 0.05, -T * 0.46]],
      [cone(T * 0.12, T * 0.55, 6), mat, [0, T * 0.1, T * 0.55]],
    ];
    for (const [geo, m, p] of parts) {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(...p);
      if (geo.type === 'ConeGeometry') mesh.rotation.x = HALF;
      body.add(mesh);
    }
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(cone(T * 0.03, T * 0.06, 4), mat); s.position.set(0, T * 0.23, -T * 0.2 + k * T * 0.12); body.add(s); }
    eyesMat = new THREE.MeshBasicMaterial({ color: '#ffe84a' });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(sph(T * 0.04, 6, 4), eyesMat); e.position.set(s * T * 0.08, T * 0.21, -T * 0.3); body.add(e); }
  } else {
    let mat;
    if (kind === 'lobo') mat = new THREE.MeshLambertMaterial({ color: '#d86a3a', transparent: true });
    else {
      const L = looks[kind] || looks.pintada;
      mat = new THREE.MeshLambertMaterial({ color: '#ffffff', map: L[1] ? spotTexture(L[0], L[1], L[2]) : null, transparent: true });
      if (!L[1]) mat.color.set(L[0]);
    }
    mats.push(mat);
    const tall = kind === 'lobo' ? 1.5 : 1;
    const torso = new THREE.Mesh(sph(T * 0.2, 12, 8), mat);
    torso.scale.set(0.85, 0.75, 1.55);
    torso.position.y = T * 0.22 * tall;
    const head = new THREE.Mesh(sph(T * 0.15, 12, 8), mat);
    head.position.set(0, T * 0.32 * tall, -T * 0.32);
    const ears = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(kind === 'lobo' ? cone(T * 0.05, T * 0.16, 5) : sph(T * 0.05, 6, 4), mat);
      e.position.set(s * T * 0.09, T * (kind === 'lobo' ? 0.5 : 0.44) * tall, -T * 0.3);
      ears.push(e);
    }
    const snout = new THREE.Mesh(sph(T * 0.07, 8, 6), new THREE.MeshLambertMaterial({ color: kind === 'farejadora' ? '#3a3a44' : '#f0e0c8', transparent: true }));
    snout.position.set(0, T * 0.28 * tall, -T * 0.45);
    if (kind === 'lobo') snout.scale.set(0.8, 0.8, 1.6);
    mats.push(snout.material);
    const tail = new THREE.Mesh(cyl(T * 0.03, T * 0.045, T * 0.42, 5), mat);
    tail.position.set(0, T * 0.26 * tall, T * 0.42);
    tail.rotation.x = 0.9;
    body.add(torso, head, ...ears, snout, tail);
    const legMat = kind === 'lobo' ? new THREE.MeshLambertMaterial({ color: '#1a1a1a', transparent: true }) : mat;
    if (legMat !== mat) mats.push(legMat);
    body.userData.legs = [];
    for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const l = new THREE.Mesh(cyl(T * 0.04, T * 0.04, T * 0.2 * tall, 5), legMat);
      l.position.set(x * T * 0.1, T * 0.1 * tall, z * T * 0.18);
      body.add(l); body.userData.legs.push(l);
    }
    eyesMat = new THREE.MeshBasicMaterial({ color: kind === 'farejadora' || kind === 'lobo' ? '#ffd84a' : '#2a6a2a' });
    for (const s of [-1, 1]) { const e = new THREE.Mesh(sph(T * 0.03, 6, 4), eyesMat); e.position.set(s * T * 0.06, T * 0.36 * tall, -T * 0.44); body.add(e); }
  }
  const baseColors = mats.map(m => m.color.clone());
  // estrelinhas de tonta (depois de derrubada)
  const dizzy = new THREE.Group();
  for (let k = 0; k < 3; k++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(T * 0.06, 0), new THREE.MeshBasicMaterial({ color: '#ffe84a' }));
    s.position.set(Math.cos(k * 2.1) * T * 0.2, 0, Math.sin(k * 2.1) * T * 0.2);
    dizzy.add(s);
  }
  dizzy.position.y = T * 0.62 * S;
  dizzy.visible = false;
  g.add(dizzy);
  const shadow = blob(T * 0.32 * S);
  g.add(shadow);
  let walk = Math.random() * 6;
  return {
    group: g,
    update(dt, o, power, time, moving) {
      walk += moving ? dt * (o.state === 'back' ? 30 : 16) : 0;
      body.position.y = moving ? Math.abs(Math.sin(walk)) * T * 0.03 : 0;
      for (const [k, l] of (body.userData.legs || []).entries()) l.rotation.x = moving ? Math.sin(walk + (k % 2) * Math.PI + (k > 1 ? Math.PI : 0)) * 0.7 : 0;
      const fear = o.state === 'fear';
      const flash = fear && power < 1.5 && Math.sin(time * 18) > 0;
      mats.forEach((m, k) => {
        if (fear) m.color.copy(baseColors[k]).lerp(flash ? FLASH : FEAR, 0.75);
        else m.color.copy(baseColors[k]);
        m.opacity = o.state === 'back' ? 0.35 : o.hidden ? 0.07 : 1;
      });
      if (eyesMat) eyesMat.color.set(fear ? '#ffffff' : (o.kind === 'farejadora' || o.kind === 'lobo' ? '#ffd84a' : o.kind === 'jacare' ? '#ffe84a' : '#2a6a2a'));
      body.position.x = fear ? Math.sin(time * 50) * T * 0.02 : 0;     // tremendo de medo
      if (o.breakT > 0) body.position.z = -Math.abs(Math.sin(time * 18)) * T * 0.15;  // dando cabeçada na pedra
      else body.position.z = 0;
      dizzy.visible = o.state === 'back';
      dizzy.rotation.y = time * 6;
      shadow.visible = !o.hidden;
    },
  };
}

// pegadas do Lobo Fantasma (aparecem enquanto ele está escondido)
export class Footprints {
  constructor(group) {
    this.mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(T * 0.07, 6), new THREE.MeshBasicMaterial({ color: '#ffb080', transparent: true, opacity: 0.8, depthWrite: false }), 24);
    this.mesh.count = 0;
    group.add(this.mesh);
    this.list = [];
    this._m = new THREE.Matrix4();
  }
  update(lobo, pos, time) {
    if (lobo && lobo.hidden && (!this.last || time - this.last > 0.18)) {
      this.last = time;
      this.list.push({ x: pos.x + (this.list.length % 2 ? 1 : -1) * T * 0.07, z: pos.z, t: time });
      if (this.list.length > 24) this.list.shift();
    }
    this.list = this.list.filter(p => time - p.t < 2.2);
    this.list.forEach((p, k) => {
      this._m.compose(new THREE.Vector3(p.x, 0.0018, p.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-HALF, 0, 0)), new THREE.Vector3(1, 1.4, 1));
      this.mesh.setMatrixAt(k, this._m);
    });
    this.mesh.count = this.list.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Pedras e bandeja ----------
export function buildStone(i) {
  const geo = new THREE.DodecahedronGeometry(T * 0.4, 1);
  const p = geo.attributes.position;
  const r = mulberry(31 + i * 7);
  for (let k = 0; k < p.count; k++) {
    const s = 0.82 + r() * 0.3;
    p.setXYZ(k, p.getX(k) * s, p.getY(k) * s * 0.75, p.getZ(k) * s);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: ['#9a948a', '#8a8478', '#a8a094'][i % 3], flatShading: true }));
  return mesh;
}
export function buildTray(n) {
  const g = new THREE.Group();
  g.position.copy(TRAY_POS);
  const w = 0.07 * n + 0.04;
  g.add(new THREE.Mesh(merge([
    part(box(w, 0.012, 0.08), '#a8743e', M(0, 0.006, 0)),
    part(box(w, 0.02, 0.008), '#8a5a2a', M(0, 0.014, 0.036)),
    part(box(w, 0.02, 0.008), '#8a5a2a', M(0, 0.014, -0.036)),
    part(box(0.008, 0.02, 0.08), '#8a5a2a', M(w / 2, 0.014, 0)),
    part(box(0.008, 0.02, 0.08), '#8a5a2a', M(-w / 2, 0.014, 0)),
  ]), VC()));
  return g;
}
export const traySlot = (i, n, out = new THREE.Vector3()) => out.set(TRAY_POS.x + (i - (n - 1) / 2) * 0.07, TRAY_POS.y + 0.026, TRAY_POS.z);

// mão simples para o VR (luva de feltro)
export function buildHand(side) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(merge([
    part(sph(0.03, 10, 8), '#f0c890', M(0, 0, 0.01, 0, 0, 0, 1, 0.7, 1.2)),
    part(cyl(0.008, 0.008, 0.035, 6), '#f0c890', M(side * 0.024, 0, -0.01, 0, 0, side * 0.8)),
    part(cyl(0.02, 0.022, 0.03, 8), side < 0 ? '#3a7ac8' : '#c83a3a', M(0, 0, 0.05, HALF, 0, 0)),
  ]), VC()));
  return g;
}

// ---------- Partículas (pontos aditivos) ----------
export class Particles {
  constructor(scene, cap = 600) {
    this.cap = cap;
    this.p = new Float32Array(cap * 3); this.v = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.life = new Float32Array(cap); this.max = new Float32Array(cap); this.s0 = new Float32Array(cap);
    this.next = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: 'attribute vec3 pcolor; attribute float size; attribute float alpha; uniform float uScale; varying vec3 vC; varying float vA; void main(){ vC = pcolor; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = min(128.0, size * uScale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); if (d > 0.5) discard; float a = vA * (1.0 - d * 2.0); gl_FragColor = vec4(vC * a, a); }',
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.tmp = new THREE.Color();
  }
  burst(p, color, n, speed, life = 0.6, size = 0.01, up = 0) {
    for (let k = 0; k < n; k++) {
      const i = this.next; this.next = (this.next + 1) % this.cap;
      const a = Math.random() * Math.PI * 2, u = Math.random(), s = speed * (0.4 + Math.random() * 0.6);
      this.p.set([p.x, p.y, p.z], i * 3);
      this.v.set([Math.cos(a) * s * (1 - u * 0.5), up + u * s, Math.sin(a) * s * (1 - u * 0.5)], i * 3);
      this.tmp.set(color);
      this.col.set([this.tmp.r, this.tmp.g, this.tmp.b], i * 3);
      this.life[i] = this.max[i] = life * (0.6 + Math.random() * 0.6); this.s0[i] = size * (0.6 + Math.random() * 0.8); this.alpha[i] = 1;
    }
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt;
      this.v[i * 3 + 1] -= 0.6 * dt;
      for (let j = 0; j < 3; j++) { this.v[i * 3 + j] *= 1 - 2 * dt; this.p[i * 3 + j] += this.v[i * 3 + j] * dt; }
      const f = Math.max(0, this.life[i] / this.max[i]);
      this.alpha[i] = f;
      this.size[i] = this.s0[i] * (0.5 + 0.5 * f);
    }
    for (const a of ['position', 'size', 'alpha', 'pcolor']) this.geo.attributes[a].needsUpdate = true;
  }
}

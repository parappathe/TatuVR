// As 12 fases (3 mundos de 4; a 4ª de cada mundo é chefe) e o gerador de labirintos.
// Sem navegador: roda no Node nos testes.
//
// Labirinto: grade de W x H casas (ímpares). Casas com x e y ímpares são "salas" do gerador;
// as outras são parede ou corredor entre salas. O gerador cava a metade esquerda e espelha
// (fica simétrico como nos fliperamas), depois tira todos os becos sem saída e abre algumas
// voltas extras. No meio fica a toca das onças, com uma porta em cima.
import { rng } from './vec.js';

export const W = 19, H = 15;
export const WALL = 0, PATH = 1, DEN = 2, DOOR = 3;
export const DEN_TILES = [[8, 7], [9, 7], [10, 7]];
export const DOOR_TILE = [9, 6];
export const OUT_TILE = [9, 5];          // casa logo acima da porta, onde a onça sai
export const TATU_START = [9, 11];
export const CORNERS = [[1, 1], [17, 1], [1, 13], [17, 13]];

// Tipos de onça (cada uma caça de um jeito):
//   pintada     persegue pelo caminho mais curto
//   parda       corta caminho: mira 4 casas na frente do tatu
//   farejadora  segue o rastro do tatu (onde ele passou uns segundos antes)
//   gato        gato-do-mato: rápido, anda à toa, mas avança se enxerga o tatu no corredor
// Chefes: pintadona (quebra pedra), jacare (rápido na reta, lento na curva), lobo (some e reaparece)
export const WORLDS = [
  { name: 'Cerrado', theme: 0, hint: 'Coma todas as frutinhas. Pedras na mesa: ponha na frente das onças.' },
  { name: 'Pantanal', theme: 1, hint: 'Chegou o gato-do-mato: rápido e sem rumo, mas avança se te vê.' },
  { name: 'Caatinga à noite', theme: 2, hint: 'Noite: onças mais rápidas e o pequi dura menos.' },
];

export const LEVELS = [
  // ---- Cerrado ----
  { world: 0, name: 'Primeiros passos', seed: 11, loops: 4, oncas: ['pintada'], tatu: 4.6, onca: 3.6, power: 7.5, stones: 2 },
  { world: 0, name: 'Duas pintas', seed: 23, loops: 4, oncas: ['pintada', 'parda'], tatu: 4.6, onca: 3.7, power: 7, stones: 2 },
  { world: 0, name: 'Faro fino', seed: 37, loops: 3, oncas: ['pintada', 'parda', 'farejadora'], tatu: 4.6, onca: 3.8, power: 7, stones: 2 },
  { world: 0, name: 'A Pintadona', seed: 41, loops: 5, oncas: ['pintada'], boss: 'pintadona', bossHp: 3, tatu: 4.6, onca: 3.7, power: 7, stones: 2 },
  // ---- Pantanal ----
  { world: 1, name: 'Beira do rio', seed: 53, loops: 4, oncas: ['pintada', 'parda', 'gato'], tatu: 4.7, onca: 3.75, power: 6.5, stones: 2 },
  { world: 1, name: 'Bando completo', seed: 71, loops: 4, oncas: ['pintada', 'parda', 'farejadora', 'gato'], tatu: 4.7, onca: 3.8, power: 6.5, stones: 3 },
  { world: 1, name: 'Cheia', seed: 67, loops: 3, oncas: ['pintada', 'parda', 'farejadora', 'gato'], tatu: 4.7, onca: 3.85, power: 6, stones: 3 },
  { world: 1, name: 'O Jacaré-Açu', seed: 83, loops: 5, oncas: ['parda', 'gato'], boss: 'jacare', bossHp: 3, tatu: 4.7, onca: 3.75, power: 6.5, stones: 2 },
  // ---- Caatinga à noite ----
  { world: 2, name: 'Lua nova', seed: 191, loops: 4, oncas: ['pintada', 'parda', 'farejadora', 'gato'], tatu: 4.8, onca: 3.85, power: 5.5, stones: 3 },
  { world: 2, name: 'Mandacaru', seed: 101, loops: 3, oncas: ['pintada', 'parda', 'farejadora', 'gato'], tatu: 4.8, onca: 3.9, power: 5, stones: 3 },
  { world: 2, name: 'Cinco pintas', seed: 251, loops: 4, oncas: ['pintada', 'pintada', 'parda', 'farejadora', 'gato'], tatu: 4.8, onca: 3.85, power: 5, stones: 3 },
  { world: 2, name: 'O Lobo Fantasma', seed: 223, loops: 5, oncas: ['pintada', 'farejadora'], boss: 'lobo', bossHp: 4, tatu: 4.8, onca: 3.85, power: 5.5, stones: 3 },
];

// Gera o labirinto de uma fase (sempre o mesmo para a mesma semente).
export function buildMaze(def) {
  const rand = rng(def.seed);
  const CW = (W - 1) / 2, CH = (H - 1) / 2;      // 9 x 7 salas
  const mid = (CW - 1) / 2;                      // coluna do meio (4)
  const g = new Uint8Array(W * H);
  const at = (x, y) => g[y * W + x];
  const set = (x, y, v) => { g[y * W + x] = v; };
  const blocked = (cx, cy) => cy === 3 && cx >= mid - 1 && cx <= mid + 1;   // salas da toca
  const tile = (cx, cy) => [cx * 2 + 1, cy * 2 + 1];
  const inLeft = (cx, cy) => cx >= 0 && cx <= mid && cy >= 0 && cy < CH && !blocked(cx, cy);
  const mirror = (x) => W - 1 - x;
  const open = (x, y) => { set(x, y, PATH); set(mirror(x), y, PATH); };

  // 1) labirinto perfeito na metade esquerda (busca em profundidade)
  const seen = new Set();
  const stack = [[0, 0]];
  seen.add('0,0');
  open(...tile(0, 0));
  const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = N4.map(([dx, dy]) => [cx + dx, cy + dy]).filter(([nx, ny]) => inLeft(nx, ny) && !seen.has(nx + ',' + ny));
    if (!opts.length) { stack.pop(); continue; }
    const [nx, ny] = opts[Math.floor(rand() * opts.length)];
    seen.add(nx + ',' + ny);
    const [ax, ay] = tile(cx, cy), [bx, by] = tile(nx, ny);
    open((ax + bx) / 2, (ay + by) / 2);
    open(bx, by);
    stack.push([nx, ny]);
  }

  // salas abertas ligadas a uma sala (na grade cheia, já espelhada)
  const links = (cx, cy) => {
    const [x, y] = tile(cx, cy);
    return N4.filter(([dx, dy]) => at(x + dx, y + dy) === PATH).length;
  };
  const neighborsToOpen = (cx, cy) => N4.map(([dx, dy]) => [dx, dy])
    .filter(([dx, dy]) => {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= CW || ny < 0 || ny >= CH || blocked(nx, ny)) return false;
      const [x, y] = tile(cx, cy);
      return at(x + dx, y + dy) === WALL;
    });

  // 2) sem becos: toda sala com uma só saída ganha outra
  for (let cy = 0; cy < CH; cy++) for (let cx = 0; cx <= mid; cx++) {
    if (blocked(cx, cy) || links(cx, cy) > 1) continue;
    const opts = neighborsToOpen(cx, cy);
    if (!opts.length) continue;
    // prefere abrir para quem também é beco (economiza aberturas)
    opts.sort((a, b) => links(cx + a[0], cy + a[1]) - links(cx + b[0], cy + b[1]));
    const [dx, dy] = opts[0];
    const [x, y] = tile(cx, cy);
    open(x + dx, y + dy);
  }

  // 3) voltas extras
  let tries = 0, made = 0;
  while (made < def.loops && tries++ < 200) {
    const cx = Math.floor(rand() * (mid + 1)), cy = Math.floor(rand() * CH);
    if (blocked(cx, cy)) continue;
    const opts = neighborsToOpen(cx, cy);
    if (!opts.length) continue;
    const [dx, dy] = opts[Math.floor(rand() * opts.length)];
    const [x, y] = tile(cx, cy);
    // não deixa formar praças 2x2 abertas
    if (makesSquare(g, x + dx, y + dy) || makesSquare(g, mirror(x + dx), y + dy)) continue;
    open(x + dx, y + dy);
    made++;
  }

  // 4) toca e porta
  for (const [x, y] of DEN_TILES) set(x, y, DEN);
  set(...DOOR_TILE, DOOR);
  set(...OUT_TILE, PATH);

  return {
    W, H, grid: g,
    tatu: [...TATU_START], door: [...DOOR_TILE], out: [...OUT_TILE], den: DEN_TILES.map(t => [...t]),
    pequis: CORNERS.map(c => [...c]), homes: CORNERS.map(c => [...c]),
  };
}

function makesSquare(g, x, y) {
  const open = (a, b) => a >= 0 && b >= 0 && a < W && b < H && (g[b * W + a] !== WALL || (a === x && b === y));
  for (const [ox, oy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
    const a = x + ox, b = y + oy;
    if (open(a, b) && open(a + 1, b) && open(a, b + 1) && open(a + 1, b + 1)) return true;
  }
  return false;
}

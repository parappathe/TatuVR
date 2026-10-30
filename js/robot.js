// Robô que joga o Tatu no Labirinto com limites humanos. Serve para os testes (provar que toda
// fase tem solução e calibrar a dificuldade) e para o dev.autoplay / demonstração do menu.
//   - decide a cada 0,15 s (não reage mais rápido que isso);
//   - pôr uma pedra leva 0,8 s (a mão vai até a bandeja e até a casa) e no máximo uma a cada 1,2 s;
//   - o Lobo Fantasma escondido: só sabe onde ele foi visto pela última vez.
// Estratégia: caminho mais barato até uma frutinha, onde casas que uma onça alcança antes (ou quase
// junto) do tatu custam caro. Com pequi ativo, caça as onças assustadas que dá tempo de pegar.
import { DIRS, OPP, W, H, PATH } from './sim.js';

const THINK = 0.15, HAND = 0.8, STONE_GAP = 1.2;

export function makeRobot() {
  const r = {
    nextThink: 0, want: -1, pending: null, lastStone: -9, seen: {},
    plan: null,          // casas do caminho escolhido (para a demonstração desenhar)
    reset() { this.nextThink = 0; this.want = -1; this.pending = null; this.lastStone = -9; this.seen = {}; this.plan = null; },
    step(game) {
      const out = { dir: -1, place: null };
      if (game.phase !== 'play') { this.pending = null; return out; }
      if (this.pending && game.t >= this.pending.at) {
        // a mão chegou: acerta a casa pela posição de agora da onça
        const o = this.pending.o;
        const spot = o.state === 'free' || o.state === 'rest' ? blockSpot(game, o, 0.12) : null;
        if (spot) { out.place = spot; this.lastStone = game.t; }
        this.pending = null;
      }
      if (game.t >= this.nextThink) {
        this.nextThink = game.t + THINK;
        think(this, game);
      }
      out.dir = this.want;
      return out;
    },
  };
  return r;
}

// ---------- cabeça do robô ----------
function think(R, g) {
  const T = g.tatu;
  const vt = g.def.tatu * (g.power > 0 ? 1.12 : 1);
  // onde as onças estão (o lobo escondido fica onde foi visto)
  const threats = [];
  for (const o of g.oncas) {
    if (o.state === 'den' || o.state === 'back') continue;
    if (o.state === 'fear' && g.power > 1.0) continue;
    let tile = g.near(o), late = 0;
    if (o.hidden) {
      const s = R.seen[o.i];
      if (s) { tile = s.tile; late = (g.t - s.t) * g.speedOf(o); }
    } else R.seen[o.i] = { tile, t: g.t };
    const ignore = o.kind === 'pintadona';
    const can = (x, y) => g.walkOnca(o, x, y, ignore);
    let f;
    if (!o.hidden && o.dir >= 0 && o.state !== 'leave') {
      // a onça não dá meia-volta: conta a partir da próxima casa dela
      const nx = o.x + DIRS[o.dir][0], ny = o.y + DIRS[o.dir][1];
      f = g.field(nx, ny, (x, y) => (x !== o.x || y !== o.y) && can(x, y));
      bump(f, 1 - o.off);
      const back = o.y * W + o.x;
      let m = -1;
      for (const [dx, dy] of DIRS) { const v = f[(o.y + dy) * W + o.x + dx]; if (v >= 0 && (m < 0 || v < m)) m = v; }
      f[back] = m >= 0 ? m + 1 : 0;
      if (f[back] > 0 && o.off < 0.5) f[back] = Math.min(f[back], o.off + 0.01);
    } else f = g.field(tile[0], tile[1], (x, y) => can(x, y) || (x === tile[0] && y === tile[1]));
    threats.push({ o, f, v: Math.max(g.def.onca * o.info.speed, g.speedOf(o)), late });
  }
  const prey = g.power > 0 ? g.oncas.filter(o => o.state === 'fear') : [];

  // parte da casa onde o tatu vai estar no próximo centro; ou dá meia-volta
  const starts = [];
  if (T.dir >= 0 && T.off > 0) {
    starts.push({ x: T.x + DIRS[T.dir][0], y: T.y + DIRS[T.dir][1], c0: 1 - T.off, first: T.dir });
    starts.push({ x: T.x, y: T.y, c0: T.off + 0.3, first: OPP(T.dir) });
  } else starts.push({ x: T.x, y: T.y, c0: 0, first: -1 });

  const danger = (i, steps) => {
    const tT = steps / vt;
    let p = 0;
    for (const th of threats) {
      const d = th.f[i];
      if (d < 0) continue;
      const tO = Math.max(0, d - th.late) / th.v;
      const gap = tO - tT;
      if (gap < 0.3) return Infinity;       // a onça chega antes (ou quase junto): não passa por aí
      if (gap < 0.8) p += 20;
      else if (gap < 1.6) p += 5;
      else if (gap < 2.5) p += 1;
    }
    return p;
  };

  // alvos
  const bossNear = g.boss && g.boss.state === 'free' && threats.some(th => th.o === g.boss && th.f[T.y * W + T.x] >= 0 && th.f[T.y * W + T.x] <= 9);
  const minThreat = Math.min(99, ...threats.map(th => { const d = th.f[T.y * W + T.x]; return d < 0 ? 99 : d; }));
  const close = threats.filter(th => { const d = th.f[T.y * W + T.x]; return d >= 0 && d <= 10; }).length;
  const wantPequi = g.power <= 0 && (minThreat <= 5 || close >= 2 || bossNear || (g.boss && g.fruitsLeft === 0));
  const goal = new Float32Array(W * H);    // bônus por chegar (negativo = bom)
  let any = false;
  for (let i = 0; i < W * H; i++) {
    if (g.fruit[i]) { goal[i] = -1; any = true; }
    if (g.pequi[i] && wantPequi) { goal[i] = -30; any = true; }
  }
  if (g.caju) { goal[g.caju.y * W + g.caju.x] = -12; any = true; }
  for (const o of prey) {
    const [x, y] = g.near(o);
    goal[y * W + x] = -80; any = true;
  }

  let best = null, room = 0;
  for (const s of starts) {
    const res = dijkstra(g, s, danger, prey, vt);
    let n = 0;
    for (let i = 0; i < W * H; i++) if (res.cost[i] < Infinity) n++;
    room = Math.max(room, n);
    for (let i = 0; i < W * H; i++) {
      if (res.cost[i] === Infinity) continue;
      // presa: só vale se dá tempo de chegar com o pequi ainda ativo
      let bonus = goal[i];
      if (bonus <= -80 && res.steps[i] / vt > g.power - 0.3) bonus = 0;
      const score = res.cost[i] + bonus * 4;
      const isGoal = bonus < 0;
      if (!isGoal && any) continue;
      // sem alvo: a casa mais segura por perto
      const val = isGoal ? score : res.cost[i] - safety(threats, i, res.steps[i], vt) * 6;
      if (!best || val < best.val) best = { val, i, s, res };
    }
  }
  // pouco espaço livre: hora de usar pedra (antes de ficar encurralado de vez)
  const urgent = !best || room < 26;
  stoneLogic(R, g, threats, urgent);
  if (!best) {
    // encurralado: a direção que deixa mais longe das onças
    let bd = -Infinity;
    for (let d = 0; d < 4; d++) {
      const nx = T.x + DIRS[d][0], ny = T.y + DIRS[d][1];
      if (g.tile(nx, ny) !== PATH) continue;
      const v = safety(threats, ny * W + nx, 1, vt);
      if (v > bd) { bd = v; R.want = d; }
    }
    R.plan = null;
    return;
  }
  // primeiro passo do caminho
  let i = best.i;
  const path = [];
  while (best.res.prev[i] >= 0) { path.push(i); i = best.res.prev[i]; }
  path.push(i);
  path.reverse();
  R.plan = path;
  const s = best.s;
  if (path.length < 2) R.want = s.first;
  else {
    const n = path[1], nx = n % W, ny = (n / W) | 0;
    const d = DIRS.findIndex(([dx, dy]) => s.x + dx === nx && s.y + dy === ny);
    R.want = s.first >= 0 && s.first === OPP(T.dir) && T.off > 0 ? s.first : d;
  }

}

// pedra na frente da onça que está chegando
function stoneLogic(R, g, threats, urgent) {
  const T = g.tatu;
  if (R.pending || g.stonesReady === 0 || g.t - R.lastStone < (urgent ? 0.5 : STONE_GAP)) return;
  let pick = null;
  for (const th of threats) {
    const o = th.o;
    if (o.state === 'fear' || o.state === 'leave' || o.hidden) continue;
    const d = th.f[T.y * W + T.x];
    if (d < 0 || d > (urgent ? 10 : 6)) continue;
    const spot = blockSpot(g, o, HAND + 0.1);
    if (spot && (!pick || d < pick.d)) pick = { d, o };
  }
  if (pick) R.pending = { o: pick.o, at: g.t + HAND };
}

function bump(f, add) {
  for (let i = 0; i < f.length; i++) if (f[i] >= 0) f[i] += add;
}

function safety(threats, i, steps, vt) {
  let m = 9;
  for (const th of threats) {
    const d = th.f[i];
    if (d < 0) continue;
    m = Math.min(m, (Math.max(0, d - th.late)) / th.v - steps / vt);
  }
  return m;
}

// casa no caminho da onça até o tatu aonde ela ainda vai demorar pelo menos "lead" segundos
function blockSpot(g, o, lead) {
  const T = g.tatu;
  const toTatu = g.field(T.x, T.y, (x, y) => g.walkOnca(o, x, y));
  const v = g.speedOf(o);
  let x = o.x, y = o.y, t = -o.off / v;
  if (o.dir >= 0 && o.off > 0) { x += DIRS[o.dir][0]; y += DIRS[o.dir][1]; t = (1 - o.off) / v; }
  for (let k = 0; k < 10; k++) {
    let nx = -1, ny = -1, bd = toTatu[y * W + x];
    if (bd <= 1) return null;                // já está colada no tatu
    for (const [dx, dy] of DIRS) {
      const qx = x + dx, qy = y + dy;
      if (qx < 0 || qy < 0 || qx >= W || qy >= H) continue;
      const val = toTatu[qy * W + qx];
      if (val >= 0 && val < bd) { bd = val; nx = qx; ny = qy; }
    }
    if (nx < 0) return null;
    x = nx; y = ny; t += 1 / v;
    if (bd < 1) return null;                 // chegou no tatu
    if (t >= lead && g.canPlace(x, y)) return [x, y];
  }
  return null;
}

// caminho mais barato a partir de s (custo = passos + perigo)
function dijkstra(g, s, danger, prey, vt) {
  const N = W * H;
  const cost = new Float64Array(N).fill(Infinity);
  const steps = new Float32Array(N);
  const prev = new Int32Array(N).fill(-1);
  const heap = new Heap();
  const i0 = s.y * W + s.x;
  if (g.tile(s.x, s.y) !== PATH) return { cost, steps, prev };
  cost[i0] = s.c0 * 1 + danger(i0, s.c0);
  steps[i0] = s.c0;
  if (cost[i0] === Infinity) return { cost, steps, prev };
  heap.push(cost[i0], i0);
  while (heap.size) {
    const [c, i] = heap.pop();
    if (c > cost[i]) continue;
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (g.tile(nx, ny) !== PATH) continue;
      const j = ny * W + nx;
      const st = steps[i] + 1;
      if (st > 40) continue;
      const nc = c + 1 + danger(j, st);
      if (nc === Infinity) continue;
      if (nc < cost[j]) { cost[j] = nc; steps[j] = st; prev[j] = i; heap.push(nc, j); }
    }
  }
  return { cost, steps, prev };
}

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(k, v) {
    const K = this.k, V = this.v;
    let i = K.length; K.push(k); V.push(v);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= K[i]) break;
      [K[p], K[i]] = [K[i], K[p]]; [V[p], V[i]] = [V[i], V[p]]; i = p;
    }
  }
  pop() {
    const K = this.k, V = this.v;
    const top = [K[0], V[0]];
    const lk = K.pop(), lv = V.pop();
    if (K.length) {
      K[0] = lk; V[0] = lv;
      let i = 0;
      for (;;) {
        const a = 2 * i + 1, b = a + 1;
        let m = i;
        if (a < K.length && K[a] < K[m]) m = a;
        if (b < K.length && K[b] < K[m]) m = b;
        if (m === i) break;
        [K[m], K[i]] = [K[i], K[m]]; [V[m], V[i]] = [V[i], V[m]]; i = m;
      }
    }
    return top;
  }
}

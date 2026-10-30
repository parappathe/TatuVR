// Regras do Tatu no Labirinto. Sem navegador e sem Three.js: roda no Node nos testes.
//
// Posições em casas da grade (x para a direita, y para perto do jogador). Cada bicho fica numa
// casa (x, y) e anda "off" (0 a 1) na direção dir até a próxima. Decisões só no centro das casas.
import { LEVELS, WORLDS, buildMaze, W, H, WALL, PATH, DEN, DOOR, DEN_TILES } from './levels.js';
import { rng } from './vec.js';

export const DT = 1 / 60;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];      // 0 longe, 1 direita, 2 perto, 3 esquerda
export const OPP = (d) => (d + 2) % 4;
export const LIVES = 3, MAX_LIVES = 5, EXTRA_LIFE_AT = 10000;
export const STONE_LIFE = 9, STONE_COOL = 5;
export const HUNT_T = 16, REST_T = 6;
export const TOUCH = 0.6;                    // distância (em casas) que conta como encostar
export const SCORE = { fruit: 10, pequi: 50, knock: 200, boss: 1000, caju: [300, 500, 800] };

export const ONCA_INFO = {
  pintada: { name: 'Pintada', speed: 1.0, color: '#e8a83a', boss: false },
  parda: { name: 'Parda', speed: 1.0, color: '#b0703a', boss: false },
  farejadora: { name: 'Farejadora', speed: 1.02, color: '#4a4a58', boss: false },
  gato: { name: 'Gato-do-mato', speed: 1.08, color: '#c8b890', boss: false },
  pintadona: { name: 'Pintadona', speed: 1.05, color: '#ffb02a', boss: true },
  jacare: { name: 'Jacaré-Açu', speed: 1.0, color: '#5a8a3a', boss: true },
  lobo: { name: 'Lobo Fantasma', speed: 1.05, color: '#d86a3a', boss: true },
};

export class Game {
  constructor(li, opts = {}) {
    this.li = li;
    this.def = LEVELS[li];
    this.world = this.def.world;
    this.maze = buildMaze(this.def);
    this.grid = this.maze.grid;
    this.rand = rng(opts.seed ?? this.def.seed * 7 + 1);
    this.lives = opts.lives ?? LIVES;
    this.score = opts.score ?? 0;
    this.extraGiven = opts.extraGiven ?? this.score >= EXTRA_LIFE_AT;
    this.lost = 0;
    this.t = 0;
    this.events = [];
    this.phase = 'ready';
    this.phaseT = 2;
    this.power = 0;
    this.chain = 0;
    this.mode = 'hunt';
    this.modeT = HUNT_T;
    this.caju = null;
    this.cajuDone = 0;
    this.pequiRespawn = 0;
    this.knocks = 0;
    this.result = null;

    this.fruit = new Uint8Array(W * H);
    this.pequi = new Uint8Array(W * H);
    for (const [x, y] of this.maze.pequis) this.pequi[y * W + x] = 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (this.grid[i] === PATH && !this.pequi[i] && !(x === this.maze.tatu[0] && y === this.maze.tatu[1])
        && !(x === this.maze.out[0] && y === this.maze.out[1])) this.fruit[i] = 1;
    }
    this.fruitsTotal = this.fruit.reduce((s, v) => s + v, 0);
    this.fruitsLeft = this.fruitsTotal;

    this.stones = [];
    for (let i = 0; i < this.def.stones; i++) this.stones.push({ id: i, state: 'tray', x: 0, y: 0, life: 0, cool: 0 });

    this.tatu = { x: 0, y: 0, dir: -1, off: 0, want: -1, trail: [] };
    const kinds = [...(this.def.boss ? [this.def.boss] : []), ...this.def.oncas];
    this.oncas = kinds.map((kind, i) => ({
      i, kind, info: ONCA_INFO[kind], boss: ONCA_INFO[kind].boss,
      hp: ONCA_INFO[kind].boss ? this.def.bossHp : 0, maxHp: ONCA_INFO[kind].boss ? this.def.bossHp : 0,
      x: 0, y: 0, dir: -1, off: 0, state: 'den', wait: 0, home: this.maze.homes[i % 4],
      breakT: 0, pauseT: 0, hidden: false, prevDir: -1,
    }));
    this.boss = this.oncas.find(o => o.boss) || null;
    this.resetPositions();
  }

  get over() { return this.phase === 'won' || this.phase === 'lost'; }
  get worldInfo() { return WORLDS[this.world]; }

  resetPositions() {
    const T = this.tatu;
    [T.x, T.y] = this.maze.tatu;
    T.dir = -1; T.off = 0; T.want = -1; T.trail = [[T.x, T.y]];
    this.oncas.forEach((o, k) => {
      const d = DEN_TILES[k % 3];
      o.x = d[0]; o.y = d[1]; o.dir = -1; o.off = 0;
      o.state = 'den'; o.wait = 1 + k * 3.5; o.breakT = 0; o.pauseT = 0; o.hidden = false;
    });
    this.power = 0;
    this.mode = 'hunt'; this.modeT = HUNT_T;
  }

  // ---------- grade ----------
  tile(x, y) { return x < 0 || y < 0 || x >= W || y >= H ? WALL : this.grid[y * W + x]; }
  stoneAt(x, y) { return this.stones.find(s => s.state === 'board' && s.x === x && s.y === y) || null; }
  walkTatu(x, y) { return this.tile(x, y) === PATH; }
  walkOnca(o, x, y, ignoreStones = false) {
    const t = this.tile(x, y);
    if (t === WALL) return false;
    if ((t === DEN || t === DOOR) && !(o.state === 'den' || o.state === 'leave' || o.state === 'back')) return false;
    if (!ignoreStones && this.stoneAt(x, y)) return false;
    return true;
  }
  // distância andando (em casas) até (tx, ty) para cada casa, segundo quem anda
  field(tx, ty, can) {
    const d = new Float32Array(W * H).fill(-1);
    if (!can(tx, ty)) return d;
    const q = [tx + ty * W];
    d[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of DIRS) {
        const nx = x + dx, ny = y + dy, j = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || d[j] >= 0 || !can(nx, ny)) continue;
        d[j] = d[i] + 1; q.push(j);
      }
    }
    return d;
  }
  pos(e) { const d = DIRS[e.dir] || [0, 0]; return [e.x + d[0] * e.off, e.y + d[1] * e.off]; }
  // casa onde o bicho está mais perto (para colocar pedra e para o robô)
  near(e) { return e.off > 0.5 && e.dir >= 0 ? [e.x + DIRS[e.dir][0], e.y + DIRS[e.dir][1]] : [e.x, e.y]; }

  // ---------- pedras ----------
  canPlace(x, y) {
    if (this.tile(x, y) !== PATH || this.stoneAt(x, y)) return false;
    if (x === this.maze.out[0] && y === this.maze.out[1]) return false;
    const [tx, ty] = this.pos(this.tatu);
    if (Math.abs(tx - x) + Math.abs(ty - y) < 0.8) return false;
    for (const o of this.oncas) {
      const [ox, oy] = this.pos(o);
      if (Math.abs(ox - x) + Math.abs(oy - y) < 0.9) return false;
      if (o.dir >= 0 && o.x + DIRS[o.dir][0] === x && o.y + DIRS[o.dir][1] === y) return false;
    }
    return true;
  }
  take(id) {
    const s = this.stones[id];
    if (!s || (s.state !== 'tray' && s.state !== 'board')) return false;
    s.state = 'held';
    return true;
  }
  drop(id, x, y) {
    const s = this.stones[id];
    if (!s || s.state !== 'held') return false;
    if (x != null && this.canPlace(x, y)) {
      s.state = 'board'; s.x = x; s.y = y; s.life = STONE_LIFE;
      this.events.push({ type: 'stone-place', id, x, y });
      return true;
    }
    s.state = 'tray';
    this.events.push({ type: 'stone-back', id });
    return false;
  }
  // pega uma pedra da bandeja e põe direto (robô e atalhos)
  quickPlace(x, y) {
    const s = this.stones.find(k => k.state === 'tray');
    if (!s || !this.canPlace(x, y)) return false;
    this.take(s.id);
    return this.drop(s.id, x, y);
  }
  get stonesReady() { return this.stones.filter(s => s.state === 'tray').length; }

  // ---------- passo ----------
  step(input = {}) {
    const dt = DT;
    this.t += dt;
    if (input.dir != null && input.dir >= 0) this.tatu.want = input.dir;
    this.updateStones(dt);

    if (this.phase === 'ready') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) { this.phase = 'play'; this.events.push({ type: 'go' }); }
      return;
    }
    if (this.phase === 'dying') {
      this.phaseT -= dt;
      if (this.phaseT <= 0) {
        if (this.lives <= 0) this.finish(false);
        else { this.resetPositions(); this.phase = 'ready'; this.phaseT = 1.6; this.events.push({ type: 'ready' }); }
      }
      return;
    }
    if (this.phase !== 'play') return;

    // ciclo caçar / descansar (para durante o pequi)
    if (this.power > 0) {
      this.power -= dt;
      if (this.power <= 1.5 && this.power + dt > 1.5) this.events.push({ type: 'power-warn' });
      if (this.power <= 0) {
        this.power = 0;
        for (const o of this.oncas) if (o.state === 'fear') o.state = 'free';
        this.events.push({ type: 'power-end' });
      }
    } else {
      this.modeT -= dt;
      if (this.modeT <= 0) {
        this.mode = this.mode === 'hunt' ? 'rest' : 'hunt';
        this.modeT = this.mode === 'hunt' ? HUNT_T : REST_T;
        this.events.push({ type: 'mode', mode: this.mode });
      }
    }

    this.moveTatu(dt);
    const tatuField = this.field(this.tatu.x, this.tatu.y, (x, y) => this.tile(x, y) === PATH);
    for (const o of this.oncas) this.moveOnca(o, dt, tatuField);
    this.contacts();
    this.updateExtras(dt);
  }

  updateStones(dt) {
    for (const s of this.stones) {
      if (s.state === 'board' && this.phase === 'play') {
        s.life -= dt;
        if (s.life <= 0) { s.state = 'cool'; s.cool = STONE_COOL; this.events.push({ type: 'stone-crumble', id: s.id, x: s.x, y: s.y }); }
      } else if (s.state === 'cool') {
        s.cool -= dt;
        if (s.cool <= 0) { s.state = 'tray'; this.events.push({ type: 'stone-ready', id: s.id }); }
      }
    }
  }

  moveTatu(dt) {
    const T = this.tatu;
    const speed = this.def.tatu * (this.power > 0 ? 1.12 : 1);
    const w = T.want;
    if (w >= 0 && T.dir >= 0 && w !== T.dir) {
      if (w === OPP(T.dir) && T.off > 0) {
        // meia-volta no meio do corredor
        T.x += DIRS[T.dir][0]; T.y += DIRS[T.dir][1]; T.off = 1 - T.off; T.dir = w;
      } else if (w !== OPP(T.dir) && T.off < 0.2 && this.walkTatu(T.x + DIRS[w][0], T.y + DIRS[w][1])) {
        // virou um tiquinho atrasado: volta para o centro e entra
        T.off = 0; T.dir = w;
      }
    }
    if (T.dir < 0) {
      if (w >= 0 && this.walkTatu(T.x + DIRS[w][0], T.y + DIRS[w][1])) T.dir = w;
      else return;
    }
    T.off += speed * dt;
    while (T.off >= 1) {
      T.off -= 1;
      T.x += DIRS[T.dir][0]; T.y += DIRS[T.dir][1];
      this.arriveTatu();
      if (w >= 0 && w !== T.dir && this.walkTatu(T.x + DIRS[w][0], T.y + DIRS[w][1])) { T.dir = w; T.off = 0; }
      else if (!this.walkTatu(T.x + DIRS[T.dir][0], T.y + DIRS[T.dir][1])) { T.dir = -1; T.off = 0; break; }
    }
  }

  arriveTatu() {
    const T = this.tatu, i = T.y * W + T.x;
    T.trail.push([T.x, T.y]);
    if (T.trail.length > 60) T.trail.shift();
    if (this.fruit[i]) {
      this.fruit[i] = 0; this.fruitsLeft--;
      this.addScore(SCORE.fruit);
      this.events.push({ type: 'fruit', x: T.x, y: T.y, left: this.fruitsLeft });
      if (this.fruitsLeft === 0 && !this.boss) { this.finish(true); return; }
      const eaten = this.fruitsTotal - this.fruitsLeft;
      const th = [0.35, 0.7][this.cajuDone];
      if (th && eaten >= this.fruitsTotal * th && !this.caju) {
        const spot = this.walkTatu(9, 9) ? [9, 9] : [...this.maze.tatu];
        this.caju = { x: spot[0], y: spot[1], t: 9 };
        this.cajuDone++;
        this.events.push({ type: 'caju-show', x: spot[0], y: spot[1] });
      }
    }
    if (this.pequi[i]) {
      this.pequi[i] = 0;
      this.addScore(SCORE.pequi);
      this.power = this.def.power;
      this.chain = 0;
      for (const o of this.oncas) if (o.state === 'free' || o.state === 'fear') {
        if (o.state === 'free' && o.dir >= 0 && o.off > 0) { o.x += DIRS[o.dir][0]; o.y += DIRS[o.dir][1]; o.off = 1 - o.off; o.dir = OPP(o.dir); }
        o.state = 'fear';
      }
      this.events.push({ type: 'pequi', x: T.x, y: T.y });
    }
    if (this.caju && this.caju.x === T.x && this.caju.y === T.y) {
      const pts = SCORE.caju[this.world];
      this.addScore(pts);
      this.events.push({ type: 'caju', x: T.x, y: T.y, score: pts });
      this.caju = null;
    }
  }

  // escolhe a direção da onça num centro de casa
  decide(o, tatuField) {
    const opts = [];
    const ignore = o.kind === 'pintadona' && o.state === 'free';
    for (let d = 0; d < 4; d++) {
      const nx = o.x + DIRS[d][0], ny = o.y + DIRS[d][1];
      if (this.walkOnca(o, nx, ny, ignore)) opts.push(d);
    }
    if (!opts.length) return -1;
    let choices = opts.filter(d => o.dir < 0 || d !== OPP(o.dir));
    if (!choices.length) choices = opts;           // beco (pedra na frente): volta
    if (choices.length === 1) return choices[0];

    if (o.state === 'fear') {
      // foge: a casa mais longe do tatu (um pouco de sorte no empate)
      let best = -1, bd = -1;
      for (const d of choices) {
        const v = tatuField[(o.y + DIRS[d][1]) * W + o.x + DIRS[d][0]] + this.rand() * 0.9;
        if (v > bd) { bd = v; best = d; }
      }
      return best;
    }
    let target;
    if (o.state === 'back') target = DEN_TILES[1];
    else if (o.state === 'leave') target = this.maze.out;
    else target = this.targetOf(o);
    if (!target) {
      return choices[Math.floor(this.rand() * choices.length)];
    }
    const f = this.field(target[0], target[1], (x, y) => this.walkOnca(o, x, y, ignore));
    let best = choices[0], bd = Infinity;
    for (const d of choices) {
      const v = f[(o.y + DIRS[d][1]) * W + o.x + DIRS[d][0]];
      const score = v < 0 ? 999 : v;
      if (score < bd) { bd = score; best = d; }
    }
    return best;
  }

  targetOf(o) {
    const T = this.tatu;
    if (this.mode === 'rest' && !o.boss) return o.home;
    switch (o.kind) {
      case 'parda': case 'jacare': {
        const [ox, oy] = [o.x, o.y];
        if (Math.abs(ox - T.x) + Math.abs(oy - T.y) <= 3) return [T.x, T.y];
        const d = T.dir >= 0 ? T.dir : T.want;
        if (d < 0) return [T.x, T.y];
        let x = T.x, y = T.y;
        for (let k = 0; k < 4 && this.walkTatu(x + DIRS[d][0], y + DIRS[d][1]); k++) { x += DIRS[d][0]; y += DIRS[d][1]; }
        return [x, y];
      }
      case 'farejadora': case 'lobo': {
        const lag = o.kind === 'lobo' ? 3 : 6;
        const tr = T.trail;
        return tr[Math.max(0, tr.length - 1 - lag)];
      }
      case 'gato': {
        const see = this.sees(o);
        return see ? [T.x, T.y] : null;
      }
      default: return [T.x, T.y];
    }
  }

  // o gato enxerga o tatu no mesmo corredor reto, até 7 casas
  sees(o) {
    const T = this.tatu;
    if (o.x !== T.x && o.y !== T.y) return false;
    const dx = Math.sign(T.x - o.x), dy = Math.sign(T.y - o.y);
    const n = Math.abs(T.x - o.x) + Math.abs(T.y - o.y);
    if (n > 7) return false;
    for (let k = 1; k < n; k++) if (!this.walkOnca(o, o.x + dx * k, o.y + dy * k)) return false;
    return true;
  }

  speedOf(o) {
    const base = this.def.onca * o.info.speed;
    if (o.state === 'back') return base * 2.3;
    if (o.state === 'fear') return base * 0.55;
    if (o.state === 'leave') return base * 0.8;
    if (o.kind === 'jacare') return base * 1.3;
    return base;
  }

  moveOnca(o, dt, tatuField) {
    if (o.state === 'den') {
      o.wait -= dt;
      if (o.wait <= 0) { o.state = 'leave'; this.events.push({ type: 'release', i: o.i }); }
      return;
    }
    if (o.kind === 'lobo') {
      const c = this.t % 7;
      const hide = o.state === 'free' && c > 4;
      if (hide !== o.hidden) { o.hidden = hide; this.events.push({ type: hide ? 'hide' : 'show', i: o.i }); }
    }
    if (o.breakT > 0) {
      o.breakT -= dt;
      if (o.breakT <= 0) {
        const s = this.stoneAt(o.x + DIRS[o.dir][0], o.y + DIRS[o.dir][1]);
        if (s) { s.state = 'cool'; s.cool = STONE_COOL; this.events.push({ type: 'stone-break', id: s.id, x: s.x, y: s.y }); }
      }
      return;
    }
    if (o.pauseT > 0) { o.pauseT -= dt; return; }
    if (o.dir < 0) {
      o.dir = this.decide(o, tatuField);
      o.off = 0;
      if (o.dir < 0) return;
      if (this.startBreak(o)) return;
    }
    // pedra caiu na frente enquanto andava (só a pintadona quebra)
    o.off += this.speedOf(o) * dt;
    while (o.off >= 1) {
      o.off -= 1;
      o.x += DIRS[o.dir][0]; o.y += DIRS[o.dir][1];
      if (this.arriveOnca(o)) { o.off = 0; break; }
      const prev = o.dir;
      const nd = this.decide(o, tatuField);
      if (nd !== prev) o.off = 0;
      o.dir = nd;
      if (nd < 0) { o.off = 0; break; }
      if (o.kind === 'jacare' && o.state === 'free' && nd !== prev) { o.pauseT = 0.32; o.off = 0; break; }
      if (this.startBreak(o)) { o.off = 0; break; }
    }
  }

  startBreak(o) {
    if (o.kind !== 'pintadona' || o.state !== 'free') return false;
    if (!this.stoneAt(o.x + DIRS[o.dir][0], o.y + DIRS[o.dir][1])) return false;
    o.breakT = 1.0;
    this.events.push({ type: 'stone-ram', i: o.i, x: o.x + DIRS[o.dir][0], y: o.y + DIRS[o.dir][1] });
    return true;
  }

  // chegou num centro de casa; true se mudou de estado (para de andar neste passo)
  arriveOnca(o) {
    if (o.state === 'leave' && o.x === this.maze.out[0] && o.y === this.maze.out[1]) {
      o.state = 'free'; o.dir = -1;
      return true;
    }
    if (o.state === 'back' && o.x === DEN_TILES[1][0] && o.y === DEN_TILES[1][1]) {
      o.state = 'den'; o.wait = o.boss ? 4 : 2.5; o.dir = -1;
      return true;
    }
    return false;
  }

  contacts() {
    const [tx, ty] = this.pos(this.tatu);
    for (const o of this.oncas) {
      if (o.state === 'den' || o.state === 'back') continue;
      const [ox, oy] = this.pos(o);
      if (Math.hypot(ox - tx, oy - ty) >= TOUCH) continue;
      if (o.state === 'fear') {
        o.state = 'back'; o.breakT = 0; o.pauseT = 0; o.hidden = false;
        this.knocks++;
        if (o.boss) {
          o.hp--;
          this.addScore(SCORE.boss);
          this.events.push({ type: 'boss-hit', i: o.i, x: ox, y: oy, hp: o.hp, score: SCORE.boss });
          if (o.hp <= 0) { this.events.push({ type: 'boss-down', i: o.i, x: ox, y: oy }); this.finish(true); return; }
        } else {
          const pts = SCORE.knock * 2 ** Math.min(3, this.chain++);
          this.addScore(pts);
          this.events.push({ type: 'knock', i: o.i, x: ox, y: oy, score: pts });
        }
        // a onça tonta volta para a toca (pela porta)
        o.dir = -1; o.off = 0;
        [o.x, o.y] = this.near(o);
        continue;
      }
      this.lives--;
      this.lost++;
      this.phase = 'dying';
      this.phaseT = 1.8;
      this.events.push({ type: 'die', x: tx, y: ty, by: o.i, lives: this.lives });
      return;
    }
  }

  updateExtras(dt) {
    if (this.caju) {
      this.caju.t -= dt;
      if (this.caju.t <= 0) { this.caju = null; this.events.push({ type: 'caju-gone' }); }
    }
    // chefe: os pequis voltam quando acabam
    if (this.boss && this.power <= 0 && !this.pequi.some(v => v)) {
      this.pequiRespawn += dt;
      if (this.pequiRespawn > 6) {
        this.pequiRespawn = 0;
        for (const [x, y] of this.maze.pequis) {
          const [tx, ty] = this.tatu.trail[this.tatu.trail.length - 1];
          if (x !== tx || y !== ty) this.pequi[y * W + x] = 1;
        }
        this.events.push({ type: 'pequi-back' });
      }
    } else this.pequiRespawn = 0;
  }

  addScore(n) {
    this.score += n;
    if (!this.extraGiven && this.score >= EXTRA_LIFE_AT) {
      this.extraGiven = true;
      if (this.lives < MAX_LIVES) { this.lives++; this.events.push({ type: 'extra-life', lives: this.lives }); }
    }
  }

  finish(won) {
    this.phase = won ? 'won' : 'lost';
    const stars = won ? Math.max(1, 3 - this.lost) : 0;
    this.result = { won, stars, score: this.score, lost: this.lost, lives: this.lives, time: +this.t.toFixed(1), knocks: this.knocks };
    this.events.push({ type: won ? 'won' : 'lost' });
  }
}

export { LEVELS, WORLDS, W, H, WALL, PATH, DEN, DOOR };

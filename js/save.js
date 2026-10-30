// Progresso, recordes e opções, salvos no navegador.
const KEY = 'tatuvr.v1';
const DEFAULTS = {
  done: {},          // fases vencidas: { 0: { stars, score }, ... }
  scores: [],        // recordes do fliperama: [{ name: 'ABC', score, level }]  (5 melhores)
  name: 'TAT',       // últimas iniciais usadas
  sound: true,
  fps: false,
  trail: false,      // mostrar o caminho do robô na demonstração
};

export function loadSave() {
  try {
    const s = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
    if (typeof s.done !== 'object' || !s.done) s.done = {};
    if (!Array.isArray(s.scores)) s.scores = [];
    return s;
  } catch { return { ...DEFAULTS, done: {}, scores: [] }; }
}

export function storeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* sem armazenamento: segue sem salvar */ }
}

export const best = (s) => s.scores.reduce((m, r) => Math.max(m, r.score), 0);
export const makesTable = (s, score) => score > 0 && (s.scores.length < 5 || score > s.scores[s.scores.length - 1].score);
export function addScore(s, entry) {
  s.scores.push(entry);
  s.scores.sort((a, b) => b.score - a.score);
  s.scores.length = Math.min(5, s.scores.length);
}

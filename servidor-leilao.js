/* ==========================================================================
   TAPADA — servidor de leilão online.
   Implementa a API que o cliente já usa:
     POST /api/room        {op: create|join|act|beat}
     GET  /api/h?c=&v=     heartbeats + versão do estado
     GET  /api/s?c=&v=     estado completo da sala
     GET  /api/rooms?mode= lista de salas públicas
   Regras: cada técnico começa com R$ 100, jogadores vão a leilão um por um
   (10s), quem dá o maior lance leva; depois o campeonato é simulado.
   Funciona com QUALQUER liga registrada em extra-leagues.js.
   ========================================================================== */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;

// ---------- catálogo de ligas (lido do extra-leagues.js) ----------
function carregarLigas() {
  const src = fs.readFileSync(path.join(ROOT, 'extra-leagues.js'), 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  const extra = sandbox.window.TAPADA_EXTRA_LEAGUES || {};
  const ligas = {};
  for (const [code, L] of Object.entries(extra)) {
    ligas[code] = {
      code, title: L.title, short: L.short || L.title,
      players: L.players || [], clubs: L.clubs || []
    };
  }
  return ligas;
}

// Brasileirão e Kings League ficam embutidos no bundle do cliente; para o
// servidor eles são lidos do mesmo arquivo gerado se existirem.
let LIGAS = carregarLigas();

// ---------- utilidades ----------
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const uid = () => Math.random().toString(36).slice(2, 10);
const CODIGO = () => {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[rnd(A.length)];
  return s;
};

// custo aproximado de um jogador no leilão (R$ 1..~60 de um orçamento de 100)
function precoBase(p) {
  return Math.max(1, Math.round(Math.pow((Math.max(55, p.rating) - 52) / 7.4, 2.15) + 3));
}

// posição que a vaga aceita
const VAGA_GRUPO = { GK: ['GK'], DEF: ['DEF'], MID: ['MID'], ATT: ['ATT'] };

// formações espelhadas do cliente (mesmos ids e mesmas vagas)
const FORM5 = [
  { id: '2-1-1', label: '2-1-1', slots: ['GK', 'DEF', 'DEF', 'MID', 'ATT'] },
  { id: '1-2-1', label: '1-2-1', slots: ['GK', 'DEF', 'MID', 'MID', 'ATT'] },
  { id: '1-1-2', label: '1-1-2', slots: ['GK', 'DEF', 'MID', 'ATT', 'ATT'] },
  { id: '2-0-2', label: '2-0-2', slots: ['GK', 'DEF', 'DEF', 'ATT', 'ATT'] },
  { id: '3-1', label: '3-1', slots: ['GK', 'DEF', 'DEF', 'DEF', 'ATT'] },
  { id: '1-3', label: '1-3', slots: ['GK', 'DEF', 'ATT', 'ATT', 'ATT'] }
];
const FORM7 = [
  { id: '2-3-1', label: '2-3-1', slots: ['GK', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT'] },
  { id: '3-2-1', label: '3-2-1', slots: ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'ATT'] },
  { id: '2-2-2', label: '2-2-2', slots: ['GK', 'DEF', 'DEF', 'MID', 'MID', 'ATT', 'ATT'] },
  { id: '3-1-2', label: '3-1-2', slots: ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'ATT', 'ATT'] },
  { id: '4-1-1', label: '4-1-1', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'ATT'] },
  { id: '1-2-3', label: '1-2-3', slots: ['GK', 'DEF', 'MID', 'MID', 'ATT', 'ATT', 'ATT'] }
];
const FORM11 = [
  { id: '4-4-2', label: '4-4-2', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT'] },
  { id: '4-3-3', label: '4-3-3', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT'] },
  { id: '3-5-2', label: '3-5-2', slots: ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT'] },
  { id: '3-4-3', label: '3-4-3', slots: ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT'] },
  { id: '5-4-1', label: '5-4-1', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATT'] },
  { id: '4-2-4', label: '4-2-4', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'ATT', 'ATT', 'ATT', 'ATT'] }
];

function formacoes(size) {
  if (size === 11) return FORM11;
  if (size === 7) return FORM7;
  return FORM5;
}

// ---------- estado global ----------
const salas = new Map();   // code -> sala
const porPid = new Map();  // pid -> code
let seqV = 1;

function toca(s) { s.v = ++seqV; s.at = Date.now(); }

function novaSala(mode, opts, pid, nome) {
  const L = LIGAS[mode];
  if (!L) throw new Error('modo desconhecido');
  // o cliente só conhece 5 e 11 em campo (7 é exclusivo da Kings League)
  const size = Number(opts.size) === 11 ? 11 : 5;
  const code = CODIGO();
  const sala = {
    code, mode,
    title: L.title,
    size,
    format: opts.format === 'ko' ? 'ko' : opts.format === 'both' ? 'both' : 'league',
    limit: Math.min(16, Math.max(2, opts.limit || 8)),
    hide: !!opts.hide,
    visibility: opts.visibility === 'private' ? 'private' : 'public',
    phase: 'lobby',
    host: 0,
    v: ++seqV,
    at: Date.now(),
    managers: [],
    auction: null,
    tourney: null,
    startedAt: 0
  };
  sala.managers.push({
    seat: 0, pid, name: nome || 'Técnico', bot: false, ready: false,
    crest: pick(L.clubs).id, coins: 100, squad: novasVagas(size, formacoes(size)[0].id), formation: formacoes(size)[0].id,
    rating: 0, left: false, __size: size
  });
  // bots de treino
  const bots = Math.max(0, Math.min(sala.limit - 1, opts.bots || 0));
  for (let i = 0; i < bots; i++) adicionarBot(sala);

  salas.set(code, sala);
  porPid.set(pid, code);
  return sala;
}

const NOMES_BOT = ['Abel', 'Mourinho', 'Guardiola', 'Ancelotti', 'Klopp', 'Simeone',
  'Zé Ramalho', 'Tite', 'Diniz', 'Fábio Carille', 'Dorival', 'Renato'];

function adicionarBot(sala) {
  const usado = new Set(sala.managers.map(m => m.name));
  const nome = NOMES_BOT.find(n => !usado.has(n)) || 'Bot ' + (sala.managers.length + 1);
  const L = LIGAS[sala.mode];
  const livre = sala.managers.length;
  sala.managers.push({
    seat: livre, pid: 'bot-' + uid(), name: nome, bot: true, ready: true,
    crest: pick(L.clubs).id, coins: 100, squad: novasVagas(sala.size, formacoes(sala.size)[0].id), formation: formacoes(sala.size)[0].id, rating: 0, left: false, __size: sala.size
  });
}

function acharManager(sala, pid) {
  return sala.managers.find(m => m.pid === pid && !m.left) || null;
}

// ---------- leilão ----------
function iniciarLeilao(sala) {
  const L = LIGAS[sala.mode];
  // lote grande o bastante para titulares + banco de todo mundo
  const nVagas = totalVagas(sala.size);
  const total = Math.max(12, sala.managers.length * nVagas);
  const pool = L.players.slice();
  for (let i = pool.length - 1; i > 0; i--) { const j = rnd(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const lotes = pool.slice(0, total).sort((a, b) => b.rating - a.rating);
  sala.managers.forEach(m => { m.__size = sala.size; m.formation = formacoes(sala.size)[0].id; normalizarSquad(m, sala); m.squad = m.squad.map(() => null); m.coins = 100; m.ready = false; });
  sala.phase = 'auction';
  sala.auction = {
    idx: 0, total: lotes.length, lots: lotes.map(p => p.id),
    lot: null, stage: 'wait', bid: 0, leader: null, endsAt: 0,
    passed: [], history: [], winner: null, slots: []
  };
  sala.startedAt = Date.now();
  proximoLote(sala);
  toca(sala);
}

function proximoLote(sala) {
  const a = sala.auction;
  if (!a) return;
  // pula jogadores que ninguém tem vaga para receber
  while (a.idx < a.total) {
    const id = a.lots[a.idx];
    const p = LIGAS[sala.mode].players.find(x => x.id === id);
    const alguemTemVaga = sala.managers.some(m => !m.left && vagasCompativeis(m, p).length > 0);
    if (alguemTemVaga) {
      a.lot = id;
      a.stage = 'bidding';
      a.bid = 0;
      a.leader = null;
      a.passed = sala.managers.filter(m => m.left || vagasCompativeis(m, p).length === 0).map(m => m.seat);
      a.endsAt = Date.now() + 10000;
      return;
    }
    a.idx++;
  }
  // acabou
  a.lot = null;
  a.stage = 'done';
  sala.phase = 'prep';
  sala.managers.forEach(m => { m.ready = m.bot; });
}

// o cliente espera squad como array do tamanho da formação, com null nas vagas livres
function novasVagas(size, formation) {
  const slots = formacaoDe({ formation }, size).slots;
  // titulares + vagas de banco (o cliente só desenha as de titular)
  return Array.from({ length: slots.length + (BANCO_EXTRA[size] || 4) }, () => null);
}

// ---------------------------------------------------------------
// Banco de reservas: além do time titular, cada técnico tem vagas
// de banco (índice >= tamanho da formação). Pode encher quantas
// quiser enquanto tiver dinheiro — inclusive 2 goleiros, 2 zagueiros.
// ---------------------------------------------------------------
const BANCO_EXTRA = { 5: 4, 7: 5, 11: 7 }; // vagas de banco por tamanho de time
function totalVagas(size) {
  return formacaoDe({ formation: formacoes(size)[0].id }, size).slots.length + (BANCO_EXTRA[size] || 4);
}
function ehBanco(size, formation, idx) {
  return idx >= formacaoDe({ formation }, size).slots.length;
}

function normalizarSquad(m, sala) {
  const size = sala.size || m.__size || 5;
  const titular = formacaoDe(m, size).slots.length;
  const total = totalVagas(size);
  if (!Array.isArray(m.squad)) m.squad = [];
  const novo = Array.from({ length: total }, (_, i) => m.squad[i] || null);
  m.squad = novo;
  // garante que as vagas de titular existam mesmo antes da formação ser escolhida
  if (novo.length < titular) m.squad = Array.from({ length: total }, (_, i) => novo[i] || null);
}

// vagas que aceitam o jogador: titulares livres (compatíveis) + banco livre
function vagasCompativeis(m, p) {
  const size = m.__size || 5;
  const slots = formacaoDe(m, size).slots;
  const squad = m.squad || [];
  const out = [];
  // titulares: só posições compatíveis
  slots.forEach((grupo, i) => {
    if (squad[i]) return;
    if ((VAGA_GRUPO[grupo] || []).some(g => (p.groups || []).includes(g))) out.push(i);
  });
  // banco: qualquer posição serve
  for (let i = slots.length; i < totalVagas(size); i++) if (!squad[i]) out.push(i);
  return out;
}

// o time titular está completo?
function titularCompleto(m, sala) {
  const slots = formacaoDe(m, sala.size || m.__size || 5).slots;
  for (let i = 0; i < slots.length; i++) if (!m.squad[i]) return false;
  return true;
}
function formacaoDe(m, size) {
  const lista = formacoes(size);
  return lista.find(f => f.id === m.formation) || lista[0];
}

// o cliente guarda o elenco como array indexado pela vaga: squad[slot] = idJogador
function comprar(sala, m, p, vaga) {
  const a = sala.auction;
  const preco = Math.max(1, a.bid || 1);
  if (m.coins < preco) return { error: 'sem-saldo' };
  normalizarSquad(m, sala);
  const total = totalVagas(sala.size);
  if (m.squad.filter(Boolean).length >= total) return { error: 'elenco-cheio' };
  if (vaga == null) {
    // sem vaga indicada: o primeiro espaço é titular compatível, senão banco
    const livres = vagasCompativeis(m, p);
    vaga = livres.length ? livres[0] : null;
  }
  if (vaga == null || m.squad[vaga]) return { error: 'vaga-ocupada' };
  m.coins -= preco;
  m.squad[vaga] = p.id;
  // nota do time = só os titulares (o banco não infla a força)
  const slots = formacaoDe(m, sala.size).slots;
  const titulares = m.squad.slice(0, slots.length).filter(Boolean);
  const ids = titulares.length ? titulares : m.squad.filter(Boolean);
  m.rating = Math.round(ids.reduce((t, id) => {
    const pl = LIGAS[sala.mode].players.find(x => x.id === id);
    return t + (pl ? pl.rating : 0);
  }, 0) / Math.max(1, ids.length));
}

// ---------- campeonato ----------
function simularPartida(eh, ea) {
  const f = sq => {
    const ids = (sq || []).filter(Boolean);
    if (!ids.length) return 60;
    return ids.reduce((t, id) => {
      const pl = LIGAS[sala.mode].players.find(x => x.id === id);
      return t + (pl ? pl.rating : 60);
    }, 0) / ids.length;
  };
  const fh = f(eh.squad), fa = f(ea.squad);
  const lam = (x, y, casa) => Math.max(0.2, 1.3 * Math.pow(x / y, 3) * (casa ? 1.12 : 0.9));
  const pois = l => { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
  return { gh: Math.min(6, pois(lam(fh, fa, true))), ga: Math.min(6, pois(lam(fa, fh, false))) };
}

function gerarCampeonato(sala) {
  const ms = sala.managers.filter(m => !m.left);
  const jogos = [];
  // todos contra todos (ida única)
  for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
    jogos.push({ home: ms[i].seat, away: ms[j].seat, gh: 0, ga: 0, status: 'pending' });
  }
  return { rounds: [{ label: 'Pontos corridos' }], matches: jogos, cur: 0, tables: [{}] };
}

function iniciarCampeonato(sala) {
  sala.phase = 'tourney';
  sala.tourney = gerarCampeonato(sala);
  jogarRodada(sala);
  toca(sala);
}

function jogarRodada(sala) {
  const t = sala.tourney;
  if (!t) return;
  const pend = t.matches.filter(m => m.status === 'pending');
  if (!pend.length) { sala.phase = 'done'; return; }
  for (const m of pend) {
    const h = sala.managers.find(x => x.seat === m.home);
    const a = sala.managers.find(x => x.seat === m.away);
    const r = simularPartida(h, a);
    m.gh = r.gh; m.ga = r.ga; m.status = 'done';
  }
  toca(sala);
}

// ---------- ações ----------
function acao(sala, m, a) {
  if (!sala || !m) return { error: 'nao-esta-na-sala' };
  const au = sala.auction;

  switch (a.t) {
    case 'bid': {
      if (sala.phase !== 'auction' || !au || au.stage !== 'bidding') return { error: 'fase' };
      if (au.passed.includes(m.seat)) return { error: 'ja-passou' };
      if (au.leader === m.seat) return { error: 'ja-lidera' };
      const p = LIGAS[sala.mode].players.find(x => x.id === au.lot);
      if (!vagasCompativeisM(m, sala, p).length) return { error: 'sem-vaga' };
      const valor = Math.max(1, Math.min(Number(a.amount) || 0, m.coins));
      if (valor <= au.bid) return { error: 'lance-baixo' };
      au.bid = valor;
      au.leader = m.seat;
      au.endsAt = Math.max(au.endsAt, Date.now() + 3000);
      return {};
    }
    case 'pass': {
      if (!au || au.stage !== 'bidding') return { error: 'fase' };
      if (!au.passed.includes(m.seat)) au.passed.push(m.seat);
      return {};
    }
    case 'place': {
      if (!au || au.stage !== 'placing' || au.winner !== m.seat) return { error: 'fase' };
      const p = LIGAS[sala.mode].players.find(x => x.id === au.lot);
      normalizarSquad(m, sala);
      const slot = Number(a.slot);
      const f = formacaoDe(m, sala.size);
      const nTitulares = f.slots.length;
      if (!Number.isInteger(slot) || slot < 0 || slot >= totalVagas(sala.size)) return { error: 'fora-de-posicao' };
      // Titular exige posição compatível; banco aceita qualquer jogador.
      if (slot < nTitulares) {
        const grupo = f.slots[slot];
        if ((VAGA_GRUPO[grupo] || []).every(g => !(p.groups || []).includes(g))) return { error: 'fora-de-posicao' };
      }
      if (m.squad[slot]) return { error: 'vaga-ocupada' };
      const r = comprar(sala, m, p, slot);
      if (r && r.error) return r;
      au.history.push({ p: p.id, seat: m.seat, price: au.bid });
      au.stage = 'wait'; au.idx++; au.winner = null;
      proximoLote(sala);
      return {};
    }
    case 'formation': {
      m.formation = a.f;
      return {};
    }
    case 'crest': {
      m.crest = a.c;
      return {};
    }
    case 'ready': {
      m.ready = !!a.v;
      if (sala.phase === 'prep' && sala.managers.every(x => x.bot || x.ready)) iniciarCampeonato(sala);
      return {};
    }
    case 'start': {
      if (sala.host !== m.seat) return { error: 'so-o-dono' };
      if (sala.phase === 'lobby') iniciarLeilao(sala);
      return {};
    }
    case 'addBot': {
      if (sala.host !== m.seat) return { error: 'so-o-dono' };
      if (sala.managers.length < sala.limit) adicionarBot(sala);
      return {};
    }
    case 'kick': {
      if (sala.host !== m.seat) return { error: 'so-o-dono' };
      const alvo = sala.managers.find(x => x.seat === Number(a.seat));
      if (alvo && !alvo.bot) { alvo.left = true; }
      return {};
    }
    case 'leave': {
      m.left = true;
      if (sala.host === m.seat) {
        const prox = sala.managers.find(x => !x.left && !x.bot);
        sala.host = prox ? prox.seat : -1;
      }
      return {};
    }
    case 'settings': {
      if (sala.host !== m.seat) return { error: 'so-o-dono' };
      if (sala.phase !== 'lobby') return { error: 'fase' };
      if (a.format) sala.format = a.format;
      if (a.size && [5, 7, 11].includes(a.size)) sala.size = a.size;
      if (a.limit) sala.limit = Math.min(16, Math.max(sala.managers.length, a.limit));
      if (a.hide !== undefined) sala.hide = !!a.hide;
      if (a.visibility) sala.visibility = a.visibility;
      return {};
    }
    default:
      return { error: 'acao-desconhecida' };
  }
}

// helper usado pela ação de lance
function vagasCompativeisM(m, sala, p) { return vagasCompativeis(m, p); }

// ---------- ticks ----------
setInterval(() => {
  const agora = Date.now();
  for (const sala of salas.values()) {
    const au = sala.auction;
    if (sala.phase !== 'auction' || !au) continue;

    if (au.stage === 'bidding') {
      if (agora < au.endsAt) continue;
      if (au.leader !== null) {
        au.stage = 'placing';
        au.winner = au.leader;
        au.placedAt = agora;
        toca(sala);
        const w = sala.managers.find(m => m.seat === au.winner);
        if (w && w.bot) setTimeout(() => compraAutomatica(sala), 600);
      } else {
        au.idx++;
        au.stage = 'wait';
        proximoLote(sala);
        toca(sala);
      }
      continue;
    }

    if (au.stage === 'placing') {
      // se o vencedor (humano) sumiu ou demorou, o bot escolhe por ele
      const w = sala.managers.find(m => m.seat === au.winner);
      if (!w || w.left || agora - (au.placedAt || agora) > 20000) compraAutomatica(sala);
      continue;
    }

    if (au.stage === 'wait') {
      // destrava se o próximo lote não foi iniciado
      if (agora - (sala.at || 0) > 60000) { proximoLote(sala); toca(sala); }
    }
  }
}, 400);

// bots: dão lances nos jogadores
setInterval(() => {
  for (const sala of salas.values()) {
    const au = sala.auction;
    if (sala.phase !== 'auction' || !au || au.stage !== 'bidding' || !au.lot) continue;
    const p = LIGAS[sala.mode].players.find(x => x.id === au.lot);
    for (const m of sala.managers) {
      if (!m.bot || m.left) continue;
      if (au.passed.includes(m.seat) || au.leader === m.seat) continue;
      if (!vagasCompativeis(m, p).length) { if (!au.passed.includes(m.seat)) au.passed.push(m.seat); continue; }
      const valor = precoBase(p);
      normalizarSquad(m, sala);
      const nTit = formacaoDe(m, sala.size).slots.length;
      const titularesLivres = m.squad.slice(0, nTit).filter(x => !x).length;
      const bancoLivre = m.squad.slice(nTit).filter(x => !x).length;
      // primeiro completa o time; depois só reforça o banco se sobrar dinheiro
      const guardaTitulares = Math.max(0, titularesLivres - 1) * 3;
      const quantoPode = m.coins - guardaTitulares;
      const prioridade = titularesLivres > 0 ? 0.62 : (bancoLivre > 0 ? 0.3 : 0);
      const quer = p.rating >= 70 && valor + au.bid <= quantoPode && Math.random() < prioridade;
      if (quer) {
        au.bid = au.bid + Math.max(1, Math.round(valor * 0.15));
        au.leader = m.seat;
        au.endsAt = Math.max(au.endsAt, Date.now() + 2500);
        toca(sala);
      }
    }
  }
}, 1500);

function compraAutomatica(sala) {
  const au = sala.auction;
  if (!au || au.stage !== 'placing') return;
  const w = sala.managers.find(m => m.seat === au.winner);
  if (!w) return;
  const p = LIGAS[sala.mode].players.find(x => x.id === au.lot);
  const vagas = vagasCompativeis(w, p);
  if (vagas.length) comprar(sala, w, p, vagas[0]);
  au.history.push({ p: p.id, seat: w.seat, price: au.bid });
  au.stage = 'wait'; au.idx++; au.winner = null;
  proximoLote(sala);
  toca(sala);
}

// limpa salas velhas
setInterval(() => {
  const agora = Date.now();
  for (const [code, sala] of salas) {
    if (agora - sala.at > 1000 * 60 * 60 * 2) { salas.delete(code); }
  }
}, 60000);

// ---------- visão do estado ----------
function visao(sala, pid) {
  const m = acharManager(sala, pid);
  return { ...sala, you: m ? m.seat : null };
}

module.exports = {
  LIGAS, salas, porPid,
  novaSala, acharManager, visao, acao, toca, iniciarLeilao, formacoes, formacaoDe,
  adicionarBot, recarregar: () => { LIGAS = carregarLigas(); return LIGAS; },
  get ligas() { return LIGAS; }
};

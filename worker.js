import { DurableObject } from 'cloudflare:workers';
/* ==========================================================================
   TAPADA — servidor do leilão em Cloudflare Workers.
   Implementa a mesma API que o cliente usa:
     POST /api/room    {op: create|join|act|beat}
     GET  /api/h?c&v   heartbeat + estado quando muda
     GET  /api/s?c&v   estado completo
     GET  /api/rooms?mode=   salas públicas
   O estado de cada sala vive num Durable Object (Sala). A lista de salas
   públicas vive em outro (Indice).
   ========================================================================== */

// ---------- utilidades ----------
const rnd = n => Math.floor(Math.random() * n);
const pick = a => a[rnd(a.length)];
const uid = () => Math.random().toString(36).slice(2, 10);
function codigo() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += A[rnd(A.length)];
  return s;
}

const VAGA_GRUPO = { GK: ['GK'], DEF: ['DEF'], MID: ['MID'], ATT: ['ATT'] };

const FORM5 = [
  { id: '2-1-1', slots: ['GK', 'DEF', 'DEF', 'MID', 'ATT'] },
  { id: '1-2-1', slots: ['GK', 'DEF', 'MID', 'MID', 'ATT'] },
  { id: '1-1-2', slots: ['GK', 'DEF', 'MID', 'ATT', 'ATT'] },
  { id: '2-0-2', slots: ['GK', 'DEF', 'DEF', 'ATT', 'ATT'] },
  { id: '3-1', slots: ['GK', 'DEF', 'DEF', 'DEF', 'ATT'] },
  { id: '1-3', slots: ['GK', 'DEF', 'ATT', 'ATT', 'ATT'] }
];
const FORM7 = [
  { id: '2-3-1', slots: ['GK', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT'] },
  { id: '3-2-1', slots: ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'ATT'] },
  { id: '2-2-2', slots: ['GK', 'DEF', 'DEF', 'MID', 'MID', 'ATT', 'ATT'] },
  { id: '3-1-2', slots: ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'ATT', 'ATT'] },
  { id: '4-1-1', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'ATT'] },
  { id: '1-2-3', slots: ['GK', 'DEF', 'MID', 'MID', 'ATT', 'ATT', 'ATT'] }
];
const FORM11 = [
  { id: '4-4-2', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT'] },
  { id: '4-3-3', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT'] },
  { id: '3-5-2', slots: ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT'] },
  { id: '3-4-3', slots: ['GK', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT', 'ATT'] },
  { id: '5-4-1', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATT'] },
  { id: '4-2-4', slots: ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'ATT', 'ATT', 'ATT', 'ATT'] }
];
function formacoes(size) { return size === 11 ? FORM11 : size === 7 ? FORM7 : FORM5; }
const BANCO = { 5: 4, 7: 5, 11: 7 };

function formacaoDe(m, size) {
  const l = formacoes(size);
  return l.find(f => f.id === m.formation) || l[0];
}
function totalVagas(size) {
  return formacoes(size)[0].slots.length + (BANCO[size] || 4);
}
function novasVagas(size, formation) {
  const slots = formacaoDe({ formation }, size).slots;
  return Array.from({ length: slots.length + (BANCO[size] || 4) }, () => null);
}
function normalizarSquad(m, size) {
  const n = totalVagas(size);
  if (!Array.isArray(m.squad) || m.squad.length !== n) {
    m.squad = Array.from({ length: n }, (_, i) => (Array.isArray(m.squad) ? m.squad[i] || null : null));
  }
}
function vagasCompativeis(m, p, size) {
  const slots = formacaoDe(m, size).slots;
  const out = [];
  slots.forEach((g, i) => {
    if (m.squad[i]) return;
    if ((VAGA_GRUPO[g] || []).some(x => (p.groups || []).includes(x))) out.push(i);
  });
  for (let i = slots.length; i < totalVagas(size); i++) if (!m.squad[i]) out.push(i);
  return out;
}
function precoBase(p) {
  return Math.max(1, Math.round(Math.pow((Math.max(55, p.rating) - 52) / 7.4, 2.15) + 3));
}
function novoManager(seat, pid, nome, bot, clubId, size) {
  const f = formacoes(size)[0];
  return {
    seat, pid, name: nome, bot: !!bot, ready: !!bot, crest: clubId,
    coins: 100, squad: novasVagas(size, f.id), formation: f.id, rating: 0,
    left: false, style: 'balanced', posture: 'balanced', fit: 75,
    wins: 0, draws: 0, losses: 0
  };
}

const NOMES_BOT = ['Abel', 'Mourinho', 'Guardiola', 'Ancelotti', 'Klopp', 'Simeone', 'Tite', 'Diniz', 'Renato', 'Dorival'];

// ==========================================================================
// Durable Object: uma sala
// ==========================================================================
export class Sala extends DurableObject {
  constructor(state, env) {
    super(state, env);
    this.sala = null;
    this.ligas = null;
    this.alarmeAgendado = false;
  }

  get db() { return this.ctx.storage; }

  async carregarLigas() {
    if (this.ligas) return this.ligas;
    const r = await this.env.ASSETS.fetch(new Request('https://tapada.local/extra-leagues.js'));
    const txt = await r.text();
    const json = txt.slice(txt.indexOf('=') + 1).trim().replace(/;$/, '');
    const extra = JSON.parse(json);
    const ligas = {};
    for (const [k, L] of Object.entries(extra)) {
      ligas[k] = { code: k, title: L.title, short: L.short || L.title, players: L.players || [], clubs: L.clubs || [] };
    }
    // Brasileirão e Kings League vêm de um JSON separado
    try {
      const r2 = await this.env.ASSETS.fetch(new Request('https://tapada.local/elencos-base.json'));
      const base = await r2.json();
      for (const [k, L] of Object.entries(base)) ligas[k] = { code: k, title: L.title, short: L.short, players: L.players, clubs: L.clubs };
    } catch (e) { /* segue sem eles */ }
    this.ligas = ligas;
    return ligas;
  }

  // Sem cache em memória: cada requisição lê o estado gravado, para dois
  // jogadores nunca verem versões diferentes da mesma sala.
  async load() {
    this.sala = (await this.db.get('sala')) || null;
    return this.sala;
  }
  async save() {
    if (this.sala) await this.db.put('sala', this.sala);
  }
  async toca() {
    const s = this.sala;
    s.v = (s.v || 0) + 1;
    s.at = Date.now();
    await this.save();
    await this.agendar();
  }

  // salva sem mudar a versão (as ações chamam isto; o handler incrementa 1x)
  async salva() {
    this.sala.at = Date.now();
    await this.save();
    await this.agendar();
  }

  // um alarme por sala processa o relógio do leilão
  async agendar() {
    const s = this.sala;
    if (!s || !s.auction || s.phase !== 'auction') return;
    const a = s.auction;
    let quando = null;
    if (a.stage === 'bidding') quando = a.endsAt;
    else if (a.stage === 'placing') quando = Date.now() + 700;
    if (!quando) return;
    const atual = await this.db.getAlarm();
    if (!atual || Math.abs(atual - quando) > 250) {
      await this.db.setAlarm(Math.max(Date.now() + 250, quando));
    }
  }

  async alarm() {
    await this.load();
    if (!this.sala) return;
    const s = this.sala;
    const a = s.auction;
    if (s.phase === 'auction' && a) {
      const agora = Date.now();
      if (a.stage === 'bidding' && agora >= a.endsAt) {
        if (a.leader !== null) {
          a.stage = 'placing';
          a.winner = a.leader;
          a.placedAt = agora;
          await this.salva();
          const w = s.managers.find(m => m.seat === a.winner);
          if (w && w.bot) { await this.compraAuto(); }
        } else {
          a.idx++;
          await this.proximoLote();
          await this.salva();
        }
      }
      // bots dão lance
      await this.botsLances();
      // vencedor humano demorou
      if (a.stage === 'placing' && Date.now() - (a.placedAt || Date.now()) > 20000) await this.compraAuto();
    }
    await this.agendar();
  }

  async botsLances() {
    const s = this.sala; const a = s.auction;
    const ligas = await this.carregarLigas();
    if (!a || a.stage !== 'bidding' || !a.lot) return;
    const p = ligas[s.mode].players.find(x => x.id === a.lot);
    if (!p) return;
    for (const m of s.managers) {
      if (!m.bot || m.left) continue;
      if (a.passed.includes(m.seat) || a.leader === m.seat) continue;
      if (!vagasCompativeis(m, p, s.size).length) { a.passed.push(m.seat); continue; }
      const valor = precoBase(p);
      const nTit = formacaoDe(m, s.size).slots.length;
      const livres = m.squad.slice(0, nTit).filter(x => !x).length;
      const bancoLivre = m.squad.slice(nTit).filter(x => !x).length;
      const quantoPode = m.coins - Math.max(0, livres - 1) * 3;
      const prioridade = livres > 0 ? 0.62 : (bancoLivre > 0 ? 0.3 : 0);
      const caro = a.bid > valor * 1.15;
      const quer = !(caro && Math.random() > 0.25) && p.rating >= 70 && valor + a.bid <= quantoPode && Math.random() < prioridade;
      if (quer) {
        a.bid += Math.max(1, Math.round(valor * 0.12));
        a.leader = m.seat;
        a.endsAt = Math.min(Math.max(a.endsAt, Date.now() + 2000), Date.now() + 6000);
        await this.salva();
      }
    }
  }

  async proximoLote() {
    const s = this.sala; const a = s.auction;
    const ligas = await this.carregarLigas();
    while (a.idx < a.total) {
      const id = a.lots[a.idx];
      const p = ligas[s.mode].players.find(x => x.id === id);
      if (!p) { a.idx++; continue; }
      const tem = s.managers.some(m => !m.left && vagasCompativeis(m, p, s.size).length > 0);
      if (tem) {
        a.lot = id; a.stage = 'bidding'; a.bid = 0; a.leader = null;
        a.passed = s.managers.filter(m => m.left || !vagasCompativeis(m, p, s.size).length).map(m => m.seat);
        a.endsAt = Date.now() + 10000;
        return;
      }
      a.idx++;
    }
    a.lot = null; a.stage = 'done'; s.phase = 'prep';
    s.managers.forEach(m => { m.ready = m.bot; });
  }

  async iniciarLeilao() {
    const s = this.sala;
    const ligas = await this.carregarLigas();
    const L = ligas[s.mode];
    const nVagas = totalVagas(s.size);
    const total = Math.max(12, s.managers.length * nVagas);
    const pool = L.players.slice();
    for (let i = pool.length - 1; i > 0; i--) { const j = rnd(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const lotes = pool.slice(0, total).sort((a, b) => b.rating - a.rating);
    s.managers.forEach(m => {
      m.formation = formacoes(s.size)[0].id;
      m.squad = novasVagas(s.size, m.formation);
      m.coins = 100; m.ready = false;
    });
    s.phase = 'auction';
    s.auction = { idx: 0, total: lotes.length, lots: lotes.map(p => p.id), lot: null, stage: 'wait',
      bid: 0, leader: null, endsAt: 0, passed: [], history: [], winner: null };
    s.startedAt = Date.now();
    await this.proximoLote();
    await this.salva();
  }

  async comprar(m, p, vaga) {
    const s = this.sala; const a = s.auction;
    const preco = Math.max(1, a.bid || 1);
    if (m.coins < preco) return { error: 'sem-saldo' };
    normalizarSquad(m, s.size);
    const total = totalVagas(s.size);
    if (m.squad.filter(Boolean).length >= total) return { error: 'elenco-cheio' };
    if (vaga == null) { const l = vagasCompativeis(m, p, s.size); vaga = l.length ? l[0] : null; }
    if (vaga == null || m.squad[vaga]) return { error: 'vaga-ocupada' };
    m.coins -= preco;
    m.squad[vaga] = p.id;
    const ligas = await this.carregarLigas();
    const nTit = formacaoDe(m, s.size).slots.length;
    const tit = m.squad.slice(0, nTit).filter(Boolean);
    const ids = tit.length ? tit : m.squad.filter(Boolean);
    const liga = ligas[s.mode];
    m.rating = Math.round(ids.reduce((t, id) => {
      const pl = liga.players.find(x => x.id === id);
      return t + (pl ? pl.rating : 60);
    }, 0) / Math.max(1, ids.length));
    return {};
  }

  async compraAuto() {
    const s = this.sala; const a = s.auction;
    if (!a || a.stage !== 'placing') return;
    const ligas = await this.carregarLigas();
    const w = s.managers.find(m => m.seat === a.winner);
    const p = ligas[s.mode].players.find(x => x.id === a.lot);
    if (w && p) {
      const v = vagasCompativeis(w, p, s.size);
      if (v.length) await this.comprar(w, p, v[0]);
    }
    a.history.push({ p: a.lot, seat: a.winner, price: a.bid });
    a.stage = 'wait'; a.idx++; a.winner = null;
    await this.proximoLote();
    await this.salva();
  }

  async iniciarCampeonato() {
    const s = this.sala;
    const ms = s.managers.filter(m => !m.left);
    const jogos = [];
    for (let i = 0; i < ms.length; i++) for (let j = i + 1; j < ms.length; j++) {
      jogos.push({ home: ms[i].seat, away: ms[j].seat, gh: 0, ga: 0, status: 'pending' });
    }
    s.phase = 'tourney';
    s.tourney = { rounds: [{ label: 'Pontos corridos' }], matches: jogos, cur: 0 };
    const ligas = await this.carregarLigas();
    const forca = m => {
      const ids = (m.squad || []).filter(Boolean);
      if (!ids.length) return 60;
      return ids.reduce((t, id) => {
        const pl = ligas[s.mode].players.find(x => x.id === id);
        return t + (pl ? pl.rating : 60);
      }, 0) / ids.length;
    };
    for (const j of jogos) {
      const h = s.managers.find(m => m.seat === j.home);
      const a = s.managers.find(m => m.seat === j.away);
      const fh = forca(h), fa = forca(a);
      const lam = (x, y, casa) => Math.max(0.2, 1.3 * Math.pow(x / y, 3) * (casa ? 1.12 : 0.9));
      const pois = l => { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= Math.random(); } while (p > L); return k - 1; };
      j.gh = Math.min(6, pois(lam(fh, fa, true)));
      j.ga = Math.min(6, pois(lam(fa, fh, false)));
      j.status = 'done';
    }
    await this.salva();
  }

  async acao(m, a) {
    const s = this.sala;
    const au = s.auction;
    const ligas = await this.carregarLigas();
    switch (a.t) {
      case 'bid': {
        if (s.phase !== 'auction' || !au || au.stage !== 'bidding') return { error: 'fase' };
        if (au.passed.includes(m.seat)) return { error: 'ja-passou' };
        if (au.leader === m.seat) return { error: 'ja-lidera' };
        const p = ligas[s.mode].players.find(x => x.id === au.lot);
        if (!vagasCompativeis(m, p, s.size).length) return { error: 'sem-vaga' };
        const v = Math.max(1, Math.min(Number(a.amount) || 0, m.coins));
        if (v <= au.bid) return { error: 'lance-baixo' };
        au.bid = v; au.leader = m.seat;
        au.endsAt = Math.min(Math.max(au.endsAt, Date.now() + 3000), Date.now() + 4000);
        return {};
      }
      case 'pass': {
        if (!au || au.stage !== 'bidding') return { error: 'fase' };
        if (!au.passed.includes(m.seat)) au.passed.push(m.seat);
        return {};
      }
      case 'place': {
        if (!au || au.stage !== 'placing' || au.winner !== m.seat) return { error: 'fase' };
        const p = ligas[s.mode].players.find(x => x.id === au.lot);
        normalizarSquad(m, s.size);
        const slot = Number(a.slot);
        const f = formacaoDe(m, s.size);
        if (!Number.isInteger(slot) || slot < 0 || slot >= totalVagas(s.size)) return { error: 'fora-de-posicao' };
        if (slot < f.slots.length) {
          if ((VAGA_GRUPO[f.slots[slot]] || []).every(g => !(p.groups || []).includes(g))) return { error: 'fora-de-posicao' };
        }
        if (m.squad[slot]) return { error: 'vaga-ocupada' };
        const r = await this.comprar(m, p, slot);
        if (r.error) return r;
        au.history.push({ p: p.id, seat: m.seat, price: au.bid });
        au.stage = 'wait'; au.idx++; au.winner = null;
        await this.proximoLote();
        return {};
      }
      case 'formation': m.formation = a.f; return {};
      case 'crest': m.crest = a.c; return {};
      case 'ready': {
        m.ready = !!a.v;
        if (s.phase === 'prep' && s.managers.every(x => x.bot || x.ready)) await this.iniciarCampeonato();
        return {};
      }
      case 'start': {
        if (s.host !== m.seat) return { error: 'so-o-dono' };
        if (s.phase === 'lobby') await this.iniciarLeilao();
        return {};
      }
      case 'addBot': {
        if (s.host !== m.seat) return { error: 'so-o-dono' };
        if (s.managers.length < s.limit) {
          const usados = new Set(s.managers.map(x => x.name));
          const nome = NOMES_BOT.find(n => !usados.has(n)) || 'Bot ' + (s.managers.length + 1);
          const livre = [...Array(s.limit).keys()].find(i => !s.managers.some(x => x.seat === i && !x.left));
          s.managers.push(novoManager(livre, 'bot-' + uid(), nome, true, pick(ligas[s.mode].clubs).id, s.size));
        }
        return {};
      }
      case 'kick': {
        if (s.host !== m.seat) return { error: 'so-o-dono' };
        const alvo = s.managers.find(x => x.seat === Number(a.seat));
        if (alvo && !alvo.bot) alvo.left = true;
        return {};
      }
      case 'leave': {
        m.left = true;
        if (s.host === m.seat) {
          const prox = s.managers.find(x => !x.left && !x.bot);
          s.host = prox ? prox.seat : -1;
        }
        return {};
      }
      case 'settings': {
        if (s.host !== m.seat) return { error: 'so-o-dono' };
        if (s.phase !== 'lobby') return { error: 'fase' };
        if (a.format) s.format = a.format;
        if (a.limit) s.limit = Math.min(16, Math.max(s.managers.length, a.limit));
        if (a.hide !== undefined) s.hide = !!a.hide;
        if (a.visibility) s.visibility = a.visibility;
        return {};
      }
      default: return { error: 'acao-desconhecida' };
    }
  }

  visao(pid) {
    const s = this.sala;
    const m = s.managers.find(x => x.pid === pid && !x.left);
    const out = { ...s, now: Date.now(), you: m ? m.seat : null };
    if (s.auction && m && this.ligas) {
      const p = this.ligas[s.mode] && this.ligas[s.mode].players.find(x => x.id === s.auction.lot);
      const livres = (m.squad || []).filter(x => !x).length;
      out.auction = {
        ...s.auction,
        maxBid: livres === 0 ? 0 : Math.max(0, m.coins - (livres - 1)),
        slots: p ? vagasCompativeis(m, p, s.size) : []
      };
    }
    return out;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const op = url.searchParams.get('op');
    await this.load();

    if (op === 'create') {
      const body = await req.json();
      const ligas = await this.carregarLigas();
      if (!ligas[body.mode]) return Response.json({ error: 'modo-invalido' }, { status: 400 });
      const size = body.mode === 'kl' ? 7 : (Number(body.size) === 11 ? 11 : 5);
      const L = ligas[body.mode];
      const code = (url.searchParams.get('code') || codigo()).toUpperCase();
      const bots = Math.max(0, Math.min((body.limit || 8) - 1, body.bots || 0));
      this.sala = {
        code, mode: body.mode, title: L.title, size,
        format: body.format === 'ko' ? 'ko' : body.format === 'both' ? 'both' : 'league',
        limit: Math.min(16, Math.max(2, body.limit || 8)),
        hide: !!body.hide,
        visibility: body.visibility === 'private' ? 'private' : 'public',
        phase: 'lobby', host: 0, v: 1, at: Date.now(), managers: [], auction: null, tourney: null, startedAt: 0
      };
      this.sala.managers.push(novoManager(0, body.pid, (body.name || 'Técnico').slice(0, 18), false, pick(L.clubs).id, size));
      for (let i = 0; i < bots; i++) {
        const usados = new Set(this.sala.managers.map(x => x.name));
        const nome = NOMES_BOT.find(n => !usados.has(n)) || 'Bot';
        this.sala.managers.push(novoManager(this.sala.managers.length, 'bot-' + uid(), nome, true, pick(L.clubs).id, size));
      }
      await this.save();
      await this.toca();   // garante v > initial do cliente
      return Response.json(this.visao(body.pid));
    }

    if (!this.sala) return Response.json({ error: 'sala-nao-existe' }, { status: 404 });

    if (op === 'join') {
      const body = await req.json();
      let m = this.sala.managers.find(x => x.pid === body.pid && !x.left);
      if (!m) {
        if (this.sala.managers.filter(x => !x.left).length >= this.sala.limit) return Response.json({ error: 'sala-cheia' }, { status: 400 });
        const livres = [...Array(this.sala.limit).keys()].filter(i => !this.sala.managers.some(x => x.seat === i && !x.left));
        const ligas = await this.carregarLigas();
        m = novoManager(livres[0], body.pid, (body.name || 'Técnico').slice(0, 18), false, pick(ligas[this.sala.mode].clubs).id, this.sala.size);
        this.sala.managers.push(m);
        this.sala.managers.sort((a, b) => a.seat - b.seat);
        await this.toca();
      }
      return Response.json(this.visao(body.pid));
    }

    if (op === 'beat') { this.sala.at = Date.now(); await this.save(); return Response.json({ ok: true }); }

    if (op === 'act') {
      const body = await req.json();
      const m = this.sala.managers.find(x => x.pid === body.pid && !x.left);
      if (!m) return Response.json({ error: 'nao-esta-na-sala' }, { status: 403 });
      const r = await this.acao(m, body.action || {});
      // uma unica atualizacao por acao (as acoes internas nao incrementam)
      if (!r.error) await this.toca();
      if (r.error) return Response.json({ error: r.error }, { status: 400 });
      return Response.json(this.visao(body.pid));
    }

    if (op === 'state') {
      const v = Number(url.searchParams.get('v') || 0);
      // A versão diz se o estado mudou. Se o cliente está atrasado, mandamos a
      // view no próprio heartbeat com uma versão imediatamente seguinte — assim
      // ele nunca fica preso esperando um número que não vem.
      const mudou = this.sala.v > v;
      const out = { v: mudou ? this.sala.v : v, now: Date.now(), hot: this.sala.phase === 'auction' };
      if (mudou) out.view = this.visao(url.searchParams.get('pid') || '');
      else if (!this.sala.v) out.view = this.visao(url.searchParams.get('pid') || '');
      return Response.json(out);
    }

    if (op === 'full') return Response.json(this.visao(url.searchParams.get('pid') || ''));

    return Response.json({ error: 'op-invalida' }, { status: 400 });
  }
}

// ==========================================================================
// Durable Object: índice de salas públicas
// ==========================================================================
export class Indice extends DurableObject {
  get db() { return this.ctx.storage; }
  async fetch(req) {
    const url = new URL(req.url);
    const op = url.searchParams.get('op');
    let lista = (await this.db.get('salas')) || {};
    const agora = Date.now();
    for (const [k, v] of Object.entries(lista)) if (agora - v.at > 3 * 3600 * 1000) delete lista[k];

    if (op === 'put') {
      const d = await req.json();
      lista[d.code] = { code: d.code, mode: d.mode, host: d.host, format: d.format, size: d.size,
        n: d.n, limit: d.limit, phase: d.phase, at: agora, visibility: d.visibility || 'public' };
      await this.db.put('salas', lista);
      return Response.json({ ok: true });
    }
    if (op === 'del') {
      delete lista[url.searchParams.get('code')];
      await this.db.put('salas', lista);
      return Response.json({ ok: true });
    }
    const mode = url.searchParams.get('mode') || 'all';
    const out = Object.values(lista)
      .filter(s => s.visibility === 'public' && (mode === 'all' || s.mode === mode))
      .map(s => ({ code: s.code, mode: s.mode, host: s.host, format: s.format, size: s.size, n: s.n, limit: s.limit, phase: s.phase, at: s.at }))
      .sort((a, b) => b.n - a.n || b.at - a.at);
    return Response.json({ rooms: out });
  }
}

// ==========================================================================
// Roteador
// ==========================================================================
function pidDoReq(req, url) {
  let p = req.headers.get('x-pid') || url.searchParams.get('pid') || '';
  if (!p) {
    const ck = /(?:^|;\s*)pid=([A-Za-z0-9-]{8,64})/.exec(req.headers.get('cookie') || '');
    if (ck) p = ck[1];
  }
  return p || 'anon';
}

function jsonComCookie(obj, pid, status = 200) {
  const r = Response.json(obj, { status });
  if (pid && pid !== 'anon') r.headers.set('set-cookie', 'pid=' + pid + '; Path=/; SameSite=Lax');
  return r;
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === '/api/rooms') {
      const mode = url.searchParams.get('mode') || 'all';
      const id = env.INDICE.idFromName('principal');
      return env.INDICE.get(id).fetch('https://tapada.local/?mode=' + encodeURIComponent(mode));
    }

    // O cliente só manda x-pid nos POSTs. Nos GETs de polling identificamos pelo
    // cookie gravado na criação/entrada. Sem isso, "you" viria null.
    const pid = pidDoReq(req, url);
    const comCookie = r => {
      if (!pid || pid === 'anon') return r;
      const n = new Response(r.body, r);
      n.headers.set('set-cookie', 'pid=' + pid + '; Path=/; SameSite=Lax');
      return n;
    };

    if (path === '/api/room' && req.method === 'POST') {
      const body = await req.clone().json().catch(() => ({}));
      const op = body.op;

      if (op === 'create') {
        const code = codigo();
        const stub = env.SALAS.get(env.SALAS.idFromName(code));
        const r = await stub.fetch('https://tapada.local/?op=create&code=' + code, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, pid })
        });
        if (r.ok) {
          const d = await r.clone().json();
          const idx = env.INDICE.idFromName('principal');
          await env.INDICE.get(idx).fetch('https://tapada.local/?op=put', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              code, mode: d.mode, host: (d.managers[0] || {}).name, format: d.format,
              size: d.size, n: d.managers.filter(m => !m.left).length,
              limit: d.limit, phase: d.phase, visibility: d.visibility
            })
          });
        }
        return comCookie(r);
      }

      const code = String(body.code || '').toUpperCase();
      const stub = env.SALAS.get(env.SALAS.idFromName(code));
      const r = await stub.fetch('https://tapada.local/?op=' + encodeURIComponent(op), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, pid })
      });
      if (r.ok && (op === 'join' || op === 'act')) {
        try {
          const d = await r.clone().json();
          if (d && d.code) {
            const idx = env.INDICE.idFromName('principal');
            await env.INDICE.get(idx).fetch('https://tapada.local/?op=put', {
              method: 'POST', headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                code, mode: d.mode,
                host: (d.managers.find(m => m.seat === d.host) || {}).name,
                format: d.format, size: d.size,
                n: d.managers.filter(m => !m.left).length,
                limit: d.limit, phase: d.phase, visibility: d.visibility
              })
            });
          }
        } catch (e) { /* índice é opcional */ }
      }
      return comCookie(r);
    }

    if (path === '/api/h' || path === '/api/s') {
      const code = String(url.searchParams.get('c') || '').toUpperCase();
      const op = path === '/api/h' ? 'state' : 'full';
      const stub = env.SALAS.get(env.SALAS.idFromName(code));
      const alvo = 'https://tapada.local/?op=' + op + '&v=' + (url.searchParams.get('v') || 0) +
        '&pid=' + encodeURIComponent(pid);
      const r = await stub.fetch(alvo, { headers: { 'x-pid': pid } });
      return comCookie(r);
    }

    if (path === '/api/ligas') {
      const stub = env.SALAS.get(env.SALAS.idFromName('info-' + uid()));
      const ligas = await stub.carregarLigas();
      const out = {};
      for (const [k, L] of Object.entries(ligas)) {
        out[k] = { title: L.title, short: L.short, players: L.players.length, clubs: L.clubs.length };
      }
      return Response.json({ ligas: out });
    }

    // todo o resto é o site
    return env.ASSETS.fetch(req);
  }
};
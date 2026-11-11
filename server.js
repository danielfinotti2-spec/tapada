#!/usr/bin/env node
/* ==========================================================================
   TAPADA — servidor local completo (site + leilão online).
   Roda o site estático E a API do leilão, então o jogo online funciona
   com amigos na mesma rede (e em casa). Na Vercel só o site roda.
   ========================================================================== */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const leilao = require('./servidor-leilao');

const ROOT = __dirname;
const FIRST_PORT = Number(process.env.PORT) || 8080;

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.json': 'application/json'
};

function tipoDe(f, buf) {
  if (buf && buf.length > 12) {
    if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  }
  return TIPOS[path.extname(f).toLowerCase()] || 'application/octet-stream';
}

function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store'
  });
  res.end(body);
}

function bancoExtra(size) { return size === 11 ? 7 : size === 7 ? 5 : 4; }
function pidDoReq(req, url) {
  let p = req.headers['x-pid'] || url.searchParams.get('pid') || '';
  if (!p) {
    const m = /(?:^|;\s*)pid=([A-Za-z0-9-]{8,64})/.exec(req.headers.cookie || '');
    if (m) p = m[1];
  }
  return p || 'anon';
}
function formacaoSlots(size, formacao) {
  const f = leilao.formacoes(size).find(x => x.id === formacao) || leilao.formacoes(size)[0];
  return f.slots.length;
}

function lerCorpo(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// ---------- API ----------
async function api(req, res, url) {

  // O cliente só manda x-pid nos POSTs. Nos GETs (polling), identificamos o técnico
  // pelo cookie que gravamos na criação/entrada — senão todo mundo seria "anon".
  let pid = req.headers['x-pid'] || url.searchParams.get('pid') || '';
  if (!pid) {
    const ck = /(?:^|;\s*)pid=([a-z0-9-]{8,64})/.exec(req.headers.cookie || '');
    if (ck) pid = ck[1];
  }
  if (!pid) pid = 'anon';

  if (url.pathname === '/api/rooms') {
    const mode = url.searchParams.get('mode') || 'all';
    const lista = [...leilao.salas.values()]
      .filter(s => s.visibility === 'public' && (mode === 'all' || s.mode === mode))
      .map(s => ({
        code: s.code, mode: s.mode, host: (s.managers.find(m => m.seat === s.host) || {}).name || '?',
        format: s.format, size: s.size, n: s.managers.filter(m => !m.left).length,
        limit: s.limit, phase: s.phase, at: s.at
      }))
      .sort((a, b) => b.n - a.n || b.at - a.at);
    return json(res, 200, { rooms: lista });
  }

  if (url.pathname === '/api/room' && req.method === 'POST') {
    const body = await lerCorpo(req);
    const op = body.op;
    const code = String(body.code || '').toUpperCase();
    const sala = leilao.salas.get(code);

    if (op === 'create') {
      try {
        const s = leilao.novaSala(body.mode, body, pid, body.name);
        console.log(`[leilão] sala ${s.code} criada (${body.mode}, ${s.size} em campo)`);
        res.setHeader('set-cookie', 'pid=' + pid + '; Path=/; SameSite=Lax');
        return json(res, 200, leilao.visao(s, pid));
      } catch (e) {
        console.error('[leilão] erro ao criar sala:', e.message);
        return json(res, 400, { error: e.message === 'modo desconhecido' ? 'modo-invalido' : 'erro-interno' });
      }
    }

    if (!sala) return json(res, 404, { error: 'sala-nao-existe' });

    if (op === 'join') {
      let m = leilao.acharManager(sala, pid);
      if (!m) {
        if (sala.managers.filter(x => !x.left).length >= sala.limit) return json(res, 400, { error: 'sala-cheia' });
        const livre = [...Array(sala.limit).keys()].find(i => !sala.managers.some(x => x.seat === i && !x.left));
        const L = leilao.ligas[sala.mode];
        m = {
          seat: livre, pid, name: (body.name || 'Técnico').slice(0, 18), bot: false, ready: false,
          crest: (L.clubs[0] || {}).id, coins: 100, squad: Array.from({ length: formacaoSlots(sala.size, '1-2-1') + (bancoExtra(sala.size)) }, () => null), formation: '1-2-1', rating: 0, left: false, __size: sala.size, style: 'balanced', posture: 'balanced', fit: 75, wins: 0, draws: 0, losses: 0
        };
        sala.managers.push(m);
        sala.managers.sort((a, b) => a.seat - b.seat);
        leilao.toca(sala);
      }
      leilao.porPid.set(pid, code);
      res.setHeader('set-cookie', 'pid=' + pid + '; Path=/; SameSite=Lax');
      return json(res, 200, leilao.visao(sala, pid));
    }

    if (op === 'beat') {
      sala.at = Date.now();
      return json(res, 200, { ok: true });
    }

    if (op === 'act') {
      const m = leilao.acharManager(sala, pid);
      if (!m) return json(res, 403, { error: 'nao-esta-na-sala' });
      const r = leilao.acao(sala, m, body.action || {});
      leilao.toca(sala);
      if (r.error) return json(res, 400, { error: r.error });
      // o cliente espera o estado completo da sala na resposta da ação
      return json(res, 200, leilao.visao(sala, pid));
    }

    return json(res, 400, { error: 'op-invalida' });
  }

  if (url.pathname === '/api/h') {
    const code = String(url.searchParams.get('c') || '').toUpperCase();
    const vCliente = Number(url.searchParams.get('v') || 0);
    const sala = leilao.salas.get(code);
    if (!sala) return json(res, 404, { error: 'sala-nao-existe' });
    const quem = pidDoReq(req, url);
    if (quem !== 'anon') res.setHeader('set-cookie', 'pid=' + quem + '; Path=/; SameSite=Lax');
    const payload = { v: sala.v, now: Date.now(), hot: sala.phase === 'auction' };
    if (sala.v > vCliente) payload.view = leilao.visao(sala, quem);
    return json(res, 200, payload);
  }

  if (url.pathname === '/api/s') {
    const code = String(url.searchParams.get('c') || '').toUpperCase();
    const sala = leilao.salas.get(code);
    if (!sala) return json(res, 404, { error: 'sala-nao-existe' });
    const quem = pidDoReq(req, url);
    if (quem !== 'anon') res.setHeader('set-cookie', 'pid=' + quem + '; Path=/; SameSite=Lax');
    return json(res, 200, { ...leilao.visao(sala, quem), v: sala.v });
  }

  if (url.pathname === '/api/ligas') {
    const out = {};
    for (const [k, L] of Object.entries(leilao.ligas)) {
      out[k] = { title: L.title, short: L.short, players: L.players.length, clubs: L.clubs.length };
    }
    return json(res, 200, { ligas: out });
  }

  return json(res, 404, { error: 'nao-encontrado' });
}

// ---------- estático ----------
const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (url.pathname.startsWith('/api/')) return api(req, res, url);

  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end('400'); }
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end('403'); }
  fs.readFile(f, (e, buf) => {
    if (e) {
      // rotas do cliente (sem extensão) caem no index
      if (!path.extname(p)) return fs.readFile(path.join(ROOT, 'index.html'), (e2, b2) => {
        if (e2) { res.writeHead(404); return res.end('404'); }
        res.writeHead(200, { 'content-type': TIPOS['.html'] }); res.end(b2);
      });
      res.writeHead(404); return res.end('404');
    }
    res.writeHead(200, { 'content-type': tipoDe(f, buf), 'cache-control': 'no-cache' });
    res.end(buf);
  });
});

let porta = FIRST_PORT;
servidor.on('error', err => {
  if (err.code === 'EADDRINUSE' && porta < FIRST_PORT + 25) { porta++; setTimeout(() => servidor.listen(porta, '0.0.0.0'), 60); return; }
  console.error('Não consegui subir o servidor:', err.message); process.exit(1);
});

servidor.on('listening', () => {
  const redes = [];
  for (const [, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) if (a.family === 'IPv4' && !a.internal) redes.push(a.address);
  }
  console.log('');
  console.log('  TAPADA rodando!');
  console.log('  Neste PC:      http://127.0.0.1:' + porta + '/');
  redes.forEach(ip => console.log('  Na sua rede:   http://' + ip + ':' + porta + '/'));
  console.log('');
  console.log('  Ligas disponíveis no leilão: ' + Object.keys(leilao.ligas).length);
  console.log('  Para parar: feche esta janela ou Ctrl+C');
  console.log('');
  if (process.env.TAPADA_NO_BROWSER !== '1') {
    const cmd = process.platform === 'win32' ? `start "" "http://127.0.0.1:${porta}/"` : `open "http://127.0.0.1:${porta}/"`;
    exec(cmd, () => {});
  }
});

servidor.listen(porta, '0.0.0.0');

/* ==========================================================================
   TAPADA — Modo Carreira (offline).
   Um técnico, uma liga, temporada após temporada:
     1. você escolhe a liga e o clube
     2. leilão: monta seu time (e os rivais se reforçam)
     3. campeonato simulado: jogos ao vivo, tabela, artilharia
     4. fim de temporada: premiação, contratações, próxima temporada
   Tudo roda no navegador; o progresso fica salvo no localStorage.
   ========================================================================== */
(function () {
  'use strict';

  const DATA = function () {
    const out = {};
    const extra = window.TAPADA_EXTRA_LEAGUES || {};
    for (const k in extra) out[k] = extra[k];
    return out;
  };

  // ---------- utilitários ----------
  const $ = (s, r) => (r || document).querySelector(s);
  const BUDGET = 100;
  const SLOTS = ['GK', 'DEF', 'DEF', 'MID', 'MID', 'ATT'];
  const KEY = 'tapada.carreira.v1';

  function rnd(seedObj) {
    // PRNG determinístico por temporada+jogo: mesmos resultados ao recarregar
    let a = seedObj >>> 0;
    return () => {
      a += 0x6D2B79F5;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
  const money = n => 'R$ ' + n;

  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} }

  // ---------- força e simulação ----------
  function squadStrength(squad) {
    if (!squad.length) return 50;
    const top = squad.slice().sort((a, b) => b.rating - a.rating);
    let w = 0, sum = 0;
    top.forEach((p, i) => { const k = Math.pow(0.86, i); w += k; sum += p.rating * k; });
    return sum / (w || 1);
  }

  function simulate(state, homeName, awayName) {
    const S = state.leagueData;
    const home = S.teams.find(t => t.name === homeName);
    const away = S.teams.find(t => t.name === awayName);
    const seed = hash(state.season + '|' + state.round + '|' + homeName + awayName);
    const r = rnd(seed);
    const hs = squadStrength(home.squad), as = squadStrength(away.squad);
    const adv = 1.9; // mando de campo
    const base = 1.25;
    const lamH = Math.max(0.15, base * Math.pow(hs / as, 3.2) * adv);
    const lamA = Math.max(0.15, base * Math.pow(as / hs, 3.2) / adv);
    const poisson = l => { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
    const gh = Math.min(6, poisson(lamH)), ga = Math.min(6, poisson(lamA));

    const goals = { home: [], away: [] };
    const scorers = t => {
      const pool = t.squad.filter(p => p.groups.includes('ATT') || p.groups.includes('MID'));
      const all = pool.length ? pool : t.squad;
      let tot = 0; const wts = all.map(p => { const w = Math.max(1, Math.pow(p.rating / 70, 3) * (p.groups.includes('ATT') ? 1.6 : 1)); tot += w; return w; });
      const pick = () => { let x = r() * tot; for (let i = 0; i < all.length; i++) { x -= wts[i]; if (x <= 0) return all[i]; } return all[all.length - 1]; };
      return pick;
    };
    const sh = scorers(home), sa = scorers(away);
    for (let i = 0; i < gh; i++) goals.home.push(sh().name);
    for (let i = 0; i < ga; i++) goals.away.push(sa().name);
    return { gh, ga, goals };
  }

  function tableInit(teams) {
    return teams.map(t => ({ name: t.name, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0 }));
  }
  function tableSort(tab) {
    return tab.slice().sort((a, b) => b.pts - a.pts || (b.gp - b.gc) - (a.gp - a.gc) || b.gp - a.gp || a.name.localeCompare(b.name));
  }

  // ---------- rodadas (todos contra todos, ida e volta) ----------
  function makeFixtures(names) {
    const list = names.slice();
    if (list.length % 2) list.push(null);
    const n = list.length, rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) {
        const a = list[i], b = list[n - 1 - i];
        if (a && b) pairs.push(r % 2 ? [b, a] : [a, b]);
      }
      rounds.push(pairs);
      list.splice(1, 0, list.pop());
    }
    const back = rounds.map(pairs => pairs.map(([a, b]) => [b, a]));
    return rounds.concat(back);
  }

  // ---------- estado ----------
  function newCareer(leagueCode, clubName, managerName) {
    const L = DATA()[leagueCode];
    const teams = L.clubs.map(c => {
      const roster = L.players.filter(p => p.club === c.name).slice()
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 14); // os rivais entram com elenco montado
      const isYou = c.name === clubName;
      // O seu clube começa vazio: é você quem monta no leilão.
      return { name: c.name, crest: c.crest, squad: isYou ? [] : roster, isYou, roster };
    });
    const st = {
      version: 1,
      league: leagueCode,
      leagueName: L.title,
      manager: managerName,
      club: clubName,
      season: 1,
      round: 0,
      phase: 'auction', // auction -> season -> offseason
      budget: BUDGET,
      pick: 0,           // índice do próximo jogador no leilão
      pool: [],          // ids da "praça" da temporada
      taken: {},         // id -> clube
      fixtures: null,
      results: {},       // "r-i" -> {gh,ga,goals, home, away}
      table: null,
      scorers: {},
      history: [],
      leagueData: null
    };
    st.teams = teams;
    st.leagueData = { teams };
    return st;
  }

  function buildAuctionPool(st) {
    const L = DATA()[st.league];
    // praça: jogadores variados por rating, ~8x o número de vagas
    const all = L.players.slice();
    const r = rnd(hash(st.league + st.season + 'auction'));
    const pool = [];
    const want = 60;
    const used = new Set();
    while (pool.length < want && pool.length < all.length) {
      // mistura: 45% craques, 35% médios, 20% promessas
      const roll = r();
      const band = roll < 0.45 ? [95, 84] : roll < 0.8 ? [84, 76] : [76, 62];
      const cands = all.filter(p => p.rating <= band[0] && p.rating >= band[1] && !used.has(p.id));
      if (!cands.length) { const rest = all.filter(p => !used.has(p.id)); if (!rest.length) break; const p = rest[Math.floor(r() * rest.length)]; used.add(p.id); pool.push(p.id); continue; }
      const p = cands[Math.floor(r() * cands.length)];
      used.add(p.id); pool.push(p.id);
    }
    st.pool = pool;
  }

  // ---------- render ----------
  let root = null;

  function el(tag, attrs, kids) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      // null / undefined / false = atributo ausente (senão viraria disabled="null")
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    (kids || []).forEach(c => { if (c == null) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }

  function face(p, size) {
    const img = el('img', { class: 'face', src: p.img, alt: p.short, loading: 'lazy' });
    img.style.width = size + 'px'; img.style.height = size + 'px';
    img.onerror = function () { this.classList.add('pendente'); };
    return img;
  }

  function you(state) { return state.teams.find(t => t.isYou); }
  function playerById(state, id) {
    const L = DATA()[state.league];
    return L.players.find(p => p.id === id);
  }

  // ---- telas ----
  function screenStart() {
    const leagues = DATA();
    const wrap = el('div', { class: 'car-page' });
    wrap.appendChild(el('div', { class: 'car-head' }, [
      el('h1', {}, ['Modo Carreira']),
      el('p', { class: 'muted' }, ['Escolha a liga e o clube. A cada temporada você leiloa reforços, joga o campeonato e tenta ser campeão.'])
    ]));
    const cur = load();
    if (cur && cur.phase !== 'auction') {
      wrap.appendChild(el('div', { class: 'car-continue' }, [
        el('b', {}, ['Carreira salva']),
        el('span', {}, [`${cur.manager} · ${cur.club} · ${cur.leagueName} · temporada ${cur.season}`]),
        el('button', { class: 'btn primary', onclick: () => { state = cur; render(); } }, ['Continuar'])
      ]));
    }
    const grid = el('div', { class: 'car-leagues' });
    for (const code in leagues) {
      const L = leagues[code];
      const card = el('button', { class: 'car-league', 'data-mode': code }, [
        el('b', {}, [L.title]),
        el('span', {}, [L.short]),
        el('small', {}, [`${L.clubs.length} clubes · ${L.players.length} jogadores`])
      ]);
      card.onclick = () => goLeague(code);
      grid.appendChild(card);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  function screenClub(code) {
    const L = DATA()[code];
    const wrap = el('div', { class: 'car-page' });
    wrap.appendChild(el('button', { class: 'btn ghost', onclick: goStart }, ['← Voltar']));
    wrap.appendChild(el('h1', {}, [L.title, ': escolha o clube']));
    const list = el('div', { class: 'car-clubs' });
    const ranked = L.clubs.slice().sort((a, b) => {
      const sa = squadStrength(L.players.filter(p => p.club === a.name));
      const sb = squadStrength(L.players.filter(p => p.club === b.name));
      return sb - sa;
    });
    ranked.forEach((c, i) => {
      const squad = L.players.filter(p => p.club === c.name);
      const str = Math.round(squadStrength(squad));
      const b = el('button', { class: 'car-club' }, [
        el('img', { src: c.crest, alt: '', width: 40, height: 40, onerror: function () { this.style.visibility = 'hidden'; } }),
        el('span', { class: 'grow' }, [el('b', {}, [c.name]), el('small', {}, [`${i + 1}º na força · ${squad.length} jogadores`])]),
        el('span', { class: 'car-str' }, [String(str)])
      ]);
      b.onclick = () => render('name', { league: code, club: c.name });
      list.appendChild(b);
    });
    wrap.appendChild(list);
    return wrap;
  }

  function screenName(code, club) {
    const wrap = el('div', { class: 'car-page narrow' });
    wrap.appendChild(el('button', { class: 'btn ghost', onclick: () => goLeague(code) }, ['← Voltar']));
    wrap.appendChild(el('h1', {}, ['Seu nome de técnico']));
    const input = el('input', { class: 'input', placeholder: 'ex.: Professor Abel', maxlength: 18 });
    wrap.appendChild(input);
    wrap.appendChild(el('p', { class: 'muted' }, [`Você vai comandar o `, el('b', {}, [club]), ` na ${DATA()[code].title}.`]));
    const go = el('button', { class: 'btn accent block', onclick: () => {
      const nm = (input.value || '').trim() || 'Técnico';
      state = newCareer(code, club, nm);
      buildAuctionPool(state);
      save(state);
      render();
    } }, ['Começar o leilão']);
    wrap.appendChild(go);
    setTimeout(() => input.focus(), 50);
    return wrap;
  }

  // ---- leilão ----
  function screenAuction() {
    const st = state;
    const me = you(st);
    const wrap = el('div', { class: 'car-page' });
    const filled = me.squad.length;
    wrap.appendChild(el('div', { class: 'car-top' }, [
      el('img', { src: me.crest, alt: '', width: 44, height: 44, onerror: function () { this.style.visibility = 'hidden'; } }),
      el('div', { class: 'grow' }, [el('b', {}, [st.manager]), el('small', {}, [`${me.name} · ${st.leagueName} · temporada ${st.season}`])]),
      el('div', { class: 'car-wallet' }, [el('b', {}, [money(st.budget)]), el('small', {}, ['para gastar'])])
    ]));

    if (filled >= SLOTS.length) {
      wrap.appendChild(el('div', { class: 'car-done' }, [
        el('h2', {}, ['Time fechado!']),
        el('p', { class: 'muted' }, [`Sobraram ${money(st.budget)}. Agora começa o campeonato.`])
      ]));
      wrap.appendChild(squadRender(me));
      wrap.appendChild(el('button', { class: 'btn accent block', onclick: startSeason }, ['Começar o campeonato']));
      return wrap;
    }

    const lot = playerById(st, st.pool[st.pick]);
    const need = SLOTS.slice(filled).join(' · ');
    wrap.appendChild(el('p', { class: 'muted small center' }, [`Vagas em aberto: `, el('b', {}, [need])]));

    if (lot) {
      const card = el('div', { class: 'car-lot' }, [
        face(lot, 132),
        el('h2', {}, [lot.name]),
        el('p', { class: 'muted' }, [`${lot.pos} · ${lot.club} · ${lot.nat}`]),
        el('div', { class: 'car-rating' }, [String(lot.rating)]),
        el('ul', { class: 'car-attrs' }, (lot.card || []).map(([k, v]) => el('li', {}, [el('span', {}, [k]), el('b', {}, [String(v)])])))
      ]);
      wrap.appendChild(card);

      // preço pedido: escala de ~7 (reserva) a ~40 (craque) com R$ 100 de verba,
      // então montar o time exige escolher entre um craque e um elenco equilibrado.
      const ask = Math.max(7, Math.round(Math.pow((lot.rating - 52) / 7.4, 2.15) + 4));
      const canBuy = st.budget >= ask;
      const remaining = SLOTS.length - filled;
      const mustSave = (remaining - 1) * 7; // guarda para os outros
      const risky = st.budget - ask < mustSave;
      wrap.appendChild(el('div', { class: 'car-actions' }, [
        el('button', { class: 'btn primary', disabled: canBuy ? null : 'disabled', onclick: () => {
          st.budget -= ask; me.squad.push(lot); st.taken[lot.id] = me.name;
          me.squad.sort((a, b) => b.rating - a.rating);
          st.pick++; save(st); render();
        } }, [`Contratar por ${money(ask)}`]),
        el('button', { class: 'btn soft', onclick: () => { st.pick++; save(st); render(); } }, ['Passar'])
      ]));
      if (!canBuy) wrap.appendChild(el('p', { class: 'error small center' }, ['Sem dinheiro para esse. Passe e espere um mais barato.']));
      else if (risky) wrap.appendChild(el('p', { class: 'muted small center' }, [`Cuidado: ainda faltam ${remaining} vagas.`]));
    } else {
      wrap.appendChild(el('p', { class: 'muted center' }, ['A praça acabou. Completando o time com sobras…']));
      fillWithLeftovers(st);
      save(st); render();
    }

    wrap.appendChild(squadRender(me));
    return wrap;
  }

  function fillWithLeftovers(st) {
    const me = you(st);
    const L = DATA()[st.league];
    const need = SLOTS.slice(me.squad.length);
    for (const slot of need) {
      const cands = L.players.filter(p => !st.taken[p.id] && p.groups.includes(slot) && p.rating <= Math.max(66, st.budget * 1.4));
      const pool = cands.length ? cands : L.players.filter(p => !st.taken[p.id]);
      if (!pool.length) break;
      const p = pool[Math.floor(Math.random() * pool.length)];
      st.taken[p.id] = me.name;
      me.squad.push(p);
    }
    me.squad.sort((a, b) => b.rating - a.rating);
  }

  function squadRender(t) {
    const wrap = el('div', { class: 'car-squad' });
    const used = t.squad.slice();
    for (let i = 0; i < SLOTS.length; i++) {
      const p = used[i];
      if (p) wrap.appendChild(el('div', { class: 'car-slot filled' }, [face(p, 34), el('span', {}, [el('b', {}, [p.short]), el('small', {}, [`${p.pos} · ${p.rating}`])])]));
      else wrap.appendChild(el('div', { class: 'car-slot' }, [el('i', {}, ['?']), el('small', {}, [SLOTS[i]])]));
    }
    return wrap;
  }

  // ---- temporada ----
  function startSeason() {
    const st = state;
    // rivais se reforçam de forma leve e determinística
    st.fixtures = makeFixtures(st.teams.map(t => t.name));
    st.table = tableInit(st.teams);
    st.results = {};
    st.scorers = {};
    st.round = 0;
    st.phase = 'season';
    save(st);
    render();
  }

  function screenSeason() {
    const st = state;
    const wrap = el('div', { class: 'car-page' });
    const me = you(st);
    const total = st.fixtures.length;

    wrap.appendChild(el('div', { class: 'car-top' }, [
      el('img', { src: me.crest, alt: '', width: 44, height: 44, onerror: function () { this.style.visibility = 'hidden'; } }),
      el('div', { class: 'grow' }, [el('b', {}, [st.manager]), el('small', {}, [`${me.name} · temporada ${st.season} · rodada ${Math.min(st.round + 1, total)}/${total}`])]),
      el('div', { class: 'car-wallet' }, [el('b', {}, [money(st.budget)]), el('small', {}, ['caixa'])])
    ]));

    const tab = tableSort(st.table);
    const pos = tab.findIndex(r => r.name === me.name) + 1;

    const next = st.fixtures[st.round];
    if (next) {
      const mine = next.find(([h, a]) => h === me.name || a === me.name);
      const box = el('div', { class: 'car-next' });
      if (mine) {
        const [h, a] = mine;
        box.appendChild(el('p', { class: 'car-fixture' }, [el('b', {}, [h]), el('i', {}, ['×']), el('b', {}, [a])]));
        box.appendChild(el('button', { class: 'btn accent block', onclick: playRound }, ['Jogar rodada']));
      } else {
        box.appendChild(el('p', { class: 'muted' }, ['Sua folga nesta rodada.']));
        box.appendChild(el('button', { class: 'btn primary block', onclick: playRound }, ['Avançar rodada']));
      }
      wrap.appendChild(box);
    }

    // últimos resultados
    const played = Object.keys(st.results).map(k => st.results[k]).sort((x, y) => y.round - x.round).slice(0, 4);
    if (played.length) {
      wrap.appendChild(el('h3', {}, ['Últimos jogos']));
      const ul = el('ul', { class: 'car-results' });
      played.forEach(m => ul.appendChild(el('li', {}, [
        el('span', {}, [m.home]), el('b', {}, [`${m.gh}–${m.ga}`]), el('span', {}, [m.away])
      ])));
      wrap.appendChild(ul);
    }

    wrap.appendChild(el('h3', {}, [`Classificação · você é o ${pos}º`]));
    const table = el('table', { class: 'table car-table' }, [
      el('thead', {}, [el('tr', {}, [el('th', {}, ['#']), el('th', {}, ['Clube']), el('th', {}, ['P']), el('th', {}, ['J']), el('th', {}, ['V']), el('th', {}, ['SG'])])]),
      el('tbody', {}, tab.map((r, i) => el('tr', { class: r.name === me.name ? 'me' : '' }, [
        el('td', {}, [String(i + 1)]), el('td', {}, [r.name]), el('td', {}, [el('b', {}, [String(r.pts)])]),
        el('td', {}, [String(r.j)]), el('td', {}, [String(r.v)]), el('td', {}, [String(r.gp - r.gc)])
      ])))
    ]);
    wrap.appendChild(table);

    // artilharia
    const top = Object.entries(st.scorers).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (top.length) {
      wrap.appendChild(el('h3', {}, ['Artilharia']));
      const ul = el('ul', { class: 'car-goals' });
      top.forEach(([n, g]) => ul.appendChild(el('li', {}, [el('span', {}, [n]), el('b', {}, [String(g)])])));
      wrap.appendChild(ul);
    }

    if (!next) {
      wrap.appendChild(el('button', { class: 'btn accent block', onclick: endSeason }, ['Encerrar temporada']));
    }
    wrap.appendChild(el('div', { class: 'car-foot' }, [
      el('button', { class: 'btn ghost danger', onclick: () => { if (confirm('Apagar a carreira e voltar?')) { localStorage.removeItem(KEY); state = null; render('start'); } } }, ['Apagar carreira']),
      el('button', { class: 'btn ghost', onclick: exitCareer }, ['Sair para o início'])
    ]));
    return wrap;
  }

  function playRound() {
    const st = state;
    const pairs = st.fixtures[st.round];
    if (!pairs) return;
    const me = you(st);
    let myMatch = null;
    pairs.forEach(([h, a]) => {
      const res = simulate(st, h, a);
      st.results[st.round] = { round: st.round, home: h, away: a, gh: res.gh, ga: res.ga };
      // tabela
      const th = st.table.find(x => x.name === h), ta = st.table.find(x => x.name === a);
      th.j++; ta.j++; th.gp += res.gh; th.gc += res.ga; ta.gp += res.ga; ta.gc += res.gh;
      if (res.gh > res.ga) { th.v++; th.pts += 3; ta.d++; }
      else if (res.gh < res.ga) { ta.v++; ta.pts += 3; th.d++; }
      else { th.e++; ta.e++; th.pts++; ta.pts++; }
      res.goals.home.forEach(n => { st.scorers[n] = (st.scorers[n] || 0) + 1; });
      res.goals.away.forEach(n => { st.scorers[n] = (st.scorers[n] || 0) + 1; });
      if (h === me.name || a === me.name) myMatch = { h, a, gh: res.gh, ga: res.ga };
    });
    st.round++;
    save(st);
    render();
    if (myMatch) showMatchToast(myMatch);
  }

  function showMatchToast(m) {
    const t = el('div', { class: 'toast car-toast' }, [
      el('b', {}, [`${m.h} ${m.gh} × ${m.ga} ${m.a}`])
    ]);
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  function endSeason() {
    const st = state;
    const tab = tableSort(st.table);
    const pos = tab.findIndex(r => r.name === you(st).name) + 1;
    const champ = tab[0];
    const prize = pos === 1 ? 40 : pos <= 3 ? 28 : pos <= 6 ? 20 : 12;
    st.history.push({ season: st.season, pos, pts: tab[pos - 1].pts, champion: champ.name, prize });
    st.budget += prize;
    st.phase = 'offseason';
    save(st);
    render();
  }

  function screenOffseason() {
    const st = state;
    const last = st.history[st.history.length - 1];
    const wrap = el('div', { class: 'car-page' });
    wrap.appendChild(el('h1', {}, ['Fim da temporada ' + last.season]));
    wrap.appendChild(el('div', { class: 'car-podium' }, [
      el('p', {}, [last.pos === 1 ? '🏆 Você foi campeão!' : `Você terminou em ${last.pos}º com ${last.pts} pontos.`]),
      el('p', { class: 'muted' }, [`Campeão: ${last.champion}`]),
      el('p', { class: 'muted' }, [`Premiação: ${money(last.prize)} — agora você tem ${money(st.budget)}.`])
    ]));

    if (st.history.length > 1) {
      wrap.appendChild(el('h3', {}, ['Sua história']));
      const ul = el('ul', { class: 'car-history' });
      st.history.slice().reverse().forEach(h => ul.appendChild(el('li', {}, [
        el('b', {}, ['T' + h.season]), el('span', {}, [`${h.pos}º · ${h.pts} pts`]), el('span', { class: 'muted' }, [h.pos === 1 ? 'campeão' : h.champion])
      ])));
      wrap.appendChild(ul);
    }

    wrap.appendChild(el('button', { class: 'btn accent block', onclick: () => {
      st.season++;
      st.phase = 'auction';
      st.pick = 0;
      st.budget = Math.min(160, st.budget + 25); // verba da direção
      buildAuctionPool(st);
      save(st);
      render();
    } }, [`Começar a temporada ${st.season + 1} (mercado de reforços)`]));
    wrap.appendChild(el('div', { class: 'car-foot' }, [
      el('button', { class: 'btn ghost danger', onclick: () => { if (confirm('Apagar a carreira?')) { localStorage.removeItem(KEY); state = null; render('start'); } } }, ['Apagar carreira']),
      el('button', { class: 'btn ghost', onclick: exitCareer }, ['Sair para o início'])
    ]));
    return wrap;
  }

  // ---------- orquestração ----------
  let state = null;
  let mode = 'start';
  let modeArg = null;

  function render(m, arg) {
    if (m) { mode = m; modeArg = arg; }
    if (!root) return;
    root.innerHTML = '';
    let view;
    if (!state) {
      if (mode === 'club') view = screenClub(modeArg || 'pt');
      else if (mode === 'name') view = screenName(modeArg.league, modeArg.club);
      else view = screenStart();
    }
    else if (state.phase === 'auction') view = screenAuction();
    else if (state.phase === 'season') view = screenSeason();
    else if (state.phase === 'offseason') view = screenOffseason();
    else view = screenStart();
    root.appendChild(view);
    window.scrollTo(0, 0);
  }

  function goStart() { mode = 'start'; state = null; render('start'); }
  function goLeague(code) { mode = 'club'; modeArg = code; render('club', code); }

  function open() {
    if (!root) {
      root = el('div', { class: 'car-overlay' });
      root.appendChild(el('div', { class: 'car-shell' }));
      document.body.appendChild(root);
      root.addEventListener('click', e => { if (e.target === root) close(); });
    }
    root.style.display = 'flex';
    document.documentElement.classList.add('car-on');
    state = load();
    render(state ? null : 'start');
  }
  function close() {
    if (root) root.style.display = 'none';
    document.documentElement.classList.remove('car-on');
  }
  function exitCareer() { close(); }

  // botão na tela inicial
  function mountButton() {
    const main = document.querySelector('.home main');
    if (!main || main.querySelector('.car-entry')) return;
    const card = el('section', { class: 'car-entry' }, [
      el('div', {}, [
        el('h2', {}, ['Modo Carreira']),
        el('p', { class: 'muted' }, ['Um clube, uma liga, temporada após temporada. Leiloe, dispute e tente ser campeão — sozinho e offline.'])
      ]),
      el('button', { class: 'btn accent', onclick: open }, ['Começar carreira'])
    ]);
    main.insertBefore(card, main.firstChild.nextSibling || null);
  }

  const obs = new MutationObserver(() => mountButton());
  obs.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('DOMContentLoaded', mountButton);
  mountButton();

  window.TAPADA_CARREIRA = { open, close };
})();

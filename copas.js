/* ==========================================================================
   TAPADA — Carreira: competições continentais.
   Copa continental (Libertadores / Champions) rodando em paralelo à liga.
   Mata-mata de 4 rodadas (oitavas, quartas, semi, final).
   Expõe window.TAPADA_COPAS para o carreira.js usar.
   ========================================================================== */
(function () {
  'use strict';

  const CONTINENTE = code =>
    ['br', 'ar', 'cl', 'uy', 'co', 'ec', 'pe', 'py', 'bo', 've'].includes(code) ? 'lib' : 'ucl';

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { let a = seed >>> 0 || 1; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // Simula um jogo entre dois elencos (nota média pesada)
  function forca(squad) {
    if (!squad || !squad.length) return 60;
    const s = squad.slice().sort((a, b) => b.rating - a.rating).slice(0, 11);
    return s.reduce((a, b) => a + b.rating, 0) / s.length;
  }

  function jogar(eh, ea, seed) {
    const r = rnd(seed);
    const fh = forca(eh), fa = forca(ea);
    const lamH = Math.max(0.2, 1.28 * Math.pow(fh / fa, 3.0) * 1.12);
    const lamA = Math.max(0.2, 1.28 * Math.pow(fa / fh, 3.0) * 0.9);
    const pois = l => { let L = Math.exp(-l), k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
    return { gh: Math.min(6, pois(lamH)), ga: Math.min(6, pois(lamA)) };
  }

  // Cria a copa da temporada. `clubesComp` = clube da competição, `meuClube` = nome do clube do jogador
  function criar(opts) {
    const { comp, meuClube, meuCrest, season, elencoDe } = opts;
    if (!comp || !comp.clubs || comp.clubs.length < 8) return null;
    const r = rnd(hash((meuClube || '') + season + 'copa'));

    const rivais = comp.clubs.filter(c => c.name !== meuClube).slice();
    // embaralha
    for (let i = rivais.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rivais[i], rivais[j]] = [rivais[j], rivais[i]]; }
    const escolhidos = rivais.slice(0, 15);
    if (escolhidos.length < 15) return null;

    const eu = { name: meuClube, crest: meuCrest || '', isYou: true };
    const todos = [eu, ...escolhidos.map(c => ({ name: c.name, crest: c.crest, isYou: false }))];
    for (let i = todos.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [todos[i], todos[j]] = [todos[j], todos[i]]; }

    const oitavas = [];
    for (let i = 0; i < todos.length; i += 2) {
      oitavas.push({ home: todos[i].name, away: todos[i + 1].name, hc: todos[i].crest, ac: todos[i + 1].crest });
    }

    return {
      code: comp.code,
      title: comp.title,
      season,
      fase: 0, // 0 oitavas, 1 quartas, 2 semi, 3 final
      fases: ['Oitavas', 'Quartas', 'Semifinal', 'Final'],
      atletas: todos,
      jogos: { 0: oitavas.map(m => ({ ...m, status: 'pending' })) },
      eliminado: false,
      campeao: null,
      historico: []
    };
  }

  // Joga a fase atual inteira. `elencoDe(nomeClube)` devolve o elenco para a força.
  function jogarFase(copa, elencoDe) {
    if (!copa || copa.campeao || copa.eliminado) return;
    const fase = copa.fase;
    const jogos = copa.jogos[fase] || [];
    const vencedores = [];
    jogos.forEach((m, i) => {
      if (m.status === 'done') { vencedores.push(m.winner === 'home' ? m.home : m.away); return; }
      const seed = hash((copa.season || 1) + '|' + fase + '|' + i + '|' + m.home + m.away);
      let res = jogar(elencoDe(m.home), elencoDe(m.away), seed);
      // mata-mata: empate vai para pênaltis
      let pen = null;
      if (res.gh === res.ga) {
        const r = rnd(seed ^ 0x5eed);
        let ph = 0, pa = 0;
        for (let k = 0; k < 5; k++) { if (r() < 0.72) ph++; if (r() < 0.72) pa++; }
        while (ph === pa) { if (r() < 0.72) ph++; if (r() < 0.72) pa++; }
        pen = [ph, pa];
      }
      const venceuCasa = pen ? pen[0] > pen[1] : res.gh > res.ga;
      m.status = 'done';
      m.score = [res.gh, res.ga];
      m.pen = pen;
      m.winner = venceuCasa ? 'home' : 'away';
      vencedores.push(venceuCasa ? m.home : m.away);
    });

    // o jogador foi eliminado?
    const euJogou = jogos.find(m => m.home === copa.atletas.find(a => a.isYou).name || m.away === copa.atletas.find(a => a.isYou).name);
    if (euJogou && euJogou.status === 'done') {
      const euNome = copa.atletas.find(a => a.isYou).name;
      const venceu = (euJogou.winner === 'home' ? euJogou.home : euJogou.away) === euNome;
      if (!venceu) { copa.eliminado = true; }
    }

    if (vencedores.length === 1) {
      copa.campeao = vencedores[0];
      copa.fase = 4;
      return;
    }
    // monta a próxima fase
    const prox = [];
    for (let i = 0; i < vencedores.length; i += 2) {
      const a = vencedores[i], b = vencedores[i + 1];
      if (!b) { prox.push({ home: a, away: a, bye: true, status: 'done', winner: 'home', score: [0, 0] }); continue; }
      prox.push({ home: a, away: b, status: 'pending' });
    }
    copa.fase = fase + 1;
    copa.jogos[copa.fase] = prox;
  }

  function forcaDeElenco(elenco) { return forca(elenco); }

  window.TAPADA_COPAS = { criar, jogarFase, continente: CONTINENTE, forca: forcaDeElenco, hash };
})();

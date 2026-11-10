/* ==========================================================================
   TAPADA — Modo Carreira: finanças, mercado e negociação.
   Este módulo estende o carreira.js com:
     • receitas: TV, patrocínio, bilheteria, premiação
     • despesas: salários, manutenção do estádio, olheiros
     • mercado: janela de transferências entre clubes de qualquer país
     • negociação: contrapropostas, parcelamento, empréstimos
   Mantém tudo determinístico e salvo no localStorage.
   ========================================================================== */
(function () {
  'use strict';

  // ---------- economia por liga ----------
  // tv: milhões por temporada (escala do futebol real, simplificada)
  // salarioBase: média de salário mensal (mil) por setor de nota
  const ECONOMIA = {
    en: { tv: 180, patrocinio: 40, bilheteria: 3.2, salario: 1.0, patamar: 1.0 },
    es: { tv: 120, patrocinio: 32, bilheteria: 2.6, salario: 0.86, patamar: 0.96 },
    it: { tv: 105, patrocinio: 26, bilheteria: 2.1, salario: 0.78, patamar: 0.92 },
    de: { tv: 95, patrocinio: 24, bilheteria: 2.4, salario: 0.74, patamar: 0.93 },
    fr: { tv: 70, patrocinio: 18, bilheteria: 1.8, salario: 0.6, patamar: 0.88 },
    pt: { tv: 28, patrocinio: 9, bilheteria: 1.1, salario: 0.32, patamar: 0.8 },
    nl: { tv: 22, patrocinio: 7, bilheteria: 1.0, salario: 0.3, patamar: 0.78 },
    br: { tv: 42, patrocinio: 12, bilheteria: 1.3, salario: 0.3, patamar: 0.82 },
    ar: { tv: 16, patrocinio: 6, bilheteria: 0.9, salario: 0.2, patamar: 0.76 },
    cl: { tv: 9, patrocinio: 3, bilheteria: 0.7, salario: 0.16, patamar: 0.72 },
    uy: { tv: 6, patrocinio: 2.2, bilheteria: 0.6, salario: 0.13, patamar: 0.7 },
    co: { tv: 8, patrocinio: 2.8, bilheteria: 0.7, salario: 0.14, patamar: 0.71 },
    ec: { tv: 6, patrocinio: 2, bilheteria: 0.6, salario: 0.12, patamar: 0.69 },
    pe: { tv: 5, patrocinio: 1.8, bilheteria: 0.6, salario: 0.11, patamar: 0.68 },
    py: { tv: 4, patrocinio: 1.5, bilheteria: 0.5, salario: 0.1, patamar: 0.67 },
    bo: { tv: 3, patrocinio: 1.2, bilheteria: 0.5, salario: 0.09, patamar: 0.66 },
    ve: { tv: 3, patrocinio: 1.1, bilheteria: 0.4, salario: 0.08, patamar: 0.65 }
  };
  const ECO_PADRAO = { tv: 10, patrocinio: 3, bilheteria: 0.7, salario: 0.15, patamar: 0.72 };

  function economia(leagueCode) {
    return ECONOMIA[leagueCode] || ECO_PADRAO;
  }

  // salário mensal (em R$ mil) a partir da nota e do patamar da liga
  function salarioDe(player, leagueCode) {
    const eco = economia(leagueCode);
    const base = Math.pow(Math.max(1, player.rating - 52) / 10, 2.15);
    // nota 70 -> ~120 mil/mês ; 85 -> ~900 mil ; 91 -> ~1.8 mi (na liga de topo)
    return Math.max(25, Math.round(base * 95 * eco.salario));
  }

  // valor de mercado (R$ milhões) — escala realista:
  // nota 62 ~ 2 | 75 ~ 18 | 85 ~ 49 | 91 ~ 77 (na liga de topo; menos fora dela)
  function valorDe(player, leagueCode) {
    const eco = economia(leagueCode);
    const base = Math.pow((Math.max(55, player.rating) - 50) / 10, 2.9);
    const v = base * 0.7 * (0.5 + eco.patrocinio / 30);
    return Math.max(0.3, +v.toFixed(1));
  }

  // ---------- orçamento de uma temporada ----------
  function orcamento(st) {
    const eco = economia(st.league);
    const me = st.teams.find(t => t.isYou);
    const forca = me.squad.length ? me.squad.reduce((a, p) => a + p.rating, 0) / me.squad.length : 70;
    const pos = st.history.length ? st.history[st.history.length - 1].pos : 10;
    const nClubes = st.teams.length;
    // posição melhor -> mais TV e bilheteria
    const fatorPos = 1 + ((nClubes / 2 - pos) / nClubes) * 0.55;
    // reputação cresce com a força do elenco
    const fatorForca = 0.75 + (forca - 62) / 60;

    const receita = {
      tv: +(eco.tv * fatorPos * fatorForca * 0.42).toFixed(1),
      patrocinio: +(eco.patrocinio * fatorForca * (1 + st.temporadas * 0.06)).toFixed(1),
      bilheteria: +(eco.bilheteria * (nClubes * 0.55) * fatorForca).toFixed(1),
      socios: +(eco.patrocinio * 0.22 * fatorForca * (1 + st.temporadas * 0.1)).toFixed(1),
      premiacao: 0
    };

    const folha = me.squad.reduce((a, p) => a + salarioDe(p, st.league), 0) / 1000;
    const despesa = {
      salarios: +folha.toFixed(1),
      estrutura: +(eco.bilheteria * 1.4 + 1.2).toFixed(1),
      olheiros: +(eco.patrocinio * 0.07 + 0.6).toFixed(1)
    };

    const totalReceita = Object.values(receita).reduce((a, b) => a + b, 0);
    const totalDespesa = Object.values(despesa).reduce((a, b) => a + b, 0);
    return { receita, despesa, totalReceita: +totalReceita.toFixed(1), totalDespesa: +totalDespesa.toFixed(1), saldo: +(totalReceita - totalDespesa).toFixed(1), forca: Math.round(forca) };
  }

  // ---------- mercado: gera as ofertas disponíveis ----------
  // Junta jogadores de TODAS as ligas e marca de quais clubes podem sair.
  function poolDosMercados(todasLigas, st) {
    const out = [];
    const meuClube = st.club;
    for (const [code, L] of Object.entries(todasLigas)) {
      for (const p of L.players) {
        if (p.club === meuClube) continue; // já é seu
        out.push({ ...p, liga: code });
      }
    }
    return out;
  }

  // preço pedido pelo clube dono; varia com a liga e a nota
  function precoDe(player) {
    const v = valorDe(player, player.liga);
    // o clube pede de 110% a 170% do valor de mercado
    const seed = hash(player.id);
    const fator = 1.1 + ((seed % 60) / 100);
    return +(v * fator).toFixed(1);
  }

  function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function rnd(seed) { let a = seed >>> 0 || 1; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ofertas vindas dos outros clubes (para os SEUS jogadores)
  function ofertasPorMeusJogadores(st, nOfertas) {
    const me = st.teams.find(t => t.isYou);
    if (!me.squad.length) return [];
    const r = rnd(hash(st.club + st.season + 'ofertas'));
    const out = [];
    for (let i = 0; i < nOfertas; i++) {
      const p = me.squad[Math.floor(r() * me.squad.length)];
      if (!p) continue;
      const v = valorDe(p, st.league);
      const fator = 0.75 + r() * 0.7;
      out.push({
        id: 'of-' + i,
        tipo: 'venda',
        player: p,
        de: ['Real Madrid', 'Benfica', 'River Plate', 'Boca Juniors', 'Flamengo', 'Palmeiras', 'Ajax', 'Brighton', 'Cruzeiro', 'Sporting CP'][Math.floor(r() * 10)],
        valor: Math.max(0.3, +(v * fator).toFixed(1)),
        parcelado: r() > 0.65
      });
    }
    return out;
  }

  // ---------- negociação ----------
  // O jogador vende/comprar e o clube dono contrapropõe.
  function negociarCompra(player, oferta, tentativa) {
    const pedido = precoDe(player);
    const r = rnd(hash(player.id + '|' + tentativa));
    if (oferta >= pedido * 0.99) return { aceita: true, valor: pedido, msg: 'O clube aceitou o valor pedido.' };
    const ratio = oferta / pedido;
    if (ratio >= 0.9) {
      if (r() < 0.65) return { aceita: true, valor: oferta, msg: 'Aceitaram! Fechado por ' + oferta + ' mi.' };
      return { aceita: false, contra: Math.round(pedido * 0.95 * 10) / 10, msg: 'Quase. Pedem um pouco mais.' };
    }
    if (ratio >= 0.75) {
      if (r() < 0.25) return { aceita: true, valor: oferta, msg: 'Surpreenderam: aceitaram.' };
      return { aceita: false, contra: Math.round(pedido * (0.9 + r() * 0.08) * 10) / 10, msg: 'Oferta baixa. Contraproposta à vista.' };
    }
    return { aceita: false, contra: Math.round(pedido * 1.02 * 10) / 10, msg: 'Oferta muito abaixo. Querem perto de ' + Math.round(pedido) + ' mi.' };
  }

  window.TAPADA_FINANCAS = { economia, salarioDe, valorDe, orcamento, poolDosMercados, precoDe, ofertasPorMeusJogadores, negociarCompra, hash, rnd };
})();

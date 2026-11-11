/* ==========================================================================
   TAPADA — Fotos dos jogadores (remotas, validadas).
   Cada jogador tem uma URL do Wikimedia, já conferida como sendo dele.
   Aqui trocamos o <img> para essa URL. Jogador sem foto validada fica com o
   monograma. Não baixamos nada: a imagem vem direto da origem.
   ========================================================================== */
(function () {
  'use strict';

  var MAPA = null;     // id -> url
  var PRONTO = false;

  function carregar() {
    if (MAPA) return Promise.resolve(MAPA);
    return fetch('foto-urls.json', { cache: 'force-cache' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { MAPA = j || {}; PRONTO = true; return MAPA; })
      .catch(function () { MAPA = {}; PRONTO = true; return MAPA; });
  }

  // Monograma: iniciais do jogador em degradê azul (mesmo desenho do avatar-fallback).
  function desenharMonograma(img) {
    if (img.dataset.monograma) return;
    img.dataset.monograma = '1';
    var nome = img.alt || '';
    var partes = nome.replace(/['’]/g, '').trim().split(/\s+/).filter(Boolean);
    var letra = '';
    if (partes.length === 1) letra = partes[0].slice(0, 2).toUpperCase();
    else if (partes.length > 1) letra = (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();

    var TONS = [
      ['#dbeafe', '#93c5fd', '#1e3a8a'], ['#e0f2fe', '#7dd3fc', '#0c4a6e'],
      ['#dbeafe', '#a5b4fc', '#1e1b4b'], ['#e0e7ff', '#93c5fd', '#1e40af'],
      ['#ccfbf1', '#5eead4', '#134e4a'], ['#e0f2fe', '#60a5fa', '#1e3a8a']
    ];
    var h = 0;
    for (var k = 0; k < nome.length; k++) h = (h * 31 + nome.charCodeAt(k)) >>> 0;
    var tom = TONS[h % TONS.length];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">' +
      '<stop offset="0" stop-color="' + tom[0] + '"/><stop offset="1" stop-color="' + tom[1] + '"/></linearGradient></defs>' +
      '<rect width="200" height="200" fill="url(#g)"/>' +
      '<g fill="#1e3a8a" opacity="0.16"><circle cx="100" cy="74" r="32"/><ellipse cx="100" cy="172" rx="56" ry="46"/></g>' +
      (letra ? '<text x="100" y="128" text-anchor="middle" font-family="Archivo,Segoe UI,Arial,sans-serif" font-size="62" font-weight="800" fill="' + tom[2] + '" fill-opacity="0.88">' + letra + '</text>' : '') +
      '</svg>';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    img.style.objectFit = 'cover';
    img.style.background = 'transparent';
    img.classList.add('sem-foto');
  }

  function aplicarUm(img) {
    if (!PRONTO || !MAPA) return;
    if (img.dataset.remoteOk || img.dataset.semFoto) return;
    var id = img.getAttribute('data-pid');
    var url = id ? MAPA[id] : null;

    if (!url) {
      // Sem foto validada: não deixa o navegador pedir o arquivo local (que pode
      // não existir) e desenha o monograma na hora.
      img.dataset.semFoto = '1';
      desenharMonograma(img);
      return;
    }

    img.dataset.remoteOk = '1';
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'center bottom';
    img.style.background = 'linear-gradient(160deg,#eaf3ff,#c3dcf7)';
    img.addEventListener('error', function () {
      // se a remota falhar, cai no monograma
      delete this.dataset.remoteOk;
      this.dataset.semFoto = '1';
      this.style.background = 'transparent';
      desenharMonograma(this);
    }, { once: true });
    img.src = url;
  }

  function aplicar(raiz) {
    if (!PRONTO) return;
    var escopo = raiz || document;
    var imgs = escopo.querySelectorAll ? escopo.querySelectorAll('img.face[data-pid]') : [];
    for (var i = 0; i < imgs.length; i++) aplicarUm(imgs[i]);
  }

  // novos <img> que o jogo cria (lazy, troca de tela, leilão)
  var obs = new MutationObserver(function (muts) {
    if (!PRONTO) return;
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var k = 0; k < added.length; k++) {
        var n = added[k];
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') { if (n.dataset.pid) aplicarUm(n); }
        else if (n.querySelectorAll) aplicar(n);
      }
    }
  });

  // O atributo src do <img> é escrito pelo React; vigiamos mudanças de atributo
  // para trocar pela URL remota antes de o 404 do arquivo local acontecer.
  var obsAttr = new MutationObserver(function (muts) {
    if (!PRONTO) return;
    for (var i = 0; i < muts.length; i++) {
      var t = muts[i].target;
      if (t && t.tagName === 'IMG' && t.dataset.pid && !t.dataset.remoteOk) aplicarUm(t);
    }
  });

  carregar().then(function () {
    obs.observe(document.documentElement, { childList: true, subtree: true });
    obsAttr.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['src'] });
    aplicar(document);
    // e algumas vezes, para pegar telas que montam depois
    var n = 0;
    var timer = setInterval(function () { aplicar(document); if (++n > 40) clearInterval(timer); }, 250);
  });

  window.TAPADA_FOTOS = { carregar: carregar, aplicar: aplicar, mapa: function () { return MAPA; } };
})();

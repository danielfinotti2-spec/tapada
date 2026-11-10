/* ==========================================================================
   TAPADA — Fotos remotas de jogadores.
   Em vez de baixar milhares de imagens, cada jogador aponta direto para a URL
   original (Wikimedia). O mapa vem de foto-urls.json, gerado uma vez.
   Se o jogador não tem foto ou a imagem falha, cai no monograma.
   ========================================================================== */
(function () {
  'use strict';

  var MAPA = null;      // id -> url
  var PRONTO = false;

  function carregar() {
    if (MAPA) return Promise.resolve(MAPA);
    return fetch('foto-urls.json')
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { MAPA = j || {}; PRONTO = true; return MAPA; })
      .catch(function () { MAPA = {}; PRONTO = true; return MAPA; });
  }

  // Aplica o mapa nos <img class="face"> já existentes, usando o data-pid.
  function aplicar(raiz) {
    if (!PRONTO) return;
    var escopo = raiz || document;
    var imgs = escopo.querySelectorAll ? escopo.querySelectorAll('img.face[data-pid]') : [];
    for (var i = 0; i < imgs.length; i++) aplicarOne(imgs[i]);
  }



  // Observa novos <img> (lazy render / troca de tela)
  var obs = new MutationObserver(function (muts) {
    if (!PRONTO) return;
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var k = 0; k < added.length; k++) {
        var n = added[k];
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG' && n.classList.contains('face') && n.dataset.pid) { aplicarOne(n); }
        else if (n.querySelectorAll) { aplicar(n); }
      }
    }
  });

  function aplicarOne(img) {
    if (img.dataset.remoteOk) return;
    var id = img.getAttribute('data-pid');
    var url = id && MAPA ? MAPA[id] : null;
    if (!url) return;
    img.dataset.remoteOk = '1';
    img.style.objectFit = 'contain';
    img.style.objectPosition = 'center bottom';
    img.style.background = 'linear-gradient(160deg,#eaf3ff,#c3dcf7)';
    // se a imagem remota falhar, o avatar-fallback assume
    img.addEventListener('error', function () {
      delete this.dataset.remoteOk;
      this.dataset.pid = '';
    }, { once: true });
    img.src = url;
  }

  carregar().then(function () {
    obs.observe(document.documentElement, { childList: true, subtree: true });
    aplicar(document);
    credito();
  });

  // Crédito exigido pela licença CC BY das fotos do Wikimedia.
  function credito() {
    if (document.querySelector('.foto-credito')) return;
    var rodape = document.querySelector('.foot') || document.querySelector('.car-foot');
    var p = document.createElement('p');
    p.className = 'foto-credito';
    p.innerHTML = 'Fotos de jogadores: <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> — créditos e licenças na página de cada arquivo (CC BY).';
    if (rodape && rodape.parentNode) rodape.parentNode.insertBefore(p, rodape.nextSibling);
    else document.body.appendChild(p);
  }

  window.TAPADA_FOTOS = { carregar: carregar, aplicar: aplicar, mapa: function () { return MAPA; } };
})();

/* ==========================================================================
   TAPADA — avatar de segurança.
   Se a foto de um jogador não carregar, o <img> vira um monograma azul limpo
   (iniciais do nome na alt) em vez do ícone de imagem quebrada.
   ========================================================================== */
(function () {
  'use strict';

  function iniciais(texto) {
    var partes = (texto || '').replace(/['’]/g, '').trim().split(/\s+/).filter(Boolean);
    if (!partes.length) return '';
    if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
    return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
  }

  function aplicar(img) {
    if (img.dataset.avatarFallback) return true;
    img.dataset.avatarFallback = '1';

    var nome = img.alt || img.getAttribute('alt') || '';
    var letra = iniciais(nome);
    // Cor estável pelo nome: cada jogador tem seu tom, o elenco não fica monocromático.
    var TONS = [
      ['#dbeafe', '#93c5fd', '#1e3a8a'], ['#e0f2fe', '#7dd3fc', '#0c4a6e'],
      ['#dbeafe', '#a5b4fc', '#1e1b4b'], ['#e0e7ff', '#93c5fd', '#1e40af'],
      ['#ccfbf1', '#5eead4', '#134e4a'], ['#e0f2fe', '#60a5fa', '#1e3a8a']
    ];
    var h = 0;
    for (var k = 0; k < nome.length; k++) h = (h * 31 + nome.charCodeAt(k)) >>> 0;
    var tom = TONS[h % TONS.length];

    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0.35" y2="1">' +
          '<stop offset="0" stop-color="' + tom[0] + '"/><stop offset="1" stop-color="' + tom[1] + '"/>' +
        '</linearGradient></defs>' +
        '<rect width="200" height="200" fill="url(#g)"/>' +
        '<g fill="#1e3a8a" opacity="0.16">' +
          '<circle cx="100" cy="74" r="32"/>' +
          '<ellipse cx="100" cy="172" rx="56" ry="46"/>' +
        '</g>' +
        (letra
          ? '<text x="100" y="128" text-anchor="middle" ' +
            'font-family="Archivo,Segoe UI,Arial,sans-serif" font-size="62" font-weight="800" ' +
            'fill="' + tom[2] + '" fill-opacity="0.88">' + letra + '</text>'
          : '') +
      '</svg>';

    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    img.classList.add('sem-foto');
    return true;
  }

  function tratar(img) {
    if (img.complete && img.naturalWidth === 0 && !img.dataset.avatarFallback) aplicar(img);
  }

  function varrer(raiz) {
    var lista = raiz.querySelectorAll ? raiz.querySelectorAll('img.face, .lot-photo img, .sr-face img') : [];
    for (var i = 0; i < lista.length; i++) {
      var img = lista[i];
      if (!img.dataset.avatarWatch) {
        img.dataset.avatarWatch = '1';
        img.addEventListener('error', function () { aplicar(this); }, { once: true });
        // imagem já quebrada antes do listener entrar
        if (img.complete) tratar(img);
      }
    }
  }

  varrer(document);

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var added = muts[i].addedNodes;
      for (var k = 0; k < added.length; k++) {
        var n = added[k];
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') { if (n.matches('.face, .lot-photo img, .sr-face img')) { /* entra no próximo passo */ } }
        varrer(n.parentNode && n.parentNode.nodeType === 1 ? n.parentNode : n);
        if (n.nodeType === 1) varrer(n);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });

  // carregamento tardio (lazy / troca de imagem no mesmo <img>)
  document.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t.tagName === 'IMG' && t.matches('.face, .lot-photo img, .sr-face img')) aplicar(t);
  }, true);
})();

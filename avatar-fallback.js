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

    var letra = iniciais(img.alt || img.getAttribute('alt') || '');
    // Avatar limpo: fundo em degradê azul, silhueta discreta atrás e as iniciais
    // bem legíveis no centro (antes o texto ficava por cima do corpo e colava).
    var svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="0.3" y2="1">' +
          '<stop offset="0" stop-color="#eaf3ff"/><stop offset="1" stop-color="#b9d5f4"/>' +
        '</linearGradient></defs>' +
        '<rect width="200" height="200" fill="url(#g)"/>' +
        '<g fill="#7aa8dc" opacity="0.34">' +
          '<circle cx="100" cy="70" r="30"/>' +
          '<ellipse cx="100" cy="168" rx="52" ry="44"/>' +
        '</g>' +
        (letra
          ? '<text x="100" y="132" text-anchor="middle" ' +
            'font-family="Archivo,Segoe UI,Arial,sans-serif" font-size="64" font-weight="800" ' +
            'fill="#1b4f8f" fill-opacity="0.9">' + letra + '</text>'
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

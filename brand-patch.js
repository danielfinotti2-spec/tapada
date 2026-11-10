/* ==========================================================================
   TAPADA — patch de marca.
   Roda depois que o React hidrata: troca o logo "nota de 100 + pracada" pela
   foto (img/tapada.jpg) e renomeia o jogo para TAPADA em todo o DOM.
   ========================================================================== */
(function () {
  'use strict';

  var PHOTO = './img/tapada.jpg';
  var LOGO_PHOTO = './img/tapada-logo.png'; // mesma foto, fundo removido
  var NAME = 'TAPADA';

  function nomearLogo(logo) {
    if (!logo || logo.dataset.tapada) return;
    var img = logo.querySelector('img');
    if (!img) return;

    // A foto vira uma plaquinha larga no canto do header, já com o fundo removido.
    img.src = LOGO_PHOTO;
    img.alt = NAME;
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.style.width = 'auto';
    img.style.height = '34px';
    img.style.maxWidth = '74px';
    img.style.objectFit = 'contain';
    img.style.padding = '3px 5px';
    img.style.borderRadius = '9px';
    img.style.background = 'linear-gradient(160deg,#eef6ff,#cfe4f9)';
    img.style.boxShadow = '0 0 0 1px #0a2c6324, 0 3px 8px #0b2d5e1f';

    var spans = logo.querySelectorAll('span');
    if (spans.length) {
      var last = spans[spans.length - 1];
      last.textContent = NAME;
      last.style.letterSpacing = '.02em';
      last.style.fontWeight = '900';
      last.style.fontStretch = '82%';
    }
    logo.setAttribute('aria-label', NAME);
    logo.dataset.tapada = '1';
  }

  function texto(node) {
    if (!node.nodeValue || node.nodeValue.indexOf('pracada') === -1) return;
    node.nodeValue = node.nodeValue.replace(/100\s*pracada/g, NAME).replace(/pracada/g, NAME);
  }

  function percorrer(root) {
    var logos = root.querySelectorAll ? root.querySelectorAll('.logo') : [];
    for (var i = 0; i < logos.length; i++) nomearLogo(logos[i]);

    if (root.nodeType === 3) { texto(root); return; }

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        // não mexe em <script>, <style> nem no que já foi tratado
        var p = n.parentNode;
        if (!p || /^(SCRIPT|STYLE|TEXTAREA)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        return n.nodeValue.indexOf('pracada') !== -1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var n, lista = [];
    while ((n = walker.nextNode())) lista.push(n);
    for (var j = 0; j < lista.length; j++) texto(lista[j]);
  }

  // A nota do herói agora vem pronta do bundle (nota-sem-fundo.png, já recortada):
  // aqui só garantimos o enquadramento, sem trocar a imagem.
  function fotoNoHero() {
    var hero = document.querySelector('.hero-nota');
    if (!hero || hero.dataset.tapada) return;
    var img = hero.querySelector('img');
    if (!img) return;
    img.alt = NAME;
    img.removeAttribute('width');
    img.removeAttribute('height');
    img.style.width = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    hero.dataset.tapada = '1';
  }

  function run(root) {
    percorrer(root);
    fotoNoHero();
    var barra = document.querySelector('.site-bar');
    if (barra) {
      barra.textContent = 'TAPADA';
      barra.title = 'TAPADA';
    }
  }

  run(document.body);

  new MutationObserver(function (muts) {
    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];
      if (m.type === 'characterData') { texto(m.target); continue; }
      for (var k = 0; k < m.addedNodes.length; k++) {
        var no = m.addedNodes[k];
        if (no.nodeType === 1 || no.nodeType === 3) percorrer(no);
      }
    }
    fotoNoHero();
    var barra = document.querySelector('.site-bar');
    if (barra && barra.textContent !== NAME) { barra.textContent = NAME; barra.title = NAME; }
  }).observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
})();

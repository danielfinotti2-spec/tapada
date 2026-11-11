/* ==========================================================================
   TAPADA — Banco de reservas na interface.
   O jogo só desenha o time titular no campo. Os jogadores comprados além do
   time (índices >= tamanho da formação) ficam no banco: este script mostra
   uma faixa "Banco" com eles, dentro da tela do leilão e da escalação.
   ========================================================================== */
(function () {
  'use strict';

  var ULTIMO_ESTADO = null;

var fetchOriginal = window.fetch;
  window.fetch = function (url, opts) {
    var p = fetchOriginal.apply(this, arguments);
    try {
      var u = typeof url === 'string' ? url : (url && url.url) || '';
      if (/\/api\/(s|h)\?/.test(u) || /\/api\/room$/.test(u)) {
        p.then(function (r) {
          if (!r || !r.ok) return;
          r.clone().json().then(function (j) {
            var estado = j && (j.view || (j.managers ? j : null));
            if (estado && Array.isArray(estado.managers)) {
              ULTIMO_ESTADO = estado;
              setTimeout(render, 60);
            }
          }).catch(function () {});
        }).catch(function () {});
      }
    } catch (e) {}
    return p;
  };

  function slugs(liga) { return liga || 'br'; }

  function jogador(mode, id) {
    var L = (window.TAPADA_EXTRA_LEAGUES || {})[mode];
    if (!L) return null;
    for (var i = 0; i < L.players.length; i++) if (L.players[i].id === id) return L.players[i];
    return null;
  }

  // descobre quantas vagas são titulares (tamanho da formação)
  function nTitulares(mode, size) {
    // o campo desenha N slots; o banco começa depois disso
    var porTamanho = { 5: 5, 7: 7, 11: 11 };
    return porTamanho[size] || 5;
  }

  function render() {
    var antigo = document.querySelector('.banco-panel');
    if (antigo) antigo.remove();
    if (!ULTIMO_ESTADO) return;
    var st = ULTIMO_ESTADO;
    var eu = (st.managers || []).find(function (m) { return m.seat === st.you; });
    if (!eu || !Array.isArray(eu.squad)) return;

    var tit = nTitulares(st.mode, st.size);
    var banco = eu.squad.slice(tit).filter(Boolean);
    var vt = eu.squad.slice(tit).length;
    if (!vt) return;

    // procura o campo do SEU time (a tela do leilão e a de escalação mudam a estrutura)
    var pitch = document.querySelector('.col-me .pitch') || document.querySelector('.pitch');
    if (!pitch) return;

    var box = document.createElement('div');
    box.className = 'banco-panel';
    var h = document.createElement('h4');
    h.innerHTML = 'Banco <small>' + banco.length + '/' + vt + ' reservas</small>';
    box.appendChild(h);

    var linha = document.createElement('div');
    linha.className = 'banco-linha';
    if (!banco.length) {
      var vazio = document.createElement('span');
      vazio.className = 'banco-vazio';
      vazio.textContent = 'Sem reservas ainda — compre mais jogadores se sobrar dinheiro.';
      linha.appendChild(vazio);
    }
    banco.forEach(function (id) {
      var p = jogador(st.mode, id);
      if (!p) return;
      var c = document.createElement('span');
      c.className = 'banco-card';
      c.title = p.name + ' · ' + p.pos + ' · nota ' + p.rating;
      var img = document.createElement('img');
      img.className = 'face';
      img.alt = p.short || p.name;
      img.src = (p.img || '').replace(/^\//, './');
      img.onerror = function () { this.classList.add('pendente'); };
      var b = document.createElement('b');
      b.textContent = p.short || p.name;
      var s = document.createElement('small');
      s.textContent = p.rating;
      c.appendChild(img); c.appendChild(b); c.appendChild(s);
      linha.appendChild(c);
    });
    box.appendChild(linha);
    // insere logo depois do campo (ou do container do campo)
    var after = pitch.parentElement || pitch;
    after.parentNode.insertBefore(box, after.nextSibling);
  }

  // intercepta o estado da sala que o app busca (a API responde JSON)
  

  // re-renderiza quando a tela muda (e de tempos em tempos, para não perder o painel
  // nas transições de fase do leilão)
  new MutationObserver(function () { setTimeout(render, 80); })
    .observe(document.documentElement, { childList: true, subtree: true });
  setInterval(render, 900);
  document.addEventListener('DOMContentLoaded', render);

  // O app expõe a visão atual da sala em window.__TAPADA_VISAO a cada atualização.
  // É a fonte mais confiável: não depende de interceptar fetch nem de achar o código.
  setInterval(function () {
    var v = window.__TAPADA_VISAO;
    if (v && Array.isArray(v.managers)) {
      if (v !== ULTIMO_ESTADO) { ULTIMO_ESTADO = v; render(); }
    }
  }, 500);
})();

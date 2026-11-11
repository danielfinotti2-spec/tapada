/* ==========================================================================
   TAPADA — Aviso de "modo só leitura".
   Na Vercel (site estático) o servidor do leilão não existe: qualquer tentativa
   de criar/entrar em sala falha com erro genérico. Aqui detectamos isso logo de
   cara e avisamos como jogar de verdade, em vez de deixar a pessoa tentando.
   ========================================================================== */
(function () {
  'use strict';

  function aviso(msg) {
    if (document.getElementById('tapada-aviso-servidor')) return;
    var box = document.createElement('div');
    box.id = 'tapada-aviso-servidor';
    box.innerHTML = msg;
    document.body.appendChild(box);
  }

  // verifica se a API do leilão existe neste endereço
  fetch('api/ligas', { method: 'GET' })
    .then(function (r) {
      var ok = r.ok && (r.headers.get('content-type') || '').indexOf('json') >= 0;
      if (!ok) throw new Error('sem servidor');
      return r.json();
    })
    .then(function (d) {
      if (!d || !d.ligas) throw new Error('sem servidor');
      // servidor ok: nada a avisar
      document.documentElement.dataset.servidor = 'on';
    })
    .catch(function () {
      document.documentElement.dataset.servidor = 'off';
      aviso(
        '<b>Este endereço é só o site — o leilão online não roda aqui.</b>' +
        '<span>Para jogar com a galera: no computador de quem cria a sala, rode ' +
        '<code>JOGAR-ONLINE.bat</code>. Ele mostra um link público ' +
        '(<code>https://....trycloudflare.com</code>). Abra <u>esse</u> link e crie a sala por lá.</span>'
      );
    });
})();

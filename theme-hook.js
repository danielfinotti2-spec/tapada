/* ==========================================================================
   TAPADA — hook de tema.
   Roda DEPOIS do CSS original: reescreve as regras de token que o CSS base
   define depois de nós (a ordem importa), garantindo o azul em todos os estados:
   claro/escuro x Futebol Brasileiro/Kings League.
   ========================================================================== */
(function () {
  'use strict';

  var LIGHT = {
    br: {
      '--bg': '#f4f8fe', '--surface': '#ffffff', '--dark': '#0a2c63',
      '--rival-ink': '#2b6fbf', '--pri': '#1565d8', '--pri-ink': '#ffffff',
      '--field-own': '#1a6fd4', '--deep': '#0d3d80', '--acc': '#8fd3f7',
      '--acc-ink': '#06284f', '--rival': '#0a3f9e', '--ink': '#0d2542',
      '--muted': '#5b7594', '--line': '#d5e3f6', '--pale': '#eef4fd',
      '--tint': '#dfeeff', '--ok': '#a8e6ff'
    },
    kl: {
      '--bg': '#f0f6fd', '--surface': '#ffffff', '--dark': '#071d3f',
      '--rival-ink': '#1d5daa', '--pri': '#0b2a5c', '--pri-ink': '#ffffff',
      '--field-own': '#0b2a5c', '--deep': '#0b2a5c', '--acc': '#7cc6f2',
      '--acc-ink': '#061c3c', '--rival': '#2265b5', '--ink': '#0c2244',
      '--muted': '#64789a', '--line': '#d7e4f4', '--pale': '#eff5fc',
      '--tint': '#e0ecfa', '--ok': '#7dffc8'
    }
  };

  var DARK = {
    br: {
      '--bg': '#06121f', '--surface': '#0d2137', '--ink': '#e7f1fb',
      '--muted': '#8ba7c4', '--line': '#1d3a58', '--pale': '#102740',
      '--tint': '#163352', '--deep': '#d6e9ff', '--pri': '#3f9bf3',
      '--pri-ink': '#04182d', '--rival-ink': '#8fbdf5',
      '--field-own': '#1565c0', '--dark': '#06121f', '--acc': '#8fd3f7',
      '--acc-ink': '#04182d'
    },
    kl: {
      '--bg': '#05101c', '--surface': '#0c1f34', '--ink': '#eaf3fc',
      '--muted': '#8aa5c0', '--line': '#1c3551', '--pale': '#0f2439',
      '--tint': '#16314c', '--deep': '#d6e9ff', '--pri': '#58a9f0',
      '--pri-ink': '#04182d', '--acc': '#cfe6fb', '--acc-ink': '#04182d',
      '--field-own': '#14304e', '--rival-ink': '#8fbdf5'
    }
  };

  var PAPER = { '--paper': '#b8dcf7', '--paper-ink': '#06284f' };

  function tokens() {
    var root = document.documentElement;
    var dark = root.getAttribute('data-theme') === 'dark';
    var mode = root.getAttribute('data-mode') === 'kl' ? 'kl' : 'br';
    return (dark ? DARK : LIGHT)[mode];
  }

  function paint() {
    var root = document.documentElement;
    var set = tokens();
    for (var k in set) if (Object.prototype.hasOwnProperty.call(set, k)) root.style.setProperty(k, set[k]);
    for (var p in PAPER) if (Object.prototype.hasOwnProperty.call(PAPER, p)) root.style.setProperty(p, PAPER[p]);
    root.style.setProperty('color-scheme', root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }

  paint();

  // O app troca data-theme e data-mode em tempo de execução (botão sol/lua, modo KL).
  new MutationObserver(paint).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-mode']
  });
})();

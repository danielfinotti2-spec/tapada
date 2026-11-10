#!/usr/bin/env node
// Servidor local do TAPADA. Escolhe sozinho uma porta livre (pulando a 5173, que
// costuma estar ocupada por outro projeto) e abre o navegador no endereço certo.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const root = __dirname;
const FIRST_PORT = +process.env.PORT || 8080;

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json'
};

const server = http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400); return res.end('400'); }
  if (p === '/') p = '/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end('403'); }
  fs.readFile(f, (e, buf) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, {
      'content-type': sniffType(f, buf),
      'cache-control': 'no-cache'
    });
    res.end(buf);
  });
});

// Algumas fotos novas foram salvas em PNG mas usam a extensão .webp que o jogo
// já referencia. Detecta pelo conteúdo (magic bytes) em vez de confiar na extensão.
function sniffType(file, buf) {
  if (buf.length > 12) {
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
    if (buf.slice(0, 4).toString('ascii') === 'RIFF' && buf.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  }
  return types[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

function openBrowser(url) {
  if (process.env.TAPADA_NO_BROWSER === '1') return;
  const cmd = process.platform === 'win32' ? `start "" "${url}"`
    : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

// Tenta portas em sequência até achar uma livre.
let port = FIRST_PORT;
server.on('error', err => {
  if (err.code === 'EADDRINUSE' && port < FIRST_PORT + 25) {
    port++;
    setTimeout(() => server.listen(port, '127.0.0.1'), 60);
    return;
  }
  console.error('\nNao consegui subir o servidor:', err.message);
  process.exit(1);
});

server.on('listening', () => {
  const url = `http://127.0.0.1:${port}/`;
  console.log('');
  console.log('  TAPADA rodando em:  ' + url);
  console.log('  Deixe esta janela aberta enquanto joga.');
  console.log('  Para parar, feche a janela ou aperte Ctrl+C.');
  console.log('');
  openBrowser(url);
});

server.listen(port, '127.0.0.1');

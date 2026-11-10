# TAPADA

Leilão de futebol online para jogar com a galera: cada técnico recebe **R$ 100** e os jogadores vão a leilão um por um, ao vivo. Fechou o elenco, começa o campeonato.

Inclui **9 ligas** (2.864 jogadores) e um **Modo Carreira** offline.

## Ligas

| Liga | Clubes | Jogadores |
|---|---|---|
| Futebol Brasileiro (Série A) | 20 | 249 |
| Kings League Brasil | 10 | 168 |
| Portugal (Primeira Liga) | 16 | 383 |
| Inglaterra (Premier League) | 19 | 452 |
| Espanha (LaLiga) | 17 | 408 |
| Itália (Serie A) | 19 | 456 |
| Alemanha (Bundesliga) | 16 | 384 |
| França (Ligue 1) | 18 | 430 |
| Holanda (Eredivisie) | 15 | 351 |

## Rodar localmente

Precisa de Node.js (ou Python) — o jogo usa módulos ES e não abre por `file://`.

```bash
node server.js
```

Ou no Windows: dê duplo clique em `ABRIR-TAPADA.bat`.

O servidor acha sozinho uma porta livre a partir da 8080 e abre o navegador.

## Modo Carreira

Offline e salvo no navegador (`localStorage`):

1. escolha a liga, o clube e o seu nome de técnico;
2. monte o time num leilão com R$ 100 e 6 vagas;
3. dispute o campeonato (ida e volta, com classificação e artilharia);
4. receba o prêmio e vá para a temporada seguinte.

## Publicar na Vercel

O site é estático. A pasta inteira é o output — não há build.

```bash
npm i -g vercel
vercel --prod
```

O `vercel.json` já define cabeçalhos, cache e limpeza de rotas.

## Estrutura

```
index.html            página e ilhas do app
_astro/               bundle do jogo (React + CSS)
img/                  fotos de jogadores, escudos e bandeiras por liga
extra-leagues.js      elencos das 7 ligas extras
carreira.js/.css      modo carreira
brand.css / brand-patch.js / theme-hook.js   tema azul e marca TAPADA
avatar-fallback.js    monograma quando um jogador não tem foto
server.js             servidor estático local
```

## Sobre os dados

Nomes de jogadores, clubes e elencos vêm de fontes públicas (Wikipedia). As **notas e atributos** das ligas extras foram calculados com um modelo próprio, porque a origem não publica esses números — são aproximações, não dados oficiais. Fotos vêm de fontes públicas e várias estão indisponíveis; nesses casos o site mostra um monograma.

Projeto pessoal, sem fins comerciais, não afiliado a clubes, ligas ou federações.

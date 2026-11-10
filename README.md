# TAPADA

Leilão de futebol online para jogar com a galera: cada técnico recebe **R$ 100** e os jogadores vão a leilão um por um, ao vivo. Fechou o elenco, começa o campeonato.

**No ar:** https://tapada-murex.vercel.app

Dois modos:

- **Online (leilão):** salas de 2 a 16 técnicos. Monte o melhor time com R$ 100 e dispute o campeonato.
- **Carreira (offline):** um clube, várias temporadas, com finanças, mercado de transferências e negociação.

## Competições

**Ligas**

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
| Argentina (Liga Profesional) | 13 | 338 |

**Copas continentais** (também jogáveis no leilão): **Libertadores**, **Champions League** e **Mundial de Clubes**.

## Modo Carreira

Offline e salvo no navegador (`localStorage`):

1. escolha a liga, o clube e o nome de técnico;
2. monte o time no leilão (R$ 100, 6 vagas);
3. dispute o campeonato e a copa continental do seu continente;
4. feche as contas da temporada e vá para a próxima.

### Finanças

Cada temporada tem receitas e despesas reais:

| Receitas | Despesas |
|---|---|
| Direitos de televisão | Salários do elenco |
| Patrocínio master | Estrutura e estádio |
| Bilheteria | Departamento de olheiros |
| Sócios-torcedores | |
| Premiação | |

O saldo entra no caixa do clube. Ligas mais ricas pagam mais TV e cobram mais caro por jogador — o mesmo atleta vale muito mais na Inglaterra que na Argentina.

### Mercado de transferências

Janela aberta a qualquer momento da temporada:

- **Jogadores de todos os países** do jogo, com preço pedido calculado pelo valor de mercado;
- **Negociação de verdade:** você faz a oferta, o clube dono pode aceitar ou **contrapropor**; ofertas baixas são recusadas;
- **Propostas recebidas** pelos seus jogadores — dá para vender e reforçar o caixa;
- tudo é registrado no histórico de transferências.

## Rodar localmente

Precisa de Node.js (ou Python) — o jogo usa módulos ES e não abre por `file://`.

```bash
node server.js
```

Ou no Windows: duplo clique em `ABRIR-TAPADA.bat`. O servidor acha sozinho uma porta livre a partir da 8080.

## Publicar na Vercel

O site é estático — não há build. Está publicado em https://tapada-murex.vercel.app
e o projeto está ligado a este repositório: **todo push na `master` gera deploy automático**.

Para publicar do zero:

```bash
npm i -g vercel
vercel --prod
```

> O leilão online precisa de servidor. Na versão publicada ele não está disponível:
> o que funciona na Vercel é o **Modo Carreira**, que roda inteiro no navegador.

## Estrutura

```
index.html            página e ilhas do app
_astro/               bundle do jogo (React + CSS)
img/                  fotos de jogadores e escudos por competição
extra-leagues.js      elencos de todas as ligas e copas
carreira.js/.css      modo carreira
financas.js/.css      TV, bilheteria, salários e mercado
copas.js              Libertadores / Champions na carreira
brand.css / brand-patch.js / theme-hook.js   tema azul e marca TAPADA
avatar-fallback.js    monograma quando um jogador não tem foto
server.js             servidor estático local
```

## Sobre os dados

Nomes de jogadores, clubes e elencos vêm de fontes públicas (Wikipedia). As **notas e atributos** foram calculados com um modelo próprio, porque essas fontes não publicam os números — são aproximações, não dados oficiais. Valores de mercado e receitas são estimativas inspiradas no futebol real, não números oficiais de clubes.

Projeto pessoal, sem fins comerciais, não afiliado a clubes, ligas ou federações.

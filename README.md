# TAPADA

Leilão de futebol online para jogar com a galera: cada técnico recebe **R$ 100** e os jogadores vão a leilão um por um, ao vivo. Fechou o elenco, começa o campeonato.

**Site:** https://tapada-murex.vercel.app
**Código:** https://github.com/danielfinotti2-spec/tapada

## Competições (13)

**Ligas:** Futebol Brasileiro, Kings League, Portugal, Inglaterra, Espanha, Itália, Alemanha, França, Holanda e Argentina.

**Copas continentais:** Libertadores, Champions League e Mundial de Clubes.

Todas funcionam no leilão online.

## Jogar online com qualquer pessoa (de qualquer lugar)

Duplo clique em **`JOGAR-ONLINE.bat`** (ou rode `node server.js`).

O jogo vai abrir e, em alguns segundos, mostrar:

```
  ======================================================
   LINK PARA JOGAR COM QUALQUER PESSOA (mande no grupo):
   https://alguma-coisa-aqui.trycloudflare.com
  ======================================================
```

**Mande esse link no grupo.** Quem clicar entra direto na sua sala — de qualquer
cidade, celular ou computador, sem instalar nada e sem abrir porta no roteador.

O link muda toda vez que você abre o jogo, então mande o novo a cada sessão.
Ele funciona enquanto a janela do jogo estiver aberta.

> Precisa do túnel: `winget install Cloudflare.cloudflared` (uma vez só).
> Já instalado nesta máquina.
## Como funciona a sala

1. Escolha a competição e crie a sala (2 a 16 técnicos, dá para completar com bots).
2. Todos entram, escolhem a formação e tocam em **Estou pronto**.
3. O dono toca em **Começar leilão**.
4. Cada jogador fica 10 segundos em leilão. Lance com `1`, `2`, `3` ou `T` (tudo).
5. Quem leva escolhe em que vaga do time ele joga.
6. Fechado o elenco, o campeonato é simulado.

## Publicar na Vercel

O site é estático e vai para a Vercel normalmente (`vercel --prod`, ou push na `master`).
**O leilão online não roda na Vercel**, porque ela não mantém um servidor Node ligado —
na versão publicada você consegue navegar, ver elencos e as fotos, mas as salas
precisam do `server.js` rodando numa máquina sua.

## Estrutura

```
index.html              página e ilhas do app
_astro/                 bundle do jogo (React + CSS)
server.js               servidor: site + API do leilão
servidor-leilao.js      regras do leilão (salas, lances, campeonato)
extra-leagues.js        elencos das 11 competições
fotos-remotas.js        fotos dos jogadores direto do Wikimedia
avatar-fallback.js      monograma quando não há foto
brand.css/brand-patch   tema azul e marca TAPADA
img/                    fotos, escudos e bandeiras
```

## Sobre os dados

Nomes, clubes e elencos vêm de fontes públicas (Wikipedia). **Notas e atributos
foram calculados** com um modelo próprio — são aproximações, não dados oficiais.
As fotos vêm do Wikimedia (CC BY, com crédito no rodapé); quem não tem foto
aparece com monograma.

Projeto pessoal, sem fins comerciais, não afiliado a clubes, ligas ou federações.

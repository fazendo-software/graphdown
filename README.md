# grapydown

Editor de grafos de processo, multiusuário, em tempo real. Cada projeto vive no Postgres;
o canvas desenha com traço à mão, e clicar num nó abre os dados estruturados.

## Requisitos

Node 22.13 ou maior (roda TypeScript direto, sem build — `--experimental-strip-types`) e
Postgres 16.

## Uso com Docker (recomendado)

```bash
cp .env.exemplo .env   # preencha COOKIE_SECRET
docker compose up --build
```

Abre em `http://localhost:5174` (ou o valor de `PORTA` no `.env`). Migrações e seed de
categoria rodam automaticamente antes do servidor escutar.

## Uso sem Docker

```bash
npm install
npm run build:web
export DATABASE_URL=postgres://usuario:senha@localhost:5432/grapydown
export COOKIE_SECRET=$(node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
npm run serve
```

Desenvolvimento, com recarga do front:

```bash
npm run serve      # terminal 1 — API + WebSocket em :5174
npm run dev:web     # terminal 2, abre em :5173 com proxy para :5174
```

## Modelo

Conta (e-mail + senha) entra num projeto como `dono`, `editor` ou `leitor`. Projeto tem uma
categoria (`GET /api/categorias`), que define os campos do formulário e a cor/forma do nó —
`categorias/processo.yaml` é semeado automaticamente na primeira subida.

Nó e aresta vivem em tabelas Postgres (`nos`, `arestas`), não mais em arquivo `.md`. Apagar é
soft delete (`apagado_em`) — sem lixeira, sem restauração pela UI. Posição do nó (`pos_x`,
`pos_y`) e presença de colaboração (quem está no canvas, quem está editando) viajam por
WebSocket (`GET /ws?projeto=<id>`); mutação de estrutura (nó, aresta, campo) é HTTP numa
transação, transmitida pela sala depois de commitada.

Ver `.traycer` (artefatos do epic) para o contrato completo de schema, rotas e protocolo.

## Interações do canvas

- Crie um objeto pela paleta ou segurando o botão esquerdo sobre uma área vazia por cerca
  de 220 ms. Mover mais de 6 px cancela o gesto; o menu de contexto continua abrindo a
  mesma roda. Primeiro informe o título e, no segundo modal, preencha os demais dados e
  clique em **concluir**.
- A seção **objetos de seta** cria linha, seta, seta em cotovelo, seta em bloco ou divisor
  diretamente no canvas, sem título nem modal. Linhas e setas começam com início, meio e
  fim; arraste o controle vazio de um segmento para criar uma dobra e novos meios. O divisor
  fica sempre reto entre somente dois extremos.
- `Ctrl`/`Cmd`+`A` seleciona nós, notas e objetos de seta livres — relações entre nós não
  entram na seleção.
  `Ctrl`/`Cmd`+`C`, `X` e `V` copiam, cortam e colam a seleção; ao colar, o conjunto é
  deslocado 40 px e só as setas cujas duas pontas foram copiadas são recriadas. A área de
  transferência é interna ao app e dura apenas enquanto a página está aberta.
- Selecione um nó ou nota para redimensioná-lo. O limite inferior é 20×20 px e não altera
  o zoom. No modal do nó, o nome é editável e a engrenagem revela o id e controles de
  tamanho proporcional (20–1000 px). Por enquanto esse tamanho visual não é persistido
  nem sincronizado entre clientes.
- Todos os pedidos de texto e confirmação usam modais da aplicação; o `×` no canto
  superior direito fecha o modal.
- **Exportar** baixa o projeto, a seleção ou a área atual em PNG, PDF, Markdown ou
  Markdown para RFC. PNG/PDF preservam objetos de seta livres; os dois formatos Markdown
  levam o conteúdo dos nós, notas e relações, sem posições, tamanhos, cores, formas ou
  outros detalhes visuais. O formato RFC também acrescenta um mapa compacto e determinístico
  de entradas, saídas, bifurcações, convergências e ciclos do fluxo.
- A categoria **Conteúdo incorporado** cria um objeto de URL. Links HTTPS do YouTube
  abrem no player sem cookies; outros sites aparecem quando permitem iframe.

`PATCH /api/projetos/:projeto/nos/:no` aceita `{ titulo }`, `{ campos }` ou ambos. As
alterações de nó e aresta tratam itens que desapareceram durante a operação como `404`, e
`PATCH`/`DELETE` de aresta validam o UUID antes de consultar o Postgres.

## Testes

Precisam de um Postgres acessível em `DATABASE_URL` (schema aplicado automaticamente pelos
próprios testes). Local rápido:

```bash
docker run -d --rm --name grapydown-test-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=grapydown_test -p 55432:5432 postgres:16-alpine

export DATABASE_URL=postgres://postgres:postgres@localhost:55432/grapydown_test
export COOKIE_SECRET=segredo-de-teste
npm test
npm run typecheck
```

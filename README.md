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

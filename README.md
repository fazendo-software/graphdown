# grapydown

Editor local de grafos de processo. Cada nó é um arquivo `.md`; o markdown é a fonte da
verdade. O canvas desenha com traço à mão, e clicar num nó abre os dados estruturados.

## Requisitos

Node 22.13 ou maior. O TypeScript roda direto, sem build: os comandos abaixo passam
`--experimental-strip-types`. No Node 22.18+ a flag é opcional.

## Uso

```bash
npm install
npm run build:web
npm run serve exemplo/onboarding
```

Abre em `http://localhost:5174` (mude com `PORTA=...`).

Desenvolvimento, com recarga do front:

```bash
npm run serve exemplo/onboarding   # terminal 1
npm run dev:web                    # terminal 2, abre em :5173 com proxy para :5174
```

## Estrutura de uma pasta

```
minha-pasta/
  _grafo.yaml                # titulo + categoria
  01-primeiro-passo.md
  .grapydown/layout.json     # posicoes (versione no git)
  .grapydown/trash/          # nos apagados
```

Nó:

```md
---
titulo: Aprovação do gestor
responsavel: gestor-direto
prazo: 2d
status: ativo
depende_de:
  - 01-solicitacao
  - { de: 03-provisionamento, quando: rejeitado }
---
Corpo livre em markdown. Isto vira o conteúdo do modal.
```

A aresta mora no destino, em `depende_de`. O id do nó é o nome do arquivo.

## Categorias

`categorias/processo.yaml` define os campos do formulário e a cor do nó. Uma categoria nova
é um YAML novo — nenhum código muda.

## Testes

```bash
npm test        # core/ e servidor/
npm run typecheck
```

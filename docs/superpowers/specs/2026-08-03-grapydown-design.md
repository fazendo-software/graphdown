# grapydown — design

Data: 2026-08-03
Status: aprovado para planejamento

## Objetivo

Editor local de grafos de processo onde a **fonte da verdade é markdown**. Cada nó é um
arquivo `.md` com frontmatter estruturado e corpo livre. O canvas desenha esse grafo com
aparência à mão (rough.js), permite arrastar, criar nó, ligar nós, e ao clicar num nó abre
um modal com os dados estruturados (editáveis) e o corpo do arquivo renderizado.

Uso: `npx grapydown serve ./processos/onboarding` → abre em `localhost:5173`.

## Por que não usar o que já existe

| Ferramenta | Por que não resolve |
|---|---|
| Mermaid (inclusive `look: handDrawn`) | Texto → SVG de mão única. Não tem noção de edição no canvas. Serve como render, não como editor. |
| Excalidraw puro | Ferramenta de desenho. Elementos não mapeiam para arquivos, e a semântica de grafo teria que ser reconstruída a partir de diffs de cena. Briga com a lib. |
| `@excalidraw/mermaid-to-excalidraw` | Conversão de mão única. Mesmo problema. |

O que nenhuma entrega e é o produto: **nó carregando dados estruturados + persistência
bidirecional em markdown legível por humano**.

## Não-objetivos do v1

Removidos de propósito. Cada um só entra quando doer:

- As outras 3 categorias (arquitetura técnica, roadmap, org). O v1 é só `processo`.
- Autenticação, multiusuário, servidor remoto. É `localhost`, single-user.
- Export PNG/PDF.
- Desenho livre (retângulo solto, seta decorativa, texto flutuante).
- Undo global. Git + `.grapydown/trash/` são o undo do v1. Primeira coisa do v2 se incomodar.
- Busca/consulta no grafo ("quem depende de X").
- Grafos grandes. v1 assume < 200 nós; sem virtualização.

## Layout em disco

```
processos/onboarding/
  _grafo.yaml                # categoria + titulo do grafo
  01-solicitacao.md
  02-aprovacao-gestor.md
  03-provisionamento.md
  .grapydown/
    layout.json              # posicoes dos nos (versionado no git)
    trash/                   # nos deletados
```

`_grafo.yaml`:

```yaml
titulo: Onboarding de colaborador
categoria: processo
```

Nó (`02-aprovacao-gestor.md`):

```md
---
titulo: Aprovação do gestor
status: ativo
responsavel: gestor-direto
prazo: 2d
depende_de:
  - 01-solicitacao
  - { de: 03-provisionamento, quando: rejeitado }
---
Gestor recebe email. SLA 2 dias úteis.

Se negar, volta para o RH com justificativa.
```

Regras:

- **`id` do nó = nome do arquivo sem extensão.** Sem campo `id` no frontmatter — duas fontes
  de verdade para a mesma coisa é bug esperando acontecer. Renomear arquivo = renomear id.
- **Aresta mora no destino**, em `depende_de`. Um lugar só; nunca há dois arquivos para
  manter em sincronia.
- `depende_de` aceita string (`01-solicitacao`) ou objeto (`{ de, quando }`). Uma função
  `normalizarAresta` cobre os dois; o objeto existe porque processo tem ramo condicional e o
  rótulo da aresta é informação de negócio.
- `titulo` é o único campo obrigatório além dos que a categoria exigir. Ausente → cai para o
  nome do arquivo.

### `layout.json`

```json
{
  "01-solicitacao": { "x": 0, "y": 0 },
  "02-aprovacao-gestor": { "x": 240, "y": 0 }
}
```

Gravado com chaves ordenadas alfabeticamente e um nó por linha, para que o diff de git seja
legível e o conflito de merge seja resolvível à mão. **Versionado.** A alternativa
(`.gitignore`) evitaria conflitos, mas cada pessoa do time veria um desenho diferente do
mesmo processo — o que quebra o propósito da ferramenta.

Posição nunca entra no `.md`. Arrastar no canvas não pode tocar no texto que o usuário
escreveu.

## Categoria = arquivo, não framework

`categorias/processo.yaml`:

```yaml
nome: Processo
campos:
  - { chave: responsavel, tipo: texto, obrigatorio: true }
  - { chave: prazo,       tipo: texto }
  - { chave: status,      tipo: enum, opcoes: [rascunho, ativo, bloqueado, concluido] }
cor_por: status
cores:
  rascunho:  "#9ca3af"
  ativo:     "#2563eb"
  bloqueado: "#dc2626"
  concluido: "#16a34a"
```

Alimenta três coisas: o formulário do modal, a cor do nó no canvas, e o template do nó novo.
As outras 3 categorias são mais 3 YAMLs — zero código novo. Sem sistema de plugin, sem
registry, sem interface com uma implementação.

## Arquitetura

Três módulos, dependência em uma direção só:

| Módulo | Responsabilidade | Depende de |
|---|---|---|
| `core/` | **puro, zero I/O.** Parse de nota, montagem do grafo, edição cirúrgica de campo. | `yaml` |
| `servidor/` | Watcher, HTTP, SSE, escrita atômica, CLI. | `core`, `chokidar` |
| `web/` | React Flow + rough.js + modal. | HTTP do servidor |

Todo o risco real do projeto (preservar o markdown do usuário num round-trip) mora em
`core/`, que é testável sem mock, sem servidor e sem browser.

### `core/` — superfície pública

```
parseNota(texto)                     -> { doc: YAML.Document, corpo: string, erro?: string }
serializarNota(doc, corpo)           -> string
construirGrafo(notas)                -> { nos, arestas, erros }
editarCampo(texto, chave, valor)     -> string   // preserva comentarios e ordem
editarCorpo(texto, corpo)            -> string   // frontmatter intacto
normalizarAresta(entrada)            -> { de, quando? }
templateNo(categoria, titulo)        -> string
```

`editarCampo` usa a **Document API do pacote `yaml`**, não `js-yaml` nem `gray-matter`:
ambos perdem comentários e ordem no stringify. O frontmatter é separado do corpo por split
nos delimitadores `---` (regex de poucas linhas), não por dependência extra.

### `servidor/` — API HTTP

| Método | Rota | Faz |
|---|---|---|
| `GET` | `/api/grafo` | `{ titulo, categoria, nos[], arestas[], layout }`. Sem corpo dos nós. |
| `GET` | `/api/no/:id` | Nó completo, incluindo corpo markdown. Chamado ao abrir o modal. |
| `POST` | `/api/no` | `{ titulo }` → cria `.md` a partir do template da categoria. |
| `PATCH` | `/api/no/:id` | `{ campos: { chave: valor } }` → `editarCampo` por chave. |
| `PUT` | `/api/no/:id/corpo` | `{ corpo }` → `editarCorpo`. |
| `DELETE` | `/api/no/:id` | Move para `.grapydown/trash/`. |
| `PUT` | `/api/layout` | `{ id: {x,y} }` → grava `layout.json`. |
| `GET` | `/api/eventos` | SSE. Emite `grafo-mudou` quando o disco muda por fora. |

**Não existe endpoint de aresta.** Ligar A→B é `PATCH /api/no/B` acrescentando A em
`depende_de`; desligar é o mesmo PATCH removendo. Uma rota a menos, uma fonte de verdade.

Servidor HTTP em `node:http` com roteamento manual (~40 linhas). Express seria uma
dependência para economizar essas linhas; num CLI distribuído por `npx`, peso de instalação
e tempo de boot valem mais do que as 40 linhas.

## Fluxo de dados

```
boot           servidor le a pasta -> core.construirGrafo -> GET /api/grafo
               front aplica layout.json; no sem posicao salva -> dagre calcula
arrastar       debounce 500ms -> PUT /api/layout            (NAO toca em .md)
ligar A->B     PATCH /api/no/B { depende_de: [...atual, A] }
desligar       PATCH /api/no/B com a lista sem A
abrir modal    GET /api/no/:id -> campos + corpo
editar campo   PATCH /api/no/:id -> core.editarCampo -> escrita atomica
editar corpo   PUT /api/no/:id/corpo
criar no       duplo-click no vazio -> POST /api/no -> arquivo novo
deletar no     confirma -> DELETE -> move para .grapydown/trash/
disco mudou    chokidar -> SSE 'grafo-mudou' -> front repuxa /api/grafo
```

## Escrita segura

Três garantias, todas no `servidor/`:

1. **Atômica.** Escreve em `arquivo.md.tmp`, depois `rename`. Nunca deixa arquivo truncado
   se o processo morrer no meio.
2. **Sem loop watcher↔escrita.** Toda escrita registra o hash do conteúdo num set. O
   watcher ignora o evento cujo hash bate e remove a entrada. Sem isso: escrever dispara
   watcher, que dispara reload, que dispara escrita — laço infinito.
3. **Delete nunca é `unlink`.** Move para `.grapydown/trash/<id>-<timestamp>.md`. Um clique
   errado no canvas não pode apagar texto que a pessoa escreveu.

## Erros — degradar, nunca derrubar o grafo

| Situação | Comportamento |
|---|---|
| `depende_de` aponta para id inexistente | Nó fantasma vermelho tracejado no canvas com o id faltante. Grafo renderiza. |
| YAML do frontmatter inválido | Aquele nó entra em estado de erro exibindo a mensagem do parser. Os outros renderizam. |
| Ciclo no grafo | **Permitido.** Processo real tem volta ("se negar, retorna ao passo 1"). Dagre lida com ciclo. |
| `_grafo.yaml` ausente | Assume `categoria: processo` e título = nome da pasta. |
| Arquivo fora da pasta / path traversal no `:id` | Rejeita. `:id` é validado contra `/^[\w.-]+$/` antes de virar caminho. |

Erros aparecem no canvas, não em console. O usuário-alvo é gestão, não dev.

## Testes

`node:test` + `assert`, apenas sobre `core/`. Sem framework, sem fixture, sem mock.

Casos que precisam existir:

1. `editarCampo` preserva comentários, ordem das chaves e formatação do YAML original. **É o
   teste que justifica a escolha da lib** — se ele passar, o risco central do projeto está
   coberto.
2. `editarCorpo` não altera nenhum byte do frontmatter.
3. `construirGrafo` com `depende_de` quebrado devolve o nó fantasma em `erros`, não lança.
4. `construirGrafo` com ciclo devolve o grafo, não lança.
5. `normalizarAresta` cobre as duas formas (string e objeto).

## Riscos

| Risco | Mitigação |
|---|---|
| Round-trip corromper markdown do usuário | Document API do `yaml` + teste 1 + escrita atômica + trash. |
| Loop watcher ↔ escrita | Set de hashes das escritas próprias. |
| rough.js regerando o desenho a cada frame do drag | O path rough é memoizado por `[largura, altura, seed, cor]`. React Flow move o nó por `transform` CSS, então o conteúdo do nó não re-renderiza durante o arrasto. Sem isso o canvas trava. |
| Aparência handdrawn ficar meia-boca | `seed` derivado do id do nó (estável entre renders — senão o desenho "treme"), `roughness` e `bowing` ajustáveis num único lugar. |

## Stack

- TypeScript, Node 22+.
- `web/`: Vite, React, `@xyflow/react`, `roughjs`, `@dagrejs/dagre`, `markdown-it`.
- `servidor/`: `node:http`, `chokidar`.
- `core/`: `yaml`.
- Testes: `node:test`.

## Decisões confirmadas

1. `layout.json` é versionado no git. Reverter = uma linha no `.gitignore`.
2. A pasta do projeto é repositório git.

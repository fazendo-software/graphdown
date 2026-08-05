# Formas de nó e tipos de aresta — design

Data: 2026-08-05
Depende de: `2026-08-03-grapydown-design.md` (v1 já implementado)

## Problema

O v1 desenha todo nó como retângulo e toda aresta como uma bezier cinza com seta cheia. Um
processo real distingue passo de decisão, marca onde começa e termina, mostra quem é o ator, e
separa fluxo normal de exceção. Hoje essa informação existe no texto (`titulo`, `quando`) mas
não no desenho.

## O que entra

1. Conjunto fixo de formas de nó: retângulo, losango, estádio, paralelogramo, ator.
2. "Ator" é uma forma de nó, não uma raia — continua sendo um arquivo `.md` que se liga aos
   passos como qualquer outro.
3. Aresta ganha três eixos de aparência: estilo de linha, ponta e cor.

## Não-objetivos

Removidos de propósito:

- **Raia / swimlane.** Agrupar por `responsavel` trocaria a posição livre (x, y) por
  "raia + ordem" e mudaria o formato do `layout.json`. Briga com o arrasto livre do v1.
- **Desenho livre** (moldura solta, seta decorativa, texto flutuante). Continua fora, como no
  spec do v1: não cabe no modelo de 1 arquivo por nó.
- **Override inline de estilo na aresta** (`tipo: excecao` + `cor:` sobrescrevendo). Ninguém
  pediu ainda.
- **Espessura de linha.** Os três eixos escolhidos cobrem o caso.

## Modelo de dados

A regra que organiza tudo: **o arquivo diz o significado, a categoria diz o desenho.** Mesma
divisão que `cor_por` já usa.

### Categoria

Três chaves novas, todas opcionais:

```yaml
# categorias/processo.yaml
nome: Processo
campos:
  - { chave: tipo, tipo: enum, opcoes: [passo, decisao, inicio, fim, ator] }
  - { chave: responsavel, tipo: texto, obrigatorio: true }
  - { chave: prazo, tipo: texto }
  - { chave: status, tipo: enum, opcoes: [rascunho, ativo, bloqueado, concluido] }

forma_por: tipo
formas:
  passo: retangulo
  decisao: losango
  inicio: estadio
  fim: estadio
  ator: ator

cor_por: status
cores:
  rascunho: "#9ca3af"
  ativo: "#2563eb"
  bloqueado: "#dc2626"
  concluido: "#16a34a"

arestas:
  padrao:  { estilo: continua,   ponta: cheia,   cor: "#52525b" }
  excecao: { estilo: tracejada,  ponta: aberta,  cor: "#dc2626" }
  dado:    { estilo: pontilhada, ponta: nenhuma, cor: "#2563eb" }
```

`forma_por` aponta para um campo enum já declarado em `campos`. Consequência deliberada: o
modal renderiza esse campo como `<select>` sem nenhum código de UI novo, e `opcoes[0]`
(`passo`) é o que `templateNo` grava num nó recém-criado.

### Nó

Formato inalterado. A forma é só mais um campo:

```yaml
---
titulo: Aprovou?
tipo: decisao
responsavel: gestor-direto
status: ativo
depende_de:
  - 02-aprovacao-gestor
  - { de: 07-recusa, quando: reprovado, tipo: excecao }
---
Corpo livre.
```

### Tipos (`core/tipos.ts`)

```ts
export type EstiloAresta = {
  estilo?: "continua" | "tracejada" | "pontilhada";
  ponta?: "cheia" | "aberta" | "nenhuma" | "ambas";
  cor?: string;
};

export type Aresta = { de: string; para: string; quando?: string; tipo?: string };

export type Categoria = {
  nome: string;
  campos: CampoCategoria[];
  cor_por?: string;
  cores?: Record<string, string>;
  forma_por?: string;
  formas?: Record<string, string>;
  arestas?: Record<string, EstiloAresta>;
};
```

`normalizarAresta` passa a preservar `tipo` (string; qualquer outra coisa é descartada).
Nenhuma rota nova: `/api/grafo` já devolve a categoria e as arestas.

## Desenho

### Formas

`web/src/rough.ts` ganha uma função por forma, todas devolvendo `Traco[]`:

| forma | geometria | tamanho |
|---|---|---|
| `retangulo` | `gerador.rectangle` (já existe) | 200×76 |
| `losango` | `gerador.polygon`, 4 pontos nos meios das bordas | 180×110 |
| `estadio` | `gerador.path`, retângulo de cantos semicirculares | 160×64 |
| `paralelogramo` | `gerador.polygon` com deslocamento de 22px | 200×76 |
| `ator` | composto: `circle` (cabeça) + `linearPath` (tronco, braços, pernas), concatenando os dois `Traco[]` | 120×120 |

Tamanho é **por forma**, não global: um losango achatado num box 200×76 não lê como decisão.
Consequências:

- `LARGURA`/`ALTURA` viram uma tabela `TAMANHOS: Record<string, { largura, altura }>`
  exportada por `NoProcesso.tsx`.
- `completarLayout` passa a receber os tamanhos por id — dagre precisa deles para não
  sobrepor nós de tamanhos diferentes.
- `NoProcesso` recua o texto conforme a forma: losango ~26% nas laterais, ator com o rótulo
  abaixo da figura.

Forma desconhecida (categoria cita uma forma que não existe) cai em `retangulo`.

Duas observações sobre a tabela acima:

- `inicio` e `fim` mapeiam para o **mesmo** `estadio`. O que os distingue no canvas é o título
  e a posição no fluxo, não o desenho. Se depois incomodar, `cores` resolve sem tocar em
  código.
- `paralelogramo` fica disponível no vocabulário de formas, mas a categoria `processo` do v1
  não mapeia nenhum `tipo` para ele. Entra quando alguém precisar de entrada/saída explícita.

### Arestas

`ArestaRough` passa a ler `data: { estilo, ponta, cor }`, resolvido em `montar()` a partir de
`categoria.arestas[a.tipo] ?? categoria.arestas.padrao ?? padrão embutido`:

- `estilo` → `strokeLineDash` do rough: contínua `undefined`, tracejada `[8, 6]`, pontilhada
  `[2, 5]`. O rough já emite o path segmentado; não usamos `strokeDasharray` no SVG.
- `ponta` → `markerEnd` no objeto da aresta: cheia `ArrowClosed`, aberta `Arrow`, nenhuma sem
  marker, ambas soma `markerStart`.
- `cor` → stroke do rough **e** `color` do marker.

**Correção que entra junto:** hoje `<BaseEdge path={t.d} />` não recebe `style`, então a cor
passada ao rough nunca chega ao SVG — quem pinta é o CSS do React Flow. Sem isso, `cor` na
categoria não teria efeito nenhum.

A memoização do v1 se mantém: as dependências de `useMemo` continuam primitivas
(`seed, cor, estilo, forma, selected, …`), então arrastar não regenera traço.

## UI

**Forma:** nada a fazer. `tipo` é campo enum, o modal já o renderiza como `<select>`,
e trocar dispara PATCH → recarrega → o nó muda de forma.

**Tipo da aresta:** uma seção nova no modal do nó de **destino**, abaixo dos campos:

```
depende de
  02-aprovacao-gestor   [padrao ▾]   [×]
  07-recusa             [excecao ▾]  [×]
```

Uma linha por entrada de `depende_de`; o dropdown lista as chaves de `categoria.arestas`; o
`×` remove. Salva com um PATCH do `depende_de` inteiro — mesma rota de sempre. Reusa o modal
em vez de inventar popup flutuante sobre o canvas, e dá um caminho de mouse para remover
aresta (hoje só pelo teclado).

Os dados já estão no modal: `no.campos.depende_de` e `categoria`. Leitura via `comoLista` +
`normalizarAresta` do core, como `App.tsx` já faz.

## Compatibilidade

Nenhum arquivo existente muda:

- nó sem `tipo` → `retangulo`
- `depende_de` como string → aresta padrão
- categoria sem `forma_por` / `formas` / `arestas` → comportamento idêntico ao de hoje

## Testes

- `core/grafo.test.ts` — `normalizarAresta` preserva `tipo` e descarta `tipo` não-string;
  `construirGrafo` propaga `tipo` para a `Aresta`
- `core/categoria.test.ts` — `parseCategoria` lê `forma_por` / `formas` / `arestas` e tolera a
  ausência das três
- `web/src/rough.test.ts` (novo) — cada forma devolve traços não vazios e contidos no box.
  `rough.ts` não tem JSX, então roda no `node:test`; o glob do `npm test` ganha
  `web/src/*.test.ts`
- manual: estender `exemplo/onboarding` com um nó `inicio`, um `decisao`, um `ator` e uma
  aresta `excecao`

## Arquivos afetados

```
core/tipos.ts          EstiloAresta, Aresta.tipo, Categoria.{forma_por,formas,arestas}
core/grafo.ts          normalizarAresta preserva tipo
core/categoria.ts      parseCategoria lê as 3 chaves novas
categorias/processo.yaml
web/src/rough.ts       losango, estadio, paralelogramo, ator
web/src/NoProcesso.tsx TAMANHOS, escolha de forma, recuo de texto por forma
web/src/ArestaRough.tsx estilo/ponta/cor + style no BaseEdge
web/src/App.tsx        montar() resolve forma e estilo de aresta; tamanhos para o layout
web/src/layoutAuto.ts  recebe tamanhos por id
web/src/Modal.tsx      seção "depende de"
exemplo/onboarding/    nós novos cobrindo as formas e a aresta de exceção
```

## Riscos

- **Geometria do ator.** É a única forma composta (dois `Drawable` concatenados). Se ficar
  ilegível em 120×120, o recuo cai para "figura à esquerda, rótulo à direita".
- **Handles nas formas não retangulares.** React Flow ancora `Position.Top`/`Bottom` no box,
  não na geometria; no losango e no estádio isso coincide com as pontas, mas no paralelogramo
  a seta encosta ligeiramente fora do traço. Aceito no v1.
- **dagre com tamanhos mistos.** Já suportado (`setNode` recebe width/height por nó); o risco
  é só de espaçamento feio, não de sobreposição.

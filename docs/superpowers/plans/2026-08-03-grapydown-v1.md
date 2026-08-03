# grapydown v1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Editor local de grafos de processo onde cada nó é um arquivo `.md`, o canvas desenha com aparência à mão e clicar num nó abre um modal com os dados estruturados e o corpo do arquivo.

**Architecture:** Três módulos com dependência em uma direção só. `core/` é puro (sem I/O) e concentra o risco do projeto: editar frontmatter preservando o markdown do usuário. `servidor/` faz I/O — watcher, escrita atômica, HTTP, SSE. `web/` é React Flow para a interação de grafo e rough.js para a aparência. Posição de nó vive em `.grapydown/layout.json`, nunca no `.md`.

**Tech Stack:** TypeScript sobre Node 22.18+ (type stripping nativo, sem build para `core/` e `servidor/`), `yaml`, `chokidar`, `node:http`, `node:test`. No front: Vite, React, `@xyflow/react`, `roughjs`, `@dagrejs/dagre`, `markdown-it`.

**Spec:** `docs/superpowers/specs/2026-08-03-grapydown-design.md`

---

## Nota sobre a versão do Node

Todo `core/` e `servidor/` roda `.ts` direto, sem transpilar. Node 22.18+ faz isso sozinho;
abaixo disso precisa da flag `--experimental-strip-types`, que existe desde a 22.6.

**Esta máquina tem v22.13.1**, então todo comando `node` deste plano leva a flag — já está
escrita em cada Step, nos scripts do `package.json` e no shebang do CLI. Verificado
empiricamente nesta versão: type stripping funciona, o test runner roda `.ts`, e
`#!/usr/bin/env -S node --experimental-strip-types` funciona como shebang.

Duas pegadinhas desta versão, já contornadas no plano:

1. `node --test <pasta>` **não** funciona aqui (só a partir da 22.14). Use glob entre aspas:
   `node --experimental-strip-types --test "core/*.test.ts"`.
2. Sem `"type": "module"` no `package.json` os arquivos `.ts` caem em CommonJS e o import
   quebra. A Task 1 já cria o campo.

Quando o Node subir para 22.18+, dá para apagar todas as ocorrências de
`--experimental-strip-types` — nada mais muda.

Type stripping nativo tem duas regras que valem para todo código deste plano:

1. Imports relativos usam a extensão real: `from "./parse.ts"`, não `from "./parse"`.
2. Sem `enum`, sem `namespace`, sem `import x = require(...)`.

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `core/tipos.ts` | Tipos compartilhados. Sem lógica. |
| `core/parse.ts` | Frontmatter ↔ texto. `parseNota`, `serializarNota`, `editarCampo`, `editarCorpo`. |
| `core/grafo.ts` | `normalizarAresta`, `construirGrafo`. Nós + arestas + fantasmas. |
| `core/categoria.ts` | `parseCategoria`, `templateNo`, `idDeTitulo`. |
| `servidor/arquivos.ts` | Ler pasta, escrita atômica, lixeira, `layout.json`, validação de id. |
| `servidor/rotas.ts` | Roteador HTTP e handlers. Serve `web/dist` no fallback. |
| `servidor/watcher.ts` | chokidar + registro de clientes SSE. |
| `servidor/index.ts` | CLI `grapydown serve <pasta>`. |
| `web/src/api.ts` | Cliente HTTP. Um lugar só com `fetch`. |
| `web/src/NoProcesso.tsx` | Nó custom do React Flow desenhado com rough.js. |
| `web/src/ArestaRough.tsx` | Aresta custom com o path roughened. |
| `web/src/Modal.tsx` | Detalhe do nó: form dos campos + corpo markdown. |
| `web/src/layoutAuto.ts` | Dagre para nós sem posição salva. |
| `web/src/App.tsx` | Cola tudo: estado do grafo, drag, connect, SSE. |
| `categorias/processo.yaml` | Schema da categoria `processo`. |
| `exemplo/onboarding/` | Grafo de exemplo, usado para rodar o app à mão. |

---

### Task 1: Scaffold do projeto

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`

- [ ] **Step 1: Criar `package.json`**

```json
{
  "name": "grapydown",
  "version": "0.1.0",
  "type": "module",
  "bin": { "grapydown": "./servidor/index.ts" },
  "scripts": {
    "test": "node --experimental-strip-types --test \"core/*.test.ts\" \"servidor/*.test.ts\"",
    "dev:web": "vite --config web/vite.config.ts",
    "build:web": "vite build --config web/vite.config.ts",
    "serve": "node --experimental-strip-types servidor/index.ts serve"
  },
  "dependencies": {
    "@dagrejs/dagre": "^1.1.4",
    "@xyflow/react": "^12.3.5",
    "chokidar": "^4.0.1",
    "markdown-it": "^14.1.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "roughjs": "^4.6.6",
    "yaml": "^2.6.0"
  },
  "devDependencies": {
    "@types/markdown-it": "^14.1.2",
    "@types/node": "^22.9.0",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "typescript": "^5.6.3",
    "vite": "^5.4.11"
  }
}
```

- [ ] **Step 2: Criar `tsconfig.json`**

Só para o editor e para `tsc --noEmit`. Nada aqui gera arquivo.

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "strict": true,
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM"],
    "types": ["node"],
    "verbatimModuleSyntax": true
  },
  "include": ["core", "servidor", "web/src"]
}
```

- [ ] **Step 3: Criar `.gitignore`**

`layout.json` **não** entra aqui — é versionado de propósito (decisão do spec).

```gitignore
node_modules/
web/dist/
*.tmp
.grapydown/trash/
```

- [ ] **Step 4: Instalar e verificar**

Run: `npm install && node --version`
Expected: install sem erro, versão `v22.18.0` ou maior.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore
git commit -m "chore: scaffold do projeto"
```

---

### Task 2: Tipos compartilhados

**Files:**
- Create: `core/tipos.ts`

Sem teste — arquivo só de tipos, some no runtime. O teste dele é o `tsc --noEmit` do Step 2.

- [ ] **Step 1: Criar `core/tipos.ts`**

```ts
export type Aresta = { de: string; para: string; quando?: string };

export type No = {
  id: string;
  titulo: string;
  campos: Record<string, unknown>;
  erro?: string;
};

export type Grafo = {
  nos: No[];
  arestas: Aresta[];
  fantasmas: string[];
};

export type CampoCategoria = {
  chave: string;
  tipo: "texto" | "enum";
  obrigatorio?: boolean;
  opcoes?: string[];
};

export type Categoria = {
  nome: string;
  campos: CampoCategoria[];
  cor_por?: string;
  cores?: Record<string, string>;
};

export type Posicao = { x: number; y: number };
export type Layout = Record<string, Posicao>;
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem saída (sucesso).

- [ ] **Step 3: Commit**

```bash
git add core/tipos.ts
git commit -m "feat(core): tipos compartilhados"
```

---

### Task 3: Parse e edição de frontmatter

Esta é a task mais importante do projeto. Se `editarCampo` estragar o markdown de quem
escreveu, a ferramenta é inutilizável. O teste do Step 1 é o que justifica a escolha do
pacote `yaml` no lugar de `js-yaml`/`gray-matter`.

**Files:**
- Create: `core/parse.ts`
- Test: `core/parse.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// core/parse.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNota, editarCampo, editarCorpo, serializarNota } from "./parse.ts";

const NOTA = `---
# quem responde por este passo
titulo: Aprovação do gestor
responsavel: gestor-direto
prazo: 2d          # SLA acordado com RH
depende_de:
  - 01-solicitacao
---
Gestor recebe email.

Se negar, volta para o RH.
`;

test("parseNota separa frontmatter do corpo", () => {
  const { doc, corpo, erro } = parseNota(NOTA);
  assert.equal(erro, undefined);
  assert.equal(doc.get("titulo"), "Aprovação do gestor");
  assert.equal(corpo, "Gestor recebe email.\n\nSe negar, volta para o RH.\n");
});

test("parseNota sem frontmatter trata tudo como corpo", () => {
  const { corpo, erro } = parseNota("só texto\n");
  assert.equal(erro, undefined);
  assert.equal(corpo, "só texto\n");
});

test("parseNota reporta YAML inválido sem lançar", () => {
  const { erro } = parseNota("---\na: [1, 2\n---\ncorpo\n");
  assert.ok(erro, "esperava mensagem de erro");
});

test("editarCampo preserva comentários, ordem e o corpo", () => {
  const saida = editarCampo(NOTA, "prazo", "5d");
  assert.match(saida, /# quem responde por este passo/);
  assert.match(saida, /# SLA acordado com RH/);
  assert.match(saida, /prazo: 5d/);
  assert.ok(saida.indexOf("titulo:") < saida.indexOf("responsavel:"));
  assert.ok(saida.endsWith("Gestor recebe email.\n\nSe negar, volta para o RH.\n"));
});

test("editarCampo cria chave que ainda não existe", () => {
  const saida = editarCampo(NOTA, "status", "ativo");
  assert.match(saida, /status: ativo/);
});

test("editarCorpo não altera um byte do frontmatter", () => {
  const saida = editarCorpo(NOTA, "corpo novo\n");
  const fmOriginal = NOTA.slice(0, NOTA.indexOf("---\nGestor") + 4);
  assert.ok(saida.startsWith(fmOriginal), "frontmatter mudou");
  assert.ok(saida.endsWith("corpo novo\n"));
});

test("serializarNota volta ao formato de arquivo", () => {
  const { doc } = parseNota(NOTA);
  const saida = serializarNota(doc, "x\n");
  assert.ok(saida.startsWith("---\n"));
  assert.ok(saida.endsWith("---\nx\n"));
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --experimental-strip-types --test core/parse.test.ts`
Expected: FAIL — `Cannot find module` para `./parse.ts`.

- [ ] **Step 3: Implementar `core/parse.ts`**

```ts
import { parseDocument, type Document } from "yaml";

const DELIM = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export type Nota = { doc: Document; corpo: string; erro?: string };

export function parseNota(texto: string): Nota {
  const m = texto.match(DELIM);
  if (!m) return { doc: parseDocument(""), corpo: texto };
  const doc = parseDocument(m[1]);
  const erro = doc.errors.length > 0 ? doc.errors[0].message : undefined;
  return { doc, corpo: texto.slice(m[0].length), erro };
}

export function serializarNota(doc: Document, corpo: string): string {
  return `---\n${doc.toString().trimEnd()}\n---\n${corpo}`;
}

export function editarCampo(texto: string, chave: string, valor: unknown): string {
  const { doc, corpo, erro } = parseNota(texto);
  // ponytail: nao editamos nota com YAML quebrado — reserializar destruiria o que o
  // usuario escreveu. A UI mostra o erro e pede correcao no editor de texto.
  if (erro) throw new Error(`frontmatter inválido: ${erro}`);
  doc.set(chave, valor);
  return serializarNota(doc, corpo);
}

export function editarCorpo(texto: string, corpo: string): string {
  // Splice de string, nao round-trip: o frontmatter sai byte a byte igual entrou.
  const m = texto.match(DELIM);
  return m ? m[0] + corpo : corpo;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --experimental-strip-types --test core/parse.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add core/parse.ts core/parse.test.ts
git commit -m "feat(core): parse e edicao de frontmatter preservando comentarios"
```

---

### Task 4: Montagem do grafo

**Files:**
- Create: `core/grafo.ts`
- Test: `core/grafo.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// core/grafo.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { construirGrafo, normalizarAresta } from "./grafo.ts";

const no = (id: string, fm: string) => ({ id, texto: `---\n${fm}\n---\ncorpo\n` });

test("normalizarAresta aceita string", () => {
  assert.deepEqual(normalizarAresta("a"), { de: "a", quando: undefined });
});

test("normalizarAresta aceita objeto com rótulo", () => {
  assert.deepEqual(normalizarAresta({ de: "a", quando: "rejeitado" }), {
    de: "a",
    quando: "rejeitado",
  });
});

test("normalizarAresta descarta lixo", () => {
  assert.equal(normalizarAresta(42), null);
  assert.equal(normalizarAresta({ sem: "de" }), null);
});

test("construirGrafo liga destino a origem", () => {
  const g = construirGrafo([
    no("a", "titulo: A"),
    no("b", "titulo: B\ndepende_de:\n  - a"),
  ]);
  assert.equal(g.nos.length, 2);
  assert.deepEqual(g.arestas, [{ de: "a", para: "b", quando: undefined }]);
  assert.deepEqual(g.fantasmas, []);
});

test("titulo ausente cai para o id", () => {
  const g = construirGrafo([no("a", "responsavel: rh")]);
  assert.equal(g.nos[0].titulo, "a");
});

test("referência quebrada vira fantasma, não exceção", () => {
  const g = construirGrafo([no("b", "titulo: B\ndepende_de:\n  - sumiu")]);
  assert.deepEqual(g.fantasmas, ["sumiu"]);
  assert.equal(g.arestas.length, 1);
});

test("YAML inválido isola o nó e preserva o resto", () => {
  const g = construirGrafo([
    { id: "ruim", texto: "---\na: [1, 2\n---\ncorpo\n" },
    no("bom", "titulo: Bom"),
  ]);
  assert.ok(g.nos.find((n) => n.id === "ruim")!.erro);
  assert.equal(g.nos.find((n) => n.id === "bom")!.titulo, "Bom");
});

test("ciclo é permitido", () => {
  const g = construirGrafo([
    no("a", "titulo: A\ndepende_de:\n  - b"),
    no("b", "titulo: B\ndepende_de:\n  - a"),
  ]);
  assert.equal(g.arestas.length, 2);
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --experimental-strip-types --test core/grafo.test.ts`
Expected: FAIL — `Cannot find module` para `./grafo.ts`.

- [ ] **Step 3: Implementar `core/grafo.ts`**

```ts
import { parseNota } from "./parse.ts";
import type { Aresta, Grafo, No } from "./tipos.ts";

export function normalizarAresta(entrada: unknown): { de: string; quando?: string } | null {
  if (typeof entrada === "string") return { de: entrada, quando: undefined };
  if (entrada !== null && typeof entrada === "object") {
    const o = entrada as { de?: unknown; quando?: unknown };
    if (typeof o.de === "string") {
      return { de: o.de, quando: typeof o.quando === "string" ? o.quando : undefined };
    }
  }
  return null;
}

function comoLista(valor: unknown): unknown[] {
  if (Array.isArray(valor)) return valor;
  return valor === undefined || valor === null ? [] : [valor];
}

export function construirGrafo(arquivos: { id: string; texto: string }[]): Grafo {
  const nos: No[] = [];
  const arestas: Aresta[] = [];
  const fantasmas = new Set<string>();
  const existentes = new Set(arquivos.map((a) => a.id));

  for (const { id, texto } of arquivos) {
    const { doc, erro } = parseNota(texto);
    const campos = (erro ? {} : (doc.toJS() ?? {})) as Record<string, unknown>;
    nos.push({
      id,
      titulo: typeof campos.titulo === "string" && campos.titulo ? campos.titulo : id,
      campos,
      erro,
    });
    if (erro) continue;
    for (const bruta of comoLista(campos.depende_de)) {
      const a = normalizarAresta(bruta);
      if (!a) continue;
      if (!existentes.has(a.de)) fantasmas.add(a.de);
      arestas.push({ de: a.de, para: id, quando: a.quando });
    }
  }

  return { nos, arestas, fantasmas: [...fantasmas] };
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --experimental-strip-types --test core/grafo.test.ts`
Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add core/grafo.ts core/grafo.test.ts
git commit -m "feat(core): montagem do grafo com fantasma e isolamento de erro"
```

---

### Task 5: Categoria e template de nó

**Files:**
- Create: `core/categoria.ts`
- Create: `categorias/processo.yaml`
- Test: `core/categoria.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

```ts
// core/categoria.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCategoria, templateNo, idDeTitulo } from "./categoria.ts";

const YAML_CAT = `nome: Processo
campos:
  - { chave: responsavel, tipo: texto, obrigatorio: true }
  - { chave: status, tipo: enum, opcoes: [rascunho, ativo] }
cor_por: status
cores:
  rascunho: "#9ca3af"
  ativo: "#2563eb"
`;

test("parseCategoria lê campos e cores", () => {
  const c = parseCategoria(YAML_CAT);
  assert.equal(c.nome, "Processo");
  assert.equal(c.campos.length, 2);
  assert.equal(c.campos[1].opcoes![0], "rascunho");
  assert.equal(c.cores!.ativo, "#2563eb");
});

test("parseCategoria tolera arquivo vazio", () => {
  const c = parseCategoria("");
  assert.deepEqual(c.campos, []);
});

test("templateNo gera frontmatter com todos os campos da categoria", () => {
  const texto = templateNo(parseCategoria(YAML_CAT), "Aprovação do gestor");
  assert.match(texto, /^---\n/);
  assert.match(texto, /titulo: Aprovação do gestor/);
  assert.match(texto, /responsavel: ""/);
  assert.match(texto, /status: rascunho/);
  assert.match(texto, /depende_de: \[\]/);
  assert.ok(texto.endsWith("---\n"));
});

test("idDeTitulo faz slug sem acento", () => {
  assert.equal(idDeTitulo("Aprovação do gestor"), "aprovacao-do-gestor");
  assert.equal(idDeTitulo("  !!  "), "no");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --experimental-strip-types --test core/categoria.test.ts`
Expected: FAIL — `Cannot find module` para `./categoria.ts`.

- [ ] **Step 3: Implementar `core/categoria.ts`**

```ts
import { parse, stringify } from "yaml";
import type { Categoria, CampoCategoria } from "./tipos.ts";

export function parseCategoria(texto: string): Categoria {
  const cru = (parse(texto) ?? {}) as Partial<Categoria>;
  return {
    nome: cru.nome ?? "Sem nome",
    campos: Array.isArray(cru.campos) ? (cru.campos as CampoCategoria[]) : [],
    cor_por: cru.cor_por,
    cores: cru.cores,
  };
}

export function templateNo(categoria: Categoria, titulo: string): string {
  const fm: Record<string, unknown> = { titulo };
  for (const campo of categoria.campos) {
    fm[campo.chave] = campo.tipo === "enum" ? (campo.opcoes?.[0] ?? "") : "";
  }
  fm.depende_de = [];
  return `---\n${stringify(fm).trimEnd()}\n---\n`;
}

export function idDeTitulo(titulo: string): string {
  const slug = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "no";
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --experimental-strip-types --test core/categoria.test.ts`
Expected: PASS, 4 testes.

- [ ] **Step 5: Criar `categorias/processo.yaml`**

```yaml
nome: Processo
campos:
  - { chave: responsavel, tipo: texto, obrigatorio: true }
  - { chave: prazo, tipo: texto }
  - { chave: status, tipo: enum, opcoes: [rascunho, ativo, bloqueado, concluido] }
cor_por: status
cores:
  rascunho: "#9ca3af"
  ativo: "#2563eb"
  bloqueado: "#dc2626"
  concluido: "#16a34a"
```

- [ ] **Step 6: Commit**

```bash
git add core/categoria.ts core/categoria.test.ts categorias/processo.yaml
git commit -m "feat(core): categoria como arquivo yaml e template de no"
```

---

### Task 6: Camada de arquivos do servidor

**Files:**
- Create: `servidor/arquivos.ts`
- Test: `servidor/arquivos.test.ts`

Três garantias moram aqui: escrita atômica, lixeira no lugar de `unlink`, e o registro de
hash que impede o laço watcher↔escrita.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// servidor/arquivos.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  idValido,
  lerPasta,
  escrever,
  ehEscritaPropria,
  paraLixeira,
  lerLayout,
  gravarLayout,
} from "./arquivos.ts";

async function pastaTemp() {
  return await mkdtemp(join(tmpdir(), "grapy-"));
}

test("idValido barra path traversal", () => {
  assert.equal(idValido("01-passo"), true);
  assert.equal(idValido("../../etc/passwd"), false);
  assert.equal(idValido("a/b"), false);
  assert.equal(idValido(""), false);
});

test("lerPasta devolve só .md, ordenado, sem a pasta oculta", async () => {
  const dir = await pastaTemp();
  await writeFile(join(dir, "02-b.md"), "---\ntitulo: B\n---\n");
  await writeFile(join(dir, "01-a.md"), "---\ntitulo: A\n---\n");
  await writeFile(join(dir, "leiame.txt"), "ignorar");
  await mkdir(join(dir, ".grapydown"));
  await writeFile(join(dir, ".grapydown", "nota.md"), "não conta");

  const arquivos = await lerPasta(dir);
  assert.deepEqual(
    arquivos.map((a) => a.id),
    ["01-a", "02-b"],
  );
});

test("escrever é atômico e não deixa .tmp para trás", async () => {
  const dir = await pastaTemp();
  await escrever(join(dir, "x.md"), "conteudo\n");
  assert.equal(await readFile(join(dir, "x.md"), "utf8"), "conteudo\n");
  const restos = (await readdir(dir)).filter((n) => n.endsWith(".tmp"));
  assert.deepEqual(restos, []);
});

test("escrita própria é reconhecida uma vez só", async () => {
  const dir = await pastaTemp();
  await escrever(join(dir, "y.md"), "abc\n");
  assert.equal(ehEscritaPropria("abc\n"), true, "primeira checagem consome o hash");
  assert.equal(ehEscritaPropria("abc\n"), false, "segunda já é mudança externa");
});

test("paraLixeira move o arquivo, não apaga", async () => {
  const dir = await pastaTemp();
  await writeFile(join(dir, "z.md"), "importante\n");
  await paraLixeira(dir, "z");
  assert.deepEqual(
    (await readdir(dir)).filter((n) => n.endsWith(".md")),
    [],
  );
  const lixo = await readdir(join(dir, ".grapydown", "trash"));
  assert.equal(lixo.length, 1);
  assert.match(lixo[0], /^z-\d+\.md$/);
  assert.equal(await readFile(join(dir, ".grapydown", "trash", lixo[0]), "utf8"), "importante\n");
});

test("layout grava ordenado, um nó por linha, e relê igual", async () => {
  const dir = await pastaTemp();
  await gravarLayout(dir, { b: { x: 10, y: 20 }, a: { x: 0, y: 0 } });
  const bruto = await readFile(join(dir, ".grapydown", "layout.json"), "utf8");
  assert.equal(bruto, '{\n  "a": {"x":0,"y":0},\n  "b": {"x":10,"y":20}\n}\n');
  assert.deepEqual(await lerLayout(dir), { a: { x: 0, y: 0 }, b: { x: 10, y: 20 } });
});

test("lerLayout devolve vazio quando não existe", async () => {
  assert.deepEqual(await lerLayout(await pastaTemp()), {});
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --experimental-strip-types --test servidor/arquivos.test.ts`
Expected: FAIL — `Cannot find module` para `./arquivos.ts`.

- [ ] **Step 3: Implementar `servidor/arquivos.ts`**

```ts
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Layout } from "../core/tipos.ts";

const OCULTA = ".grapydown";

export function idValido(id: string): boolean {
  return /^[\w.-]+$/.test(id) && !id.includes("..");
}

export function caminhoNo(dir: string, id: string): string {
  if (!idValido(id)) throw new Error(`id inválido: ${id}`);
  return join(dir, `${id}.md`);
}

export async function lerPasta(dir: string): Promise<{ id: string; texto: string }[]> {
  const nomes = (await readdir(dir))
    .filter((n) => n.endsWith(".md") && !n.startsWith("."))
    .sort();
  return Promise.all(
    nomes.map(async (nome) => ({
      id: nome.slice(0, -3),
      texto: await readFile(join(dir, nome), "utf8"),
    })),
  );
}

const proprias = new Set<string>();
const hash = (texto: string) => createHash("sha1").update(texto).digest("hex");

/** Consome o registro: true na primeira checagem depois da nossa escrita, false depois. */
export function ehEscritaPropria(texto: string): boolean {
  return proprias.delete(hash(texto));
}

export async function escrever(caminho: string, texto: string): Promise<void> {
  proprias.add(hash(texto));
  const tmp = `${caminho}.tmp`;
  await writeFile(tmp, texto, "utf8");
  await rename(tmp, caminho);
}

export async function paraLixeira(dir: string, id: string): Promise<void> {
  const lixeira = join(dir, OCULTA, "trash");
  await mkdir(lixeira, { recursive: true });
  await rename(caminhoNo(dir, id), join(lixeira, `${id}-${Date.now()}.md`));
}

export async function lerLayout(dir: string): Promise<Layout> {
  try {
    return JSON.parse(await readFile(join(dir, OCULTA, "layout.json"), "utf8")) as Layout;
  } catch {
    return {};
  }
}

export async function gravarLayout(dir: string, layout: Layout): Promise<void> {
  await mkdir(join(dir, OCULTA), { recursive: true });
  // Uma linha por no e chaves ordenadas: diff de git legivel, merge resolvivel a mao.
  const linhas = Object.keys(layout)
    .sort()
    .map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify(layout[id])}`);
  await escrever(join(dir, OCULTA, "layout.json"), `{\n${linhas.join(",\n")}\n}\n`);
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --experimental-strip-types --test servidor/arquivos.test.ts`
Expected: PASS, 7 testes.

- [ ] **Step 5: Commit**

```bash
git add servidor/arquivos.ts servidor/arquivos.test.ts
git commit -m "feat(servidor): escrita atomica, lixeira e layout versionavel"
```

---

### Task 7: Rotas HTTP

**Files:**
- Create: `servidor/rotas.ts`
- Test: `servidor/rotas.test.ts`

Não existe rota de aresta: ligar A→B é `PATCH /api/no/B` com o `depende_de` novo.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// servidor/rotas.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarServidor } from "./rotas.ts";

async function subir() {
  const dir = await mkdtemp(join(tmpdir(), "grapy-rotas-"));
  await writeFile(join(dir, "_grafo.yaml"), "titulo: Onboarding\ncategoria: processo\n");
  await writeFile(join(dir, "01-a.md"), "---\ntitulo: A\nstatus: ativo\n---\ncorpo de A\n");
  await writeFile(join(dir, "02-b.md"), "---\ntitulo: B\ndepende_de:\n  - 01-a\n---\ncorpo de B\n");

  const servidor = criarServidor(dir);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  const porta = (servidor.address() as { port: number }).port;
  const base = `http://127.0.0.1:${porta}`;
  return { dir, base, fechar: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}

test("GET /api/grafo devolve nós, arestas e layout", async () => {
  const { base, fechar } = await subir();
  const r = await fetch(`${base}/api/grafo`);
  assert.equal(r.status, 200);
  const g = await r.json();
  assert.equal(g.titulo, "Onboarding");
  assert.equal(g.categoria.nome, "Processo");
  assert.equal(g.nos.length, 2);
  assert.deepEqual(g.arestas, [{ de: "01-a", para: "02-b" }]);
  assert.deepEqual(g.layout, {});
  await fechar();
});

test("GET /api/no/:id inclui o corpo", async () => {
  const { base, fechar } = await subir();
  const no = await (await fetch(`${base}/api/no/01-a`)).json();
  assert.equal(no.corpo, "corpo de A\n");
  assert.equal(no.campos.status, "ativo");
  await fechar();
});

test("GET /api/no com id de traversal é rejeitado", async () => {
  const { base, fechar } = await subir();
  const r = await fetch(`${base}/api/no/..%2F..%2Fetc%2Fpasswd`);
  assert.equal(r.status, 400);
  await fechar();
});

test("PATCH altera campo sem tocar no corpo", async () => {
  const { dir, base, fechar } = await subir();
  const r = await fetch(`${base}/api/no/01-a`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ campos: { status: "concluido" } }),
  });
  assert.equal(r.status, 200);
  const texto = await readFile(join(dir, "01-a.md"), "utf8");
  assert.match(texto, /status: concluido/);
  assert.ok(texto.endsWith("corpo de A\n"));
  await fechar();
});

test("PATCH de depende_de é como se liga uma aresta", async () => {
  const { base, fechar } = await subir();
  await fetch(`${base}/api/no/01-a`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ campos: { depende_de: ["02-b"] } }),
  });
  const g = await (await fetch(`${base}/api/grafo`)).json();
  assert.equal(g.arestas.length, 2);
  await fechar();
});

test("PUT corpo mantém o frontmatter", async () => {
  const { dir, base, fechar } = await subir();
  await fetch(`${base}/api/no/01-a/corpo`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ corpo: "novo corpo\n" }),
  });
  const texto = await readFile(join(dir, "01-a.md"), "utf8");
  assert.ok(texto.startsWith("---\ntitulo: A\nstatus: ativo\n---\n"));
  assert.ok(texto.endsWith("novo corpo\n"));
  await fechar();
});

test("POST cria nó a partir do template da categoria", async () => {
  const { dir, base, fechar } = await subir();
  const r = await fetch(`${base}/api/no`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ titulo: "Notificação" }),
  });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  assert.equal(id, "notificacao");
  const texto = await readFile(join(dir, "notificacao.md"), "utf8");
  assert.match(texto, /titulo: Notificação/);
  assert.match(texto, /status: rascunho/);
  await fechar();
});

test("POST com título repetido não sobrescreve", async () => {
  const { base, fechar } = await subir();
  const corpo = JSON.stringify({ titulo: "Repetido" });
  const cabecalho = { "content-type": "application/json" };
  const a = await (await fetch(`${base}/api/no`, { method: "POST", headers: cabecalho, body: corpo })).json();
  const b = await (await fetch(`${base}/api/no`, { method: "POST", headers: cabecalho, body: corpo })).json();
  assert.notEqual(a.id, b.id);
  await fechar();
});

test("DELETE move para a lixeira", async () => {
  const { dir, base, fechar } = await subir();
  const r = await fetch(`${base}/api/no/02-b`, { method: "DELETE" });
  assert.equal(r.status, 200);
  const lixo = await readdir(join(dir, ".grapydown", "trash"));
  assert.equal(lixo.length, 1);
  await fechar();
});

test("PUT layout grava e volta no GET /api/grafo", async () => {
  const { base, fechar } = await subir();
  await fetch(`${base}/api/layout`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ "01-a": { x: 5, y: 7 } }),
  });
  const g = await (await fetch(`${base}/api/grafo`)).json();
  assert.deepEqual(g.layout, { "01-a": { x: 5, y: 7 } });
  await fechar();
});

test("rota inexistente sob /api dá 404", async () => {
  const { base, fechar } = await subir();
  assert.equal((await fetch(`${base}/api/nada`)).status, 404);
  await fechar();
});
```

Note que `assert.deepEqual` das arestas espera `{ de, para }` sem `quando` quando ele é
`undefined` — `JSON.stringify` remove chave com valor `undefined`, então o que chega no
cliente já vem sem ela.

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `node --experimental-strip-types --test servidor/rotas.test.ts`
Expected: FAIL — `Cannot find module` para `./rotas.ts`.

- [ ] **Step 3: Implementar `servidor/rotas.ts`**

```ts
import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { construirGrafo } from "../core/grafo.ts";
import { parseNota, editarCampo, editarCorpo } from "../core/parse.ts";
import { parseCategoria, templateNo, idDeTitulo } from "../core/categoria.ts";
import {
  caminhoNo,
  escrever,
  gravarLayout,
  idValido,
  lerLayout,
  lerPasta,
  paraLixeira,
} from "./arquivos.ts";
import { assinarEventos } from "./watcher.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(RAIZ, "web", "dist");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res: ServerResponse, status: number, corpo: unknown): void {
  const texto = JSON.stringify(corpo);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(texto);
}

async function corpoJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const pedacos: Buffer[] = [];
  for await (const p of req) pedacos.push(p as Buffer);
  if (pedacos.length === 0) return {};
  return JSON.parse(Buffer.concat(pedacos).toString("utf8")) as Record<string, unknown>;
}

async function lerMeta(dir: string): Promise<{ titulo: string; categoria: string }> {
  try {
    const cru = (parseYaml(await readFile(join(dir, "_grafo.yaml"), "utf8")) ?? {}) as {
      titulo?: string;
      categoria?: string;
    };
    return { titulo: cru.titulo ?? "Sem título", categoria: cru.categoria ?? "processo" };
  } catch {
    return { titulo: "Sem título", categoria: "processo" };
  }
}

async function lerCategoria(nome: string) {
  try {
    return parseCategoria(await readFile(join(RAIZ, "categorias", `${nome}.yaml`), "utf8"));
  } catch {
    return parseCategoria("");
  }
}

async function servirEstatico(res: ServerResponse, caminho: string): Promise<void> {
  const alvo = caminho === "/" ? "/index.html" : caminho;
  try {
    const dados = await readFile(join(WEB, alvo));
    res.writeHead(200, { "content-type": MIME[extname(alvo)] ?? "application/octet-stream" });
    res.end(dados);
  } catch {
    try {
      res.writeHead(200, { "content-type": MIME[".html"] });
      res.end(await readFile(join(WEB, "index.html")));
    } catch {
      res.writeHead(404).end("não encontrado — rode `npm run build:web`");
    }
  }
}

export function criarServidor(dir: string): Server {
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    const rota = decodeURIComponent(url.pathname);
    const metodo = req.method ?? "GET";

    try {
      if (!rota.startsWith("/api/")) return await servirEstatico(res, rota);

      if (rota === "/api/eventos") return assinarEventos(res);

      if (rota === "/api/grafo" && metodo === "GET") {
        const meta = await lerMeta(dir);
        const grafo = construirGrafo(await lerPasta(dir));
        return json(res, 200, {
          titulo: meta.titulo,
          categoria: await lerCategoria(meta.categoria),
          nos: grafo.nos,
          arestas: grafo.arestas,
          fantasmas: grafo.fantasmas,
          layout: await lerLayout(dir),
        });
      }

      if (rota === "/api/layout" && metodo === "PUT") {
        const corpo = await corpoJson(req);
        await gravarLayout(dir, corpo as never);
        return json(res, 200, { ok: true });
      }

      if (rota === "/api/no" && metodo === "POST") {
        const { titulo } = (await corpoJson(req)) as { titulo?: string };
        if (!titulo) return json(res, 400, { erro: "titulo obrigatório" });
        const meta = await lerMeta(dir);
        const categoria = await lerCategoria(meta.categoria);
        const existentes = new Set((await lerPasta(dir)).map((a) => a.id));
        const base = idDeTitulo(titulo);
        let id = base;
        for (let n = 2; existentes.has(id); n++) id = `${base}-${n}`;
        await escrever(caminhoNo(dir, id), templateNo(categoria, titulo));
        return json(res, 201, { id });
      }

      const mNo = rota.match(/^\/api\/no\/([^/]+)(\/corpo)?$/);
      if (mNo) {
        const id = mNo[1];
        const ehCorpo = Boolean(mNo[2]);
        if (!idValido(id)) return json(res, 400, { erro: "id inválido" });

        if (metodo === "GET" && !ehCorpo) {
          const texto = await readFile(caminhoNo(dir, id), "utf8");
          const { doc, corpo, erro } = parseNota(texto);
          return json(res, 200, {
            id,
            campos: erro ? {} : (doc.toJS() ?? {}),
            corpo,
            erro,
          });
        }

        if (metodo === "PATCH" && !ehCorpo) {
          const { campos } = (await corpoJson(req)) as { campos?: Record<string, unknown> };
          if (!campos) return json(res, 400, { erro: "campos obrigatório" });
          let texto = await readFile(caminhoNo(dir, id), "utf8");
          for (const [chave, valor] of Object.entries(campos)) {
            texto = editarCampo(texto, chave, valor);
          }
          await escrever(caminhoNo(dir, id), texto);
          return json(res, 200, { ok: true });
        }

        if (metodo === "PUT" && ehCorpo) {
          const { corpo } = (await corpoJson(req)) as { corpo?: string };
          if (typeof corpo !== "string") return json(res, 400, { erro: "corpo obrigatório" });
          const texto = await readFile(caminhoNo(dir, id), "utf8");
          await escrever(caminhoNo(dir, id), editarCorpo(texto, corpo));
          return json(res, 200, { ok: true });
        }

        if (metodo === "DELETE" && !ehCorpo) {
          await paraLixeira(dir, id);
          return json(res, 200, { ok: true });
        }
      }

      return json(res, 404, { erro: "rota não encontrada" });
    } catch (e) {
      return json(res, 500, { erro: (e as Error).message });
    }
  });
}
```

- [ ] **Step 4: Criar o stub do watcher para o import resolver**

`rotas.ts` importa `assinarEventos`. A Task 8 preenche o resto do arquivo.

```ts
// servidor/watcher.ts
import type { ServerResponse } from "node:http";

const clientes = new Set<ServerResponse>();

export function assinarEventos(res: ServerResponse): void {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  res.write(": conectado\n\n");
  clientes.add(res);
  res.on("close", () => clientes.delete(res));
}

export function avisarTodos(): void {
  for (const res of clientes) res.write("event: grafo-mudou\ndata: {}\n\n");
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --experimental-strip-types --test servidor/rotas.test.ts`
Expected: PASS, 11 testes.

- [ ] **Step 6: Commit**

```bash
git add servidor/rotas.ts servidor/watcher.ts servidor/rotas.test.ts
git commit -m "feat(servidor): rotas http do grafo, nos, corpo e layout"
```

---

### Task 8: Watcher e CLI

**Files:**
- Modify: `servidor/watcher.ts` (acrescenta `observar`)
- Create: `servidor/index.ts`
- Create: `exemplo/onboarding/_grafo.yaml`
- Create: `exemplo/onboarding/01-solicitacao.md`
- Create: `exemplo/onboarding/02-aprovacao-gestor.md`
- Create: `exemplo/onboarding/03-provisionamento.md`

Verificação manual, não automatizada: testar chokidar de verdade exige `sleep` e fica
instável. O que dá para quebrar aqui (o laço watcher↔escrita) já tem teste unitário em
`arquivos.test.ts`.

- [ ] **Step 1: Acrescentar `observar` em `servidor/watcher.ts`**

Adicione ao fim do arquivo criado na Task 7:

```ts
import { watch } from "chokidar";
import { readFile } from "node:fs/promises";
import { ehEscritaPropria } from "./arquivos.ts";

export function observar(dir: string): void {
  watch(dir, { ignored: /(^|[/\\])\../, ignoreInitial: true, depth: 0 }).on(
    "all",
    async (evento, caminho) => {
      if (!caminho.endsWith(".md")) return;
      if (evento === "change" || evento === "add") {
        try {
          // Nossa propria escrita nao pode disparar reload — senao vira laco.
          if (ehEscritaPropria(await readFile(caminho, "utf8"))) return;
        } catch {
          return;
        }
      }
      avisarTodos();
    },
  );
}
```

E mova o `import type { ServerResponse }` para junto dos outros imports no topo.

- [ ] **Step 2: Criar `servidor/index.ts`**

```ts
#!/usr/bin/env -S node --experimental-strip-types
import { resolve } from "node:path";
import { criarServidor } from "./rotas.ts";
import { observar } from "./watcher.ts";

const [comando, alvo] = process.argv.slice(2);

if (comando !== "serve" || !alvo) {
  console.error("uso: grapydown serve <pasta>");
  process.exit(1);
}

const dir = resolve(alvo);
const porta = Number(process.env.PORTA ?? 5174);

observar(dir);
criarServidor(dir).listen(porta, () => {
  console.log(`grapydown  ${dir}\n           http://localhost:${porta}`);
});
```

- [ ] **Step 3: Criar o grafo de exemplo**

`exemplo/onboarding/_grafo.yaml`:

```yaml
titulo: Onboarding de colaborador
categoria: processo
```

`exemplo/onboarding/01-solicitacao.md`:

```md
---
titulo: Solicitação de acesso
responsavel: rh
prazo: 1d
status: ativo
depende_de: []
---
RH abre o chamado com nome, cargo e data de início.
```

`exemplo/onboarding/02-aprovacao-gestor.md`:

```md
---
titulo: Aprovação do gestor
responsavel: gestor-direto
prazo: 2d
status: ativo
depende_de:
  - 01-solicitacao
---
Gestor recebe email. SLA 2 dias úteis.

Se negar, volta para o RH com justificativa.
```

`exemplo/onboarding/03-provisionamento.md`:

```md
---
titulo: Provisionamento de contas
responsavel: ti
prazo: 1d
status: rascunho
depende_de:
  - { de: 02-aprovacao-gestor, quando: aprovado }
---
Cria conta no diretório, email e acessos do cargo.
```

- [ ] **Step 4: Verificar o servidor à mão**

Run:
```bash
node --experimental-strip-types servidor/index.ts serve exemplo/onboarding &
sleep 1
curl -s localhost:5174/api/grafo | head -c 400
```
Expected: JSON com `"titulo":"Onboarding de colaborador"` e três nós.

Depois, com o servidor no ar, edite `exemplo/onboarding/01-solicitacao.md` num editor e
confirme que o terminal do `curl -N localhost:5174/api/eventos` recebe `event: grafo-mudou`.
Encerre com `kill %1`.

- [ ] **Step 5: Commit**

```bash
git add servidor/watcher.ts servidor/index.ts exemplo/
git commit -m "feat(servidor): watcher com sse, cli serve e grafo de exemplo"
```

---

### Task 9: Scaffold do front

**Files:**
- Create: `web/vite.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`
- Create: `web/src/api.ts`
- Create: `web/src/estilo.css`

- [ ] **Step 1: Criar `web/vite.config.ts`**

Vite na 5173 fala com o servidor na 5174 via proxy. Em produção o próprio servidor entrega
`web/dist`, e o proxy deixa de existir.

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://localhost:5174", ws: false } },
  },
});
```

- [ ] **Step 2: Criar `web/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>grapydown</title>
  </head>
  <body>
    <div id="raiz"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Criar `web/src/api.ts`**

Um lugar só com `fetch`. Os tipos vêm do `core/`, então front e servidor não divergem.

```ts
import type { Aresta, Categoria, Layout, No } from "../../core/tipos.ts";

export type GrafoResposta = {
  titulo: string;
  categoria: Categoria;
  nos: No[];
  arestas: Aresta[];
  fantasmas: string[];
  layout: Layout;
};

export type NoDetalhe = {
  id: string;
  campos: Record<string, unknown>;
  corpo: string;
  erro?: string;
};

async function pedir<T>(rota: string, init?: RequestInit): Promise<T> {
  const r = await fetch(rota, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!r.ok) throw new Error(((await r.json()) as { erro?: string }).erro ?? `HTTP ${r.status}`);
  return (await r.json()) as T;
}

export const api = {
  grafo: () => pedir<GrafoResposta>("/api/grafo"),
  no: (id: string) => pedir<NoDetalhe>(`/api/no/${encodeURIComponent(id)}`),
  criarNo: (titulo: string) =>
    pedir<{ id: string }>("/api/no", { method: "POST", body: JSON.stringify({ titulo }) }),
  patchNo: (id: string, campos: Record<string, unknown>) =>
    pedir<{ ok: true }>(`/api/no/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ campos }),
    }),
  putCorpo: (id: string, corpo: string) =>
    pedir<{ ok: true }>(`/api/no/${encodeURIComponent(id)}/corpo`, {
      method: "PUT",
      body: JSON.stringify({ corpo }),
    }),
  apagarNo: (id: string) =>
    pedir<{ ok: true }>(`/api/no/${encodeURIComponent(id)}`, { method: "DELETE" }),
  putLayout: (layout: Layout) =>
    pedir<{ ok: true }>("/api/layout", { method: "PUT", body: JSON.stringify(layout) }),
};
```

- [ ] **Step 4: Criar `web/src/estilo.css`**

```css
:root { font-family: system-ui, sans-serif; }
body { margin: 0; }
#raiz, .tela { width: 100vw; height: 100vh; }

.modal-fundo {
  position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4);
  display: flex; align-items: center; justify-content: center; z-index: 10;
}
.modal {
  background: #fff; border-radius: 10px; padding: 24px;
  width: min(640px, 92vw); max-height: 85vh; overflow: auto;
}
.modal h2 { margin: 0 0 16px; }
.modal label { display: block; margin: 12px 0 4px; font-size: 13px; color: #555; }
.modal input, .modal select, .modal textarea {
  width: 100%; padding: 8px; border: 1px solid #d4d4d8; border-radius: 6px;
  font: inherit; box-sizing: border-box;
}
.modal textarea { min-height: 180px; font-family: ui-monospace, monospace; }
.modal-acoes { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
.modal button { padding: 8px 16px; border-radius: 6px; border: 1px solid #d4d4d8; cursor: pointer; }
.perigo { color: #dc2626; border-color: #fca5a5; }
.erro { color: #dc2626; font-size: 13px; margin-top: 8px; }
.barra {
  position: absolute; top: 12px; left: 12px; z-index: 5;
  background: #fff; padding: 8px 12px; border-radius: 8px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.15); display: flex; gap: 12px; align-items: center;
}
```

- [ ] **Step 5: Criar `web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@xyflow/react/dist/style.css";
import "./estilo.css";
import { App } from "./App.tsx";

createRoot(document.getElementById("raiz")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 6: Commit**

Ainda não roda — `App.tsx` chega na Task 11.

```bash
git add web/
git commit -m "feat(web): scaffold vite, cliente http e estilos"
```

---

### Task 10: Nó e aresta desenhados com rough.js

**Files:**
- Create: `web/src/rough.ts`
- Create: `web/src/NoProcesso.tsx`
- Create: `web/src/ArestaRough.tsx`

O ponto crítico é performance: se o rough.js regerar o desenho a cada frame do arrasto, o
canvas trava. Dois cuidados, ambos no código abaixo: `seed` derivado do id (estável entre
renders, senão o desenho treme) e `useMemo` nas dependências que realmente mudam a forma.

- [ ] **Step 1: Criar `web/src/rough.ts`**

```ts
import rough from "roughjs";
import type { Options } from "roughjs/bin/core";

const gerador = rough.generator();

/** Seed estável por id: sem isso o traço muda a cada render e o nó "treme". */
export function seedDoId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2 ** 31;
}

export type Traco = { d: string; stroke: string; fill: string; strokeWidth: number };

function paraTracos(desenho: ReturnType<typeof gerador.rectangle>): Traco[] {
  return gerador.toPaths(desenho).map((p) => ({
    d: p.d,
    stroke: p.stroke ?? "none",
    fill: p.fill ?? "none",
    strokeWidth: p.strokeWidth ?? 1,
  }));
}

export function retangulo(
  largura: number,
  altura: number,
  opcoes: Options,
): Traco[] {
  return paraTracos(gerador.rectangle(1, 1, largura - 2, altura - 2, opcoes));
}

export function caminho(d: string, opcoes: Options): Traco[] {
  return paraTracos(gerador.path(d, opcoes));
}
```

- [ ] **Step 2: Criar `web/src/NoProcesso.tsx`**

```tsx
import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { retangulo, seedDoId } from "./rough.ts";

export const LARGURA = 200;
export const ALTURA = 76;

export type DadosNo = {
  titulo: string;
  cor: string;
  fantasma: boolean;
  erro?: string;
};

function Componente({ id, data, selected }: NodeProps) {
  const { titulo, cor, fantasma, erro } = data as DadosNo;
  const seed = useMemo(() => seedDoId(id), [id]);

  // Depende so do que muda a forma. Arrastar move por transform CSS e nao re-desenha.
  const tracos = useMemo(
    () =>
      retangulo(LARGURA, ALTURA, {
        seed,
        roughness: 1.4,
        bowing: 1.2,
        stroke: erro ? "#dc2626" : cor,
        strokeWidth: selected ? 3 : 2,
        fill: fantasma || erro ? undefined : `${cor}18`,
        fillStyle: "solid",
        strokeLineDash: fantasma || erro ? [8, 6] : undefined,
      }),
    [seed, cor, selected, fantasma, erro],
  );

  return (
    <div style={{ width: LARGURA, height: ALTURA, position: "relative" }}>
      <Handle type="target" position={Position.Top} />
      <svg width={LARGURA} height={ALTURA} style={{ position: "absolute", inset: 0 }}>
        {tracos.map((t, i) => (
          <path key={i} d={t.d} stroke={t.stroke} fill={t.fill} strokeWidth={t.strokeWidth} />
        ))}
      </svg>
      <div
        style={{
          position: "relative",
          padding: "12px 14px",
          fontSize: 14,
          lineHeight: 1.3,
          color: erro ? "#dc2626" : "#18181b",
          pointerEvents: "none",
        }}
      >
        <strong>{titulo}</strong>
        {erro ? <div style={{ fontSize: 11, marginTop: 4 }}>YAML inválido</div> : null}
        {fantasma ? <div style={{ fontSize: 11, marginTop: 4 }}>arquivo não existe</div> : null}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const NoProcesso = memo(Componente);
```

- [ ] **Step 3: Criar `web/src/ArestaRough.tsx`**

```tsx
import { memo, useMemo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { caminho, seedDoId } from "./rough.ts";

function Componente({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
}: EdgeProps) {
  const [d, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const tracos = useMemo(
    () => caminho(d, { seed: seedDoId(id), roughness: 1.1, bowing: 0.8, stroke: "#52525b" }),
    [d, id],
  );

  return (
    <>
      {tracos.map((t, i) => (
        <BaseEdge key={i} path={t.d} markerEnd={i === 0 ? markerEnd : undefined} />
      ))}
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: "#fff",
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
              color: "#52525b",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const ArestaRough = memo(Componente);
```

- [ ] **Step 4: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem saída.

- [ ] **Step 5: Commit**

```bash
git add web/src/rough.ts web/src/NoProcesso.tsx web/src/ArestaRough.tsx
git commit -m "feat(web): no e aresta desenhados com rough.js e memoizados"
```

---

### Task 11: Canvas — carregar, posicionar, arrastar, ligar

**Files:**
- Create: `web/src/layoutAuto.ts`
- Create: `web/src/App.tsx`

- [ ] **Step 1: Criar `web/src/layoutAuto.ts`**

```ts
import dagre from "@dagrejs/dagre";
import type { Aresta, Layout } from "../../core/tipos.ts";
import { ALTURA, LARGURA } from "./NoProcesso.tsx";

/** Calcula posição só para os ids sem posição salva. Quem já tem, não se mexe. */
export function completarLayout(ids: string[], arestas: Aresta[], salvo: Layout): Layout {
  const faltando = ids.filter((id) => !salvo[id]);
  if (faltando.length === 0) return salvo;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of ids) g.setNode(id, { width: LARGURA, height: ALTURA });
  for (const a of arestas) if (g.hasNode(a.de) && g.hasNode(a.para)) g.setEdge(a.de, a.para);
  dagre.layout(g);

  const saida: Layout = { ...salvo };
  for (const id of faltando) {
    const n = g.node(id);
    saida[id] = { x: Math.round(n.x - LARGURA / 2), y: Math.round(n.y - ALTURA / 2) };
  }
  return saida;
}
```

- [ ] **Step 2: Criar `web/src/App.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  applyNodeChanges,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type { Layout } from "../../core/tipos.ts";
import { api, type GrafoResposta } from "./api.ts";
import { NoProcesso, type DadosNo } from "./NoProcesso.tsx";
import { ArestaRough } from "./ArestaRough.tsx";
import { completarLayout } from "./layoutAuto.ts";
import { Modal } from "./Modal.tsx";

const tiposNo = { processo: NoProcesso };
const tiposAresta = { rough: ArestaRough };

function corDoNo(g: GrafoResposta, campos: Record<string, unknown>): string {
  const chave = g.categoria.cor_por;
  const valor = chave ? String(campos[chave] ?? "") : "";
  return g.categoria.cores?.[valor] ?? "#52525b";
}

function montar(g: GrafoResposta, layout: Layout): { nos: Node[]; arestas: Edge[] } {
  const reais = new Set(g.nos.map((n) => n.id));
  const nos: Node[] = g.nos.map((n) => ({
    id: n.id,
    type: "processo",
    position: layout[n.id] ?? { x: 0, y: 0 },
    data: { titulo: n.titulo, cor: corDoNo(g, n.campos), fantasma: false, erro: n.erro } as DadosNo,
  }));
  for (const id of g.fantasmas) {
    if (reais.has(id)) continue;
    nos.push({
      id,
      type: "processo",
      position: layout[id] ?? { x: 0, y: 0 },
      data: { titulo: id, cor: "#dc2626", fantasma: true } as DadosNo,
    });
  }
  const arestas: Edge[] = g.arestas.map((a) => ({
    id: `${a.de}->${a.para}`,
    source: a.de,
    target: a.para,
    type: "rough",
    label: a.quando,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#52525b" },
  }));
  return { nos, arestas };
}

export function App() {
  const [grafo, setGrafo] = useState<GrafoResposta | null>(null);
  const [nos, setNos] = useState<Node[]>([]);
  const [arestas, setArestas] = useState<Edge[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const timerLayout = useRef<number | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const g = await api.grafo();
      const ids = [...g.nos.map((n) => n.id), ...g.fantasmas];
      const layout = completarLayout(ids, g.arestas, g.layout);
      const montado = montar(g, layout);
      setGrafo(g);
      setNos(montado.nos);
      setArestas(montado.arestas);
      setFalha(null);
      if (Object.keys(layout).length !== Object.keys(g.layout).length) {
        await api.putLayout(layout);
      }
    } catch (e) {
      setFalha((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const fonte = new EventSource("/api/eventos");
    fonte.addEventListener("grafo-mudou", () => void carregar());
    return () => fonte.close();
  }, [carregar]);

  const aoMudarNos = useCallback((mudancas: NodeChange[]) => {
    setNos((atuais) => {
      const proximos = applyNodeChanges(mudancas, atuais);
      if (mudancas.some((m) => m.type === "position" && m.dragging === false)) {
        clearTimeout(timerLayout.current);
        timerLayout.current = window.setTimeout(() => {
          const layout: Layout = {};
          for (const n of proximos) layout[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
          void api.putLayout(layout).catch((e: Error) => setFalha(e.message));
        }, 500);
      }
      return proximos;
    });
  }, []);

  const aoConectar = useCallback(
    async ({ source, target }: Connection) => {
      if (!source || !target || source === target || !grafo) return;
      const alvo = grafo.nos.find((n) => n.id === target);
      if (!alvo) return;
      const atual = Array.isArray(alvo.campos.depende_de) ? alvo.campos.depende_de : [];
      if (atual.some((a) => a === source || (a as { de?: string })?.de === source)) return;
      try {
        await api.patchNo(target, { depende_de: [...atual, source] });
        await carregar();
      } catch (e) {
        setFalha((e as Error).message);
      }
    },
    [grafo, carregar],
  );

  const aoCriar = useCallback(async () => {
    const titulo = window.prompt("Título do novo passo:");
    if (!titulo?.trim()) return;
    try {
      await api.criarNo(titulo.trim());
      await carregar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }, [carregar]);

  return (
    <div className="tela">
      <div className="barra">
        <strong>{grafo?.titulo ?? "carregando…"}</strong>
        <button onClick={() => void aoCriar()}>+ passo</button>
        {falha ? <span className="erro">{falha}</span> : null}
      </div>
      <ReactFlow
        nodes={nos}
        edges={arestas}
        nodeTypes={tiposNo}
        edgeTypes={tiposAresta}
        onNodesChange={aoMudarNos}
        onConnect={(c) => void aoConectar(c)}
        onNodeClick={(_, no) => setAberto(no.id)}
        onPaneClick={() => setAberto(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      {aberto && grafo ? (
        <Modal
          id={aberto}
          categoria={grafo.categoria}
          aoFechar={() => setAberto(null)}
          aoMudar={() => void carregar()}
        />
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

`Modal.tsx` chega na Task 12; o app ainda não compila.

```bash
git add web/src/layoutAuto.ts web/src/App.tsx
git commit -m "feat(web): canvas com layout dagre, arrasto persistido e conexao"
```

---

### Task 12: Modal de detalhe

**Files:**
- Create: `web/src/Modal.tsx`

- [ ] **Step 1: Criar `web/src/Modal.tsx`**

```tsx
import { useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import type { Categoria } from "../../core/tipos.ts";
import { api, type NoDetalhe } from "./api.ts";

const md = new MarkdownIt({ html: false, linkify: true });

type Props = {
  id: string;
  categoria: Categoria;
  aoFechar: () => void;
  aoMudar: () => void;
};

export function Modal({ id, categoria, aoFechar, aoMudar }: Props) {
  const [no, setNo] = useState<NoDetalhe | null>(null);
  const [editandoCorpo, setEditandoCorpo] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    setNo(null);
    setEditandoCorpo(false);
    api.no(id).then(setNo).catch((e: Error) => setFalha(e.message));
  }, [id]);

  async function salvarCampo(chave: string, valor: string) {
    try {
      await api.patchNo(id, { [chave]: valor });
      setNo(await api.no(id));
      aoMudar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  async function salvarCorpo() {
    try {
      await api.putCorpo(id, rascunho.endsWith("\n") ? rascunho : `${rascunho}\n`);
      setNo(await api.no(id));
      setEditandoCorpo(false);
      aoMudar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  async function apagar() {
    if (!window.confirm(`Mover "${id}" para a lixeira?`)) return;
    try {
      await api.apagarNo(id);
      aoMudar();
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!no ? (
          <p>carregando…</p>
        ) : no.erro ? (
          <>
            <h2>{id}</h2>
            <p className="erro">Frontmatter inválido: {no.erro}</p>
            <p>Corrija o arquivo <code>{id}.md</code> num editor de texto.</p>
          </>
        ) : (
          <>
            <h2>{String(no.campos.titulo ?? id)}</h2>

            <label htmlFor="campo-titulo">titulo</label>
            <input
              id="campo-titulo"
              defaultValue={String(no.campos.titulo ?? "")}
              onBlur={(e) => void salvarCampo("titulo", e.target.value)}
            />

            {categoria.campos.map((campo) => {
              const valor = String(no.campos[campo.chave] ?? "");
              return (
                <div key={campo.chave}>
                  <label htmlFor={`campo-${campo.chave}`}>{campo.chave}</label>
                  {campo.tipo === "enum" ? (
                    <select
                      id={`campo-${campo.chave}`}
                      defaultValue={valor}
                      onChange={(e) => void salvarCampo(campo.chave, e.target.value)}
                    >
                      {(campo.opcoes ?? []).map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`campo-${campo.chave}`}
                      defaultValue={valor}
                      onBlur={(e) => void salvarCampo(campo.chave, e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            <label>detalhe</label>
            {editandoCorpo ? (
              <>
                <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} />
                <div className="modal-acoes">
                  <button onClick={() => setEditandoCorpo(false)}>cancelar</button>
                  <button onClick={() => void salvarCorpo()}>salvar detalhe</button>
                </div>
              </>
            ) : (
              <div
                onDoubleClick={() => {
                  setRascunho(no.corpo);
                  setEditandoCorpo(true);
                }}
                dangerouslySetInnerHTML={{ __html: md.render(no.corpo) }}
              />
            )}

            {falha ? <p className="erro">{falha}</p> : null}

            <div className="modal-acoes">
              <button className="perigo" onClick={() => void apagar()}>apagar passo</button>
              <button onClick={aoFechar}>fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

Campo de texto salva no `onBlur`, `select` no `onChange` — sem botão "salvar" por campo e
sem debounce. `dangerouslySetInnerHTML` é seguro aqui porque o markdown-it está com
`html: false` e o conteúdo vem de arquivo local do próprio usuário.

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit`
Expected: sem saída.

- [ ] **Step 3: Verificar o app inteiro à mão**

Run, em dois terminais:
```bash
node --experimental-strip-types servidor/index.ts serve exemplo/onboarding
npm run dev:web
```

Abra `http://localhost:5173` e confirme, um a um:

1. Três nós aparecem em layout vertical, traço à mão, cor por `status`.
2. Arrastar um nó e recarregar a página: ele continua onde foi solto.
3. `git status` mostra `exemplo/onboarding/.grapydown/layout.json` mudado — e nenhum `.md` mudado.
4. Puxar o handle de baixo de `01-solicitacao` até `03-provisionamento` cria a aresta, e `03-provisionamento.md` ganha a entrada em `depende_de` sem perder o resto do arquivo.
5. Clicar num nó abre o modal com os campos e o corpo renderizado.
6. Trocar `status` para `bloqueado` deixa o nó vermelho no canvas.
7. Duplo-clique no detalhe, editar, salvar: o corpo muda e o frontmatter fica idêntico.
8. `+ passo` cria arquivo novo já com os campos da categoria.
9. Apagar move o arquivo para `.grapydown/trash/`.
10. Editar um `.md` num editor de texto atualiza o canvas sozinho.

- [ ] **Step 4: Commit**

```bash
git add web/src/Modal.tsx
git commit -m "feat(web): modal de detalhe com edicao de campos e corpo"
```

---

### Task 13: Suíte completa, build e README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS em todos os arquivos de `core/` e `servidor/`.

- [ ] **Step 2: Verificar o build de produção servido pelo próprio servidor**

Run:
```bash
npm run build:web
node --experimental-strip-types servidor/index.ts serve exemplo/onboarding
```
Expected: `http://localhost:5174` abre o app completo, sem Vite rodando.

- [ ] **Step 3: Criar `README.md`**

````markdown
# grapydown

Editor local de grafos de processo. Cada nó é um arquivo `.md`; o markdown é a fonte da
verdade. O canvas desenha com traço à mão, e clicar num nó abre os dados estruturados.

## Requisitos

Node 22.18 ou maior (`node --version`).

## Uso

```bash
npm install
npm run build:web
node --experimental-strip-types servidor/index.ts serve exemplo/onboarding
```

Abre em `http://localhost:5174`.

Desenvolvimento, com recarga do front:

```bash
node --experimental-strip-types servidor/index.ts serve exemplo/onboarding   # terminal 1
npm run dev:web                                   # terminal 2, abre em :5173
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
npm test
```
````

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: readme com uso, formato de arquivo e categorias"
```

---

## Cobertura do spec

| Requisito do spec | Task |
|---|---|
| Layout em disco, `_grafo.yaml`, `.grapydown/` | 6, 8 |
| Id = nome do arquivo | 4, 6 |
| Aresta no destino, string ou objeto com `quando` | 4 |
| `layout.json` ordenado e versionado | 1, 6 |
| Categoria como YAML, sem framework | 5 |
| `core/` puro, sem I/O | 3, 4, 5 |
| Todas as rotas HTTP | 7 |
| Sem rota de aresta (PATCH em `depende_de`) | 7, 11 |
| Escrita atômica | 6 |
| Sem laço watcher↔escrita | 6, 8 |
| Delete vai para lixeira | 6, 12 |
| Nó fantasma para referência quebrada | 4, 11 |
| YAML inválido isola o nó | 4, 12 |
| Ciclo permitido | 4 |
| `_grafo.yaml` ausente tem padrão | 7 |
| Path traversal rejeitado | 6, 7 |
| Dagre só para nó sem posição | 11 |
| rough.js memoizado, seed estável | 10 |
| Os 5 testes obrigatórios do spec | 3, 4 |

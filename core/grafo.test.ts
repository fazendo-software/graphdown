import { test } from "node:test";
import assert from "node:assert/strict";
import { comoLista, construirGrafo, normalizarAresta } from "./grafo.ts";

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

test("comoLista trata escalar como lista de um item", () => {
  // Quem consome depende_de (inclusive o front, ao ligar/desligar) tem que passar por aqui:
  // ler direto com Array.isArray trataria `depende_de: a` como vazio e apagaria a aresta.
  assert.deepEqual(comoLista("a"), ["a"]);
  assert.deepEqual(comoLista(["a", "b"]), ["a", "b"]);
  assert.deepEqual(comoLista(undefined), []);
  assert.deepEqual(comoLista(null), []);
});

test("depende_de escalar vira aresta", () => {
  const g = construirGrafo([no("a", "titulo: A"), no("b", "titulo: B\ndepende_de: a")]);
  assert.deepEqual(g.arestas, [{ de: "a", para: "b", quando: undefined }]);
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

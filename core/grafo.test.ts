import { test } from "node:test";
import assert from "node:assert/strict";
import { comoLista, normalizarAresta } from "./grafo.ts";

test("normalizarAresta aceita string", () => {
  assert.deepEqual(normalizarAresta("a"), {
    de: "a",
    quando: undefined,
    tipo: undefined,
    campos: {},
  });
});

test("normalizarAresta aceita objeto com rótulo", () => {
  assert.deepEqual(normalizarAresta({ de: "a", quando: "rejeitado" }), {
    de: "a",
    quando: "rejeitado",
    tipo: undefined,
    campos: {},
  });
});

test("normalizarAresta preserva o tipo", () => {
  assert.deepEqual(normalizarAresta({ de: "a", tipo: "excecao" }), {
    de: "a",
    quando: undefined,
    tipo: "excecao",
    campos: {},
  });
});

test("normalizarAresta carrega os recursos sem saber o nome deles", () => {
  // O core nao conhece "prazo" nem "custo": quem declara isso e a categoria.
  assert.deepEqual(normalizarAresta({ de: "a", prazo: "2d", custo: "R$ 100" })?.campos, {
    prazo: "2d",
    custo: "R$ 100",
  });
});

test("normalizarAresta descarta tipo que não é string", () => {
  assert.equal(normalizarAresta({ de: "a", tipo: 42 })?.tipo, undefined);
});

test("normalizarAresta descarta lixo", () => {
  assert.equal(normalizarAresta(42), null);
  assert.equal(normalizarAresta({ sem: "de" }), null);
});

test("comoLista trata escalar como lista de um item", () => {
  assert.deepEqual(comoLista("a"), ["a"]);
  assert.deepEqual(comoLista(["a", "b"]), ["a", "b"]);
  assert.deepEqual(comoLista(undefined), []);
  assert.deepEqual(comoLista(null), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { lerDeps, paraFrontmatter } from "./deps.ts";

test("dependência sem rótulo, tipo nem recurso colapsa para string", () => {
  assert.equal(paraFrontmatter({ de: "01-a", campos: {} }), "01-a");
  assert.equal(paraFrontmatter({ de: "01-a", campos: { prazo: "", custo: "  " } }), "01-a");
});

test("campo de recurso vazio não é gravado", () => {
  assert.deepEqual(paraFrontmatter({ de: "01-a", campos: { prazo: "2d", custo: "" } }), {
    de: "01-a",
    prazo: "2d",
  });
});

test("rótulo, tipo e recursos saem juntos no objeto", () => {
  assert.deepEqual(
    paraFrontmatter({
      de: "01-a",
      quando: "aprovado",
      tipo: "excecao",
      campos: { prazo: "2d", pessoas: "2 analistas" },
    }),
    { de: "01-a", quando: "aprovado", tipo: "excecao", prazo: "2d", pessoas: "2 analistas" },
  );
});

test("lerDeps aceita string, objeto e escalar, e ida-e-volta preserva tudo", () => {
  const original = ["01-a", { de: "02-b", quando: "ok", prazo: "3d" }];
  const lista = lerDeps({ depende_de: original });
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map(paraFrontmatter), original);
});

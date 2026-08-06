import { test } from "node:test";
import assert from "node:assert/strict";
import { arestasInternas, deveProcessarAtalhoCanvas, ehAtivacaoPorTeclado, posicaoColada } from "./interacoesCanvas.ts";

test("copiar dois nós leva toda aresta cujas pontas estão na seleção", () => {
  const arestas = [
    { id: "interna", source: "a", target: "b" },
    { id: "externa", source: "b", target: "c" },
  ];
  assert.deepEqual(arestasInternas(arestas, new Set(["a", "b"])).map((a) => a.id), ["interna"]);
});

test("colar desloca o conjunto sem normalizar a posição para a origem", () => {
  assert.deepEqual(posicaoColada({ x: 500, y: 300 }), { x: 540, y: 340 });
});

test("atalhos só pertencem ao canvas ativo e sem edição/seleção textual", () => {
  assert.equal(deveProcessarAtalhoCanvas(true, false, false), true);
  assert.equal(deveProcessarAtalhoCanvas(false, false, false), false);
  assert.equal(deveProcessarAtalhoCanvas(true, true, false), false);
  assert.equal(deveProcessarAtalhoCanvas(true, false, true), false);
});

test("a roda aceita a ativação sem mouse de Enter ou Espaço", () => {
  assert.equal(ehAtivacaoPorTeclado(0), true);
  assert.equal(ehAtivacaoPorTeclado(1), false);
});

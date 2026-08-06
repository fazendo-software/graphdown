import { test } from "node:test";
import assert from "node:assert/strict";
import { ANGULOS_OBJETO, anguloCategoria, RAIO_OBJETO } from "./rodaGeometria.ts";

const GRAU = Math.PI / 180;

test("categorias se distribuem igualmente, começando no topo", () => {
  const n = 5;
  const angs = Array.from({ length: n }, (_, i) => anguloCategoria(i, n));
  assert.equal(angs[0], -Math.PI / 2, "primeira categoria fica em cima");
  for (let i = 1; i < n; i++) {
    assert.ok(Math.abs(angs[i] - angs[i - 1] - (2 * Math.PI) / n) < 1e-9, "passo desigual");
  }
});

test("objeto único fica exatamente sobre a categoria que o abriu", () => {
  const centro = anguloCategoria(2, 5);
  assert.ok(Math.abs(ANGULOS_OBJETO(1, centro)[0] - centro) < 1e-9);
});

test("vários objetos ficam simétricos em torno da categoria", () => {
  const centro = anguloCategoria(0, 5);
  for (const n of [2, 3, 7, 11]) {
    const angs = ANGULOS_OBJETO(n, centro);
    const medio = angs.reduce((a, b) => a + b, 0) / n;
    assert.ok(Math.abs(medio - centro) < 1e-9, `n=${n}: arco não centrado na categoria`);
  }
});

test("o arco nunca fecha o círculo, nem com a maior categoria", () => {
  // 11 é o tamanho de Processo hoje; 40 é folga para o catálogo crescer.
  for (const n of [11, 20, 40]) {
    const angs = ANGULOS_OBJETO(n, 0);
    const largura = angs[angs.length - 1] - angs[0];
    assert.ok(largura < 2 * Math.PI - 20 * GRAU, `n=${n}: primeiro e último se encostam`);
  }
});

test("objetos não se sobrepõem enquanto couberem no arco", () => {
  // 148px de raio e item de ~64px: até ~14 itens o passo tem de superar a largura do item.
  const angs = ANGULOS_OBJETO(9, 0);
  const separacao = (angs[1] - angs[0]) * RAIO_OBJETO;
  assert.ok(separacao > 64, `itens a ${separacao.toFixed(0)}px de distância, item tem ~64px`);
});

test("quantidade zero não gera item nem quebra", () => {
  assert.deepEqual(ANGULOS_OBJETO(0, 0), []);
});

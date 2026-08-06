import { test } from "node:test";
import assert from "node:assert/strict";
import { tamanhoProporcional } from "./tamanhoProporcional.ts";

function proporcao({ largura, altura }: { largura: number; altura: number }) {
  return largura / altura;
}

test("limitar largura pelo mínimo preserva a proporção", () => {
  const tamanho = tamanhoProporcional({ largura: 200, altura: 106 }, "largura", 20);
  assert.deepEqual(tamanho, { largura: 38, altura: 20 });
  assert.ok(Math.abs(proporcao(tamanho) - 200 / 106) < 0.03);
});

test("limitar altura pelo máximo preserva a proporção", () => {
  const tamanho = tamanhoProporcional({ largura: 200, altura: 106 }, "altura", 1000);
  assert.deepEqual(tamanho, { largura: 1000, altura: 530 });
  assert.ok(Math.abs(proporcao(tamanho) - 200 / 106) < 0.01);
});

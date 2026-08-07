import assert from "node:assert/strict";
import { test } from "node:test";
import { ehTipoObjetoSeta, pontosObjetoSetaValidos } from "./objetosSeta.ts";

test("objeto de seta só aceita as cinco variantes conhecidas", () => {
  assert.equal(ehTipoObjetoSeta("linha"), true);
  assert.equal(ehTipoObjetoSeta("divisor"), true);
  assert.equal(ehTipoObjetoSeta("curva"), false);
});

test("divisor tem somente dois extremos; demais setas exigem três pontos finitos", () => {
  const dois = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  assert.equal(pontosObjetoSetaValidos(dois, "divisor"), true);
  assert.equal(pontosObjetoSetaValidos([...dois, { x: 2, y: 2 }], "divisor"), false);
  assert.equal(pontosObjetoSetaValidos(dois, "seta"), false);
  assert.equal(pontosObjetoSetaValidos([...dois, { x: Number.NaN, y: 2 }], "linha"), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { criarLimitador } from "./limitador.ts";

test("primeira chamada sempre passa", () => {
  const pode = criarLimitador(33);
  assert.equal(pode(1000), true);
});

test("chamada dentro do intervalo é bloqueada", () => {
  const pode = criarLimitador(33);
  assert.equal(pode(1000), true);
  assert.equal(pode(1010), false);
  assert.equal(pode(1032), false);
});

test("chamada após o intervalo passa e reinicia a janela", () => {
  const pode = criarLimitador(33);
  assert.equal(pode(1000), true);
  assert.equal(pode(1033), true);
  assert.equal(pode(1034), false);
  assert.equal(pode(1067), true);
});

test("~30/s deixa passar no máximo 30 chamadas por segundo corrido", () => {
  const intervalo = 1000 / 30;
  const pode = criarLimitador(intervalo);
  let aceitas = 0;
  for (let t = 0; t <= 1000; t += 1) if (pode(t)) aceitas++;
  assert.ok(aceitas <= 31, `aceitou demais: ${aceitas}`);
  assert.ok(aceitas >= 29, `aceitou de menos: ${aceitas}`);
});

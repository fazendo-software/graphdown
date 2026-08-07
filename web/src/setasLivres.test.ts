import assert from "node:assert/strict";
import { test } from "node:test";
import {
  caixaDosPontos,
  inserirVertice,
  meiosDosSegmentos,
  pontosDoCotovelo,
  pontosIniciais,
  pontosSaoValidos,
} from "./setasLivres.ts";

test("linha começa com três pontos e divisor fica limitado aos dois extremos", () => {
  assert.equal(pontosIniciais("linha", { x: 0, y: 0 }).length, 3);
  assert.equal(pontosIniciais("seta", { x: 0, y: 0 }).length, 3);
  assert.equal(pontosIniciais("divisor", { x: 0, y: 0 }).length, 2);
});

test("promover controle central adiciona vértice e cria novos meios", () => {
  const pontos = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }];
  const comVertice = inserirVertice(pontos, 1, { x: 150, y: 40 });
  assert.equal(comVertice.length, 4);
  assert.deepEqual(meiosDosSegmentos(comVertice), [
    { x: 50, y: 0 },
    { x: 125, y: 20 },
    { x: 175, y: 20 },
  ]);
});

test("cotovelo converte trecho diagonal em dois segmentos ortogonais", () => {
  assert.deepEqual(pontosDoCotovelo([{ x: 0, y: 0 }, { x: 100, y: 80 }]), [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 80 },
  ]);
});

test("caixa preserva margem de edição e valida cardinalidade por variante", () => {
  const caixa = caixaDosPontos([{ x: 10, y: 10 }, { x: 20, y: 10 }]);
  assert.ok(caixa.largura >= 96 && caixa.altura >= 96);
  assert.equal(pontosSaoValidos([{ x: 0, y: 0 }, { x: 1, y: 1 }], "divisor"), true);
  assert.equal(pontosSaoValidos([{ x: 0, y: 0 }, { x: 1, y: 1 }], "linha"), false);
});

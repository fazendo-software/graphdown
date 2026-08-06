import assert from "node:assert/strict";
import test from "node:test";
import {
  ErroExportacaoVisual,
  calcularLimitesExportacao,
  planejarRasterizacao,
} from "./exportacaoVisual.ts";

test("limites incluem margem ao redor de nós, notas e rótulos", () => {
  assert.deepEqual(
    calcularLimitesExportacao([
      { x: 20, y: 40, largura: 100, altura: 80 },
      { x: -30, y: 100, largura: 40, altura: 50 },
    ], 10),
    { x: -40, y: 30, largura: 170, altura: 130 },
  );
});

test("rasterização prefere 2x e reduz para 1x antes de falhar", () => {
  assert.equal(planejarRasterizacao({ largura: 100, altura: 100 }, 40_000).escala, 2);
  assert.equal(planejarRasterizacao({ largura: 150, altura: 150 }, 40_000).escala, 1);
});

test("recorte acima do limite recebe orientação explícita", () => {
  assert.throws(
    () => planejarRasterizacao({ largura: 300, altura: 300 }, 40_000),
    (erro: unknown) => erro instanceof ErroExportacaoVisual && /Reduza a seleção/.test(erro.message),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { TAMANHOS, desenharForma, seedDoId, tamanhoDe } from "./rough.ts";

const FORMAS = Object.keys(TAMANHOS);

/** Todos os números que aparecem no path, em pares (x, y). */
function pontos(d: string): [number, number][] {
  const nums = (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  const pares: [number, number][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) pares.push([nums[i], nums[i + 1]]);
  return pares;
}

test("toda forma declarada desenha alguma coisa", () => {
  for (const forma of FORMAS) {
    const tracos = desenharForma(forma, { seed: 1 });
    assert.ok(tracos.length > 0, `${forma} não gerou traço`);
    assert.ok(
      tracos.every((t) => t.d.length > 0),
      `${forma} gerou path vazio`,
    );
  }
});

test("o desenho cabe dentro do box da forma", () => {
  // rough borra a linha pra fora do contorno nominal; a folga cobre isso, mas pega
  // geometria trocada (ponto fora por dezenas de px).
  const FOLGA = 14;
  for (const forma of FORMAS) {
    const { largura, altura } = tamanhoDe(forma);
    for (const t of desenharForma(forma, { seed: 1 })) {
      for (const [x, y] of pontos(t.d)) {
        assert.ok(x >= -FOLGA && x <= largura + FOLGA, `${forma}: x=${x} fora de ${largura}`);
        assert.ok(y >= -FOLGA && y <= altura + FOLGA, `${forma}: y=${y} fora de ${altura}`);
      }
    }
  }
});

test("forma desconhecida cai em retângulo", () => {
  assert.deepEqual(tamanhoDe("nao-existe"), TAMANHOS.retangulo);
  const a = desenharForma("nao-existe", { seed: 7 });
  const b = desenharForma("retangulo", { seed: 7 });
  assert.deepEqual(a, b);
});

test("desenharForma aceita tamanho próprio (miniatura da paleta)", () => {
  const mini = desenharForma("losango", { seed: 1 }, { largura: 40, altura: 30 });
  for (const t of mini) {
    for (const [x, y] of pontos(t.d)) {
      assert.ok(x <= 40 + 14 && y <= 30 + 14, `miniatura vazou: ${x},${y}`);
    }
  }
});

test("seedDoId é estável e não negativo", () => {
  assert.equal(seedDoId("01-solicitacao"), seedDoId("01-solicitacao"));
  assert.notEqual(seedDoId("a"), seedDoId("b"));
  assert.ok(seedDoId("qualquer-coisa") >= 0);
});

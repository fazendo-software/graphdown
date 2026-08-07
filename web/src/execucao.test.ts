import { test } from "node:test";
import assert from "node:assert/strict";
import { corDeExecucao, corDeFluxo, GLIFO_EXECUCAO, ROTULO_EXECUCAO } from "./execucao.ts";
import { PALETA } from "./tema.ts";
import { ESTADOS_EXECUCAO } from "../../core/tipos.ts";

const cores = PALETA.claro;
const NEUTRA = "#52525b";

test("cada estado tem rótulo e glifo próprios — cor não é a única diferença", () => {
  const glifos = ESTADOS_EXECUCAO.map((e) => GLIFO_EXECUCAO[e]);
  const rotulos = ESTADOS_EXECUCAO.map((e) => ROTULO_EXECUCAO[e]);
  assert.equal(new Set(glifos).size, ESTADOS_EXECUCAO.length, "glifos repetidos deixariam estados indistinguíveis");
  assert.equal(new Set(rotulos).size, ESTADOS_EXECUCAO.length);
});

test("só os três estados com evento têm cor própria; pendente segue o neutro", () => {
  assert.equal(corDeExecucao("pendente", cores, NEUTRA), NEUTRA);
  assert.equal(corDeExecucao(null, cores, NEUTRA), NEUTRA);
  assert.equal(corDeExecucao("em_andamento", cores, NEUTRA), cores.execEmAndamento);
  assert.equal(corDeExecucao("concluido", cores, NEUTRA), cores.execConcluido);
  assert.equal(corDeExecucao("bloqueado", cores, NEUTRA), cores.execBloqueado);
});

test("o fluxo da aresta segue o destino e preserva a cor da relação quando não há o que dizer", () => {
  const corDaAresta = "#7c3aed"; // cor semântica declarada na categoria
  // Destino informativo ou pendente: a camada continua na cor da própria relação.
  assert.equal(corDeFluxo({ tarefa: false, estado: null }, cores, corDaAresta), corDaAresta);
  assert.equal(corDeFluxo({ tarefa: true, estado: "pendente" }, cores, corDaAresta), corDaAresta);
  // Destino ainda não medido pelo React Flow: nada de cor inventada.
  assert.equal(corDeFluxo(undefined, cores, corDaAresta), corDaAresta);

  assert.equal(corDeFluxo({ tarefa: true, estado: "em_andamento" }, cores, corDaAresta), cores.execEmAndamento);
  assert.equal(corDeFluxo({ tarefa: true, estado: "concluido" }, cores, corDaAresta), cores.execConcluido);
  assert.equal(corDeFluxo({ tarefa: true, estado: "bloqueado" }, cores, corDaAresta), cores.execBloqueado);
});

test("os dois temas definem as três cores de estado", () => {
  for (const tema of ["claro", "escuro"] as const) {
    for (const chave of ["execEmAndamento", "execConcluido", "execBloqueado"]) {
      assert.match(PALETA[tema][chave] ?? "", /^#[0-9a-f]{6}$/, `${tema}.${chave} precisa ser hex para o SVG`);
    }
  }
});

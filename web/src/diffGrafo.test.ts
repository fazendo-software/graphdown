import { test } from "node:test";
import assert from "node:assert/strict";
import type { Edge, Node } from "@xyflow/react";
import type { No } from "../../core/tipos.ts";
import { aplicarDiffRender, reconciliarFantasmas, type ConstrutoresRender, type RenderState } from "./diffGrafo.ts";
import type { DadosNo } from "./NoProcesso.tsx";

function no(id: string, extra: Partial<No> = {}): No {
  return { id, titulo: id, categoria_id: "cat-1", campos: {}, versao: 1, ...extra };
}

function nodeReal(id: string, posicao = { x: 0, y: 0 }): Node {
  return { id, type: "processo", position: posicao, data: { titulo: id, cor: "#000", forma: "retangulo", fantasma: false } as DadosNo };
}

const construtores: ConstrutoresRender = {
  noReal: (n, posicao) => ({
    id: n.id,
    type: "processo",
    position: posicao,
    data: { titulo: n.titulo, cor: "#000", forma: "retangulo", fantasma: false } as DadosNo,
  }),
  noFantasma: (id, posicao) => ({
    id,
    type: "processo",
    position: posicao,
    data: { titulo: id, cor: "#dc2626", forma: "retangulo", fantasma: true } as DadosNo,
  }),
  aresta: (a) => ({ id: a.id, source: a.de, target: a.para, type: "rough", data: { aresta: a } }),
  nota: (n) => ({ id: n.id, type: "nota", position: { x: n.x, y: n.y }, data: { conteudo: n.conteudo } }),
};

function ctx(usuarioId = "eu") {
  return { usuarioId, nomeDe: () => "alguém", posicaoPendente: () => undefined, construtores };
}

function vazio(): RenderState {
  return { nos: [], arestas: [] };
}

test("reconciliarFantasmas: aresta cuja origem não é nó real vira fantasma", () => {
  const nos = [nodeReal("a"), nodeReal("b")];
  const arestas: Edge[] = [
    { id: "1", source: "a", target: "b", type: "rough" } as Edge,
    { id: "2", source: "x", target: "b", type: "rough" } as Edge,
  ];
  const resultado = reconciliarFantasmas(nos, arestas, construtores.noFantasma);
  assert.deepEqual(
    resultado.filter((n) => (n.data as DadosNo).fantasma).map((n) => n.id),
    ["x"],
  );
});

test("reconciliarFantasmas preserva a posição de um fantasma já existente", () => {
  const fantasmaAtual = construtores.noFantasma("x", { x: 50, y: 60 });
  const nos = [nodeReal("b"), fantasmaAtual];
  const arestas: Edge[] = [{ id: "1", source: "x", target: "b", type: "rough" } as Edge];
  const resultado = reconciliarFantasmas(nos, arestas, construtores.noFantasma);
  const x = resultado.find((n) => n.id === "x");
  assert.deepEqual(x?.position, { x: 50, y: 60 });
});

test("no-criado adiciona nó novo", () => {
  const depois = aplicarDiffRender(vazio(), { t: "no-criado", no: no("a") }, ctx());
  assert.equal(depois.nos.length, 1);
  assert.equal(depois.nos[0].id, "a");
});

test("no-mudou substitui pelo id e preserva a posição atual, não duplica", () => {
  let estado: RenderState = { nos: [nodeReal("a", { x: 10, y: 20 })], arestas: [] };
  estado = aplicarDiffRender(estado, { t: "no-mudou", no: no("a", { titulo: "Novo" }) }, ctx());
  assert.equal(estado.nos.length, 1);
  assert.equal((estado.nos[0].data as DadosNo).titulo, "Novo");
  assert.deepEqual(estado.nos[0].position, { x: 10, y: 20 });
});

test("no-apagado remove o nó e as arestas ligadas a ele", () => {
  let estado: RenderState = {
    nos: [nodeReal("a"), nodeReal("b")],
    arestas: [{ id: "1", source: "a", target: "b", type: "rough" } as Edge],
  };
  estado = aplicarDiffRender(estado, { t: "no-apagado", no: no("a") }, ctx());
  assert.equal(estado.nos.length, 1);
  assert.equal(estado.arestas.length, 0);
});

test("aresta-criada para nó inexistente gera fantasma", () => {
  const estado = aplicarDiffRender(
    { nos: [nodeReal("b")], arestas: [] },
    { t: "aresta-criada", aresta: { id: "1", de: "x", para: "b", campos: {} } },
    ctx(),
  );
  const fantasmas = estado.nos.filter((n) => (n.data as DadosNo).fantasma).map((n) => n.id);
  assert.deepEqual(fantasmas, ["x"]);
});

test("aresta-apagada some com o fantasma se era a última referência", () => {
  let estado: RenderState = {
    nos: [nodeReal("b"), construtores.noFantasma("x", { x: 0, y: 0 })],
    arestas: [{ id: "1", source: "x", target: "b", type: "rough" } as Edge],
  };
  estado = aplicarDiffRender(
    estado,
    { t: "aresta-apagada", aresta: { id: "1", de: "x", para: "b", campos: {} } },
    ctx(),
  );
  assert.equal(estado.nos.some((n) => n.id === "x"), false);
  assert.equal(estado.arestas.length, 0);
});

test("arrastando do próprio usuário é ignorado", () => {
  const estado = { nos: [nodeReal("a", { x: 0, y: 0 })], arestas: [] };
  const depois = aplicarDiffRender(estado, { t: "arrastando", no: "a", x: 9, y: 9, por: "eu" }, ctx("eu"));
  assert.equal(depois, estado);
});

test("arrastando de outro usuário move o nó e marca quem move", () => {
  const estado = { nos: [nodeReal("a", { x: 0, y: 0 })], arestas: [] };
  const depois = aplicarDiffRender(
    estado,
    { t: "arrastando", no: "a", x: 9, y: 9, por: "outro" },
    { ...ctx("eu"), nomeDe: () => "Fulano" },
  );
  assert.deepEqual(depois.nos[0].position, { x: 9, y: 9 });
  assert.equal((depois.nos[0].data as DadosNo).movidoPor, "Fulano");
});

test("posicao confirmada limpa o indicador de quem estava movendo", () => {
  const movendo: Node = { ...nodeReal("a"), data: { ...nodeReal("a").data, movidoPor: "Fulano" } as DadosNo };
  const estado = { nos: [movendo], arestas: [] };
  const depois = aplicarDiffRender(estado, { t: "posicao", no: "a", x: 5, y: 5 }, ctx());
  assert.equal((depois.nos[0].data as DadosNo).movidoPor, undefined);
});

test("nota entra, muda e sai sem afetar nós nem arestas", () => {
  const estado: RenderState = { nos: [nodeReal("a")], arestas: [] };
  const nota = { id: "n1", conteudo: "conferir", x: 10, y: 20 };

  const criada = aplicarDiffRender(estado, { t: "nota-criada", nota }, ctx());
  assert.equal(criada.nos.length, 2);
  const naTela = criada.nos.find((n) => n.id === "n1")!;
  assert.equal(naTela.type, "nota");
  assert.deepEqual(naTela.position, { x: 10, y: 20 });

  const mudada = aplicarDiffRender(criada, { t: "nota-mudou", nota: { ...nota, conteudo: "outro" } }, ctx());
  assert.equal(mudada.nos.filter((n) => n.id === "n1").length, 1, "upsert, não duplicata");
  assert.equal((mudada.nos.find((n) => n.id === "n1")!.data as { conteudo: string }).conteudo, "outro");

  const apagada = aplicarDiffRender(mudada, { t: "nota-apagada", nota }, ctx());
  assert.deepEqual(apagada.nos.map((n) => n.id), ["a"]);
});

test("nota selecionada continua selecionada depois do eco do próprio arraste", () => {
  const nota = { id: "n1", conteudo: "x", x: 0, y: 0 };
  const estado = aplicarDiffRender({ nos: [], arestas: [] }, { t: "nota-criada", nota }, ctx());
  const selecionada: RenderState = { ...estado, nos: estado.nos.map((n) => ({ ...n, selected: true })) };
  const eco = aplicarDiffRender(selecionada, { t: "nota-mudou", nota: { ...nota, x: 40, y: 50 } }, ctx());
  assert.equal(eco.nos[0].selected, true);
  assert.deepEqual(eco.nos[0].position, { x: 40, y: 50 });
});

test("nota não vira fantasma nem é confundida com origem de aresta", () => {
  const nota = { id: "n1", conteudo: "x", x: 0, y: 0 };
  const comNota = aplicarDiffRender({ nos: [nodeReal("a")], arestas: [] }, { t: "nota-criada", nota }, ctx());
  // aresta saindo de um id que não existe: o fantasma é "sumido", nunca a nota.
  const depois = aplicarDiffRender(
    comNota,
    { t: "aresta-criada", aresta: { id: "e1", de: "sumido", para: "a", campos: {} } },
    ctx(),
  );
  const fantasmas = depois.nos.filter((n) => (n.data as DadosNo).fantasma);
  assert.deepEqual(fantasmas.map((n) => n.id), ["sumido"]);
  assert.ok(depois.nos.some((n) => n.id === "n1"), "nota sobreviveu à reconciliação");
});

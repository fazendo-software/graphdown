import { test } from "node:test";
import assert from "node:assert/strict";
import type { EstadoExecucao, No } from "../../core/tipos.ts";
import { aplicarDiffRender, type ConstrutoresRender, type RenderState } from "./diffGrafo.ts";
import { edgeDeAresta, montarCatalogo, nodeDeFantasma, nodeDeNota, nodeDeReal, nodeDeSetaLivre } from "./grafoRender.ts";
import { progressoDoRender } from "./progressoRender.ts";

const catalogo = montarCatalogo({
  categorias: [{ id: "processo", nome: "Processo", campos: [] }],
  arestasEstilo: {},
  camposAresta: [],
});

function no(id: string, estado?: EstadoExecucao): No {
  return {
    id,
    titulo: id,
    categoria_id: "processo",
    campos: {},
    versao: 1,
    execucao: estado === undefined ? { tarefa: false, estado: null } : { tarefa: true, estado },
  };
}

/** Monta o render pelo mesmo caminho do Canvas — é isso que garante que `execucao`
 * realmente chega ao dado do nó, e não só ao tipo. */
function renderDe(nos: No[], ligacoes: Array<[string, string]>): RenderState {
  return {
    nos: nos.map((n) => nodeDeReal(n, catalogo, { x: 0, y: 0 })),
    arestas: ligacoes.map(([de, para]) => edgeDeAresta({ id: `${de}-${para}`, de, para, campos: {} }, catalogo, "#000")),
  };
}

const construtores: ConstrutoresRender = {
  noReal: (n, posicao) => nodeDeReal(n, catalogo, posicao),
  noFantasma: (id, posicao) => nodeDeFantasma(id, posicao),
  aresta: (a) => edgeDeAresta(a, catalogo, "#000"),
  nota: (n) => nodeDeNota(n, false, () => undefined),
  seta: (s) => nodeDeSetaLivre(s, false, () => undefined),
};

const ctx = {
  usuarioId: "eu",
  nomeDe: () => "outro",
  posicaoPendente: () => undefined,
  construtores,
};

test("o progresso sai do render atual, sem consultar nada", () => {
  const render = renderDe([no("a"), no("b", "concluido"), no("c", "pendente")], [["a", "b"], ["b", "c"]]);
  const p = progressoDoRender(render);
  assert.deepEqual(p.resumo, { tarefas: 2, concluidas: 1, emAndamento: 0, bloqueadas: 0 });
  assert.deepEqual(p.raizes, [
    { id: "a", progresso: { estado: "com_tarefas", tarefas: 2, concluidas: 1, percentual: 50 } },
  ]);
});

test("no-mudou de outro cliente recalcula o progresso sem recarregar o grafo", () => {
  const antes = renderDe([no("a"), no("b", "pendente")], [["a", "b"]]);
  assert.deepEqual(progressoDoRender(antes).raizes[0].progresso, {
    estado: "com_tarefas",
    tarefas: 1,
    concluidas: 0,
    percentual: 0,
  });

  // Exatamente a mensagem que o WebSocket entrega quando outra pessoa conclui a tarefa.
  const depois = aplicarDiffRender(antes, { t: "no-mudou", no: no("b", "concluido") }, ctx);
  assert.deepEqual(progressoDoRender(depois).raizes[0].progresso, {
    estado: "com_tarefas",
    tarefas: 1,
    concluidas: 1,
    percentual: 100,
  });
  // E o dado que a aresta lê para colorir o fluxo acompanhou o mesmo diff.
  const alvo = depois.nos.find((n) => n.id === "b");
  assert.deepEqual((alvo?.data as { execucao?: No["execucao"] }).execucao, { tarefa: true, estado: "concluido" });
});

test("nota, seta livre e fantasma não entram na conta", () => {
  const render = renderDe([no("a"), no("b", "concluido")], [["a", "b"], ["sumido", "b"]]);
  render.nos.push(nodeDeFantasma("sumido", { x: 0, y: 0 }));
  render.nos.push(nodeDeNota({ id: "nota", conteudo: "oi", x: 0, y: 0 }, false, () => undefined));
  render.nos.push(
    nodeDeSetaLivre({ id: "seta", tipo: "linha", pontos: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }, false, () => undefined),
  );

  const p = progressoDoRender(render);
  assert.deepEqual(p.resumo, { tarefas: 1, concluidas: 1, emAndamento: 0, bloqueadas: 0 });
  assert.deepEqual(p.raizes.map((r) => r.id), ["a"], "fantasma não vira fluxo e não some com a raiz real");
});

test("objeto solto não vira fluxo; raiz com saída e sem tarefa abaixo mostra sem_tarefas", () => {
  const render = renderDe([no("solto", "em_andamento"), no("a"), no("b")], [["a", "b"]]);
  const p = progressoDoRender(render);
  assert.deepEqual(p.raizes, [{ id: "a", progresso: { estado: "sem_tarefas" } }]);
  assert.equal(p.resumo.tarefas, 1, "a tarefa solta continua no resumo global");
});

test("aresta para fantasma não transforma objeto solto em fluxo", () => {
  const render = renderDe([no("a")], [["a", "sumido"]]);
  render.nos.push(nodeDeFantasma("sumido", { x: 0, y: 0 }));

  assert.deepEqual(progressoDoRender(render).raizes, []);
});

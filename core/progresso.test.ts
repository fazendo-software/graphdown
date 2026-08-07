import assert from "node:assert/strict";
import { test } from "node:test";
import { calcularProgresso } from "./progresso.ts";
import type { EstadoExecucao, No } from "./tipos.ts";

/** `estado` ausente = nó informativo, que é o caso comum do grafo já existente. */
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

const liga = (de: string, para: string) => ({ de, para });

/** Só o badge da raiz pedida — o resto dos testes não precisa varrer a lista inteira. */
function badge(progresso: ReturnType<typeof calcularProgresso>, id: string) {
  return progresso.raizes.find((raiz) => raiz.id === id)?.progresso;
}

test("linha simples: a raiz conta o que vem abaixo dela, não a si mesma", () => {
  const p = calcularProgresso(
    [no("a", "concluido"), no("b", "concluido"), no("c", "pendente")],
    [liga("a", "b"), liga("b", "c")],
  );
  assert.deepEqual(badge(p, "a"), { estado: "com_tarefas", tarefas: 2, concluidas: 1, percentual: 50 });
  // `b` tem entrada, então não é raiz; só `a` vira badge.
  assert.deepEqual(p.raizes.map((r) => r.id), ["a"]);
});

test("resumo global conta só tarefas e só concluído entra no numerador", () => {
  const p = calcularProgresso(
    [
      no("informativo"),
      no("feita", "concluido"),
      no("andando", "em_andamento"),
      no("travada", "bloqueado"),
      no("esperando", "pendente"),
    ],
    [],
  );
  assert.deepEqual(p.resumo, { tarefas: 4, concluidas: 1, emAndamento: 1, bloqueadas: 1 });
});

test("losango: tarefa alcançada por dois ramos conta uma vez", () => {
  const p = calcularProgresso(
    [no("a"), no("b", "concluido"), no("c", "concluido"), no("d", "pendente")],
    [liga("a", "b"), liga("a", "c"), liga("b", "d"), liga("c", "d")],
  );
  assert.deepEqual(badge(p, "a"), { estado: "com_tarefas", tarefas: 3, concluidas: 2, percentual: 67 });
});

test("nó informativo no meio não soma, mas o percurso continua por ele", () => {
  const p = calcularProgresso(
    [no("a"), no("documento"), no("z", "concluido")],
    [liga("a", "documento"), liga("documento", "z")],
  );
  assert.deepEqual(badge(p, "a"), { estado: "com_tarefas", tarefas: 1, concluidas: 1, percentual: 100 });
});

test("ciclo termina, não infla o total e não impede a raiz de existir", () => {
  const p = calcularProgresso(
    [no("raiz"), no("a", "concluido"), no("b", "pendente")],
    [liga("raiz", "a"), liga("a", "b"), liga("b", "a"), liga("b", "raiz")],
  );
  // `raiz` recebe entrada de `b`, logo não é raiz: um ciclo não ganha "primeiro nó".
  assert.deepEqual(p.raizes, []);
  assert.deepEqual(p.resumo, { tarefas: 2, concluidas: 1, emAndamento: 0, bloqueadas: 0 });
});

test("laço em si mesmo não desqualifica a raiz nem duplica a contagem", () => {
  const p = calcularProgresso(
    [no("a"), no("b", "concluido")],
    [liga("a", "a"), liga("a", "b"), liga("b", "b")],
  );
  assert.deepEqual(badge(p, "a"), { estado: "com_tarefas", tarefas: 1, concluidas: 1, percentual: 100 });
});

test("fluxo sem tarefa abaixo devolve sem_tarefas, nunca 0%", () => {
  const p = calcularProgresso([no("a"), no("b"), no("c")], [liga("a", "b"), liga("b", "c")]);
  assert.deepEqual(badge(p, "a"), { estado: "sem_tarefas" });
  assert.deepEqual(p.resumo.tarefas, 0);
});

test("raiz que é tarefa fica fora do próprio cálculo", () => {
  const so = calcularProgresso([no("a", "pendente"), no("b", "concluido")], [liga("a", "b")]);
  assert.deepEqual(badge(so, "a"), { estado: "com_tarefas", tarefas: 1, concluidas: 1, percentual: 100 });

  // Tarefa isolada: nada abaixo, então badge nenhum — o estado dela é do próprio nó.
  const sozinha = calcularProgresso([no("a", "em_andamento")], []);
  assert.deepEqual(badge(sozinha, "a"), { estado: "sem_tarefas" });
  assert.deepEqual(sozinha.resumo, { tarefas: 1, concluidas: 0, emAndamento: 1, bloqueadas: 0 });
});

test("ponta fantasma não entra no percurso nem cria raiz falsa", () => {
  const p = calcularProgresso(
    [no("a"), no("b", "concluido")],
    [liga("sumido", "b"), liga("a", "b"), liga("b", "tambem-sumido")],
  );
  // A entrada de `b` vem de `a`, um nó real — a aresta fantasma não conta em nada.
  assert.deepEqual(p.raizes.map((r) => r.id), ["a"]);
  assert.deepEqual(badge(p, "a"), { estado: "com_tarefas", tarefas: 1, concluidas: 1, percentual: 100 });
});

test("vários fluxos independentes rendem um badge cada, na ordem dos nós", () => {
  const p = calcularProgresso(
    [no("a"), no("b", "concluido"), no("x"), no("y", "bloqueado")],
    [liga("a", "b"), liga("x", "y")],
  );
  assert.deepEqual(p.raizes, [
    { id: "a", progresso: { estado: "com_tarefas", tarefas: 1, concluidas: 1, percentual: 100 } },
    { id: "x", progresso: { estado: "com_tarefas", tarefas: 1, concluidas: 0, percentual: 0 } },
  ]);
});

test("arredondamento não anuncia 100% antes da hora nem esconde o que já foi feito", () => {
  const quase = [no("raiz"), ...Array.from({ length: 200 }, (_, i) => no(`t${i}`, i === 0 ? "pendente" : "concluido"))];
  const p = calcularProgresso(quase, quase.slice(1).map((t) => liga("raiz", t.id)));
  assert.deepEqual(badge(p, "raiz"), { estado: "com_tarefas", tarefas: 200, concluidas: 199, percentual: 99 });

  const inicio = [no("raiz"), ...Array.from({ length: 300 }, (_, i) => no(`t${i}`, i === 0 ? "concluido" : "pendente"))];
  const q = calcularProgresso(inicio, inicio.slice(1).map((t) => liga("raiz", t.id)));
  assert.deepEqual(badge(q, "raiz"), { estado: "com_tarefas", tarefas: 300, concluidas: 1, percentual: 1 });

  const tudo = calcularProgresso([no("raiz"), no("t", "concluido")], [liga("raiz", "t")]);
  assert.deepEqual(badge(tudo, "raiz"), { estado: "com_tarefas", tarefas: 1, concluidas: 1, percentual: 100 });
});

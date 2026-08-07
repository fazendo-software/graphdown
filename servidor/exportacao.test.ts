import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { montarExportacao } from "./exportacao.ts";

test("snapshot abre transação repetível somente leitura e traz todos os corpos numa consulta", async () => {
  const consultas: string[] = [];
  let liberado = false;
  const cliente = {
    query: async (sql: string) => {
      consultas.push(sql.replace(/\s+/g, " ").trim().toLowerCase());
      if (sql.includes("from projetos")) return { rows: [{ id: "projeto", nome: "Projeto" }] };
      if (sql.includes("from projeto_categorias")) return { rows: [] };
      if (sql.includes("from nos where")) {
        return {
          rows: [
            { id: "a", titulo: "A", categoria_id: "categoria", campos: {}, corpo: "corpo A", versao: 1, erro: null, pos_x: 1, pos_y: 2, eh_tarefa: true, estado_execucao: "concluido" },
            { id: "b", titulo: "B", categoria_id: "categoria", campos: {}, corpo: "corpo B", versao: 1, erro: null, pos_x: null, pos_y: null, eh_tarefa: false, estado_execucao: null },
          ],
        };
      }
      return { rows: [] };
    },
    release: () => {
      liberado = true;
    },
  };
  const pool = { connect: async () => cliente } as unknown as Pool;

  const snapshot = await montarExportacao(pool, "projeto");

  assert.deepEqual(snapshot?.nos.map((no) => [no.id, no.corpo]), [["a", "corpo A"], ["b", "corpo B"]]);
  assert.equal(consultas[0], "begin transaction isolation level repeatable read read only");
  const consultasDeNos = consultas.filter((sql) => sql.includes("from nos where"));
  assert.equal(consultasDeNos.length, 1, "corpos de todos os nós devem vir da única consulta em lote");
  assert.match(
    consultasDeNos[0],
    /select id, titulo, categoria_id, campos, corpo, versao, erro, pos_x, pos_y, eh_tarefa, estado_execucao/,
  );
  assert.deepEqual(snapshot?.nos.map((no) => no.execucao), [
    { tarefa: true, estado: "concluido" },
    { tarefa: false, estado: null },
  ]);
  assert.equal(consultas.at(-1), "commit");
  assert.equal(liberado, true);
});

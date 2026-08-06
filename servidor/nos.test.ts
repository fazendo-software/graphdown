import { test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { atualizarCorpo } from "./nos.ts";

test("atualizarCorpo não quebra quando o nó é apagado durante a gravação", async () => {
  const pool = {
    query: async (sql: string) => {
      if (sql.startsWith("select versao, corpo from nos")) {
        // O primeiro SELECT vê o nó; o recheck após o UPDATE já não o vê.
        const primeiraLeitura = !(pool as { leu?: boolean }).leu;
        (pool as { leu?: boolean }).leu = true;
        return primeiraLeitura ? { rows: [{ versao: 1, corpo: "antes" }] } : { rows: [] };
      }
      if (sql.startsWith("update nos set corpo")) return { rows: [] };
      throw new Error(`query inesperada: ${sql}`);
    },
  } as unknown as Pool;

  const resultado = await atualizarCorpo(pool, "projeto", "no", "depois", 1);
  assert.deepEqual(resultado, { status: "nao-encontrado" });
});

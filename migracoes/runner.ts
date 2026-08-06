import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";

const DIR = dirname(fileURLToPath(import.meta.url));

// Chave arbitrária fixa: mesmo lock em qualquer instância/processo que chame migrar()
// contra o mesmo banco — serializa réplicas do Docker subindo juntas e testes em paralelo.
const CHAVE_LOCK = 727_478_326; // hashtext('grapydown_migracoes') truncado pra bigint de 32 bits

/** Aplica, em ordem e uma vez só, os `.sql` desta pasta que ainda não constam em `migracoes`. */
export async function migrar(pool: Pool): Promise<void> {
  const cliente = await pool.connect();
  try {
    await cliente.query("select pg_advisory_lock($1)", [CHAVE_LOCK]);
    await cliente.query(
      `create table if not exists migracoes (
         nome text primary key,
         aplicada_em timestamptz not null default now()
       )`,
    );
    const aplicadas = new Set(
      (await cliente.query<{ nome: string }>("select nome from migracoes")).rows.map((r) => r.nome),
    );
    const arquivos = (await readdir(DIR)).filter((n) => n.endsWith(".sql")).sort();

    for (const nome of arquivos) {
      if (aplicadas.has(nome)) continue;
      const sql = await readFile(join(DIR, nome), "utf8");
      await cliente.query("begin");
      try {
        await cliente.query(sql);
        await cliente.query("insert into migracoes (nome) values ($1)", [nome]);
        await cliente.query("commit");
      } catch (erro) {
        await cliente.query("rollback");
        throw erro;
      }
      console.log(`migração aplicada: ${nome}`);
    }
  } finally {
    await cliente.query("select pg_advisory_unlock($1)", [CHAVE_LOCK]);
    cliente.release();
  }
}

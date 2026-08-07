import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Pool, PoolClient } from "pg";
import { parseCategoria } from "../core/categoria.ts";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");

const CHAVE_LOCK = 727_478_327; // mesma família da chave de migracoes/runner.ts, valor diferente

/** Ordem importa: a primeira é a categoria principal de um projeto novo, e é ela que vence
 * na fusão dos estilos de seta (ver `fundirArestas`). */
const ARQUIVOS = [
  "processo.yaml",
  "dados.yaml",
  "atores.yaml",
  "infraestrutura.yaml",
  "riscos.yaml",
  "embed.yaml",
];

/**
 * Roda DEPOIS das migrações, e é o único ponto onde as categorias novas já existem — por
 * isso o religamento dos nós de `ator` mora aqui e não em `003_varias_categorias.sql`.
 * Tudo é idempotente: subir de novo não duplica categoria, vínculo nem move nó duas vezes.
 */
export async function semear(pool: Pool): Promise<void> {
  const cliente = await pool.connect();
  try {
    // trava: dois processos subindo juntos (réplicas, testes em paralelo) não podem os dois
    // verem "não existe" e inserir duas categorias com o mesmo nome.
    await cliente.query("select pg_advisory_lock($1)", [CHAVE_LOCK]);
    for (const [ordem, arquivo] of ARQUIVOS.entries()) {
      await semearArquivo(cliente, arquivo, ordem);
    }
    await religarAtores(cliente);
  } finally {
    await cliente.query("select pg_advisory_unlock($1)", [CHAVE_LOCK]);
    cliente.release();
  }
}

async function semearArquivo(cliente: PoolClient, arquivo: string, ordem: number): Promise<void> {
  const categoria = parseCategoria(await readFile(join(RAIZ, "categorias", arquivo), "utf8"));
  // Upsert, não insert-se-não-existe: o YAML é a fonte da verdade das categorias semeadas.
  // Sem isso, instalação que já rodou uma vez nunca receberia objeto nem seta nova — foi
  // por falta disso que a migração 002 precisou reescrever a definição em SQL. Sobrescrever
  // é seguro porque não existe UI que edite categoria; quando existir, isto muda.
  const r = await cliente.query<{ id: string }>(
    `insert into categorias (nome, definicao, semeada) values ($1, $2, true)
     on conflict (nome) do update
        set definicao = excluded.definicao, semeada = true, atualizado_em = now()
     returning id`,
    [categoria.nome, categoria],
  );
  const id = r.rows[0].id;

  // Ainda não existe UI para escolher quais categorias um projeto usa; enquanto isso, todo
  // projeto enxerga todas. `ordem` preserva quem é a principal de cada projeto.
  await cliente.query(
    `insert into projeto_categorias (projeto_id, categoria_id, ordem)
     select p.id, $1, case when p.categoria_id = $1 then 0 else $2 + 1 end from projetos p
     on conflict do nothing`,
    [id, ordem],
  );
}

/** `ator` saiu de processo.yaml e mora em Atores. Sem mover os nós que já existiam, cada um
 * viraria "valor fora das opções de tipo" na próxima validação. */
async function religarAtores(cliente: PoolClient): Promise<void> {
  await cliente.query(
    `update nos n
        set categoria_id = a.id, atualizado_em = now()
       from categorias a
      where a.nome = 'Atores' and n.campos->>'tipo' = 'ator' and n.categoria_id <> a.id`,
  );
}

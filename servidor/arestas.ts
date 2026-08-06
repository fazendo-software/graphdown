import type { Pool } from "pg";
import type { Aresta } from "../core/tipos.ts";

export type ArestaComId = Aresta & { id: string };

const CODIGO_UNIQUE_VIOLATION = "23505";
const CODIGO_FOREIGN_KEY_VIOLATION = "23503";

export async function listarArestas(pool: Pool, projetoId: string): Promise<ArestaComId[]> {
  const r = await pool.query<ArestaComId>(
    `select id, de, para, quando, tipo, campos
       from arestas where projeto_id = $1 and apagado_em is null
       order by criado_em`,
    [projetoId],
  );
  return r.rows.map((a) => ({ ...a, quando: a.quando ?? undefined, tipo: a.tipo ?? undefined }));
}

export async function calcularFantasmas(pool: Pool, projetoId: string): Promise<string[]> {
  const r = await pool.query<{ de: string }>(
    `select distinct a.de from arestas a
      where a.projeto_id = $1
        and a.apagado_em is null
        and not exists (
          select 1 from nos n
           where n.projeto_id = a.projeto_id and n.id = a.de and n.apagado_em is null
        )`,
    [projetoId],
  );
  return r.rows.map((r) => r.de);
}

/** `tipo` nulo é a seta padrão — é o que vem quando nada está armado na paleta. */
export async function criarAresta(
  pool: Pool,
  projetoId: string,
  de: string,
  para: string,
  tipo?: string | null,
): Promise<{ id: string } | { conflito: true } | { naoEncontrada: true }> {
  try {
    const r = await pool.query<{ id: string }>(
      "insert into arestas (projeto_id, de, para, tipo) values ($1, $2, $3, $4) returning id",
      [projetoId, de, para, tipo ?? null],
    );
    return { id: r.rows[0].id };
  } catch (erro) {
    if ((erro as { code?: string }).code === CODIGO_UNIQUE_VIOLATION) return { conflito: true };
    if ((erro as { code?: string }).code === CODIGO_FOREIGN_KEY_VIOLATION) return { naoEncontrada: true };
    throw erro;
  }
}

export async function atualizarAresta(
  pool: Pool,
  projetoId: string,
  id: string,
  patch: { quando?: string | null; tipo?: string | null; campos?: Record<string, unknown> },
): Promise<ArestaComId | null> {
  const atual = await pool.query<{ quando: string | null; tipo: string | null; campos: Record<string, unknown> }>(
    "select quando, tipo, campos from arestas where projeto_id = $1 and id = $2 and apagado_em is null",
    [projetoId, id],
  );
  if (!atual.rows[0]) return null;
  const anterior = atual.rows[0];
  const campos = patch.campos ? { ...anterior.campos, ...patch.campos } : anterior.campos;
  const r = await pool.query<ArestaComId>(
    `update arestas set
        quando = $3,
        tipo = $4,
        campos = $5
      where projeto_id = $1 and id = $2 and apagado_em is null
      returning id, de, para, quando, tipo, campos`,
    [
      projetoId,
      id,
      Object.hasOwn(patch, "quando") ? patch.quando ?? null : anterior.quando,
      Object.hasOwn(patch, "tipo") ? patch.tipo ?? null : anterior.tipo,
      campos,
    ],
  );
  const aresta = r.rows[0];
  return aresta ? { ...aresta, quando: aresta.quando ?? undefined, tipo: aresta.tipo ?? undefined } : null;
}

export async function apagarAresta(pool: Pool, projetoId: string, id: string): Promise<ArestaComId | null> {
  const r = await pool.query<ArestaComId>(
    `update arestas set apagado_em = now()
       where projeto_id = $1 and id = $2 and apagado_em is null
       returning id, de, para, quando, tipo, campos`,
    [projetoId, id],
  );
  const aresta = r.rows[0];
  return aresta ? { ...aresta, quando: aresta.quando ?? undefined, tipo: aresta.tipo ?? undefined } : null;
}

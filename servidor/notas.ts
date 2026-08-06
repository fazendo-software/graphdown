import type { Pool } from "pg";
import type { Nota } from "../core/tipos.ts";

const COLUNAS = "id, conteudo, pos_x as x, pos_y as y";

export async function listarNotas(pool: Pool, projetoId: string): Promise<Nota[]> {
  const r = await pool.query<Nota>(
    `select ${COLUNAS} from notas where projeto_id = $1 order by criado_em`,
    [projetoId],
  );
  return r.rows;
}

export async function criarNota(
  pool: Pool,
  projetoId: string,
  usuarioId: string,
  conteudo: string,
  x: number,
  y: number,
): Promise<Nota> {
  const r = await pool.query<Nota>(
    `insert into notas (projeto_id, conteudo, pos_x, pos_y, criado_por)
     values ($1, $2, $3, $4, $5) returning ${COLUNAS}`,
    [projetoId, conteudo, x, y, usuarioId],
  );
  return r.rows[0];
}

export type PatchNota = { conteudo?: string | null; x?: number; y?: number };

/**
 * Merge por presença de chave, não `coalesce` no SQL: com `coalesce($n, coluna)` a chave
 * ausente e o `null` explícito viram o mesmo bind, e aí nenhum payload consegue limpar o
 * conteúdo. Foi o bug encontrado em `atualizarAresta`; aqui já nasce distinguindo os dois.
 */
export async function atualizarNota(
  pool: Pool,
  projetoId: string,
  id: string,
  patch: PatchNota,
): Promise<Nota | null> {
  const partes: string[] = [];
  const valores: unknown[] = [projetoId, id];
  if ("conteudo" in patch) {
    valores.push(patch.conteudo ?? "");
    partes.push(`conteudo = $${valores.length}`);
  }
  if (typeof patch.x === "number" && typeof patch.y === "number") {
    valores.push(patch.x, patch.y);
    partes.push(`pos_x = $${valores.length - 1}`, `pos_y = $${valores.length}`);
  }
  if (partes.length === 0) return buscarNota(pool, projetoId, id);
  const r = await pool.query<Nota>(
    `update notas set ${partes.join(", ")}, atualizado_em = now()
       where projeto_id = $1 and id = $2 returning ${COLUNAS}`,
    valores,
  );
  return r.rows[0] ?? null;
}

export async function buscarNota(pool: Pool, projetoId: string, id: string): Promise<Nota | null> {
  const r = await pool.query<Nota>(
    `select ${COLUNAS} from notas where projeto_id = $1 and id = $2`,
    [projetoId, id],
  );
  return r.rows[0] ?? null;
}

/** Delete físico: nada referencia `notas`, então não há o fantasma zumbi que obrigou o nó
 * ao soft delete. Sem coluna `apagado_em`, sem migração. */
export async function apagarNota(pool: Pool, projetoId: string, id: string): Promise<Nota | null> {
  const r = await pool.query<Nota>(
    `delete from notas where projeto_id = $1 and id = $2 returning ${COLUNAS}`,
    [projetoId, id],
  );
  return r.rows[0] ?? null;
}

import type { Pool } from "pg";
import type { Papel } from "../core/tipos.ts";

/** `null` quando o usuário não é membro — rota trata isso como 404, nunca 403. */
export async function resolverMembership(pool: Pool, usuarioId: string, projetoId: string): Promise<Papel | null> {
  const r = await pool.query<{ papel: Papel }>(
    "select papel from projeto_membros where projeto_id = $1 and usuario_id = $2",
    [projetoId, usuarioId],
  );
  return r.rows[0]?.papel ?? null;
}

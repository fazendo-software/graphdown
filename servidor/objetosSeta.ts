import type { Pool } from "./db.ts";
import { type TipoObjetoSeta } from "../core/objetosSeta.ts";
import type { ObjetoSeta, Posicao } from "../core/tipos.ts";

const COLUNAS = "id, tipo, pontos";

export async function listarObjetosSeta(pool: Pool, projetoId: string): Promise<ObjetoSeta[]> {
  const r = await pool.query<ObjetoSeta>(
    `select ${COLUNAS} from objetos_seta where projeto_id = $1 order by criado_em`,
    [projetoId],
  );
  return r.rows;
}

export async function buscarObjetoSeta(pool: Pool, projetoId: string, id: string): Promise<ObjetoSeta | null> {
  const r = await pool.query<ObjetoSeta>(
    `select ${COLUNAS} from objetos_seta where projeto_id = $1 and id = $2`,
    [projetoId, id],
  );
  return r.rows[0] ?? null;
}

export async function criarObjetoSeta(
  pool: Pool,
  projetoId: string,
  usuarioId: string,
  tipo: TipoObjetoSeta,
  pontos: Posicao[],
): Promise<ObjetoSeta> {
  const r = await pool.query<ObjetoSeta>(
    `insert into objetos_seta (projeto_id, tipo, pontos, criado_por)
     values ($1, $2, $3, $4) returning ${COLUNAS}`,
    [projetoId, tipo, JSON.stringify(pontos), usuarioId],
  );
  return r.rows[0];
}

export async function atualizarObjetoSeta(
  pool: Pool,
  projetoId: string,
  id: string,
  tipo: TipoObjetoSeta,
  pontos: Posicao[],
): Promise<ObjetoSeta | null> {
  const r = await pool.query<ObjetoSeta>(
    `update objetos_seta set tipo = $3, pontos = $4, atualizado_em = now()
       where projeto_id = $1 and id = $2 returning ${COLUNAS}`,
    [projetoId, id, tipo, JSON.stringify(pontos)],
  );
  return r.rows[0] ?? null;
}

export async function apagarObjetoSeta(pool: Pool, projetoId: string, id: string): Promise<ObjetoSeta | null> {
  const r = await pool.query<ObjetoSeta>(
    `delete from objetos_seta where projeto_id = $1 and id = $2 returning ${COLUNAS}`,
    [projetoId, id],
  );
  return r.rows[0] ?? null;
}

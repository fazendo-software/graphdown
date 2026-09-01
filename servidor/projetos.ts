import type { Pool } from "./db.ts";
import type { Projeto } from "../core/tipos.ts";
import { buscarCategoriaPorId } from "./categorias.ts";

export async function listarProjetos(pool: Pool, usuarioId: string): Promise<Projeto[]> {
  const r = await pool.query<Projeto>(
    `select p.id, p.nome, m.papel
       from projetos p join projeto_membros m on m.projeto_id = p.id
      where m.usuario_id = $1
      order by p.criado_em desc`,
    [usuarioId],
  );
  return r.rows;
}

export async function criarProjeto(
  pool: Pool,
  usuarioId: string,
  nome: string,
  categoriaId: string,
): Promise<{ id: string } | { erro: string }> {
  const categoria = await buscarCategoriaPorId(pool, categoriaId);
  if (!categoria) return { erro: `categoria desconhecida: ${categoriaId}` };
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    const r = await cliente.query<{ id: string }>(
      "insert into projetos (nome, categoria_id, criado_por) values ($1, $2, $3) returning id",
      [nome, categoriaId, usuarioId],
    );
    const id = r.rows[0].id;
    await cliente.query(
      "insert into projeto_membros (projeto_id, usuario_id, papel) values ($1, $2, 'dono')",
      [id, usuarioId],
    );
    // Projeto novo enxerga o catálogo semeado: a escolhida como principal (ordem 0, vence a
    // fusão dos estilos de seta) e as demais em seguida, por nome. `semeada` é o filtro que
    // impede categoria avulsa da tabela de entrar aqui sozinha. Não há UI para escolher
    // quais categorias um projeto usa — quando houver, é aqui que muda.
    await cliente.query(
      `insert into projeto_categorias (projeto_id, categoria_id, ordem)
       select $1, c.id, case when c.id = $2 then 0 else 1 end
         from categorias c where c.semeada or c.id = $2`,
      [id, categoriaId],
    );
    await cliente.query("commit");
    return { id };
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}

export async function apagarProjeto(pool: Pool, id: string): Promise<void> {
  await pool.query("delete from projetos where id = $1", [id]);
}

export async function renomearProjeto(pool: Pool, id: string, nome: string): Promise<boolean> {
  const r = await pool.query("update projetos set nome = $2 where id = $1", [id, nome]);
  return r.rowCount > 0;
}

export async function buscarProjeto(pool: Pool, id: string): Promise<{ nome: string; categoriaId: string } | null> {
  const r = await pool.query<{ nome: string; categoria_id: string }>(
    "select nome, categoria_id from projetos where id = $1",
    [id],
  );
  const linha = r.rows[0];
  return linha ? { nome: linha.nome, categoriaId: linha.categoria_id } : null;
}

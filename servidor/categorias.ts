import type { Pool } from "./db.ts";
import type { Categoria, CategoriaComId, CategoriaResumo } from "../core/tipos.ts";

/** As categorias que o projeto usa, principal primeiro. A ordem é contrato: a barra lateral
 * desenha nessa sequência e `fundirArestas` resolve empate pela primeira. */
export async function categoriasDoProjeto(pool: Pool, projetoId: string): Promise<CategoriaComId[]> {
  const r = await pool.query<{ id: string; definicao: Categoria }>(
    `select c.id, c.definicao
       from projeto_categorias pc join categorias c on c.id = pc.categoria_id
      where pc.projeto_id = $1
      order by pc.ordem, c.nome`,
    [projetoId],
  );
  return r.rows.map((l) => ({ ...l.definicao, id: l.id }));
}

/** Aceita a categoria só se ela estiver ligada ao projeto — um `categoria_id` qualquer não
 * pode entrar num nó só porque existe na tabela `categorias`. */
export async function categoriaDoProjeto(
  pool: Pool,
  projetoId: string,
  categoriaId: string,
): Promise<CategoriaComId | null> {
  const r = await pool.query<{ id: string; definicao: Categoria }>(
    `select c.id, c.definicao
       from projeto_categorias pc join categorias c on c.id = pc.categoria_id
      where pc.projeto_id = $1 and c.id = $2`,
    [projetoId, categoriaId],
  );
  const linha = r.rows[0];
  return linha ? { ...linha.definicao, id: linha.id } : null;
}

export async function listarCategorias(pool: Pool): Promise<CategoriaResumo[]> {
  const r = await pool.query<CategoriaResumo>("select id, nome from categorias order by nome");
  return r.rows;
}

export async function buscarCategoriaPorNome(pool: Pool, nome: string): Promise<{ id: string; definicao: Categoria } | null> {
  const r = await pool.query<{ id: string; definicao: Categoria }>(
    "select id, definicao from categorias where nome = $1",
    [nome],
  );
  return r.rows[0] ?? null;
}

export async function buscarCategoriaPorId(pool: Pool, id: string): Promise<Categoria | null> {
  const r = await pool.query<{ definicao: Categoria }>("select definicao from categorias where id = $1", [id]);
  return r.rows[0]?.definicao ?? null;
}

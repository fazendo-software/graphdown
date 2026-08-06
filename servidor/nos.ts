import type { Pool, PoolClient } from "pg";
import type { Aresta, Categoria, CategoriaComId, Layout, No, ResultadoBusca } from "../core/tipos.ts";
import { camposPadrao, idDeTitulo, validarCampos } from "../core/categoria.ts";

/**
 * Busca textual no projeto aberto, sobre a coluna gerada `nos.busca_tsv` (título + corpo +
 * campos) e o índice GIN que já existem desde a migração inicial.
 *
 * `websearch_to_tsquery` e não `to_tsquery`: o texto vem de um campo de busca, então é
 * arbitrário — `to_tsquery` levanta exceção em `"a & "` ou `"!!!"`, `websearch` nunca quebra.
 *
 * O `ilike` ao lado existe porque full-text não casa prefixo (`proc` não acha `processo`),
 * que é o caso comum enquanto se digita. Ele cobre prefixo no título; o tsvector cobre corpo
 * e campos. Quem casa só pelo `ilike` tem rank zero e cai para o fim — ordem secundária é o
 * título.
 *
 * `StartSel`/`StopSel` viram `«»` de propósito: o padrão do `ts_headline` é `<b>`/`</b>` e ele
 * **não escapa** o resto do texto — corpo com `<script>` sairia intacto. Com marcador que não
 * é HTML, o front renderiza `trecho` como texto puro e o problema não existe.
 */
export async function buscarNos(pool: Pool, projetoId: string, q: string): Promise<ResultadoBusca[]> {
  const termo = q.trim();
  if (!termo) return [];
  // `%` e `_` digitados pelo usuário são literais, não curingas.
  const like = `%${termo.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const r = await pool.query<ResultadoBusca>(
    `select n.id, n.titulo,
            ts_headline('portuguese', n.titulo || ' ' || n.corpo, c.q,
                        'MaxFragments=1, MaxWords=14, MinWords=5, StartSel=«, StopSel=»') as trecho
       from nos n, websearch_to_tsquery('portuguese', $2) as c(q)
      where n.projeto_id = $1 and n.apagado_em is null
        and (n.busca_tsv @@ c.q or n.titulo ilike $3)
      order by ts_rank(n.busca_tsv, c.q) desc, n.titulo
      limit 30`,
    [projetoId, termo, like],
  );
  return r.rows;
}

export async function listarNos(pool: Pool, projetoId: string): Promise<No[]> {
  const r = await pool.query<No>(
    `select id, titulo, categoria_id, campos, versao, erro
       from nos where projeto_id = $1 and apagado_em is null
       order by criado_em`,
    [projetoId],
  );
  return r.rows.map((n) => ({ ...n, erro: n.erro ?? undefined }));
}

export async function buscarNo(
  pool: Pool,
  projetoId: string,
  id: string,
): Promise<(No & { corpo: string }) | null> {
  const r = await pool.query<No & { corpo: string }>(
    `select id, titulo, categoria_id, campos, corpo, versao, erro
       from nos where projeto_id = $1 and id = $2 and apagado_em is null`,
    [projetoId, id],
  );
  const no = r.rows[0];
  return no ? { ...no, erro: no.erro ?? undefined } : null;
}

/** Só os nós com posição conhecida — nó nunca posicionado fica fora, é o sinal que
 * `web/src/layoutAuto.ts` usa para saber quem precisa de dagre. */
export async function buscarLayout(pool: Pool, projetoId: string): Promise<Layout> {
  const r = await pool.query<{ id: string; pos_x: number; pos_y: number }>(
    `select id, pos_x, pos_y from nos
      where projeto_id = $1 and apagado_em is null and pos_x is not null and pos_y is not null`,
    [projetoId],
  );
  const layout: Layout = {};
  for (const linha of r.rows) layout[linha.id] = { x: linha.pos_x, y: linha.pos_y };
  return layout;
}

/** Persistido só ao soltar (`t: "soltou"`) — arraste em si é efêmero, via WS, sem gravar. */
export async function atualizarPosicao(
  pool: Pool,
  projetoId: string,
  id: string,
  x: number,
  y: number,
): Promise<boolean> {
  const r = await pool.query(
    `update nos set pos_x = $3, pos_y = $4, atualizado_em = now()
       where projeto_id = $1 and id = $2 and apagado_em is null`,
    [projetoId, id, x, y],
  );
  return (r.rowCount ?? 0) > 0;
}

/** Sufixo `-2`, `-3`... considera também os apagados: o id não é liberado (soft delete). */
async function idLivre(pool: Pool, projetoId: string, titulo: string): Promise<string> {
  const existentes = new Set(
    (await pool.query<{ id: string }>("select id from nos where projeto_id = $1", [projetoId])).rows.map(
      (r) => r.id,
    ),
  );
  const base = idDeTitulo(titulo);
  let id = base;
  for (let n = 2; existentes.has(id); n++) id = `${base}-${n}`;
  return id;
}

export async function criarNo(
  pool: Pool,
  projetoId: string,
  usuarioId: string,
  titulo: string,
  camposParciais: Record<string, unknown> | undefined,
  categoria: CategoriaComId,
): Promise<{ id: string }> {
  const id = await idLivre(pool, projetoId, titulo);
  const campos = { ...camposPadrao(categoria), ...camposParciais };
  const erro = validarCampos(categoria, campos);
  await pool.query(
    `insert into nos (projeto_id, id, titulo, categoria_id, campos, erro, criado_por)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [projetoId, id, titulo, categoria.id, campos, erro ?? null, usuarioId],
  );
  return { id };
}

export async function atualizarCampos(
  pool: Pool,
  projetoId: string,
  id: string,
  camposParciais: Record<string, unknown>,
  categoria: Categoria,
): Promise<No | null> {
  const atual = await pool.query<{ campos: Record<string, unknown> }>(
    "select campos from nos where projeto_id = $1 and id = $2 and apagado_em is null",
    [projetoId, id],
  );
  if (!atual.rows[0]) return null;
  const campos = { ...atual.rows[0].campos, ...camposParciais };
  const erro = validarCampos(categoria, campos);
  const r = await pool.query<No>(
    `update nos set campos = $3, erro = $4, atualizado_em = now()
       where projeto_id = $1 and id = $2 and apagado_em is null
       returning id, titulo, categoria_id, campos, versao, erro`,
    [projetoId, id, campos, erro ?? null],
  );
  const no = r.rows[0];
  return no ? { ...no, erro: no.erro ?? undefined } : null;
}

export async function atualizarTitulo(pool: Pool, projetoId: string, id: string, titulo: string): Promise<No | null> {
  const r = await pool.query<No>(
    `update nos set titulo = $3, atualizado_em = now()
       where projeto_id = $1 and id = $2 and apagado_em is null
       returning id, titulo, categoria_id, campos, versao, erro`,
    [projetoId, id, titulo],
  );
  const no = r.rows[0];
  return no ? { ...no, erro: no.erro ?? undefined } : null;
}

export type ResultadoCorpo =
  | { status: "ok"; versao: number }
  | { status: "conflito"; versao: number; corpo: string }
  | { status: "nao-encontrado" };

/** LWW com aviso: só grava se `versaoEsperada` bater com a versão atual (ver fundacao/tempo-real). */
export async function atualizarCorpo(
  pool: Pool,
  projetoId: string,
  id: string,
  corpo: string,
  versaoEsperada: number,
): Promise<ResultadoCorpo> {
  const atual = await pool.query<{ versao: number; corpo: string }>(
    "select versao, corpo from nos where projeto_id = $1 and id = $2 and apagado_em is null",
    [projetoId, id],
  );
  const linha = atual.rows[0];
  if (!linha) return { status: "nao-encontrado" };
  if (linha.versao !== versaoEsperada) {
    return { status: "conflito", versao: linha.versao, corpo: linha.corpo };
  }
  const r = await pool.query<{ versao: number }>(
    `update nos set corpo = $3, versao = versao + 1, atualizado_em = now()
       where projeto_id = $1 and id = $2 and versao = $4
       returning versao`,
    [projetoId, id, corpo, versaoEsperada],
  );
  // versao mudou entre o select e o update (corrida concorrente) — mesmo aviso de conflito,
  // agora contra o valor que de fato está no banco.
  if (!r.rows[0]) {
    const recheque = await pool.query<{ versao: number; corpo: string }>(
      "select versao, corpo from nos where projeto_id = $1 and id = $2 and apagado_em is null",
      [projetoId, id],
    );
    // O nó pode ter sido apagado entre o SELECT e o UPDATE. Não tente ler
    // `rows[0]` nesse caso: a corrida corpo×delete é um 404 legítimo.
    if (!recheque.rows[0]) return { status: "nao-encontrado" };
    return { status: "conflito", versao: recheque.rows[0].versao, corpo: recheque.rows[0].corpo };
  }
  return { status: "ok", versao: r.rows[0].versao };
}

/** Soft delete do nó **e** de toda aresta em que ele é origem ou destino, na mesma transação —
 * senão o nó escondido continua sendo `de` de uma aresta viva e reaparece como fantasma. */
export async function apagarNo(
  pool: Pool,
  projetoId: string,
  id: string,
): Promise<{ no: No; arestasApagadas: (Aresta & { id: string })[] } | null> {
  const cliente: PoolClient = await pool.connect();
  try {
    await cliente.query("begin");
    const no = await cliente.query<No>(
      `update nos set apagado_em = now()
         where projeto_id = $1 and id = $2 and apagado_em is null
         returning id, titulo, categoria_id, campos, versao, erro`,
      [projetoId, id],
    );
    if (!no.rows[0]) {
      await cliente.query("rollback");
      return null;
    }
    const arestas = await cliente.query<Aresta & { id: string }>(
      `update arestas set apagado_em = now()
         where projeto_id = $1 and (de = $2 or para = $2) and apagado_em is null
         returning id, de, para, quando, tipo, campos`,
      [projetoId, id],
    );
    await cliente.query("commit");
    return {
      no: { ...no.rows[0], erro: no.rows[0].erro ?? undefined },
      arestasApagadas: arestas.rows.map((a) => ({ ...a, quando: a.quando ?? undefined, tipo: a.tipo ?? undefined })),
    };
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}

import type { Pool, PoolClient } from "pg";
import type { Aresta, Categoria, CategoriaComId, EstadoExecucao, Layout, No, ResultadoBusca } from "../core/tipos.ts";
import { camposPadrao, idDeTitulo, validarCampos } from "../core/categoria.ts";

/** Uma lista só: listagem, detalhe, update e delete devolvem o mesmo nó, senão o
 * `no-mudou` sai com menos campos que o snapshot do grafo. */
const COLUNAS_NO = "id, titulo, categoria_id, campos, versao, erro, eh_tarefa, estado_execucao";

type LinhaNo = {
  id: string;
  titulo: string;
  categoria_id: string;
  campos: Record<string, unknown>;
  versao: number;
  erro: string | null;
  eh_tarefa: boolean;
  estado_execucao: EstadoExecucao | null;
};

/** Duas colunas no banco, um par no contrato: `execucao` viaja junto em toda resposta. */
function paraNo(linha: LinhaNo): No {
  return {
    id: linha.id,
    titulo: linha.titulo,
    categoria_id: linha.categoria_id,
    campos: linha.campos,
    versao: linha.versao,
    erro: linha.erro ?? undefined,
    execucao: { tarefa: linha.eh_tarefa, estado: linha.estado_execucao },
  };
}

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
  const r = await pool.query<LinhaNo>(
    `select ${COLUNAS_NO}
       from nos where projeto_id = $1 and apagado_em is null
       order by criado_em`,
    [projetoId],
  );
  return r.rows.map(paraNo);
}

export async function buscarNo(
  pool: Pool,
  projetoId: string,
  id: string,
): Promise<(No & { corpo: string }) | null> {
  const r = await pool.query<LinhaNo & { corpo: string }>(
    `select ${COLUNAS_NO}, corpo
       from nos where projeto_id = $1 and id = $2 and apagado_em is null`,
    [projetoId, id],
  );
  const linha = r.rows[0];
  return linha ? { ...paraNo(linha), corpo: linha.corpo } : null;
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

/** Chave ausente mantém o que já estava — PATCH é parcial também dentro de `execucao`. */
export type PatchNo = {
  titulo?: string;
  campos?: Record<string, unknown>;
  execucao?: { tarefa?: boolean; estado?: EstadoExecucao | null };
};

/** Tarefa sem estado começa `pendente`; deixar de ser tarefa limpa o estado. Fica aqui,
 * no caminho de escrita, para que nenhuma rota consiga gravar o par incoerente. */
function normalizarExecucao(atual: No["execucao"], patch: PatchNo["execucao"]): No["execucao"] {
  if (!patch) return atual;
  const tarefa = patch.tarefa ?? atual.tarefa;
  const estado = patch.estado === undefined ? atual.estado : patch.estado;
  return { tarefa, estado: tarefa ? (estado ?? "pendente") : null };
}

/**
 * Título, campos e execução em um único UPDATE: o modal salva os três de uma vez e o
 * outro cliente não pode ver um estado intermediário nem receber dois `no-mudou`.
 *
 * Recebe o nó já lido (a rota precisa dele para achar a categoria) — assim a mesclagem de
 * `campos` não custa uma segunda consulta.
 */
export async function atualizarNo(
  pool: Pool,
  projetoId: string,
  id: string,
  patch: PatchNo,
  categoria: Categoria,
): Promise<No | null> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");
    // O PATCH é parcial: trancar e reler impede que título/campos de uma pessoa restaurem
    // o estado de execução que outra pessoa acabou de gravar.
    const lido = await cliente.query<LinhaNo>(
      `select ${COLUNAS_NO} from nos
        where projeto_id = $1 and id = $2 and apagado_em is null for update`,
      [projetoId, id],
    );
    if (!lido.rows[0]) {
      await cliente.query("rollback");
      return null;
    }
    const atual = paraNo(lido.rows[0]);
    const campos = patch.campos ? { ...atual.campos, ...patch.campos } : atual.campos;
    // Revalidar só quando `campos` muda: um PATCH de execução não deve apagar nem inventar
    // o aviso de esquema que já estava registrado.
    const erro = patch.campos ? validarCampos(categoria, campos) : atual.erro;
    const execucao = normalizarExecucao(atual.execucao, patch.execucao);
    const r = await cliente.query<LinhaNo>(
      `update nos
          set titulo = $3, campos = $4, erro = $5, eh_tarefa = $6, estado_execucao = $7,
              atualizado_em = now()
        where projeto_id = $1 and id = $2 and apagado_em is null
        returning ${COLUNAS_NO}`,
      [projetoId, id, patch.titulo ?? atual.titulo, campos, erro ?? null, execucao.tarefa, execucao.estado],
    );
    await cliente.query("commit");
    return paraNo(r.rows[0]);
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
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
    const no = await cliente.query<LinhaNo>(
      `update nos set apagado_em = now()
         where projeto_id = $1 and id = $2 and apagado_em is null
         returning ${COLUNAS_NO}`,
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
      no: paraNo(no.rows[0]),
      arestasApagadas: arestas.rows.map((a) => ({ ...a, quando: a.quando ?? undefined, tipo: a.tipo ?? undefined })),
    };
  } catch (erro) {
    await cliente.query("rollback");
    throw erro;
  } finally {
    cliente.release();
  }
}

import type { Pool } from "./db.ts";
import { fundirArestas, fundirCamposAresta } from "../core/categoria.ts";
import type {
  Aresta,
  Categoria,
  CategoriaComId,
  EstadoExecucao,
  ExportacaoSnapshot,
  No,
  Nota,
  ObjetoSeta,
} from "../core/tipos.ts";

/**
 * Lê todas as partes do documento na mesma transação. Não chama a rota de detalhe do nó:
 * corpos, posições e o restante do grafo saem de consultas em lote no mesmo snapshot.
 */
export async function montarExportacao(pool: Pool, projetoId: string): Promise<ExportacaoSnapshot | null> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin transaction isolation level repeatable read read only");
    const projeto = await cliente.query<{ id: string; nome: string }>(
      "select id, nome from projetos where id = $1",
      [projetoId],
    );
    if (!projeto.rows[0]) {
      await cliente.query("rollback");
      return null;
    }
    const categorias = await cliente.query<{ id: string; definicao: Categoria }>(
      `select c.id, c.definicao
         from projeto_categorias pc join categorias c on c.id = pc.categoria_id
        where pc.projeto_id = $1
        order by pc.ordem, c.nome`,
      [projetoId],
    );
    const nos = await cliente.query<
      No & { corpo: string; pos_x: number | null; pos_y: number | null; eh_tarefa: boolean; estado_execucao: EstadoExecucao | null }
    >(
      `select id, titulo, categoria_id, campos, corpo, versao, erro, pos_x, pos_y, eh_tarefa, estado_execucao
         from nos where projeto_id = $1 and apagado_em is null
        order by criado_em, id`,
      [projetoId],
    );
    const notas = await cliente.query<Nota>(
      `select id, conteudo, pos_x as x, pos_y as y from notas
        where projeto_id = $1 order by criado_em, id`,
      [projetoId],
    );
    const objetosSeta = await cliente.query<ObjetoSeta>(
      `select id, tipo, pontos from objetos_seta where projeto_id = $1 order by criado_em, id`,
      [projetoId],
    );
    const arestas = await cliente.query<Aresta & { id: string }>(
      `select id, de, para, quando, tipo, campos from arestas
        where projeto_id = $1 and apagado_em is null order by criado_em, id`,
      [projetoId],
    );
    // Normalmente somente `de` pode ser ausente (para tem FK), mas checamos as duas
    // pontas para que o contrato permaneça correto diante de dados legados.
    const fantasmas = await cliente.query<{ id: string }>(
      `select distinct pontas.id
         from (
           select de as id from arestas where projeto_id = $1 and apagado_em is null
           union all
           select para as id from arestas where projeto_id = $1 and apagado_em is null
         ) pontas
         left join nos n on n.projeto_id = $1 and n.id = pontas.id and n.apagado_em is null
        where n.id is null
        order by pontas.id`,
      [projetoId],
    );
    await cliente.query("commit");

    const categoriasComId: CategoriaComId[] = categorias.rows.map((linha) => ({ ...linha.definicao, id: linha.id }));
    return {
      versao: 1,
      exportadoEm: new Date().toISOString(),
      projeto: { id: projeto.rows[0].id, titulo: projeto.rows[0].nome },
      categorias: categoriasComId,
      camposAresta: fundirCamposAresta(categoriasComId),
      estilosAresta: fundirArestas(categoriasComId),
      nos: nos.rows.map((no) => ({
        id: no.id,
        titulo: no.titulo,
        categoria_id: no.categoria_id,
        campos: no.campos,
        corpo: no.corpo,
        versao: no.versao,
        erro: no.erro ?? undefined,
        // Viaja no snapshot para o contrato do nó ser um só; a serialização
        // Markdown/RFC continua ignorando execução (ver `dadosDoNo`).
        execucao: { tarefa: no.eh_tarefa, estado: no.estado_execucao },
        ...(no.pos_x === null || no.pos_y === null ? {} : { posicao: { x: no.pos_x, y: no.pos_y } }),
      })),
      notas: notas.rows,
      objetosSeta: objetosSeta.rows,
      arestas: arestas.rows.map((aresta) => ({
        ...aresta,
        quando: aresta.quando ?? undefined,
        tipo: aresta.tipo ?? undefined,
      })),
      fantasmas: fantasmas.rows.map((linha) => linha.id),
    };
  } catch (erro) {
    try {
      await cliente.query("rollback");
    } catch {
      // A transação pode já ter sido encerrada pelo banco; a falha original é a útil.
    }
    throw erro;
  } finally {
    cliente.release();
  }
}

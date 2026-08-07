import type { Aresta, No } from "./tipos.ts";

/**
 * Progresso é derivado, nunca armazenado: o snapshot do grafo e cada `no-mudou` já trazem
 * `execucao`, então recalcular aqui é mais barato e mais honesto que manter percentual no
 * banco. Puro de propósito — sem React, sem Postgres, sem layout.
 */

/** Só as pontas importam: aceita `Aresta` e `Aresta & { id }` sem pedir o resto. */
type Ligacao = Pick<Aresta, "de" | "para">;

/** Idem para o nó: o canvas já tem `execucao` no dado de render e não precisa remontar
 * um `No` inteiro só para pedir o progresso. */
type NoProgresso = Pick<No, "id" | "execucao">;

export type ResumoProgresso = {
  /** Denominador global: nós com `execucao.tarefa`. Informativo, nota e seta ficam fora. */
  tarefas: number;
  concluidas: number;
  emAndamento: number;
  bloqueadas: number;
};

/** `sem_tarefas` é um resultado, não `0%`: um fluxo de documentação não está atrasado. */
export type ProgressoFluxo =
  | { estado: "sem_tarefas" }
  | { estado: "com_tarefas"; tarefas: number; concluidas: number; percentual: number };

export type ProgressoRaiz = { id: string; progresso: ProgressoFluxo };

export type Progresso = { resumo: ResumoProgresso; raizes: ProgressoRaiz[] };

/**
 * Arredondar não pode inventar "acabou" nem apagar "já começou": 199/200 seria 100% e
 * 1/300 seria 0%. Só o fluxo inteiro concluído chega a 100, só o intocado fica em 0.
 */
export function percentualDeProgresso(concluidas: number, tarefas: number): number {
  if (concluidas === tarefas) return 100;
  if (concluidas === 0) return 0;
  return Math.min(99, Math.max(1, Math.round((concluidas / tarefas) * 100)));
}

/**
 * Resumo global do projeto e um badge por fluxo-raiz.
 *
 * Uma raiz é um nó real sem entrada vinda de **outro** nó real — laço em si mesmo não
 * desqualifica, senão um ciclo de dois nós sumiria da lateral. Ciclo sem nenhuma raiz
 * continua contando no resumo global: não se inventa um "primeiro nó".
 *
 * Custo `O(V + E)` por raiz percorrida.
 */
export function calcularProgresso(nos: readonly NoProgresso[], arestas: readonly Ligacao[]): Progresso {
  const porId = new Map(nos.map((no) => [no.id, no]));
  const saidas = new Map<string, string[]>();
  const temEntrada = new Set<string>();
  for (const { de, para } of arestas) {
    // Ponta fantasma não existe como nó: não entra no percurso nem cria raiz falsa.
    if (!porId.has(de) || !porId.has(para)) continue;
    const lista = saidas.get(de);
    if (lista) lista.push(para);
    else saidas.set(de, [para]);
    if (de !== para) temEntrada.add(para);
  }

  const resumo: ResumoProgresso = { tarefas: 0, concluidas: 0, emAndamento: 0, bloqueadas: 0 };
  for (const { execucao } of nos) {
    if (!execucao.tarefa) continue;
    resumo.tarefas++;
    if (execucao.estado === "concluido") resumo.concluidas++;
    else if (execucao.estado === "em_andamento") resumo.emAndamento++;
    else if (execucao.estado === "bloqueado") resumo.bloqueadas++;
  }

  const raizes = nos
    .filter((no) => !temEntrada.has(no.id))
    .map((no) => ({ id: no.id, progresso: progressoAbaixo(no.id, porId, saidas) }));

  return { resumo, raizes };
}

/**
 * A raiz entra já visitada: o badge conta o que vem **abaixo** dela, e a volta de um ciclo
 * para no ponto de partida. O `Set` faz o losango contar a tarefa compartilhada uma vez só;
 * nó informativo não soma, mas o percurso segue por ele.
 */
function progressoAbaixo(
  raiz: string,
  porId: ReadonlyMap<string, NoProgresso>,
  saidas: ReadonlyMap<string, string[]>,
): ProgressoFluxo {
  const visitados = new Set([raiz]);
  const pilha = [raiz];
  let tarefas = 0;
  let concluidas = 0;
  while (pilha.length > 0) {
    for (const vizinho of saidas.get(pilha.pop()!) ?? []) {
      if (visitados.has(vizinho)) continue;
      visitados.add(vizinho);
      pilha.push(vizinho);
      const { execucao } = porId.get(vizinho)!;
      if (!execucao.tarefa) continue;
      tarefas++;
      if (execucao.estado === "concluido") concluidas++;
    }
  }
  if (tarefas === 0) return { estado: "sem_tarefas" };
  return { estado: "com_tarefas", tarefas, concluidas, percentual: percentualDeProgresso(concluidas, tarefas) };
}

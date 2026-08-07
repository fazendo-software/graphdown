import type { EstadoExecucao, No } from "../../core/tipos.ts";

/**
 * Como o estado de execução se apresenta. Uma fonte só para o selo do nó, a camada de
 * fluxo da aresta, o modal e a lateral — senão "concluído" fica verde num lugar e
 * azul-esverdeado no outro.
 */

export const ROTULO_EXECUCAO: Record<EstadoExecucao, string> = {
  pendente: "pendente",
  em_andamento: "em andamento",
  concluido: "concluído",
  bloqueado: "bloqueado",
};

/** Glifo antes da cor: verde e vermelho sozinhos não distinguem nada em escala de cinza
 * nem para quem não separa as duas. O selo mostra glifo **e** texto. */
export const GLIFO_EXECUCAO: Record<EstadoExecucao, string> = {
  pendente: "○",
  em_andamento: "◐",
  concluido: "●",
  bloqueado: "▲",
};

/** `null` = segue o neutro do tema. Pendente é neutro de propósito: começar uma tarefa
 * não é um evento visual, terminá-la ou travá-la é. */
const CHAVE_COR: Record<EstadoExecucao, string | null> = {
  pendente: null,
  em_andamento: "execEmAndamento",
  concluido: "execConcluido",
  bloqueado: "execBloqueado",
};

export function corDeExecucao(
  estado: EstadoExecucao | null,
  cores: Record<string, string>,
  neutra: string,
): string {
  const chave = estado ? CHAVE_COR[estado] : null;
  return chave ? cores[chave] : neutra;
}

/**
 * Camada de fluxo da relação: cor pelo estado da tarefa de **destino**. Destino
 * informativo ou pendente fica com a cor da própria aresta, então o traço, a ponta e a
 * cor semântica declaradas na categoria continuam sendo o que se vê — isto é uma camada
 * por cima, não uma substituição.
 */
export function corDeFluxo(
  destino: No["execucao"] | undefined,
  cores: Record<string, string>,
  corDaAresta: string,
): string {
  return destino?.tarefa ? corDeExecucao(destino.estado, cores, corDaAresta) : corDaAresta;
}

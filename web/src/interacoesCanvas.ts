import type { Posicao } from "../../core/tipos.ts";

type ArestaLigada = { source: string; target: string };

/** Relações só podem acompanhar uma cópia quando as duas pontas também vão com ela. */
export function arestasInternas<T extends ArestaLigada>(arestas: T[], ids: Set<string>): T[] {
  return arestas.filter((aresta) => ids.has(aresta.source) && ids.has(aresta.target));
}

/** Colar preserva a posição absoluta do conjunto e só aplica um deslocamento visual. */
export function posicaoColada(posicao: Posicao, deslocamento = 40): Posicao {
  return { x: Math.round(posicao.x + deslocamento), y: Math.round(posicao.y + deslocamento) };
}

/** Atalhos do canvas não podem sequestrar a edição ou seleção normal da página. */
export function deveProcessarAtalhoCanvas(canvasAtivo: boolean, alvoEditavel: boolean, haTextoSelecionado: boolean): boolean {
  return canvasAtivo && !alvoEditavel && !haTextoSelecionado;
}

/** `click.detail === 0` é a ativação sem mouse produzida por Enter/Espaço. */
export function ehAtivacaoPorTeclado(detail: number): boolean {
  return detail === 0;
}

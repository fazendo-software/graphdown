import dagre from "@dagrejs/dagre";
import type { Aresta, Layout } from "../../core/tipos.ts";
import { tamanhoDoNo, type Tamanho } from "./rough.ts";

/**
 * Calcula posição só para os ids sem posição salva. Quem já tem, não se mexe.
 * `formaDe` existe porque as formas têm tamanhos diferentes — o dagre precisa do tamanho
 * certo de cada nó pra não encavalar losango com retângulo.
 */
export function completarLayout(
  ids: string[],
  arestas: Aresta[],
  salvo: Layout,
  formaDe: (id: string) => string,
): Layout {
  const faltando = ids.filter((id) => !salvo[id]);
  if (faltando.length === 0) return salvo;

  const tamanho = (id: string): Tamanho => tamanhoDoNo(formaDe(id));

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of ids) {
    const { largura, altura } = tamanho(id);
    g.setNode(id, { width: largura, height: altura });
  }
  for (const a of arestas) if (g.hasNode(a.de) && g.hasNode(a.para)) g.setEdge(a.de, a.para);
  dagre.layout(g);

  const saida: Layout = { ...salvo };
  for (const id of faltando) {
    const n = g.node(id);
    const { largura, altura } = tamanho(id);
    saida[id] = { x: Math.round(n.x - largura / 2), y: Math.round(n.y - altura / 2) };
  }
  return saida;
}

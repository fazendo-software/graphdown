import dagre from "@dagrejs/dagre";
import type { Aresta, Layout } from "../../core/tipos.ts";
import { ALTURA, LARGURA } from "./NoProcesso.tsx";

/** Calcula posição só para os ids sem posição salva. Quem já tem, não se mexe. */
export function completarLayout(ids: string[], arestas: Aresta[], salvo: Layout): Layout {
  const faltando = ids.filter((id) => !salvo[id]);
  if (faltando.length === 0) return salvo;

  const g = new dagre.graphlib.Graph();
  g.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 90 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const id of ids) g.setNode(id, { width: LARGURA, height: ALTURA });
  for (const a of arestas) if (g.hasNode(a.de) && g.hasNode(a.para)) g.setEdge(a.de, a.para);
  dagre.layout(g);

  const saida: Layout = { ...salvo };
  for (const id of faltando) {
    const n = g.node(id);
    saida[id] = { x: Math.round(n.x - LARGURA / 2), y: Math.round(n.y - ALTURA / 2) };
  }
  return saida;
}

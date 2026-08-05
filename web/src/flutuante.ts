import { Position, type InternalNode, type Node } from "@xyflow/react";

/**
 * Aresta flutuante: em vez de nascer sempre embaixo e morrer sempre em cima, ela sai do
 * lado do nó que aponta para o destino. O ponto é a interseção da reta entre os dois
 * centros com a borda da caixa — método da documentação do React Flow.
 *
 * A caixa é o retângulo do nó, não o contorno desenhado: no losango e no ator a seta
 * encosta um pouco fora do traço. Aceito, o alternativo é interseção por forma.
 */
function intersecao(no: InternalNode<Node>, alvo: InternalNode<Node>): { x: number; y: number } {
  const l = no.measured.width ?? 0;
  const a = no.measured.height ?? 0;
  const l2 = l / 2;
  const a2 = a / 2;
  const x2 = no.internals.positionAbsolute.x + l2;
  const y2 = no.internals.positionAbsolute.y + a2;
  const x1 = alvo.internals.positionAbsolute.x + (alvo.measured.width ?? 0) / 2;
  const y1 = alvo.internals.positionAbsolute.y + (alvo.measured.height ?? 0) / 2;

  if (l2 === 0 || a2 === 0) return { x: x2, y: y2 };

  const xx = (x1 - x2) / (2 * l2) - (y1 - y2) / (2 * a2);
  const yy = (x1 - x2) / (2 * l2) + (y1 - y2) / (2 * a2);
  const k = 1 / (Math.abs(xx) + Math.abs(yy) || 1);
  const px = k * xx;
  const py = k * yy;
  return { x: l2 * (px + py) + x2, y: a2 * (-px + py) + y2 };
}

/** De que lado da caixa o ponto caiu — define a curvatura da bezier. */
function ladoDoPonto(no: InternalNode<Node>, ponto: { x: number; y: number }): Position {
  const { x, y } = no.internals.positionAbsolute;
  const l = no.measured.width ?? 0;
  const a = no.measured.height ?? 0;
  const px = Math.round(ponto.x);
  const py = Math.round(ponto.y);

  if (px <= Math.round(x) + 1) return Position.Left;
  if (px >= Math.round(x + l) - 1) return Position.Right;
  if (py <= Math.round(y) + 1) return Position.Top;
  return Position.Bottom;
}

export type Pontas = {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  ladoOrigem: Position;
  ladoDestino: Position;
};

export function pontasDaAresta(
  origem: InternalNode<Node>,
  destino: InternalNode<Node>,
): Pontas {
  const o = intersecao(origem, destino);
  const d = intersecao(destino, origem);
  return {
    sx: o.x,
    sy: o.y,
    tx: d.x,
    ty: d.y,
    ladoOrigem: ladoDoPonto(origem, o),
    ladoDestino: ladoDoPonto(destino, d),
  };
}

import { memo, useMemo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { caminho, seedDoId } from "./rough.ts";
import type { EstiloAresta } from "../../core/tipos.ts";

export const ARESTA_PADRAO: Required<EstiloAresta> = {
  estilo: "continua",
  ponta: "cheia",
  cor: "#52525b",
};

const TRACEJADO: Record<string, number[] | undefined> = {
  continua: undefined,
  tracejada: [8, 6],
  pontilhada: [2, 5],
};

function Componente({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  markerEnd,
  markerStart,
  data,
}: EdgeProps) {
  const { estilo, cor } = { ...ARESTA_PADRAO, ...(data as EstiloAresta | undefined) };

  const [d, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const tracos = useMemo(
    () =>
      caminho(d, {
        seed: seedDoId(id),
        roughness: 1.1,
        bowing: 0.8,
        stroke: cor,
        strokeLineDash: TRACEJADO[estilo],
      }),
    [d, id, cor, estilo],
  );

  return (
    <>
      {tracos.map((t, i) => (
        // `style` e obrigatorio: sem ele o BaseEdge pinta com o CSS do React Flow e a cor
        // que foi pro rough nunca chega ao SVG.
        <BaseEdge
          key={i}
          path={t.d}
          style={{ stroke: cor, strokeWidth: 1.4 }}
          markerEnd={i === 0 ? markerEnd : undefined}
          markerStart={i === 0 ? markerStart : undefined}
        />
      ))}
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: "#fff",
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
              color: "#52525b",
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const ArestaRough = memo(Componente);

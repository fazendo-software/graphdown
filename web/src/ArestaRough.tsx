import { memo, useMemo } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { caminho, seedDoId } from "./rough.ts";

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
}: EdgeProps) {
  const [d, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  const tracos = useMemo(
    () => caminho(d, { seed: seedDoId(id), roughness: 1.1, bowing: 0.8, stroke: "#52525b" }),
    [d, id],
  );

  return (
    <>
      {tracos.map((t, i) => (
        <BaseEdge key={i} path={t.d} markerEnd={i === 0 ? markerEnd : undefined} />
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

import { memo, useMemo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { retangulo, seedDoId } from "./rough.ts";

export const LARGURA = 200;
export const ALTURA = 76;

export type DadosNo = {
  titulo: string;
  cor: string;
  fantasma: boolean;
  erro?: string;
};

function Componente({ id, data, selected }: NodeProps) {
  const { titulo, cor, fantasma, erro } = data as DadosNo;
  const seed = useMemo(() => seedDoId(id), [id]);

  // Depende so do que muda a forma. Arrastar move por transform CSS e nao re-desenha.
  const tracos = useMemo(
    () =>
      retangulo(LARGURA, ALTURA, {
        seed,
        roughness: 1.4,
        bowing: 1.2,
        stroke: erro ? "#dc2626" : cor,
        strokeWidth: selected ? 3 : 2,
        fill: fantasma || erro ? undefined : `${cor}18`,
        fillStyle: "solid",
        strokeLineDash: fantasma || erro ? [8, 6] : undefined,
      }),
    [seed, cor, selected, fantasma, erro],
  );

  return (
    <div style={{ width: LARGURA, height: ALTURA, position: "relative" }}>
      <Handle type="target" position={Position.Top} />
      <svg width={LARGURA} height={ALTURA} style={{ position: "absolute", inset: 0 }}>
        {tracos.map((t, i) => (
          <path key={i} d={t.d} stroke={t.stroke} fill={t.fill} strokeWidth={t.strokeWidth} />
        ))}
      </svg>
      <div
        style={{
          position: "relative",
          padding: "12px 14px",
          fontSize: 14,
          lineHeight: 1.3,
          color: erro ? "#dc2626" : "#18181b",
          pointerEvents: "none",
        }}
      >
        <strong>{titulo}</strong>
        {erro ? <div style={{ fontSize: 11, marginTop: 4 }}>YAML inválido</div> : null}
        {fantasma ? <div style={{ fontSize: 11, marginTop: 4 }}>arquivo não existe</div> : null}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export const NoProcesso = memo(Componente);

import { memo, useMemo } from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useInternalNode,
  type EdgeProps,
} from "@xyflow/react";
import { caminho, seedDoId } from "./rough.ts";
import { pontasDaAresta } from "./flutuante.ts";
import { useCores } from "./tema.ts";
import { corDeFluxo } from "./execucao.ts";
import { ARESTA_PADRAO } from "./grafoRender.ts";
import type { DadosNo } from "./NoProcesso.tsx";
import type { EstiloAresta } from "../../core/tipos.ts";

const TRACEJADO: Record<string, number[] | undefined> = {
  continua: undefined,
  tracejada: [8, 6],
  pontilhada: [2, 5],
};

function Componente({
  id,
  source,
  target,
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
  const cores = useCores();
  const declarado = data as EstiloAresta | undefined;
  const estilo = declarado?.estilo ?? ARESTA_PADRAO.estilo;
  const cor = declarado?.cor || cores.aresta;
  const origem = useInternalNode(source);
  const destino = useInternalNode(target);
  const corFluxo = corDeFluxo((destino?.data as DadosNo | undefined)?.execucao, cores, cor);

  // Antes da primeira medição os nós não têm tamanho; aí valem as pontas fixas que o
  // React Flow calculou pelos handles.
  const pontas =
    origem?.measured.width && destino?.measured.width
      ? pontasDaAresta(origem, destino)
      : {
          sx: sourceX,
          sy: sourceY,
          tx: targetX,
          ty: targetY,
          ladoOrigem: sourcePosition,
          ladoDestino: targetPosition,
        };

  const [d, labelX, labelY] = getBezierPath({
    sourceX: pontas.sx,
    sourceY: pontas.sy,
    targetX: pontas.tx,
    targetY: pontas.ty,
    sourcePosition: pontas.ladoOrigem,
    targetPosition: pontas.ladoDestino,
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
          style={{ stroke: cor, strokeWidth: 1.4, strokeDasharray: t.strokeLineDash?.join(" ") }}
          markerEnd={i === 0 ? markerEnd : undefined}
          markerStart={i === 0 ? markerStart : undefined}
        />
      ))}
      {/* Camada leve, sem marcador nem eventos: o traço contínuo abaixo preserva a
          relação; os pontos animados deixam explícito o sentido do fluxo. A cor vem do
          estado da tarefa de destino, lido do nó vivo — assim um `no-mudou` repinta o
          fluxo sem reconstruir a aresta. */}
      <path
        className="aresta-fluxo"
        d={d}
        style={{ stroke: corFluxo, animationDelay: `-${seedDoId(id) % 1600}ms` }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              background: cores.rotuloFundo,
              padding: "2px 6px",
              borderRadius: 4,
              fontSize: 11,
              lineHeight: 1.35,
              color: cores.rotuloTexto,
              // Com todos os recursos preenchidos o rótulo fica longo; quebra em vez de
              // atravessar o canvas.
              maxWidth: 200,
              textAlign: "center",
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

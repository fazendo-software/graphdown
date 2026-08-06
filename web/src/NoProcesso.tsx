import { memo, useMemo, type CSSProperties } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { desenharForma, seedDoId, tamanhoDe } from "./rough.ts";
import { useCores } from "./tema.ts";

export type DadosNo = {
  titulo: string;
  cor: string;
  forma: string;
  fantasma: boolean;
  /** Valor de `campos[categoria.forma_por]`. Não usado no desenho — é o que agrupa o
   * outline da barra lateral, que só enxerga os nós já renderizados. */
  tipo?: string;
  /** Nome da categoria do nó, pelo mesmo motivo: agrupar o outline sem consultar o catálogo. */
  categoria?: string;
  erro?: string;
  /** Nome de quem está arrastando este nó agora, se for outra pessoa. */
  movidoPor?: string;
};

const CENTRADO: CSSProperties = {
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  textAlign: "center",
};

// Cada forma tem uma área útil diferente: no losango o texto só cabe na faixa do meio,
// e no ator ele vai embaixo da figura.
const RECUO: Record<string, CSSProperties> = {
  losango: { ...CENTRADO, padding: "0 24%" },
  estadio: { ...CENTRADO, padding: "0 18px" },
  paralelogramo: { padding: "12px 26px" },
  ator: { ...CENTRADO, alignItems: "flex-end", padding: "0 6px 6px" },
};
const RECUO_PADRAO: CSSProperties = { padding: "12px 14px" };

const LADOS = [Position.Top, Position.Right, Position.Bottom, Position.Left];

function Componente({ id, data, selected }: NodeProps) {
  const { titulo, cor, forma, fantasma, erro, movidoPor } = data as DadosNo;
  const seed = useMemo(() => seedDoId(id), [id]);
  const { largura, altura } = tamanhoDe(forma);
  const cores = useCores();

  // Depende so do que muda a forma. Arrastar move por transform CSS e nao re-desenha.
  const tracos = useMemo(
    () =>
      desenharForma(forma, {
        seed,
        roughness: 1.4,
        bowing: 1.2,
        stroke: erro ? "#dc2626" : cor,
        strokeWidth: selected ? 3 : 2,
        fill: fantasma || erro ? undefined : `${cor}${cores.alfa}`,
        fillStyle: "solid",
        strokeLineDash: fantasma || erro ? [8, 6] : undefined,
      }),
    [seed, forma, cor, selected, fantasma, erro, cores.alfa],
  );

  return (
    <div style={{ width: largura, height: altura, position: "relative" }}>
      {/* Um handle por lado. Com connectionMode Loose o React Flow deixa puxar e soltar
          em qualquer um deles, e a aresta flutuante escolhe sozinha por onde sair. */}
      {LADOS.map((lado) => (
        <Handle key={lado} id={lado} type="source" position={lado} className="lado" />
      ))}
      <svg width={largura} height={altura} style={{ position: "absolute", inset: 0 }}>
        {tracos.map((t, i) => (
          <path key={i} d={t.d} stroke={t.stroke} fill={t.fill} strokeWidth={t.strokeWidth} />
        ))}
      </svg>
      <div
        style={{
          position: "relative",
          fontSize: 14,
          lineHeight: 1.3,
          color: erro ? "#dc2626" : cores.texto,
          pointerEvents: "none",
          ...(RECUO[forma] ?? RECUO_PADRAO),
        }}
      >
        <span>
          <strong>{titulo}</strong>
          {erro ? <div style={{ fontSize: 11, marginTop: 4 }}>não confere com a categoria</div> : null}
          {fantasma ? <div style={{ fontSize: 11, marginTop: 4 }}>não existe</div> : null}
          {movidoPor ? (
            <div style={{ fontSize: 11, marginTop: 4, color: cor }}>✎ {movidoPor}</div>
          ) : null}
        </span>
      </div>
    </div>
  );
}

export const NoProcesso = memo(Componente);

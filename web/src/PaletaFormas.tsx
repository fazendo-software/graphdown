import { memo, useMemo } from "react";
import { desenharForma } from "./rough.ts";

const MINI = { largura: 44, altura: 30 };

/** Miniatura desenhada pelo mesmo código do canvas — paleta e nó nunca divergem. */
function Miniatura({ forma }: { forma: string }) {
  const tracos = useMemo(
    () =>
      desenharForma(
        forma,
        { seed: 7, roughness: 1.1, bowing: 0.9, stroke: "#3f3f46", strokeWidth: 1.4 },
        MINI,
      ),
    [forma],
  );
  return (
    <svg width={MINI.largura} height={MINI.altura} aria-hidden="true">
      {tracos.map((t, i) => (
        <path key={i} d={t.d} stroke={t.stroke} fill={t.fill} strokeWidth={t.strokeWidth} />
      ))}
    </svg>
  );
}

type Props = {
  tipos: string[];
  formaDoTipo: (tipo: string) => string;
};

function Componente({ tipos, formaDoTipo }: Props) {
  if (tipos.length === 0) return null;
  return (
    <div className="paleta" role="toolbar" aria-label="figuras">
      {tipos.map((tipo) => (
        <button
          key={tipo}
          type="button"
          className="paleta-item"
          title={`arraste para o canvas: ${tipo}`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/grapydown-tipo", tipo);
            e.dataTransfer.effectAllowed = "copy";
          }}
        >
          <Miniatura forma={formaDoTipo(tipo)} />
          <span>{tipo}</span>
        </button>
      ))}
    </div>
  );
}

export const PaletaFormas = memo(Componente);

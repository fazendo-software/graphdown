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
  armado: string | null;
  aoArmar: (tipo: string) => void;
};

function Componente({ tipos, formaDoTipo, armado, aoArmar }: Props) {
  if (tipos.length === 0) return null;
  return (
    <div className="paleta" role="toolbar" aria-label="figuras">
      {tipos.map((tipo) => (
        <button
          key={tipo}
          type="button"
          className="paleta-item"
          // Duas formas de usar, porque arrastar não existe em touch: arraste solta onde
          // quiser; clique arma e o próximo clique no canvas posiciona.
          aria-pressed={armado === tipo}
          title={`${tipo}: arraste para o canvas, ou clique e depois clique onde quiser`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/grapydown-tipo", tipo);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => aoArmar(tipo)}
        >
          <Miniatura forma={formaDoTipo(tipo)} />
          <span>{tipo}</span>
        </button>
      ))}
    </div>
  );
}

export const PaletaFormas = memo(Componente);

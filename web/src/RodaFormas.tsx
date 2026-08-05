import { memo, useEffect, useMemo } from "react";
import { desenharForma } from "./rough.ts";

const RAIO = 74;
const MINI = { largura: 40, altura: 28 };

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
  x: number;
  y: number;
  tipos: string[];
  formaDoTipo: (tipo: string) => string;
  aoEscolher: (tipo: string) => void;
  aoFechar: () => void;
};

function Componente({ x, y, tipos, formaDoTipo, aoEscolher, aoFechar }: Props) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [aoFechar]);

  return (
    // Fundo transparente cobrindo a tela: qualquer clique fora fecha sem criar nada.
    <div className="roda-fundo" onClick={aoFechar} onContextMenu={(e) => e.preventDefault()}>
      <div className="roda" style={{ left: x, top: y }} onClick={(e) => e.stopPropagation()}>
        {tipos.map((tipo, i) => {
          // -90° para a primeira figura nascer em cima, não à direita.
          const ang = (i / tipos.length) * 2 * Math.PI - Math.PI / 2;
          return (
            <button
              key={tipo}
              type="button"
              className="roda-item"
              style={{
                transform: `translate(-50%, -50%) translate(${Math.cos(ang) * RAIO}px, ${
                  Math.sin(ang) * RAIO
                }px)`,
              }}
              onClick={() => aoEscolher(tipo)}
            >
              <Miniatura forma={formaDoTipo(tipo)} />
              <span>{tipo}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export const RodaFormas = memo(Componente);

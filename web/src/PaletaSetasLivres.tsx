import { memo } from "react";
import { TIPOS_SETA_LIVRE, type TipoSetaLivre } from "./setasLivres.ts";

export const ROTULOS_SETA_LIVRE: Record<TipoSetaLivre, string> = {
  linha: "linha",
  seta: "seta",
  cotovelo: "seta em cotovelo",
  bloco: "seta em bloco",
  divisor: "divisor",
};

/** A mesma amostra aparece na paleta lateral e na roda, evitando ícones divergentes. */
export function AmostraSetaLivre({ tipo }: { tipo: TipoSetaLivre }) {
  const marcador = `amostra-seta-livre-${tipo}`;
  const cotovelo = tipo === "cotovelo";
  const bloco = tipo === "bloco";
  const ponta = tipo === "seta" || cotovelo || bloco;
  return (
    <svg width={44} height={28} aria-hidden="true" viewBox="0 0 44 28">
      <defs>
        <marker id={marcador} markerWidth={bloco ? 10 : 7} markerHeight={bloco ? 10 : 7} refX={bloco ? 9 : 6} refY={bloco ? 5 : 3.5} orient="auto">
          <path d={bloco ? "M0,0 L10,5 L0,10 Z" : "M0,0 L7,3.5 L0,7 Z"} fill="currentColor" />
        </marker>
      </defs>
      <path
        d={cotovelo ? "M 3 6 H 34 V 22" : "M 3 14 H 39"}
        fill="none"
        stroke="currentColor"
        strokeWidth={bloco ? 7 : 2}
        markerEnd={ponta ? `url(#${marcador})` : undefined}
      />
    </svg>
  );
}

type Props = { armada: TipoSetaLivre | null; aoArmar: (tipo: TipoSetaLivre) => void };

function Componente({ armada, aoArmar }: Props) {
  return (
    <div className="paleta" role="toolbar" aria-label="objetos de seta">
      {TIPOS_SETA_LIVRE.map((tipo) => (
        <button
          key={tipo}
          type="button"
          className="paleta-item"
          aria-pressed={armada === tipo}
          title={`${ROTULOS_SETA_LIVRE[tipo]}: arraste para o canvas, ou clique e depois clique onde quiser`}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/grapydown-tipo", `seta-livre:${tipo}`);
            e.dataTransfer.effectAllowed = "copy";
          }}
          onClick={() => aoArmar(tipo)}
        >
          <AmostraSetaLivre tipo={tipo} />
          <span>{ROTULOS_SETA_LIVRE[tipo]}</span>
        </button>
      ))}
    </div>
  );
}

export const PaletaSetasLivres = memo(Componente);

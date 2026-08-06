import { memo } from "react";
import type { EstiloAresta } from "../../core/tipos.ts";
import { useCores } from "./tema.ts";

const TRACEJADO: Record<string, string | undefined> = {
  continua: undefined,
  tracejada: "7 5",
  pontilhada: "2 4",
};

/** Amostra da seta: mesma leitura de `estilo`/`ponta`/`cor` que o `ArestaRough` faz no
 * canvas, só que reta e sem o traço à mão — é legenda, não desenho. */
function Amostra({ estilo, id }: { estilo: EstiloAresta; id: string }) {
  const cores = useCores();
  const cor = estilo.cor || cores.aresta;
  const ponta = estilo.ponta ?? "cheia";
  const marca = `seta-${id}`;
  return (
    <svg width={44} height={14} aria-hidden="true">
      <defs>
        <marker id={marca} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L6,3 L0,6 Z" fill={cor} />
        </marker>
        <marker id={`${marca}-i`} markerWidth="6" markerHeight="6" refX="1" refY="3" orient="auto">
          <path d="M6,0 L0,3 L6,6 Z" fill={cor} />
        </marker>
      </defs>
      <line
        x1={ponta === "ambas" ? 7 : 2}
        y1={7}
        x2={ponta === "nenhuma" ? 42 : 36}
        y2={7}
        stroke={cor}
        strokeWidth={2}
        strokeDasharray={TRACEJADO[estilo.estilo ?? "continua"]}
        markerEnd={ponta === "nenhuma" ? undefined : `url(#${marca})`}
        markerStart={ponta === "ambas" ? `url(#${marca}-i)` : undefined}
      />
    </svg>
  );
}

type Props = {
  estilos: Record<string, EstiloAresta>;
  armada: string | null;
  aoArmar: (tipo: string) => void;
};

const SEM_GRUPO = "outras";

function Componente({ estilos, armada, aoArmar }: Props) {
  const entradas = Object.entries(estilos);
  if (entradas.length === 0) return null;

  const porGrupo = new Map<string, [string, EstiloAresta][]>();
  for (const entrada of entradas) {
    const grupo = entrada[1].grupo ?? SEM_GRUPO;
    const lista = porGrupo.get(grupo);
    if (lista) lista.push(entrada);
    else porGrupo.set(grupo, [entrada]);
  }

  return (
    <div className="paleta-setas" role="toolbar" aria-label="tipos de seta">
      {[...porGrupo].map(([grupo, lista]) => (
        <div key={grupo} className="grupo">
          <h3>{grupo}</h3>
          {lista.map(([tipo, estilo]) => (
            <button
              key={tipo}
              type="button"
              className="paleta-item"
              aria-pressed={armada === tipo}
              title={`${tipo}: clique para armar — a próxima ligação nasce com este tipo`}
              onClick={() => aoArmar(tipo)}
            >
              <Amostra estilo={estilo} id={tipo} />
              <span>{tipo}</span>
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

export const PaletaSetas = memo(Componente);

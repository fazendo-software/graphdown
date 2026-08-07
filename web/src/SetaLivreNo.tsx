import { memo, useEffect, useRef, useState } from "react";
import type { NodeProps } from "@xyflow/react";
import type { Posicao } from "../../core/tipos.ts";
import {
  caminhoSvg,
  inserirVertice,
  meiosDosSegmentos,
  pontosDoCotovelo,
  pontosRelativos,
  type CaixaSetaLivre,
  type TipoSetaLivre,
} from "./setasLivres.ts";

export type DadosSetaLivre = {
  tipo: TipoSetaLivre;
  pontos: Posicao[];
  caixa: CaixaSetaLivre;
  somenteLeitura: boolean;
  aoAlterarPontos: (pontos: Posicao[]) => void;
};

type Controle = { tipo: "vertice"; indice: number } | { tipo: "meio"; indice: number };

/**
 * Seta livre é um nó só para o React Flow cuidar de seleção, arraste e delete. A sua
 * geometria, porém, fica inteiramente em SVG e não cria uma relação entre entidades.
 */
function Componente({ id, data, selected, width, height }: NodeProps) {
  const { tipo, pontos, caixa, somenteLeitura, aoAlterarPontos } = data as DadosSetaLivre;
  const [editados, setEditados] = useState(pontos);
  const editadosRef = useRef(editados);
  const controle = useRef<Controle | null>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!controle.current) {
      setEditados(pontos);
      editadosRef.current = pontos;
    }
  }, [pontos]);

  const largura = width ?? caixa.largura;
  const altura = height ?? caixa.altura;
  const locais = pontosRelativos(editados, caixa);
  const caminho = caminhoSvg(tipo === "cotovelo" ? pontosDoCotovelo(locais) : locais);
  const meios = tipo === "divisor" ? [] : meiosDosSegmentos(locais);
  const marcador = `ponta-seta-livre-${id}`;
  const grossura = tipo === "bloco" ? 16 : tipo === "divisor" ? 2 : 2.5;
  const temPonta = tipo === "seta" || tipo === "cotovelo" || tipo === "bloco";

  function pontoDoEvento(e: React.PointerEvent<Element>): Posicao | null {
    const caixaSvg = svg.current?.getBoundingClientRect();
    if (!caixaSvg) return null;
    const x = Math.max(6, Math.min(largura - 6, ((e.clientX - caixaSvg.left) / caixaSvg.width) * largura));
    const y = Math.max(6, Math.min(altura - 6, ((e.clientY - caixaSvg.top) / caixaSvg.height) * altura));
    return { x: Math.round(caixa.x + x), y: Math.round(caixa.y + y) };
  }

  function iniciarEdicao(e: React.PointerEvent<Element>, alvo: Controle) {
    if (somenteLeitura) return;
    e.preventDefault();
    e.stopPropagation();
    const p = pontoDoEvento(e);
    if (!p) return;
    const proximo = alvo.tipo === "meio" ? inserirVertice(editadosRef.current, alvo.indice, p) : [...editadosRef.current];
    controle.current = alvo.tipo === "meio" ? { tipo: "vertice", indice: alvo.indice + 1 } : alvo;
    editadosRef.current = proximo;
    setEditados(proximo);
    svg.current?.setPointerCapture(e.pointerId);
  }

  function moverEdicao(e: React.PointerEvent<SVGSVGElement>) {
    const ativo = controle.current;
    if (!ativo) return;
    const p = pontoDoEvento(e);
    if (!p) return;
    const proximo = editadosRef.current.map((anterior, i) => (i === ativo.indice ? p : anterior));
    editadosRef.current = proximo;
    setEditados(proximo);
  }

  function concluirEdicao(e: React.PointerEvent<SVGSVGElement>) {
    if (!controle.current) return;
    controle.current = null;
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
    aoAlterarPontos(editadosRef.current);
  }

  return (
    <div className={`seta-livre${selected ? " selecionada" : ""}`} style={{ width: largura, height: altura }}>
      <svg
        ref={svg}
        width={largura}
        height={altura}
        viewBox={`0 0 ${largura} ${altura}`}
        aria-label={`${tipo} livre`}
        onPointerMove={moverEdicao}
        onPointerUp={concluirEdicao}
        onPointerCancel={concluirEdicao}
      >
        <defs>
          <marker id={marcador} markerWidth={tipo === "bloco" ? 14 : 8} markerHeight={tipo === "bloco" ? 14 : 8} refX={tipo === "bloco" ? 12 : 7} refY={tipo === "bloco" ? 7 : 4} orient="auto">
            <path d={tipo === "bloco" ? "M0,0 L14,7 L0,14 Z" : "M0,0 L8,4 L0,8 Z"} fill="currentColor" />
          </marker>
        </defs>
        <path
          d={caminho}
          className={`traco-seta-livre ${tipo}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={grossura}
          strokeLinecap={tipo === "bloco" ? "butt" : "round"}
          strokeLinejoin="round"
          markerEnd={temPonta ? `url(#${marcador})` : undefined}
        />
        {selected && !somenteLeitura
          ? locais.map((p, indice) => (
              <circle
                key={`vertice-${indice}`}
                className="controle-seta vertice nodrag nopan"
                cx={p.x}
                cy={p.y}
                r={6}
                onPointerDown={(e) => iniciarEdicao(e, { tipo: "vertice", indice })}
              />
            ))
          : null}
        {selected && !somenteLeitura
          ? meios.map((p, indice) => (
              <circle
                key={`meio-${indice}`}
                className="controle-seta meio nodrag nopan"
                cx={p.x}
                cy={p.y}
                r={4}
                onPointerDown={(e) => iniciarEdicao(e, { tipo: "meio", indice })}
              />
            ))
          : null}
      </svg>
    </div>
  );
}

export const SetaLivreNo = memo(Componente);

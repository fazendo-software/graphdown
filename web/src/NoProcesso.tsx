import { memo, useMemo, type CSSProperties } from "react";
import { Handle, NodeResizer, Position, type NodeProps } from "@xyflow/react";
import type { No } from "../../core/tipos.ts";
import { ALTURA_ROTULO, desenharForma, seedDoId, tamanhoDe } from "./rough.ts";
import { useCores } from "./tema.ts";
import { corDeExecucao, GLIFO_EXECUCAO, ROTULO_EXECUCAO } from "./execucao.ts";
import { urlDoEmbed } from "./embed.ts";

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
  /** URL do objeto incorporável; só categorias declaradas como tal a preenchem. */
  embedUrl?: string;
  erro?: string;
  /** Nome de quem está arrastando este nó agora, se for outra pessoa. */
  movidoPor?: string;
  somenteLeitura?: boolean;
  /** Ausente em fantasma, nota e seta livre — nenhum deles tem estado de execução.
   * A aresta lê isto do nó de destino, então o `no-mudou` já repinta o fluxo. */
  execucao?: No["execucao"];
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

function Componente({ id, data, selected, width, height }: NodeProps) {
  const { titulo, cor, forma, fantasma, erro, movidoPor, somenteLeitura, embedUrl, execucao } = data as DadosNo;
  const seed = useMemo(() => seedDoId(id), [id]);
  const padrao = tamanhoDe(forma);
  // Durante a primeira medição o React Flow pode entregar 0. Usar esse valor
  // zerava o SVG: o nó existia na lista, mas ficava invisível no canvas.
  const largura = width && width > 0 ? width : padrao.largura;
  const altura = height && height > 0 ? height : padrao.altura;
  const cores = useCores();
  const embed = urlDoEmbed(embedUrl);
  // Fantasma não é um nó do projeto, então nunca é tarefa. `?? "pendente"` só cobre dado
  // antigo: o servidor já normaliza tarefa sem estado desde a migração 007.
  const estadoTarefa = execucao?.tarefa && !fantasma ? (execucao.estado ?? "pendente") : null;

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
      }, { largura, altura }),
    [seed, forma, cor, selected, fantasma, erro, cores.alfa, largura, altura],
  );

  // A caixa do React Flow é só o desenho: o resizer preserva a proporção da forma.
  // O rótulo é absoluto e o dagre reserva ALTURA_ROTULO em `tamanhoDoNo`, portanto
  // continua abaixo sem entrar no cálculo de aspecto nem encavalar o próximo objeto.
  return (
    <div style={{ width: largura, height: altura, position: "relative" }}>
      <NodeResizer
        isVisible={Boolean(selected && !somenteLeitura && !fantasma)}
        minWidth={20}
        minHeight={20}
        maxWidth={1000}
        maxHeight={1000}
        keepAspectRatio
        color={cor}
      />
      {/* Selo acima da forma: não repinta o traço, que continua dizendo a categoria e o
          erro de esquema. Glifo + texto + cor, para o estado sobreviver ao cinza. */}
      {estadoTarefa ? (
        <span
          className="selo-execucao"
          style={{ color: corDeExecucao(estadoTarefa, cores, cores.traco) }}
          title={`tarefa ${ROTULO_EXECUCAO[estadoTarefa]}`}
        >
          <span aria-hidden="true">{GLIFO_EXECUCAO[estadoTarefa]}</span> {ROTULO_EXECUCAO[estadoTarefa]}
        </span>
      ) : null}
      <div style={{ position: "relative", width: largura, height: altura }}>
        {/* Um handle por lado. Com connectionMode Loose o React Flow deixa puxar e soltar
            em qualquer um deles, e a aresta flutuante escolhe sozinha por onde sair. */}
        {LADOS.map((lado) => (
          <Handle key={lado} id={lado} type="source" position={lado} className="lado" />
        ))}
        {embed && !fantasma && !erro ? (
          <iframe
            className="nodrag nopan"
            src={embed}
            title={`conteúdo incorporado: ${titulo}`}
            // Continua isolado do Graphdown por origem cruzada; `allow-same-origin` é
            // necessário para players como o YouTube usarem armazenamento e iniciarem.
            sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ position: "absolute", inset: 3, display: "block", width: "calc(100% - 6px)", height: "calc(100% - 6px)", border: `2px solid ${cor}`, borderRadius: 4, background: "transparent" }}
          />
        ) : (
          <svg width={largura} height={altura} style={{ position: "absolute", inset: 0 }}>
            {tracos.map((t, i) => (
              <path key={i} d={t.d} stroke={t.stroke} fill={t.fill} strokeWidth={t.strokeWidth} strokeDasharray={t.strokeLineDash?.join(" ")} />
            ))}
          </svg>
        )}
      </div>
      <div
        style={{
          position: "absolute",
          top: altura,
          width: "100%",
          minHeight: ALTURA_ROTULO,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          textAlign: "center",
          overflow: "visible",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          fontSize: 14,
          lineHeight: 1.3,
          color: erro ? "#dc2626" : cores.texto,
          pointerEvents: "none",
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

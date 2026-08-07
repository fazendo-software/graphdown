import type { Edge, Node } from "@xyflow/react";
import type { MsgServidor, No, Nota, ObjetoSeta, Posicao } from "../../core/tipos.ts";
import type { ArestaComId } from "./api.ts";
import type { DadosNo } from "./NoProcesso.tsx";

export type RenderState = { nos: Node[]; arestas: Edge[] };

/** Largura/altura pertencem ao cliente enquanto resize não entra no protocolo do servidor. */
export function preservarDimensoes(novo: Node, anterior?: Node): Node {
  return { ...novo, width: anterior?.width ?? novo.width, height: anterior?.height ?? novo.height };
}

/** Constrói a forma de renderização de um item — injetado porque depende de categoria/tema,
 * que este módulo não conhece (fica testável sem precisar simular isso). */
export type ConstrutoresRender = {
  noReal: (no: No, posicao: Posicao) => Node;
  noFantasma: (id: string, posicao: Posicao) => Node;
  aresta: (a: ArestaComId) => Edge;
  nota: (n: Nota) => Node;
  seta: (s: ObjetoSeta) => Node;
};

/** Origem sem nó real em `nos` vira fantasma — recomputado após qualquer diff estrutural. */
export function reconciliarFantasmas(
  nos: Node[],
  arestas: Edge[],
  noFantasma: ConstrutoresRender["noFantasma"],
): Node[] {
  const reais = nos.filter((n) => !(n.data as DadosNo).fantasma);
  const idsReais = new Set(reais.map((n) => n.id));
  const precisam = [...new Set(arestas.map((a) => a.source).filter((id) => !idsReais.has(id)))];
  const fantasmasAntigos = new Map(
    nos.filter((n) => (n.data as DadosNo).fantasma).map((n) => [n.id, n] as const),
  );
  const fantasmas = precisam.map((id) => fantasmasAntigos.get(id) ?? noFantasma(id, { x: 0, y: 0 }));
  return [...reais, ...fantasmas];
}

export type ContextoDiff = {
  usuarioId: string;
  nomeDe: (usuarioId: string) => string;
  /** Posição escolhida localmente ao criar um nó, até o "no-criado" confirmar. */
  posicaoPendente: (id: string) => Posicao | undefined;
  construtores: ConstrutoresRender;
};

/**
 * Aplica uma mensagem de estrutura/posição do WS sobre o estado de renderização.
 * Mesma função usada pelo Canvas e pelos testes — não há uma segunda implementação
 * paralela pra divergir em silêncio.
 */
export function aplicarDiffRender(prev: RenderState, msg: MsgServidor, ctx: ContextoDiff): RenderState {
  const { construtores: c } = ctx;
  switch (msg.t) {
    case "arrastando": {
      if (msg.por === ctx.usuarioId) return prev;
      const nome = ctx.nomeDe(msg.por);
      return {
        ...prev,
        nos: prev.nos.map((n) =>
          n.id !== msg.no
            ? n
            : { ...n, position: { x: msg.x, y: msg.y }, data: { ...(n.data as DadosNo), movidoPor: nome } },
        ),
      };
    }
    case "posicao":
      return {
        ...prev,
        nos: prev.nos.map((n) =>
          n.id !== msg.no
            ? n
            : { ...n, position: { x: msg.x, y: msg.y }, data: { ...(n.data as DadosNo), movidoPor: undefined } },
        ),
      };
    case "no-criado":
    case "no-mudou": {
      const existente = prev.nos.find((n) => n.id === msg.no.id && !(n.data as DadosNo).fantasma);
      const posicao = existente?.position ?? ctx.posicaoPendente(msg.no.id) ?? { x: 0, y: 0 };
      const novo = c.noReal(msg.no, posicao);
      const nos = [
        ...prev.nos.filter((n) => n.id !== msg.no.id),
        preservarDimensoes(novo, existente),
      ];
      return { ...prev, nos: reconciliarFantasmas(nos, prev.arestas, c.noFantasma) };
    }
    case "no-apagado": {
      const arestas = prev.arestas.filter((a) => a.source !== msg.no.id && a.target !== msg.no.id);
      const nos = prev.nos.filter((n) => n.id !== msg.no.id);
      return { nos: reconciliarFantasmas(nos, arestas, c.noFantasma), arestas };
    }
    case "aresta-criada":
    case "aresta-mudou": {
      const arestas = [...prev.arestas.filter((a) => a.id !== msg.aresta.id), c.aresta(msg.aresta)];
      return { nos: reconciliarFantasmas(prev.nos, arestas, c.noFantasma), arestas };
    }
    case "aresta-apagada": {
      const arestas = prev.arestas.filter((a) => a.id !== msg.aresta.id);
      return { nos: reconciliarFantasmas(prev.nos, arestas, c.noFantasma), arestas };
    }
    // Nota mora no mesmo array de nós, mas não entra em `reconciliarFantasmas`: nunca é
    // origem de aresta, então nada a reconciliar — só upsert/remove por id.
    case "nota-criada":
    case "nota-mudou": {
      // `selected` é estado do React Flow, não do servidor: sem carregar adiante, o eco do
      // próprio PATCH de posição desselecionaria a nota assim que ela fosse solta.
      const antes = prev.nos.find((n) => n.id === msg.nota.id);
      return {
        ...prev,
        nos: [
          ...prev.nos.filter((n) => n.id !== msg.nota.id),
          { ...preservarDimensoes(c.nota(msg.nota), antes), selected: antes?.selected },
        ],
      };
    }
    case "nota-apagada":
      return { ...prev, nos: prev.nos.filter((n) => n.id !== msg.nota.id) };
    // Seta livre é um nó do React Flow apenas para herdar seleção/arraste/delete. Diferente
    // de nota, sua caixa deriva dos pontos e não pode preservar width/height antigo.
    case "seta-criada":
    case "seta-mudou": {
      const antes = prev.nos.find((n) => n.id === msg.seta.id);
      return {
        ...prev,
        nos: [...prev.nos.filter((n) => n.id !== msg.seta.id), { ...c.seta(msg.seta), selected: antes?.selected }],
      };
    }
    case "seta-apagada":
      return { ...prev, nos: prev.nos.filter((n) => n.id !== msg.seta.id) };
    default:
      return prev;
  }
}

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
} from "@xyflow/react";
import type { Layout } from "../../core/tipos.ts";
import { comoLista, normalizarAresta } from "../../core/grafo.ts";
import { api, type GrafoResposta } from "./api.ts";
import { NoProcesso, type DadosNo } from "./NoProcesso.tsx";
import { ArestaRough } from "./ArestaRough.tsx";
import { completarLayout } from "./layoutAuto.ts";
import { Modal } from "./Modal.tsx";

const tiposNo = { processo: NoProcesso };
const tiposAresta = { rough: ArestaRough };

function corDoNo(g: GrafoResposta, campos: Record<string, unknown>): string {
  const chave = g.categoria.cor_por;
  const valor = chave ? String(campos[chave] ?? "") : "";
  return g.categoria.cores?.[valor] ?? "#52525b";
}

function montar(g: GrafoResposta, layout: Layout): { nos: Node[]; arestas: Edge[] } {
  const reais = new Set(g.nos.map((n) => n.id));
  const nos: Node[] = g.nos.map((n) => ({
    id: n.id,
    type: "processo",
    position: layout[n.id] ?? { x: 0, y: 0 },
    data: { titulo: n.titulo, cor: corDoNo(g, n.campos), fantasma: false, erro: n.erro } as DadosNo,
  }));
  for (const id of g.fantasmas) {
    if (reais.has(id)) continue;
    nos.push({
      id,
      type: "processo",
      position: layout[id] ?? { x: 0, y: 0 },
      data: { titulo: id, cor: "#dc2626", fantasma: true } as DadosNo,
    });
  }
  const arestas: Edge[] = g.arestas.map((a) => ({
    id: `${a.de}->${a.para}`,
    source: a.de,
    target: a.para,
    type: "rough",
    label: a.quando,
    markerEnd: { type: MarkerType.ArrowClosed, color: "#52525b" },
  }));
  return { nos, arestas };
}

export function App() {
  const [grafo, setGrafo] = useState<GrafoResposta | null>(null);
  const [nos, setNos] = useState<Node[]>([]);
  const [arestas, setArestas] = useState<Edge[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const timerLayout = useRef<number | undefined>(undefined);

  const carregar = useCallback(async () => {
    try {
      const g = await api.grafo();
      const ids = [...g.nos.map((n) => n.id), ...g.fantasmas];
      const layout = completarLayout(ids, g.arestas, g.layout);
      const montado = montar(g, layout);
      setGrafo(g);
      setNos(montado.nos);
      setArestas(montado.arestas);
      setFalha(null);
      if (Object.keys(layout).length !== Object.keys(g.layout).length) {
        await api.putLayout(layout);
      }
    } catch (e) {
      setFalha((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const fonte = new EventSource("/api/eventos");
    fonte.addEventListener("grafo-mudou", () => void carregar());
    return () => fonte.close();
  }, [carregar]);

  const aoMudarNos = useCallback((mudancas: NodeChange[]) => {
    setNos((atuais) => {
      const proximos = applyNodeChanges(mudancas, atuais);
      if (mudancas.some((m) => m.type === "position" && m.dragging === false)) {
        clearTimeout(timerLayout.current);
        timerLayout.current = window.setTimeout(() => {
          const layout: Layout = {};
          for (const n of proximos) {
            layout[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
          }
          void api.putLayout(layout).catch((e: Error) => setFalha(e.message));
        }, 500);
      }
      return proximos;
    });
  }, []);

  const aoConectar = useCallback(
    async ({ source, target }: Connection) => {
      if (!source || !target || source === target || !grafo) return;
      const alvo = grafo.nos.find((n) => n.id === target);
      if (!alvo) return;
      // comoLista, nao Array.isArray: `depende_de: 01-a` (escalar) e uma dependencia
      // valida no core, e trata-la como lista vazia apagaria a aresta que ja existia.
      const atual = comoLista(alvo.campos.depende_de);
      if (atual.some((a) => normalizarAresta(a)?.de === source)) return;
      try {
        await api.patchNo(target, { depende_de: [...atual, source] });
        await carregar();
      } catch (e) {
        setFalha((e as Error).message);
      }
    },
    [grafo, carregar],
  );

  const aoMudarArestas = useCallback((mudancas: EdgeChange[]) => {
    setArestas((atuais) => applyEdgeChanges(mudancas, atuais));
  }, []);

  // Desligar = tirar a origem do depende_de do destino. Nao ha rota de aresta.
  const aoDesconectar = useCallback(
    async (removidas: Edge[]) => {
      if (!grafo) return;
      try {
        for (const { source, target } of removidas) {
          const alvo = grafo.nos.find((n) => n.id === target);
          if (!alvo) continue;
          const restante = comoLista(alvo.campos.depende_de).filter(
            (a) => normalizarAresta(a)?.de !== source,
          );
          await api.patchNo(target, { depende_de: restante });
        }
        await carregar();
      } catch (e) {
        setFalha((e as Error).message);
      }
    },
    [grafo, carregar],
  );

  const aoCriar = useCallback(async () => {
    const titulo = window.prompt("Título do novo passo:");
    if (!titulo?.trim()) return;
    try {
      await api.criarNo(titulo.trim());
      await carregar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }, [carregar]);

  return (
    <div className="tela">
      <div className="barra">
        <strong>{grafo?.titulo ?? "carregando…"}</strong>
        <button onClick={() => void aoCriar()}>+ passo</button>
        {falha ? <span className="erro">{falha}</span> : null}
      </div>
      <ReactFlow
        nodes={nos}
        edges={arestas}
        nodeTypes={tiposNo}
        edgeTypes={tiposAresta}
        onNodesChange={aoMudarNos}
        onEdgesChange={aoMudarArestas}
        onEdgesDelete={(e) => void aoDesconectar(e)}
        onConnect={(c) => void aoConectar(c)}
        // Fantasma nao tem arquivo: abrir o modal so daria 404.
        onNodeClick={(_, no) => setAberto((no.data as DadosNo).fantasma ? null : no.id)}
        onPaneClick={() => setAberto(null)}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      {aberto && grafo ? (
        <Modal
          id={aberto}
          categoria={grafo.categoria}
          aoFechar={() => setAberto(null)}
          aoMudar={() => void carregar()}
        />
      ) : null}
    </div>
  );
}

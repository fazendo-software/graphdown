import { useCallback, useEffect, useRef, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  SelectionMode,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import type { Categoria, EstiloAresta, Layout, Posicao } from "../../core/tipos.ts";
import { comoLista, normalizarAresta } from "../../core/grafo.ts";
import { api, type GrafoResposta } from "./api.ts";
import { NoProcesso, type DadosNo } from "./NoProcesso.tsx";
import { ArestaRough, ARESTA_PADRAO } from "./ArestaRough.tsx";
import { PaletaFormas } from "./PaletaFormas.tsx";
import { RodaFormas } from "./RodaFormas.tsx";
import { completarLayout } from "./layoutAuto.ts";
import { tamanhoDe } from "./rough.ts";
import { Modal } from "./Modal.tsx";
import { ModalAresta } from "./ModalAresta.tsx";

const tiposNo = { processo: NoProcesso };
const tiposAresta = { rough: ArestaRough };
const TIPO_ARRASTADO = "application/grapydown-tipo";

function corDoNo(cat: Categoria, campos: Record<string, unknown>): string {
  const chave = cat.cor_por;
  const valor = chave ? String(campos[chave] ?? "") : "";
  return cat.cores?.[valor] ?? "#52525b";
}

/** Forma desconhecida ou categoria sem `formas`: retângulo, como era antes. */
function formaDoTipo(cat: Categoria, tipo: string): string {
  return cat.formas?.[tipo] ?? "retangulo";
}

function formaDoNo(cat: Categoria, campos: Record<string, unknown>): string {
  if (!cat.forma_por) return "retangulo";
  return formaDoTipo(cat, String(campos[cat.forma_por] ?? ""));
}

function tiposDeForma(cat: Categoria): string[] {
  return cat.campos.find((c) => c.chave === cat.forma_por)?.opcoes ?? [];
}

function estiloDaAresta(cat: Categoria, tipo?: string): Required<EstiloAresta> {
  return {
    ...ARESTA_PADRAO,
    ...(cat.arestas?.padrao ?? {}),
    ...((tipo ? cat.arestas?.[tipo] : undefined) ?? {}),
  };
}

function marcadores(ponta: string, cor: string) {
  const cheia = { type: MarkerType.ArrowClosed, color: cor };
  const aberta = { type: MarkerType.Arrow, color: cor };
  if (ponta === "nenhuma") return {};
  if (ponta === "aberta") return { markerEnd: aberta };
  if (ponta === "ambas") return { markerEnd: cheia, markerStart: cheia };
  return { markerEnd: cheia };
}

function montar(g: GrafoResposta, layout: Layout): { nos: Node[]; arestas: Edge[] } {
  const reais = new Set(g.nos.map((n) => n.id));
  const nos: Node[] = g.nos.map((n) => ({
    id: n.id,
    type: "processo",
    position: layout[n.id] ?? { x: 0, y: 0 },
    data: {
      titulo: n.titulo,
      cor: corDoNo(g.categoria, n.campos),
      forma: formaDoNo(g.categoria, n.campos),
      fantasma: false,
      erro: n.erro,
    } as DadosNo,
  }));
  for (const id of g.fantasmas) {
    if (reais.has(id)) continue;
    nos.push({
      id,
      type: "processo",
      position: layout[id] ?? { x: 0, y: 0 },
      data: { titulo: id, cor: "#dc2626", forma: "retangulo", fantasma: true } as DadosNo,
    });
  }
  const arestas: Edge[] = g.arestas.map((a) => {
    const estilo = estiloDaAresta(g.categoria, a.tipo);
    return {
      id: `${a.de}->${a.para}`,
      source: a.de,
      target: a.para,
      type: "rough",
      label: a.quando,
      data: estilo,
      ...marcadores(estilo.ponta, estilo.cor),
    };
  });
  return { nos, arestas };
}

export function App() {
  const [grafo, setGrafo] = useState<GrafoResposta | null>(null);
  const [nos, setNos] = useState<Node[]>([]);
  const [arestas, setArestas] = useState<Edge[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [arestaAberta, setArestaAberta] = useState<{ de: string; para: string } | null>(null);
  const [roda, setRoda] = useState<{ x: number; y: number; alvo: Posicao } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const timerLayout = useRef<number | undefined>(undefined);
  // Guardar a instância evita envolver a árvore num <ReactFlowProvider> só pra usar
  // screenToFlowPosition, que é o que useReactFlow exigiria.
  const rf = useRef<ReactFlowInstance | null>(null);

  const carregar = useCallback(async () => {
    try {
      const g = await api.grafo();
      const ids = [...g.nos.map((n) => n.id), ...g.fantasmas];
      const forma = new Map(g.nos.map((n) => [n.id, formaDoNo(g.categoria, n.campos)]));
      const layout = completarLayout(ids, g.arestas, g.layout, (id) => forma.get(id) ?? "retangulo");
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

  useEffect(() => {
    // Esc fecha o modal — o clique no vazio agora é da roda.
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setAberto(null);
      setArestaAberta(null);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

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

  // Um handler só para nó e aresta: apagar um nó também apaga as arestas dele, e os dois
  // callbacks separados disputariam o mesmo arquivo — o PATCH de depende_de de um nó que
  // acabou de ir pra lixeira.
  const aoApagar = useCallback(
    async ({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) => {
      if (!grafo) return;
      // Fantasma não tem arquivo pra apagar.
      const ids = nodes.filter((n) => !(n.data as DadosNo).fantasma).map((n) => n.id);
      const apagados = new Set(ids);

      if (ids.length > 0) {
        const quais = ids.length === 1 ? `"${ids[0]}"` : `${ids.length} passos`;
        if (!window.confirm(`Mover ${quais} para a lixeira?`)) {
          await carregar();
          return;
        }
      }

      try {
        for (const id of ids) await api.apagarNo(id);
        // Desligar = tirar a origem do depende_de do destino. Não há rota de aresta.
        // Aresta de nó apagado não precisa de PATCH: o arquivo inteiro já saiu.
        for (const { source, target } of edges) {
          if (apagados.has(target)) continue;
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
        await carregar();
      }
    },
    [grafo, carregar],
  );

  const criar = useCallback(
    async (tipo: string, alvo: Posicao) => {
      if (!grafo) return;
      // O id do nó sai do título e o arquivo nunca é renomeado depois — por isso o título
      // é perguntado agora, e não deixado como "sem título" pra corrigir no modal.
      const titulo = window.prompt("Título do novo passo:")?.trim();
      if (!titulo) return;
      try {
        const chave = grafo.categoria.forma_por;
        const { id } = await api.criarNo(titulo, chave ? { [chave]: tipo } : undefined);
        const { largura, altura } = tamanhoDe(formaDoTipo(grafo.categoria, tipo));
        const layout: Layout = {};
        for (const n of nos) {
          layout[n.id] = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
        }
        layout[id] = { x: Math.round(alvo.x - largura / 2), y: Math.round(alvo.y - altura / 2) };
        await api.putLayout(layout);
        await carregar();
        setAberto(id);
      } catch (e) {
        setFalha((e as Error).message);
      }
    },
    [grafo, nos, carregar],
  );

  const tipos = grafo ? tiposDeForma(grafo.categoria) : [];

  return (
    <div className="tela">
      <div className="barra">
        <strong>{grafo?.titulo ?? "carregando…"}</strong>
        {grafo ? (
          <PaletaFormas tipos={tipos} formaDoTipo={(t) => formaDoTipo(grafo.categoria, t)} />
        ) : null}
        {falha ? <span className="erro">{falha}</span> : null}
      </div>
      <ReactFlow
        nodes={nos}
        edges={arestas}
        nodeTypes={tiposNo}
        edgeTypes={tiposAresta}
        onInit={(inst) => (rf.current = inst)}
        onNodesChange={aoMudarNos}
        onEdgesChange={aoMudarArestas}
        onDelete={(x) => void aoApagar(x)}
        onConnect={(c) => void aoConectar(c)}
        // Arraste esquerdo desenha o retângulo de seleção; sobra o botão do meio (e
        // Espaço+arraste, que o React Flow já dá de graça) para mover o canvas.
        selectionOnDrag
        panOnDrag={[1]}
        selectionMode={SelectionMode.Partial}
        // Shift não abre seleção nova: acumula na que já existe.
        selectionKeyCode={null}
        multiSelectionKeyCode="Shift"
        deleteKeyCode={["Delete", "Backspace"]}
        // Fantasma nao tem arquivo: abrir o modal so daria 404.
        onNodeClick={(_, no) => setAberto((no.data as DadosNo).fantasma ? null : no.id)}
        onEdgeClick={(_, a) => setArestaAberta({ de: a.source, para: a.target })}
        onPaneClick={() => {
          setAberto(null);
          setArestaAberta(null);
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          if (tipos.length === 0 || !rf.current) return;
          const { clientX, clientY } = e as React.MouseEvent;
          const alvo = rf.current.screenToFlowPosition({ x: clientX, y: clientY });
          setRoda({ x: clientX, y: clientY, alvo });
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(e) => {
          e.preventDefault();
          const tipo = e.dataTransfer.getData(TIPO_ARRASTADO);
          if (!tipo || !rf.current) return;
          void criar(tipo, rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
        }}
        fitView
      >
        <Background />
        <Controls />
      </ReactFlow>
      {roda && grafo ? (
        <RodaFormas
          x={roda.x}
          y={roda.y}
          tipos={tipos}
          formaDoTipo={(t) => formaDoTipo(grafo.categoria, t)}
          aoEscolher={(tipo) => {
            setRoda(null);
            void criar(tipo, roda.alvo);
          }}
          aoFechar={() => setRoda(null)}
        />
      ) : null}
      {arestaAberta && grafo ? (
        <ModalAresta
          de={arestaAberta.de}
          para={arestaAberta.para}
          categoria={grafo.categoria}
          aoFechar={() => setArestaAberta(null)}
          aoMudar={() => void carregar()}
        />
      ) : null}
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

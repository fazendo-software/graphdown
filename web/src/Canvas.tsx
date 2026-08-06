import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  ConnectionMode,
  MiniMap,
  PanOnScrollMode,
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
import type { MsgServidor, Nota, Papel, Posicao, Projeto, Usuario } from "../../core/tipos.ts";
import { apiProjeto, type ArestaComId } from "./api.ts";
import { conectarWS, type ConexaoWS } from "./ws.ts";
import { aplicarDiffRender, type RenderState } from "./diffGrafo.ts";
import { NoProcesso, type DadosNo } from "./NoProcesso.tsx";
import { NotaNo, type DadosNota } from "./NotaNo.tsx";
import { ArestaRough } from "./ArestaRough.tsx";
import { RodaFormas } from "./RodaFormas.tsx";
import { BarraLateral, type Armado, type ItemGrafo } from "./BarraLateral.tsx";
import { MenuProjeto } from "./MenuProjeto.tsx";
import { completarLayout } from "./layoutAuto.ts";
import { tamanhoDe } from "./rough.ts";
import { PALETA, TemaProvider, gravarPreferencia, lerPreferencia, type Preferencia, type Tema } from "./tema.ts";
import { Modal } from "./Modal.tsx";
import { ModalAresta } from "./ModalAresta.tsx";
import {
  categoriaDoNo,
  edgeDeAresta,
  formaDoNo,
  formaDoTipo,
  montarCatalogo,
  montarTudo,
  nodeDeFantasma,
  nodeDeNota,
  nodeDeReal,
  tiposDeForma,
  type Catalogo,
  type DadosAresta,
} from "./grafoRender.ts";

const tiposNo = { processo: NoProcesso, nota: NotaNo };
const tiposAresta = { rough: ArestaRough };
const TIPO_ARRASTADO = "application/grapydown-tipo";
/** Item da paleta que não é um tipo da categoria: cria nota em vez de nó. */
const TIPO_NOTA = "nota";

type Props = {
  projetoId: string;
  papel: Papel;
  usuario: Usuario;
  aoTrocarProjeto: (projeto: Projeto) => void;
  aoVoltar: () => void;
  aoSairDaConta: () => void;
};

export function Canvas({ projetoId, papel, usuario, aoTrocarProjeto, aoVoltar, aoSairDaConta }: Props) {
  const api = useMemo(() => apiProjeto(projetoId), [projetoId]);
  const somenteLeitura = papel === "leitor";

  const [titulo, setTitulo] = useState("");
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [render, setRender] = useState<RenderState>({ nos: [], arestas: [] });
  const [presenca, setPresenca] = useState<{ id: string; nome: string; editando: string | null }[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [arestaAberta, setArestaAberta] = useState<ArestaComId | null>(null);
  const [roda, setRoda] = useState<{ x: number; y: number; alvo: Posicao } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  // Touch não tem botão do meio nem tecla Espaço: nesses aparelhos o padrão é a mão,
  // senão o dedo desenharia seleção e não haveria como mover a tela.
  const [modo, setModo] = useState<"selecao" | "mao">(() =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches ? "mao" : "selecao",
  );
  // Arrastar da paleta não funciona em touch (HTML5 drag-and-drop não existe lá):
  // tocar na figura arma, o toque seguinte no canvas cria.
  const [armado, setArmado] = useState<Armado | null>(null);
  // Tipo de seta ativo: toda ligação nova nasce com ele até trocar. `null` = seta padrão.
  const [setaArmada, setSetaArmada] = useState<string | null>(null);
  const [preferencia, setPreferencia] = useState<Preferencia>(lerPreferencia);
  const [temaDoSistema, setTemaDoSistema] = useState<Tema>(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "escuro"
      : "claro",
  );
  const tema: Tema = preferencia === "sistema" ? temaDoSistema : preferencia;
  const rf = useRef<ReactFlowInstance | null>(null);
  const wsRef = useRef<ConexaoWS | null>(null);
  // Posição escolhida na hora de criar um nó, usada como palpite até o "no-criado"
  // confirmar — evita o nó nascer em (0,0) e pular pro lugar certo alguns ms depois.
  const posicoesPendentes = useRef(new Map<string, Posicao>());
  // Enquanto um `GET /grafo` está em voo (carga inicial ou reconexão), mensagens do WS
  // são enfileiradas em vez de aplicadas: aplicá-las direto arriscaria o snapshot que
  // chega depois (formado antes delas) desfazer o diff. Repassadas assim que o
  // snapshot é montado — upsert/remove por id é idempotente, então reaplicar não duplica.
  const carregando = useRef(false);
  const filaMensagens = useRef<MsgServidor[]>([]);

  // Estável entre renders: vai parar dentro do `data` de cada nota, e recriar a função a
  // cada render remontaria todas elas.
  const salvarNota = useCallback(
    (id: string, conteudo: string) => {
      api.patchNota(id, { conteudo }).catch((e: Error) => setFalha(e.message));
    },
    [api],
  );
  const construirNota = useCallback(
    (n: Nota) => nodeDeNota(n, somenteLeitura, salvarNota),
    [somenteLeitura, salvarNota],
  );

  async function carregar() {
    if (!wsRef.current) return;
    carregando.current = true;
    filaMensagens.current = [];
    try {
      const g = await api.grafo();
      const cat = montarCatalogo(g);
      setCatalogo(cat);
      setTitulo(g.titulo);
      const idsTodos = [...g.nos.map((n) => n.id), ...g.fantasmas];
      const forma = new Map(
        g.nos.map((n) => [n.id, formaDoNo(categoriaDoNo(cat, n.categoria_id), n.campos)]),
      );
      const layoutCompleto = completarLayout(idsTodos, g.arestas, g.layout, (id) => forma.get(id) ?? "retangulo");
      const corPadrao = PALETA[tema].aresta;
      setRender(montarTudo(g, cat, layoutCompleto, corPadrao, somenteLeitura, salvarNota));
      setFalha(null);
      if (!somenteLeitura) {
        for (const id of idsTodos) {
          if (g.layout[id]) continue;
          const p = layoutCompleto[id];
          wsRef.current.enviar({ t: "soltou", no: id, x: p.x, y: p.y });
        }
      }
    } catch (e) {
      setFalha((e as Error).message);
    } finally {
      carregando.current = false;
      const fila = filaMensagens.current;
      filaMensagens.current = [];
      for (const m of fila) aoReceberMsg(m);
    }
  }

  function aoReceberMsg(msg: MsgServidor) {
    if (carregando.current) {
      filaMensagens.current.push(msg);
      return;
    }
    if (msg.t === "presenca") {
      setPresenca(msg.usuarios);
      return;
    }
    if (msg.t === "erro") {
      setFalha(msg.mensagem);
      return;
    }
    if (!catalogo) return;
    const corPadrao = PALETA[tema].aresta;
    setRender((prev) =>
      aplicarDiffRender(prev, msg, {
        usuarioId: usuario.id,
        nomeDe: (id) => presenca.find((p) => p.id === id)?.nome ?? "alguém",
        posicaoPendente: (id) => {
          const p = posicoesPendentes.current.get(id);
          posicoesPendentes.current.delete(id);
          return p;
        },
        construtores: {
          noReal: (no, posicao) => nodeDeReal(no, catalogo, posicao),
          noFantasma: nodeDeFantasma,
          aresta: (a) => edgeDeAresta(a, catalogo, corPadrao),
          nota: construirNota,
        },
      }),
    );
  }

  // Refs "vivas": WS conecta uma vez por projeto e chama sempre a versão mais nova
  // destas funções, sem precisar recriar a conexão a cada render.
  const carregarRef = useRef(carregar);
  carregarRef.current = carregar;
  const msgRef = useRef(aoReceberMsg);
  msgRef.current = aoReceberMsg;

  useEffect(() => {
    const ws = conectarWS(projetoId, {
      aoConectar: () => void carregarRef.current(),
      aoReceber: (msg) => msgRef.current(msg),
    });
    wsRef.current = ws;
    return () => {
      ws.fechar();
      wsRef.current = null;
    };
    // eslint: só reconecta quando o projeto muda de verdade.
  }, [projetoId]);

  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    document.documentElement.style.colorScheme = tema === "escuro" ? "dark" : "light";
  }, [tema]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const trocou = (e: MediaQueryListEvent) => setTemaDoSistema(e.matches ? "escuro" : "claro");
    mq.addEventListener("change", trocou);
    return () => mq.removeEventListener("change", trocou);
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(null);
        setArestaAberta(null);
        setRoda(null);
        setArmado(null);
        return;
      }
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // V e H: mesma convenção de Figma, Illustrator e afins.
      if (e.key === "v" || e.key === "V") setModo("selecao");
      if (e.key === "h" || e.key === "H") setModo("mao");
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const ehNota = (id: string) => render.nos.find((n) => n.id === id)?.type === "nota";

  function aoMudarNos(mudancas: NodeChange[]) {
    setRender((prev) => ({ ...prev, nos: applyNodeChanges(mudancas, prev.nos) }));
    if (somenteLeitura) return;
    for (const m of mudancas) {
      if (m.type !== "position" || !m.position) continue;
      const x = Math.round(m.position.x);
      const y = Math.round(m.position.y);
      // Nota persiste por PATCH ao soltar; nó vai por WS porque o arraste dele também
      // viaja ao vivo. Ver `artifacts/casca-ui`.
      if (ehNota(m.id)) {
        if (m.dragging === false) api.patchNota(m.id, { x, y }).catch((e: Error) => setFalha(e.message));
        continue;
      }
      if (m.dragging) wsRef.current?.enviarArrastando(m.id, m.position.x, m.position.y);
      else if (m.dragging === false) wsRef.current?.enviar({ t: "soltou", no: m.id, x, y });
    }
  }

  async function aoConectar({ source, target }: Connection) {
    if (!source || !target || source === target || somenteLeitura) return;
    if (render.arestas.some((e) => e.source === source && e.target === target)) return;
    try {
      const { id } = await api.criarAresta(source, target, setaArmada);
      // Abre o modal na hora: os recursos da transição são o motivo da seta existir.
      setArestaAberta({ id, de: source, para: target, tipo: setaArmada ?? undefined, campos: {} });
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  function aoMudarArestas(mudancas: EdgeChange[]) {
    setRender((prev) => ({ ...prev, arestas: applyEdgeChanges(mudancas, prev.arestas) }));
  }

  async function aoApagar({ nodes, edges }: { nodes: Node[]; edges: Edge[] }) {
    if (somenteLeitura) return;
    const notas = nodes.filter((n) => n.type === "nota").map((n) => n.id);
    const ids = nodes.filter((n) => n.type !== "nota" && !(n.data as DadosNo).fantasma).map((n) => n.id);
    if (ids.length + notas.length > 0) {
      const partes = [
        ids.length === 1 ? `"${ids[0]}"` : ids.length > 1 ? `${ids.length} passos` : "",
        notas.length === 1 ? "1 nota" : notas.length > 1 ? `${notas.length} notas` : "",
      ].filter(Boolean);
      if (!window.confirm(`Apagar ${partes.join(" e ")}?`)) {
        await carregar();
        return;
      }
    }
    try {
      for (const id of notas) await api.apagarNota(id);
      for (const id of ids) await api.apagarNo(id);
      for (const e of edges) {
        // Apagar um nó já soft-deleta toda aresta em que ele é origem OU destino
        // (servidor/nos.ts) — chamar DELETE de novo pra essas dá 404. Só apaga à
        // parte a aresta que não está presa a nenhum nó desta seleção.
        if (ids.includes(e.source) || ids.includes(e.target)) continue;
        await api.apagarAresta(e.id);
      }
    } catch (e) {
      setFalha((e as Error).message);
      await carregar();
    }
  }

  async function criar(alvoArmado: Armado, alvo: Posicao) {
    if (!catalogo) return;
    if (alvoArmado.tipo === TIPO_NOTA) {
      try {
        // O broadcast "nota-criada" volta pra própria sala e monta o nó — não é preciso
        // inserir localmente antes.
        await api.criarNota("", Math.round(alvo.x), Math.round(alvo.y));
      } catch (e) {
        setFalha((e as Error).message);
      }
      return;
    }
    // Sem categoria não há como decidir campos, forma nem cor — o objeto veio de uma
    // categoria que saiu do projeto entre o clique e agora.
    const cat = alvoArmado.categoriaId ? catalogo.porId.get(alvoArmado.categoriaId) : undefined;
    if (!cat) return;
    // O id do nó sai do título e não é mais editável depois — por isso o título é
    // perguntado agora, e não deixado como "sem título" pra corrigir no modal.
    const titulo = window.prompt(`Título do novo ${alvoArmado.tipo}:`)?.trim();
    if (!titulo) return;
    try {
      const chave = cat.forma_por;
      const { id } = await api.criarNo(titulo, cat.id, chave ? { [chave]: alvoArmado.tipo } : undefined);
      const { largura, altura } = tamanhoDe(formaDoTipo(cat, alvoArmado.tipo));
      const posicao = { x: Math.round(alvo.x - largura / 2), y: Math.round(alvo.y - altura / 2) };
      posicoesPendentes.current.set(id, posicao);
      wsRef.current?.enviar({ t: "soltou", no: id, x: posicao.x, y: posicao.y });
      setAberto(id);
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  useEffect(() => {
    // Só de teclado não dá para clicar no canvas: com uma figura armada, Enter cria no
    // centro da tela. Sem isso a paleta seria inalcançável sem mouse.
    if (!armado) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !rf.current) return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName)) return;
      e.preventDefault();
      const centro = rf.current.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
      const alvoArmado = armado;
      setArmado(null);
      void criar(alvoArmado, centro);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [armado]);

  /** Centraliza a viewport num objeto do canvas, sem mexer no zoom atual. */
  function irPara(id: string) {
    const no = rf.current?.getNode(id);
    if (!no || !rf.current) return;
    const largura = no.measured?.width ?? 0;
    const altura = no.measured?.height ?? 0;
    void rf.current.setCenter(no.position.x + largura / 2, no.position.y + altura / 2, {
      zoom: rf.current.getZoom(),
      duration: 300,
    });
    rf.current.updateNode(id, { selected: true });
  }

  // A roda do botão direito continua oferecendo só a categoria principal: menu radial com
  // todos os objetos de todas as categorias viraria ilegível.
  const principal = catalogo?.categorias[0];
  const tipos = tiposDeForma(principal);
  const meuId = usuario.id;

  // Barra lateral e canvas leem a mesma lista de nós — nada de segunda fonte da verdade.
  const itens: ItemGrafo[] = render.nos
    .filter((n) => n.type === "processo" && !(n.data as DadosNo).fantasma)
    .map((n) => ({
      id: n.id,
      titulo: (n.data as DadosNo).titulo,
      tipo: (n.data as DadosNo).tipo ?? "",
      categoria: (n.data as DadosNo).categoria ?? "",
    }));
  const notas: Nota[] = render.nos
    .filter((n) => n.type === "nota")
    .map((n) => ({ id: n.id, conteudo: (n.data as DadosNota).conteudo, x: n.position.x, y: n.position.y }));

  const proximoTema: Record<Preferencia, Preferencia> = { sistema: "claro", claro: "escuro", escuro: "sistema" };
  const rotuloTema = { sistema: "🖥️", claro: "☀️", escuro: "🌙" };
  const outros = presenca.filter((p) => p.id !== meuId);

  return (
    <TemaProvider value={tema}>
      <div className={`tela${armado ? " armado" : ""}`}>
        <header className="topo">
          <MenuProjeto
            titulo={titulo}
            projetoId={projetoId}
            usuario={usuario}
            aoTrocar={aoTrocarProjeto}
            aoNovoProjeto={aoVoltar}
            aoSairDaConta={aoSairDaConta}
          />
          {somenteLeitura ? <span className="selo">somente leitura</span> : null}

          {!somenteLeitura ? (
            <div className="modos" role="group" aria-label="ferramenta">
              <button
                type="button"
                aria-pressed={modo === "selecao"}
                title="selecionar (V) — arraste desenha o retângulo de seleção"
                onClick={() => setModo("selecao")}
              >
                ⬚ selecionar
              </button>
              <button
                type="button"
                aria-pressed={modo === "mao"}
                title="mover (H) — arraste move a tela"
                onClick={() => setModo("mao")}
              >
                ✋ mover
              </button>
            </div>
          ) : null}

          {falha ? <span className="erro">{falha}</span> : null}

          <div className="empurra" />

          {outros.length > 0 ? (
            <div className="presentes" aria-label={`${outros.length} pessoa(s) neste projeto`}>
              {outros.map((p) => (
                <span key={p.id} className="avatar" title={p.nome}>
                  {p.nome.slice(0, 2).toUpperCase()}
                </span>
              ))}
            </div>
          ) : null}

          <button
            type="button"
            className="tema"
            title={`tema: ${preferencia} — clique para trocar`}
            aria-label={`tema ${preferencia}, clique para trocar`}
            onClick={() => {
              const proxima = proximoTema[preferencia];
              setPreferencia(proxima);
              gravarPreferencia(proxima);
            }}
          >
            {rotuloTema[preferencia]}
          </button>
        </header>

        <div className="corpo">
          <BarraLateral
            catalogo={catalogo}
            somenteLeitura={somenteLeitura}
            itens={itens}
            notas={notas}
            armado={armado}
            setaArmada={setaArmada}
            aoArmar={(a) =>
              setArmado((atual) =>
                atual && atual.tipo === a.tipo && atual.categoriaId === a.categoriaId ? null : a,
              )
            }
            aoArmarSeta={(t) => setSetaArmada((atual) => (atual === t ? null : t))}
            aoBuscar={api.buscar}
            aoIrPara={irPara}
            aoAbrirNo={(id) => {
              irPara(id);
              setAberto(id);
            }}
          />

          <ReactFlow
            aria-label={`grafo de processo: ${titulo || "carregando"}`}
            colorMode={tema === "escuro" ? "dark" : "light"}
            nodes={render.nos}
            edges={render.arestas}
            nodeTypes={tiposNo}
            edgeTypes={tiposAresta}
            onInit={(inst) => (rf.current = inst)}
            connectionMode={ConnectionMode.Loose}
            nodesDraggable={!somenteLeitura}
            nodesConnectable={!somenteLeitura}
            onNodesChange={aoMudarNos}
            onEdgesChange={aoMudarArestas}
            onDelete={(x) => void aoApagar(x)}
            onConnect={(c) => void aoConectar(c)}
            selectionOnDrag={modo === "selecao"}
            panOnDrag={modo === "mao" ? [0, 1] : [1]}
            selectionMode={SelectionMode.Partial}
            selectionKeyCode={modo === "mao" ? "Shift" : null}
            multiSelectionKeyCode="Shift"
            deleteKeyCode={somenteLeitura ? null : ["Delete", "Backspace"]}
            panOnScroll
            panOnScrollMode={PanOnScrollMode.Free}
            zoomOnScroll={false}
            zoomOnPinch
            onNodeClick={(_, no) => {
              if (no.type === "nota") return;
              setAberto((no.data as DadosNo).fantasma ? null : no.id);
            }}
            onEdgeClick={(_, e) => {
              const d = e.data as DadosAresta | undefined;
              if (d?.aresta) setArestaAberta(d.aresta);
            }}
            onPaneClick={(e) => {
              if (armado && rf.current) {
                const alvo = rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY });
                const alvoArmado = armado;
                setArmado(null);
                void criar(alvoArmado, alvo);
                return;
              }
              setAberto(null);
              setArestaAberta(null);
            }}
            onPaneContextMenu={(e) => {
              e.preventDefault();
              if (somenteLeitura || tipos.length === 0 || !rf.current) return;
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
              if (somenteLeitura) return;
              const tipo = e.dataTransfer.getData(TIPO_ARRASTADO);
              if (!tipo || !rf.current || !catalogo) return;
              // O dataTransfer só carrega o tipo; a categoria é a primeira que o declara.
              const dono =
                tipo === TIPO_NOTA
                  ? null
                  : (catalogo.categorias.find((c) => tiposDeForma(c).includes(tipo))?.id ?? null);
              if (tipo !== TIPO_NOTA && !dono) return;
              void criar(
                { categoriaId: dono, tipo } as Armado,
                rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
              );
            }}
            fitView
          >
            <Background />
            <Controls />
            {/* Nota não tem `cor` no data (é DadosNota) — cai no amarelo do post-it. */}
            <MiniMap pannable zoomable nodeColor={(n) => (n.type === "nota" ? "#facc15" : (n.data as DadosNo).cor)} />
          </ReactFlow>
        </div>

        {roda && principal ? (
          <RodaFormas
            x={roda.x}
            y={roda.y}
            tipos={tipos}
            formaDoTipo={(t) => formaDoTipo(principal, t)}
            aoEscolher={(tipo) => {
              setRoda(null);
              void criar({ categoriaId: principal.id, tipo }, roda.alvo);
            }}
            aoFechar={() => setRoda(null)}
          />
        ) : null}
        {arestaAberta && catalogo ? (
          <ModalAresta
            aresta={arestaAberta}
            catalogo={catalogo}
            papel={papel}
            api={api}
            aoFechar={() => setArestaAberta(null)}
          />
        ) : null}
        {aberto && catalogo ? (
          <Modal
            id={aberto}
            catalogo={catalogo}
            papel={papel}
            api={api}
            presenca={presenca}
            meuId={meuId}
            enviarEditando={(no) => wsRef.current?.enviar({ t: "editando", no })}
            aoFechar={() => setAberto(null)}
          />
        ) : null}
      </div>
    </TemaProvider>
  );
}

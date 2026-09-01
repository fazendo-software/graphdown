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
import { congelarRecorte } from "../../core/exportacao.ts";
import type { MsgServidor, Nota, ObjetoSeta, Papel, Posicao, Projeto, RecorteExportacao, Retangulo, Usuario } from "../../core/tipos.ts";
import { apiProjeto, apiProjetos, type ArestaComId } from "./api.ts";
import { conectarWS, type ConexaoWS } from "./ws.ts";
import { aplicarDiffRender, preservarDimensoes, type RenderState } from "./diffGrafo.ts";
import { progressoDoRender } from "./progressoRender.ts";
import { NoProcesso, type DadosNo } from "./NoProcesso.tsx";
import { NotaNo, type DadosNota } from "./NotaNo.tsx";
import { SetaLivreNo, type DadosSetaLivre } from "./SetaLivreNo.tsx";
import { ArestaRough } from "./ArestaRough.tsx";
import { RodaFormas, type CategoriaRoda } from "./RodaFormas.tsx";
import { conterCentroRoda } from "./rodaGeometria.ts";
import { BarraLateral, type Armado, type ItemGrafo } from "./BarraLateral.tsx";
import { MenuProjeto } from "./MenuProjeto.tsx";
import { completarLayout } from "./layoutAuto.ts";
import { tamanhoDe } from "./rough.ts";
import { MenuExportar, type CapturaExportacao } from "./MenuExportar.tsx";
import { PALETA, TemaProvider, gravarPreferencia, lerPreferencia, type Preferencia, type Tema } from "./tema.ts";
import { Modal } from "./Modal.tsx";
import { ModalAresta } from "./ModalAresta.tsx";
import { DialogoConfirmacao, DialogoTexto } from "./Dialogos.tsx";
import { arestasInternas, deveProcessarAtalhoCanvas, posicaoColada } from "./interacoesCanvas.ts";
import { ehTipoSetaLivre, pontosIniciais, TIPOS_SETA_LIVRE, transladarPontos, type TipoSetaLivre } from "./setasLivres.ts";
import {
  categoriaDoNo,
  edgeDeAresta,
  formaDoNo,
  formaDoTipo,
  montarCatalogo,
  montarTudo,
  nodeDeFantasma,
  nodeDeNota,
  nodeDeSetaLivre,
  nodeDeReal,
  tiposDeForma,
  type Catalogo,
  type DadosAresta,
} from "./grafoRender.ts";

const tiposNo = { processo: NoProcesso, nota: NotaNo, "seta-livre": SetaLivreNo };
const tiposAresta = { rough: ArestaRough };
const TIPO_ARRASTADO = "application/grapydown-tipo";
/** Item da paleta que não é um tipo da categoria: cria nota em vez de nó. */
const TIPO_NOTA = "nota";
const TIPO_SETA_LIVRE = "seta-livre";

type Props = {
  projetoId: string;
  papel: Papel;
  usuario: Usuario;
  aoTrocarProjeto: (projeto: Projeto) => void;
  aoVoltar: () => void;
  aoSairDaConta: () => void;
};

type ItemCopiado =
  | { kind: "no"; id: string; titulo: string; categoriaId: string; campos: Record<string, unknown>; x: number; y: number }
  | { kind: "nota"; id: string; conteudo: string; x: number; y: number }
  | { kind: "seta-livre"; id: string; tipo: TipoSetaLivre; pontos: Posicao[] };

type ArestaCopiada = { de: string; para: string; tipo?: string; quando?: string; campos: Record<string, unknown> };
type AreaTransferencia = { itens: ItemCopiado[]; arestas: ArestaCopiada[] };

export function Canvas({ projetoId, papel, usuario, aoTrocarProjeto, aoVoltar, aoSairDaConta }: Props) {
  const api = useMemo(() => apiProjeto(projetoId), [projetoId]);
  const somenteLeitura = papel === "leitor";

  const [titulo, setTitulo] = useState("");
  const [catalogo, setCatalogo] = useState<Catalogo | null>(null);
  const [render, setRender] = useState<RenderState>({ nos: [], arestas: [] });
  const [presenca, setPresenca] = useState<{ id: string; nome: string; editando: string | null }[]>([]);
  const [aberto, setAberto] = useState<string | null>(null);
  const [arestaAberta, setArestaAberta] = useState<ArestaComId | null>(null);
  const [roda, setRoda] = useState<{ x: number; y: number; alvo: Posicao; gesto: "segurar" | "clique" } | null>(
    null,
  );
  const [falha, setFalha] = useState<string | null>(null);
  const [exportarAberto, setExportarAberto] = useState(false);
  const [dialogo, setDialogo] = useState<
    | { tipo: "confirmacao"; mensagem: string; resolver: (ok: boolean) => void }
    | { tipo: "texto"; mensagem: string; resolver: (valor: string | null) => void }
    | null
  >(null);
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
  // Segurar o botão esquerdo no vazio abre a roda (gesto do ping do LoL). O clique curto
  // continua fazendo o que sempre fez — limpar a seleção —, e arrastar continua sendo pan
  // ou seleção: por isso o gesto exige tempo E imobilidade.
  const pressionado = useRef<{ x: number; y: number; timer: number } | null>(null);
  const canvasAtivo = useRef(false);
  // A área de transferência é interna e propositalmente não usa `navigator.clipboard`:
  // ela carrega a estrutura do grafo (inclusive as relações), não um texto serializado.
  // Portanto não sobrevive a recarga nem pode ser colada em outro aplicativo.
  const areaTransferencia = useRef<AreaTransferencia | null>(null);
  // `applyNodeChanges` já move a caixa visual em cada frame. Guardamos a origem separada
  // para persistir o delta total nos pontos quando o arraste termina, sem a seta saltar.
  const inicioArrasteSeta = useRef(new Map<string, Posicao>());
  const copiarRef = useRef<() => void>(() => undefined);
  const colarRef = useRef<() => void>(() => undefined);
  const cortarRef = useRef<() => void>(() => undefined);

  function pedirConfirmacao(mensagem: string): Promise<boolean> {
    return new Promise((resolver) => setDialogo({ tipo: "confirmacao", mensagem, resolver }));
  }

  function pedirTexto(mensagem: string): Promise<string | null> {
    return new Promise((resolver) => setDialogo({ tipo: "texto", mensagem, resolver }));
  }

  function fecharDialogo() {
    if (!dialogo) return;
    if (dialogo.tipo === "confirmacao") dialogo.resolver(false);
    else dialogo.resolver(null);
    setDialogo(null);
  }

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
  const salvarSetaLivre = useCallback(
    (id: string, pontos: ObjetoSeta["pontos"]) => {
      api.patchObjetoSeta(id, { pontos }).catch((e: Error) => setFalha(e.message));
    },
    [api],
  );
  const construirSetaLivre = useCallback(
    (seta: ObjetoSeta) => nodeDeSetaLivre(seta, somenteLeitura, salvarSetaLivre),
    [somenteLeitura, salvarSetaLivre],
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
      setRender((anterior) => {
        const tamanhos = new Map(anterior.nos.map((no) => [no.id, no]));
        const proximo = montarTudo(g, cat, layoutCompleto, corPadrao, somenteLeitura, salvarNota, salvarSetaLivre);
        return { ...proximo, nos: proximo.nos.map((no) => preservarDimensoes(no, tamanhos.get(no.id))) };
      });
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
          noReal: (no, posicao) => nodeDeReal(no, catalogo, posicao, somenteLeitura),
          noFantasma: nodeDeFantasma,
          aresta: (a) => edgeDeAresta(a, catalogo, corPadrao),
          nota: construirNota,
          seta: construirSetaLivre,
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
    const atualizarContexto = (alvo: EventTarget | null) => {
      canvasAtivo.current = alvo instanceof Element && Boolean(alvo.closest(".react-flow"));
    };
    const aoPointer = (e: PointerEvent) => atualizarContexto(e.target);
    const aoFocar = (e: FocusEvent) => atualizarContexto(e.target);
    document.addEventListener("pointerdown", aoPointer);
    document.addEventListener("focusin", aoFocar);
    return () => {
      document.removeEventListener("pointerdown", aoPointer);
      document.removeEventListener("focusin", aoFocar);
    };
  }, []);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(null);
        setArestaAberta(null);
        setRoda(null);
        setArmado(null);
        setExportarAberto(false);
        return;
      }
      const alvo = e.target as HTMLElement | null;
      const editavel = Boolean(alvo && (/^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable));
      if (editavel) return;
      if (alvo?.closest(".modal")) return;
      if (e.metaKey || e.ctrlKey) {
        const selecao = window.getSelection();
        if (!deveProcessarAtalhoCanvas(canvasAtivo.current, editavel, Boolean(selecao && !selecao.isCollapsed))) return;
        if (e.key.toLowerCase() === "a") {
          // Seleção do canvas, não seleção de texto da página: Ctrl/Cmd+A marca
          // Todos os objetos do canvas (nós, notas e setas livres), mantendo as relações
          // semânticas fora da seleção.
          e.preventDefault();
          setRender((prev) => ({
            ...prev,
            nos: prev.nos.map((n) => ({ ...n, selected: true })),
            arestas: prev.arestas.map((a) => ({ ...a, selected: false })),
          }));
        } else if (e.key.toLowerCase() === "c") {
          e.preventDefault();
          copiarRef.current();
        } else if (e.key.toLowerCase() === "x") {
          e.preventDefault();
          cortarRef.current();
        } else if (e.key.toLowerCase() === "v") {
          e.preventDefault();
          colarRef.current();
        }
        return;
      }
      if (e.altKey) return;
      // V e H: mesma convenção de Figma, Illustrator e afins.
      if (e.key === "v" || e.key === "V") setModo("selecao");
      if (e.key === "h" || e.key === "H") setModo("mao");
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const ehNota = (id: string) => render.nos.find((n) => n.id === id)?.type === "nota";
  const ehSetaLivre = (id: string) => render.nos.find((n) => n.id === id)?.type === "seta-livre";

  const MS_SEGURAR = 220;
  const TOLERANCIA_PX = 6;

  function cancelarPressao() {
    if (!pressionado.current) return;
    clearTimeout(pressionado.current.timer);
    pressionado.current = null;
  }

  function abrirRoda(clientX: number, clientY: number, gesto: "segurar" | "clique") {
    if (somenteLeitura || !rf.current || categoriasDaRoda.length === 0) return;
    setRoda({
      x: conterCentroRoda(clientX, window.innerWidth),
      y: conterCentroRoda(clientY, window.innerHeight),
      alvo: rf.current.screenToFlowPosition({ x: clientX, y: clientY }),
      gesto,
    });
  }

  function aoPressionar(e: React.PointerEvent) {
    canvasAtivo.current = true;
    // Só o vazio: pressionar um nó é arrastar o nó, não abrir a roda.
    if (e.button !== 0 || armado || somenteLeitura) return;
    if (!(e.target as HTMLElement).classList.contains("react-flow__pane")) return;
    const { clientX, clientY } = e;
    cancelarPressao();
    pressionado.current = {
      x: clientX,
      y: clientY,
      timer: window.setTimeout(() => {
        pressionado.current = null;
        abrirRoda(clientX, clientY, "segurar");
      }, MS_SEGURAR),
    };
  }

  function aoMoverPonteiro(e: React.PointerEvent) {
    const p = pressionado.current;
    if (!p) return;
    // Saiu do lugar: era pan ou retângulo de seleção, não intenção de abrir a roda.
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > TOLERANCIA_PX) cancelarPressao();
  }

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
      if (ehSetaLivre(m.id)) {
        const anterior = render.nos.find((n) => n.id === m.id);
        if (m.dragging && anterior && !inicioArrasteSeta.current.has(m.id)) {
          inicioArrasteSeta.current.set(m.id, { ...anterior.position });
        }
        if (m.dragging === false) {
          const dados = anterior?.data as DadosSetaLivre | undefined;
          const inicio = inicioArrasteSeta.current.get(m.id) ?? anterior?.position;
          inicioArrasteSeta.current.delete(m.id);
          if (inicio && dados) {
            const pontos = transladarPontos(dados.pontos, x - inicio.x, y - inicio.y);
            api.patchObjetoSeta(m.id, { pontos }).catch((e: Error) => setFalha(e.message));
          }
        }
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
    const setasLivres = nodes.filter((n) => n.type === "seta-livre").map((n) => n.id);
    const ids = nodes
      .filter((n) => n.type !== "nota" && n.type !== "seta-livre" && !(n.data as DadosNo).fantasma)
      .map((n) => n.id);
    if (ids.length + notas.length + setasLivres.length > 0) {
      const partes = [
        ids.length === 1 ? `"${ids[0]}"` : ids.length > 1 ? `${ids.length} passos` : "",
        notas.length === 1 ? "1 nota" : notas.length > 1 ? `${notas.length} notas` : "",
        setasLivres.length === 1 ? "1 objeto de seta" : setasLivres.length > 1 ? `${setasLivres.length} objetos de seta` : "",
      ].filter(Boolean);
      if (!(await pedirConfirmacao(`Apagar ${partes.join(" e ")}?`))) {
        await carregar();
        return;
      }
    }
    try {
      for (const id of notas) await api.apagarNota(id);
      for (const id of setasLivres) await api.apagarObjetoSeta(id);
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

  async function copiarSelecionados(nodes = render.nos.filter((n) => n.selected)) {
    try {
      const itens: ItemCopiado[] = [];
      for (const node of nodes) {
        if (node.type === "nota") {
          itens.push({
            kind: "nota",
            id: node.id,
            conteudo: (node.data as DadosNota).conteudo,
            x: node.position.x,
            y: node.position.y,
          });
        } else if (node.type === "seta-livre") {
          const dados = node.data as DadosSetaLivre;
          itens.push({ kind: "seta-livre", id: node.id, tipo: dados.tipo, pontos: dados.pontos });
        } else if (!(node.data as DadosNo).fantasma) {
          const detalhe = await api.no(node.id);
          itens.push({
            kind: "no",
            id: node.id,
            titulo: detalhe.titulo,
            categoriaId: detalhe.categoria_id,
            campos: detalhe.campos,
            x: node.position.x,
            y: node.position.y,
          });
        }
      }
      const ids = new Set(itens.map((item) => item.id));
      areaTransferencia.current = {
        itens,
        arestas: arestasInternas(render.arestas, ids)
          .map((edge) => {
            const a = (edge.data as DadosAresta).aresta;
            return { de: edge.source, para: edge.target, tipo: a.tipo, quando: a.quando, campos: a.campos };
          }),
      };
    } catch (e) {
      setFalha((e as Error).message);
      throw e;
    }
  }

  async function colarSelecionados() {
    if (somenteLeitura || !areaTransferencia.current || areaTransferencia.current.itens.length === 0) return;
    const copia = areaTransferencia.current;
    const deslocamento = 40;
    const novos = new Map<string, string>();
    try {
      for (const item of copia.itens) {
        if (item.kind === "seta-livre") {
          const seta = await api.criarObjetoSeta(item.tipo, transladarPontos(item.pontos, deslocamento, deslocamento));
          novos.set(item.id, seta.id);
          continue;
        }
        const { x, y } = posicaoColada(item, deslocamento);
        if (item.kind === "nota") {
          const nota = await api.criarNota(item.conteudo, x, y);
          novos.set(item.id, nota.id);
        } else {
          const no = await api.criarNo(item.titulo, item.categoriaId, item.campos);
          novos.set(item.id, no.id);
          wsRef.current?.enviar({ t: "soltou", no: no.id, x, y });
        }
      }
      for (const aresta of copia.arestas) {
        const de = novos.get(aresta.de);
        const para = novos.get(aresta.para);
        if (!de || !para) continue;
        const nova = await api.criarAresta(de, para, aresta.tipo ?? null);
        if (aresta.quando || Object.keys(aresta.campos).length > 0) {
          await api.patchAresta(nova.id, { quando: aresta.quando ?? null, campos: aresta.campos });
        }
      }
    } catch (e) {
      setFalha((e as Error).message);
      await carregar();
    }
  }

  function iniciarCorte() {
    const nodes = render.nos.filter((n) => n.selected);
    const edges = render.arestas.filter((e) => e.selected);
    void copiarSelecionados(nodes)
      .then(() => aoApagar({ nodes, edges }))
      .catch(() => undefined);
  }

  copiarRef.current = () => void copiarSelecionados();
  colarRef.current = () => void colarSelecionados();
  cortarRef.current = iniciarCorte;

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
    if ("variante" in alvoArmado) {
      try {
        await api.criarObjetoSeta(alvoArmado.variante, pontosIniciais(alvoArmado.variante, {
          x: Math.round(alvo.x),
          y: Math.round(alvo.y),
        }));
      } catch (e) {
        setFalha((e as Error).message);
      }
      return;
    }
    // Sem categoria não há como decidir campos, forma nem cor — o objeto veio de uma
    // categoria que saiu do projeto entre o clique e agora.
    const cat = alvoArmado.categoriaId ? catalogo.porId.get(alvoArmado.categoriaId) : undefined;
    if (!cat) return;
    // O id nasce do título, mas depois fica estável mesmo que o nome mude. Perguntar agora
    // evita criar o objeto com um título artificial antes de abrir o modal de detalhes.
    const titulo = (await pedirTexto(`Título do novo ${alvoArmado.tipo}:`))?.trim();
    if (!titulo) return;
    try {
      const chave = cat.forma_por;
      const { id } = await api.criarNo(titulo, cat.id, chave ? { [chave]: alvoArmado.tipo } : undefined);
      const { largura, altura } = tamanhoDe(formaDoTipo(cat, alvoArmado.tipo));
      const posicao = { x: Math.round(alvo.x - largura / 2), y: Math.round(alvo.y - altura / 2) };
      posicoesPendentes.current.set(id, posicao);
      wsRef.current?.enviar({ t: "soltou", no: id, x: posicao.x, y: posicao.y });
      // Depois do título, o segundo modal permite preencher os demais dados do objeto.
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

  // A roda passou a ter dois anéis: categoria por dentro, objetos dela por fora. Por isso
  // ela deixou de mostrar só a principal — categoria vazia fica fora para não virar setor
  // morto no anel interno.
  const categoriasDaRoda: CategoriaRoda[] = [
    ...(catalogo?.categorias ?? [])
      .map((c) => ({
        id: c.id,
        nome: c.nome,
        tipos: tiposDeForma(c),
        formaDoTipo: (t: string) => formaDoTipo(c, t),
      }))
      .filter((c) => c.tipos.length > 0),
    { id: "nota", nome: "anotação", tipos: [TIPO_NOTA], formaDoTipo: () => "", especial: "nota" },
    { id: "setas-livres", nome: "linhas", tipos: [...TIPOS_SETA_LIVRE], formaDoTipo: () => "", especial: "seta-livre" },
  ];
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
  // Derivado do mesmo render: cada `no-mudou` já reescreveu o nó em memória, então o
  // resumo e os badges acompanham sem nova requisição.
  const progresso = progressoDoRender(render);
  const notas: Nota[] = render.nos
    .filter((n) => n.type === "nota")
    .map((n) => ({ id: n.id, conteudo: (n.data as DadosNota).conteudo, x: n.position.x, y: n.position.y }));
  const setasLivres: ObjetoSeta[] = render.nos
    .filter((n) => n.type === "seta-livre")
    .map((n) => {
      const dados = n.data as DadosSetaLivre;
      return { id: n.id, tipo: dados.tipo, pontos: dados.pontos };
    });

  const proximoTema: Record<Preferencia, Preferencia> = { sistema: "claro", claro: "escuro", escuro: "sistema" };
  const rotuloTema = { sistema: "🖥️", claro: "☀️", escuro: "🌙" };
  const outros = presenca.filter((p) => p.id !== meuId);

  function dimensaoDoNo(no: Node): { largura: number; altura: number } {
    const largura = no.width ?? no.measured?.width;
    const altura = no.height ?? no.measured?.height;
    if (largura && altura) return { largura, altura };
    if (no.type === "nota") return { largura: 176, altura: 64 };
    if (no.type === "seta-livre") return { largura: no.width ?? 96, altura: no.height ?? 96 };
    const tamanho = tamanhoDe((no.data as DadosNo).forma);
    return { largura: tamanho.largura, altura: tamanho.altura };
  }

  /** A viewport e os resize locais são copiados junto com os ids, antes do GET do snapshot. */
  function capturarExportacao(escopo: "projeto" | "selecao-area"): CapturaExportacao {
    const itens = render.nos.filter((no) => no.type === "nota" || !(no.data as DadosNo).fantasma);
    const limites: { nos: Record<string, Retangulo>; notas: Record<string, Retangulo>; setas: Record<string, Retangulo> } = { nos: {}, notas: {}, setas: {} };
    const dimensoesLocais: CapturaExportacao["dimensoesLocais"] = {};
    for (const no of itens) {
      const dimensao = dimensaoDoNo(no);
      const limite = { x: no.position.x, y: no.position.y, ...dimensao };
      dimensoesLocais[no.id] = dimensao;
      if (no.type === "nota") limites.notas[no.id] = limite;
      else if (no.type === "seta-livre") limites.setas[no.id] = limite;
      else limites.nos[no.id] = limite;
    }
    const elemento = document.querySelector<HTMLElement>(".canvas-grafo");
    const caixa = elemento?.getBoundingClientRect();
    const inicio = caixa && rf.current ? rf.current.screenToFlowPosition({ x: caixa.left, y: caixa.top }) : { x: 0, y: 0 };
    const fim = caixa && rf.current ? rf.current.screenToFlowPosition({ x: caixa.right, y: caixa.bottom }) : { x: 0, y: 0 };
    const area = { x: inicio.x, y: inicio.y, largura: Math.max(0, fim.x - inicio.x), altura: Math.max(0, fim.y - inicio.y) };
    const nosSelecionados = itens.filter((no) => no.selected && no.type !== "nota" && no.type !== "seta-livre");
    const notasSelecionadas = itens.filter((no) => no.selected && no.type === "nota");
    const setasSelecionadas = itens.filter((no) => no.selected && no.type === "seta-livre");
    const haSelecao = nosSelecionados.length + notasSelecionadas.length + setasSelecionadas.length > 0;
    const recorte: RecorteExportacao = escopo === "projeto"
      ? { tipo: "projeto" }
      : haSelecao
        ? { tipo: "selecao", nos: nosSelecionados.map((no) => no.id), notas: notasSelecionadas.map((no) => no.id), setas: setasSelecionadas.map((no) => no.id), area }
        : { tipo: "area", area, limites };
    const dentro = (limite: Retangulo) => limite.x <= area.x + area.largura && limite.x + limite.largura >= area.x && limite.y <= area.y + area.altura && limite.y + limite.altura >= area.y;
    const nosDoRecorte = recorte.tipo === "projeto"
      ? itens.filter((no) => no.type !== "nota" && no.type !== "seta-livre")
      : recorte.tipo === "selecao"
        ? itens.filter((no) => no.type !== "nota" && no.type !== "seta-livre" && recorte.nos.includes(no.id))
        : itens.filter((no) => no.type !== "nota" && no.type !== "seta-livre" && dentro(limites.nos[no.id]));
    const notasDoRecorte = recorte.tipo === "projeto"
      ? itens.filter((no) => no.type === "nota")
      : recorte.tipo === "selecao"
        ? itens.filter((no) => no.type === "nota" && recorte.notas.includes(no.id))
        : itens.filter((no) => no.type === "nota" && dentro(limites.notas[no.id]));
    const setasDoRecorte = recorte.tipo === "projeto"
      ? itens.filter((no) => no.type === "seta-livre")
      : recorte.tipo === "selecao"
        ? itens.filter((no) => no.type === "seta-livre" && recorte.setas.includes(no.id))
        : itens.filter((no) => no.type === "seta-livre" && dentro(limites.setas[no.id]));
    const ids = new Set(nosDoRecorte.map((no) => no.id));
    const contagens = {
      nos: nosDoRecorte.length,
      notas: notasDoRecorte.length,
      setas: setasDoRecorte.length,
      arestas: recorte.tipo === "projeto" ? render.arestas.length : render.arestas.filter((aresta) => ids.has(aresta.source) && ids.has(aresta.target)).length,
    };
    return { recorte: congelarRecorte(recorte), dimensoesLocais, haConteudo: contagens.nos + contagens.notas + contagens.setas > 0, haSelecao, contagens };
  }

  const haSelecaoAtual = render.nos.some((no) => no.selected && (no.type === "nota" || no.type === "seta-livre" || !(no.data as DadosNo).fantasma));

  return (
    <TemaProvider value={tema}>
      <div className={`tela${armado ? " armado" : ""}`}>
        <header className="topo">
          <MenuProjeto
            titulo={titulo}
            projetoId={projetoId}
            usuario={usuario}
            podeRenomear={papel === "dono"}
            aoTrocar={aoTrocarProjeto}
            aoNovoProjeto={aoVoltar}
            aoRenomear={() => void (async () => {
              const nome = (await pedirTexto("novo nome do projeto:"))?.trim();
              if (!nome) return;
              try {
                await apiProjetos.renomear(projetoId, nome);
                setTitulo(nome);
              } catch (e) {
                setFalha((e as Error).message);
              }
            })()}
            aoSairDaConta={aoSairDaConta}
          />
          <nav className="navegacao-canvas" aria-label="áreas do canvas">
            <span className="aba-atual">Canvas</span>
            <button type="button" disabled title="Diagramas em breve">Diagramas <small>em breve</small></button>
            <button type="button" disabled title="Apresentar em breve">Apresentar <small>em breve</small></button>
          </nav>
          <MenuExportar
            aberto={exportarAberto}
            aoMudarAberto={setExportarAberto}
            capturar={capturarExportacao}
            haSelecaoAtual={haSelecaoAtual}
            carregarSnapshot={api.exportacao}
            tema={tema}
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
                <button type="button" title="copiar seleção (Ctrl/Cmd+C)" onClick={() => copiarRef.current()}>
                  ⧉ copiar
                </button>
                <button type="button" title="colar seleção (Ctrl/Cmd+V)" onClick={() => colarRef.current()}>
                  ⎘ colar
                </button>
                <button type="button" title="cortar seleção (Ctrl/Cmd+X)" onClick={() => cortarRef.current()}>
                  ✂ cortar
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
            progresso={progresso}
            notas={notas}
            setasLivres={setasLivres}
            armado={armado}
            setaArmada={setaArmada}
            aoArmar={(a) =>
              setArmado((atual) =>
                atual &&
                atual.tipo === a.tipo &&
                atual.categoriaId === a.categoriaId &&
                (!("variante" in atual) || !("variante" in a) || atual.variante === a.variante)
                  ? null
                  : a,
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
            className="canvas-grafo"
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
              setExportarAberto(false);
              if (no.type === "nota" || no.type === "seta-livre") return;
              setAberto((no.data as DadosNo).fantasma ? null : no.id);
            }}
            onEdgeClick={(_, e) => {
              setExportarAberto(false);
              const d = e.data as DadosAresta | undefined;
              if (d?.aresta) setArestaAberta(d.aresta);
            }}
            onPaneClick={(e) => {
              setExportarAberto(false);
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
              cancelarPressao();
              const { clientX, clientY } = e as React.MouseEvent;
              abrirRoda(clientX, clientY, "clique");
            }}
            onPointerDown={aoPressionar}
            onPointerMove={aoMoverPonteiro}
            onPointerUp={cancelarPressao}
            onPointerCancel={cancelarPressao}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "copy";
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (somenteLeitura) return;
              const tipo = e.dataTransfer.getData(TIPO_ARRASTADO);
              if (!tipo || !rf.current || !catalogo) return;
              const varianteSeta = tipo.startsWith(`${TIPO_SETA_LIVRE}:`)
                ? tipo.slice(TIPO_SETA_LIVRE.length + 1)
                : null;
              if (varianteSeta && ehTipoSetaLivre(varianteSeta)) {
                void criar(
                  { categoriaId: null, tipo: "seta-livre", variante: varianteSeta },
                  rf.current.screenToFlowPosition({ x: e.clientX, y: e.clientY }),
                );
                return;
              }
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
            <MiniMap
              pannable
              zoomable
              nodeColor={(n) =>
                n.type === "nota" ? "#facc15" : n.type === "seta-livre" ? "#71717a" : (n.data as DadosNo).cor
              }
            />
          </ReactFlow>
        </div>

        {roda ? (
          <RodaFormas
            x={roda.x}
            y={roda.y}
            categorias={categoriasDaRoda}
            gesto={roda.gesto}
            aoEscolher={(categoriaId, tipo, especial) => {
              setRoda(null);
              if (especial === "nota") {
                void criar({ categoriaId: null, tipo: TIPO_NOTA }, roda.alvo);
              } else if (especial === "seta-livre" && ehTipoSetaLivre(tipo)) {
                void criar({ categoriaId: null, tipo: TIPO_SETA_LIVRE, variante: tipo }, roda.alvo);
              } else {
                void criar({ categoriaId, tipo }, roda.alvo);
              }
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
            tamanho={(() => {
              const no = rf.current?.getNode(aberto);
              const padrao = no?.type === "processo" ? tamanhoDe((no.data as DadosNo).forma) : undefined;
              return { width: no?.width ?? padrao?.largura, height: no?.height ?? padrao?.altura };
            })()}
            aoRedimensionar={(width, height) => {
              rf.current?.updateNode(aberto, { width, height });
              setRender((prev) => ({
                ...prev,
                nos: prev.nos.map((n) => (n.id === aberto ? { ...n, width, height } : n)),
              }));
            }}
            aoFechar={() => setAberto(null)}
          />
        ) : null}
        {dialogo?.tipo === "confirmacao" ? (
          <DialogoConfirmacao
            mensagem={dialogo.mensagem}
            confirmar="confirmar"
            aoCancelar={fecharDialogo}
            aoConfirmar={() => {
              const atual = dialogo;
              setDialogo(null);
              atual.resolver(true);
            }}
          />
        ) : dialogo?.tipo === "texto" ? (
          <DialogoTexto
            mensagem={dialogo.mensagem}
            valor=""
            confirmar="criar"
            aoCancelar={fecharDialogo}
            aoConfirmar={(valor) => {
              const atual = dialogo;
              setDialogo(null);
              atual.resolver(valor);
            }}
          />
        ) : null}
      </div>
    </TemaProvider>
  );
}

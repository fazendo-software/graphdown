export type Aresta = {
  /** Id do nó de origem. Pode não existir como nó — aí é fantasma. */
  de: string;
  para: string;
  quando?: string;
  tipo?: string;
  /** Recursos da transição (prazo, pessoas, custo…), declarados em `campos_aresta`. */
  campos: Record<string, unknown>;
};

export type EstiloAresta = {
  estilo?: "continua" | "tracejada" | "pontilhada";
  ponta?: "cheia" | "aberta" | "nenhuma" | "ambas";
  cor?: string;
  /** Só rótulo de UI: separa a paleta de setas em seções. Não afeta o desenho. */
  grupo?: string;
};

/** Const e não union solta: o seletor do modal e a validação da rota leem a mesma lista. */
export const ESTADOS_EXECUCAO = ["pendente", "em_andamento", "concluido", "bloqueado"] as const;
export type EstadoExecucao = (typeof ESTADOS_EXECUCAO)[number];

export type No = {
  id: string;
  titulo: string;
  /** Qual categoria do projeto define os campos, a forma e a cor DESTE nó. Um projeto
   * mistura várias, então isso não dá mais para deduzir do projeto. */
  categoria_id: string;
  campos: Record<string, unknown>;
  /** Só vem no detalhe do nó, não na listagem do grafo. */
  corpo?: string;
  /** Incrementa a cada escrita de corpo. O PUT devolve 409 se divergir. */
  versao: number;
  /** Desvio de esquema contra a categoria. Não bloqueia salvar, só sinaliza. */
  erro?: string;
  /** Par sempre normalizado pelo servidor: só tarefa tem estado. Nó informativo é
   * `{ tarefa: false, estado: null }` e fica fora do cálculo de progresso. */
  execucao: { tarefa: boolean; estado: EstadoExecucao | null };
};

export type Grafo = {
  nos: No[];
  arestas: Aresta[];
  fantasmas: string[];
};

export type CampoCategoria = {
  chave: string;
  tipo: "texto" | "enum";
  obrigatorio?: boolean;
  opcoes?: string[];
};

export type Categoria = {
  nome: string;
  /** Categoria cujo campo `url` é mostrado como iframe no canvas. */
  incorporavel?: boolean;
  campos: CampoCategoria[];
  cor_por?: string;
  cores?: Record<string, string>;
  forma_por?: string;
  formas?: Record<string, string>;
  arestas?: Record<string, EstiloAresta>;
  /** Campos de recurso que cada aresta pode ter. Mesmo formato de `campos`. */
  campos_aresta?: CampoCategoria[];
};

export type Posicao = { x: number; y: number };
/**
 * Montado pelo servidor a partir de `nos.pos_x`/`pos_y`. O front não vê as colunas.
 * Nó nunca posicionado fica **fora** do objeto — é assim que `completarLayout` sabe
 * quem precisa de dagre.
 */
export type Layout = Record<string, Posicao>;

/** Listagem enxuta para o formulário de criar projeto. */
export type CategoriaResumo = { id: string; nome: string };

/** Categoria como o front a recebe: um projeto tem várias, então o id deixa de ser
 * implícito e passa a viajar junto. */
export type CategoriaComId = Categoria & { id: string };

export type Papel = "dono" | "editor" | "leitor";
export type Projeto = { id: string; nome: string; papel: Papel };
export type Usuario = { id: string; nome: string; email: string };
export type Nota = { id: string; conteudo: string; x: number; y: number };
/** Seta visual livre — não é uma relação semântica entre dois nós. */
export type ObjetoSeta = {
  id: string;
  tipo: "linha" | "seta" | "cotovelo" | "bloco" | "divisor";
  pontos: Posicao[];
};

/** Retângulo em coordenadas do canvas, usado pelo recorte de exportação. */
export type Retangulo = { x: number; y: number; largura: number; altura: number };

export type NoExportacao = No & { corpo: string; posicao?: Posicao };

/**
 * Contrato interno do exportador. A API entrega a verdade semântica; cada formato a
 * transforma localmente sem voltar a consultar o projeto.
 */
export type ExportacaoSnapshot = {
  versao: 1;
  exportadoEm: string;
  projeto: { id: string; titulo: string };
  categorias: CategoriaComId[];
  camposAresta: CampoCategoria[];
  estilosAresta: Record<string, EstiloAresta>;
  nos: NoExportacao[];
  notas: Nota[];
  /** Necessário só à exportação visual; Markdown/RFC deliberadamente o omite. */
  objetosSeta: ObjetoSeta[];
  arestas: Array<Aresta & { id: string }>;
  fantasmas: string[];
};

/** Recorte congelado pelo cliente antes de pedir o snapshot ao servidor. */
export type RecorteExportacao =
  | { tipo: "projeto" }
  | { tipo: "selecao"; nos: string[]; notas: string[]; setas: string[]; area: Retangulo }
  | {
      tipo: "area";
      area: Retangulo;
      /** Geometria da tela congelada junto com a viewport; inclui resize ainda local. */
      limites: { nos: Record<string, Retangulo>; notas: Record<string, Retangulo>; setas: Record<string, Retangulo> };
    };

/** Uma linha do resultado de `GET /busca`. `trecho` já vem destacado pelo ts_headline. */
export type ResultadoBusca = { id: string; titulo: string; trecho: string };

/** Cliente → servidor. Só posição e presença viajam por WS; estrutura vai por HTTP. */
export type MsgCliente =
  | { t: "arrastando"; no: string; x: number; y: number }
  | { t: "soltou"; no: string; x: number; y: number }
  | { t: "editando"; no: string | null };

/** Servidor → sala do projeto. */
export type MsgServidor =
  | { t: "arrastando"; no: string; x: number; y: number; por: string }
  | { t: "posicao"; no: string; x: number; y: number }
  | { t: "no-criado" | "no-mudou" | "no-apagado"; no: No }
  | {
      t: "aresta-criada" | "aresta-mudou" | "aresta-apagada";
      aresta: Aresta & { id: string };
    }
  // Nota não tem mensagem de arraste ao vivo: posição dela é persistida por PATCH ao
  // soltar, então o outro cliente vê a nota pular para o lugar final, não deslizando.
  | { t: "nota-criada" | "nota-mudou" | "nota-apagada"; nota: Nota }
  | { t: "seta-criada" | "seta-mudou" | "seta-apagada"; seta: ObjetoSeta }
  | { t: "presenca"; usuarios: { id: string; nome: string; editando: string | null }[] }
  | { t: "erro"; mensagem: string };

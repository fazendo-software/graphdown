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
  | { t: "presenca"; usuarios: { id: string; nome: string; editando: string | null }[] }
  | { t: "erro"; mensagem: string };

export type Aresta = { de: string; para: string; quando?: string; tipo?: string };

export type EstiloAresta = {
  estilo?: "continua" | "tracejada" | "pontilhada";
  ponta?: "cheia" | "aberta" | "nenhuma" | "ambas";
  cor?: string;
};

export type No = {
  id: string;
  titulo: string;
  campos: Record<string, unknown>;
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
};

export type Posicao = { x: number; y: number };
export type Layout = Record<string, Posicao>;

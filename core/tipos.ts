export type Aresta = { de: string; para: string; quando?: string };

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
};

export type Posicao = { x: number; y: number };
export type Layout = Record<string, Posicao>;

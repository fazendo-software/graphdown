import type {
  Aresta,
  CampoCategoria,
  CategoriaComId,
  CategoriaResumo,
  EstiloAresta,
  Layout,
  No,
  Nota,
  Projeto,
  ResultadoBusca,
  Usuario,
} from "../../core/tipos.ts";

export type ArestaComId = Aresta & { id: string };

export type GrafoResposta = {
  titulo: string;
  /** Um projeto mistura várias categorias; a principal vem primeiro. */
  categorias: CategoriaComId[];
  /** Estilos de seta e recursos de aresta fundidos no servidor: valem para o projeto
   * inteiro, porque uma aresta liga nós de categorias diferentes. */
  arestasEstilo: Record<string, EstiloAresta>;
  camposAresta: CampoCategoria[];
  nos: No[];
  arestas: ArestaComId[];
  fantasmas: string[];
  layout: Layout;
  notas: Nota[];
};

export type NoDetalhe = {
  id: string;
  categoria_id: string;
  /** Nome de exibição do nó — coluna própria, não um campo de `campos`. Pode mudar sem
   * mudar o id: o id só é derivado do título no momento da criação. */
  titulo: string;
  campos: Record<string, unknown>;
  corpo: string;
  versao: number;
  erro?: string;
};

/** 409 do PUT de corpo: alguém salvou entre a abertura e o clique em "salvar". */
export class ErroConflito extends Error {
  versao: number;
  corpo: string;
  constructor(mensagem: string, versao: number, corpo: string) {
    super(mensagem);
    this.versao = versao;
    this.corpo = corpo;
  }
}

async function pedir<T>(rota: string, init?: RequestInit): Promise<T> {
  const r = await fetch(rota, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!r.ok) throw new Error(((await r.json()) as { erro?: string }).erro ?? `HTTP ${r.status}`);
  return (await r.json()) as T;
}

export const apiAuth = {
  registrar: (email: string, nome: string, senha: string) =>
    pedir<{ usuario: Usuario }>("/api/auth/registrar", {
      method: "POST",
      body: JSON.stringify({ email, nome, senha }),
    }),
  entrar: (email: string, senha: string) =>
    pedir<{ usuario: Usuario }>("/api/auth/entrar", {
      method: "POST",
      body: JSON.stringify({ email, senha }),
    }),
  sair: () => pedir<{ ok: true }>("/api/auth/sair", { method: "POST" }),
  /** null quando não há sessão — não é falha, é o estado "deslogado". */
  eu: async (): Promise<Usuario | null> => {
    const r = await fetch("/api/auth/eu");
    if (r.status === 401) return null;
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const { usuario } = (await r.json()) as { usuario: Usuario };
    return usuario;
  },
};

export const apiProjetos = {
  listar: () => pedir<Projeto[]>("/api/projetos"),
  criar: (nome: string, categoriaId: string) =>
    pedir<{ id: string }>("/api/projetos", {
      method: "POST",
      body: JSON.stringify({ nome, categoria_id: categoriaId }),
    }),
  apagar: (id: string) =>
    pedir<{ ok: true }>(`/api/projetos/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

export const apiCategorias = {
  listar: () => pedir<CategoriaResumo[]>("/api/categorias"),
};

export function apiProjeto(projetoId: string) {
  const base = `/api/projetos/${encodeURIComponent(projetoId)}`;
  return {
    grafo: () => pedir<GrafoResposta>(`${base}/grafo`),
    no: (id: string) => pedir<NoDetalhe>(`${base}/nos/${encodeURIComponent(id)}`),
    criarNo: (titulo: string, categoriaId: string, campos?: Record<string, unknown>) =>
      pedir<{ id: string }>(`${base}/nos`, {
        method: "POST",
        body: JSON.stringify({ titulo, categoria_id: categoriaId, campos }),
      }),
    patchNo: (id: string, campos: Record<string, unknown>, titulo?: string) =>
      pedir<{ ok: true }>(`${base}/nos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ campos, ...(titulo === undefined ? {} : { titulo }) }),
      }),
    renomearNo: (id: string, titulo: string) =>
      pedir<{ ok: true }>(`${base}/nos/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ titulo }),
      }),
    /** 409 vira ErroConflito, com a versão e o corpo atuais do servidor. */
    putCorpo: async (id: string, corpo: string, versao: number): Promise<{ ok: true; versao: number }> => {
      const r = await fetch(`${base}/nos/${encodeURIComponent(id)}/corpo`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ corpo, versao }),
      });
      const dados = (await r.json()) as {
        ok?: true;
        versao: number;
        corpo?: string;
        erro?: string;
      };
      if (r.status === 409) throw new ErroConflito(dados.erro ?? "conflito", dados.versao, dados.corpo ?? "");
      if (!r.ok) throw new Error(dados.erro ?? `HTTP ${r.status}`);
      return dados as { ok: true; versao: number };
    },
    apagarNo: (id: string) =>
      pedir<{ ok: true }>(`${base}/nos/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** `tipo` null é a seta padrão — é o que vai quando nada está armado na paleta. */
    criarAresta: (de: string, para: string, tipo?: string | null) =>
      pedir<{ id: string }>(`${base}/arestas`, {
        method: "POST",
        body: JSON.stringify({ de, para, tipo: tipo ?? null }),
      }),
    patchAresta: (
      id: string,
      dados: { quando?: string | null; tipo?: string | null; campos?: Record<string, unknown> },
    ) =>
      pedir<{ ok: true }>(`${base}/arestas/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(dados),
      }),
    apagarAresta: (id: string) =>
      pedir<{ ok: true }>(`${base}/arestas/${encodeURIComponent(id)}`, { method: "DELETE" }),
    /** Vazio devolve [] sem ir ao servidor — o campo de busca dispara a cada tecla. */
    buscar: (q: string) =>
      q.trim()
        ? pedir<ResultadoBusca[]>(`${base}/busca?q=${encodeURIComponent(q.trim())}`)
        : Promise.resolve([]),
    criarNota: (conteudo: string, x: number, y: number) =>
      pedir<Nota>(`${base}/notas`, { method: "POST", body: JSON.stringify({ conteudo, x, y }) }),
    /** Chave ausente preserva; `conteudo: null` limpa. Posição vem junto ao soltar. */
    patchNota: (id: string, dados: { conteudo?: string | null; x?: number; y?: number }) =>
      pedir<Nota>(`${base}/notas/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(dados),
      }),
    apagarNota: (id: string) =>
      pedir<{ ok: true }>(`${base}/notas/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}

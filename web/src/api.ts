import type { Aresta, Categoria, Layout, No } from "../../core/tipos.ts";

export type GrafoResposta = {
  titulo: string;
  categoria: Categoria;
  nos: No[];
  arestas: Aresta[];
  fantasmas: string[];
  layout: Layout;
};

export type NoDetalhe = {
  id: string;
  campos: Record<string, unknown>;
  corpo: string;
  erro?: string;
};

async function pedir<T>(rota: string, init?: RequestInit): Promise<T> {
  const r = await fetch(rota, {
    ...init,
    headers: init?.body ? { "content-type": "application/json" } : undefined,
  });
  if (!r.ok) throw new Error(((await r.json()) as { erro?: string }).erro ?? `HTTP ${r.status}`);
  return (await r.json()) as T;
}

export const api = {
  grafo: () => pedir<GrafoResposta>("/api/grafo"),
  no: (id: string) => pedir<NoDetalhe>(`/api/no/${encodeURIComponent(id)}`),
  criarNo: (titulo: string, campos?: Record<string, unknown>) =>
    pedir<{ id: string }>("/api/no", {
      method: "POST",
      body: JSON.stringify({ titulo, campos }),
    }),
  patchNo: (id: string, campos: Record<string, unknown>) =>
    pedir<{ ok: true }>(`/api/no/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ campos }),
    }),
  putCorpo: (id: string, corpo: string) =>
    pedir<{ ok: true }>(`/api/no/${encodeURIComponent(id)}/corpo`, {
      method: "PUT",
      body: JSON.stringify({ corpo }),
    }),
  apagarNo: (id: string) =>
    pedir<{ ok: true }>(`/api/no/${encodeURIComponent(id)}`, { method: "DELETE" }),
  putLayout: (layout: Layout) =>
    pedir<{ ok: true }>("/api/layout", { method: "PUT", body: JSON.stringify(layout) }),
};

import { comoLista, normalizarAresta } from "../../core/grafo.ts";
import { api } from "./api.ts";

export type Dependencia = { de: string; quando?: string; tipo?: string };

/** Volta ao formato do arquivo: string quando não há mais nada, objeto quando há. */
export function paraFrontmatter(d: Dependencia): unknown {
  if (!d.quando && !d.tipo) return d.de;
  return {
    de: d.de,
    ...(d.quando ? { quando: d.quando } : {}),
    ...(d.tipo ? { tipo: d.tipo } : {}),
  };
}

/** Aresta mora no destino. Ler passa por comoLista: `depende_de: x` escalar também vale. */
export function lerDeps(campos: Record<string, unknown>): Dependencia[] {
  return comoLista(campos.depende_de)
    .map(normalizarAresta)
    .filter((d): d is Dependencia => d !== null);
}

export function salvarDeps(id: string, lista: Dependencia[]): Promise<{ ok: true }> {
  return api.patchNo(id, { depende_de: lista.map(paraFrontmatter) });
}

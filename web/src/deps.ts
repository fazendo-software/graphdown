import { comoLista, normalizarAresta } from "../../core/grafo.ts";
import { api } from "./api.ts";

export type Dependencia = {
  de: string;
  quando?: string;
  tipo?: string;
  /** Recursos da transição: prazo, pessoas, custo… o que a categoria declarar. */
  campos: Record<string, unknown>;
};

function vazio(valor: unknown): boolean {
  return valor === undefined || valor === null || String(valor).trim() === "";
}

/** Volta ao formato do arquivo: string quando não sobrou nada, objeto quando sobrou. */
export function paraFrontmatter(d: Dependencia): unknown {
  const campos = Object.fromEntries(Object.entries(d.campos).filter(([, v]) => !vazio(v)));
  if (!d.quando && !d.tipo && Object.keys(campos).length === 0) return d.de;
  return {
    de: d.de,
    ...(d.quando ? { quando: d.quando } : {}),
    ...(d.tipo ? { tipo: d.tipo } : {}),
    ...campos,
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

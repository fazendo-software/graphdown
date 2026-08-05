import { parseNota } from "./parse.ts";
import type { Aresta, Grafo, No } from "./tipos.ts";

export type ArestaCrua = {
  de: string;
  quando?: string;
  tipo?: string;
  campos: Record<string, unknown>;
};

export function normalizarAresta(entrada: unknown): ArestaCrua | null {
  if (typeof entrada === "string") {
    return { de: entrada, quando: undefined, tipo: undefined, campos: {} };
  }
  if (entrada !== null && typeof entrada === "object") {
    // `de`, `quando` e `tipo` sao estruturais; o resto e recurso da transicao e passa
    // adiante sem o core saber o nome — quem declara isso e a categoria.
    const { de, quando, tipo, ...resto } = entrada as Record<string, unknown>;
    if (typeof de === "string") {
      return {
        de,
        quando: typeof quando === "string" ? quando : undefined,
        tipo: typeof tipo === "string" ? tipo : undefined,
        campos: resto,
      };
    }
  }
  return null;
}

/** `depende_de: 01-a` (escalar) vale tanto quanto uma lista de um item. */
export function comoLista(valor: unknown): unknown[] {
  if (Array.isArray(valor)) return valor;
  return valor === undefined || valor === null ? [] : [valor];
}

export function construirGrafo(arquivos: { id: string; texto: string }[]): Grafo {
  const nos: No[] = [];
  const arestas: Aresta[] = [];
  const fantasmas = new Set<string>();
  const existentes = new Set(arquivos.map((a) => a.id));

  for (const { id, texto } of arquivos) {
    const { doc, erro } = parseNota(texto);
    const campos = (erro ? {} : (doc.toJS() ?? {})) as Record<string, unknown>;
    nos.push({
      id,
      titulo: typeof campos.titulo === "string" && campos.titulo ? campos.titulo : id,
      campos,
      erro,
    });
    if (erro) continue;
    for (const bruta of comoLista(campos.depende_de)) {
      const a = normalizarAresta(bruta);
      if (!a) continue;
      if (!existentes.has(a.de)) fantasmas.add(a.de);
      arestas.push({ de: a.de, para: id, quando: a.quando, tipo: a.tipo, campos: a.campos });
    }
  }

  return { nos, arestas, fantasmas: [...fantasmas] };
}

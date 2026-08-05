import { parse, stringify } from "yaml";
import type { Categoria, CampoCategoria } from "./tipos.ts";

export function parseCategoria(texto: string): Categoria {
  const cru = (parse(texto) ?? {}) as Partial<Categoria>;
  return {
    nome: cru.nome ?? "Sem nome",
    campos: Array.isArray(cru.campos) ? (cru.campos as CampoCategoria[]) : [],
    cor_por: cru.cor_por,
    cores: cru.cores,
    forma_por: cru.forma_por,
    formas: cru.formas,
    arestas: cru.arestas,
    campos_aresta: Array.isArray(cru.campos_aresta)
      ? (cru.campos_aresta as CampoCategoria[])
      : undefined,
  };
}

export function templateNo(categoria: Categoria, titulo: string): string {
  const fm: Record<string, unknown> = { titulo };
  for (const campo of categoria.campos) {
    fm[campo.chave] = campo.tipo === "enum" ? (campo.opcoes?.[0] ?? "") : "";
  }
  fm.depende_de = [];
  return `---\n${stringify(fm).trimEnd()}\n---\n`;
}

export function idDeTitulo(titulo: string): string {
  const slug = titulo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "no";
}

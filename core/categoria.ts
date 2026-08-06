import { parse } from "yaml";
import type { Categoria, CampoCategoria, EstiloAresta } from "./tipos.ts";

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

/** Valor inicial de `nos.campos` ao criar um nó: enum cai na primeira opção, texto fica vazio. */
export function camposPadrao(categoria: Categoria): Record<string, unknown> {
  const campos: Record<string, unknown> = {};
  for (const campo of categoria.campos) {
    campos[campo.chave] = campo.tipo === "enum" ? (campo.opcoes?.[0] ?? "") : "";
  }
  return campos;
}

/** Campo obrigatório vazio ou valor de enum fora de `opcoes`: mesma coluna `erro` de hoje,
 * não bloqueia salvar, só sinaliza. */
export function validarCampos(categoria: Categoria, campos: Record<string, unknown>): string | undefined {
  for (const campo of categoria.campos) {
    const valor = campos[campo.chave];
    if (campo.obrigatorio && (valor === undefined || valor === null || valor === "")) {
      return `campo obrigatório vazio: ${campo.chave}`;
    }
    if (campo.tipo === "enum" && campo.opcoes && typeof valor === "string" && valor !== "" && !campo.opcoes.includes(valor)) {
      return `valor fora das opções de ${campo.chave}: ${valor}`;
    }
  }
  return undefined;
}

/**
 * Estilos de seta e recursos de aresta valem para o projeto inteiro, não por categoria: uma
 * aresta liga nós de categorias diferentes, então não há "a categoria da aresta".
 *
 * A fusão é por chave, com a **primeira** categoria vencendo — a lista chega ordenada com a
 * principal do projeto na frente, então acrescentar uma categoria secundária nunca muda o
 * significado de uma seta que já existia.
 */
export function fundirArestas(categorias: Categoria[]): Record<string, EstiloAresta> {
  const fundido: Record<string, EstiloAresta> = {};
  for (const cat of categorias) {
    for (const [chave, estilo] of Object.entries(cat.arestas ?? {})) {
      if (!(chave in fundido)) fundido[chave] = estilo;
    }
  }
  return fundido;
}

export function fundirCamposAresta(categorias: Categoria[]): CampoCategoria[] {
  const vistos = new Set<string>();
  const campos: CampoCategoria[] = [];
  for (const cat of categorias) {
    for (const campo of cat.campos_aresta ?? []) {
      if (vistos.has(campo.chave)) continue;
      vistos.add(campo.chave);
      campos.push(campo);
    }
  }
  return campos;
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

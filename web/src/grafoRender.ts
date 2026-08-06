import { MarkerType, type Edge, type Node } from "@xyflow/react";
import type {
  CampoCategoria,
  Categoria,
  CategoriaComId,
  EstiloAresta,
  Layout,
  No,
  Nota,
  Posicao,
} from "../../core/tipos.ts";
import type { ArestaComId, GrafoResposta } from "./api.ts";
import type { DadosNo } from "./NoProcesso.tsx";
import type { DadosNota } from "./NotaNo.tsx";
import { ARESTA_PADRAO } from "./ArestaRough.tsx";
import type { RenderState } from "./diffGrafo.ts";

export type DadosAresta = EstiloAresta & { aresta: ArestaComId };

/**
 * Tudo que o desenho precisa saber sobre as categorias do projeto. Existe porque o projeto
 * passou a misturar várias: forma e cor saem da categoria DO NÓ, enquanto estilos de seta e
 * recursos de aresta são do projeto inteiro (fundidos pelo servidor).
 */
export type Catalogo = {
  categorias: CategoriaComId[];
  porId: Map<string, CategoriaComId>;
  arestasEstilo: Record<string, EstiloAresta>;
  camposAresta: CampoCategoria[];
};

export function montarCatalogo(g: {
  categorias: CategoriaComId[];
  arestasEstilo: Record<string, EstiloAresta>;
  camposAresta: CampoCategoria[];
}): Catalogo {
  return {
    categorias: g.categorias,
    porId: new Map(g.categorias.map((c) => [c.id, c])),
    arestasEstilo: g.arestasEstilo,
    camposAresta: g.camposAresta,
  };
}

/** Categoria some do projeto ou nó vem de uma desconhecida: cai na principal em vez de
 * quebrar o desenho. Sem isso um `categoria_id` órfão deixaria o nó sem forma nem cor. */
export function categoriaDoNo(cat: Catalogo, categoriaId: string): CategoriaComId | undefined {
  return cat.porId.get(categoriaId) ?? cat.categorias[0];
}

export function corDoNo(cat: Categoria | undefined, campos: Record<string, unknown>): string {
  const chave = cat?.cor_por;
  const valor = chave ? String(campos[chave] ?? "") : "";
  return cat?.cores?.[valor] ?? "#52525b";
}

/** Forma desconhecida ou categoria sem `formas`: retângulo, como era antes. */
export function formaDoTipo(cat: Categoria | undefined, tipo: string): string {
  return cat?.formas?.[tipo] ?? "retangulo";
}

export function formaDoNo(cat: Categoria | undefined, campos: Record<string, unknown>): string {
  if (!cat?.forma_por) return "retangulo";
  return formaDoTipo(cat, String(campos[cat.forma_por] ?? ""));
}

export function tipoDoNo(cat: Categoria | undefined, campos: Record<string, unknown>): string {
  return cat?.forma_por ? String(campos[cat.forma_por] ?? "") : "";
}

export function tiposDeForma(cat: Categoria | undefined): string[] {
  return cat?.campos.find((c) => c.chave === cat.forma_por)?.opcoes ?? [];
}

export function estiloDaAresta(cat: Catalogo, tipo: string | undefined, corPadrao: string) {
  const declarado = {
    ...ARESTA_PADRAO,
    ...(cat.arestasEstilo.padrao ?? {}),
    ...((tipo ? cat.arestasEstilo[tipo] : undefined) ?? {}),
  } as EstiloAresta & typeof ARESTA_PADRAO;
  // Cor só vem da categoria se ela declarou uma; senão segue o tema.
  return { ...declarado, cor: declarado.cor || corPadrao };
}

function marcadores(ponta: string, cor: string) {
  const cheia = { type: MarkerType.ArrowClosed, color: cor };
  const aberta = { type: MarkerType.Arrow, color: cor };
  if (ponta === "nenhuma") return {};
  if (ponta === "aberta") return { markerEnd: aberta };
  if (ponta === "ambas") return { markerEnd: cheia, markerStart: cheia };
  return { markerEnd: cheia };
}

/** Rótulo da seta: o `quando` mais os recursos preenchidos, na ordem da categoria. */
export function rotuloDaAresta(cat: Catalogo, a: ArestaComId): string | undefined {
  const recursos = cat.camposAresta
    .map((c) => a.campos[c.chave])
    .filter((v) => v !== undefined && v !== null && String(v).trim() !== "")
    .map(String);
  const texto = [a.quando, ...recursos].filter(Boolean).join(" · ");
  return texto || undefined;
}

export function nodeDeReal(no: No, cat: Catalogo, posicao: Posicao, somenteLeitura = false): Node {
  const categoria = categoriaDoNo(cat, no.categoria_id);
  return {
    id: no.id,
    type: "processo",
    position: posicao,
    data: {
      titulo: no.titulo,
      cor: corDoNo(categoria, no.campos),
      forma: formaDoNo(categoria, no.campos),
      fantasma: false,
      tipo: tipoDoNo(categoria, no.campos),
      categoria: categoria?.nome ?? "",
      erro: no.erro,
      somenteLeitura,
    } as DadosNo,
  };
}

export function nodeDeFantasma(id: string, posicao: Posicao): Node {
  return {
    id,
    type: "processo",
    position: posicao,
    data: { titulo: id, cor: "#dc2626", forma: "retangulo", fantasma: true } as DadosNo,
  };
}

/** Nota vive no mesmo array de nós do React Flow — só o `type` a distingue. */
export function nodeDeNota(
  nota: Nota,
  somenteLeitura: boolean,
  aoSalvar: (id: string, conteudo: string) => void,
): Node {
  return {
    id: nota.id,
    type: "nota",
    position: { x: nota.x, y: nota.y },
    data: {
      conteudo: nota.conteudo,
      somenteLeitura,
      aoSalvar: (conteudo: string) => aoSalvar(nota.id, conteudo),
    } as DadosNota,
  };
}

export function edgeDeAresta(a: ArestaComId, cat: Catalogo, corPadrao: string): Edge {
  const estilo = estiloDaAresta(cat, a.tipo, corPadrao);
  return {
    id: a.id,
    source: a.de,
    target: a.para,
    type: "rough",
    label: rotuloDaAresta(cat, a),
    data: { ...estilo, aresta: a } as DadosAresta,
    ...marcadores(estilo.ponta, estilo.cor),
  };
}

export function montarTudo(
  g: GrafoResposta,
  cat: Catalogo,
  layout: Layout,
  corPadrao: string,
  somenteLeitura: boolean,
  aoSalvarNota: (id: string, conteudo: string) => void,
): RenderState {
  const reais = new Set(g.nos.map((n) => n.id));
  const nos = g.nos.map((n) => nodeDeReal(n, cat, layout[n.id] ?? { x: 0, y: 0 }, somenteLeitura));
  for (const id of g.fantasmas) {
    if (reais.has(id)) continue;
    nos.push(nodeDeFantasma(id, layout[id] ?? { x: 0, y: 0 }));
  }
  for (const nota of g.notas) nos.push(nodeDeNota(nota, somenteLeitura, aoSalvarNota));
  const arestas = g.arestas.map((a) => edgeDeAresta(a, cat, corPadrao));
  return { nos, arestas };
}

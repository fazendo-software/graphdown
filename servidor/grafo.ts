import type { Pool } from "pg";
import { fundirArestas, fundirCamposAresta } from "../core/categoria.ts";
import { categoriasDoProjeto } from "./categorias.ts";
import { buscarProjeto } from "./projetos.ts";
import { listarNos, buscarLayout } from "./nos.ts";
import { listarArestas, calcularFantasmas } from "./arestas.ts";
import { listarNotas } from "./notas.ts";
import { listarObjetosSeta } from "./objetosSeta.ts";

export async function montarGrafo(pool: Pool, projetoId: string) {
  const projeto = await buscarProjeto(pool, projetoId);
  if (!projeto) return null;
  // Notas vêm no mesmo snapshot: o canvas monta tudo numa requisição só, tanto na
  // abertura quanto na reconexão do WS.
  const [categorias, nos, arestas, fantasmas, layout, notas, objetosSeta] = await Promise.all([
    categoriasDoProjeto(pool, projetoId),
    listarNos(pool, projetoId),
    listarArestas(pool, projetoId),
    calcularFantasmas(pool, projetoId),
    buscarLayout(pool, projetoId),
    listarNotas(pool, projetoId),
    listarObjetosSeta(pool, projetoId),
  ]);
  return {
    titulo: projeto.nome,
    categorias,
    // Fundidos no servidor: uma aresta liga nós de categorias diferentes, então não existe
    // "a categoria da aresta" — os estilos e os recursos são do projeto inteiro.
    arestasEstilo: fundirArestas(categorias),
    camposAresta: fundirCamposAresta(categorias),
    nos,
    arestas,
    fantasmas,
    layout,
    notas,
    objetosSeta,
  };
}

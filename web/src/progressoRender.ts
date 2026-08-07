import { calcularProgresso, type Progresso } from "../../core/progresso.ts";
import type { DadosNo } from "./NoProcesso.tsx";
import type { RenderState } from "./diffGrafo.ts";

/**
 * Progresso a partir do que já está na tela. O snapshot e cada `no-mudou` alimentam o
 * mesmo `RenderState`, então recalcular aqui é uma varredura em memória — sem requisição
 * nova, sem consulta por nó.
 *
 * Só nós reais entram: nota, seta livre e fantasma não são objetos do projeto.
 * Das raízes, ficam as que de fato **iniciam** um fluxo — um objeto solto não é um fluxo,
 * e listar cada um deles como "sem tarefas" enterraria os fluxos de verdade.
 *
 * Roda a cada render do Canvas, inclusive durante um arraste. É uma varredura `O(V + E)`
 * por raiz, ordens de grandeza abaixo do que o próprio React Flow faz por quadro; se um
 * projeto grande acusar custo aqui, o passo seguinte é memoizar por versão do grafo, não
 * guardar percentual no banco.
 */
export function progressoDoRender(render: RenderState): Progresso {
  const nos = render.nos
    .filter((n) => n.type === "processo" && !(n.data as DadosNo).fantasma)
    .map((n) => ({ id: n.id, execucao: (n.data as DadosNo).execucao ?? { tarefa: false, estado: null } }));
  const idsReais = new Set(nos.map((no) => no.id));
  // Relação com fantasma só serve à visualização do dado quebrado; não inicia fluxo nem
  // entra no cálculo de execução.
  const arestas = render.arestas
    .filter((a) => idsReais.has(a.source) && idsReais.has(a.target))
    .map((a) => ({ de: a.source, para: a.target }));
  const comSaida = new Set(arestas.map((a) => a.de));
  const progresso = calcularProgresso(nos, arestas);
  return { ...progresso, raizes: progresso.raizes.filter((raiz) => comSaida.has(raiz.id)) };
}

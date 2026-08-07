import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ConnectionMode, ReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { EstadoExecucao, No } from "../../core/tipos.ts";
import { percentualDeProgresso } from "../../core/progresso.ts";
import { ArestaRough } from "./ArestaRough.tsx";
import { NoProcesso } from "./NoProcesso.tsx";
import { NotaNo } from "./NotaNo.tsx";
import { SetaLivreNo } from "./SetaLivreNo.tsx";
import { aplicarDiffRender, type ConstrutoresRender, type RenderState } from "./diffGrafo.ts";
import { edgeDeAresta, montarCatalogo, nodeDeFantasma, nodeDeNota, nodeDeReal, nodeDeSetaLivre } from "./grafoRender.ts";
import { progressoDoRender } from "./progressoRender.ts";
import { TemaProvider } from "./tema.ts";

/**
 * Smoke do progresso no navegador: o mesmo caminho do Canvas (React Flow + nossos tipos de
 * nó/aresta + `aplicarDiffRender`), sem servidor. `smokeProgresso.concluir()` injeta o
 * `no-mudou` que chegaria pelo WebSocket de outro cliente — nada de reload, nada de fetch.
 */

const catalogo = montarCatalogo({
  categorias: [{ id: "processo", nome: "Processo", campos: [] }],
  arestasEstilo: {},
  camposAresta: [],
});

const tiposNo = { processo: NoProcesso, nota: NotaNo, "seta-livre": SetaLivreNo };
const tiposAresta = { rough: ArestaRough };

function no(id: string, estado?: EstadoExecucao): No {
  return {
    id,
    titulo: id,
    categoria_id: "processo",
    campos: {},
    versao: 1,
    execucao: estado === undefined ? { tarefa: false, estado: null } : { tarefa: true, estado },
  };
}

const construtores: ConstrutoresRender = {
  noReal: (n, posicao) => nodeDeReal(n, catalogo, posicao),
  noFantasma: (id, posicao) => nodeDeFantasma(id, posicao),
  aresta: (a) => edgeDeAresta(a, catalogo, "#52525b"),
  nota: (n) => nodeDeNota(n, false, () => undefined),
  seta: (s) => nodeDeSetaLivre(s, false, () => undefined),
};

const inicial: RenderState = {
  nos: [
    nodeDeReal(no("inicio"), catalogo, { x: 40, y: 120 }),
    nodeDeReal(no("entrega", "pendente"), catalogo, { x: 320, y: 120 }),
  ],
  arestas: [edgeDeAresta({ id: "e1", de: "inicio", para: "entrega", campos: {} }, catalogo, "#52525b")],
};

function App() {
  const [render, setRender] = useState<RenderState>(inicial);
  const progresso = progressoDoRender(render);
  const global =
    progresso.resumo.tarefas === 0
      ? "sem tarefas"
      : `${progresso.resumo.concluidas}/${progresso.resumo.tarefas} · ${percentualDeProgresso(progresso.resumo.concluidas, progresso.resumo.tarefas)}%`;

  useEffect(() => {
    (window as Window & { smokeProgresso?: { concluir: () => void } }).smokeProgresso = {
      concluir: () =>
        setRender((prev) =>
          aplicarDiffRender(prev, { t: "no-mudou", no: no("entrega", "concluido") }, {
            usuarioId: "eu",
            nomeDe: () => "outro",
            posicaoPendente: () => undefined,
            construtores,
          }),
        ),
    };
  }, []);

  return (
    <TemaProvider value="claro">
      <p id="resumo-global">{global}</p>
      <div style={{ width: 640, height: 320 }}>
        {/* Loose como no Canvas: os nós só declaram handles de origem, então sem isto o
            React Flow recusa a aresta por falta de handle de destino. */}
        <ReactFlow
          nodes={render.nos}
          edges={render.arestas}
          nodeTypes={tiposNo}
          edgeTypes={tiposAresta}
          connectionMode={ConnectionMode.Loose}
          fitView
        />
      </div>
    </TemaProvider>
  );
}

createRoot(document.getElementById("raiz")!).render(<App />);

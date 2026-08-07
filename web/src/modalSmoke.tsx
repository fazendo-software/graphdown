import { createRoot } from "react-dom/client";
import type { No, Papel } from "../../core/tipos.ts";
import { Modal } from "./Modal.tsx";
import { montarCatalogo } from "./grafoRender.ts";
import { apiProjeto } from "./api.ts";

type PatchRegistrado = { titulo?: string; campos?: Record<string, unknown>; execucao?: No["execucao"] };
const chamadas = { patch: [] as PatchRegistrado[], corpo: [] as string[], fechou: 0 };
const detalhe = {
  id: "passo",
  categoria_id: "processo",
  titulo: "Nome inicial",
  campos: { contexto: "antes" },
  corpo: "Detalhe inicial\n",
  versao: 1,
  execucao: { tarefa: false, estado: null },
};
const api = {
  no: async () => detalhe,
  patchNo: async (_id: string, dados: PatchRegistrado) => {
    chamadas.patch.push(dados);
    return { ok: true as const, no: detalhe as unknown as No };
  },
  putCorpo: async (_id: string, corpo: string) => {
    chamadas.corpo.push(corpo);
    return { ok: true as const, versao: 2 };
  },
} as unknown as ReturnType<typeof apiProjeto>;

const catalogo = montarCatalogo({
  categorias: [{ id: "processo", nome: "Processo", campos: [{ chave: "contexto", tipo: "texto" }] }],
  arestasEstilo: {},
  camposAresta: [],
});

// O mesmo smoke cobre o leitor: `?papel=leitor` monta o modal sem poder de escrita.
const papel: Papel = new URLSearchParams(location.search).get("papel") === "leitor" ? "leitor" : "editor";

createRoot(document.getElementById("raiz")!).render(
  <Modal id="passo" catalogo={catalogo} papel={papel} api={api} presenca={[]} meuId="eu" enviarEditando={() => undefined} aoFechar={() => { chamadas.fechou++; }} />,
);

(window as Window & { smokeModal?: typeof chamadas }).smokeModal = chamadas;

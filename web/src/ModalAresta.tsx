import { useState } from "react";
import type { Papel } from "../../core/tipos.ts";
import type { apiProjeto, ArestaComId } from "./api.ts";
import type { Catalogo } from "./grafoRender.ts";
import { DialogoConfirmacao } from "./Dialogos.tsx";

type Props = {
  aresta: ArestaComId;
  catalogo: Catalogo;
  papel: Papel;
  api: ReturnType<typeof apiProjeto>;
  aoFechar: () => void;
};

/** A aresta agora é linha própria (`arestas`), não mais campo `depende_de` do destino. */
export function ModalAresta({ aresta, catalogo, papel, api, aoFechar }: Props) {
  const [quando, setQuando] = useState(aresta.quando ?? "");
  const [tipo, setTipo] = useState(aresta.tipo ?? "padrao");
  const [campos, setCampos] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(aresta.campos).map(([k, v]) => [k, v == null ? "" : String(v)])),
  );
  const [falha, setFalha] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const somenteLeitura = papel === "leitor";

  // Estilos e recursos vêm fundidos do servidor: a aresta liga nós de categorias
  // diferentes, então não existe "a categoria da aresta".
  const tipos = Object.keys(catalogo.arestasEstilo).filter((t) => t !== "padrao");
  const recursos = catalogo.camposAresta;

  async function salvar() {
    try {
      // null explícito pra limpar — omitir a chave (undefined) o servidor lê como
      // "não mudar este campo", então "" não pode virar undefined aqui.
      await api.patchAresta(aresta.id, {
        quando: quando.trim() || null,
        tipo: tipo === "padrao" ? null : tipo,
        campos,
      });
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  async function remover() {
    setConfirmando(true);
  }

  async function confirmarRemocao() {
    setConfirmando(false);
    try {
      await api.apagarAresta(aresta.id);
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal modal-aresta" role="dialog" aria-modal="true" aria-label="detalhes da relação" onClick={(e) => e.stopPropagation()}>
        <header className="modal-cabecalho">
          <div>
            <p className="modal-sobretitulo">relação</p>
            <h2><code>{aresta.de}</code> → <code>{aresta.para}</code></h2>
          </div>
          <button className="modal-fechar" type="button" aria-label="fechar" title="fechar" onClick={aoFechar}>×</button>
        </header>

        <div className="modal-corpo">
          <section className="modal-secao-objeto">
            <div className="modal-campos">
              <div>
                <label htmlFor="aresta-quando">rótulo</label>
                <input id="aresta-quando" value={quando} placeholder="ex.: aprovado" disabled={somenteLeitura} onChange={(e) => setQuando(e.target.value)} />
              </div>
              {tipos.length > 0 ? (
                <div>
                  <label htmlFor="aresta-tipo">tipo</label>
                  <select id="aresta-tipo" value={tipo} disabled={somenteLeitura} onChange={(e) => setTipo(e.target.value)}>
                    <option value="padrao">padrão</option>
                    {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
          </section>

          {recursos.length > 0 ? (
            <section className="modal-secao-objeto">
              <div className="modal-secao-titulo"><div><strong>recursos</strong><span>necessários até chegar ao destino</span></div></div>
              <div className="modal-campos">
                {recursos.map((campo) => {
                  const valor = campos[campo.chave] ?? "";
                  const trocar = (v: string) => setCampos((c) => ({ ...c, [campo.chave]: v }));
                  return (
                    <div key={campo.chave}>
                      <label htmlFor={`aresta-${campo.chave}`}>{campo.chave}</label>
                      {campo.tipo === "enum" ? (
                        <select id={`aresta-${campo.chave}`} value={valor} disabled={somenteLeitura} onChange={(e) => trocar(e.target.value)}>
                          <option value="">—</option>
                          {(campo.opcoes ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : <input id={`aresta-${campo.chave}`} value={valor} disabled={somenteLeitura} onChange={(e) => trocar(e.target.value)} />}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
          {falha ? <p className="erro">{falha}</p> : null}
        </div>

        <footer className="modal-rodape">
          {!somenteLeitura ? (
            <button className="perigo" onClick={() => void remover()}>
              desligar
            </button>
          ) : null}
          {!somenteLeitura ? <button onClick={aoFechar}>cancelar</button> : null}
          {!somenteLeitura ? <button onClick={() => void salvar()}>salvar</button> : null}
        </footer>
        {confirmando ? (
          <DialogoConfirmacao
            mensagem={`Desligar "${aresta.de}" de "${aresta.para}"?`}
            confirmar="desligar"
            aoCancelar={() => setConfirmando(false)}
            aoConfirmar={() => void confirmarRemocao()}
          />
        ) : null}
      </div>
    </div>
  );
}

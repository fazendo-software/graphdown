import { useState } from "react";
import type { Papel } from "../../core/tipos.ts";
import type { apiProjeto, ArestaComId } from "./api.ts";
import type { Catalogo } from "./grafoRender.ts";

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
    if (!window.confirm(`Desligar "${aresta.de}" de "${aresta.para}"?`)) return;
    try {
      await api.apagarAresta(aresta.id);
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          <code>{aresta.de}</code> → <code>{aresta.para}</code>
        </h2>

        <label htmlFor="aresta-quando">rótulo</label>
        <input
          id="aresta-quando"
          value={quando}
          placeholder="ex.: aprovado"
          disabled={somenteLeitura}
          onChange={(e) => setQuando(e.target.value)}
        />

        {tipos.length > 0 ? (
          <>
            <label htmlFor="aresta-tipo">tipo</label>
            <select
              id="aresta-tipo"
              value={tipo}
              disabled={somenteLeitura}
              onChange={(e) => setTipo(e.target.value)}
            >
              <option value="padrao">padrão</option>
              {tipos.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </>
        ) : null}

        {recursos.length > 0 ? (
          <>
            <p className="secao">recursos até chegar ao destino</p>
            {recursos.map((campo) => {
              const valor = campos[campo.chave] ?? "";
              const trocar = (v: string) => setCampos((c) => ({ ...c, [campo.chave]: v }));
              return (
                <div key={campo.chave}>
                  <label htmlFor={`aresta-${campo.chave}`}>{campo.chave}</label>
                  {campo.tipo === "enum" ? (
                    <select
                      id={`aresta-${campo.chave}`}
                      value={valor}
                      disabled={somenteLeitura}
                      onChange={(e) => trocar(e.target.value)}
                    >
                      <option value="">—</option>
                      {(campo.opcoes ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`aresta-${campo.chave}`}
                      value={valor}
                      disabled={somenteLeitura}
                      onChange={(e) => trocar(e.target.value)}
                    />
                  )}
                </div>
              );
            })}
          </>
        ) : null}

        {falha ? <p className="erro">{falha}</p> : null}

        <div className="modal-acoes">
          {!somenteLeitura ? (
            <button className="perigo" onClick={() => void remover()}>
              desligar
            </button>
          ) : null}
          <button onClick={aoFechar}>{somenteLeitura ? "fechar" : "cancelar"}</button>
          {!somenteLeitura ? <button onClick={() => void salvar()}>salvar</button> : null}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import type { Categoria } from "../../core/tipos.ts";
import { api } from "./api.ts";
import { lerDeps, salvarDeps, type Dependencia } from "./deps.ts";

type Props = {
  de: string;
  para: string;
  categoria: Categoria;
  aoFechar: () => void;
  aoMudar: () => void;
};

/**
 * A aresta não tem arquivo próprio: ela é uma entrada de `depende_de` no nó de destino.
 * Editar aqui é reescrever essa lista inteira com a entrada trocada.
 */
export function ModalAresta({ de, para, categoria, aoFechar, aoMudar }: Props) {
  const [lista, setLista] = useState<Dependencia[] | null>(null);
  const [quando, setQuando] = useState("");
  const [tipo, setTipo] = useState("padrao");
  const [falha, setFalha] = useState<string | null>(null);

  const tipos = Object.keys(categoria.arestas ?? {});

  useEffect(() => {
    setLista(null);
    api
      .no(para)
      .then((no) => {
        const deps = lerDeps(no.campos);
        const atual = deps.find((d) => d.de === de);
        setLista(deps);
        setQuando(atual?.quando ?? "");
        setTipo(atual?.tipo ?? "padrao");
      })
      .catch((e: Error) => setFalha(e.message));
  }, [de, para]);

  async function salvar() {
    if (!lista) return;
    try {
      await salvarDeps(
        para,
        lista.map((d) =>
          d.de === de
            ? { de, quando: quando.trim() || undefined, tipo: tipo === "padrao" ? undefined : tipo }
            : d,
        ),
      );
      aoMudar();
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  async function remover() {
    if (!lista) return;
    if (!window.confirm(`Desligar "${de}" de "${para}"?`)) return;
    try {
      await salvarDeps(
        para,
        lista.filter((d) => d.de !== de),
      );
      aoMudar();
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          <code>{de}</code> → <code>{para}</code>
        </h2>

        {!lista ? (
          <p>{falha ? "não foi possível abrir esta seta." : "carregando…"}</p>
        ) : (
          <>
            <label htmlFor="aresta-quando">rótulo (aparece no meio da seta)</label>
            <input
              id="aresta-quando"
              value={quando}
              placeholder="ex.: aprovado"
              onChange={(e) => setQuando(e.target.value)}
            />

            {tipos.length > 0 ? (
              <>
                <label htmlFor="aresta-tipo">tipo</label>
                <select id="aresta-tipo" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                  {tipos.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </>
            ) : null}

            <p className="dica">
              A seta mora em <code>depende_de</code> no arquivo <code>{para}.md</code>.
            </p>
          </>
        )}

        {falha ? <p className="erro">{falha}</p> : null}

        <div className="modal-acoes">
          {lista ? (
            <button className="perigo" onClick={() => void remover()}>
              desligar
            </button>
          ) : null}
          <button onClick={aoFechar}>cancelar</button>
          {lista ? <button onClick={() => void salvar()}>salvar</button> : null}
        </div>
      </div>
    </div>
  );
}

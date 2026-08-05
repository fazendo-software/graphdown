import { useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import type { Categoria } from "../../core/tipos.ts";
import { api, type NoDetalhe } from "./api.ts";

const md = new MarkdownIt({ html: false, linkify: true });

type Props = {
  id: string;
  categoria: Categoria;
  aoFechar: () => void;
  aoMudar: () => void;
};

export function Modal({ id, categoria, aoFechar, aoMudar }: Props) {
  const [no, setNo] = useState<NoDetalhe | null>(null);
  const [editandoCorpo, setEditandoCorpo] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [falha, setFalha] = useState<string | null>(null);

  useEffect(() => {
    setNo(null);
    setEditandoCorpo(false);
    api
      .no(id)
      .then(setNo)
      .catch((e: Error) => setFalha(e.message));
  }, [id]);

  async function salvarCampo(chave: string, valor: string) {
    try {
      await api.patchNo(id, { [chave]: valor });
      setNo(await api.no(id));
      aoMudar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  async function salvarCorpo() {
    try {
      await api.putCorpo(id, rascunho.endsWith("\n") ? rascunho : `${rascunho}\n`);
      setNo(await api.no(id));
      setEditandoCorpo(false);
      aoMudar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  async function apagar() {
    if (!window.confirm(`Mover "${id}" para a lixeira?`)) return;
    try {
      await api.apagarNo(id);
      aoMudar();
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {!no ? (
          <p>carregando…</p>
        ) : no.erro ? (
          <>
            <h2>{id}</h2>
            <p className="erro">Frontmatter inválido: {no.erro}</p>
            <p>
              Corrija o arquivo <code>{id}.md</code> num editor de texto.
            </p>
          </>
        ) : (
          <>
            <h2>{String(no.campos.titulo ?? id)}</h2>

            <label htmlFor="campo-titulo">titulo</label>
            <input
              id="campo-titulo"
              defaultValue={String(no.campos.titulo ?? "")}
              onBlur={(e) => void salvarCampo("titulo", e.target.value)}
            />

            {categoria.campos.map((campo) => {
              const valor = String(no.campos[campo.chave] ?? "");
              return (
                <div key={campo.chave}>
                  <label htmlFor={`campo-${campo.chave}`}>{campo.chave}</label>
                  {campo.tipo === "enum" ? (
                    <select
                      id={`campo-${campo.chave}`}
                      defaultValue={valor}
                      onChange={(e) => void salvarCampo(campo.chave, e.target.value)}
                    >
                      {(campo.opcoes ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`campo-${campo.chave}`}
                      defaultValue={valor}
                      onBlur={(e) => void salvarCampo(campo.chave, e.target.value)}
                    />
                  )}
                </div>
              );
            })}

            <label>detalhe</label>
            {editandoCorpo ? (
              <>
                <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} />
                <div className="modal-acoes">
                  <button onClick={() => setEditandoCorpo(false)}>cancelar</button>
                  <button onClick={() => void salvarCorpo()}>salvar detalhe</button>
                </div>
              </>
            ) : (
              <div
                onDoubleClick={() => {
                  setRascunho(no.corpo);
                  setEditandoCorpo(true);
                }}
                // seguro: markdown-it com html:false, conteudo vem de arquivo local do usuario
                dangerouslySetInnerHTML={{ __html: md.render(no.corpo) }}
              />
            )}

            {falha ? <p className="erro">{falha}</p> : null}

            <div className="modal-acoes">
              <button className="perigo" onClick={() => void apagar()}>
                apagar passo
              </button>
              <button onClick={aoFechar}>fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

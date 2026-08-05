import { useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import type { Categoria } from "../../core/tipos.ts";
import { comoLista, normalizarAresta } from "../../core/grafo.ts";
import { api, type NoDetalhe } from "./api.ts";

const md = new MarkdownIt({ html: false, linkify: true });

type Dependencia = { de: string; quando?: string; tipo?: string };

/** Volta ao formato do arquivo: string quando não há mais nada, objeto quando há. */
function paraFrontmatter(d: Dependencia): unknown {
  if (!d.quando && !d.tipo) return d.de;
  return { de: d.de, ...(d.quando ? { quando: d.quando } : {}), ...(d.tipo ? { tipo: d.tipo } : {}) };
}

type Props = {
  id: string;
  categoria: Categoria;
  aoFechar: () => void;
  aoMudar: () => void;
};

function Dependencias({
  lista,
  tipos,
  aoSalvar,
}: {
  lista: Dependencia[];
  tipos: string[];
  aoSalvar: (lista: Dependencia[]) => void;
}) {
  if (lista.length === 0) return null;
  return (
    <>
      <label>depende de</label>
      <ul className="deps">
        {lista.map((d, i) => (
          <li key={`${d.de}-${i}`}>
            <code>{d.de}</code>
            {tipos.length > 0 ? (
              <select
                value={d.tipo ?? "padrao"}
                aria-label={`tipo da aresta vinda de ${d.de}`}
                onChange={(e) => {
                  const tipo = e.target.value === "padrao" ? undefined : e.target.value;
                  aoSalvar(lista.map((x, j) => (i === j ? { ...x, tipo } : x)));
                }}
              >
                {tipos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              className="perigo"
              title="remover dependência"
              onClick={() => aoSalvar(lista.filter((_, j) => j !== i))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

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

  async function salvarDependencias(lista: Dependencia[]) {
    try {
      await api.patchNo(id, { depende_de: lista.map(paraFrontmatter) });
      setNo(await api.no(id));
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
          // A falha precisa aparecer aqui tambem: se o GET inicial quebrar, `no` fica null
          // pra sempre e o usuario ficaria preso num "carregando…" sem botao de fechar.
          <>
            <p>{falha ? "não foi possível abrir este passo." : "carregando…"}</p>
            {falha ? <p className="erro">{falha}</p> : null}
            <div className="modal-acoes">
              <button onClick={aoFechar}>fechar</button>
            </div>
          </>
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

            <Dependencias
              lista={comoLista(no.campos.depende_de)
                .map(normalizarAresta)
                .filter((d): d is Dependencia => d !== null)}
              tipos={Object.keys(categoria.arestas ?? {})}
              aoSalvar={(lista) => void salvarDependencias(lista)}
            />

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
                className="detalhe"
                onDoubleClick={() => {
                  setRascunho(no.corpo);
                  setEditandoCorpo(true);
                }}
                // seguro: markdown-it com html:false, conteudo vem de arquivo local do usuario
                // Nó recem-criado tem corpo vazio: sem o placeholder o alvo do duplo-clique
                // teria altura zero e nao daria pra escrever o detalhe pela UI.
                dangerouslySetInnerHTML={{
                  __html: no.corpo.trim()
                    ? md.render(no.corpo)
                    : '<p class="vazio">duplo-clique para escrever o detalhe</p>',
                }}
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

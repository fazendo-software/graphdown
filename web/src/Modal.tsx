import { useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import type { EstadoExecucao, No, Papel } from "../../core/tipos.ts";
import { ESTADOS_EXECUCAO } from "../../core/tipos.ts";
import { ErroConflito, type apiProjeto, type NoDetalhe } from "./api.ts";
import { GLIFO_EXECUCAO, ROTULO_EXECUCAO } from "./execucao.ts";
import { categoriaDoNo, type Catalogo } from "./grafoRender.ts";
import { DialogoConfirmacao } from "./Dialogos.tsx";
import { TAMANHO_MAXIMO, TAMANHO_MINIMO, tamanhoProporcional } from "./tamanhoProporcional.ts";

// html:false + a validação de link padrão do markdown-it (bloqueia javascript:/vbscript:/
// data: fora de imagem) é a sanitização exigida pelo contrato: corpo agora é texto de
// outro usuário, não mais um arquivo local. Sem lib nova — é a própria config do parser.
const md = new MarkdownIt({ html: false, linkify: true });

type Props = {
  id: string;
  catalogo: Catalogo;
  papel: Papel;
  api: ReturnType<typeof apiProjeto>;
  presenca: { id: string; nome: string; editando: string | null }[];
  meuId: string;
  enviarEditando: (no: string | null) => void;
  tamanho?: { width?: number; height?: number };
  aoRedimensionar?: (width: number, height: number) => void;
  aoFechar: () => void;
};

export function Modal({ id, catalogo, papel, api, presenca, meuId, enviarEditando, tamanho, aoRedimensionar, aoFechar }: Props) {
  const [no, setNo] = useState<NoDetalhe | null>(null);
  const [editandoCorpo, setEditandoCorpo] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [conflito, setConflito] = useState<{ versao: number; corpo: string } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [avancado, setAvancado] = useState(false);
  const [titulo, setTitulo] = useState("");
  const [campos, setCampos] = useState<Record<string, unknown>>({});
  const [execucao, setExecucao] = useState<No["execucao"]>({ tarefa: false, estado: null });
  const [largura, setLargura] = useState(200);
  const [altura, setAltura] = useState(106);
  const somenteLeitura = papel === "leitor";

  useEffect(() => {
    setNo(null);
    setEditandoCorpo(false);
    setConflito(null);
    setAvancado(false);
    api
      .no(id)
      .then((detalhe) => {
        setNo(detalhe);
        setTitulo(detalhe.titulo);
        setCampos(detalhe.campos);
        setExecucao(detalhe.execucao);
        const w = tamanho?.width ?? 200;
        const h = tamanho?.height ?? 106;
        setLargura(Math.max(TAMANHO_MINIMO, Math.min(TAMANHO_MAXIMO, Math.round(w))));
        setAltura(Math.max(TAMANHO_MINIMO, Math.min(TAMANHO_MAXIMO, Math.round(h))));
      })
      .catch((e: Error) => setFalha(e.message));
  }, [id, api]);

  // Presença de edição: avisa o servidor quando abre/fecha o rascunho, inclusive se o
  // modal for fechado com o rascunho aberto.
  useEffect(() => {
    enviarEditando(editandoCorpo ? id : null);
    return () => {
      if (editandoCorpo) enviarEditando(null);
    };
    // enviarEditando é estável (vem do App, não muda por render) — não entra nas deps
    // pra não reenviar "editando" toda vez que o Canvas re-renderiza.
  }, [editandoCorpo, id]);

  function aplicarTamanho(lado: "largura" | "altura", valor: number) {
    if (!aoRedimensionar) return;
    // Dimensão ainda é estado de renderização do canvas, não coluna do nó: manter esta
    // regra aqui impede a UI de prometer persistência ou colaboração que o protocolo não tem.
    const proximo = tamanhoProporcional({ largura, altura }, lado, valor);
    setLargura(proximo.largura);
    setAltura(proximo.altura);
    aoRedimensionar(proximo.largura, proximo.altura);
  }

  async function salvarCorpo(forcarVersao?: number): Promise<boolean> {
    if (!no) return false;
    const texto = rascunho.endsWith("\n") ? rascunho : `${rascunho}\n`;
    try {
      const r = await api.putCorpo(id, texto, forcarVersao ?? no.versao);
      setNo({ ...no, corpo: texto, versao: r.versao });
      setEditandoCorpo(false);
      setConflito(null);
      return true;
    } catch (e) {
      if (e instanceof ErroConflito) {
        setConflito({ versao: e.versao, corpo: e.corpo });
        return false;
      }
      setFalha((e as Error).message);
      return false;
    }
  }

  async function concluir() {
    if (somenteLeitura) {
      aoFechar();
      return;
    }
    if (!no) return;
    const novoTitulo = titulo.trim();
    if (!novoTitulo) {
      setFalha("informe um nome para concluir.");
      return;
    }
    if (editandoCorpo && !(await salvarCorpo())) return;
    try {
      // Só o que mudou, num PATCH só: o servidor grava tudo junto e transmite um único
      // `no-mudou`, então ninguém vê nome novo com execução antiga.
      const mudou = {
        ...(novoTitulo !== no.titulo ? { titulo: novoTitulo } : {}),
        ...(JSON.stringify(campos) !== JSON.stringify(no.campos) ? { campos } : {}),
        ...(JSON.stringify(execucao) !== JSON.stringify(no.execucao) ? { execucao } : {}),
      };
      if (Object.keys(mudou).length > 0) await api.patchNo(id, mudou);
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  function usarTextoDoServidor() {
    if (!no || !conflito) return;
    setNo({ ...no, corpo: conflito.corpo, versao: conflito.versao });
    setRascunho(conflito.corpo);
    setConflito(null);
  }

  async function apagar() {
    setConfirmando(true);
  }

  async function confirmarApagar() {
    setConfirmando(false);
    try {
      await api.apagarNo(id);
      aoFechar();
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  const quemEdita = presenca.find((p) => p.editando === id && p.id !== meuId);
  // Os campos do formulário são os da categoria DESTE nó, não os do projeto: um projeto
  // mistura Processo, Dados e Atores, e cada um declara campos diferentes.
  const categoria = no ? categoriaDoNo(catalogo, no.categoria_id) : undefined;

  return (
    <div className="modal-fundo" onClick={aoFechar}>
      <div className="modal modal-objeto" role="dialog" aria-modal="true" aria-label="detalhes do objeto" onClick={(e) => e.stopPropagation()}>
        {!no ? (
          // A falha precisa aparecer aqui tambem: se o GET inicial quebrar, `no` fica null
          // pra sempre e o usuario ficaria preso num "carregando…" sem botao de fechar.
          <>
            <button className="modal-fechar" type="button" aria-label="fechar" title="fechar" onClick={aoFechar}>×</button>
            <p>{falha ? "não foi possível abrir este passo." : "carregando…"}</p>
            {falha ? <p className="erro">{falha}</p> : null}
          </>
        ) : no.erro ? (
          <>
            <button className="modal-fechar" type="button" aria-label="fechar" title="fechar" onClick={aoFechar}>×</button>
            <h2>{no.titulo}</h2>
            <p className="erro">Não confere com a categoria: {no.erro}</p>
          </>
        ) : (
          <>
            <header className="modal-cabecalho">
              <div>
                <p className="modal-sobretitulo">detalhes do objeto</p>
                <h2 id="titulo-modal-objeto">
                  {no.titulo}
                  {categoria ? <span className="selo">{categoria.nome}</span> : null}
                </h2>
              </div>
              <div className="modal-ferramentas">
                {!somenteLeitura ? (
                  <button type="button" className="botao-avancado" aria-label="configurações avançadas" title="configurações avançadas" aria-expanded={avancado} onClick={() => setAvancado((v) => !v)}>
                    ⚙
                  </button>
                ) : null}
                <button className="modal-fechar" type="button" aria-label="fechar" title="fechar" onClick={aoFechar}>×</button>
              </div>
            </header>

            <div className="modal-corpo">
              <section className="modal-secao-objeto" aria-label="informações do objeto">
                <label htmlFor="no-titulo">nome</label>
                <input id="no-titulo" value={titulo} disabled={somenteLeitura} onChange={(e) => setTitulo(e.target.value)} />
                {quemEdita ? <p className="presenca">✎ {quemEdita.nome} está editando</p> : null}
                {(categoria?.campos ?? []).length > 0 ? (
                  <div className="modal-campos">
                    {(categoria?.campos ?? []).map((campo) => {
                      const valor = String(campos[campo.chave] ?? "");
                      return (
                        <div key={campo.chave}>
                          <label htmlFor={`campo-${campo.chave}`}>{campo.chave}</label>
                          {campo.tipo === "enum" ? (
                            <select id={`campo-${campo.chave}`} value={valor} disabled={somenteLeitura} onChange={(e) => setCampos((atuais) => ({ ...atuais, [campo.chave]: e.target.value }))}>
                              {(campo.opcoes ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input id={`campo-${campo.chave}`} value={valor} disabled={somenteLeitura} onChange={(e) => setCampos((atuais) => ({ ...atuais, [campo.chave]: e.target.value }))} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              {/* Execução é dado do objeto, não um campo da categoria: um projeto pode
                  ter um campo `status` com outro significado, e qualquer categoria pode
                  virar tarefa. */}
              <section className="modal-secao-objeto secao-execucao" aria-label="execução do objeto">
                <label className="linha-execucao" htmlFor="no-tarefa">
                  <input
                    id="no-tarefa"
                    type="checkbox"
                    checked={execucao.tarefa}
                    disabled={somenteLeitura}
                    onChange={(e) =>
                      // Mesma normalização do servidor: marcar sem estado começa pendente,
                      // desmarcar limpa o estado.
                      setExecucao(
                        e.target.checked
                          ? { tarefa: true, estado: execucao.estado ?? "pendente" }
                          : { tarefa: false, estado: null },
                      )
                    }
                  />
                  <span>é tarefa</span>
                </label>
                {execucao.tarefa ? (
                  <>
                    <label htmlFor="no-estado">estado</label>
                    <select
                      id="no-estado"
                      value={execucao.estado ?? "pendente"}
                      disabled={somenteLeitura}
                      onChange={(e) => setExecucao({ tarefa: true, estado: e.target.value as EstadoExecucao })}
                    >
                      {ESTADOS_EXECUCAO.map((estado) => (
                        <option key={estado} value={estado}>
                          {GLIFO_EXECUCAO[estado]} {ROTULO_EXECUCAO[estado]}
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <p className="dica">objeto informativo: fica fora da contagem de progresso.</p>
                )}
              </section>

              <section className="modal-secao-objeto modal-secao-detalhe" aria-label="detalhe do objeto">
                <div className="modal-secao-titulo">
                  <div><strong>detalhe</strong><span>{somenteLeitura ? "informações registradas" : "duplo-clique para editar"}</span></div>
                </div>
                {editandoCorpo ? (
                  <>
                    <textarea value={rascunho} onChange={(e) => setRascunho(e.target.value)} />
                    {conflito ? (
                      <div className="conflito">
                        <p>O texto mudou desde que você abriu. Sobrescrever mesmo assim?</p>
                        <div className="modal-acoes-internas">
                          <button onClick={usarTextoDoServidor}>ver o texto novo</button>
                          <button className="perigo" onClick={() => void salvarCorpo(conflito.versao)}>sobrescrever</button>
                        </div>
                      </div>
                    ) : <div className="modal-acoes-internas"><button onClick={() => setEditandoCorpo(false)}>cancelar</button></div>}
                  </>
                ) : (
                  <div
                    className="detalhe"
                    onDoubleClick={() => {
                      if (somenteLeitura) return;
                      setRascunho(no.corpo);
                      setEditandoCorpo(true);
                    }}
                    dangerouslySetInnerHTML={{
                      __html: no.corpo.trim()
                        ? md.render(no.corpo)
                        : `<p class="vazio">${somenteLeitura ? "sem detalhe" : "duplo-clique para escrever o detalhe"}</p>`,
                    }}
                  />
                )}
              </section>

              {avancado ? (
                <section className="avancado" aria-label="configurações avançadas">
                  <p className="secao">configuração do objeto</p>
                  <p className="dica">id: <code>{no.id}</code></p>
                  <div className="modal-campos">
                    <div><label htmlFor="no-largura">largura (20–1000 px)</label><input id="no-largura" type="number" min={TAMANHO_MINIMO} max={TAMANHO_MAXIMO} value={largura} onChange={(e) => aplicarTamanho("largura", Number(e.target.value))} /></div>
                    <div><label htmlFor="no-altura">altura (20–1000 px)</label><input id="no-altura" type="number" min={TAMANHO_MINIMO} max={TAMANHO_MAXIMO} value={altura} onChange={(e) => aplicarTamanho("altura", Number(e.target.value))} /></div>
                  </div>
                  <p className="dica">proporção mantida automaticamente; mínimo 20×20 e máximo 1000×1000.</p>
                </section>
              ) : null}
              {falha ? <p className="erro">{falha}</p> : null}
            </div>

            <footer className="modal-rodape">
              {!somenteLeitura ? (
                <button className="perigo" onClick={() => void apagar()}>
                  apagar passo
                </button>
              ) : null}
              <button title="salvar alterações e fechar" onClick={() => void concluir()}>concluir</button>
            </footer>
          </>
        )}
        {confirmando ? (
          <DialogoConfirmacao
            mensagem={`Apagar "${id}"?`}
            confirmar="apagar"
            aoCancelar={() => setConfirmando(false)}
            aoConfirmar={() => void confirmarApagar()}
          />
        ) : null}
      </div>
    </div>
  );
}

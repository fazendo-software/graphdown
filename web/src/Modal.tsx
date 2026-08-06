import { useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import type { Papel } from "../../core/tipos.ts";
import { ErroConflito, type apiProjeto, type NoDetalhe } from "./api.ts";
import { categoriaDoNo, type Catalogo } from "./grafoRender.ts";
import { DialogoConfirmacao } from "./Dialogos.tsx";

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

const TAMANHO_MINIMO = 20;
const TAMANHO_MAXIMO = 1000;

export function Modal({ id, catalogo, papel, api, presenca, meuId, enviarEditando, tamanho, aoRedimensionar, aoFechar }: Props) {
  const [no, setNo] = useState<NoDetalhe | null>(null);
  const [editandoCorpo, setEditandoCorpo] = useState(false);
  const [rascunho, setRascunho] = useState("");
  const [conflito, setConflito] = useState<{ versao: number; corpo: string } | null>(null);
  const [falha, setFalha] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [avancado, setAvancado] = useState(false);
  const [titulo, setTitulo] = useState("");
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

  async function salvarCampo(chave: string, valor: string) {
    try {
      await api.patchNo(id, { [chave]: valor });
      setNo(await api.no(id));
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  async function salvarTitulo() {
    const novo = titulo.trim();
    if (!novo || !no || novo === no.titulo) return;
    try {
      await api.renomearNo(id, novo);
      setNo({ ...no, titulo: novo });
    } catch (e) {
      setFalha((e as Error).message);
    }
  }

  function aplicarTamanho(lado: "largura" | "altura", valor: number) {
    if (!aoRedimensionar) return;
    // Dimensão ainda é estado de renderização do canvas, não coluna do nó: manter esta
    // regra aqui impede a UI de prometer persistência ou colaboração que o protocolo não tem.
    const seguro = Math.max(TAMANHO_MINIMO, Math.min(TAMANHO_MAXIMO, Math.round(valor)));
    const proporcao = largura / Math.max(1, altura);
    const w = lado === "largura" ? seguro : Math.max(TAMANHO_MINIMO, Math.min(TAMANHO_MAXIMO, Math.round(seguro * proporcao)));
    const h = lado === "altura" ? seguro : Math.max(TAMANHO_MINIMO, Math.min(TAMANHO_MAXIMO, Math.round(seguro / proporcao)));
    setLargura(w);
    setAltura(h);
    aoRedimensionar(w, h);
  }

  async function salvarCorpo(forcarVersao?: number) {
    if (!no) return;
    const texto = rascunho.endsWith("\n") ? rascunho : `${rascunho}\n`;
    try {
      const r = await api.putCorpo(id, texto, forcarVersao ?? no.versao);
      setNo({ ...no, corpo: texto, versao: r.versao });
      setEditandoCorpo(false);
      setConflito(null);
    } catch (e) {
      if (e instanceof ErroConflito) {
        setConflito({ versao: e.versao, corpo: e.corpo });
        return;
      }
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
      <div className="modal" onClick={(e) => e.stopPropagation()}>
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
            <button className="modal-fechar" type="button" aria-label="fechar" title="fechar" onClick={aoFechar}>×</button>
            <h2>
              {no.titulo}
              {categoria ? <span className="selo">{categoria.nome}</span> : null}
            </h2>

            <label htmlFor="no-titulo">nome</label>
            <input
              id="no-titulo"
              value={titulo}
              disabled={somenteLeitura}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={() => void salvarTitulo()}
              onKeyDown={(e) => {
                if (e.key === "Enter") void salvarTitulo();
              }}
            />

            {quemEdita ? <p className="presenca">✎ {quemEdita.nome} está editando</p> : null}

            {(categoria?.campos ?? []).map((campo) => {
              const valor = String(no.campos[campo.chave] ?? "");
              return (
                <div key={campo.chave}>
                  <label htmlFor={`campo-${campo.chave}`}>{campo.chave}</label>
                  {campo.tipo === "enum" ? (
                    <select
                      id={`campo-${campo.chave}`}
                      defaultValue={valor}
                      disabled={somenteLeitura}
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
                      disabled={somenteLeitura}
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
                {conflito ? (
                  <div className="conflito">
                    <p>O texto mudou desde que você abriu. Sobrescrever mesmo assim?</p>
                    <div className="modal-acoes">
                      <button onClick={usarTextoDoServidor}>ver o texto novo</button>
                      <button className="perigo" onClick={() => void salvarCorpo(conflito.versao)}>
                        sobrescrever
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="modal-acoes">
                    <button onClick={() => setEditandoCorpo(false)}>cancelar</button>
                    <button onClick={() => void salvarCorpo()}>salvar detalhe</button>
                  </div>
                )}
              </>
            ) : (
              <div
                className="detalhe"
                onDoubleClick={() => {
                  if (somenteLeitura) return;
                  setRascunho(no.corpo);
                  setEditandoCorpo(true);
                }}
                // seguro: ver comentário do `md` acima — html:false e validação de link
                // do próprio markdown-it, sem lib de sanitização extra.
                dangerouslySetInnerHTML={{
                  __html: no.corpo.trim()
                    ? md.render(no.corpo)
                    : `<p class="vazio">${somenteLeitura ? "sem detalhe" : "duplo-clique para escrever o detalhe"}</p>`,
                }}
              />
            )}

            {falha ? <p className="erro">{falha}</p> : null}

            {!somenteLeitura ? (
              <>
                <button type="button" className="botao-avancado" aria-label="configurações avançadas" title="configurações avançadas" aria-expanded={avancado} onClick={() => setAvancado((v) => !v)}>
                  ⚙
                </button>
                {avancado ? (
                  <div className="avancado">
                    <p className="secao">configuração do objeto</p>
                    <p className="dica">id: <code>{no.id}</code></p>
                    <label htmlFor="no-largura">largura (20–1000 px)</label>
                    <input id="no-largura" type="number" min={TAMANHO_MINIMO} max={TAMANHO_MAXIMO} value={largura} onChange={(e) => aplicarTamanho("largura", Number(e.target.value))} />
                    <label htmlFor="no-altura">altura (20–1000 px)</label>
                    <input id="no-altura" type="number" min={TAMANHO_MINIMO} max={TAMANHO_MAXIMO} value={altura} onChange={(e) => aplicarTamanho("altura", Number(e.target.value))} />
                    <p className="dica">proporção mantida automaticamente; mínimo 20×20 e máximo 1000×1000.</p>
                  </div>
                ) : null}
              </>
            ) : null}

            <div className="modal-acoes">
              {!somenteLeitura ? (
                <button className="perigo" onClick={() => void apagar()}>
                  apagar passo
                </button>
              ) : null}
              <button title="concluir e fechar" onClick={aoFechar}>concluir</button>
            </div>
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

import { useEffect, useRef, useState } from "react";
import { congelarRecorte, serializarMarkdown, serializarMarkdownRFC } from "../../core/exportacao.ts";
import type { ExportacaoSnapshot, RecorteExportacao } from "../../core/tipos.ts";
import { exportarVisual, type DimensoesLocaisExportacao } from "./ExportacaoVisual.tsx";
import { type ContagensExportacao, type EscopoMenuExportacao, type FormatoExportacao, mensagemErroExportacao, nomeArquivoExportacao, resumoContagens, textoDoRecorte } from "./menuExportacao.ts";
import type { Tema } from "./tema.ts";

export type CapturaExportacao = {
  recorte: RecorteExportacao;
  dimensoesLocais: DimensoesLocaisExportacao;
  haConteudo: boolean;
  haSelecao: boolean;
  contagens: ContagensExportacao;
};

type Props = {
  aberto: boolean;
  aoMudarAberto: (aberto: boolean) => void;
  capturar: (escopo: EscopoMenuExportacao) => CapturaExportacao;
  haSelecaoAtual: boolean;
  carregarSnapshot: () => Promise<ExportacaoSnapshot>;
  tema: Tema;
  /** Permite que o smoke observe o download sem acionar a navegação do navegador. */
  baixar?: (arquivo: Blob, nome: string) => void;
};

type Pedido = { formato: FormatoExportacao; escopo: EscopoMenuExportacao; captura: CapturaExportacao };

function congelarCaptura(captura: CapturaExportacao): CapturaExportacao {
  return {
    ...captura,
    recorte: congelarRecorte(captura.recorte),
    dimensoesLocais: Object.fromEntries(Object.entries(captura.dimensoesLocais).map(([id, tamanho]) => [id, { ...tamanho }])),
    contagens: { ...captura.contagens },
  };
}

function baixarNoNavegador(arquivo: Blob, nome: string) {
  const url = URL.createObjectURL(arquivo);
  const ancora = document.createElement("a");
  ancora.href = url;
  ancora.download = nome;
  ancora.style.display = "none";
  document.body.append(ancora);
  ancora.click();
  ancora.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const OPCOES: Array<{ formato: FormatoExportacao; titulo: string; detalhe: string }> = [
  { formato: "png", titulo: "PNG", detalhe: "Imagem do recorte" },
  { formato: "pdf", titulo: "PDF", detalhe: "Página única em tamanho livre" },
  { formato: "md", titulo: "Markdown", detalhe: "Contexto estruturado" },
  { formato: "md-rfc", titulo: "Markdown para RFC", detalhe: "Contexto e prompt para IA" },
];

/** Dropdown de exportação: não possui estado do grafo; recebe uma captura imutável do Canvas. */
export function MenuExportar({ aberto, aoMudarAberto, capturar, haSelecaoAtual, carregarSnapshot, tema, baixar = baixarNoNavegador }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const emAndamento = useRef(false);
  const [fixado, setFixado] = useState(false);
  const [escopo, setEscopo] = useState<EscopoMenuExportacao | null>(null);
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [ultimoPedido, setUltimoPedido] = useState<Pedido | null>(null);
  const [estado, setEstado] = useState<{ tipo: "progresso" | "erro" | "pronto"; mensagem: string } | null>(null);

  useEffect(() => {
    if (aberto) return;
    setFixado(false);
    setEscopo(null);
  }, [aberto]);

  useEffect(() => {
    if (!aberto) return;
    const aoEscapar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") aoMudarAberto(false);
    };
    const aoClicarFora = (evento: MouseEvent) => {
      if (!caixa.current?.contains(evento.target as Node)) aoMudarAberto(false);
    };
    window.addEventListener("keydown", aoEscapar);
    document.addEventListener("mousedown", aoClicarFora);
    return () => {
      window.removeEventListener("keydown", aoEscapar);
      document.removeEventListener("mousedown", aoClicarFora);
    };
  }, [aberto, aoMudarAberto]);

  async function executar(atual: Pedido) {
    if (emAndamento.current) return;
    emAndamento.current = true;
    setPedido(atual);
    setUltimoPedido(atual);
    setEstado({ tipo: "progresso", mensagem: `Preparando ${OPCOES.find((opcao) => opcao.formato === atual.formato)?.titulo ?? "arquivo"}…` });
    try {
      if (!atual.captura.haConteudo) throw new Error("Este recorte não tem conteúdo. Selecione objetos ou mova o canvas para uma área com conteúdo.");
      // O recorte/dimensões já foram copiados no clique. Só o snapshot é buscado agora.
      const snapshot = await carregarSnapshot();
      const arquivo = atual.formato === "md"
        ? new Blob([serializarMarkdown(snapshot, atual.captura.recorte)], { type: "text/markdown;charset=utf-8" })
        : atual.formato === "md-rfc"
          ? new Blob([serializarMarkdownRFC(snapshot, atual.captura.recorte)], { type: "text/markdown;charset=utf-8" })
          : await exportarVisual({ snapshot, recorte: atual.captura.recorte, tema, dimensoesLocais: atual.captura.dimensoesLocais }, atual.formato);
      baixar(arquivo, nomeArquivoExportacao(snapshot.projeto.titulo, atual.escopo, atual.formato));
      setEstado({ tipo: "pronto", mensagem: `${OPCOES.find((opcao) => opcao.formato === atual.formato)?.titulo} pronto para download.` });
    } catch (erro) {
      setEstado({ tipo: "erro", mensagem: mensagemErroExportacao(erro) });
    } finally {
      emAndamento.current = false;
      setPedido(null);
    }
  }

  function escolherFormato(formato: FormatoExportacao) {
    if (!escopo || pedido) return;
    const captura = congelarCaptura(capturar(escopo));
    void executar({ formato, escopo, captura });
  }

  return (
    <div
      ref={caixa}
      className="menu-exportar"
      onMouseEnter={() => {
        if (!aberto) aoMudarAberto(true);
      }}
      onMouseLeave={() => {
        if (!fixado) aoMudarAberto(false);
      }}
    >
      <button
        type="button"
        className="menu-alvo"
        aria-expanded={aberto}
        aria-haspopup="menu"
        onClick={() => {
          setFixado(true);
          // O clique é a transição de descoberta (hover) para uso preciso, não um toggle.
          aoMudarAberto(true);
        }}
      >
        Exportar <span aria-hidden="true">▾</span>
      </button>
      {aberto ? (
        <div className="menu-caixa menu-exportar-caixa" role="menu" aria-label="Exportar">
          {!escopo ? (
            <>
              <p className="menu-exportar-intro">Escolha o recorte antes do formato.</p>
              <button type="button" role="menuitem" className="opcao-exportar" onClick={() => setEscopo("projeto")}>
                <strong>Exportar projeto inteiro</strong>
                <span>PNG, PDF, Markdown ou Markdown para RFC</span>
              </button>
              <button type="button" role="menuitem" className="opcao-exportar" onClick={() => setEscopo("selecao-area")}>
                <strong>Exportar seleção ou área atual</strong>
                <span>Usa a seleção; sem seleção, usa a área visível</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" className="voltar-exportar" onClick={() => setEscopo(null)}>← trocar recorte</button>
              <p className="menu-exportar-intro">
                Recorte: <strong>{textoDoRecorte(escopo, haSelecaoAtual)}</strong> — {resumoContagens(capturar(escopo).contagens)}. Escolha o formato.
              </p>
              {OPCOES.map((opcao) => (
                <button
                  key={opcao.formato}
                  type="button"
                  role="menuitem"
                  className="opcao-exportar"
                  disabled={pedido !== null}
                  onClick={() => escolherFormato(opcao.formato)}
                >
                  <strong>{opcao.titulo}</strong><span>{opcao.detalhe}</span>
                </button>
              ))}
            </>
          )}
          {estado ? (
            <div className={`estado-exportar ${estado.tipo}`} role="status" aria-live="polite">
              <span>{estado.mensagem}</span>
              {estado.tipo === "erro" && pedido === null && ultimoPedido ? (
                <button type="button" onClick={() => void executar(ultimoPedido)}>tentar novamente</button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import { createRoot } from "react-dom/client";
import type { CSSProperties } from "react";
import { getBezierPath } from "@xyflow/react";
import type { EstiloAresta, ExportacaoSnapshot, RecorteExportacao } from "../../core/tipos.ts";
import { filtrarExportacao } from "../../core/exportacao.ts";
import { caminho, desenharForma, seedDoId, tamanhoDe, ALTURA_ROTULO } from "./rough.ts";
import { PALETA, type Tema } from "./tema.ts";
import { categoriaDoNo, corDoNo, formaDoNo } from "./grafoRender.ts";
import { pontasDaCaixa } from "./flutuante.ts";
import { urlDoEmbed } from "./embed.ts";
import { caixaDosPontos, caminhoSvg, pontosDoCotovelo } from "./setasLivres.ts";
import {
  calcularLimitesExportacao,
  ErroExportacaoVisual,
  MARGEM_EXPORTACAO,
  planejarRasterizacao,
  type CaixaVisual,
} from "./exportacaoVisual.ts";

export type DimensoesLocaisExportacao = Record<string, { largura: number; altura: number }>;

export type OpcoesExportacaoVisual = {
  snapshot: ExportacaoSnapshot;
  recorte: RecorteExportacao;
  tema: Tema;
  /** Resize ainda é local no canvas; o chamador pode congelá-lo junto com o recorte. */
  dimensoesLocais?: DimensoesLocaisExportacao;
};

export type ImagemExportada = {
  png: Blob;
  largura: number;
  altura: number;
  escala: 1 | 2;
  /** Origem do recorte no sistema de coordenadas do canvas; útil para validar o raster. */
  origem: Pick<CaixaVisual, "x" | "y">;
};

type NoVisual = {
  id: string;
  titulo: string;
  x: number;
  y: number;
  largura: number;
  altura: number;
  forma: string;
  cor: string;
  embed?: string;
};

type NotaVisual = { id: string; conteudo: string; x: number; y: number; largura: number; altura: number };
type ArestaVisual = ExportacaoSnapshot["arestas"][number] & { origem: NoVisual; destino: NoVisual; rotulo?: string };
type SetaLivreVisual = ExportacaoSnapshot["objetosSeta"][number];

const FONTE = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function dimensaoLocal(
  id: string,
  padrao: { largura: number; altura: number },
  dimensoes: DimensoesLocaisExportacao | undefined,
) {
  const local = dimensoes?.[id];
  return local && local.largura > 0 && local.altura > 0 ? local : padrao;
}

function montarModelo(opcoes: OpcoesExportacaoVisual, folgaMedida = 0) {
  const snapshot = filtrarExportacao(opcoes.snapshot, opcoes.recorte);
  const categorias = {
    categorias: snapshot.categorias,
    porId: new Map(snapshot.categorias.map((categoria) => [categoria.id, categoria])),
    arestasEstilo: snapshot.estilosAresta,
    camposAresta: snapshot.camposAresta,
  };
  const nos: NoVisual[] = snapshot.nos.map((no) => {
    const categoria = categoriaDoNo(categorias, no.categoria_id);
    const forma = formaDoNo(categoria, no.campos);
    const tamanho = dimensaoLocal(no.id, tamanhoDe(forma), opcoes.dimensoesLocais);
    return {
      id: no.id,
      titulo: no.titulo,
      x: no.posicao?.x ?? 0,
      y: no.posicao?.y ?? 0,
      largura: tamanho.largura,
      altura: tamanho.altura,
      forma,
      cor: corDoNo(categoria, no.campos),
      embed: categoria?.incorporavel ? urlDoEmbed(no.campos.url) : undefined,
    };
  });
  const notas: NotaVisual[] = snapshot.notas.map((nota) => {
    const largura = dimensaoLocal(nota.id, { largura: 176, altura: 64 }, opcoes.dimensoesLocais).largura;
    const alturaBase = dimensaoLocal(nota.id, { largura: 176, altura: 64 }, opcoes.dimensoesLocais).altura;
    return {
      id: nota.id,
      conteudo: nota.conteudo,
      x: nota.x,
      y: nota.y,
      largura,
      altura: alturaBase,
    };
  });
  const porId = new Map(nos.map((no) => [no.id, no]));
  const arestas: ArestaVisual[] = snapshot.arestas.flatMap((aresta) => {
    const origem = porId.get(aresta.de);
    const destino = porId.get(aresta.para);
    if (!origem || !destino) return [];
    return [{ ...aresta, origem, destino, rotulo: rotuloAresta(aresta, snapshot) }];
  });
  const objetosSeta: SetaLivreVisual[] = snapshot.objetosSeta;
  const caixas: CaixaVisual[] = [
    ...nos.map((no) => ({ x: no.x, y: no.y, largura: no.largura, altura: no.altura + ALTURA_ROTULO })),
    ...notas.map((nota) => ({ x: nota.x, y: nota.y, largura: nota.largura, altura: nota.altura })),
    ...arestas.flatMap((aresta) => (aresta.rotulo ? [caixaRotuloAresta(aresta)] : [])),
    ...objetosSeta.map((seta) => caixaDosPontos(seta.pontos)),
  ];
  return { snapshot, nos, notas, arestas, objetosSeta, limites: calcularLimitesExportacao(caixas, MARGEM_EXPORTACAO + folgaMedida) };
}

function rotuloAresta(aresta: ExportacaoSnapshot["arestas"][number], snapshot: ExportacaoSnapshot): string | undefined {
  const recursos = snapshot.camposAresta
    .map((campo) => aresta.campos[campo.chave])
    .filter((valor) => valor !== undefined && valor !== null && String(valor).trim() !== "")
    .map(String);
  const texto = [aresta.quando, ...recursos].filter(Boolean).join(" · ");
  return texto || undefined;
}

function caixaRotuloAresta(aresta: ArestaVisual): CaixaVisual {
  const { labelX, labelY } = geometriaAresta(aresta);
  return { x: labelX - 100, y: labelY - 14, largura: 200, altura: 20 };
}

function geometriaAresta(aresta: ArestaVisual) {
  const pontas = pontasDaCaixa(
    { x: aresta.origem.x, y: aresta.origem.y, largura: aresta.origem.largura, altura: aresta.origem.altura },
    { x: aresta.destino.x, y: aresta.destino.y, largura: aresta.destino.largura, altura: aresta.destino.altura },
  );
  const [d, labelX, labelY] = getBezierPath({
    sourceX: pontas.sx,
    sourceY: pontas.sy,
    targetX: pontas.tx,
    targetY: pontas.ty,
    sourcePosition: pontas.ladoOrigem,
    targetPosition: pontas.ladoDestino,
  });
  return { pontas, d, labelX, labelY };
}

function estiloAresta(arestas: Record<string, EstiloAresta>, tipo: string | undefined, corPadrao: string) {
  const declarado = { estilo: "continua", ponta: "cheia", ...(arestas.padrao ?? {}), ...(tipo ? arestas[tipo] ?? {} : {}) };
  return { ...declarado, cor: declarado.cor || corPadrao };
}

function Replica({ opcoes, folgaMedida }: { opcoes: OpcoesExportacaoVisual; folgaMedida: number }) {
  const { snapshot, nos, notas, arestas, objetosSeta, limites } = montarModelo(opcoes, folgaMedida);
  const paleta = PALETA[opcoes.tema];
  const deslocar = (x: number, y: number) => ({ x: x - limites.x, y: y - limites.y });
  const markerId = (id: string) => `seta-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
  return (
    <div
      data-exportacao-visual="true"
      style={{
        position: "relative",
        width: limites.largura,
        height: limites.altura,
        overflow: "visible",
        background: opcoes.tema === "escuro" ? "#18181b" : "#ffffff",
        color: paleta.texto,
        fontFamily: FONTE,
      }}
    >
      <svg width={limites.largura} height={limites.altura} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        <defs>
          {arestas.map((aresta) => {
            const estilo = estiloAresta(snapshot.estilosAresta, aresta.tipo, paleta.aresta);
            const cor = estilo.cor || paleta.aresta;
            return (
              <marker key={aresta.id} id={markerId(aresta.id)} markerWidth="9" markerHeight="9" refX="8" refY="4.5" orient="auto" markerUnits="strokeWidth">
                <path d="M 0 0 L 9 4.5 L 0 9" fill={estilo.ponta === "aberta" ? "none" : cor} stroke={cor} />
              </marker>
            );
          })}
          {objetosSeta.map((seta) => {
            const bloco = seta.tipo === "bloco";
            return (
              <marker key={`livre-${seta.id}`} id={markerId(`livre-${seta.id}`)} markerWidth={bloco ? "14" : "8"} markerHeight={bloco ? "14" : "8"} refX={bloco ? "12" : "7"} refY={bloco ? "7" : "4"} orient="auto">
                <path d={bloco ? "M0,0 L14,7 L0,14 Z" : "M0,0 L8,4 L0,8 Z"} fill={paleta.aresta} />
              </marker>
            );
          })}
        </defs>
        {arestas.map((aresta) => {
          const estilo = estiloAresta(snapshot.estilosAresta, aresta.tipo, paleta.aresta);
          const cor = estilo.cor || paleta.aresta;
          const geometria = geometriaAresta(aresta);
          const [d] = getBezierPath({
            sourceX: geometria.pontas.sx - limites.x,
            sourceY: geometria.pontas.sy - limites.y,
            targetX: geometria.pontas.tx - limites.x,
            targetY: geometria.pontas.ty - limites.y,
            sourcePosition: geometria.pontas.ladoOrigem,
            targetPosition: geometria.pontas.ladoDestino,
          });
          const tracejado = estilo.estilo === "tracejada" ? [8, 6] : estilo.estilo === "pontilhada" ? [2, 5] : undefined;
          const tracos = caminho(d, { seed: seedDoId(aresta.id), roughness: 1.1, bowing: 0.8, stroke: cor, strokeLineDash: tracejado });
          return (
            <g key={aresta.id}>
              {tracos.map((traco, indice) => <path key={indice} d={traco.d} fill="none" stroke={cor} strokeWidth="1.4" strokeDasharray={traco.strokeLineDash?.join(" ")} markerEnd={indice === 0 && estilo.ponta !== "nenhuma" ? `url(#${markerId(aresta.id)})` : undefined} markerStart={indice === 0 && estilo.ponta === "ambas" ? `url(#${markerId(aresta.id)})` : undefined} />)}
            </g>
          );
        })}
        {objetosSeta.map((seta) => {
          const pontos = seta.tipo === "cotovelo" ? pontosDoCotovelo(seta.pontos) : seta.pontos;
          const locais = pontos.map((ponto) => ({ x: ponto.x - limites.x, y: ponto.y - limites.y }));
          const ponta = seta.tipo === "seta" || seta.tipo === "cotovelo" || seta.tipo === "bloco";
          return <path key={`livre-${seta.id}`} d={caminhoSvg(locais)} fill="none" stroke={paleta.aresta} strokeWidth={seta.tipo === "bloco" ? 16 : seta.tipo === "divisor" ? 2 : 2.5} strokeLinecap={seta.tipo === "bloco" ? "butt" : "round"} strokeLinejoin="round" markerEnd={ponta ? `url(#${markerId(`livre-${seta.id}`)})` : undefined} />;
        })}
      </svg>
      {nos.map((no) => <NoDaReplica key={no.id} no={no} origem={limites} paleta={paleta} />)}
      {notas.map((nota) => <NotaDaReplica key={nota.id} nota={nota} origem={limites} />)}
      {arestas.map((aresta) => {
        if (!aresta.rotulo) return null;
        const caixa = caixaRotuloAresta(aresta);
        return (
          <div key={aresta.id} data-exportacao-caixa="rotulo" style={{ ...posicaoAbsoluta(caixa, limites), padding: "2px 6px", borderRadius: 4, background: paleta.rotuloFundo, color: paleta.rotuloTexto, fontSize: 11, lineHeight: 1.35, textAlign: "center", overflowWrap: "anywhere" }}>
            {aresta.rotulo}
          </div>
        );
      })}
    </div>
  );
}

function posicaoAbsoluta(caixa: CaixaVisual, origem: CaixaVisual): CSSProperties {
  return { position: "absolute", left: caixa.x - origem.x, top: caixa.y - origem.y, width: caixa.largura, minHeight: caixa.altura, boxSizing: "border-box" };
}

function NoDaReplica({ no, origem, paleta }: { no: NoVisual; origem: CaixaVisual; paleta: Record<string, string> }) {
  const tracos = desenharForma(no.forma, {
    seed: seedDoId(no.id), roughness: 1.4, bowing: 1.2, stroke: no.cor, strokeWidth: 2,
    fill: `${no.cor}${paleta.alfa}`, fillStyle: "solid",
  }, { largura: no.largura, altura: no.altura });
  return (
    <div style={{ ...posicaoAbsoluta({ x: no.x, y: no.y, largura: no.largura, altura: no.altura }, origem), overflow: "visible", textAlign: "center" }}>
      <svg width={no.largura} height={no.altura} style={{ display: "block", overflow: "visible" }}>
        {tracos.map((traco, indice) => <path key={indice} d={traco.d} stroke={traco.stroke} fill={traco.fill} strokeWidth={traco.strokeWidth} />)}
      </svg>
      {no.embed ? (
        <div data-exportacao-caixa="embed" style={{ position: "absolute", inset: 10, display: "grid", placeItems: "center", padding: 8, border: `1px solid ${no.cor}`, borderRadius: 4, background: paleta.rotuloFundo, color: paleta.rotuloTexto, fontSize: 12, lineHeight: 1.35, overflowWrap: "anywhere" }}>
          <span><strong>conteúdo incorporado</strong><br />{no.embed}</span>
        </div>
      ) : null}
      <div data-exportacao-caixa="titulo" style={{ minHeight: ALTURA_ROTULO, padding: "0 6px", fontSize: 14, lineHeight: 1.3, fontWeight: 700, overflowWrap: "anywhere" }}>{no.titulo}</div>
    </div>
  );
}

function NotaDaReplica({ nota, origem }: { nota: NotaVisual; origem: CaixaVisual }) {
  return <div data-exportacao-caixa="nota" style={{ ...posicaoAbsoluta(nota, origem), padding: "9px 10px", border: "1px solid #eab308", borderRadius: 3, background: "#fde68a", color: "#422006", fontSize: 12, lineHeight: 1.35, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{nota.conteudo}</div>;
}

function aguardarPintura(): Promise<void> {
  return new Promise((resolver) => requestAnimationFrame(() => requestAnimationFrame(() => resolver())));
}

/** Quanto uma caixa realmente renderizada avançou para fora da raiz da imagem. */
function folgaNecessaria(elemento: HTMLElement): number {
  const raiz = elemento.getBoundingClientRect();
  let excesso = 0;
  for (const caixa of elemento.querySelectorAll<HTMLElement>("[data-exportacao-caixa]")) {
    const medida = caixa.getBoundingClientRect();
    excesso = Math.max(excesso, raiz.left - medida.left, raiz.top - medida.top, medida.right - raiz.right, medida.bottom - raiz.bottom);
  }
  return Math.max(0, Math.ceil(excesso));
}

async function montarReplica(opcoes: OpcoesExportacaoVisual): Promise<{ elemento: HTMLElement; desmontar: () => void; largura: number; altura: number; limites: CaixaVisual }> {
  const hospedeiro = document.createElement("div");
  hospedeiro.setAttribute("aria-hidden", "true");
  Object.assign(hospedeiro.style, { position: "fixed", left: "-100000px", top: "0", pointerEvents: "none", zIndex: "-1" });
  document.body.append(hospedeiro);
  const raiz = createRoot(hospedeiro);
  try {
    if (document.fonts) await document.fonts.ready;
    let folgaMedida = 0;
    // A fonte do navegador, CJK e emoji não obedecem uma estimativa em caracteres. Medimos o
    // layout de verdade e repetimos com margem maior até todas as caixas caberem na imagem.
    for (let tentativa = 0; tentativa < 4; tentativa++) {
      const modelo = montarModelo(opcoes, folgaMedida);
      hospedeiro.style.width = `${modelo.limites.largura}px`;
      raiz.render(<Replica opcoes={opcoes} folgaMedida={folgaMedida} />);
      await aguardarPintura();
      const elemento = hospedeiro.querySelector<HTMLElement>("[data-exportacao-visual]");
      if (!elemento) throw new ErroExportacaoVisual("Não foi possível preparar a imagem para exportação.");
      const excesso = folgaNecessaria(elemento);
      if (excesso === 0) {
        return { elemento, desmontar: () => { raiz.unmount(); hospedeiro.remove(); }, largura: modelo.limites.largura, altura: modelo.limites.altura, limites: modelo.limites };
      }
      folgaMedida += excesso + 2;
    }
    throw new ErroExportacaoVisual("Não foi possível acomodar os textos da exportação. Reduza o recorte e tente novamente.");
  } catch (erro) {
    raiz.unmount();
    hospedeiro.remove();
    throw erro;
  }
}

/** Rasteriza uma réplica neutra; nunca captura ou altera o canvas que a pessoa está editando. */
export async function rasterizarExportacaoVisual(opcoes: OpcoesExportacaoVisual): Promise<ImagemExportada> {
  if (typeof document === "undefined") throw new ErroExportacaoVisual("A exportação visual precisa ser executada no navegador.");
  const replica = await montarReplica(opcoes);
  try {
    const plano = planejarRasterizacao({ largura: replica.largura, altura: replica.altura });
    // O adaptador só é carregado no clique de exportar; não aumenta o bundle inicial do canvas.
    const { toPng } = await import("html-to-image");
    const url = await toPng(replica.elemento, {
      width: plano.largura,
      height: plano.altura,
      pixelRatio: plano.escala,
      backgroundColor: opcoes.tema === "escuro" ? "#18181b" : "#ffffff",
      cacheBust: true,
      // A decisão de escala é nossa. A biblioteca não deve reduzir silenciosamente a imagem.
      skipAutoScale: true,
    });
    const resposta = await fetch(url);
    if (!resposta.ok) throw new ErroExportacaoVisual("Não foi possível criar a imagem PNG da exportação.");
    return {
      png: await resposta.blob(),
      largura: plano.largura,
      altura: plano.altura,
      escala: plano.escala,
      origem: { x: replica.limites.x, y: replica.limites.y },
    };
  } catch (erro) {
    if (erro instanceof ErroExportacaoVisual) throw erro;
    throw new ErroExportacaoVisual("Não foi possível gerar a imagem. Tente novamente ou reduza o recorte.");
  } finally {
    replica.desmontar();
  }
}

/** Empacota exatamente o mesmo PNG numa única página de dimensões livres. */
export async function criarPdfDaImagem(imagem: ImagemExportada): Promise<Blob> {
  try {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({
      unit: "px",
      format: [imagem.largura, imagem.altura],
      orientation: imagem.largura > imagem.altura ? "landscape" : "portrait",
      hotfixes: ["px_scaling"],
      compress: true,
    });
    pdf.addImage(new Uint8Array(await imagem.png.arrayBuffer()), "PNG", 0, 0, imagem.largura, imagem.altura, undefined, "FAST");
    return pdf.output("blob");
  } catch {
    throw new ErroExportacaoVisual("Não foi possível criar o PDF da imagem. Tente novamente ou reduza o recorte.");
  }
}

export async function exportarVisual(opcoes: OpcoesExportacaoVisual, formato: "png" | "pdf"): Promise<Blob> {
  const imagem = await rasterizarExportacaoVisual(opcoes);
  return formato === "png" ? imagem.png : criarPdfDaImagem(imagem);
}

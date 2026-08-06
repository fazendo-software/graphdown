import type { ExportacaoSnapshot } from "../../core/tipos.ts";
import { getBezierPath } from "@xyflow/react";
import { criarPdfDaImagem, rasterizarExportacaoVisual } from "./ExportacaoVisual.tsx";
import { ErroExportacaoVisual, planejarRasterizacao } from "./exportacaoVisual.ts";
import { pontasDaCaixa } from "./flutuante.ts";

type ResultadoSmoke = { pngClaro: number; pngEscuro: number; pdf: number; escala: number; pixelsPonta: number; pixelsRotulo: number };

const snapshot: ExportacaoSnapshot = {
  versao: 1,
  exportadoEm: "2026-08-06T12:00:00.000Z",
  projeto: { id: "smoke", titulo: "Smoke visual" },
  categorias: [{
    id: "processo", nome: "Processo", campos: [{ chave: "tipo", tipo: "enum", opcoes: ["etapa"] }],
    cor_por: "tipo", cores: { etapa: "#2563eb" }, forma_por: "tipo", formas: { etapa: "losango" },
  }],
  camposAresta: [{ chave: "prazo", tipo: "texto" }],
  estilosAresta: { padrao: { estilo: "continua", ponta: "cheia" }, dependencia: { estilo: "tracejada", ponta: "ambas", cor: "#7c3aed" } },
  nos: [
    { id: "inicio", titulo: "Início 🧭 漢字 e um título deliberadamente muito longo para confirmar a medição real", categoria_id: "processo", campos: { tipo: "etapa" }, corpo: "", versao: 1, posicao: { x: 40, y: 40 } },
    { id: "fim", titulo: "Fim", categoria_id: "processo", campos: { tipo: "etapa" }, corpo: "", versao: 1, posicao: { x: 530, y: 310 } },
  ],
  notas: [{ id: "nota", x: 300, y: 20, conteudo: "Nota longa com emoji 👩🏽‍💻, CJK 漢字 e palavras extensas para o smoke conferir que o post-it cresce sem ser cortado.".repeat(4) }],
  arestas: [{ id: "relacao", de: "inicio", para: "fim", tipo: "dependencia", quando: "depois de uma descrição extensa", campos: { prazo: "até o próximo ciclo de planejamento" } }],
  fantasmas: [],
};

function afirmar(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

async function lerImagem(blob: Blob): Promise<{ dados: Uint8ClampedArray; largura: number; altura: number }> {
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const contexto = canvas.getContext("2d");
  if (!contexto) throw new Error("Canvas indisponível no smoke.");
  contexto.drawImage(bitmap, 0, 0);
  return { dados: contexto.getImageData(0, 0, canvas.width, canvas.height).data, largura: canvas.width, altura: canvas.height };
}

function contarCor(
  imagem: { dados: Uint8ClampedArray; largura: number; altura: number },
  cor: [number, number, number],
  caixa: { x: number; y: number; largura: number; altura: number },
  origem: { x: number; y: number },
  escala: number,
): number {
  const inicioX = Math.max(0, Math.floor((caixa.x - origem.x) * escala));
  const inicioY = Math.max(0, Math.floor((caixa.y - origem.y) * escala));
  const fimX = Math.min(imagem.largura, Math.ceil((caixa.x + caixa.largura - origem.x) * escala));
  const fimY = Math.min(imagem.altura, Math.ceil((caixa.y + caixa.altura - origem.y) * escala));
  let total = 0;
  for (let y = inicioY; y < fimY; y++) for (let x = inicioX; x < fimX; x++) {
    const i = (y * imagem.largura + x) * 4;
    if (Math.abs(imagem.dados[i] - cor[0]) < 16 && Math.abs(imagem.dados[i + 1] - cor[1]) < 16 && Math.abs(imagem.dados[i + 2] - cor[2]) < 16) total++;
  }
  return total;
}

function composicaoDaAresta() {
  const origem = { x: 40, y: 40, largura: 180, altura: 110 };
  const destino = { x: 530, y: 310, largura: 180, altura: 110 };
  const pontas = pontasDaCaixa(origem, destino);
  const [, labelX, labelY] = getBezierPath({
    sourceX: pontas.sx, sourceY: pontas.sy, targetX: pontas.tx, targetY: pontas.ty,
    sourcePosition: pontas.ladoOrigem, targetPosition: pontas.ladoDestino,
  });
  return {
    ponta: { x: pontas.tx - 12, y: pontas.ty - 12, largura: 24, altura: 24 },
    rotulo: { x: labelX - 102, y: labelY - 30, largura: 204, altura: 60 },
  };
}

async function executar(): Promise<ResultadoSmoke> {
  const opcoes = { snapshot, recorte: { tipo: "projeto" } as const };
  const claro = await rasterizarExportacaoVisual({ ...opcoes, tema: "claro" });
  afirmar(claro.png.type === "image/png" && claro.png.size > 100, "PNG claro não foi criado.");
  afirmar(claro.escala === 2, "O smoke pequeno deveria usar 2×.");
  afirmar(document.querySelector("[data-exportacao-visual]") === null, "A réplica offscreen não foi desmontada.");
  const imagemClara = await lerImagem(claro.png);
  const composicao = composicaoDaAresta();
  // Roxo só pertence à aresta do fixture. A região da ponta exige o marker: sem ele sobra
  // apenas o fim estreito do traço rough e a contagem fica abaixo do limiar.
  const pixelsPonta = contarCor(imagemClara, [124, 58, 237], composicao.ponta, claro.origem, claro.escala);
  // Cinza nesta região só vem do texto do rótulo; os títulos e a nota ficam fora dela.
  const pixelsRotulo = contarCor(imagemClara, [82, 82, 91], composicao.rotulo, claro.origem, claro.escala);
  afirmar(pixelsPonta >= 200, "A ponta da aresta não apareceu no PNG.");
  afirmar(pixelsRotulo >= 100, "O rótulo da aresta não apareceu no PNG.");

  const escuro = await rasterizarExportacaoVisual({ ...opcoes, tema: "escuro" });
  const imagemEscura = await lerImagem(escuro.png);
  const [r, g, b] = imagemEscura.dados;
  afirmar(r < 50 && g < 50 && b < 50, "O PNG escuro não preservou o fundo do tema.");
  afirmar(escuro.altura > 500, "Texto longo não ampliou os limites da imagem como esperado.");
  const pdf = await criarPdfDaImagem(escuro);
  const textoPdf = await pdf.text();
  afirmar((textoPdf.match(/\/Type\s*\/Page\b/g) ?? []).length === 1, "O PDF deveria ter uma única página.");

  afirmar(planejarRasterizacao({ largura: 150, altura: 150 }, 40_000).escala === 1, "Fallback 2×/1× não ocorreu.");
  let limiteFalhou = false;
  try {
    planejarRasterizacao({ largura: 300, altura: 300 }, 40_000);
  } catch (erro) {
    limiteFalhou = erro instanceof ErroExportacaoVisual;
  }
  afirmar(limiteFalhou, "Limite grande não falhou explicitamente.");
  return { pngClaro: claro.png.size, pngEscuro: escuro.png.size, pdf: pdf.size, escala: claro.escala, pixelsPonta, pixelsRotulo };
}

const janela = window as Window & { smokeExportacao?: Promise<ResultadoSmoke> };
janela.smokeExportacao = executar();
janela.smokeExportacao
  .then((resultado) => { document.body.textContent = `PASS ${JSON.stringify(resultado)}`; })
  .catch((erro: unknown) => { document.body.textContent = `FAIL ${(erro as Error).stack ?? String(erro)}`; });

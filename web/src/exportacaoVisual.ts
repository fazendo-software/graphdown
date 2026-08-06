/** Geometria sem DOM do exportador visual. Mantê-la pura permite testar os limites no Node. */
export type CaixaVisual = { x: number; y: number; largura: number; altura: number };

export type PlanoRasterizacao = {
  escala: 1 | 2;
  largura: number;
  altura: number;
  larguraRaster: number;
  alturaRaster: number;
};

/** Margem para o traço rough, ponta da seta e texto que encosta no recorte. */
export const MARGEM_EXPORTACAO = 64;
/** Conservador para Chrome/Safari: evita canvas enorme antes de consumir memória demais. */
export const MAX_PIXELS_EXPORTACAO = 32_000_000;
export const MAX_LADO_EXPORTACAO = 16_384;

export class ErroExportacaoVisual extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroExportacaoVisual";
  }
}

function validarNumero(valor: number, nome: string): void {
  if (!Number.isFinite(valor) || valor <= 0) throw new ErroExportacaoVisual(`Não foi possível calcular ${nome} da exportação.`);
}

/** Une caixas de nós, notas e rótulos, e acrescenta uma margem externa uniforme. */
export function calcularLimitesExportacao(caixas: CaixaVisual[], margem = MARGEM_EXPORTACAO): CaixaVisual {
  if (caixas.length === 0) throw new ErroExportacaoVisual("Não há conteúdo no recorte para exportar.");
  validarNumero(margem, "a margem");
  for (const caixa of caixas) {
    validarNumero(caixa.largura, "a largura");
    validarNumero(caixa.altura, "a altura");
    if (!Number.isFinite(caixa.x) || !Number.isFinite(caixa.y)) {
      throw new ErroExportacaoVisual("Não foi possível localizar o conteúdo da exportação.");
    }
  }
  const esquerda = Math.min(...caixas.map((caixa) => caixa.x)) - margem;
  const topo = Math.min(...caixas.map((caixa) => caixa.y)) - margem;
  const direita = Math.max(...caixas.map((caixa) => caixa.x + caixa.largura)) + margem;
  const baixo = Math.max(...caixas.map((caixa) => caixa.y + caixa.altura)) + margem;
  return { x: esquerda, y: topo, largura: Math.ceil(direita - esquerda), altura: Math.ceil(baixo - topo) };
}

/** Prefere 2×; cai para 1× somente quando a resolução alta não é segura. */
export function planejarRasterizacao(
  limites: Pick<CaixaVisual, "largura" | "altura">,
  maxPixels = MAX_PIXELS_EXPORTACAO,
  maxLado = MAX_LADO_EXPORTACAO,
): PlanoRasterizacao {
  validarNumero(limites.largura, "a largura");
  validarNumero(limites.altura, "a altura");
  validarNumero(maxPixels, "o limite de pixels");
  validarNumero(maxLado, "o limite lateral");
  const largura = Math.ceil(limites.largura);
  const altura = Math.ceil(limites.altura);
  for (const escala of [2, 1] as const) {
    const larguraRaster = largura * escala;
    const alturaRaster = altura * escala;
    if (larguraRaster <= maxLado && alturaRaster <= maxLado && larguraRaster * alturaRaster <= maxPixels) {
      return { escala, largura, altura, larguraRaster, alturaRaster };
    }
  }
  throw new ErroExportacaoVisual(
    "Este recorte é grande demais para exportar com segurança. Reduza a seleção ou exporte uma área menor e tente novamente.",
  );
}

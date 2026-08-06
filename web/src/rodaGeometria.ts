/** Geometria da roda de dois anéis. Separada do componente porque é a parte que erra em
 * silêncio: um item fora do arco só aparece se alguém olhar a tela na hora certa. */

export const RAIO_CATEGORIA = 66;
export const RAIO_OBJETO = 148;

const PASSO_OBJETO = (30 * Math.PI) / 180;
/** Menos que 360° de propósito: fechar o círculo faz o primeiro e o último item colidirem
 * e apaga a leitura de "estes objetos saíram daquela categoria". */
const ARCO_MAXIMO = (290 * Math.PI) / 180;

/** -90° para a primeira categoria nascer em cima, não à direita. */
export function anguloCategoria(indice: number, total: number): number {
  return (indice / total) * 2 * Math.PI - Math.PI / 2;
}

/**
 * Ângulo de cada objeto, num arco centrado na categoria que os abriu. Item único fica
 * exatamente sobre a categoria; vários se espalham simetricamente em volta dela.
 */
export function ANGULOS_OBJETO(quantidade: number, centro: number): number[] {
  if (quantidade === 0) return [];
  const arco = Math.min(ARCO_MAXIMO, quantidade * PASSO_OBJETO);
  const inicio = centro - arco / 2 + arco / (2 * quantidade);
  return Array.from({ length: quantidade }, (_, i) => inicio + (i * arco) / quantidade);
}

export const TAMANHO_MINIMO = 20;
export const TAMANHO_MAXIMO = 1000;

export type TamanhoVisual = { largura: number; altura: number };

/** Escala o objeto inteiro dentro dos limites, sem achatar sua proporção. */
export function tamanhoProporcional(
  atual: TamanhoVisual,
  lado: "largura" | "altura",
  valor: number,
): TamanhoVisual {
  const largura = Math.max(1, atual.largura);
  const altura = Math.max(1, atual.altura);
  const desejado = Math.max(TAMANHO_MINIMO, Math.min(TAMANHO_MAXIMO, Math.round(valor)));
  const escalaPedida = desejado / (lado === "largura" ? largura : altura);
  const escalaMinima = Math.max(TAMANHO_MINIMO / largura, TAMANHO_MINIMO / altura);
  const escalaMaxima = Math.min(TAMANHO_MAXIMO / largura, TAMANHO_MAXIMO / altura);
  const escala = Math.max(escalaMinima, Math.min(escalaMaxima, escalaPedida));
  return { largura: Math.round(largura * escala), altura: Math.round(altura * escala) };
}

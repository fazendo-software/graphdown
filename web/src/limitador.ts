/**
 * Throttle por tempo, sem depender de rAF: `arrastando` é limitado a ~30/s por
 * conexão (contrato), não por frame de renderização.
 */
export function criarLimitador(intervaloMs: number): (agora: number) => boolean {
  let ultimo = -Infinity;
  return (agora: number) => {
    if (agora - ultimo < intervaloMs) return false;
    ultimo = agora;
    return true;
  };
}

import type { Posicao } from "./tipos.ts";

export const TIPOS_OBJETO_SETA = ["linha", "seta", "cotovelo", "bloco", "divisor"] as const;
export type TipoObjetoSeta = (typeof TIPOS_OBJETO_SETA)[number];

export function ehTipoObjetoSeta(valor: unknown): valor is TipoObjetoSeta {
  return typeof valor === "string" && (TIPOS_OBJETO_SETA as readonly string[]).includes(valor);
}

/** Divisor é sempre um segmento; os demais começam e permanecem com ao menos 3 pontos. */
export function pontosObjetoSetaValidos(pontos: unknown, tipo: TipoObjetoSeta): pontos is Posicao[] {
  if (!Array.isArray(pontos)) return false;
  if (tipo === "divisor" ? pontos.length !== 2 : pontos.length < 3) return false;
  return pontos.every(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      Number.isFinite((p as Posicao).x) &&
      Number.isFinite((p as Posicao).y),
  );
}

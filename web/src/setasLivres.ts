import type { Posicao } from "../../core/tipos.ts";

export const TIPOS_SETA_LIVRE = ["linha", "seta", "cotovelo", "bloco", "divisor"] as const;
export type TipoSetaLivre = (typeof TIPOS_SETA_LIVRE)[number];

export type CaixaSetaLivre = { x: number; y: number; largura: number; altura: number };

const FOLGA = 36;
const MIN_LARGURA = 96;
const MIN_ALTURA = 96;

export function ehTipoSetaLivre(valor: unknown): valor is TipoSetaLivre {
  return typeof valor === "string" && (TIPOS_SETA_LIVRE as readonly string[]).includes(valor);
}

/** Linha/seta começam com um controle central; o divisor deliberadamente não o possui. */
export function pontosIniciais(tipo: TipoSetaLivre, centro: Posicao): Posicao[] {
  if (tipo === "divisor") return [{ x: centro.x - 120, y: centro.y }, { x: centro.x + 120, y: centro.y }];
  if (tipo === "cotovelo") {
    return [
      { x: centro.x - 120, y: centro.y - 50 },
      { x: centro.x + 120, y: centro.y - 50 },
      { x: centro.x + 120, y: centro.y + 50 },
    ];
  }
  return [{ x: centro.x - 120, y: centro.y }, { x: centro.x, y: centro.y }, { x: centro.x + 120, y: centro.y }];
}

export function caixaDosPontos(pontos: Posicao[]): CaixaSetaLivre {
  const xs = pontos.map((p) => p.x);
  const ys = pontos.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const largura = Math.max(MIN_LARGURA, maxX - minX + FOLGA * 2);
  const altura = Math.max(MIN_ALTURA, maxY - minY + FOLGA * 2);
  return { x: minX - FOLGA, y: minY - FOLGA, largura, altura };
}

export function pontosRelativos(pontos: Posicao[], caixa: CaixaSetaLivre): Posicao[] {
  return pontos.map((p) => ({ x: p.x - caixa.x, y: p.y - caixa.y }));
}

export function transladarPontos(pontos: Posicao[], dx: number, dy: number): Posicao[] {
  return pontos.map((p) => ({ x: Math.round(p.x + dx), y: Math.round(p.y + dy) }));
}

/** Os pontos cinza são controles derivados. Ao arrastá-los, viram um vértice persistido. */
export function meiosDosSegmentos(pontos: Posicao[]): Posicao[] {
  return pontos.slice(0, -1).map((p, indice) => ({
    x: (p.x + pontos[indice + 1].x) / 2,
    y: (p.y + pontos[indice + 1].y) / 2,
  }));
}

export function inserirVertice(pontos: Posicao[], segmento: number, posicao: Posicao): Posicao[] {
  return [...pontos.slice(0, segmento + 1), posicao, ...pontos.slice(segmento + 1)];
}

/** Um cotovelo nunca desenha diagonal: cada par ganha o giro horizontal→vertical necessário. */
export function pontosDoCotovelo(pontos: Posicao[]): Posicao[] {
  if (pontos.length < 2) return pontos;
  const resultado: Posicao[] = [pontos[0]];
  for (let i = 1; i < pontos.length; i++) {
    const anterior = resultado.at(-1)!;
    const proximo = pontos[i];
    if (anterior.x !== proximo.x && anterior.y !== proximo.y) resultado.push({ x: proximo.x, y: anterior.y });
    resultado.push(proximo);
  }
  return resultado;
}

export function caminhoSvg(pontos: Posicao[]): string {
  return pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function pontosSaoValidos(pontos: unknown, tipo: TipoSetaLivre): pontos is Posicao[] {
  if (!Array.isArray(pontos) || pontos.length !== (tipo === "divisor" ? 2 : Math.max(3, pontos.length))) return false;
  return pontos.every(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      Number.isFinite((p as Posicao).x) &&
      Number.isFinite((p as Posicao).y),
  );
}

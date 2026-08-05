import rough from "roughjs";
import type { Options } from "roughjs/bin/core";

const gerador = rough.generator();

/** Seed estável por id: sem isso o traço muda a cada render e o nó "treme". */
export function seedDoId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h) % 2 ** 31;
}

export type Traco = { d: string; stroke: string; fill: string; strokeWidth: number };
export type Tamanho = { largura: number; altura: number };

// Tamanho por forma, nao global: losango achatado num box 200x76 nao le como decisao.
// Mora aqui e nao no componente porque o layout (dagre) precisa disso sem tocar em React.
export const TAMANHOS: Record<string, Tamanho> = {
  retangulo: { largura: 200, altura: 76 },
  losango: { largura: 180, altura: 110 },
  estadio: { largura: 160, altura: 64 },
  paralelogramo: { largura: 200, altura: 76 },
  ator: { largura: 120, altura: 120 },
};

export function tamanhoDe(forma: string): Tamanho {
  return TAMANHOS[forma] ?? TAMANHOS.retangulo;
}

function paraTracos(desenho: ReturnType<typeof gerador.rectangle>): Traco[] {
  return gerador.toPaths(desenho).map((p) => ({
    d: p.d,
    stroke: p.stroke ?? "none",
    fill: p.fill ?? "none",
    strokeWidth: p.strokeWidth ?? 1,
  }));
}

function bonequinho(l: number, a: number, opcoes: Options): Traco[] {
  // Preenchimento em figura de traço fica sujo; o ator é só contorno.
  const o = { ...opcoes, fill: undefined };
  const cx = l / 2;
  // A figura ocupa só o topo do box: o terço de baixo é onde o rótulo cabe sem
  // atravessar as pernas.
  const h = a * 0.72;
  return [
    gerador.circle(cx, h * 0.2, h * 0.3, o),
    gerador.linearPath(
      [
        [cx, h * 0.36],
        [cx, h * 0.66],
      ],
      o,
    ),
    gerador.linearPath(
      [
        [cx - l * 0.26, h * 0.48],
        [cx + l * 0.26, h * 0.48],
      ],
      o,
    ),
    gerador.linearPath(
      [
        [cx - l * 0.2, h * 0.98],
        [cx, h * 0.66],
        [cx + l * 0.2, h * 0.98],
      ],
      o,
    ),
  ].flatMap(paraTracos);
}

/** Forma desconhecida cai em retângulo: categoria errada não deixa o nó invisível. */
export function desenharForma(forma: string, opcoes: Options, tamanho?: Tamanho): Traco[] {
  const { largura: l, altura: a } = tamanho ?? tamanhoDe(forma);
  switch (forma) {
    case "losango":
      return paraTracos(
        gerador.polygon(
          [
            [l / 2, 1],
            [l - 1, a / 2],
            [l / 2, a - 1],
            [1, a / 2],
          ],
          opcoes,
        ),
      );
    case "estadio": {
      const r = (a - 2) / 2;
      const d = `M ${r + 1} 1 H ${l - r - 1} A ${r} ${r} 0 0 1 ${l - r - 1} ${a - 1} H ${r + 1} A ${r} ${r} 0 0 1 ${r + 1} 1 Z`;
      return paraTracos(gerador.path(d, opcoes));
    }
    case "paralelogramo": {
      const s = Math.min(22, l / 5);
      return paraTracos(
        gerador.polygon(
          [
            [s, 1],
            [l - 1, 1],
            [l - s, a - 1],
            [1, a - 1],
          ],
          opcoes,
        ),
      );
    }
    case "ator":
      return bonequinho(l, a, opcoes);
    default:
      return paraTracos(gerador.rectangle(1, 1, l - 2, a - 2, opcoes));
  }
}

export function caminho(d: string, opcoes: Options): Traco[] {
  return paraTracos(gerador.path(d, opcoes));
}

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
/** Espaço reservado para o rótulo que fica abaixo do desenho do objeto. */
export const ALTURA_ROTULO = 30;

export function tamanhoDoNo(forma: string): Tamanho {
  const tamanho = tamanhoDe(forma);
  return { largura: tamanho.largura, altura: tamanho.altura + ALTURA_ROTULO };
}

// Tamanho por forma, nao global: losango achatado num box 200x76 nao le como decisao.
// Mora aqui e nao no componente porque o layout (dagre) precisa disso sem tocar em React.
export const TAMANHOS: Record<string, Tamanho> = {
  retangulo: { largura: 200, altura: 76 },
  losango: { largura: 180, altura: 110 },
  estadio: { largura: 160, altura: 64 },
  paralelogramo: { largura: 200, altura: 76 },
  ator: { largura: 120, altura: 120 },
  // Formas do fluxograma clássico (ANSI).
  subprocesso: { largura: 200, altura: 76 },
  documento: { largura: 190, altura: 90 },
  cilindro: { largura: 160, altura: 96 },
  circulo: { largura: 72, altura: 72 },
  trapezio: { largura: 190, altura: 76 },
  atraso: { largura: 180, altura: 76 },
  sistema: { largura: 200, altura: 84 },
  ampulheta: { largura: 120, altura: 110 },
  barra: { largura: 200, altura: 20 },
  teclado: { largura: 190, altura: 76 },
  hexagono: { largura: 180, altura: 86 },
  documentos: { largura: 190, altura: 98 },
  tambor: { largura: 180, altura: 76 },
  equipe: { largura: 150, altura: 120 },
  // Infraestrutura.
  nuvem: { largura: 180, altura: 104 },
  rack: { largura: 150, altura: 112 },
  caixa: { largura: 160, altura: 112 },
  rede: { largura: 150, altura: 112 },
  // Riscos e controles.
  triangulo: { largura: 150, altura: 112 },
  escudo: { largura: 130, altura: 120 },
  octogono: { largura: 150, altura: 100 },
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
    case "subprocesso": {
      // Retângulo com as duas barras laterais: as barras são contorno, nunca preenchidas,
      // senão o `fill` do nó as transforma em blocos sólidos.
      const s = Math.min(16, l / 8);
      const semPreenchimento = { ...opcoes, fill: undefined };
      return [
        gerador.rectangle(1, 1, l - 2, a - 2, opcoes),
        gerador.linearPath([[s, 1], [s, a - 1]], semPreenchimento),
        gerador.linearPath([[l - s, 1], [l - s, a - 1]], semPreenchimento),
      ].flatMap(paraTracos);
    }
    case "documento": {
      // Base ondulada: a curva desce à direita e sobe à esquerda, como no símbolo ANSI.
      const base = a * 0.8;
      const d =
        `M 1 1 H ${l - 1} V ${base} ` +
        `C ${l * 0.72} ${a * 1.04}, ${l * 0.28} ${a * 0.56}, 1 ${base} Z`;
      return paraTracos(gerador.path(d, opcoes));
    }
    case "cilindro": {
      const ry = a * 0.15;
      const rx = (l - 2) / 2;
      return [
        // Corpo primeiro: a tampa desenhada por cima esconde a emenda das laterais.
        gerador.path(
          `M 1 ${ry + 1} V ${a - ry - 1} A ${rx} ${ry} 0 0 0 ${l - 1} ${a - ry - 1} V ${ry + 1}`,
          opcoes,
        ),
        gerador.ellipse(l / 2, ry + 1, l - 2, ry * 2, opcoes),
      ].flatMap(paraTracos);
    }
    case "circulo":
      return paraTracos(gerador.circle(l / 2, a / 2, Math.min(l, a) - 2, opcoes));
    case "trapezio": {
      // Operação manual: topo maior que a base.
      const s = Math.min(26, l / 6);
      return paraTracos(
        gerador.polygon(
          [
            [1, 1],
            [l - 1, 1],
            [l - s, a - 1],
            [s, a - 1],
          ],
          opcoes,
        ),
      );
    }
    case "atraso": {
      const r = (a - 2) / 2;
      const d = `M 1 1 H ${l - r - 1} A ${r} ${r} 0 0 1 ${l - r - 1} ${a - 1} H 1 Z`;
      return paraTracos(gerador.path(d, opcoes));
    }
    case "sistema": {
      const topo = Math.min(24, a / 3);
      const semPreenchimento = { ...opcoes, fill: undefined };
      return [
        gerador.rectangle(1, 1, l - 2, a - 2, opcoes),
        gerador.linearPath([[1, topo], [l - 1, topo]], semPreenchimento),
      ].flatMap(paraTracos);
    }
    case "ampulheta": {
      // Dois triângulos ponta a ponta. Polígono único se auto-intersectaria e o
      // preenchimento sairia furado.
      return [
        gerador.polygon([[1, 1], [l - 1, 1], [l / 2, a / 2]], opcoes),
        gerador.polygon([[1, a - 1], [l - 1, a - 1], [l / 2, a / 2]], opcoes),
      ].flatMap(paraTracos);
    }
    case "barra":
      // Fork/join: barra chapada. O `fill` do nó é o que a torna sólida.
      return paraTracos(gerador.rectangle(1, 1, l - 2, a - 2, { ...opcoes, fillStyle: "solid" }));
    case "teclado": {
      // Entrada manual (ANSI): base maior que o topo — o inverso do trapézio.
      const s = Math.min(26, l / 6);
      return paraTracos(
        gerador.polygon([[s, 1], [l - s, 1], [l - 1, a - 1], [1, a - 1]], opcoes),
      );
    }
    case "hexagono": {
      const s = Math.min(28, l / 6);
      return paraTracos(
        gerador.polygon(
          [[s, 1], [l - s, 1], [l - 1, a / 2], [l - s, a - 1], [s, a - 1], [1, a / 2]],
          opcoes,
        ),
      );
    }
    case "documentos": {
      // Pilha: duas folhas atrás só de contorno, o documento da frente com o preenchimento.
      const d = 7;
      const semPreenchimento = { ...opcoes, fill: undefined };
      const frente = a - 2 * d;
      const base = frente * 0.8;
      return [
        gerador.rectangle(1 + 2 * d, 1, l - 2 - 2 * d, frente, semPreenchimento),
        gerador.rectangle(1 + d, 1 + d, l - 2 - 2 * d, frente, semPreenchimento),
        gerador.path(
          `M 1 ${1 + 2 * d} H ${l - 1 - 2 * d} V ${base + 2 * d} ` +
            `C ${l * 0.68} ${a * 1.02}, ${l * 0.24} ${a * 0.6}, 1 ${base + 2 * d} Z`,
          opcoes,
        ),
      ].flatMap(paraTracos);
    }
    case "tambor": {
      // Cilindro deitado: fila. A boca fica à esquerda, como em diagrama de mensageria.
      const rx = Math.min(20, l * 0.12);
      const ry = (a - 2) / 2;
      return [
        gerador.path(
          `M ${rx + 1} 1 H ${l - rx - 1} A ${rx} ${ry} 0 0 1 ${l - rx - 1} ${a - 1} H ${rx + 1}`,
          opcoes,
        ),
        gerador.ellipse(rx + 1, a / 2, rx * 2, a - 2, opcoes),
      ].flatMap(paraTracos);
    }
    case "equipe": {
      // Três bonequinhos: cabeça + ombros, sem pernas — em três não caberia.
      const o = { ...opcoes, fill: undefined };
      const h = a * 0.66;
      const r = h * 0.2;
      return [0.24, 0.5, 0.76].flatMap((fx, i) => {
        const cx = l * fx;
        const cy = h * (i === 1 ? 0.22 : 0.34);
        return [
          gerador.circle(cx, cy, r, o),
          gerador.path(
            `M ${cx - r * 0.85} ${cy + r * 1.5} A ${r * 0.85} ${r} 0 0 1 ${cx + r * 0.85} ${cy + r * 1.5}`,
            o,
          ),
        ];
      }).flatMap(paraTracos);
    }
    case "nuvem": {
      const d =
        `M ${l * 0.22} ${a * 0.78} ` +
        `A ${a * 0.2} ${a * 0.2} 0 0 1 ${l * 0.26} ${a * 0.42} ` +
        `A ${a * 0.26} ${a * 0.26} 0 0 1 ${l * 0.6} ${a * 0.36} ` +
        `A ${a * 0.22} ${a * 0.22} 0 0 1 ${l * 0.8} ${a * 0.54} ` +
        `A ${a * 0.18} ${a * 0.18} 0 0 1 ${l * 0.8} ${a * 0.78} Z`;
      return paraTracos(gerador.path(d, opcoes));
    }
    case "rack": {
      // Servidor: gabinete com três baias. As divisórias são contorno, nunca preenchidas.
      const o = { ...opcoes, fill: undefined };
      const baia = (a - 2) / 3;
      return [
        gerador.rectangle(1, 1, l - 2, a - 2, opcoes),
        gerador.linearPath([[1, 1 + baia], [l - 1, 1 + baia]], o),
        gerador.linearPath([[1, 1 + 2 * baia], [l - 1, 1 + 2 * baia]], o),
        // LED de cada baia, à esquerda.
        ...[0.5, 1.5, 2.5].map((n) => gerador.circle(l * 0.14, 1 + baia * n, 8, o)),
      ].flatMap(paraTracos);
    }
    case "caixa": {
      // Container: face frontal mais topo e lateral em perspectiva.
      const d = Math.min(20, a * 0.18);
      const o = { ...opcoes, fill: undefined };
      return [
        gerador.rectangle(1, d, l - 1 - d, a - 1 - d, opcoes),
        gerador.polygon([[1, d], [1 + d, 1], [l - 1, 1], [l - d, d]], o),
        gerador.polygon([[l - d, d], [l - 1, 1], [l - 1, a - 1 - d], [l - d, a - 1]], o),
      ].flatMap(paraTracos);
    }
    case "rede": {
      // Três nós ligados: topologia, não caixa.
      const o = { ...opcoes, fill: undefined };
      const r = Math.min(l, a) * 0.2;
      const pontos: [number, number][] = [
        [l / 2, 1 + r / 2],
        [1 + r / 2, a - 1 - r / 2],
        [l - 1 - r / 2, a - 1 - r / 2],
      ];
      return [
        gerador.linearPath([...pontos, pontos[0]], o),
        ...pontos.map(([x, y]) => gerador.circle(x, y, r, opcoes)),
      ].flatMap(paraTracos);
    }
    case "triangulo":
      return paraTracos(gerador.polygon([[l / 2, 1], [l - 1, a - 1], [1, a - 1]], opcoes));
    case "escudo": {
      const d =
        `M 1 1 H ${l - 1} V ${a * 0.55} ` +
        `Q ${l - 1} ${a - 1} ${l / 2} ${a - 1} ` +
        `Q 1 ${a - 1} 1 ${a * 0.55} Z`;
      return paraTracos(gerador.path(d, opcoes));
    }
    case "octogono": {
      const s = Math.min(l, a) * 0.3;
      return paraTracos(
        gerador.polygon(
          [
            [s, 1],
            [l - s, 1],
            [l - 1, s],
            [l - 1, a - s],
            [l - s, a - 1],
            [s, a - 1],
            [1, a - s],
            [1, s],
          ],
          opcoes,
        ),
      );
    }
    default:
      return paraTracos(gerador.rectangle(1, 1, l - 2, a - 2, opcoes));
  }
}

export function caminho(d: string, opcoes: Options): Traco[] {
  return paraTracos(gerador.path(d, opcoes));
}

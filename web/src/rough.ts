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

function paraTracos(desenho: ReturnType<typeof gerador.rectangle>): Traco[] {
  return gerador.toPaths(desenho).map((p) => ({
    d: p.d,
    stroke: p.stroke ?? "none",
    fill: p.fill ?? "none",
    strokeWidth: p.strokeWidth ?? 1,
  }));
}

export function retangulo(largura: number, altura: number, opcoes: Options): Traco[] {
  return paraTracos(gerador.rectangle(1, 1, largura - 2, altura - 2, opcoes));
}

export function caminho(d: string, opcoes: Options): Traco[] {
  return paraTracos(gerador.path(d, opcoes));
}

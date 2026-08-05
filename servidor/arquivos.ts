import { createHash } from "node:crypto";
import { readdir, readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Layout } from "../core/tipos.ts";

const OCULTA = ".grapydown";

export function idValido(id: string): boolean {
  return /^[\w.-]+$/.test(id) && !id.includes("..");
}

export function caminhoNo(dir: string, id: string): string {
  if (!idValido(id)) throw new Error(`id inválido: ${id}`);
  return join(dir, `${id}.md`);
}

export async function lerPasta(dir: string): Promise<{ id: string; texto: string }[]> {
  const nomes = (await readdir(dir))
    .filter((n) => n.endsWith(".md") && !n.startsWith("."))
    .sort();
  return Promise.all(
    nomes.map(async (nome) => ({
      id: nome.slice(0, -3),
      texto: await readFile(join(dir, nome), "utf8"),
    })),
  );
}

const proprias = new Set<string>();
const hash = (texto: string) => createHash("sha1").update(texto).digest("hex");

/** Consome o registro: true na primeira checagem depois da nossa escrita, false depois. */
export function ehEscritaPropria(texto: string): boolean {
  return proprias.delete(hash(texto));
}

export async function escrever(caminho: string, texto: string): Promise<void> {
  proprias.add(hash(texto));
  const tmp = `${caminho}.tmp`;
  await writeFile(tmp, texto, "utf8");
  await rename(tmp, caminho);
}

export async function paraLixeira(dir: string, id: string): Promise<void> {
  const lixeira = join(dir, OCULTA, "trash");
  await mkdir(lixeira, { recursive: true });
  await rename(caminhoNo(dir, id), join(lixeira, `${id}-${Date.now()}.md`));
}

export async function lerLayout(dir: string): Promise<Layout> {
  try {
    return JSON.parse(await readFile(join(dir, OCULTA, "layout.json"), "utf8")) as Layout;
  } catch {
    return {};
  }
}

export async function gravarLayout(dir: string, layout: Layout): Promise<void> {
  await mkdir(join(dir, OCULTA), { recursive: true });
  // Uma linha por nó e chaves ordenadas: diff de git legível, merge resolvível à mão.
  const linhas = Object.keys(layout)
    .sort()
    // Entrada vinda da rede: so passa {x, y} finito. layout.json e versionado no git —
    // um valor torto aqui vira NaN no canvas de quem der pull.
    .filter((id) => Number.isFinite(layout[id]?.x) && Number.isFinite(layout[id]?.y))
    .map((id) => `  ${JSON.stringify(id)}: ${JSON.stringify({ x: layout[id].x, y: layout[id].y })}`);
  await escrever(join(dir, OCULTA, "layout.json"), `{\n${linhas.join(",\n")}\n}\n`);
}

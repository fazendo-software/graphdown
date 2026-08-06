import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Mora em web/src e não em core/: precisa de `rough.ts`, que só o tsconfig do web resolve.
import { parseCategoria } from "../../core/categoria.ts";
import { TAMANHOS } from "./rough.ts";

const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "categorias");

async function categorias() {
  const arquivos = (await readdir(DIR)).filter((n) => n.endsWith(".yaml")).sort();
  return Promise.all(
    arquivos.map(async (a) => ({ arquivo: a, cat: parseCategoria(await readFile(join(DIR, a), "utf8")) })),
  );
}

test("toda forma declarada num YAML existe em rough.ts", async () => {
  // Forma desconhecida cai em retângulo silenciosamente (`desenharForma`), então um typo no
  // YAML não quebra nada — só desenha errado. Este teste é o que transforma isso em falha.
  const conhecidas = new Set(Object.keys(TAMANHOS));
  for (const { arquivo, cat } of await categorias()) {
    for (const [tipo, forma] of Object.entries(cat.formas ?? {})) {
      assert.ok(conhecidas.has(forma), `${arquivo}: ${tipo} usa forma inexistente "${forma}"`);
    }
  }
});

test("todo tipo do enum tem forma, e toda forma tem tipo", async () => {
  for (const { arquivo, cat } of await categorias()) {
    const opcoes = cat.campos.find((c) => c.chave === cat.forma_por)?.opcoes ?? [];
    assert.ok(opcoes.length > 0, `${arquivo}: forma_por não aponta para um enum com opções`);
    const formas = Object.keys(cat.formas ?? {});
    assert.deepEqual(
      opcoes.filter((o) => !formas.includes(o)),
      [],
      `${arquivo}: tipo sem forma declarada`,
    );
    assert.deepEqual(
      formas.filter((f) => !opcoes.includes(f)),
      [],
      `${arquivo}: forma declarada para tipo que não está no enum`,
    );
  }
});

test("cor_por aponta para um enum e toda opção dele tem cor", async () => {
  for (const { arquivo, cat } of await categorias()) {
    const campo = cat.campos.find((c) => c.chave === cat.cor_por);
    assert.ok(campo, `${arquivo}: cor_por não aponta para nenhum campo`);
    for (const opcao of campo.opcoes ?? []) {
      assert.ok(cat.cores?.[opcao], `${arquivo}: ${opcao} sem cor declarada`);
    }
  }
});

test("só a categoria principal declara arestas — as demais herdam pela fusão", async () => {
  for (const { arquivo, cat } of await categorias()) {
    if (arquivo === "processo.yaml") {
      assert.ok(cat.arestas && Object.keys(cat.arestas).length > 0, "processo.yaml sem arestas");
      assert.ok(cat.campos_aresta?.length, "processo.yaml sem campos_aresta");
      // `grupo` alimenta a divisão da paleta de setas; seta sem grupo cai em "outras".
      for (const [nome, e] of Object.entries(cat.arestas)) {
        assert.ok(e.grupo, `aresta ${nome} sem grupo`);
      }
      continue;
    }
    assert.equal(cat.arestas, undefined, `${arquivo} não deveria declarar arestas`);
    assert.equal(cat.campos_aresta, undefined, `${arquivo} não deveria declarar campos_aresta`);
  }
});

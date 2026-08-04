import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  idValido,
  lerPasta,
  escrever,
  ehEscritaPropria,
  paraLixeira,
  lerLayout,
  gravarLayout,
} from "./arquivos.ts";

async function pastaTemp() {
  return await mkdtemp(join(tmpdir(), "grapy-"));
}

test("idValido barra path traversal", () => {
  assert.equal(idValido("01-passo"), true);
  assert.equal(idValido("../../etc/passwd"), false);
  assert.equal(idValido("a/b"), false);
  assert.equal(idValido(""), false);
});

test("lerPasta devolve só .md, ordenado, sem a pasta oculta", async () => {
  const dir = await pastaTemp();
  await writeFile(join(dir, "02-b.md"), "---\ntitulo: B\n---\n");
  await writeFile(join(dir, "01-a.md"), "---\ntitulo: A\n---\n");
  await writeFile(join(dir, "leiame.txt"), "ignorar");
  await mkdir(join(dir, ".grapydown"));
  await writeFile(join(dir, ".grapydown", "nota.md"), "não conta");

  const arquivos = await lerPasta(dir);
  assert.deepEqual(
    arquivos.map((a) => a.id),
    ["01-a", "02-b"],
  );
});

test("escrever é atômico e não deixa .tmp para trás", async () => {
  const dir = await pastaTemp();
  await escrever(join(dir, "x.md"), "conteudo\n");
  assert.equal(await readFile(join(dir, "x.md"), "utf8"), "conteudo\n");
  const restos = (await readdir(dir)).filter((n) => n.endsWith(".tmp"));
  assert.deepEqual(restos, []);
});

test("escrita própria é reconhecida uma vez só", async () => {
  const dir = await pastaTemp();
  await escrever(join(dir, "y.md"), "abc\n");
  assert.equal(ehEscritaPropria("abc\n"), true, "primeira checagem consome o hash");
  assert.equal(ehEscritaPropria("abc\n"), false, "segunda já é mudança externa");
});

test("paraLixeira move o arquivo, não apaga", async () => {
  const dir = await pastaTemp();
  await writeFile(join(dir, "z.md"), "importante\n");
  await paraLixeira(dir, "z");
  assert.deepEqual(
    (await readdir(dir)).filter((n) => n.endsWith(".md")),
    [],
  );
  const lixo = await readdir(join(dir, ".grapydown", "trash"));
  assert.equal(lixo.length, 1);
  assert.match(lixo[0], /^z-\d+\.md$/);
  assert.equal(await readFile(join(dir, ".grapydown", "trash", lixo[0]), "utf8"), "importante\n");
});

test("layout grava ordenado, um nó por linha, e relê igual", async () => {
  const dir = await pastaTemp();
  await gravarLayout(dir, { b: { x: 10, y: 20 }, a: { x: 0, y: 0 } });
  const bruto = await readFile(join(dir, ".grapydown", "layout.json"), "utf8");
  assert.equal(bruto, '{\n  "a": {"x":0,"y":0},\n  "b": {"x":10,"y":20}\n}\n');
  assert.deepEqual(await lerLayout(dir), { a: { x: 0, y: 0 }, b: { x: 10, y: 20 } });
});

test("lerLayout devolve vazio quando não existe", async () => {
  assert.deepEqual(await lerLayout(await pastaTemp()), {});
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { criarServidor } from "./rotas.ts";

async function subir() {
  const dir = await mkdtemp(join(tmpdir(), "grapy-rotas-"));
  await writeFile(join(dir, "_grafo.yaml"), "titulo: Onboarding\ncategoria: processo\n");
  await writeFile(join(dir, "01-a.md"), "---\ntitulo: A\nstatus: ativo\n---\ncorpo de A\n");
  await writeFile(join(dir, "02-b.md"), "---\ntitulo: B\ndepende_de:\n  - 01-a\n---\ncorpo de B\n");

  const servidor = criarServidor(dir);
  await new Promise<void>((ok) => servidor.listen(0, ok));
  const porta = (servidor.address() as { port: number }).port;
  const base = `http://127.0.0.1:${porta}`;
  return { dir, base, fechar: () => new Promise<void>((ok) => servidor.close(() => ok())) };
}

test("GET /api/grafo devolve nós, arestas e layout", async () => {
  const { base, fechar } = await subir();
  const r = await fetch(`${base}/api/grafo`);
  assert.equal(r.status, 200);
  const g = await r.json();
  assert.equal(g.titulo, "Onboarding");
  assert.equal(g.categoria.nome, "Processo");
  assert.equal(g.nos.length, 2);
  assert.deepEqual(g.arestas, [{ de: "01-a", para: "02-b" }]);
  assert.deepEqual(g.layout, {});
  await fechar();
});

test("GET /api/no/:id inclui o corpo", async () => {
  const { base, fechar } = await subir();
  const no = await (await fetch(`${base}/api/no/01-a`)).json();
  assert.equal(no.corpo, "corpo de A\n");
  assert.equal(no.campos.status, "ativo");
  await fechar();
});

test("GET /api/no com id de traversal é rejeitado", async () => {
  const { base, fechar } = await subir();
  const r = await fetch(`${base}/api/no/..%2F..%2Fetc%2Fpasswd`);
  assert.equal(r.status, 400);
  await fechar();
});

test("PATCH altera campo sem tocar no corpo", async () => {
  const { dir, base, fechar } = await subir();
  const r = await fetch(`${base}/api/no/01-a`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ campos: { status: "concluido" } }),
  });
  assert.equal(r.status, 200);
  const texto = await readFile(join(dir, "01-a.md"), "utf8");
  assert.match(texto, /status: concluido/);
  assert.ok(texto.endsWith("corpo de A\n"));
  await fechar();
});

test("PATCH de depende_de é como se liga uma aresta", async () => {
  const { base, fechar } = await subir();
  await fetch(`${base}/api/no/01-a`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ campos: { depende_de: ["02-b"] } }),
  });
  const g = await (await fetch(`${base}/api/grafo`)).json();
  assert.equal(g.arestas.length, 2);
  await fechar();
});

test("PUT corpo mantém o frontmatter", async () => {
  const { dir, base, fechar } = await subir();
  await fetch(`${base}/api/no/01-a/corpo`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ corpo: "novo corpo\n" }),
  });
  const texto = await readFile(join(dir, "01-a.md"), "utf8");
  assert.ok(texto.startsWith("---\ntitulo: A\nstatus: ativo\n---\n"));
  assert.ok(texto.endsWith("novo corpo\n"));
  await fechar();
});

test("POST cria nó a partir do template da categoria", async () => {
  const { dir, base, fechar } = await subir();
  const r = await fetch(`${base}/api/no`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ titulo: "Notificação" }),
  });
  assert.equal(r.status, 201);
  const { id } = await r.json();
  assert.equal(id, "notificacao");
  const texto = await readFile(join(dir, "notificacao.md"), "utf8");
  assert.match(texto, /titulo: Notificação/);
  assert.match(texto, /status: rascunho/);
  await fechar();
});

test("POST com título repetido não sobrescreve", async () => {
  const { base, fechar } = await subir();
  const corpo = JSON.stringify({ titulo: "Repetido" });
  const cabecalho = { "content-type": "application/json" };
  const a = await (await fetch(`${base}/api/no`, { method: "POST", headers: cabecalho, body: corpo })).json();
  const b = await (await fetch(`${base}/api/no`, { method: "POST", headers: cabecalho, body: corpo })).json();
  assert.notEqual(a.id, b.id);
  await fechar();
});

test("DELETE move para a lixeira", async () => {
  const { dir, base, fechar } = await subir();
  const r = await fetch(`${base}/api/no/02-b`, { method: "DELETE" });
  assert.equal(r.status, 200);
  const lixo = await readdir(join(dir, ".grapydown", "trash"));
  assert.equal(lixo.length, 1);
  await fechar();
});

test("PUT layout grava e volta no GET /api/grafo", async () => {
  const { base, fechar } = await subir();
  await fetch(`${base}/api/layout`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ "01-a": { x: 5, y: 7 } }),
  });
  const g = await (await fetch(`${base}/api/grafo`)).json();
  assert.deepEqual(g.layout, { "01-a": { x: 5, y: 7 } });
  await fechar();
});

test("rota inexistente sob /api dá 404", async () => {
  const { base, fechar } = await subir();
  assert.equal((await fetch(`${base}/api/nada`)).status, 404);
  await fechar();
});

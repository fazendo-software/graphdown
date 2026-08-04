import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCategoria, templateNo, idDeTitulo } from "./categoria.ts";

const YAML_CAT = `nome: Processo
campos:
  - { chave: responsavel, tipo: texto, obrigatorio: true }
  - { chave: status, tipo: enum, opcoes: [rascunho, ativo] }
cor_por: status
cores:
  rascunho: "#9ca3af"
  ativo: "#2563eb"
`;

test("parseCategoria lê campos e cores", () => {
  const c = parseCategoria(YAML_CAT);
  assert.equal(c.nome, "Processo");
  assert.equal(c.campos.length, 2);
  assert.equal(c.campos[1].opcoes![0], "rascunho");
  assert.equal(c.cores!.ativo, "#2563eb");
});

test("parseCategoria tolera arquivo vazio", () => {
  const c = parseCategoria("");
  assert.deepEqual(c.campos, []);
});

test("templateNo gera frontmatter com todos os campos da categoria", () => {
  const texto = templateNo(parseCategoria(YAML_CAT), "Aprovação do gestor");
  assert.match(texto, /^---\n/);
  assert.match(texto, /titulo: Aprovação do gestor/);
  assert.match(texto, /responsavel: ""/);
  assert.match(texto, /status: rascunho/);
  assert.match(texto, /depende_de: \[\]/);
  assert.ok(texto.endsWith("---\n"));
});

test("idDeTitulo faz slug sem acento", () => {
  assert.equal(idDeTitulo("Aprovação do gestor"), "aprovacao-do-gestor");
  assert.equal(idDeTitulo("  !!  "), "no");
});

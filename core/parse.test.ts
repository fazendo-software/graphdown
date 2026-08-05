import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNota, editarCampo, editarCorpo, serializarNota } from "./parse.ts";

const NOTA = `---
# quem responde por este passo
titulo: Aprovação do gestor
responsavel: gestor-direto
prazo: 2d          # SLA acordado com RH
depende_de:
  - 01-solicitacao
---
Gestor recebe email.

Se negar, volta para o RH.
`;

test("parseNota separa frontmatter do corpo", () => {
  const { doc, corpo, erro } = parseNota(NOTA);
  assert.equal(erro, undefined);
  assert.equal(doc.get("titulo"), "Aprovação do gestor");
  assert.equal(corpo, "Gestor recebe email.\n\nSe negar, volta para o RH.\n");
});

test("parseNota sem frontmatter trata tudo como corpo", () => {
  const { corpo, erro } = parseNota("só texto\n");
  assert.equal(erro, undefined);
  assert.equal(corpo, "só texto\n");
});

test("parseNota reporta YAML inválido sem lançar", () => {
  const { erro } = parseNota("---\na: [1, 2\n---\ncorpo\n");
  assert.ok(erro, "esperava mensagem de erro");
});

test("editarCampo preserva comentários, ordem e o corpo", () => {
  const saida = editarCampo(NOTA, "prazo", "5d");
  assert.match(saida, /# quem responde por este passo/);
  assert.match(saida, /# SLA acordado com RH/);
  assert.match(saida, /prazo: 5d/);
  assert.ok(saida.indexOf("titulo:") < saida.indexOf("responsavel:"));
  assert.ok(saida.endsWith("Gestor recebe email.\n\nSe negar, volta para o RH.\n"));
});

test("editarCampo cria chave que ainda não existe", () => {
  const saida = editarCampo(NOTA, "status", "ativo");
  assert.match(saida, /status: ativo/);
});

test("editarCorpo não altera um byte do frontmatter", () => {
  const saida = editarCorpo(NOTA, "corpo novo\n");
  const fmOriginal = NOTA.slice(0, NOTA.indexOf("---\nGestor") + 4);
  assert.ok(saida.startsWith(fmOriginal), "frontmatter mudou");
  assert.ok(saida.endsWith("corpo novo\n"));
});

test("serializarNota volta ao formato de arquivo", () => {
  const { doc } = parseNota(NOTA);
  const saida = serializarNota(doc, "x\n");
  assert.ok(saida.startsWith("---\n"));
  assert.ok(saida.endsWith("---\nx\n"));
});

test("editarCampo não requebra linha longa nem bloco literal de outro campo", () => {
  // precisa passar de 80 colunas: e o lineWidth padrao do serializador do `yaml`
  const longa = Array.from({ length: 30 }, (_, i) => `palavra${i}`).join(" ");
  const nota = `---\ntitulo: X\nlonga: "${longa}"\ndescricao: |\n  bloco literal\n  segunda linha\nstatus: pendente\n---\ncorpo\n`;
  const saida = editarCampo(nota, "status", "ativo");
  assert.ok(saida.includes(`longa: "${longa}"`), "linha longa foi requebrada");
  assert.ok(saida.includes("descricao: |\n  bloco literal\n  segunda linha\n"), "bloco literal mudou");
});

test("editarCampo mantém CRLF em arquivo escrito no Windows", () => {
  const nota = "---\r\ntitulo: X\r\nstatus: pendente\r\n---\r\ncorpo\r\n";
  const saida = editarCampo(nota, "status", "ativo");
  assert.ok(saida.includes("status: ativo\r\n"), "campo editado perdeu CRLF");
  assert.equal(saida.match(/(?<!\r)\n/g), null, "sobrou LF solto: arquivo virou EOL misto");
});

test("editarCampo não converte o arquivo inteiro por causa de um CRLF solto no corpo", () => {
  const corpo = "linha um\r\nlinha dois\nlinha tres\n";
  const nota = `---\ntitulo: X\nstatus: pendente\n---\n${corpo}`;
  const saida = editarCampo(nota, "status", "ativo");
  assert.ok(saida.endsWith(corpo), "corpo foi reescrito");
  assert.match(saida, /^---\ntitulo: X\nstatus: ativo\n---\n/, "frontmatter mudou de EOL");
});

test("editarCampo mantém LF em arquivo unix", () => {
  const saida = editarCampo(NOTA, "prazo", "5d");
  assert.equal(saida.includes("\r\n"), false, "introduziu CRLF em arquivo LF");
});

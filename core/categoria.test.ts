import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCategoria, camposPadrao, validarCampos, idDeTitulo } from "./categoria.ts";

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

test("parseCategoria lê forma_por, formas e arestas", () => {
  const c = parseCategoria(`${YAML_CAT}
forma_por: tipo
formas:
  decisao: losango
arestas:
  excecao: { estilo: tracejada, ponta: aberta, cor: "#dc2626" }
`);
  assert.equal(c.forma_por, "tipo");
  assert.equal(c.formas!.decisao, "losango");
  assert.deepEqual(c.arestas!.excecao, {
    estilo: "tracejada",
    ponta: "aberta",
    cor: "#dc2626",
  });
});

test("parseCategoria de categoria antiga não inventa formas nem arestas", () => {
  // Compatibilidade: as 3 chaves são opcionais e o canvas cai no padrão sem elas.
  const c = parseCategoria(YAML_CAT);
  assert.equal(c.forma_por, undefined);
  assert.equal(c.formas, undefined);
  assert.equal(c.arestas, undefined);
});

test("camposPadrao preenche enum com a primeira opção e texto vazio", () => {
  const campos = camposPadrao(parseCategoria(YAML_CAT));
  assert.equal(campos.responsavel, "");
  assert.equal(campos.status, "rascunho");
});

test("validarCampos acusa obrigatório vazio", () => {
  const cat = parseCategoria(YAML_CAT);
  assert.match(validarCampos(cat, { responsavel: "", status: "rascunho" }) ?? "", /responsavel/);
  assert.equal(validarCampos(cat, { responsavel: "rh", status: "rascunho" }), undefined);
});

test("validarCampos acusa valor de enum fora das opções", () => {
  const cat = parseCategoria(YAML_CAT);
  assert.match(
    validarCampos(cat, { responsavel: "rh", status: "arquivado" }) ?? "",
    /status/,
  );
});

test("idDeTitulo faz slug sem acento", () => {
  assert.equal(idDeTitulo("Aprovação do gestor"), "aprovacao-do-gestor");
  assert.equal(idDeTitulo("  !!  "), "no");
});

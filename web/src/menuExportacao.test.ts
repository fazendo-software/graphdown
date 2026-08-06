import assert from "node:assert/strict";
import test from "node:test";
import { mensagemErroExportacao, nomeArquivoExportacao, resumoContagens, textoDoRecorte } from "./menuExportacao.ts";

test("nome do download é sanitizado e identifica recorte e extensão", () => {
  assert.equal(
    nomeArquivoExportacao("Reunião: API/IA", "selecao-area", "md-rfc", new Date(2026, 7, 6, 9, 5)),
    "reuniao-api-ia-recorte-20260806-0905.md",
  );
});

test("recorte alternativo comunica seleção ou viewport sem ambiguidade", () => {
  assert.equal(textoDoRecorte("selecao-area", true), "seleção atual");
  assert.equal(textoDoRecorte("selecao-area", false), "área atualmente visível");
});

test("resumo usa plural correto e erro de rede não vaza texto técnico", () => {
  assert.equal(resumoContagens({ nos: 1, notas: 0, arestas: 2 }), "1 objeto, 0 notas e 2 relações");
  assert.match(mensagemErroExportacao(new TypeError("Failed to fetch")), /Verifique sua conexão/);
  assert.doesNotMatch(mensagemErroExportacao(new TypeError("Failed to fetch")), /Failed to fetch/);
});

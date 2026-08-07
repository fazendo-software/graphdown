import { createRoot } from "react-dom/client";
import { useState } from "react";
import type { ExportacaoSnapshot } from "../../core/tipos.ts";
import { MenuExportar, type CapturaExportacao } from "./MenuExportar.tsx";

const snapshot: ExportacaoSnapshot = {
  versao: 1,
  exportadoEm: "2026-08-06T12:00:00.000Z",
  projeto: { id: "smoke", titulo: "Reunião exportável" },
  categorias: [], camposAresta: [], estilosAresta: {}, fantasmas: [],
  notas: [{ id: "nota", conteudo: "registro", x: 10, y: 20 }],
  objetosSeta: [],
  arestas: [
    { id: "interna", de: "decisao", para: "decisao", campos: {} },
    { id: "externa", de: "decisao", para: "alternativa", campos: {} },
  ],
  nos: [
    { id: "decisao", titulo: "Decisão", categoria_id: "", campos: {}, corpo: "evidência", versao: 1, execucao: { tarefa: false, estado: null }, posicao: { x: 12, y: 15 } },
    { id: "alternativa", titulo: "Alternativa", categoria_id: "", campos: {}, corpo: "fora", versao: 1, execucao: { tarefa: false, estado: null }, posicao: { x: 300, y: 15 } },
  ],
};

const capturaProjeto: CapturaExportacao = {
  recorte: { tipo: "projeto" }, dimensoesLocais: { decisao: { largura: 180, altura: 100 }, alternativa: { largura: 180, altura: 100 }, nota: { largura: 176, altura: 64 } },
  haConteudo: true, haSelecao: true, contagens: { nos: 2, notas: 1, setas: 0, arestas: 2 },
};
const capturaSelecao: CapturaExportacao = {
  recorte: { tipo: "selecao", nos: ["decisao"], notas: [], setas: [], area: { x: 0, y: 0, largura: 200, altura: 200 } },
  dimensoesLocais: { decisao: { largura: 180, altura: 100 } }, haConteudo: true, haSelecao: true, contagens: { nos: 1, notas: 0, setas: 0, arestas: 1 },
};

function esperarPintura() {
  return new Promise<void>((resolver) => requestAnimationFrame(() => requestAnimationFrame(() => resolver())));
}

function afirmar(condicao: unknown, mensagem: string): asserts condicao {
  if (!condicao) throw new Error(mensagem);
}

let falharProxima = false;
let tentativas = 0;
function Shell({ baixar }: { baixar: (arquivo: Blob, nome: string) => void }) {
  const [aberto, setAberto] = useState(false);
  return <MenuExportar
    aberto={aberto}
    aoMudarAberto={setAberto}
    capturar={(escopo) => escopo === "projeto" ? capturaProjeto : capturaSelecao}
    haSelecaoAtual
    carregarSnapshot={async () => {
      tentativas++;
      if (falharProxima) {
        falharProxima = false;
        throw new TypeError("Failed to fetch");
      }
      return snapshot;
    }}
    tema="claro"
    baixar={baixar}
  />;
}

async function executar() {
  const downloads: Array<{ arquivo: Blob; nome: string }> = [];
  createRoot(document.getElementById("raiz")!).render(<Shell baixar={(arquivo, nome) => downloads.push({ arquivo, nome })} />);
  await esperarPintura();
  const alvo = document.querySelector<HTMLButtonElement>(".menu-exportar > button");
  afirmar(alvo, "O botão Exportar não foi renderizado.");
  alvo.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  await esperarPintura();
  afirmar(Boolean(document.querySelector('[role="menu"]')), "Hover não abriu o menu.");
  // O clique após o hover muda para estado fixado: o mouse pode sair sem fechar.
  alvo.click();
  await esperarPintura();
  alvo.parentElement?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
  await esperarPintura();
  afirmar(Boolean(document.querySelector('[role="menu"]')), "Clique após hover deveria manter o menu fixado.");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await esperarPintura();
  afirmar(!document.querySelector('[role="menu"]'), "Escape deveria fechar o menu fixado.");

  alvo.click();
  await esperarPintura();
  const projeto = [...document.querySelectorAll<HTMLButtonElement>(".opcao-exportar")].find((botao) => botao.textContent?.includes("projeto inteiro"));
  afirmar(projeto, "O escopo de projeto inteiro não apareceu.");
  projeto.click();
  await esperarPintura();
  afirmar(document.querySelector(".menu-exportar-intro")?.textContent?.includes("2 objetos, 1 nota e 2 relações"), "Resumo do projeto não mostrou contagens corretas.");
  const markdown = [...document.querySelectorAll<HTMLButtonElement>(".opcao-exportar")].find((botao) => botao.textContent?.trim().startsWith("Markdown"));
  afirmar(markdown, "O formato Markdown não apareceu após escolher o recorte.");
  markdown.click();
  markdown.click();
  await esperarPintura();
  afirmar(downloads.length === 1, "Um clique repetido não pode criar dois downloads.");
  afirmar(downloads[0].nome.endsWith(".md"), "O download Markdown deveria terminar em .md.");
  afirmar((await downloads[0].arquivo.text()).includes("# Exportação do Graphdown"), "O download não contém o Markdown estruturado.");

  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await esperarPintura();
  afirmar(!document.querySelector('[role="menu"]'), "Escape deveria fechar o menu.");

  // Rejeição de rede mostra orientação e o retry reaproveita o pedido capturado.
  falharProxima = true;
  alvo.click();
  await esperarPintura();
  [...document.querySelectorAll<HTMLButtonElement>(".opcao-exportar")].find((botao) => botao.textContent?.includes("projeto inteiro"))?.click();
  await esperarPintura();
  [...document.querySelectorAll<HTMLButtonElement>(".opcao-exportar")].find((botao) => botao.textContent?.trim().startsWith("Markdown"))?.click();
  await esperarPintura();
  const erro = document.querySelector(".estado-exportar")?.textContent ?? "";
  afirmar(erro.includes("Verifique sua conexão") && !erro.includes("Failed to fetch"), "Erro de rede deveria ser explicado sem texto técnico.");
  const retry = [...document.querySelectorAll<HTMLButtonElement>(".estado-exportar button")].find((botao) => botao.textContent?.includes("tentar novamente"));
  afirmar(retry, "Erro recuperável deveria oferecer retry.");
  retry.click();
  await esperarPintura();
  afirmar(Number(downloads.length) === 2 && tentativas >= 3, "Retry não reaproveitou o pedido após a falha de rede.");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await esperarPintura();

  // Seleção é capturada no clique: alterar o objeto original depois não troca o Markdown.
  alvo.click();
  await esperarPintura();
  [...document.querySelectorAll<HTMLButtonElement>(".opcao-exportar")].find((botao) => botao.textContent?.includes("seleção ou área"))?.click();
  await esperarPintura();
  afirmar(document.querySelector(".menu-exportar-intro")?.textContent?.includes("1 objeto, 0 notas e 1 relação"), "Resumo da seleção não aplicou relações internas.");
  [...document.querySelectorAll<HTMLButtonElement>(".opcao-exportar")].find((botao) => botao.textContent?.trim().startsWith("Markdown"))?.click();
  capturaSelecao.recorte = { tipo: "selecao", nos: ["alternativa"], notas: [], setas: [], area: { x: 0, y: 0, largura: 1, altura: 1 } };
  await esperarPintura();
  const congelado = await downloads[2].arquivo.text();
  afirmar(congelado.includes("### Nó `decisao`") && !congelado.includes("### Nó `alternativa`"), "A exportação não manteve o escopo capturado no clique.");
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await esperarPintura();
  return { downloads: downloads.length, tentativas, nome: downloads[0].nome };
}

const janela = window as Window & { smokeMenuExportar?: Promise<unknown> };
janela.smokeMenuExportar = executar();

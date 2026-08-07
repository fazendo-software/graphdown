import { chromium } from "playwright-core";
import { createServer } from "vite";

const vite = await createServer({
  configFile: "web/vite.config.ts",
  server: { host: "127.0.0.1", port: 0, strictPort: true },
});

try {
  await vite.listen();
  const endereco = vite.httpServer?.address();
  if (!endereco || typeof endereco === "string") throw new Error("O smoke não conseguiu reservar uma porta Vite.");
  const url = `http://127.0.0.1:${endereco.port}/smoke-exportacao.html`;
  const browser = await chromium.launch({ executablePath: process.env.GOOGLE_CHROME_BIN || "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const resultado = await page.evaluate(async () => {
      const janela = window as Window & { smokeExportacao?: Promise<unknown> };
      return janela.smokeExportacao;
    });
    if (!resultado) throw new Error("A página smoke não devolveu resultado.");
    console.log(`Smoke de exportação passou: ${JSON.stringify(resultado)}`);
    await page.goto(`http://127.0.0.1:${endereco.port}/smoke-menu-exportar.html`, { waitUntil: "networkidle" });
    const menu = await page.evaluate(async () => {
      const janela = window as Window & { smokeMenuExportar?: Promise<unknown> };
      return janela.smokeMenuExportar;
    });
    if (!menu) throw new Error("O smoke do menu não devolveu resultado.");
    console.log(`Smoke do menu Exportar passou: ${JSON.stringify(menu)}`);
    const alvo = page.locator(".menu-exportar > button");
    await alvo.focus();
    await page.keyboard.press("Enter");
    if (await alvo.getAttribute("aria-expanded") !== "true") throw new Error("Enter no botão Exportar não abriu o menu.");
    await page.keyboard.press("Escape");
    await alvo.focus();
    await page.keyboard.press("Space");
    if (await alvo.getAttribute("aria-expanded") !== "true") throw new Error("Espaço no botão Exportar não abriu o menu.");
    await page.keyboard.press("Escape");
    console.log("Smoke do menu Exportar confirmou foco, Enter e Espaço.");

    await page.goto(`http://127.0.0.1:${endereco.port}/smoke-modal.html`, { waitUntil: "networkidle" });
    await page.locator("#no-titulo").fill("Nome concluído");
    await page.locator("#campo-contexto").fill("depois");
    // Execução: o seletor de estado só existe depois de marcar "é tarefa".
    if (await page.locator("#no-estado").count() !== 0) throw new Error("Objeto informativo não deveria ter seletor de estado.");
    await page.locator("#no-tarefa").check();
    if (await page.locator("#no-estado").inputValue() !== "pendente") {
      throw new Error("Marcar tarefa sem estado deveria começar em pendente.");
    }
    await page.locator("#no-estado").selectOption("em_andamento");
    // Desmarcar e remarcar: o seletor some e o estado escolhido continua de pé.
    await page.locator("#no-tarefa").uncheck();
    if (await page.locator("#no-estado").count() !== 0) throw new Error("Desmarcar tarefa deveria esconder o estado.");
    await page.locator("#no-tarefa").check();
    await page.locator("#no-estado").selectOption("concluido");
    await page.locator(".detalhe").dblclick();
    await page.locator("textarea").fill("Detalhe concluído");
    const antes = await page.evaluate(() => (window as Window & { smokeModal: { patch: unknown[]; corpo: unknown[] } }).smokeModal);
    if (antes.patch.length || antes.corpo.length) throw new Error("O modal salvou antes de Concluir.");
    await page.getByRole("button", { name: "concluir" }).click();
    await page.waitForFunction(() => (window as Window & { smokeModal: { fechou: number } }).smokeModal.fechou === 1);
    const modal = await page.evaluate(() => (window as Window & { smokeModal: { patch: Array<{ campos?: Record<string, unknown>; titulo?: string; execucao?: { tarefa: boolean; estado: string | null } }>; corpo: string[]; fechou: number } }).smokeModal);
    if (modal.patch.length !== 1 || modal.patch[0].titulo !== "Nome concluído" || modal.patch[0].campos?.contexto !== "depois") {
      throw new Error("Concluir não salvou nome e campos do objeto.");
    }
    // Um PATCH só: nome, campos e execução viajam juntos, como o servidor grava.
    if (modal.patch[0].execucao?.tarefa !== true || modal.patch[0].execucao?.estado !== "concluido") {
      throw new Error("Concluir não salvou a execução junto do resto.");
    }
    if (modal.corpo[0] !== "Detalhe concluído\n") throw new Error("Concluir não salvou o detalhe do objeto.");
    console.log("Smoke do modal confirmou salvamento total ao concluir, com execução.");

    await page.goto(`http://127.0.0.1:${endereco.port}/smoke-modal.html?papel=leitor`, { waitUntil: "networkidle" });
    if (!(await page.locator("#no-tarefa").isDisabled())) throw new Error("Leitor não pode alterar 'é tarefa'.");
    if (!(await page.locator("#no-titulo").isDisabled())) throw new Error("Leitor não pode alterar o nome.");
    await page.getByRole("button", { name: "concluir" }).click();
    await page.waitForFunction(() => (window as Window & { smokeModal: { fechou: number } }).smokeModal.fechou === 1);
    const leitor = await page.evaluate(() => (window as Window & { smokeModal: { patch: unknown[] } }).smokeModal);
    if (leitor.patch.length !== 0) throw new Error("Leitor não pode gravar ao fechar o modal.");
    console.log("Smoke do modal confirmou que o leitor vê a execução sem poder alterá-la.");

    await page.goto(`http://127.0.0.1:${endereco.port}/smoke-progresso.html`, { waitUntil: "networkidle" });
    const fluxo = page.locator(".aresta-fluxo").first();
    // `attached`, não `visible`: um traço horizontal tem caixa de altura zero e o
    // Playwright chamaria de escondido um path que está desenhado na tela.
    await fluxo.waitFor({ state: "attached" });
    const corNeutra = await fluxo.evaluate((el) => getComputedStyle(el).stroke);
    if (await page.locator("#resumo-global").innerText() !== "0/1 · 0%") throw new Error("Resumo inicial errado.");
    if (await page.locator(".selo-execucao").innerText() !== "○ pendente") throw new Error("Selo do nó-tarefa não apareceu.");

    // O `no-mudou` que chegaria de outro cliente: sem reload e sem requisição nova.
    await page.evaluate(() => (window as Window & { smokeProgresso: { concluir: () => void } }).smokeProgresso.concluir());
    await page.waitForFunction(() => document.querySelector("#resumo-global")?.textContent === "1/1 · 100%");
    const corConcluida = await fluxo.evaluate((el) => getComputedStyle(el).stroke);
    if (corConcluida === corNeutra) throw new Error("A camada de fluxo não mudou de cor com a tarefa concluída.");
    if (corConcluida !== "rgb(22, 163, 74)") throw new Error(`Fluxo de tarefa concluída deveria ser verde, veio ${corConcluida}.`);
    if (await page.locator(".selo-execucao").innerText() !== "● concluído") throw new Error("O selo do nó não acompanhou o estado.");
    console.log("Smoke de progresso confirmou recálculo e cor de fluxo a partir de no-mudou, sem recarregar.");
  } finally {
    await browser.close();
  }
} finally {
  await vite.close();
}

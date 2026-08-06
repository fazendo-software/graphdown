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
  } finally {
    await browser.close();
  }
} finally {
  await vite.close();
}

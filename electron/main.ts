import { app, BrowserWindow, dialog } from "electron";
import type { Server } from "node:http";

let janela: BrowserWindow | undefined;
let servidor: Server | undefined;
let endereco: string | undefined;

function abrirJanela(): void {
  janela = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  janela.setMenuBarVisibility(false);
  void janela.loadURL(endereco!);
  janela.on("closed", () => { janela = undefined; });
}

async function iniciar(): Promise<void> {
  const escolha = await dialog.showOpenDialog({
    title: "Abra uma pasta de grafo",
    properties: ["openDirectory"],
  });
  if (escolha.canceled || !escolha.filePaths[0]) return app.quit();

  // O servidor reaproveitado só lê recursos empacotados a partir desta raiz.
  process.env.GRAPYDOWN_APP_ROOT = app.getAppPath();
  const [{ criarServidor }, { observar }] = await Promise.all([
    import("../servidor/rotas.ts"),
    import("../servidor/watcher.ts"),
  ]);
  observar(escolha.filePaths[0]);
  servidor = criarServidor(escolha.filePaths[0]);
  await new Promise<void>((ok, erro) => {
    servidor!.once("error", erro);
    servidor!.listen(0, "127.0.0.1", () => {
      servidor!.off("error", erro);
      ok();
    });
  });
  const porta = (servidor.address() as { port: number }).port;
  endereco = `http://127.0.0.1:${porta}`;
  abrirJanela();
}

app.whenReady().then(iniciar);
app.on("activate", () => {
  if (!janela && endereco) abrirJanela();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
app.on("before-quit", () => servidor?.close());

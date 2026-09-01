import { app, BrowserWindow } from "electron";
import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Server } from "node:http";

let janela: BrowserWindow | undefined;
let servidor: Server | undefined;
let encerrarBanco: (() => Promise<void>) | undefined;
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

async function segredo(): Promise<string> {
  const arquivo = join(app.getPath("userData"), "cookie-secret");
  try {
    return await readFile(arquivo, "utf8");
  } catch {
    const valor = randomBytes(32).toString("hex");
    await writeFile(arquivo, valor, { mode: 0o600 });
    return valor;
  }
}

async function iniciar(): Promise<void> {
  process.env.GRAPYDOWN_APP_ROOT = app.getAppPath();
  process.env.GRAPYDOWN_DATABASE = join(app.getPath("userData"), "grapydown.sqlite");
  process.env.COOKIE_SECRET = await segredo();

  const [{ migrar }, { semear }, { criarPool }, { criarServidor }, { SalaProjetos }] = await Promise.all([
    import("../migracoes/runner.ts"),
    import("../migracoes/seed.ts"),
    import("../servidor/db.ts"),
    import("../servidor/rotas.ts"),
    import("../servidor/ws.ts"),
  ]);
  const pool = criarPool();
  await migrar(pool);
  await semear(pool);
  const sala = new SalaProjetos(pool);
  servidor = criarServidor(pool, sala);
  sala.anexar(servidor);
  await new Promise<void>((ok, erro) => {
    servidor!.once("error", erro);
    servidor!.listen(0, "127.0.0.1", () => {
      servidor!.off("error", erro);
      ok();
    });
  });
  const porta = (servidor.address() as { port: number }).port;
  endereco = `http://127.0.0.1:${porta}`;
  encerrarBanco = () => pool.end();
  abrirJanela();
}

app.whenReady().then(iniciar);
app.on("activate", () => { if (!janela && endereco) abrirJanela(); });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("before-quit", () => {
  servidor?.close();
  void encerrarBanco?.();
});
